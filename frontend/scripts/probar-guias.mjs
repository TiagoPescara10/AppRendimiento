// Pruebas de las guias (src/features/guias/contenido.ts): que cada guia este
// bien armada, que "Probalo ahora" lleve a una ruta que existe y que cada "?"
// de la app (<BotonGuia id="...">) apunte a una guia que existe.
//
//   node scripts/probar-guias.mjs

import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, '..');

// --- compilar a CommonJS en un temporal ------------------------------------

const tmp = mkdtempSync(join(tmpdir(), 'probar-guias-'));
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
    include: [join(RAIZ, 'src/features/guias/contenido.ts')],
  }),
);

try {
  execFileSync('npx', ['tsc', '-p', tsconfig], { cwd: RAIZ, stdio: 'pipe' });
} catch (e) {
  console.error('tsc fallo al compilar:\n' + (e.stdout?.toString() ?? e.message));
  process.exit(1);
}

const req = createRequire(join(build, 'x.cjs'));
const G = req('./features/guias/contenido.js');

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

// --- rutas de app/ ---------------------------------------------------------

function archivos(dir, ext) {
  const salida = [];
  for (const nombre of readdirSync(dir)) {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) salida.push(...archivos(ruta, ext));
    else if (ext.some((e) => nombre.endsWith(e))) salida.push(ruta);
  }
  return salida;
}

/**
 * Cada pantalla de app/ como lista de segmentos: "app/(tabs)/perfil.tsx" da
 * ["(tabs)", "perfil"] e "index" desaparece. Se ignoran _layout y +not-found,
 * que no son destinos.
 */
const PANTALLAS = archivos(join(RAIZ, 'app'), ['.tsx'])
  .map((f) => relative(join(RAIZ, 'app'), f).replace(/\.tsx$/, '').split(sep))
  .filter((seg) => !seg.some((s) => s.startsWith('_') || s.startsWith('+')))
  .map((seg) => (seg[seg.length - 1] === 'index' ? seg.slice(0, -1) : seg));

const esGrupo = (s) => s.startsWith('(') && s.endsWith(')');
const esDinamico = (s) => s.startsWith('[') && s.endsWith(']');

/** Si un pathname (con o sin grupos, como acepta expo-router) es una pantalla. */
function existeRuta(pathname) {
  const pedido = pathname.split('/').filter(Boolean);
  return PANTALLAS.some((pantalla) => {
    // Los grupos se pueden escribir o no: se comparan sin los que el pedido omite.
    const conGrupos = pantalla;
    const sinGrupos = pantalla.filter((s) => !esGrupo(s));
    return [conGrupos, sinGrupos].some(
      (seg) =>
        seg.length === pedido.length &&
        seg.every((s, i) => esDinamico(s) || s === pedido[i]),
    );
  });
}

// ---------------------------------------------------------------------------

console.log('\nguias:');

const ids = G.GUIAS.map((g) => g.id);

prueba('hay guias y cada id es unico', () => {
  if (ids.length === 0) throw new Error('no hay guias');
  const repetidos = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (repetidos.length) throw new Error(`ids repetidos: ${repetidos.join(', ')}`);
});

prueba(`cada guia tiene entre 1 y ${G.MAX_PASOS} pasos, con titulo y texto`, () => {
  for (const g of G.GUIAS) {
    if (g.pasos.length < 1 || g.pasos.length > G.MAX_PASOS) {
      throw new Error(`${g.id} tiene ${g.pasos.length} pasos`);
    }
    for (const [i, p] of g.pasos.entries()) {
      if (!p.titulo.trim() || !p.texto.trim()) throw new Error(`${g.id}, paso ${i + 1} vacio`);
    }
  }
});

prueba('cada guia tiene titulo, descripcion y una categoria que existe', () => {
  const categorias = G.CATEGORIAS_GUIA.map((c) => c.valor);
  for (const g of G.GUIAS) {
    if (!g.titulo.trim() || !g.descripcion.trim()) throw new Error(`${g.id} sin titulo o descripcion`);
    if (!categorias.includes(g.categoria)) throw new Error(`${g.id}: categoria ${g.categoria}`);
  }
});

prueba('ninguna categoria queda vacia en la lista', () => {
  for (const c of G.CATEGORIAS_GUIA) {
    if (G.guiasDeCategoria(c.valor).length === 0) throw new Error(`${c.valor} sin guias`);
  }
});

prueba('el destino de cada guia es una pantalla que existe', () => {
  for (const g of G.GUIAS) {
    if (!existeRuta(g.destino.pathname)) throw new Error(`${g.id}: no existe ${g.destino.pathname}`);
  }
});

prueba('el detector de rutas rechaza una que no existe', () => {
  if (existeRuta('/no/existe')) throw new Error('acepto /no/existe');
  if (!existeRuta('/perfil/guia/mi-semana')) throw new Error('no reconoce la ruta dinamica de una guia');
});

prueba('el tono: sin exclamaciones', () => {
  for (const g of G.GUIAS) {
    const todo = [g.titulo, g.descripcion, ...g.pasos.flatMap((p) => [p.titulo, p.texto])].join(' ');
    if (/[!¡]/.test(todo)) throw new Error(`${g.id} tiene una exclamacion`);
  }
});

prueba('obtenerGuia() encuentra cada una y devuelve undefined si no existe', () => {
  for (const id of ids) if (G.obtenerGuia(id)?.id !== id) throw new Error(`no encontro ${id}`);
  if (G.obtenerGuia('no-existe') !== undefined) throw new Error('encontro una que no existe');
});

console.log('\nlos "?" de la app:');

// Todo <BotonGuia ...> de app/ y src/, con el id que lleva.
const usos = [];
const sinIdLiteral = [];
for (const f of [...archivos(join(RAIZ, 'app'), ['.tsx']), ...archivos(join(RAIZ, 'src'), ['.tsx'])]) {
  const texto = readFileSync(f, 'utf8');
  for (const m of texto.matchAll(/<BotonGuia\b([^>]*)>/g)) {
    const id = /\bid="([^"]+)"/.exec(m[1]);
    const donde = relative(RAIZ, f);
    if (id) usos.push({ donde, id: id[1] });
    else sinIdLiteral.push(donde);
  }
}

prueba('cada "?" lleva el id como texto fijo', () => {
  if (sinIdLiteral.length) throw new Error(`sin id="...": ${sinIdLiteral.join(', ')}`);
});

prueba('cada "?" apunta a una guia que existe', () => {
  const rotos = usos.filter((u) => !ids.includes(u.id));
  if (rotos.length) throw new Error(rotos.map((u) => `${u.donde} -> ${u.id}`).join(', '));
});

// Las pantallas que tienen que tener su "?". Si se borra uno, esto avisa.
const ESPERADOS = [
  ['app/entrenamiento/mi-semana.tsx', 'mi-semana'],
  ['app/rutina-gimnasio/nueva.tsx', 'crear-rutina'],
  ['app/perfil/rutinas.tsx', 'mi-semana'],
  ['app/comida/nueva.tsx', 'registrar-comida'],
  ['app/perfil/comidas.tsx', 'mis-comidas'],
  ['app/evento/temporizador.tsx', 'cronometro'],
];

prueba('cada pantalla que lo necesita tiene su "?"', () => {
  const faltan = ESPERADOS.filter(
    ([donde, id]) => !usos.some((u) => u.donde.split(sep).join('/') === donde && u.id === id),
  );
  if (faltan.length) throw new Error(faltan.map(([d, id]) => `${d} (${id})`).join(', '));
});

// --- resumen final ---------------------------------------------------------

console.log(`\n${ok} pasan, ${fallos.length} fallan\n`);

if (fallos.length > 0) {
  for (const f of fallos) console.error('  FALLO:', f);
  process.exit(1);
}
