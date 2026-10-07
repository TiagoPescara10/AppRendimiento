// Pruebas de los periodos del historial de comidas en src/lib/historial.ts.
//
//   node scripts/probar-historial.mjs

// Zona fija: los periodos se arman con fechas locales.
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

const tmp = mkdtempSync(join(tmpdir(), 'probar-historial-'));
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
    include: [join(RAIZ, 'src/lib/historial.ts')],
  }),
);

try {
  execFileSync('npx', ['tsc', '-p', tsconfig], { cwd: RAIZ, stdio: 'pipe' });
} catch (e) {
  console.error('tsc fallo al compilar:\n' + (e.stdout?.toString() ?? e.message));
  process.exit(1);
}

const req = createRequire(join(build, 'x.cjs'));
const H = req('./lib/historial.js');

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

console.log('\nperiodos del historial:');

prueba('la semana va de lunes a domingo', () => {
  // 2026-10-07 es miercoles
  igual(H.rangoDe('semana', '2026-10-07'), { desde: '2026-10-05', hasta: '2026-10-11' }, 'miercoles');
  igual(H.rangoDe('semana', '2026-10-05'), { desde: '2026-10-05', hasta: '2026-10-11' }, 'lunes');
  igual(H.rangoDe('semana', '2026-10-11'), { desde: '2026-10-05', hasta: '2026-10-11' }, 'domingo');
  igual(H.rangoDe('semana', '2026-10-01'), { desde: '2026-09-28', hasta: '2026-10-04' }, 'cruza el mes');
});

prueba('el mes es el mes calendario, con febrero bisiesto', () => {
  igual(H.rangoDe('mes', '2026-10-07'), { desde: '2026-10-01', hasta: '2026-10-31' }, 'octubre');
  igual(H.rangoDe('mes', '2028-02-10'), { desde: '2028-02-01', hasta: '2028-02-29' }, 'bisiesto');
  igual(H.rangoDe('mes', '2026-02-10'), { desde: '2026-02-01', hasta: '2026-02-28' }, 'no bisiesto');
});

prueba('anterior y siguiente, cruzando el anio', () => {
  igual(H.moverPeriodo('semana', '2026-10-07', -1), { desde: '2026-09-28', hasta: '2026-10-04' }, 'semana anterior');
  igual(H.moverPeriodo('semana', '2026-10-07', 1), { desde: '2026-10-12', hasta: '2026-10-18' }, 'semana siguiente');
  igual(H.moverPeriodo('mes', '2026-01-15', -1), { desde: '2025-12-01', hasta: '2025-12-31' }, 'mes anterior');
  igual(H.moverPeriodo('mes', '2025-12-31', 1), { desde: '2026-01-01', hasta: '2026-01-31' }, 'mes siguiente');
  igual(H.moverPeriodo('mes', '2026-03-31', -1), { desde: '2026-02-01', hasta: '2026-02-28' }, 'desde el 31');
});

prueba('no se avanza mas alla del periodo actual', () => {
  const hoy = '2026-10-07';
  igual(H.hayPeriodoSiguiente(H.rangoDe('semana', hoy), hoy), false, 'semana actual');
  igual(H.hayPeriodoSiguiente(H.rangoDe('semana', '2026-10-01'), hoy), true, 'semana pasada');
  igual(H.hayPeriodoSiguiente(H.rangoDe('mes', hoy), hoy), false, 'mes actual');
});

prueba('los dias del periodo actual cuentan hasta hoy', () => {
  const hoy = '2026-10-07';
  igual(H.diasDelPeriodo(H.rangoDe('semana', hoy), hoy), 3, 'miercoles: 3 dias');
  igual(H.diasDelPeriodo(H.rangoDe('semana', '2026-10-01'), hoy), 7, 'semana pasada entera');
  igual(H.diasDelPeriodo(H.rangoDe('mes', hoy), hoy), 7, 'mes hasta hoy');
  igual(H.diasDelPeriodo(H.rangoDe('mes', '2026-09-10'), hoy), 30, 'septiembre entero');
});

prueba('titulos de periodo y de dia', () => {
  const hoy = '2026-10-07';
  igual(H.tituloPeriodo('semana', H.rangoDe('semana', hoy), hoy), '5 – 11 oct', 'semana');
  igual(H.tituloPeriodo('semana', H.rangoDe('semana', '2026-10-01'), hoy), '28 sep – 4 oct', 'cruza el mes');
  igual(H.tituloPeriodo('mes', H.rangoDe('mes', hoy), hoy), 'Octubre', 'mes');
  igual(H.tituloPeriodo('mes', H.rangoDe('mes', '2025-12-01'), hoy), 'Diciembre 2025', 'otro anio');
  igual(H.etiquetaDia('2026-10-07', hoy), 'Hoy', 'hoy');
  igual(H.etiquetaDia('2026-10-06', hoy), 'Ayer', 'ayer');
  igual(H.etiquetaDia('2026-10-05', hoy), 'Lun 5 oct', 'lunes');
  igual(H.etiquetaDia('2026-10-04', hoy), 'Dom 4 oct', 'domingo');
});

prueba('el resumen promedia solo los dias con algo registrado', () => {
  igual(H.textoResumen([2000, 2500, 2520], 7), 'Registraste 3 de 7 días · promedio 2.340 kcal', 'promedio');
  igual(H.textoResumen([], 3), 'Registraste 0 de 3 días', 'sin registros');
  igual(H.textoResumen([1800], 1), 'Registraste 1 de 1 día · promedio 1.800 kcal', 'un dia');
  igual(H.miles(12345.6), '12.346', 'miles');
});

// --- resumen final ---------------------------------------------------------

console.log(`\n${ok} pasan, ${fallos.length} fallan\n`);

if (fallos.length > 0) {
  for (const f of fallos) console.error('  FALLO:', f);
  process.exit(1);
}
