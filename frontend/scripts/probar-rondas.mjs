// Pruebas de superseries y circuitos: las operaciones del editor en
// src/lib/superseries.ts y el orden de las rondas al entrenar.
//
//   node scripts/probar-rondas.mjs

import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, '..');

// --- compilar a CommonJS en un temporal ------------------------------------

const tmp = mkdtempSync(join(tmpdir(), 'probar-rondas-'));
const build = join(tmp, 'build');

const tsconfig = join(tmp, 'tsconfig.json');
writeFileSync(
  tsconfig,
  JSON.stringify({
    compilerOptions: {
      target: 'ES2022',
      module: 'commonjs',
      moduleResolution: 'node',
      ignoreDeprecations: '6.0',
      esModuleInterop: true,
      skipLibCheck: true,
      strict: true,
      outDir: build,
      rootDir: join(RAIZ, 'src'),
      types: [],
      baseUrl: RAIZ,
      paths: { '@/*': ['src/*'] },
    },
    include: [
      join(RAIZ, 'src/lib/superseries.ts'),
      join(RAIZ, 'src/features/entrenamiento/rondas.ts'),
      join(RAIZ, 'src/lib/duracion.ts'),
    ],
  }),
);

try {
  execFileSync('npx', ['tsc', '-p', tsconfig], { cwd: RAIZ, stdio: 'pipe' });
} catch (e) {
  console.error('tsc fallo al compilar:\n' + (e.stdout?.toString() ?? e.message));
  process.exit(1);
}

const req = createRequire(join(build, 'x.cjs'));
const S = req('./lib/superseries.js');
const R = req('./features/entrenamiento/rondas.js');

process.on('exit', () => {
  try {
    rmSync(tmp, { recursive: true, force: true });
  } catch {}
});

// --- corredor --------------------------------------------------------------

let ok = 0;
const fallos = [];

function prueba(nombre, fn) {
  try {
    fn();
    ok++;
    console.log('  +', nombre);
  } catch (e) {
    fallos.push(`${nombre}: ${e.message}`);
    console.log('  -', nombre);
  }
}

function igual(actual, esperado, que) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(esperado);
  if (a !== b) throw new Error(`${que}: esperaba ${b}, dio ${a}`);
}

// Las unidades como texto: "A" suelto, "[B C]" grupo.
const ver = (unidades) =>
  unidades.map((u) => (u.tipo === 'suelto' ? u.item : `[${u.items.join(' ')}]`)).join(' ');
const sueltos = (...ids) => ids.map((item) => ({ tipo: 'suelto', item }));

// ---------------------------------------------------------------------------
// Editor: unir, separar, mover, quitar
// ---------------------------------------------------------------------------

console.log('\nsuperseries en el editor:');

prueba('unir dos sueltos da una superserie, y un tercero un circuito', () => {
  let u = sueltos('A', 'B', 'C', 'D');
  u = S.unirConSiguiente(u, 0);
  igual(ver(u), '[A B] C D', 'superserie');
  igual(S.etiquetaGrupo(2), 'Superserie', 'etiqueta 2');
  u = S.unirConSiguiente(u, 0);
  igual(ver(u), '[A B C] D', 'circuito');
  igual(S.etiquetaGrupo(3), 'Circuito', 'etiqueta 3');
});

prueba('unir dos grupos los funde; unir el ultimo no hace nada', () => {
  let u = S.unirConSiguiente(S.unirConSiguiente(sueltos('A', 'B', 'C', 'D'), 0), 1);
  igual(ver(u), '[A B] [C D]', 'dos superseries');
  igual(ver(S.unirConSiguiente(u, 0)), '[A B C D]', 'fundidas');
  igual(ver(S.unirConSiguiente(u, 1)), '[A B] [C D]', 'ultimo sin siguiente');
});

prueba('separar deshace el grupo entero, en el mismo orden', () => {
  const u = S.unirConSiguiente(S.unirConSiguiente(sueltos('A', 'B', 'C', 'D'), 1), 1);
  igual(ver(u), 'A [B C D]', 'circuito');
  igual(ver(S.separar(u, 1)), 'A B C D', 'separado');
  igual(ver(S.separar(u, 0)), 'A [B C D]', 'separar un suelto no hace nada');
});

prueba('mover lleva el grupo completo; dentro del grupo reordena sin sacarlo', () => {
  const u = S.unirConSiguiente(sueltos('A', 'B', 'C'), 1);
  igual(ver(S.moverUnidad(u, 1, 'arriba')), '[B C] A', 'grupo arriba');
  igual(ver(S.moverUnidad(u, 0, 'arriba')), 'A [B C]', 'el primero no sube');
  igual(ver(S.moverDentroDeGrupo(u, 1, 0, 'abajo')), 'A [C B]', 'dentro del grupo');
  igual(ver(S.moverDentroDeGrupo(u, 1, 1, 'abajo')), 'A [B C]', 'el ultimo del grupo no baja');
});

prueba('quitar de una superserie deja suelto al que queda', () => {
  const u = S.unirConSiguiente(sueltos('A', 'B', 'C'), 0);
  igual(ver(S.quitarDeUnidad(u, 0, 1)), 'A C', 'superserie de uno pasa a suelto');
  const c = S.unirConSiguiente(u, 0);
  igual(ver(S.quitarDeUnidad(c, 0, 0)), '[B C]', 'circuito de tres queda superserie');
  igual(ver(S.quitarDeUnidad(u, 1, 0)), '[A B]', 'quitar un suelto');
});

prueba('ida y vuelta con la base: filas con grupo, unidades y datos', () => {
  const filas = [
    { id: 'A', g: null }, { id: 'B', g: 1 }, { id: 'C', g: 1 },
    { id: 'D', g: 2 }, { id: 'E', g: 2 }, { id: 'F', g: 2 }, { id: 'G', g: null },
  ];
  const u = S.unidadesDesdeFilas(filas, (f) => f.g);
  igual(S.aDatos(u, (f) => f.id), ['A', ['B', 'C'], ['D', 'E', 'F'], 'G'], 'datos');
  igual(S.aplanar(u).map((f) => f.id).join(''), 'ABCDEFG', 'aplanar');
  // Un grupo de uno en la base (dato viejo o a mano) se lee suelto
  igual(S.aDatos(S.unidadesDesdeFilas([{ id: 'A', g: 5 }], (f) => f.g), (f) => f.id), ['A'], 'grupo de uno');
});

// ---------------------------------------------------------------------------
// Rondas al entrenar
// ---------------------------------------------------------------------------

console.log('\nrondas al entrenar:');

// Arma la lista: { A: 3 } es un ejercicio A con 3 series A1..A3. unidad
// agrupa; las series confirmadas se pasan por id.
function sesion(unidades, confirmadas = []) {
  const lista = [];
  for (const [unidad, ejercicios] of unidades) {
    for (const [clave, n] of Object.entries(ejercicios)) {
      lista.push({
        clave,
        unidad,
        series: Array.from({ length: n }, (_, i) => ({
          id: `${clave}${i + 1}`,
          confirmada: confirmadas.includes(`${clave}${i + 1}`),
        })),
      });
    }
  }
  return lista;
}

/** Confirma desde `inicio` siguiendo el foco hasta el final y devuelve el recorrido. */
function recorrido(unidades, inicio, confirmadas = []) {
  const hechas = [...confirmadas];
  const pasos = [inicio];
  let actual = { clave: inicio.replace(/\d+$/, ''), serieId: inicio };
  for (let guarda = 0; guarda < 50; guarda++) {
    const sig = R.siguienteFoco(sesion(unidades, hechas), actual.clave, actual.serieId);
    hechas.push(actual.serieId);
    if (!sig) break;
    pasos.push(sig.serieId);
    actual = sig;
  }
  return pasos.join(' ');
}

prueba('superserie de dos ejercicios iguales: A1 B1 A2 B2 A3 B3', () => {
  igual(recorrido([['g1', { A: 3, B: 3 }]], 'A1'), 'A1 B1 A2 B2 A3 B3', 'ronda');
});

prueba('circuito de tres: A1 B1 C1 A2 B2 C2', () => {
  igual(recorrido([['g1', { A: 2, B: 2, C: 2 }]], 'A1'), 'A1 B1 C1 A2 B2 C2', 'circuito');
});

prueba('cantidades distintas: el que termina antes se saltea', () => {
  igual(recorrido([['g1', { A: 4, B: 2 }]], 'A1'), 'A1 B1 A2 B2 A3 A4', 'A tiene mas');
  igual(recorrido([['g1', { A: 1, B: 3, C: 2 }]], 'A1'), 'A1 B1 C1 B2 C2 B3', 'tres desparejos');
});

prueba('una serie cargada fuera de orden: al volver al ejercicio va a la primera pendiente', () => {
  // Ya estan A1 y B1; el usuario toca A3 y la confirma salteando A2
  const lista = sesion([['g1', { A: 3, B: 3 }]], ['A1', 'B1']);
  igual(R.siguienteFoco(lista, 'A', 'A3'), { clave: 'B', serieId: 'B2' }, 'despues de A3 va a B');
  const despues = sesion([['g1', { A: 3, B: 3 }]], ['A1', 'B1', 'A3']);
  igual(R.siguienteFoco(despues, 'B', 'B2'), { clave: 'A', serieId: 'A2' }, 'y despues de B2 vuelve a A2');
});

prueba('terminado el grupo pasa a la siguiente unidad, y al final da la vuelta', () => {
  const unidades = [['s0', { X: 1 }], ['g1', { A: 2, B: 2 }], ['s2', { Y: 2 }]];
  igual(recorrido(unidades, 'A1'), 'A1 B1 A2 B2 Y1 Y2 X1', 'grupo, suelto y vuelta');
});

prueba('un suelto se comporta como antes: su serie siguiente, despues el proximo ejercicio', () => {
  const unidades = [['s0', { A: 3 }], ['s1', { B: 2 }]];
  igual(recorrido(unidades, 'A1'), 'A1 A2 A3 B1 B2', 'sueltos');
  igual(R.siguienteFoco(sesion(unidades, ['A1', 'A2', 'A3', 'B1']), 'B', 'B2'), null, 'nada pendiente');
});

// ---------------------------------------------------------------------------
// Cabecera de un ejercicio cerrado
// ---------------------------------------------------------------------------

console.log('\ncabecera de un ejercicio cerrado:');

prueba('el que toca: al entrar el primero con pendientes, despues el del ultimo foco', () => {
  const unidades = [['s0', { X: 1 }], ['g1', { A: 2, B: 2 }]];
  igual(R.ejercicioQueToca(sesion(unidades), null), 'X', 'al entrar');
  igual(R.ejercicioQueToca(sesion(unidades, ['X1']), null), 'A', 'el primero ya hecho');
  igual(R.ejercicioQueToca(sesion(unidades, ['A1']), 'B'), 'B', 'el del ultimo foco aunque haya otro antes');
  igual(R.ejercicioQueToca(sesion(unidades, ['B1', 'B2']), 'B'), 'X', 'el foco termino: el primero con pendientes');
  igual(R.ejercicioQueToca(sesion(unidades, ['X1', 'A1', 'A2', 'B1', 'B2']), 'B'), null, 'todo hecho');
  igual(R.ejercicioQueToca(sesion(unidades), 'no-existe'), 'X', 'foco de un ejercicio quitado');
});

prueba('avance y ultima serie hecha', () => {
  const s = (confirmada, repeticiones, pesoKg = null, duracionSeg = null) => ({ confirmada, repeticiones, pesoKg, duracionSeg });
  igual(R.textoAvance([s(true, 8), s(false, 8), s(false, 8), s(false, 8)]), '1 de 4 series', 'avance');
  igual(R.textoAvance([s(false, 8)]), '0 de 1 serie', 'singular');
  igual(R.textoUltimaHecha([s(true, 8, 80), s(true, 6, 85), s(false, 6, 85)], false), '85 × 6', 'con peso: la ultima hecha');
  igual(R.textoUltimaHecha([s(true, 12, null)], false), 'Corp × 12', 'corporal');
  igual(R.textoUltimaHecha([s(true, 10, null, 60), s(false, 10, null, 45)], true), '1:00', 'por tiempo');
  igual(R.textoUltimaHecha([s(false, 8, 80)], false), null, 'ninguna hecha');
  // Una hecha fuera de orden: cuenta la de mas abajo, no la ultima tocada
  igual(R.textoUltimaHecha([s(false, 8, 80), s(true, 6, 90), s(false, 8, 80)], false), '90 × 6', 'fuera de orden');
});

// --- resumen final ---------------------------------------------------------

console.log(`\n${ok} pasan, ${fallos.length} fallan\n`);

if (fallos.length > 0) {
  for (const f of fallos) console.error('  FALLO:', f);
  process.exit(1);
}
