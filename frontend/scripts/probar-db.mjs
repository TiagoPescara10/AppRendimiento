// Pruebas de la capa de datos, contra los modulos REALES de src/db/.
//
//   node scripts/probar-db.mjs
//
// Compila src/db/ con tsc a un directorio temporal, resuelve 'expo-sqlite' al
// shim sobre node:sqlite y ejercita las funciones de verdad: initDb(),
// las migraciones y las queries. Importar los modulos es la parte que importa:
// una version anterior de estas pruebas leia el SQL con una regex sobre el
// archivo, y por eso no vio un ciclo de imports que dejaba el DDL en undefined
// y hacia fallar initDb() en el dispositivo.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, '..');

// --- compilar src/db a CommonJS en un temporal -----------------------------

const tmp = mkdtempSync(join(tmpdir(), 'probar-db-'));
const build = join(tmp, 'build');

const tsconfig = join(tmp, 'tsconfig.json');
writeFileSync(
  tsconfig,
  JSON.stringify({
    compilerOptions: {
      target: 'ES2022',
      module: 'commonjs',
      moduleResolution: 'node',
      esModuleInterop: true,
      skipLibCheck: true,
      strict: false,
      outDir: build,
      rootDir: join(RAIZ, 'src/db'),
      types: [],
    },
    include: [join(RAIZ, 'src/db/**/*.ts')],
  }),
);

try {
  execFileSync('npx', ['tsc', '-p', tsconfig], { cwd: RAIZ, stdio: 'pipe' });
} catch (e) {
  console.error('tsc fallo al compilar src/db:\n' + (e.stdout?.toString() ?? e.message));
  process.exit(1);
}

// Los modulos nativos se resuelven subiendo desde build/ hasta el node_modules
// del temporal. Si src/db/ empieza a importar otro, hay que sumarlo aca: sin
// shim el harness no falla en una prueba, muere al cargar.
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
  if (actual !== esperado) {
    throw new Error(`${que}: esperaba ${JSON.stringify(esperado)}, dio ${JSON.stringify(actual)}`);
  }
}

async function lanza(fn, patron, que) {
  try {
    await fn();
  } catch (e) {
    if (patron.test(e.message)) return;
    throw new Error(`${que}: lanzo "${e.message}", no matchea ${patron}`);
  }
  throw new Error(`${que}: no lanzo nada`);
}

// --- las pruebas -----------------------------------------------------------

console.log('capa de datos (modulos reales):');

const schema = req('./schema.js');
const migrations = req('./migrations/index.js');
const meta = req('./meta.js');
const qPerfil = req('./queries/perfil.js');
const qPeso = req('./queries/peso.js');
const qComidas = req('./queries/comidas.js');
const qAlimentos = req('./queries/alimentos.js');
const qEventos = req('./queries/eventos.js');
const qSueno = req('./queries/sueno.js');
const qEnergia = req('./queries/energia.js');
const semillas = req('./seeds/alimentos.js');

// El ciclo de imports se manifiesta aca: si schema -> migrations -> 00N -> schema,
// el literal queda congelado en undefined al construirse el objeto.
await prueba('el SQL de cada migracion es un string no vacio', () => {
  for (const m of migrations.migraciones) {
    if (typeof m.sql !== 'string') {
      throw new Error(`migracion ${m.version} tiene sql de tipo ${typeof m.sql} (ciclo de imports?)`);
    }
    if (m.sql.trim().length === 0) throw new Error(`migracion ${m.version} tiene sql vacio`);
  }
});

await prueba('getDb() lanza antes de initDb()', () =>
  lanza(() => schema.getDb(), /no inicializada/i, 'getDb'),
);

await prueba('initDb() abre y migra una base en memoria', async () => {
  const db = await schema.initDb(':memory:');
  const v = await db.getFirstAsync('PRAGMA user_version');
  igual(v.user_version, migrations.VERSION_ESQUEMA, 'user_version');
});

await prueba('las 9 tablas existen', async () => {
  const filas = await schema
    .getDb()
    .getAllAsync("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
  const nombres = filas.map((f) => f.name);
  const esperadas = [
    'alimento', 'comida', 'evento', 'item_comida', 'meta',
    'perfil', 'registro_energia', 'registro_peso', 'registro_sueno',
  ];
  igual(nombres.join(','), esperadas.join(','), 'tablas');
});

// --- semilla de alimentos ---------------------------------------------------

await prueba('la semilla cargo el catalogo entero', async () => {
  const r = await schema.getDb().getFirstAsync(
    "SELECT count(*) AS n FROM alimento WHERE fuente = 'manual' AND verificado = 1");
  igual(r.n, 318, 'alimentos sembrados');
});

await prueba('la semilla dejo su marca de version en meta', async () => {
  const v = await meta.leerMeta(schema.getDb(), 'semilla_alimentos');
  igual(v, String(semillas.VERSION_SEMILLA), 'marca de semilla');
});

// El contrato del modulo: el JSON no sale de queries/alimentos.ts.
await prueba('las porciones vuelven como array, no como string', async () => {
  const r = await qAlimentos.buscarAlimentosPorNombre('Milanesa de carne frita', 1);
  igual(r.length, 1, 'encontrada');
  igual(Array.isArray(r[0].porciones), true, 'porciones es array');
  igual(r[0].porciones.length, 3, 'cuantas porciones');
  igual(r[0].categoria, 'carnes', 'categoria');
  const pre = r[0].porciones.filter((p) => p.predeterminada);
  igual(pre.length, 1, 'porciones predeterminadas');
  igual(pre[0].gramos, 130, 'gramos de la predeterminada');
});

await prueba('un JSON de porciones roto devuelve [] en vez de tirar', async () => {
  await schema.getDb().runAsync(
    "UPDATE alimento SET porciones = '{esto no es json' WHERE nombre = 'Vacio'");
  const r = await qAlimentos.buscarAlimentosPorNombre('Vacio', 1);
  igual(Array.isArray(r[0].porciones), true, 'porciones es array');
  igual(r[0].porciones.length, 0, 'porciones de una fila rota');
});

await prueba('sembrarAlimentos() de nuevo no inserta ni duplica', async () => {
  const n = await semillas.sembrarAlimentos(schema.getDb());
  igual(n, 0, 'filas insertadas en la segunda corrida');
  const dup = await schema.getDb().getAllAsync(
    'SELECT nombre FROM alimento GROUP BY nombre HAVING count(*) > 1');
  igual(dup.length, 0, 'nombres duplicados');
});

// La fuga que motivo el marcador: con el atajo viejo (contar filas manuales y
// verificadas) un homonimo del usuario dejaba el conteo corto para siempre, y
// el seed volvia a preparar los 318 statements en cada arranque.
await prueba('un homonimo del usuario no vuelve a disparar la semilla', async () => {
  await qAlimentos.guardarAlimento({
    id: 'homonimo', nombre: 'Milanesa de carne frita', kcal_por_100g: 999, fuente: 'manual',
  });
  const n = await semillas.sembrarAlimentos(schema.getDb());
  igual(n, 0, 'filas insertadas con el homonimo presente');
  const mia = await qAlimentos.obtenerAlimento('homonimo');
  igual(mia.kcal_por_100g, 999, 'los valores del usuario siguen ahi');
  await qAlimentos.eliminarAlimento('homonimo');
});

// El marcador dice "el lote corrio", no "las filas estan". Borrar es una
// decision del usuario y el proximo arranque no la revierte.
await prueba('un alimento sembrado que el usuario borra no revive', async () => {
  const antes = await qAlimentos.buscarAlimentosPorNombre('Pizza de muzzarella', 1);
  await qAlimentos.eliminarAlimento(antes[0].id);
  const n = await semillas.sembrarAlimentos(schema.getDb());
  igual(n, 0, 'filas insertadas tras el borrado');
  const despues = await qAlimentos.buscarAlimentosPorNombre('Pizza de muzzarella', 1);
  igual(despues.length, 0, 'no revivio');
});

await prueba('migrar() es idempotente', async () => {
  const v = await migrations.migrar(schema.getDb());
  igual(v, migrations.VERSION_ESQUEMA, 'version tras re-migrar');
});

// --- perfil: el onboarding progresivo --------------------------------------

await prueba('crearPerfil() con solo lo obligatorio (onboarding paso 0)', async () => {
  const p = await qPerfil.crearPerfil({ id: 'u1', fecha_alta: '2026-08-31T10:00:00-03:00' });
  igual(p.id, 'u1', 'id');
  igual(p.nombre, null, 'nombre');
  igual(p.sexo_biologico, null, 'sexo_biologico');
});

await prueba('actualizarPerfil() solo toca las claves presentes', async () => {
  await qPerfil.actualizarPerfil('u1', { nombre: 'Tiago', altura_cm: 178 });
  const p = await qPerfil.obtenerPerfilLocal();
  igual(p.nombre, 'Tiago', 'nombre');
  igual(p.altura_cm, 178, 'altura_cm');
  igual(p.objetivo, null, 'objetivo intacto');
});

await prueba('actualizarPerfil() sin cambios no rompe', async () => {
  await qPerfil.actualizarPerfil('u1', {});
});

await prueba('el CHECK rechaza un objetivo invalido', () =>
  lanza(
    () => schema.getDb().runAsync("UPDATE perfil SET objetivo = 'volar' WHERE id = 'u1'"),
    /CHECK/i,
    'objetivo invalido',
  ),
);

// --- comidas ---------------------------------------------------------------

await prueba('comida.fecha se genera del dia LOCAL, no de UTC', async () => {
  const c = await qComidas.crearComida({
    id: 'c1', usuario_id: 'u1',
    fecha_hora: '2026-08-31T22:30:00-03:00', tipo: 'cena',
  });
  igual(c.fecha, '2026-08-31', 'fecha generada');
});

// Se cuenta el delta, no el total: la semilla ya dejo sus filas sin codigo.
await prueba('guardarAlimento() sin codigo de barras inserta siempre', async () => {
  const antes = await schema.getDb().getFirstAsync('SELECT count(*) AS n FROM alimento WHERE codigo_barras IS NULL');
  await qAlimentos.guardarAlimento({ id: 'a1', nombre: 'Milanesa casera', kcal_por_100g: 220, fuente: 'manual' });
  await qAlimentos.guardarAlimento({ id: 'a2', nombre: 'Pure casero', kcal_por_100g: 90, fuente: 'manual' });
  const despues = await schema.getDb().getFirstAsync('SELECT count(*) AS n FROM alimento WHERE codigo_barras IS NULL');
  igual(despues.n - antes.n, 2, 'alimentos sin codigo agregados');
});

// Este es el caso del indice unico parcial: el ON CONFLICT necesita repetir el
// WHERE del indice. Antes se probaba con una copia del SQL, no con la funcion.
await prueba('guardarAlimento() hace UPSERT por codigo de barras', async () => {
  await qAlimentos.guardarAlimento({
    id: 'a3', nombre: 'Yogur', marca: 'Sancor', codigo_barras: '7790',
    kcal_por_100g: 60, fuente: 'open_food_facts',
  });
  const segundo = await qAlimentos.guardarAlimento({
    id: 'a4', nombre: 'Yogur descremado', marca: 'Sancor', codigo_barras: '7790',
    kcal_por_100g: 45, fuente: 'open_food_facts', verificado: true,
  });
  igual(segundo.id, 'a3', 'conserva el id original');
  igual(segundo.nombre, 'Yogur descremado', 'actualizo el nombre');
  igual(segundo.verificado, 1, 'actualizo verificado');
  const r = await schema.getDb().getAllAsync("SELECT id FROM alimento WHERE codigo_barras = '7790'");
  igual(r.length, 1, 'filas con ese codigo');
});

await prueba('listarItemsConAlimento() trae el JOIN', async () => {
  await qComidas.agregarItem({ id: 'i1', comida_id: 'c1', alimento_id: 'a1', cantidad_g: 150 });
  const items = await qComidas.listarItemsConAlimento('c1');
  igual(items.length, 1, 'cantidad de items');
  igual(items[0].alimento_nombre, 'Milanesa casera', 'nombre del alimento');
  igual(items[0].cantidad_g, 150, 'cantidad_g');
});

await prueba('listarComidasPorFecha() usa el dia local', async () => {
  const c = await qComidas.listarComidasPorFecha('u1', '2026-08-31');
  igual(c.length, 1, 'comidas del dia');
});

await prueba('eliminarComida() arrastra sus items (CASCADE)', async () => {
  await qComidas.eliminarComida('c1');
  const items = await qComidas.listarItems('c1');
  igual(items.length, 0, 'items huerfanos');
});

await prueba('no se puede borrar un alimento en uso (RESTRICT)', async () => {
  await qComidas.crearComida({ id: 'c2', usuario_id: 'u1', fecha_hora: '2026-08-31T13:00:00-03:00', tipo: 'almuerzo' });
  await qComidas.agregarItem({ id: 'i2', comida_id: 'c2', alimento_id: 'a2', cantidad_g: 200 });
  await lanza(() => qAlimentos.eliminarAlimento('a2'), /FOREIGN KEY/i, 'alimento en uso');
});

// --- peso, eventos, sueno, energia -----------------------------------------

await prueba('ultimoPeso() devuelve el mas reciente', async () => {
  await qPeso.crearRegistroPeso({ id: 'p1', usuario_id: 'u1', peso_kg: 80, fecha: '2026-08-01', fuente: 'manual' });
  await qPeso.crearRegistroPeso({ id: 'p2', usuario_id: 'u1', peso_kg: 78.5, fecha: '2026-08-30', fuente: 'balanza' });
  const u = await qPeso.ultimoPeso('u1');
  igual(u.peso_kg, 78.5, 'peso');
});

await prueba('proximosEventos() respeta la ventana', async () => {
  await qEventos.crearEvento({
    id: 'e1', usuario_id: 'u1', tipo: 'partido',
    fecha_hora_inicio: '2026-08-31T18:00:00-03:00', intensidad: 'alta',
  });
  await qEventos.crearEvento({
    id: 'e2', usuario_id: 'u1', tipo: 'gimnasio',
    fecha_hora_inicio: '2026-09-05T09:00:00-03:00', intensidad: 'media',
  });
  const dentro = await qEventos.proximosEventos('u1', '2026-08-31T00:00:00-03:00', '2026-09-01T00:00:00-03:00');
  igual(dentro.length, 1, 'eventos en la ventana');
  igual(dentro[0].id, 'e1', 'cual');
});

await prueba('guardarSueno() pisa la misma noche en vez de duplicar', async () => {
  await qSueno.guardarSueno({ id: 's1', usuario_id: 'u1', fecha: '2026-08-30', duracion_min: 380, calidad_percibida: 3, fuente: 'manual' });
  const segundo = await qSueno.guardarSueno({ id: 's2', usuario_id: 'u1', fecha: '2026-08-30', duracion_min: 420, calidad_percibida: 4, fuente: 'manual' });
  igual(segundo.id, 's1', 'conserva el id');
  igual(segundo.duracion_min, 420, 'duracion actualizada');
  const todos = await qSueno.listarSuenoPorRango('u1', '2026-08-01', '2026-08-31');
  igual(todos.length, 1, 'filas para esa noche');
});

await prueba('guardarEnergia() separa por momento del dia', async () => {
  await qEnergia.guardarEnergia({ id: 'g1', usuario_id: 'u1', fecha: '2026-08-31', nivel: 3, momento: 'tarde' });
  const pisado = await qEnergia.guardarEnergia({ id: 'g2', usuario_id: 'u1', fecha: '2026-08-31', nivel: 5, momento: 'tarde' });
  await qEnergia.guardarEnergia({ id: 'g3', usuario_id: 'u1', fecha: '2026-08-31', nivel: 2, momento: 'noche' });
  igual(pisado.id, 'g1', 'conserva el id');
  igual(pisado.nivel, 5, 'nivel actualizado');
  const delDia = await qEnergia.listarEnergiaPorFecha('u1', '2026-08-31');
  igual(delDia.length, 2, 'registros del dia');
});

await prueba('el CHECK rechaza un nivel de energia fuera de 1-5', () =>
  lanza(
    () => qEnergia.guardarEnergia({ id: 'g9', usuario_id: 'u1', fecha: '2026-08-29', nivel: 9, momento: 'manana' }),
    /CHECK/i,
    'nivel 9',
  ),
);

await prueba('borrar el perfil arrastra todo lo suyo (CASCADE)', async () => {
  await qPerfil.eliminarPerfil('u1');
  for (const t of ['comida', 'registro_sueno', 'registro_energia', 'registro_peso', 'evento']) {
    const r = await schema.getDb().getFirstAsync(`SELECT count(*) AS n FROM ${t}`);
    igual(r.n, 0, `${t} tras borrar el perfil`);
  }
});

await prueba('cerrarDb() deja getDb() lanzando otra vez', async () => {
  await schema.cerrarDb();
  await lanza(() => schema.getDb(), /no inicializada/i, 'getDb tras cerrar');
});

// --- dos arranques sobre el mismo archivo -----------------------------------
//
// Lo anterior corre en :memory:, donde cada initDb() abre una base nueva. Esto
// es lo mas parecido al telefono que se puede hacer sin telefono: instalar,
// cerrar la app, abrirla de nuevo, y que la semilla no vuelva a trabajar.

const archivo = join(tmp, 'dos-arranques.db');

await prueba('primer arranque sobre archivo: siembra', async () => {
  await schema.initDb(archivo);
  const r = await schema.getDb().getFirstAsync('SELECT count(*) AS n FROM alimento');
  igual(r.n, 318, 'alimentos tras instalar');
  await schema.cerrarDb();
});

await prueba('segundo arranque: sale por el marcador, sin tocar el catalogo', async () => {
  const db = await schema.initDb(archivo);
  igual(await semillas.sembrarAlimentos(db), 0, 'filas insertadas');
  const r = await schema.getDb().getFirstAsync('SELECT count(*) AS n FROM alimento');
  igual(r.n, 318, 'alimentos tras reabrir');
  const v = await schema.getDb().getFirstAsync('PRAGMA user_version');
  igual(v.user_version, migrations.VERSION_ESQUEMA, 'user_version');
  await schema.cerrarDb();
});

// --- salida ----------------------------------------------------------------

rmSync(tmp, { recursive: true, force: true });

console.log(`\n${ok} pasan, ${fallos.length} fallan`);
if (fallos.length) {
  for (const f of fallos) console.log('  -', f);
  process.exit(1);
}
