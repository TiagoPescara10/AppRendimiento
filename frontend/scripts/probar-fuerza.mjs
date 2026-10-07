// Pruebas de las funciones puras de Fuerza y Progresion en src/lib/fuerza.ts,
// y del tiempo de las series por tiempo en src/lib/duracion.ts
//
//   node scripts/probar-fuerza.mjs

process.env.TZ = 'America/Argentina/Buenos_Aires';

import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, '..');

// --- compilar a CommonJS en un temporal ------------------------------------

const tmp = mkdtempSync(join(tmpdir(), 'probar-fuerza-'));
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
      join(RAIZ, 'src/lib/fechas.ts'),
      join(RAIZ, 'src/lib/fuerza.ts'),
    ],
  }),
);

try {
  execFileSync('npx', ['tsc', '-p', tsconfig], { cwd: RAIZ, stdio: 'pipe' });
} catch (e) {
  console.error('tsc fallo al compilar fuerza.ts:\n' + (e.stdout?.toString() ?? e.message));
  process.exit(1);
}

const req = createRequire(join(build, 'x.cjs'));
const F = req('./lib/fuerza.js');
const D = req('./lib/duracion.js');

// Limpiar el build temporal al terminar el proceso
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

// ---------------------------------------------------------------------------
// estimarUnaRM
// ---------------------------------------------------------------------------

console.log('\nestimacion de 1RM (formula de Epley):');

prueba('1 repeticion devuelve exactamente el peso levantado', () => {
  igual(F.estimarUnaRM(100, 1), 100, '1 rep');
  igual(F.estimarUnaRM(65.5, 1), 65.5, '1 rep decimal');
});

prueba('repeticiones bajas calculan Epley correctamente', () => {
  // 100 * (1 + 5 / 30) = 100 * 1.1666... = 116.7
  igual(F.estimarUnaRM(100, 5), 116.7, '5 reps');
  // 80 * (1 + 8 / 30) = 80 * 1.2666... = 101.3
  igual(F.estimarUnaRM(80, 8), 101.3, '8 reps');
});

prueba('el tope de 12 repeticiones calcula 1RM', () => {
  // 100 * (1 + 12 / 30) = 140
  igual(F.estimarUnaRM(100, 12), 140, '12 reps');
});

prueba('por encima de 12 repeticiones devuelve null por disparo de error', () => {
  igual(F.estimarUnaRM(100, 13), null, '13 reps');
  igual(F.estimarUnaRM(60, 20), null, '20 reps');
});

prueba('series sin peso (peso corporal) o peso <= 0 devuelven null', () => {
  igual(F.estimarUnaRM(null, 10), null, 'peso null');
  igual(F.estimarUnaRM(0, 10), null, 'peso 0');
  igual(F.estimarUnaRM(-10, 5), null, 'peso negativo');
});

prueba('repeticiones invalidas (<= 0) devuelven null', () => {
  igual(F.estimarUnaRM(100, 0), null, '0 reps');
  igual(F.estimarUnaRM(100, -2), null, 'reps negativas');
});

// ---------------------------------------------------------------------------
// mejorSerieDe
// ---------------------------------------------------------------------------

console.log('\nmejor serie (peso * repeticiones):');

prueba('elige por mayor volumen relativo y no solo por peso absoluto', () => {
  const seriePesada = { id: '1', sesion_id: 's', ejercicio_id: 'e', orden: 1, repeticiones: 1, peso_kg: 100, created_at: '', updated_at: '' };
  const serieVolumen = { id: '2', sesion_id: 's', ejercicio_id: 'e', orden: 2, repeticiones: 6, peso_kg: 80, created_at: '', updated_at: '' };
  
  // 100kg x 1 = 100 vs 80kg x 6 = 480 -> gana serieVolumen
  const mejor = F.mejorSerieDe([seriePesada, serieVolumen]);
  igual(mejor?.id, '2', 'mejor serie');
});

prueba('ignora series sin peso o corporales si hay alguna con peso', () => {
  const serieCorporal = { id: '1', sesion_id: 's', ejercicio_id: 'e', orden: 1, repeticiones: 15, peso_kg: null, created_at: '', updated_at: '' };
  const serieConPeso = { id: '2', sesion_id: 's', ejercicio_id: 'e', orden: 2, repeticiones: 8, peso_kg: 20, created_at: '', updated_at: '' };

  const mejor = F.mejorSerieDe([serieCorporal, serieConPeso]);
  igual(mejor?.id, '2', 'mejor serie');
});

prueba('sesion vacia o solo series sin peso devuelve null', () => {
  igual(F.mejorSerieDe([]), null, 'sesion vacia');

  const serieCorporal = { id: '1', sesion_id: 's', ejercicio_id: 'e', orden: 1, repeticiones: 15, peso_kg: null, created_at: '', updated_at: '' };
  igual(F.mejorSerieDe([serieCorporal]), null, 'solo peso corporal');
});

// ---------------------------------------------------------------------------
// volumenTotal
// ---------------------------------------------------------------------------

console.log('\nvolumen total:');

prueba('suma peso_kg * repeticiones ignorando peso corporal', () => {
  const series = [
    { id: '1', sesion_id: 's', ejercicio_id: 'e', orden: 1, repeticiones: 10, peso_kg: 50, created_at: '', updated_at: '' },
    { id: '2', sesion_id: 's', ejercicio_id: 'e', orden: 2, repeticiones: 15, peso_kg: null, created_at: '', updated_at: '' },
    { id: '3', sesion_id: 's', ejercicio_id: 'e', orden: 3, repeticiones: 8, peso_kg: 60, created_at: '', updated_at: '' },
  ];

  // (10 * 50) + (8 * 60) = 500 + 480 = 980
  igual(F.volumenTotal(series), 980, 'volumen total');
});

prueba('sesion vacia da 0', () => {
  igual(F.volumenTotal([]), 0, 'vacio');
});

// ---------------------------------------------------------------------------
// evolucion1RM
// ---------------------------------------------------------------------------

console.log('\nevolucion temporal de 1RM:');

prueba('un punto por sesion con el mejor 1RM del dia', () => {
  const series = [
    // Dia 1: dos series, 80x5 (1RM=93.3) y 85x3 (1RM=93.5)
    { id: '1', sesion_id: 's1', ejercicio_id: 'e', orden: 1, repeticiones: 5, peso_kg: 80, fecha: '2026-09-01', created_at: '', updated_at: '' },
    { id: '2', sesion_id: 's1', ejercicio_id: 'e', orden: 2, repeticiones: 3, peso_kg: 85, fecha: '2026-09-01', created_at: '', updated_at: '' },
    // Dia 2: una serie > 12 reps y una valida 90x2 (1RM=96)
    { id: '3', sesion_id: 's2', ejercicio_id: 'e', orden: 1, repeticiones: 15, peso_kg: 70, fecha: '2026-09-08', created_at: '', updated_at: '' },
    { id: '4', sesion_id: 's2', ejercicio_id: 'e', orden: 2, repeticiones: 2, peso_kg: 90, fecha: '2026-09-08', created_at: '', updated_at: '' },
  ];

  const evo = F.evolucion1RM(series);
  igual(evo.length, 2, 'dos puntos');
  igual(evo[0].fecha, '2026-09-01', 'fecha dia 1');
  igual(evo[0].estimado, 93.5, 'mejor 1RM dia 1');
  igual(evo[1].fecha, '2026-09-08', 'fecha dia 2');
  igual(evo[1].estimado, 96, 'mejor 1RM dia 2');
});

prueba('si un dia solo tuvo series de >12 reps o sin peso, no genera punto', () => {
  const series = [
    { id: '1', sesion_id: 's1', ejercicio_id: 'e', orden: 1, repeticiones: 15, peso_kg: 50, fecha: '2026-09-01', created_at: '', updated_at: '' },
    { id: '2', sesion_id: 's1', ejercicio_id: 'e', orden: 2, repeticiones: 10, peso_kg: null, fecha: '2026-09-01', created_at: '', updated_at: '' },
  ];

  const evo = F.evolucion1RM(series);
  igual(evo.length, 0, 'sin puntos');
});

// ---------------------------------------------------------------------------
// textoCoachFuerza
// ---------------------------------------------------------------------------

console.log('\ncard del coach (sobria e informativa):');

prueba('con menos de dos puntos no hay comparacion', () => {
  igual(F.textoCoachFuerza([], 'Press banca'), null, 'cero puntos');
  igual(F.textoCoachFuerza([{ fecha: '2026-09-01', estimado: 80 }], 'Press banca'), null, 'un punto');
});

prueba('informa subida de carga sin signos de admiracion ni calificativos', () => {
  const evo = [
    { fecha: '2026-09-01', estimado: 80 },
    { fecha: '2026-09-22', estimado: 85 },
  ];
  const txt = F.textoCoachFuerza(evo, 'Press de banca');
  igual(txt, 'Tu 1RM estimado en press de banca subio 5 kg en las ultimas 3 semanas.', 'subida');
});

prueba('informa carga sostenida', () => {
  const evo = [
    { fecha: '2026-09-01', estimado: 80 },
    { fecha: '2026-09-15', estimado: 80.2 },
  ];
  const txt = F.textoCoachFuerza(evo, 'Sentadilla');
  igual(txt, 'Mismo nivel de carga estimada en sentadilla en las ultimas 2 semanas.', 'sostenida');
});

// --- resumenFilaEjercicio / agruparEjerciciosPorRutina -----------------------

const serie = (fecha, peso_kg, repeticiones) => ({
  id: `${fecha}-${peso_kg}-${repeticiones}`, sesion_id: fecha, ejercicio_id: 'ej',
  orden: 0, repeticiones, peso_kg, fecha,
});

prueba('resumen de fila: ultimo 1RM, tendencia y ultima fecha', () => {
  const r = F.resumenFilaEjercicio([
    serie('2026-09-01', 60, 5),
    serie('2026-09-08', 65, 5),
  ]);
  igual(r.unRM, 75.8, 'ultimo 1RM');
  igual(r.tendencia, 'sube', 'tendencia');
  igual(r.ultimaFecha, '2026-09-08', 'ultima fecha');
});

prueba('resumen de fila: menos de 0,5 kg de diferencia es "igual"', () => {
  const r = F.resumenFilaEjercicio([serie('2026-09-01', 60, 5), serie('2026-09-08', 60, 5)]);
  igual(r.tendencia, 'igual', 'tendencia');
});

prueba('resumen de fila: una sola sesion no tiene tendencia; peso corporal no tiene 1RM', () => {
  const r = F.resumenFilaEjercicio([serie('2026-09-01', null, 15)]);
  igual(r.unRM, null, '1RM');
  igual(r.tendencia, null, 'tendencia');
  igual(r.ultimaFecha, '2026-09-01', 'ultima fecha');
  igual(F.resumenFilaEjercicio([]).ultimaFecha, null, 'sin series');
});

prueba('agrupar: orden de la rutina, rutinas vacias fuera, "Otros" al final', () => {
  const a = { id: 'a' }, b = { id: 'b' }, c = { id: 'c' }, d = { id: 'd' };
  const grupos = F.agruparEjerciciosPorRutina(
    [
      { id: 'r1', nombre: 'Pecho', ejercicios: [b, a] },
      { id: 'r2', nombre: 'Vacia', ejercicios: [] },
      { id: 'r3', nombre: 'Piernas', ejercicios: [a, c] },
    ],
    [a, d],
  );
  igual(grupos.map((g) => g.id).join(','), 'r1,r3,otros', 'grupos');
  igual(grupos[0].ejercicios.map((e) => e.ejercicio.id).join(','), 'b,a', 'orden de la rutina');
  igual(grupos[0].ejercicios.map((e) => e.conHistorial).join(','), 'false,true', 'con historial');
  igual(grupos[2].ejercicios.map((e) => e.ejercicio.id).join(','), 'd', 'otros: solo lo que no esta en rutinas');
});

prueba('agrupar: sin ejercicios fuera de rutina no hay "Otros"', () => {
  const a = { id: 'a' };
  const grupos = F.agruparEjerciciosPorRutina([{ id: 'r1', nombre: 'X', ejercicios: [a] }], [a]);
  igual(grupos.length, 1, 'grupos');
});

// --- texto del cierre de sesion ------------------------------------------------

console.log('\ntexto del cierre de sesion:');

prueba('series iguales se agrupan', () => {
  const s = { repeticiones: 10, pesoKg: 60 };
  igual(F.textoSeriesEjercicio([s, s, s]), '3 series de 10 × 60 kg', 'tres iguales');
  igual(F.textoSeriesEjercicio([s]), '10 × 60 kg', 'una sola');
});

prueba('series distintas van una por una y en orden', () => {
  igual(
    F.textoSeriesEjercicio([
      { repeticiones: 10, pesoKg: 60 },
      { repeticiones: 8, pesoKg: 62.5 },
      { repeticiones: 8, pesoKg: 65 },
    ]),
    '10 × 60 kg · 8 × 62,5 kg · 8 × 65 kg',
    'progresion',
  );
});

prueba('sin peso se cuentan repeticiones', () => {
  const s = { repeticiones: 12, pesoKg: null };
  igual(F.textoSeriesEjercicio([s, s]), '2 series de 12 reps', 'peso corporal');
  igual(F.textoSeriesEjercicio([{ repeticiones: 12, pesoKg: 0 }]), '12 reps', 'peso cero');
  igual(F.textoSeriesEjercicio([]), '', 'vacio');
});

prueba('series por tiempo se agrupan como "3 × 1:00"', () => {
  const s = { repeticiones: null, duracionSeg: 60, pesoKg: null };
  igual(F.textoSeriesEjercicio([s, s, s]), '3 × 1:00', 'tres iguales');
  igual(F.textoSeriesEjercicio([s]), '1:00', 'una sola');
  const conDisco = { repeticiones: null, duracionSeg: 45, pesoKg: 10 };
  igual(F.textoSeriesEjercicio([conDisco, conDisco]), '2 × 0:45 · 10 kg', 'con peso');
  igual(
    F.textoSeriesEjercicio([s, { ...s, duracionSeg: 45 }, { ...s, duracionSeg: 50 }]),
    '1:00 · 0:45 · 0:50',
    'distintas, una por una',
  );
});

// --- tiempo de las series por tiempo -------------------------------------------

console.log('\ntiempo de las series por tiempo:');

prueba('los digitos se leen de derecha a izquierda como m:ss', () => {
  igual(D.leerDigitosTiempo('1'), { seg: 1, texto: '0:01', valido: true }, '1');
  igual(D.leerDigitosTiempo('13'), { seg: 13, texto: '0:13', valido: true }, '13');
  igual(D.leerDigitosTiempo('130'), { seg: 90, texto: '1:30', valido: true }, '130');
  igual(D.leerDigitosTiempo('3000'), { seg: 1800, texto: '30:00', valido: true }, '3000');
  igual(D.leerDigitosTiempo('9959'), { seg: 5999, texto: '99:59', valido: true }, 'maximo');
});

prueba('sin digitos no hay tiempo, y mas de 59 segundos no es valido', () => {
  igual(D.leerDigitosTiempo(''), { seg: null, texto: '0:00', valido: true }, 'vacio');
  igual(D.leerDigitosTiempo('190'), { seg: null, texto: '1:90', valido: false }, '190 no se normaliza');
  igual(D.leerDigitosTiempo('60'), { seg: null, texto: '0:60', valido: false }, '60');
});

prueba('textoDuracion y digitosDeDuracion van y vuelven', () => {
  igual(D.textoDuracion(60), '1:00', '1 min');
  igual(D.textoDuracion(5), '0:05', '5 seg');
  igual(D.textoDuracion(1800), '30:00', '30 min');
  for (const seg of [1, 13, 59, 60, 90, 754, 1800, 5999]) {
    igual(D.leerDigitosTiempo(D.digitosDeDuracion(seg)).seg, seg, `ida y vuelta ${seg}`);
  }
  igual(D.digitosDeDuracion(7200), '9959', 'tope de 99:59');
});

prueba('el pitido suena al cruzar cada marca de 15 s, una vez aunque se salteen varias', () => {
  igual(D.cruzoMarca(14, 15), true, 'llega a 15');
  igual(D.cruzoMarca(15, 16), false, 'ya paso');
  igual(D.cruzoMarca(0, 14), false, 'antes de 15');
  igual(D.cruzoMarca(29, 31), true, 'salta el 30');
  igual(D.cruzoMarca(10, 70), true, 'vuelve de segundo plano');
  igual(D.cruzoMarca(30, 30), false, 'misma lectura');
});

// --- ejercicios por tiempo en Fuerza --------------------------------------------

console.log('\nejercicios por tiempo en Fuerza:');

const serieT = (fecha, seg, extra = {}) => ({
  id: `${fecha}-${seg}`, sesion_id: fecha, ejercicio_id: 'plancha', orden: 0,
  repeticiones: null, duracion_seg: seg, peso_kg: null, es_calentamiento: 0,
  created_at: '', updated_at: '', fecha, ...extra,
});

prueba('las series por tiempo no entran en 1RM, mejor serie ni volumen', () => {
  const series = [serieT('2026-09-01', 60, { peso_kg: 20 })];
  igual(F.estimarUnaRM(20, null), null, '1RM sin repeticiones');
  igual(F.evolucion1RM(series), [], 'evolucion 1RM vacia');
  igual(F.mejorSerieDe(series), null, 'mejor serie');
  igual(F.volumenTotal(series), 0, 'volumen');
});

prueba('mejor tiempo y su evolucion, el mejor de cada dia', () => {
  const series = [
    serieT('2026-09-01', 45), serieT('2026-09-01', 60),
    serieT('2026-09-08', 75), serieT('2026-09-08', 50),
    { ...serieT('2026-09-08', 0), duracion_seg: null, repeticiones: 20 },
  ];
  igual(F.mejorTiempoDe(series).duracion_seg, 75, 'mejor tiempo');
  igual(F.evolucionTiempo(series), [
    { fecha: '2026-09-01', segundos: 60 },
    { fecha: '2026-09-08', segundos: 75 },
  ], 'evolucion');
});

prueba('el coach habla del tiempo con el mismo tono', () => {
  const sube = [{ fecha: '2026-09-01', segundos: 60 }, { fecha: '2026-09-15', segundos: 90 }];
  igual(F.textoCoachTiempo(sube, 'Plancha isometrica'),
    'Tu mejor tiempo en plancha isometrica subio 0:30 en las ultimas 2 semanas.', 'sube');
  const baja = [{ fecha: '2026-09-01', segundos: 90 }, { fecha: '2026-09-08', segundos: 80 }];
  igual(F.textoCoachTiempo(baja, 'Plancha lateral'),
    'Tu mejor tiempo en plancha lateral bajo 0:10 en la ultima semana.', 'baja');
  const igualT = [{ fecha: '2026-09-01', segundos: 60 }, { fecha: '2026-09-08', segundos: 60 }];
  igual(F.textoCoachTiempo(igualT, 'Eliptico'), 'Mismo mejor tiempo en eliptico en la ultima semana.', 'igual');
  igual(F.textoCoachTiempo(sube.slice(0, 1), 'X'), null, 'un solo punto');
});

prueba('la fila de un ejercicio por tiempo: sin 1RM, mejor tiempo y tendencia', () => {
  const series = [serieT('2026-09-01', 60), serieT('2026-09-08', 45)];
  const r = F.resumenFilaEjercicio(series, 'tiempo');
  igual(r.unRM, null, 'sin 1RM');
  igual(r.mejorSerie.duracion_seg, 60, 'mejor tiempo');
  igual(r.tendencia, 'baja', 'tendencia del ultimo dia contra el anterior');
  igual(r.ultimaFecha, '2026-09-08', 'ultima fecha');
});

// --- resumen final ---------------------------------------------------------

console.log(`\n${ok} pasan, ${fallos.length} fallan\n`);

if (fallos.length > 0) {
  for (const f of fallos) console.error('  FALLO:', f);
  process.exit(1);
}
