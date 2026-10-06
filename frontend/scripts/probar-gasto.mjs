// Pruebas del gasto estimado del cronometro y de lo que dice la tarjeta para
// compartir, contra los modulos REALES src/lib/gasto.ts y
// src/features/compartir/tarjeta.ts.
//
//   node scripts/probar-gasto.mjs
//
// Mismo molde que probar-progreso.mjs: no toca la base. Lo de la migracion 019
// esta en probar-db.mjs.

// Zona horaria fija: la fecha de la tarjeta es un dia LOCAL.
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

const tmp = mkdtempSync(join(tmpdir(), 'probar-gasto-'));
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
    include: [
      join(RAIZ, 'src/lib/gasto.ts'),
      join(RAIZ, 'src/features/compartir/tarjeta.ts'),
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
const G = req('./lib/gasto.js');
const TJ = req('./features/compartir/tarjeta.js');

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

function cerca(actual, esperado, tolerancia, que) {
  if (!(Math.abs(actual - esperado) <= tolerancia)) {
    throw new Error(`${que}: esperaba ${esperado} +-${tolerancia}, dio ${actual}`);
  }
}

// --- fabricas ------------------------------------------------------------------

const P = 70; // kg
const kcal = (actividad, min, km, pesoKg = P) =>
  G.estimarKcal({ actividad, duracionSeg: min * 60, distanciaKm: km, pesoKg });

// --- gasto ------------------------------------------------------------------------

console.log('\ncorrer y caminar:');

prueba('correr con km usa ACSM de carrera, neto', () => {
  // 6,2 km en 45:12 -> 137,2 m/min -> VO2 neto 27,4 -> 9,6 kcal/min x 45,2 min
  igual(G.estimarKcal({ actividad: 'correr', duracionSeg: 2712, distanciaKm: 6.2, pesoKg: P }), 430, '6,2 km');
});

prueba('correr sin km usa el MET 8,0 neto (12150)', () => {
  // (8 - 1) x 3,5 x 70 / 200 = 8,575 kcal/min x 30
  igual(kcal('correr', 30, null), 260, 'sin km');
  igual(kcal('correr', 30, 0), 260, 'km en 0 es sin km');
});

prueba('caminar con km usa ACSM de caminata, neto', () => {
  // 5 km/h -> 83,3 m/min -> VO2 neto 8,3 -> 2,9 kcal/min x 60
  igual(kcal('caminar', 60, 5), 180, '5 km en una hora');
});

prueba('caminar sin km usa el MET 3,5 neto (17160)', () => {
  igual(kcal('caminar', 60, null), 180, 'una hora');
});

prueba('una caminata rapida pasa a carrera por encima de 8 km/h', () => {
  // Justo 8 km/h sigue siendo caminata; apenas por encima, carrera.
  igual(kcal('caminar', 30, 4), 140, '8 km/h con caminata');
  igual(kcal('caminar', 30, 4.01), kcal('correr', 30, 4.01), 'mas de 8 km/h con carrera');
});

prueba('una "caminata" a 20 km/h se calcula como correr', () => {
  igual(kcal('caminar', 30, 10), kcal('correr', 30, 10), '20 km/h');
  igual(kcal('correr', 30, 10), 700, 'y da lo de correr');
});

prueba('a pie, por encima de 25 km/h los km se ignoran', () => {
  igual(kcal('correr', 30, 12.5), 880, 'justo 25 km/h todavia vale');
  igual(kcal('correr', 30, 12.6), kcal('correr', 30, null), '25,2 km/h cae al MET');
  igual(kcal('caminar', 30, 50), kcal('caminar', 30, null), 'una caminata a 100 km/h tambien');
});

console.log('\nbici:');

prueba('los rangos de velocidad del Compendium, con sus bordes', () => {
  const mph = (n) => n * 1.609344;
  igual(G.metBici(5), 4.0, 'paseo lento');
  igual(G.metBici(mph(10) - 0.001), 4.0, 'apenas debajo de 10 mph');
  igual(G.metBici(mph(10)), 6.8, '10 mph justo (01020)');
  igual(G.metBici(mph(12) - 0.001), 6.8, 'apenas debajo de 12 mph');
  igual(G.metBici(mph(12)), 8.0, '12 mph justo (01030)');
  igual(G.metBici(mph(14)), 10.0, '14 mph justo (01040)');
  igual(G.metBici(mph(16)), 12.0, '16 mph justo (01050)');
  igual(G.metBici(mph(19.5)), 12.0, 'el hueco de 19 a 20 mph va con 01050');
  igual(G.metBici(mph(20) - 0.001), 12.0, 'apenas debajo de 20 mph');
  igual(G.metBici(mph(20)), 16.8, '20 mph justo (01060)');
  igual(G.metBici(59), 16.8, 'muy rapido');
});

prueba('bici con km usa el MET de su rango, neto', () => {
  // 20 km/h -> 8,0 -> 7 x 3,5 x 70 / 200 = 8,575 kcal/min x 60
  igual(kcal('bici', 60, 20), 510, '20 km/h');
  igual(kcal('bici', 60, 12), kcal('bici', 60, 10), 'dentro del mismo rango, mismo gasto');
});

prueba('bici sin km usa el 7,0 general (01014)', () => {
  // 6 x 3,5 x 70 / 200 = 7,35 kcal/min x 60
  igual(kcal('bici', 60, null), 440, 'una hora');
});

prueba('en bici, por encima de 60 km/h los km se ignoran', () => {
  igual(kcal('bici', 60, 60), 1160, 'justo 60 km/h todavia vale (16,8)');
  igual(kcal('bici', 60, 61), kcal('bici', 60, null), '61 km/h cae al 7,0');
  igual(kcal('bici', 60, 40) > kcal('bici', 60, null), true, 'a 40 km/h no se ignora');
});

console.log('\ncasos sin cuenta:');

prueba('sin peso no hay estimacion', () => {
  igual(kcal('correr', 30, 5, null), null, 'peso null');
  igual(kcal('correr', 30, 5, 0), null, 'peso 0');
  igual(kcal('bici', 30, null, NaN), null, 'peso NaN');
});

prueba('duracion 0 no hay estimacion', () => {
  igual(kcal('correr', 0, 5), null, 'cero');
  igual(G.estimarKcal({ actividad: 'caminar', duracionSeg: -10, distanciaKm: null, pesoKg: P }), null, 'negativa');
});

prueba('siempre redondea a 10 kcal', () => {
  for (const a of G.ACTIVIDADES) {
    for (const [min, km] of [[7, null], [23, 3.3], [51, 9.1], [95, 30]]) {
      const k = kcal(a, min, km);
      igual(k % 10, 0, `${a} ${min} min ${km} km`);
    }
  }
});

prueba('mas peso, mas gasto; mismo recorrido, misma cuenta', () => {
  igual(kcal('correr', 45, 7, 90) > kcal('correr', 45, 7, 60), true, 'peso');
});

// --- tarjeta --------------------------------------------------------------------

console.log('\ntarjeta:');

const base = { actividad: 'correr', fecha: '2026-09-29', duracionSeg: 2712, distanciaKm: 6.2, kcal: 410 };

prueba('con todo: km grande y tres columnas', () => {
  const c = TJ.contenidoTarjeta(base);
  igual(c.actividad, 'CORRER', 'actividad');
  igual(c.fecha, 'Mar 29 sep', 'fecha');
  igual(c.principal, { valor: '6,2', unidad: 'km' }, 'principal');
  igual(c.columnas, [
    { valor: '45:12', etiqueta: 'Tiempo' },
    { valor: '7:17', etiqueta: 'min/km' },
    { valor: '≈ 410', etiqueta: 'kcal' },
  ], 'columnas');
});

prueba('sin kcal: dos columnas', () => {
  const c = TJ.contenidoTarjeta({ ...base, kcal: null });
  igual(c.columnas.map((x) => x.etiqueta), ['Tiempo', 'min/km'], 'sin kcal');
  igual(TJ.contenidoTarjeta({ ...base, kcal: 0 }).columnas.length, 2, 'kcal 0 tampoco se muestra');
});

prueba('sin km: el tiempo pasa a ser el numero grande', () => {
  const c = TJ.contenidoTarjeta({ ...base, distanciaKm: null });
  igual(c.principal, { valor: '45:12', unidad: 'min' }, 'principal');
  igual(c.columnas, [{ valor: '≈ 410', etiqueta: 'kcal' }], 'solo kcal');
  igual(TJ.contenidoTarjeta({ ...base, distanciaKm: null, kcal: null }).columnas, [], 'ni kcal: sin fila');
});

prueba('una hora o mas: 1:05:12', () => {
  igual(TJ.tiempoTarjeta(3912), '1:05:12', 'una hora');
  igual(TJ.tiempoTarjeta(45), '0:45', 'menos de un minuto');
  const c = TJ.contenidoTarjeta({ ...base, duracionSeg: 3912, distanciaKm: null });
  igual(c.principal, { valor: '1:05:12', unidad: 'h' }, 'sin km y mas de una hora');
});

prueba('en bici el ritmo va en km/h', () => {
  const c = TJ.contenidoTarjeta({ ...base, actividad: 'bici', distanciaKm: 20, duracionSeg: 3600 });
  igual(c.actividad, 'BICI', 'actividad');
  igual(c.columnas[1], { valor: '20', etiqueta: 'km/h' }, 'velocidad');
});

prueba('nunca 0, guion ni NaN en la imagen', () => {
  const casos = [
    { ...base, distanciaKm: 0, kcal: 0 },
    { ...base, distanciaKm: NaN, kcal: NaN },
    { ...base, distanciaKm: null, kcal: null },
    { ...base, actividad: null },
  ];
  for (const d of casos) {
    const c = TJ.contenidoTarjeta(d);
    const textos = [c.principal.valor, ...c.columnas.map((x) => x.valor)];
    for (const t of textos) {
      igual(/NaN|—|^0$|^≈ 0$/.test(t), false, `"${t}" en ${JSON.stringify(d)}`);
    }
  }
  igual(TJ.contenidoTarjeta({ ...base, actividad: null }).actividad, null, 'sin actividad no hay etiqueta');
});

// --- salida ----------------------------------------------------------------

rmSync(tmp, { recursive: true, force: true });

console.log(`\n${ok} pasan, ${fallos.length} fallan`);
if (fallos.length) {
  for (const f of fallos) console.log('  -', f);
  process.exit(1);
}
