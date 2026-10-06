// Pruebas de que hacer con un permiso de camara o de fotos, contra el modulo
// REAL src/lib/permisos.ts.
//
//   node scripts/probar-permisos.mjs
//
// Los dialogos (pedir, Ajustes) viven en features/permisos y necesitan el
// telefono; aca se prueba la decision, que es lo que no puede fallar: un
// estado mal leido deja al usuario sin salida.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, '..');

const tmp = mkdtempSync(join(tmpdir(), 'probar-permisos-'));
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
      strict: true,
      skipLibCheck: true,
      outDir: build,
      rootDir: join(RAIZ, 'src'),
      types: [],
    },
    include: [join(RAIZ, 'src/lib/permisos.ts')],
  }),
);

try {
  execFileSync('npx', ['tsc', '-p', tsconfig], { cwd: RAIZ, stdio: 'pipe' });
} catch (e) {
  console.error('tsc fallo al compilar:\n' + (e.stdout?.toString() ?? e.message));
  process.exit(1);
}

const { decidirPermiso } = createRequire(join(build, 'x.cjs'))('./lib/permisos.js');

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
  if (actual !== esperado) throw new Error(`${que}: esperaba ${esperado}, dio ${actual}`);
}

console.log('\npermisos');

prueba('concedido: listo, sin pedir nada', () => {
  igual(decidirPermiso({ granted: true, status: 'granted', canAskAgain: true }), 'listo', 'concedido');
});

prueba('sin decidir: se pide el permiso del sistema', () => {
  igual(decidirPermiso({ granted: false, status: 'undetermined', canAskAgain: true }), 'pedir', 'undetermined');
});

prueba('rechazado pero se puede preguntar: se pide de nuevo', () => {
  igual(decidirPermiso({ granted: false, status: 'denied', canAskAgain: true }), 'pedir', 'denied + canAskAgain');
});

prueba('rechazado y el sistema ya no deja: a Ajustes', () => {
  igual(decidirPermiso({ granted: false, status: 'denied', canAskAgain: false }), 'ajustes', 'denied sin canAskAgain');
});

prueba('undetermined manda aunque canAskAgain venga en false', () => {
  // Algunas versiones de Android informan canAskAgain false antes de la
  // primera pregunta: con undetermined igual hay que preguntar.
  igual(decidirPermiso({ granted: false, status: 'undetermined', canAskAgain: false }), 'pedir', 'undetermined');
});

rmSync(tmp, { recursive: true, force: true });
console.log(`\n${ok} pasan, ${fallos.length} fallan`);
if (fallos.length) {
  for (const f of fallos) console.log('  -', f);
  process.exit(1);
}
