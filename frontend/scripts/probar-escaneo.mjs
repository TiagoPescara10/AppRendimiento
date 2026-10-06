// Pruebas del escaneo de codigos de barras, contra los modulos REALES de
// src/features/escaneo/.
//
//   node scripts/probar-escaneo.mjs
//
// Dos partes:
//   1. normalizarProductoOff con respuestas inventadas de Open Food Facts:
//      la regla de kcal y macros, las porciones y la coccion por categoria.
//   2. consultarCodigo contra la base real (shim de expo-sqlite) y un fetch
//      falso: base local primero, guardar lo que viene de afuera, sin red.

process.env.TZ = 'America/Argentina/Buenos_Aires';

import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, '..');

const tmp = mkdtempSync(join(tmpdir(), 'probar-escaneo-'));
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
      strict: false,
      outDir: build,
      rootDir: join(RAIZ, 'src'),
      types: [],
    },
    // Archivos sueltos: los componentes de escaneo importan React Native.
    include: [
      join(RAIZ, 'src/db/**/*.ts'),
      join(RAIZ, 'src/features/escaneo/openFoodFacts.ts'),
      join(RAIZ, 'src/features/escaneo/consultarCodigo.ts'),
    ],
  }),
);

try {
  execFileSync('npx', ['tsc', '-p', tsconfig], { cwd: RAIZ, stdio: 'pipe' });
} catch (e) {
  console.error('tsc fallo al compilar:\n' + (e.stdout?.toString() ?? e.message));
  process.exit(1);
}

const instalarShim = (paquete, archivo) => {
  const dir = join(tmp, 'node_modules', paquete);
  mkdirSync(dir, { recursive: true });
  copyFileSync(join(AQUI, archivo), join(dir, 'index.js'));
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: paquete, version: '0.0.0-shim', main: 'index.js' }));
};
instalarShim('expo-sqlite', 'shim-expo-sqlite.cjs');
instalarShim('expo-crypto', 'shim-expo-crypto.cjs');

const req = createRequire(join(build, 'x.cjs'));
const O = req('./features/escaneo/openFoodFacts.js');

// --- corredor --------------------------------------------------------------

let ok = 0;
const fallos = [];
async function prueba(nombre, fn) {
  try {
    await fn();
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
function cierto(v, que) {
  if (!v) throw new Error(`${que}: esperaba algo verdadero, dio ${JSON.stringify(v)}`);
}

/** Una respuesta de /api/v2/product con lo minimo. */
const off = (product) => ({ status: 1, product });

// ---------------------------------------------------------------------------
// 1. Lectura de Open Food Facts
// ---------------------------------------------------------------------------

console.log('\nopen food facts');

await prueba('producto inexistente (status 0): no encontrado, sin rescate', () => {
  igual(O.normalizarProductoOff({ status: 0 }, '123'), { tipo: 'no_encontrado', rescate: { nombre: '', marca: null } }, 'lectura');
  igual(O.normalizarProductoOff(null, '123').tipo, 'no_encontrado', 'null');
});

await prueba('gaseosa: bebida, con vaso y envase entero', () => {
  const r = O.normalizarProductoOff(
    off({
      product_name: 'Coca-Cola Sabor Original',
      brands: 'Coca-Cola',
      quantity: '2.25 l',
      nutriments: { 'energy-kcal_100g': 42, proteins_100g: 0, carbohydrates_100g: 10.6, fat_100g: 0 },
      categories_tags: ['en:beverages', 'en:sodas'],
    }),
    '7790895000997',
  );
  igual(r.tipo, 'encontrado', 'tipo');
  const p = r.producto;
  igual([p.nombre, p.marca, p.kcal100g, p.carbos100g, p.macroFaltante], ['Coca-Cola Sabor Original', 'Coca-Cola', 42, 10.6, null], 'datos');
  igual(p.categoria, 'bebidas', 'categoria');
  igual(p.coccion, null, 'no se cocina');
  cierto(p.porciones.length >= 2, `porciones: ${JSON.stringify(p.porciones)}`);
  cierto(O.gramosPredeterminados(p.porciones) < 2250, 'nadie toma el envase entero de una');
});

await prueba('yogur con serving_size: la porcion del pote es la predeterminada', () => {
  const r = O.normalizarProductoOff(
    off({
      product_name: 'Yogur bebible frutilla',
      brands: 'La Serenísima',
      quantity: '190 g',
      serving_size: '1 pote (190 g)',
      nutriments: { 'energy-kcal_100g': 84, proteins_100g: 2.6, carbohydrates_100g: 14.2, fat_100g: 1.9 },
    }),
    '7790742000000',
  );
  igual(r.tipo, 'encontrado', 'tipo');
  igual(O.gramosPredeterminados(r.producto.porciones), 190, 'pote');
});

await prueba('fideos secos: se cocinan, base cruda con factor y porciones de paquete', () => {
  const r = O.normalizarProductoOff(
    off({
      product_name: 'Fideos tirabuzón',
      brands: 'Matarazzo',
      quantity: '500 g',
      nutriments: { 'energy-kcal_100g': 350, proteins_100g: 12, carbohydrates_100g: 72, fat_100g: 1.5 },
      categories_tags: ['en:cereals-and-potatoes', 'en:pastas', 'en:dry-pastas'],
    }),
    '7790070318831',
  );
  const p = r.producto;
  igual(p.coccion, { estado_base: 'crudo', factor_coccion: 2.35 }, 'coccion');
  igual(p.categoria, 'otros', 'no es bebida');
  igual(O.gramosPredeterminados(p.porciones), 80, 'porcion seca');
});

await prueba('sin kcal: no encontrado, pero conserva nombre y marca para cargarlo a mano', () => {
  const r = O.normalizarProductoOff(
    off({ product_name: 'Alfajor', brands: 'Jorgito', nutriments: { proteins_100g: 5 } }),
    '1',
  );
  igual(r, { tipo: 'no_encontrado', rescate: { nombre: 'Alfajor', marca: 'Jorgito' } }, 'rescate');
});

await prueba('faltan dos macros: no confiable, no encontrado', () => {
  const r = O.normalizarProductoOff(
    off({ product_name: 'Galletitas', nutriments: { 'energy-kcal_100g': 450, fat_100g: 18 } }),
    '2',
  );
  igual(r.tipo, 'no_encontrado', 'tipo');
});

await prueba('falta un macro: se muestra "sin dato", nunca 0 inventado', () => {
  const r = O.normalizarProductoOff(
    off({ product_name: 'Mermelada', nutriments: { 'energy-kcal_100g': 250, carbohydrates_100g: 60, fat_100g: 0 } }),
    '3',
  );
  igual([r.producto.proteina100g, r.producto.macroFaltante], [null, 'Proteina'], 'faltante');
});

await prueba('nombre en castellano si no hay product_name; un decimal en los macros', () => {
  const r = O.normalizarProductoOff(
    off({ product_name_es: 'Dulce de leche', nutriments: { 'energy-kcal_100g': 315.4, proteins_100g: 6.83, carbohydrates_100g: 55.27, fat_100g: 7.04 } }),
    '4',
  );
  igual([r.producto.nombre, r.producto.kcal100g, r.producto.proteina100g, r.producto.carbos100g], ['Dulce de leche', 315, 6.8, 55.3], 'datos');
});

await prueba('User-Agent con version y contacto; campos pedidos', () => {
  igual(O.userAgentOff('0.1.0'), 'Avanza/0.1.0 (contacto: contacto.pbdevhouse@gmail.com)', 'ua');
  for (const c of ['product_name', 'brands', 'nutriments', 'categories_tags', 'quantity', 'serving_size']) {
    cierto(O.CAMPOS_OFF.split(',').includes(c), c);
  }
  igual(O.TIMEOUT_OFF_MS, 8000, 'timeout');
});

// ---------------------------------------------------------------------------
// 2. consultarCodigo: base local, Open Food Facts, sin red
// ---------------------------------------------------------------------------

console.log('\nconsultar codigo');

const schema = req('./db/schema.js');
const qAlimentos = req('./db/queries/alimentos.js');
const C = req('./features/escaneo/consultarCodigo.js');

const logOriginal = console.log;
console.log = () => {};
await schema.initDb(':memory:');
console.log = logOriginal;

/** fetch falso: anota los pedidos y responde lo que se le pida. */
const pedidos = [];
let respuesta = null;
globalThis.fetch = async (url, opciones) => {
  pedidos.push({ url, opciones });
  if (respuesta instanceof Error) throw respuesta;
  return respuesta;
};
const resJson = (cuerpo, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => cuerpo });

await prueba('si esta en la base local, no sale a la red', async () => {
  await qAlimentos.guardarAlimento({
    id: 'local-1',
    nombre: 'Leche entera',
    marca: 'La Serenísima',
    codigo_barras: '111',
    kcal_por_100g: 62,
    proteina_g: 3,
    carbohidratos_g: 4.8,
    grasa_g: 3,
    fibra_g: null,
    fuente: 'open_food_facts',
    verificado: false,
    porciones: [{ nombre: '1 vaso', gramos: 200, predeterminada: true }],
    categoria: 'bebidas',
    categorias_revisadas: true,
  });
  pedidos.length = 0;
  const r = await C.consultarCodigo(' 111 ', '0.1.0');
  igual([r.tipo, r.producto?.nombre, r.revisarAlimentoId], ['detectado', 'Leche entera', null], 'local');
  igual(pedidos.length, 0, 'sin red');
});

await prueba('de Open Food Facts: lo guarda con su coccion y la proxima vez esta local', async () => {
  pedidos.length = 0;
  respuesta = resJson(
    off({
      product_name: 'Fideos mostachol',
      brands: 'Lucchetti',
      quantity: '500 g',
      nutriments: { 'energy-kcal_100g': 352, proteins_100g: 11.5, carbohydrates_100g: 73, fat_100g: 1.4 },
      categories_tags: ['en:dry-pastas'],
    }),
  );
  const r = await C.consultarCodigo('222', '0.1.0');
  igual(r.tipo, 'detectado', 'tipo');
  igual(pedidos.length, 1, 'un pedido');
  cierto(pedidos[0].url.includes('/api/v2/product/222.json?fields='), pedidos[0].url);
  igual(pedidos[0].opciones.headers['User-Agent'], 'Avanza/0.1.0 (contacto: contacto.pbdevhouse@gmail.com)', 'ua');

  const guardado = await qAlimentos.obtenerAlimentoPorCodigoBarras('222');
  igual([guardado.nombre, guardado.estado_base, guardado.factor_coccion, guardado.categorias_revisadas], ['Fideos mostachol', 'crudo', 2.35, 1], 'guardado');

  pedidos.length = 0;
  const otra = await C.consultarCodigo('222', '0.1.0');
  igual([otra.tipo, pedidos.length], ['detectado', 0], 'segunda vez local');
});

await prueba('codigo que no existe: no encontrado, y no guarda nada', async () => {
  respuesta = resJson({ status: 0, status_verbose: 'product not found' }, 404);
  const r = await C.consultarCodigo('333', '0.1.0');
  igual(r.tipo, 'no_encontrado', 'tipo');
  igual(await qAlimentos.obtenerAlimentoPorCodigoBarras('333'), null, 'sin fila');
});

await prueba('sin red y sin el producto en la base local: sin conexion', async () => {
  respuesta = new TypeError('Network request failed');
  const r = await C.consultarCodigo('444', '0.1.0');
  igual(r.tipo, 'sin_conexion', 'tipo');
});

await prueba('sin red pero con el producto guardado: lo encuentra igual', async () => {
  respuesta = new TypeError('Network request failed');
  const r = await C.consultarCodigo('222', '0.1.0');
  igual([r.tipo, r.producto?.nombre], ['detectado', 'Fideos mostachol'], 'offline');
});

// --- resultado -------------------------------------------------------------

rmSync(tmp, { recursive: true, force: true });
console.log(`\n${ok} pasan, ${fallos.length} fallan`);
if (fallos.length) {
  for (const f of fallos) console.log('  -', f);
  process.exit(1);
}
