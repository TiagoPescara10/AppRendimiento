// Pruebas de registrar comida con una foto, contra los modulos REALES.
//
//   node scripts/probar-foto.mjs
//
// Tres partes:
//   1. respuesta.ts: el contrato con la Edge Function, con respuestas
//      inventadas (no se llama a la funcion ni al modelo).
//   2. emparejar.ts: de "milanesa, 200 g, cocido" a un alimento del catalogo.
//      Con un catalogo chico armado aca y con el catalogo REAL de la semilla,
//      que es contra el que va a emparejar la app.
//   3. crearComidaConItems: la comida y sus items en una sola transaccion.

process.env.TZ = 'America/Argentina/Buenos_Aires';

import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, '..');

// --- compilar a CommonJS en un temporal ------------------------------------

const tmp = mkdtempSync(join(tmpdir(), 'probar-foto-'));
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
    // Archivos sueltos de foto y no el glob: api.ts importa expo y fetch.
    include: [
      join(RAIZ, 'src/db/**/*.ts'),
      join(RAIZ, 'src/features/foto/respuesta.ts'),
      join(RAIZ, 'src/features/foto/emparejar.ts'),
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
  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify({ name: paquete, version: '0.0.0-shim', main: 'index.js' }),
  );
};

instalarShim('expo-sqlite', 'shim-expo-sqlite.cjs');
instalarShim('expo-crypto', 'shim-expo-crypto.cjs');

const req = createRequire(join(build, 'x.cjs'));
const R = req('./features/foto/respuesta.js');
const E = req('./features/foto/emparejar.js');

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

function cierto(valor, que) {
  if (!valor) throw new Error(`${que}: esperaba algo verdadero, dio ${JSON.stringify(valor)}`);
}

async function lanza(fn, que) {
  try {
    await fn();
  } catch {
    return;
  }
  throw new Error(`${que}: esperaba que tirara`);
}

const item = (nombre, gramos = 100, estado = null, confianza = 'alta') => ({
  nombre,
  gramos,
  estado,
  confianza,
});

// ---------------------------------------------------------------------------
// 1. Respuesta de la funcion
// ---------------------------------------------------------------------------

console.log('\nrespuesta');

await prueba('una respuesta valida pasa, con gramos redondeados', () => {
  const r = R.validarRespuestaFoto({
    items: [
      { nombre: ' milanesa ', gramos: 200.4, estado: 'cocido', confianza: 'alta' },
      { nombre: 'agua', gramos: 250, estado: null, confianza: 'media' },
    ],
    restantes: 3,
  });
  igual(r, {
    items: [
      { nombre: 'milanesa', gramos: 200, estado: 'cocido', confianza: 'alta' },
      { nombre: 'agua', gramos: 250, estado: null, confianza: 'media' },
    ],
    restantes: 3,
  }, 'respuesta');
});

await prueba('lista vacia es valida (no habia comida en la foto)', () => {
  igual(R.validarRespuestaFoto({ items: [], restantes: 4 }), { items: [], restantes: 4 }, 'vacia');
});

await prueba('lo que no cumple el contrato da null', () => {
  const base = { nombre: 'pan', gramos: 50, estado: null, confianza: 'alta' };
  const casos = {
    'sin items': { restantes: 1 },
    'items no es lista': { items: 'pan', restantes: 1 },
    'sin restantes': { items: [] },
    'gramos texto': { items: [{ ...base, gramos: '50' }], restantes: 1 },
    'gramos cero': { items: [{ ...base, gramos: 0 }], restantes: 1 },
    'gramos de mas': { items: [{ ...base, gramos: 5000 }], restantes: 1 },
    'estado frito': { items: [{ ...base, estado: 'frito' }], restantes: 1 },
    'confianza rara': { items: [{ ...base, confianza: 'mucha' }], restantes: 1 },
    'nombre vacio': { items: [{ ...base, nombre: '  ' }], restantes: 1 },
    'con kcal': { items: [{ ...base, gramos: NaN }], restantes: 1 },
    'demasiados': { items: Array(16).fill(base), restantes: 1 },
  };
  for (const [que, crudo] of Object.entries(casos)) {
    igual(R.validarRespuestaFoto(crudo), null, que);
  }
  igual(R.validarRespuestaFoto(null), null, 'null');
  igual(R.validarRespuestaFoto('hola'), null, 'texto');
});

await prueba('los codigos de error de la funcion se traducen', () => {
  igual(R.errorDeCodigo('LIMITE_SEMANAL'), 'limite_semanal', 'semanal');
  igual(R.errorDeCodigo('LIMITE_GLOBAL'), 'limite_global', 'global');
  igual(R.errorDeCodigo('IMAGEN_GRANDE'), 'imagen_grande', 'grande');
  igual(R.errorDeCodigo('ANALISIS_FALLIDO'), 'fallo', 'fallido');
  igual(R.errorDeCodigo(undefined), 'fallo', 'sin codigo');
  igual(R.MENSAJE_ERROR_FOTO.limite_semanal, 'Llegaste al límite de fotos de esta semana.', 'texto');
});

// ---------------------------------------------------------------------------
// 2. Emparejar
// ---------------------------------------------------------------------------

console.log('\nemparejar');

await prueba('normalizar y singular', () => {
  igual(E.normalizar('  Puré de PAPAS! '), 'pure de papas', 'normalizar');
  const casos = {
    papas: 'papa', tomates: 'tomate', panes: 'pan', limones: 'limon', nueces: 'nuez',
    fideos: 'fideo', arroz: 'arroz', huevos: 'huevo', flanes: 'flan', cereales: 'cereal',
    mas: 'mas', pan: 'pan',
  };
  for (const [p, s] of Object.entries(casos)) igual(E.singular(p), s, p);
  igual(E.clave('Puré de papas con manteca'), 'pure papa manteca', 'clave');
});

let n = 0;
const al = (nombre, extra = {}) => ({
  id: `a${++n}`,
  nombre,
  verificado: 1,
  estado_base: null,
  factor_coccion: null,
  ...extra,
});

const CHICO = [
  al('Milanesa de carne frita'),
  al('Milanesa de soja'),
  al('Milanesa suiza'),
  al('Puré de papa'),
  al('Huevo duro'),
  al('Fideos secos', { estado_base: 'crudo', factor_coccion: 2.35 }),
  al('Arroz blanco cocido', { estado_base: 'cocido', factor_coccion: 2.81 }),
  al('Lechuga'),
  al('Tomate'),
];
const porNombre = (nombre) => CHICO.find((a) => a.nombre === nombre);

await prueba('coincidencia exacta', () => {
  const r = E.emparejarItem(item('Milanesa de carne frita', 200), CHICO);
  igual(r.alimento?.nombre, 'Milanesa de carne frita', 'alimento');
  igual(r.cantidad_g, 200, 'gramos');
  igual(r.revisar, false, 'no hay que revisar');
  igual(E.puntaje('Milanesa de carne frita', 'milanesa de CARNE frita'), 1, 'puntaje 1');
});

await prueba('plural: "huevos duros" encuentra "Huevo duro"', () => {
  igual(E.emparejarItem(item('huevos duros'), CHICO).alimento?.nombre, 'Huevo duro', 'huevo');
  igual(E.emparejarItem(item('tomates'), CHICO).alimento?.nombre, 'Tomate', 'tomate');
});

await prueba('sin tilde: "pure de papas" encuentra "Puré de papa"', () => {
  const r = E.emparejarItem(item('pure de papas', 150, 'cocido'), CHICO);
  igual(r.alimento?.nombre, 'Puré de papa', 'pure');
  igual(E.puntaje('pure de papas', 'Puré de papa'), 1, 'exacta despues de normalizar');
});

await prueba('"milanesa" a secas va a la de carne y no a la de soja', () => {
  const r = E.emparejarItem(item('milanesa', 200, 'cocido'), CHICO);
  igual(r.alimento?.nombre, 'Milanesa de carne frita', 'generico');
  igual(r.alternativas.length, 2, 'dos alternativas');
  cierto(!r.alternativas.some((a) => a.id === r.alimento.id), 'el elegido no se repite');
  cierto(r.alternativas.every((a) => a.nombre.startsWith('Milanesa')), 'alternativas parecidas');
});

await prueba('crudo/cocido: fideos cocidos contra base seca se dividen por el factor', () => {
  const r = E.emparejarItem(item('fideos', 300, 'cocido'), CHICO);
  igual(r.alimento?.nombre, 'Fideos secos', 'alimento');
  igual(r.cantidad_g, 128, '300 / 2,35');
  igual(r.carga, { estado_carga: 'cocido', cantidad_ingresada_g: 300 }, 'se guarda lo pesado');
});

await prueba('crudo/cocido: arroz crudo contra base cocida se multiplica', () => {
  const r = E.emparejarItem(item('arroz', 100, 'crudo'), CHICO);
  igual(r.alimento?.nombre, 'Arroz blanco cocido', 'alimento');
  igual(r.cantidad_g, 281, '100 x 2,81');
  igual(r.carga, { estado_carga: 'crudo', cantidad_ingresada_g: 100 }, 'carga');
});

await prueba('crudo/cocido: mismo estado, sin estado o sin factor no convierten', () => {
  const mismo = E.emparejarItem(item('arroz', 200, 'cocido'), CHICO);
  igual([mismo.cantidad_g, mismo.carga], [200, null], 'mismo estado');
  const sinEstado = E.emparejarItem(item('fideos', 300, null), CHICO);
  igual([sinEstado.cantidad_g, sinEstado.carga], [300, null], 'sin estado');
  const sinFactor = E.emparejarItem(item('lechuga', 80, 'crudo'), CHICO);
  igual([sinFactor.cantidad_g, sinFactor.carga], [80, null], 'sin factor');
});

await prueba('nada parecido: queda sin emparejar y para revisar', () => {
  const r = E.emparejarItem(item('sushi de salmón', 180), CHICO);
  igual(r.alimento, null, 'sin alimento');
  igual(r.revisar, true, 'revisar');
  igual(r.cantidad_g, 180, 'conserva los gramos');
});

await prueba('confianza baja se marca para revisar aunque empareje', () => {
  const r = E.emparejarItem(item('lechuga', 50, 'crudo', 'baja'), CHICO);
  igual(r.alimento?.nombre, 'Lechuga', 'empareja');
  igual(r.revisar, true, 'revisar');
});

await prueba('"Cambiar": aplicarAlimento recalcula la conversion con el alimento nuevo', () => {
  const it = item('fideos', 300, 'cocido');
  const r = E.aplicarAlimento(it, porNombre('Lechuga'));
  igual([r.cantidad_g, r.carga, r.revisar], [300, null, false], 'sin factor');
  const s = E.aplicarAlimento(it, porNombre('Fideos secos'));
  igual(s.cantidad_g, 128, 'vuelve a convertir');
});

await prueba('emparejar mantiene el orden de los items', () => {
  const r = E.emparejar([item('tomate'), item('milanesa'), item('sushi')], CHICO);
  igual(r.map((x) => x.alimento?.nombre ?? null), ['Tomate', 'Milanesa de carne frita', null], 'orden');
});

// --- contra el catalogo real -------------------------------------------------

const schema = req('./db/schema.js');
const qAlimentos = req('./db/queries/alimentos.js');
const qComidas = req('./db/queries/comidas.js');
const qPerfil = req('./db/queries/perfil.js');

const logOriginal = console.log;
console.log = () => {}; // el seed avisa cuantas filas cargo
await schema.initDb(':memory:');
console.log = logOriginal;

const CATALOGO = await qAlimentos.listarAlimentosParaEmparejar();

await prueba('el catalogo real se lee entero', () => {
  cierto(CATALOGO.length > 500, `filas: ${CATALOGO.length}`);
  cierto(CATALOGO.every((a) => Array.isArray(a.porciones)), 'porciones parseadas');
});

await prueba('catalogo real: lo que devolvio la foto de prueba (milanesa con pure)', () => {
  const r = E.emparejar(
    [
      item('puré de papa', 150, 'cocido'),
      item('milanesa', 200, 'cocido'),
      item('milanesa rebozada', 200, 'cocido'),
    ],
    CATALOGO,
  );
  igual(r.map((x) => x.alimento?.nombre), [
    'Pure de papas',
    'Milanesa de carne frita',
    'Milanesa de carne frita',
  ], 'alimentos');
});

await prueba('catalogo real: genericos y nada parecido', () => {
  const nombres = (s) => E.emparejarItem(item(s), CATALOGO).alimento?.nombre ?? null;
  igual(nombres('fideos'), 'Fideos cocidos', 'fideos');
  igual(nombres('arroz'), 'Arroz blanco cocido', 'arroz');
  igual(nombres('papas fritas'), 'Papas fritas', 'papas fritas');
  igual(nombres('xyzzy'), null, 'nada');
});

// ---------------------------------------------------------------------------
// 3. Guardar en una transaccion
// ---------------------------------------------------------------------------

console.log('\nguardar');

await qPerfil.crearPerfil({ id: 'u1', fecha_alta: '2026-10-01T10:00:00-03:00' });
const comidaBase = (id) => ({
  id,
  usuario_id: 'u1',
  tipo: 'almuerzo',
  fecha_hora: '2026-10-06T13:00:00-03:00',
});

await prueba('crearComidaConItems guarda la comida y todos los items', async () => {
  const [a, b] = CATALOGO;
  const c = await qComidas.crearComidaConItems(comidaBase('c1'), [
    { id: 'i1', alimento_id: a.id, cantidad_g: 150 },
    { id: 'i2', alimento_id: b.id, cantidad_g: 128, carga: { estado_carga: 'cocido', cantidad_ingresada_g: 300 } },
  ]);
  igual(c.id, 'c1', 'comida');
  const items = await qComidas.listarItems('c1');
  igual(items.length, 2, 'items');
  const i2 = items.find((i) => i.id === 'i2');
  igual([i2.estado_carga, i2.cantidad_ingresada_g], ['cocido', 300], 'carga guardada');
});

await prueba('si un item falla, no queda nada: ni la comida ni los items anteriores', async () => {
  await lanza(
    () =>
      qComidas.crearComidaConItems(comidaBase('c2'), [
        { id: 'i3', alimento_id: CATALOGO[0].id, cantidad_g: 100 },
        { id: 'i4', alimento_id: 'no-existe', cantidad_g: 100 },
      ]),
    'alimento inexistente',
  );
  igual(await qComidas.obtenerComida('c2'), null, 'sin comida');
  igual((await qComidas.listarItems('c2')).length, 0, 'sin items');
});

await prueba('una comida sin items no se guarda', async () => {
  await lanza(() => qComidas.crearComidaConItems(comidaBase('c3'), []), 'vacia');
  igual(await qComidas.obtenerComida('c3'), null, 'sin comida');
});

// --- resultado -------------------------------------------------------------

rmSync(tmp, { recursive: true, force: true });

console.log(`\n${ok} ok, ${fallos.length} fallaron`);
if (fallos.length) {
  for (const f of fallos) console.log('  -', f);
  process.exit(1);
}
