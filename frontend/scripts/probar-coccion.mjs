// Pruebas de crudo y cocido, contra el modulo REAL src/lib/coccion.ts.
//
//   node scripts/probar-coccion.mjs
//
// Mismo molde que probar-progreso.mjs: no toca la base. Lo que depende de la
// base (la migracion, el paso de factores, los totales con items en crudo)
// esta en probar-db.mjs.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, '..');

// --- compilar a CommonJS en un temporal ------------------------------------

const tmp = mkdtempSync(join(tmpdir(), 'probar-coccion-'));
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
    include: [join(RAIZ, 'src/lib/coccion.ts')],
  }),
);

try {
  execFileSync('npx', ['tsc', '-p', tsconfig], { cwd: RAIZ, stdio: 'pipe' });
} catch (e) {
  console.error('tsc fallo al compilar:\n' + (e.stdout?.toString() ?? e.message));
  process.exit(1);
}

const req = createRequire(join(build, 'x.cjs'));
const C = req('./lib/coccion.js');

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

// --- conversion ------------------------------------------------------------

console.log('\nconvertirAEstadoBase:');

prueba('base cocido, pesado crudo: factor > 1 (arroz)', () => {
  cerca(C.convertirAEstadoBase(300, 'crudo', 'cocido', 2.81), 843, 1e-9, 'arroz');
});

prueba('base cocido, pesado crudo: factor < 1 (pollo)', () => {
  cerca(C.convertirAEstadoBase(200, 'crudo', 'cocido', 0.73), 146, 1e-9, 'pollo');
});

prueba('base crudo, pesado cocido: se divide (fideos de paquete)', () => {
  cerca(C.convertirAEstadoBase(600, 'cocido', 'crudo', 2.5), 240, 1e-9, 'fideos');
});

prueba('mismo estado que la base: sin cambio', () => {
  igual(C.convertirAEstadoBase(250, 'cocido', 'cocido', 2.81), 250, 'cocido sobre cocido');
  igual(C.convertirAEstadoBase(80, 'crudo', 'crudo', 2.35), 80, 'seco sobre seco');
});

prueba('sin factor o sin estado base no hay conversion', () => {
  igual(C.convertirAEstadoBase(300, 'crudo', 'cocido', null), 300, 'factor null');
  igual(C.convertirAEstadoBase(300, 'crudo', null, 2.81), 300, 'base null');
  igual(C.convertirAEstadoBase(300, 'crudo', 'cocido', 0), 300, 'factor cero no divide ni multiplica');
});

prueba('ida y vuelta vuelve al mismo valor', () => {
  const cocido = C.convertirAEstadoBase(240, 'crudo', 'cocido', 2.5);
  cerca(C.convertirAEstadoBase(cocido, 'cocido', 'crudo', 2.5), 240, 1e-9, 'ida y vuelta');
});

// --- textos ------------------------------------------------------------------

console.log('\ntextos:');

prueba('el selector pone primero el estado base', () => {
  igual(C.opcionesCoccion('cocido').map((o) => o.etiqueta), ['Cocido', 'Crudo'], 'semilla');
  igual(C.opcionesCoccion('crudo').map((o) => o.etiqueta), ['Pesé seco', 'Pesé cocido'], 'paquete');
  igual(C.opcionesCoccion('crudo')[0].estado, 'crudo', 'la primera es la base');
});

prueba('la equivalencia muestra los dos pesos y las kcal', () => {
  igual(
    C.textoEquivalencia(300, 'crudo', 'cocido', 2.81, 130),
    '300 g crudo ≈ 843 g cocido · 1.096 kcal',
    'arroz de la semilla',
  );
  igual(
    C.textoEquivalencia(600, 'cocido', 'crudo', 2.5, 354),
    '600 g cocido ≈ 240 g secos · 850 kcal',
    'fideos de paquete',
  );
});

prueba('sin conversion no hay equivalencia', () => {
  igual(C.textoEquivalencia(300, 'cocido', 'cocido', 2.81, 130), null, 'mismo estado');
  igual(C.textoEquivalencia(300, 'crudo', null, null, 130), null, 'sin factor');
  igual(C.textoEquivalencia(0, 'crudo', 'cocido', 2.81, 130), null, 'sin gramos');
});

prueba('lo pesado se nombra en su estado', () => {
  igual(C.textoCantidadIngresada(300, 'crudo', 'cocido'), '300 g crudo', 'semilla');
  igual(C.textoCantidadIngresada(600, 'cocido', 'crudo'), '600 g cocido', 'paquete');
  igual(C.textoCantidadIngresada(1200, 'crudo', 'cocido'), '1.200 g crudo', 'miles');
});

// --- deteccion en el escaner --------------------------------------------------

console.log('\ndetectarCoccion:');

prueba('pasta seca, arroz y quinoa con su factor y su porcion seca', () => {
  igual(C.detectarCoccion(['en:plant-based-foods', 'en:pastas', 'en:dry-pastas']),
    { tipo: 'pasta', factor: 2.35, porcionSecaG: 80 }, 'pasta');
  igual(C.detectarCoccion(['en:cereal-grains', 'en:rices', 'en:long-grain-rices']),
    { tipo: 'arroz', factor: 2.81, porcionSecaG: 70 }, 'arroz');
  igual(C.detectarCoccion(['en:quinoa']), { tipo: 'quinoa', factor: 3.07, porcionSecaG: 60 }, 'quinoa');
  igual(C.detectarCoccion(['en:durum-wheat-semolinas-for-couscous']).factor, 3.36, 'cuscus');
});

prueba('gana la categoria mas especifica', () => {
  igual(C.detectarCoccion(['en:rices', 'en:brown-rices']).factor, 2.98, 'integral antes que arroz');
  igual(C.detectarCoccion(['en:pulses', 'en:lentils', 'en:dried-lentils']).factor, 3.03, 'lentejas antes que legumbres');
  igual(C.detectarCoccion(['en:pulses', 'en:chickpeas']).factor, 2.3, 'garbanzos');
  igual(C.detectarCoccion(['en:pulses', 'en:common-beans']).factor, 2.4, 'porotos');
  igual(C.detectarCoccion(['en:legume-seeds', 'en:pulses']).factor, 2.5, 'otras legumbres secas');
  igual(C.detectarCoccion(['en:pulses']).porcionSecaG, 60, 'porcion de legumbres');
});

prueba('lo que ya viene cocido o preparado queda afuera', () => {
  igual(C.detectarCoccion(['en:pulses', 'en:lentils', 'en:canned-legumes']), null, 'lentejas en lata');
  igual(C.detectarCoccion(['en:rices', 'en:precooked-rices']), null, 'arroz precocido');
  igual(C.detectarCoccion(['en:lentils', 'en:meals', 'en:prepared-lentils']), null, 'lentejas preparadas');
  igual(C.detectarCoccion(['en:pastas', 'en:stuffed-pastas']), null, 'pasta rellena');
  igual(C.detectarCoccion(['en:instant-noodles']), null, 'fideos instantaneos');
});

prueba('si no se reconoce, no se inventa', () => {
  igual(C.detectarCoccion(['en:pastas']), null, 'pasta sin saber si es seca');
  igual(C.detectarCoccion(['en:corn-semolinas']), null, 'polenta');
  igual(C.detectarCoccion(['en:beverages', 'en:sodas']), null, 'gaseosa');
  igual(C.detectarCoccion([]), null, 'sin categorias');
  igual(C.detectarCoccion(null), null, 'null');
});

prueba('las categorias no distinguen mayusculas', () => {
  igual(C.detectarCoccion(['EN:DRY-PASTAS']).tipo, 'pasta', 'mayusculas');
});

// --- salida ----------------------------------------------------------------

rmSync(tmp, { recursive: true, force: true });

console.log(`\n${ok} pasan, ${fallos.length} fallan`);
if (fallos.length) {
  for (const f of fallos) console.log('  -', f);
  process.exit(1);
}
