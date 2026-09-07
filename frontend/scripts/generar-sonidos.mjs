// Genera los WAV del temporizador en assets/sonidos/.
//
//   node scripts/generar-sonidos.mjs
//
// Los sonidos se generan en vez de bajarse para que sean versionables, no
// tengan licencia de por medio y se puedan retocar cambiando un numero de
// aca. Son WAV PCM y no MP3 porque no hay que codificar nada: 16 bits mono a
// 44.1 kHz, que es lo que reproducen AVFoundation y ExoPlayer sin pensar.
//
// La salida es deterministica: correrlo dos veces da archivos identicos. Si
// algun dia queres sonidos propios, reemplaza los archivos y listo, nadie mas
// depende de este script.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const SALIDA = join(AQUI, '..', 'assets', 'sonidos');

const TASA = 44100;
const AMPLITUD = 0.85;

// Rampa de entrada y salida de cada pulso. Sin esto, la onda arranca y corta
// en seco y el parlante mete un chasquido que se escucha mas que el tono.
const RAMPA_SEG = 0.008;

/**
 * Un tono con cuerpo, no un seno pelado.
 *
 * El parlante de un telefono no reproduce graves: un seno puro a 440 Hz sale
 * flaco y en un gimnasio no se escucha. Sumarle el segundo y el tercer
 * armonico le da el timbre de un pitido de reloj, que atraviesa el ruido.
 */
function muestra(t, hz) {
  const w = 2 * Math.PI * hz * t;
  const cruda = Math.sin(w) + 0.35 * Math.sin(2 * w) + 0.2 * Math.sin(3 * w);
  return cruda / 1.55; // normaliza al pico teorico de la suma
}

/** Un pulso de `segundos` a `hz`, con las rampas ya aplicadas. */
function pulso(hz, segundos) {
  const total = Math.round(segundos * TASA);
  const rampa = Math.min(Math.round(RAMPA_SEG * TASA), Math.floor(total / 2));
  const datos = new Float32Array(total);

  for (let i = 0; i < total; i++) {
    let ganancia = 1;
    if (i < rampa) ganancia = i / rampa;
    else if (i >= total - rampa) ganancia = (total - 1 - i) / rampa;
    datos[i] = muestra(i / TASA, hz) * ganancia;
  }
  return datos;
}

function silencio(segundos) {
  return new Float32Array(Math.round(segundos * TASA));
}

function unir(partes) {
  const total = partes.reduce((n, p) => n + p.length, 0);
  const salida = new Float32Array(total);
  let cursor = 0;
  for (const p of partes) {
    salida.set(p, cursor);
    cursor += p.length;
  }
  return salida;
}

/** Float32 [-1, 1] a un WAV PCM de 16 bits mono. */
function aWav(muestras) {
  const bytesDatos = muestras.length * 2;
  const buffer = Buffer.alloc(44 + bytesDatos);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + bytesDatos, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); // tamano del bloque fmt
  buffer.writeUInt16LE(1, 20); // 1 = PCM sin comprimir
  buffer.writeUInt16LE(1, 22); // mono
  buffer.writeUInt32LE(TASA, 24);
  buffer.writeUInt32LE(TASA * 2, 28); // bytes por segundo
  buffer.writeUInt16LE(2, 32); // bytes por bloque
  buffer.writeUInt16LE(16, 34); // bits por muestra
  buffer.write('data', 36);
  buffer.writeUInt32LE(bytesDatos, 40);

  for (let i = 0; i < muestras.length; i++) {
    const v = Math.max(-1, Math.min(1, muestras[i] * AMPLITUD));
    // 32767 y no 32768: el positivo del rango de 16 bits llega hasta ahi.
    buffer.writeInt16LE(Math.round(v * 32767), 44 + i * 2);
  }
  return buffer;
}

// ---------------------------------------------------------------------------
// Los cuatro sonidos
//
// Trabajo y descanso son distintos a proposito, y no el mismo pitido dos
// veces: agudo y doble para entrar al esfuerzo, grave y simple para aflojar.
// Con un unico sonido habria que mirar la pantalla para saber cual de las dos
// cosas acaba de pasar, que es justo lo que el temporizador tiene que evitar.
// ---------------------------------------------------------------------------

const sonidos = {
  'trabajo.wav': unir([pulso(880, 0.11), silencio(0.06), pulso(880, 0.11)]),
  'descanso.wav': unir([pulso(440, 0.22)]),
  'fin.wav': unir([
    pulso(880, 0.16),
    silencio(0.05),
    pulso(660, 0.16),
    silencio(0.05),
    pulso(440, 0.34),
  ]),
};

mkdirSync(SALIDA, { recursive: true });

for (const [nombre, muestras] of Object.entries(sonidos)) {
  const wav = aWav(muestras);
  writeFileSync(join(SALIDA, nombre), wav);
  const seg = (muestras.length / TASA).toFixed(2);
  console.log(`${nombre.padEnd(14)} ${seg}s  ${(wav.length / 1024).toFixed(1)} KB`);
}

console.log(`\nEscritos en ${SALIDA}`);
