// Pruebas del asistente "Arma tu semana de gimnasio": la logica pura de
// src/features/entrenamiento/miSemana.ts (sugerencias, precarga y el diff que
// decide que filas de `rutina` crear, actualizar y desactivar).
//
// El guardado contra la base real esta en probar-db.mjs (guardarMiSemana).
//
//   node scripts/probar-mi-semana.mjs

import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, '..');

// --- compilar a CommonJS en un temporal ------------------------------------

const tmp = mkdtempSync(join(tmpdir(), 'probar-mi-semana-'));
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
    },
    include: [join(RAIZ, 'src/features/entrenamiento/miSemana.ts')],
  }),
);

try {
  execFileSync('npx', ['tsc', '-p', tsconfig], { cwd: RAIZ, stdio: 'pipe' });
} catch (e) {
  console.error('tsc fallo al compilar:\n' + (e.stdout?.toString() ?? e.message));
  process.exit(1);
}

const req = createRequire(join(build, 'x.cjs'));
const M = req('./features/entrenamiento/miSemana.js');

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

function lanza(fn, patron, que) {
  try {
    fn();
  } catch (e) {
    if (patron.test(e.message)) return;
    throw new Error(`${que}: lanzo "${e.message}", no coincide con ${patron}`);
  }
  throw new Error(`${que}: no lanzo`);
}

// --- datos -----------------------------------------------------------------

const { PREDEF } = M;
const LUN = 1, MAR = 2, MIE = 3, JUE = 4, VIE = 5, SAB = 6, DOM = 0;

const PREDEFINIDAS = [
  { id: PREDEF.fullBody, nombre: 'Full body principiante' },
  { id: PREDEF.torsoPiernaA, nombre: 'Torso/Pierna A' },
  { id: PREDEF.torsoPiernaB, nombre: 'Torso/Pierna B' },
  { id: PREDEF.push, nombre: 'Push' },
  { id: PREDEF.pull, nombre: 'Pull' },
  { id: PREDEF.legs, nombre: 'Legs' },
];
const ctx = (propias = []) => ({ propias, predefinidas: PREDEFINIDAS });

let n = 0;
const fila = (dia, hora, rg, extra = {}) => ({
  id: extra.id ?? `ru-${++n}`,
  dia_semana: dia,
  hora,
  tipo: 'gimnasio',
  duracion_estimada_min: 60,
  rutina_gimnasio_id: rg,
  activa: 1,
  ...extra,
});

const predef = (id) => ({ origen: 'predefinida', id });
const propia = (id) => ({ origen: 'propia', id });

/** Un estado con hora unica, 60 min y la rutina dada por dia. */
const estado = (rutinas, extra = {}) => ({
  ...M.estadoVacio(),
  dias: M.ordenarDias(Object.keys(rutinas).map(Number)),
  rutinaPorDia: rutinas,
  ...extra,
});

// ---------------------------------------------------------------------------
// Sugerencias
// ---------------------------------------------------------------------------

console.log('\nsugerencias:');

prueba('1, 2 y 3 dias: Full body principiante en todos', () => {
  for (const dias of [[MIE], [LUN, JUE], [LUN, MIE, VIE]]) {
    const s = M.sugerirRutinas(dias);
    igual(Object.values(s.porDia), dias.map(() => PREDEF.fullBody), `${dias.length} dias`);
  }
  igual(M.sugerirRutinas([MIE]).motivo.startsWith('Con 1 día,'), true, 'motivo en singular');
});

prueba('4 dias: Torso/Pierna A y B alternados, lunes primero', () => {
  // El domingo va ultimo aunque sea el 0 de getDay()
  const s = M.sugerirRutinas([DOM, LUN, MAR, JUE]);
  igual(s.porDia, { 0: PREDEF.torsoPiernaB, 1: PREDEF.torsoPiernaA, 2: PREDEF.torsoPiernaB, 4: PREDEF.torsoPiernaA }, 'por dia');
  igual(s.motivo, 'Con 4 días, alternar torso y pierna te deja descansar cada grupo.', 'motivo');
});

prueba('5 dias: Push, Pull, Legs, Push, Pull', () => {
  const s = M.sugerirRutinas([LUN, MAR, MIE, JUE, VIE]);
  igual(
    M.ordenarDias(Object.keys(s.porDia).map(Number)).map((d) => s.porDia[d]),
    [PREDEF.push, PREDEF.pull, PREDEF.legs, PREDEF.push, PREDEF.pull],
    'orden',
  );
});

prueba('6 dias: Push, Pull y Legs dos veces', () => {
  const s = M.sugerirRutinas([LUN, MAR, MIE, JUE, VIE, SAB]);
  igual(
    [LUN, MAR, MIE, JUE, VIE, SAB].map((d) => s.porDia[d]),
    [PREDEF.push, PREDEF.pull, PREDEF.legs, PREDEF.push, PREDEF.pull, PREDEF.legs],
    'orden',
  );
});

prueba('sin dias no sugiere nada', () => {
  igual(M.sugerirRutinas([]), { porDia: {}, motivo: '' }, 'vacia');
});

// ---------------------------------------------------------------------------
// Plan: semana nueva
// ---------------------------------------------------------------------------

console.log('\nplan, semana nueva:');

prueba('una sola copia por predefinida aunque se use en varios dias', () => {
  const s = M.sugerirRutinas([LUN, MAR, MIE, JUE, VIE, SAB]);
  const rutinas = Object.fromEntries(Object.entries(s.porDia).map(([d, id]) => [d, predef(id)]));
  const plan = M.planDesdeAsistente(estado(rutinas), [], ctx());
  igual(plan.copiar, [PREDEF.push, PREDEF.pull, PREDEF.legs], 'copias');
  igual(plan.crear.length, 6, 'una fila por dia');
  igual(plan.crear.map((c) => c.hora), Array(6).fill('19:00'), 'hora por defecto');
  igual(plan.crear.map((c) => c.duracion_estimada_min), Array(6).fill(60), 'duracion por defecto');
  igual(plan.sinCambios, false, 'hay cambios');
});

prueba('una predefinida con copia propia del mismo nombre usa la copia', () => {
  const plan = M.planDesdeAsistente(
    estado({ [LUN]: predef(PREDEF.push), [MIE]: predef(PREDEF.pull) }),
    [],
    ctx([{ id: 'rg-mi-push', nombre: 'Push' }, { id: 'rg-otra', nombre: 'Pull modificada' }]),
  );
  igual(plan.copiar, [PREDEF.pull], 'solo copia la que no tiene copia');
  igual(plan.crear[0].rutina, { tipo: 'existente', id: 'rg-mi-push' }, 'lunes usa la copia');
  igual(plan.crear[1].rutina, { tipo: 'copia', predefinidaId: PREDEF.pull }, 'miercoles copia');
});

prueba('hora distinta por dia', () => {
  const plan = M.planDesdeAsistente(
    estado(
      { [LUN]: propia('a'), [JUE]: propia('b') },
      { distintaPorDia: true, horaPorDia: { [LUN]: '07:30' } },
    ),
    [],
  );
  igual(plan.crear.map((c) => c.hora), ['07:30', '19:00'], 'el jueves sin hora propia usa la unica');
});

prueba('un dia sin rutina no arma plan', () => {
  const e = { ...estado({ [LUN]: propia('a') }), dias: [LUN, MAR] };
  igual(M.diasSinRutina(e), [MAR], 'falta el martes');
  lanza(() => M.planDesdeAsistente(e, []), /sin rutina/, 'plan');
});

// ---------------------------------------------------------------------------
// Plan: editar la semana que ya hay
// ---------------------------------------------------------------------------

console.log('\nplan, editando:');

const semanaActual = () => [
  fila(LUN, '19:00', 'rg-push', { id: 'ru-lun' }),
  fila(MIE, '19:00', 'rg-pull', { id: 'ru-mie' }),
  fila(VIE, '19:00', 'rg-legs', { id: 'ru-vie' }),
];

prueba('sin cambios: precargar y guardar no escribe nada', () => {
  const filas = semanaActual();
  const e = M.estadoDesdeRutinas(filas);
  igual(e.dias, [LUN, MIE, VIE], 'dias precargados');
  igual(e.horaUnica, '19:00', 'hora unica');
  igual(e.distintaPorDia, false, 'misma hora');
  const plan = M.planDesdeAsistente(e, filas);
  igual(plan, { copiar: [], crear: [], actualizar: [], desactivar: [], sinCambios: true }, 'plan vacio');
});

prueba('sacar un dia: se desactiva solo ese y los demas no se tocan', () => {
  const filas = semanaActual();
  const e = M.estadoDesdeRutinas(filas);
  e.dias = [LUN, VIE];
  delete e.rutinaPorDia[MIE];
  const plan = M.planDesdeAsistente(e, filas);
  igual(plan.desactivar, ['ru-mie'], 'desactiva el miercoles');
  igual(plan.actualizar.length + plan.crear.length + plan.copiar.length, 0, 'nada mas');
  igual(M.avisosDelPlan(e, filas).diasSacados, [MIE], 'el resumen avisa el dia sacado');
});

prueba('cambiar la hora de todos: actualiza todas las filas, sin crear ni desactivar', () => {
  const filas = semanaActual();
  const e = { ...M.estadoDesdeRutinas(filas), horaUnica: '07:00' };
  const plan = M.planDesdeAsistente(e, filas);
  igual(plan.actualizar.map((a) => [a.id, a.hora]), [['ru-lun', '07:00'], ['ru-mie', '07:00'], ['ru-vie', '07:00']], 'actualizadas');
  igual(plan.crear.length + plan.desactivar.length, 0, 'ni crea ni desactiva');
});

prueba('cambiar solo la duracion tambien actualiza', () => {
  const filas = semanaActual();
  const plan = M.planDesdeAsistente({ ...M.estadoDesdeRutinas(filas), duracionMin: 90 }, filas);
  igual(plan.actualizar.map((a) => a.duracion_estimada_min), [90, 90, 90], 'duraciones');
});

prueba('agregar un dia crea solo esa fila', () => {
  const filas = semanaActual();
  const e = M.estadoDesdeRutinas(filas);
  e.dias = M.ordenarDias([...e.dias, SAB]);
  e.rutinaPorDia[SAB] = propia('rg-push');
  const plan = M.planDesdeAsistente(e, filas);
  igual(plan.crear.map((c) => c.dia_semana), [SAB], 'crea el sabado');
  igual(plan.actualizar.length + plan.desactivar.length, 0, 'el resto igual');
});

prueba('cambiar la rutina de un dia a una predefinida sin copia: copia y actualiza esa fila', () => {
  const filas = semanaActual();
  const e = M.estadoDesdeRutinas(filas);
  e.rutinaPorDia[MIE] = predef(PREDEF.fullBody);
  const plan = M.planDesdeAsistente(e, filas, ctx([{ id: 'rg-push', nombre: 'Push' }]));
  igual(plan.copiar, [PREDEF.fullBody], 'copia');
  igual(plan.actualizar, [{ id: 'ru-mie', hora: '19:00', duracion_estimada_min: 60, rutina: { tipo: 'copia', predefinidaId: PREDEF.fullBody } }], 'actualiza el miercoles');
});

prueba('un dia con dos rutinas: precarga la mas temprana y desactiva la otra', () => {
  const filas = [
    fila(LUN, '20:00', 'rg-pull', { id: 'ru-tarde' }),
    fila(LUN, '08:00', 'rg-push', { id: 'ru-temprano' }),
  ];
  const e = M.estadoDesdeRutinas(filas);
  igual(e.rutinaPorDia[LUN], propia('rg-push'), 'precarga la de las 08:00');
  igual(M.avisosDelPlan(e, filas).diasConVarias, [LUN], 'el resumen lo avisa');
  const plan = M.planDesdeAsistente(e, filas);
  igual(plan.desactivar, ['ru-tarde'], 'desactiva la otra');
  igual(plan.actualizar.length, 0, 'la conservada no cambia');
});

prueba('si se elige la rutina de la segunda fila, se conserva esa', () => {
  const filas = [
    fila(LUN, '08:00', 'rg-push', { id: 'ru-temprano' }),
    fila(LUN, '20:00', 'rg-pull', { id: 'ru-tarde' }),
  ];
  const e = { ...M.estadoDesdeRutinas(filas), horaUnica: '20:00' };
  e.rutinaPorDia[LUN] = propia('rg-pull');
  const plan = M.planDesdeAsistente(e, filas);
  igual(plan.desactivar, ['ru-temprano'], 'desactiva la de push');
  igual(plan.actualizar.length, 0, 'la de pull ya estaba a las 20:00');
});

prueba('gimnasio libre: precarga sin rutina y al elegir una se reutiliza la fila', () => {
  const filas = [fila(MAR, '18:00', null, { id: 'ru-libre' })];
  const e = M.estadoDesdeRutinas(filas);
  igual(M.diasSinRutina(e), [MAR], 'el martes queda por elegir');
  e.rutinaPorDia[MAR] = propia('rg-push');
  const plan = M.planDesdeAsistente(e, filas);
  igual(plan.actualizar.map((a) => [a.id, a.rutina]), [['ru-libre', { tipo: 'existente', id: 'rg-push' }]], 'reutiliza la fila');
  igual(plan.crear.length + plan.desactivar.length, 0, 'ni crea ni desactiva');
});

prueba('horas distintas precargan "Distinta por dia"', () => {
  const filas = [
    fila(LUN, '07:00', 'a'),
    fila(MIE, '19:00', 'b'),
    fila(VIE, '19:00', 'c'),
  ];
  const e = M.estadoDesdeRutinas(filas);
  igual(e.distintaPorDia, true, 'toggle prendido');
  igual(e.horaUnica, '19:00', 'la unica es la mas comun');
  igual(M.horaDelDia(e, LUN), '07:00', 'lunes conserva su hora');
  igual(M.planDesdeAsistente(e, filas).sinCambios, true, 'sin cambios');
});

prueba('las filas de deporte, partido o inactivas no entran nunca', () => {
  const filas = [
    ...semanaActual(),
    fila(MAR, '20:00', null, { id: 'ru-futbol', tipo: 'entrenamiento' }),
    fila(SAB, '10:00', null, { id: 'ru-partido', tipo: 'partido' }),
    fila(JUE, '19:00', 'rg-vieja', { id: 'ru-inactiva', activa: 0 }),
  ];
  const e = M.estadoDesdeRutinas(filas);
  igual(e.dias, [LUN, MIE, VIE], 'solo dias de gimnasio activos');
  e.dias = [LUN];
  const plan = M.planDesdeAsistente(e, filas);
  igual(plan.desactivar, ['ru-mie', 'ru-vie'], 'solo desactiva gimnasio');
});

prueba('sin filas: estado vacio con valores por defecto', () => {
  igual(M.estadoDesdeRutinas([]), M.estadoVacio(), 'vacio');
});

prueba('horas: padding para guardar, sin cero para mostrar', () => {
  igual(M.horaConPadding(7, 5), '07:05', 'padding');
  igual(M.horaCorta('07:05'), '7:05', 'corta');
  igual(M.horaCorta('19:00'), '19:00', 'sin cambio');
});

// --- resumen final ---------------------------------------------------------

console.log(`\n${ok} pasan, ${fallos.length} fallan\n`);

if (fallos.length > 0) {
  for (const f of fallos) console.error('  FALLO:', f);
  process.exit(1);
}
