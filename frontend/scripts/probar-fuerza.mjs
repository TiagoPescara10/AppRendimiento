// Pruebas de las funciones puras de Fuerza y Progresion en src/lib/fuerza.ts
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

// --- resumen final ---------------------------------------------------------

console.log(`\n${ok} pasan, ${fallos.length} fallan\n`);

if (fallos.length > 0) {
  for (const f of fallos) console.error('  FALLO:', f);
  process.exit(1);
}
