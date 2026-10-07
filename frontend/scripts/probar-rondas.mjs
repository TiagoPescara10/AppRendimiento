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
    include: [join(RAIZ, 'src/lib/superseries.ts')],
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

// --- resumen final ---------------------------------------------------------

console.log(`\n${ok} pasan, ${fallos.length} fallan\n`);

if (fallos.length > 0) {
  for (const f of fallos) console.error('  FALLO:', f);
  process.exit(1);
}
