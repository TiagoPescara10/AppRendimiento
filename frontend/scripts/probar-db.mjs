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

// Zona horaria fija, antes de cualquier Date. Sin esto, las pruebas que
// verifican que la fecha sale del dia LOCAL y no de UTC pasan por casualidad
// en una maquina en UTC: es justo el bug que buscan. La zona es la del
// proyecto, y es la que aparece en los fixtures (-03:00).
process.env.TZ = 'America/Argentina/Buenos_Aires';

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
      // TS 6 (SDK 56) convirtio en error el deprecado de node10. Mantener la
      // resolucion tal cual es deliberado: estas pruebas existen para cargar
      // el grafo de imports real. Migrar a node16/bundler antes de TS 7.
      ignoreDeprecations: '6.0',
      esModuleInterop: true,
      skipLibCheck: true,
      strict: false,
      outDir: build,
      // rootDir es src/ y no src/db/ porque features/agenda/ tambien entra:
      // materializar.ts es codigo que se prueba, no una pantalla. La salida
      // queda en build/db/ y build/features/, de ahi los require de abajo.
      rootDir: join(RAIZ, 'src'),
      types: [],
    },
    include: [
      join(RAIZ, 'src/db/**/*.ts'),
      join(RAIZ, 'src/features/agenda/**/*.ts'),
      // Archivo suelto y no el glob de features/entrenamiento/: sonidos.ts y
      // los componentes de esa carpeta importan expo-audio y React, que no se
      // pueden cargar en node. temporizador.ts entra igual, arrastrado por el
      // import de guardarSesion.ts, y es puro.
      join(RAIZ, 'src/features/entrenamiento/guardarSesion.ts'),
      join(RAIZ, 'src/features/entrenamiento/guardarRutina.ts'),
      join(RAIZ, 'src/features/comidas/porciones.ts'),
    ],
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

const schema = req('./db/schema.js');
const migrations = req('./db/migrations/index.js');
const meta = req('./db/meta.js');
const qPerfil = req('./db/queries/perfil.js');
const qPeso = req('./db/queries/peso.js');
const qComidas = req('./db/queries/comidas.js');
const qAlimentos = req('./db/queries/alimentos.js');
const qEventos = req('./db/queries/eventos.js');
const qRutinas = req('./db/queries/rutinas.js');
const qSueno = req('./db/queries/sueno.js');
const qEnergia = req('./db/queries/energia.js');
const qAgua = req('./db/queries/agua.js');
const semillas = req('./db/seeds/alimentos.js');
const alimentosAr = req('./db/seeds/alimentos-ar.js');
const alimentosLote2 = req('./db/seeds/alimentos-ar-lote2.js');
const alimentosLote3 = req('./db/seeds/alimentos-ar-lote3.js');
const agenda = req('./features/agenda/materializar.js');
const rutinasHelper = req('./features/agenda/rutinas.js');
const qSesiones = req('./db/queries/sesiones.js');
const qEjercicios = req('./db/queries/ejercicios.js');
const qRutinasGimnasio = req('./db/queries/rutinasGimnasio.js');
const semillaRutinas = req('./db/seeds/rutinas-predefinidas.js');
const rutinasBase = req('./db/seeds/rutinas-predefinidas-base.js');
const ejerciciosBase = req('./db/seeds/ejercicios-base.js');
const formato = req('./features/agenda/formato.js');
const entrenamiento = req('./features/entrenamiento/guardarSesion.js');
const guardarRutina = req('./features/entrenamiento/guardarRutina.js');
const T = req('./features/entrenamiento/temporizador.js');
const fPorciones = req('./features/comidas/porciones.js');

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

await prueba('las 18 tablas existen (rutina_gimnasio_dia eliminada en v14)', async () => {
  const filas = await schema
    .getDb()
    .getAllAsync("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
  const nombres = filas.map((f) => f.name);
  const esperadas = [
    'alimento', 'comida', 'ejercicio', 'evento', 'item_comida', 'meta',
    'perfil', 'registro_agua', 'registro_energia', 'registro_peso', 'registro_sueno', 'rutina',
    'rutina_gimnasio', 'rutina_gimnasio_ejercicio',
    'rutina_predefinida', 'rutina_predefinida_ejercicio',
    'serie', 'sesion_entrenamiento',
  ];
  igual(nombres.join(','), esperadas.join(','), 'tablas');
  igual(nombres.includes('rutina_gimnasio_dia'), false, 'rutina_gimnasio_dia eliminada');
});

// --- semilla de alimentos ---------------------------------------------------

await prueba('la semilla cargo el catalogo entero', async () => {
  const r = await schema.getDb().getFirstAsync(
    "SELECT count(*) AS n FROM alimento WHERE fuente = 'manual' AND verificado = 1");
  igual(r.n, 844, 'alimentos sembrados');
});

await prueba('el validador de coherencia no detecta errores en el catalogo unificado', async () => {
  const todos = [
    ...alimentosAr.ALIMENTOS_AR,
    ...alimentosLote2.ALIMENTOS_AR_LOTE2,
    ...alimentosLote3.ALIMENTOS_AR_LOTE3,
  ];
  const incoherentes = alimentosLote2.alimentosIncoherentes(todos);
  igual(incoherentes.length, 0, 'cero alimentos incoherentes');
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

await prueba('actualizarPerfil() permite configurar y limpiar meta_agua_manual_ml', async () => {
  await qPerfil.actualizarPerfil('u1', { meta_agua_manual_ml: 2750 });
  let p = await qPerfil.obtenerPerfilLocal();
  igual(p.meta_agua_manual_ml, 2750, 'meta_agua_manual_ml guardada');

  await qPerfil.actualizarPerfil('u1', { meta_agua_manual_ml: null });
  p = await qPerfil.obtenerPerfilLocal();
  igual(p.meta_agua_manual_ml, null, 'meta_agua_manual_ml restablecida a null');
});

await prueba('modo_nutricion queda en objetivo por defecto (migracion 009)', async () => {
  const p = await qPerfil.obtenerPerfilLocal();
  igual(p.modo_nutricion, 'objetivo', 'modo_nutricion default');
});

await prueba('actualizarPerfil() permite cambiar y persistir modo_nutricion a recuento', async () => {
  await qPerfil.actualizarPerfil('u1', { modo_nutricion: 'recuento' });
  const p = await qPerfil.obtenerPerfilLocal();
  igual(p.modo_nutricion, 'recuento', 'modo_nutricion actualizado a recuento');

  // Restaurar a objetivo para las pruebas subsiguientes
  await qPerfil.actualizarPerfil('u1', { modo_nutricion: 'objetivo' });
  const restaurado = await qPerfil.obtenerPerfilLocal();
  igual(restaurado.modo_nutricion, 'objetivo', 'modo_nutricion restaurado a objetivo');
});

await prueba('el CHECK de modo_nutricion rechaza valores desconocidos', () =>
  lanza(
    () => schema.getDb().runAsync("UPDATE perfil SET modo_nutricion = 'invalido' WHERE id = 'u1'"),
    /CHECK/i,
    'modo_nutricion invalido',
  ),
);

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

await prueba('guardarAlimento() persiste porciones y categoria, y buscarAlimentosPorNombre() las devuelve parseadas', async () => {
  const porcionesCoca = [
    { nombre: '1 vaso (250 g)', gramos: 250, predeterminada: true },
    { nombre: 'Medio litro (500 g)', gramos: 500, predeterminada: false },
    { nombre: 'Botella entera (2.5 L)', gramos: 2500, predeterminada: false },
  ];
  await qAlimentos.guardarAlimento({
    id: 'coca-test-1',
    nombre: 'Coca-Cola 2.5 L',
    marca: 'Coca-Cola',
    codigo_barras: '7790895000997',
    kcal_por_100g: 42,
    fuente: 'open_food_facts',
    porciones: porcionesCoca,
    categoria: 'bebidas',
  });

  const raw = await schema.getDb().getFirstAsync("SELECT porciones, categoria FROM alimento WHERE codigo_barras = '7790895000997'");
  igual(typeof raw.porciones, 'string', 'columna porciones es string json en sqlite');
  igual(raw.categoria, 'bebidas', 'categoria guardada');

  const encontrados = await qAlimentos.buscarAlimentosPorNombre('Coca-Cola');
  const encontrado = encontrados.find((a) => a.codigo_barras === '7790895000997');
  igual(Boolean(encontrado), true, 'alimento encontrado por busqueda');
  igual(Array.isArray(encontrado.porciones), true, 'porciones es array');
  igual(encontrado.porciones.length, 3, 'cantidad de porciones');
  igual(encontrado.porciones[0].nombre, '1 vaso (250 g)', 'primera porcion');
  igual(encontrado.porciones[0].gramos, 250, 'gramos primera porcion');
});

await prueba('resolverPorcionesAlimento() genera porciones al vuelo para bebidas sin porciones cargadas', () => {
  // Alimento con porciones existentes las conserva
  const conPorc = fPorciones.resolverPorcionesAlimento({
    nombre: 'Coca-Cola 2.5 L',
    porciones: [{ nombre: '1 vaso (250 g)', gramos: 250, predeterminada: true }],
  });
  igual(conPorc.length, 1, 'conserva porciones si existen');

  // Bebida por categoria sin porciones
  const bebCat = fPorciones.resolverPorcionesAlimento({
    nombre: 'Infusion especial',
    categoria: 'bebidas',
    porciones: [],
  });
  igual(bebCat.length, 2, 'genera 2 porciones de bebida');
  igual(bebCat[0].nombre, '1 vaso (250 g)', 'vaso 250');
  igual(bebCat[1].nombre, 'Medio litro (500 g)', 'medio litro 500');

  // Bebida por nombre sin categoria
  const bebNombre = fPorciones.resolverPorcionesAlimento({
    nombre: 'Coca Zero 500ml',
    categoria: 'otros',
    porciones: [],
  });
  igual(bebNombre.length, 2, 'detecta bebida por nombre y genera fallback');

  // Alimento que no es bebida devuelve vacio
  const noBebida = fPorciones.resolverPorcionesAlimento({
    nombre: 'Milanesa de ternera',
    categoria: 'carnes',
    porciones: [],
  });
  igual(noBebida.length, 0, 'no inventa porciones para comidas que no son bebida');
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

// --- hidratacion -----------------------------------------------------------

await prueba('registrarAgua() guarda tomas individuales y calcula totalDelDia()', async () => {
  const r1 = await qAgua.registrarAgua({
    usuario_id: 'u1',
    fecha: '2026-08-31',
    hora: '09:00',
    ml: 250,
  });
  igual(r1.usuario_id, 'u1', 'usuario');
  igual(r1.ml, 250, 'ml r1');
  igual(r1.hora, '09:00', 'hora r1');

  await qAgua.registrarAgua({
    usuario_id: 'u1',
    fecha: '2026-08-31',
    hora: '11:30',
    ml: 500,
  });

  await qAgua.registrarAgua({
    usuario_id: 'u1',
    fecha: '2026-08-31',
    hora: '15:00',
    ml: 350,
  });

  const total = await qAgua.totalDelDia('u1', '2026-08-31');
  igual(total, 1100, 'total del dia (250 + 500 + 350)');

  const tomas = await qAgua.listarAguaDelDia('u1', '2026-08-31');
  igual(tomas.length, 3, 'cantidad de tomas');
  igual(tomas[0].ml, 250, 'primera toma');
  igual(tomas[1].ml, 500, 'segunda toma');
  igual(tomas[2].ml, 350, 'tercera toma');
});

await prueba('eliminarUltimoRegistro() borra la toma mas reciente y actualiza el total', async () => {
  await qAgua.eliminarUltimoRegistro('u1', '2026-08-31');
  const totalDespues = await qAgua.totalDelDia('u1', '2026-08-31');
  igual(totalDespues, 750, 'total despues de borrar (queda 250 + 500)');

  const tomas = await qAgua.listarAguaDelDia('u1', '2026-08-31');
  igual(tomas.length, 2, 'quedan 2 tomas');
  igual(tomas[tomas.length - 1].ml, 500, 'la ultima restante es la de 500');
});

await prueba('el CHECK de registro_agua rechaza ml <= 0', () =>
  lanza(
    () => qAgua.registrarAgua({ usuario_id: 'u1', fecha: '2026-08-31', hora: '16:00', ml: 0 }),
    /CHECK/i,
    'ml cero',
  ),
);

await prueba('totalDelDia() suma tomas de agua y agua registrada en comidas', async () => {
  const alimentos = await qAlimentos.buscarAlimentosPorNombre('Agua mineral');
  const aguaAlimento = alimentos[0];
  igual(aguaAlimento !== undefined, true, 'alimento Agua mineral existe');

  const comidaId = 'comida-agua-test';
  await qComidas.crearComida({
    id: comidaId,
    usuario_id: 'u1',
    tipo: 'almuerzo',
    fecha_hora: '2026-08-31T13:00:00-03:00',
  });

  await qComidas.agregarItem({
    id: 'item-agua-test',
    comida_id: comidaId,
    alimento_id: aguaAlimento.id,
    cantidad_g: 250,
    editado_por_usuario: false,
  });

  // El total previo era 750 (de registro_agua). Con los 250g de la comida pasa a 1000:
  const totalConComida = await qAgua.totalDelDia('u1', '2026-08-31');
  igual(totalConComida, 1000, 'total incluye el agua de la comida (750 + 250)');

  // Al borrar la comida, el agua se descuenta automaticamente
  await qComidas.eliminarComida(comidaId);
  const totalSinComida = await qAgua.totalDelDia('u1', '2026-08-31');
  igual(totalSinComida, 750, 'total vuelve a 750 al borrar la comida');
});

await prueba('minutosEntrenamientoDelDia() suma estimados, sesiones reales y descarta cancelados', async () => {
  const fechaPrueba = '2026-09-20';
  await qEventos.crearEvento({
    id: 'ev-agua-est',
    usuario_id: 'u1',
    tipo: 'entrenamiento',
    fecha_hora_inicio: '2026-09-20T10:00:00-03:00',
    duracion_estimada_min: 45,
    intensidad: 'media',
  });

  const eConSesion = await qEventos.crearEvento({
    id: 'ev-agua-ses',
    usuario_id: 'u1',
    tipo: 'entrenamiento',
    fecha_hora_inicio: '2026-09-20T16:00:00-03:00',
    duracion_estimada_min: 60,
    intensidad: 'alta',
  });

  await schema.getDb().runAsync(
    `INSERT INTO sesion_entrenamiento
       (id, evento_id, modo, bloques, pasadas, trabajo_seg, descanso_seg, descanso_bloque_seg,
        bloques_completados, pasadas_completadas, duracion_real_seg, created_at, updated_at)
     VALUES (?, ?, 'cronometro', 1, 1, 0, 0, 0, 1, 1, 4500, ?, ?)`,
    ['ses-agua-1', eConSesion.id, '2026-09-20T17:15:00-03:00', '2026-09-20T17:15:00-03:00'],
  );

  const eCancelado = await qEventos.crearEvento({
    id: 'ev-agua-canc',
    usuario_id: 'u1',
    tipo: 'partido',
    fecha_hora_inicio: '2026-09-20T19:00:00-03:00',
    duracion_estimada_min: 90,
    intensidad: 'alta',
  });
  await qEventos.responderEvento(eCancelado.id, false);

  const minutos = await qEventos.minutosEntrenamientoDelDia('u1', fechaPrueba);
  // eEstimado (45) + eConSesion (4500/60 = 75) = 120
  igual(minutos, 120, 'minutos calculados para el dia');
});

// --- rutinas semanales y materializacion ------------------------------------
//
// El instante es fijo y la zona tambien (TZ arriba del archivo): sin las dos
// cosas, "no toca eventos pasados" depende de cuando corre la prueba y "la
// fecha sale del dia local" pasa por casualidad en una maquina en UTC.
//
// Los dias de la semana se derivan de HOY en vez de escribirse a mano, asi la
// prueba no depende de que dia cayo la fecha elegida.

const HOY = new Date(2026, 8, 4, 14, 0, 0); // viernes 4/9/2026, 14:00 local
const MANANA = (HOY.getDay() + 1) % 7;

const contarEventos = async (usuarioId) =>
  (await schema.getDb().getFirstAsync('SELECT count(*) AS n FROM evento WHERE usuario_id = ?', [
    usuarioId,
  ])).n;

await prueba('el CHECK rechaza una hora sin padding', () =>
  lanza(
    () =>
      qRutinas.crearRutina({
        id: 'rX', usuario_id: 'u1', dia_semana: 1, hora: '8:30',
        tipo: 'entrenamiento', intensidad: 'media',
      }),
    /CHECK/i,
    'hora 8:30',
  ),
);

await prueba('el CHECK rechaza un dia_semana fuera de 0-6', () =>
  lanza(
    () =>
      qRutinas.crearRutina({
        id: 'rX', usuario_id: 'u1', dia_semana: 7, hora: '08:30',
        tipo: 'entrenamiento', intensidad: 'media',
      }),
    /CHECK/i,
    'dia_semana 7',
  ),
);

await prueba('materializarRutinas() genera una ocurrencia por semana', async () => {
  await qRutinas.crearRutina({
    id: 'ru1', usuario_id: 'u1', dia_semana: MANANA, hora: '08:30',
    tipo: 'entrenamiento', duracion_estimada_min: 90, intensidad: 'alta',
  });
  const n = await agenda.materializarRutinas('u1', 2, HOY);
  igual(n, 2, 'eventos generados en 2 semanas');

  const generados = await schema.getDb().getAllAsync(
    'SELECT * FROM evento WHERE rutina_id = ? ORDER BY fecha_hora_inicio', ['ru1']);
  igual(generados.length, 2, 'filas con ese rutina_id');
  igual(generados[0].tipo, 'entrenamiento', 'tipo copiado de la rutina');
  igual(generados[0].duracion_estimada_min, 90, 'duracion copiada');
  igual(generados[0].intensidad, 'alta', 'intensidad copiada');
  igual(generados[0].completado, 0, 'nace sin completar');
});

// La razon de ser del anti-duplicado: esto corre en cada arranque de la app.
await prueba('correrla dos veces no duplica', async () => {
  const antes = await contarEventos('u1');
  const n = await agenda.materializarRutinas('u1', 2, HOY);
  igual(n, 0, 'eventos generados en la segunda corrida');
  igual(await contarEventos('u1'), antes, 'total de eventos');
});

// Mover el horario no da dos eventos el mismo dia: la clave del anti-duplicado
// es (rutina_id, fecha), no fecha_hora_inicio.
await prueba('cambiarle la hora a la rutina no agrega un segundo evento ese dia', async () => {
  await qRutinas.actualizarRutina('ru1', { hora: '19:00' });
  const n = await agenda.materializarRutinas('u1', 2, HOY);
  igual(n, 0, 'eventos generados tras mover la hora');
  const r = await schema.getDb().getAllAsync(
    'SELECT fecha FROM evento WHERE rutina_id = ? GROUP BY fecha HAVING count(*) > 1', ['ru1']);
  igual(r.length, 0, 'dias con dos eventos');
  await qRutinas.actualizarRutina('ru1', { hora: '08:30' });
});

// El bug que motivo todo esto: con toISOString() el entrenamiento de las 22:00
// en Buenos Aires (-03:00) es la 01:00 UTC del dia siguiente, y `fecha` sale de
// los primeros 10 caracteres del string. La ultima aseveracion es la que
// importa: confirma que UTC habria dado OTRO dia, o sea que la prueba muerde.
await prueba('la fecha generada sale del dia LOCAL, no de UTC', async () => {
  await qRutinas.crearRutina({
    id: 'ru2', usuario_id: 'u1', dia_semana: MANANA, hora: '22:00',
    tipo: 'gimnasio', intensidad: 'media',
  });
  await agenda.materializarRutinas('u1', 1, HOY);

  const nocturnos = await schema.getDb().getAllAsync(
    'SELECT * FROM evento WHERE rutina_id = ?', ['ru2']);
  igual(nocturnos.length, 1, 'ocurrencias en 1 semana');

  const e = nocturnos[0];
  igual(e.fecha_hora_inicio.slice(11, 16), '22:00', 'hora local guardada');
  igual(e.fecha_hora_inicio.slice(19), '-03:00', 'offset local en el ISO');
  igual(e.fecha, e.fecha_hora_inicio.slice(0, 10), 'fecha = primeros 10 del ISO');
  igual(
    new Date(e.fecha_hora_inicio).toISOString().slice(0, 10) === e.fecha,
    false,
    'en UTC caeria otro dia (si esto es true, la prueba no prueba nada)',
  );
});

// Crear a las 14:00 el entrenamiento de las 08:30 de esta manana solo deja una
// fila que nadie va a marcar.
await prueba('no genera la ocurrencia de hoy que ya paso', async () => {
  await qRutinas.crearRutina({
    id: 'ru3', usuario_id: 'u1', dia_semana: HOY.getDay(), hora: '08:00',
    tipo: 'gimnasio', intensidad: 'baja',
  });
  const n = await agenda.materializarRutinas('u1', 1, HOY);
  igual(n, 0, 'ocurrencias generadas para una hora que ya paso');
});

await prueba('desactivar una rutina no borra los eventos pasados', async () => {
  // Una ocurrencia de la semana pasada, como la habria dejado una corrida
  // anterior, y otra suelta que la rutina no debe tocar nunca.
  await qEventos.crearEvento({
    id: 'ev-pasado', usuario_id: 'u1', tipo: 'entrenamiento',
    fecha_hora_inicio: '2026-08-28T08:30:00-03:00', intensidad: 'alta',
    completado: true, rutina_id: 'ru1',
  });
  await qEventos.crearEvento({
    id: 'ev-suelto', usuario_id: 'u1', tipo: 'partido',
    fecha_hora_inicio: '2026-09-20T16:00:00-03:00', intensidad: 'alta',
  });

  const futurosAntes = await schema.getDb().getFirstAsync(
    'SELECT count(*) AS n FROM evento WHERE rutina_id = ? AND fecha_hora_inicio >= ?',
    ['ru1', '2026-09-04T14:00:00-03:00'],
  );
  igual(futurosAntes.n, 2, 'futuros de la rutina antes de desactivar');

  const borrados = await agenda.desactivarRutina('ru1', HOY);
  igual(borrados, 2, 'eventos futuros borrados');

  const pasado = await qEventos.obtenerEvento('ev-pasado');
  igual(pasado === null, false, 'el evento pasado sigue existiendo');
  igual(pasado.completado, 1, 'y conserva su completado');

  const suelto = await qEventos.obtenerEvento('ev-suelto');
  igual(suelto === null, false, 'el evento sin rutina_id sigue existiendo');

  const quedan = await schema.getDb().getAllAsync(
    'SELECT id FROM evento WHERE rutina_id = ?', ['ru1']);
  igual(quedan.length, 1, 'ocurrencias de la rutina que quedan');

  const r = await qRutinas.obtenerRutina('ru1');
  igual(r.activa, 0, 'la rutina quedo inactiva');
});

await prueba('una rutina inactiva no vuelve a generar', async () => {
  await agenda.materializarRutinas('u1', 2, HOY);
  const generados = await schema.getDb().getAllAsync(
    'SELECT id FROM evento WHERE rutina_id = ?', ['ru1']);
  // Solo queda el pasado. Contar el total de u1 aca no serviria: ru2 y ru3
  // siguen activas y esta corrida amplia su ventana de 1 semana a 2.
  igual(generados.length, 1, 'ocurrencias de la rutina desactivada');
  igual(generados[0].id, 'ev-pasado', 'la unica que queda es la pasada');
});

// El historial no depende de que la regla siga existiendo: ON DELETE SET NULL.
await prueba('borrar la rutina deja sus eventos huerfanos, no los borra', async () => {
  await qRutinas.eliminarRutina('ru1');
  const e = await qEventos.obtenerEvento('ev-pasado');
  igual(e === null, false, 'el evento sobrevivio a la rutina');
  igual(e.rutina_id, null, 'quedo suelto (SET NULL)');
});

await prueba('marcarCompletado() da vuelta el flag', async () => {
  await qEventos.marcarCompletado('ev-suelto', true);
  igual((await qEventos.obtenerEvento('ev-suelto')).completado, 1, 'completado');
  await qEventos.marcarCompletado('ev-suelto', false);
  igual((await qEventos.obtenerEvento('ev-suelto')).completado, 0, 'sin completar');
});

await prueba('listarRutinas() filtra por activas', async () => {
  const todas = await qRutinas.listarRutinas('u1');
  const activas = await qRutinas.listarRutinas('u1', true);
  igual(todas.length, 2, 'rutinas totales (ru2 y ru3)');
  igual(activas.length, 2, 'rutinas activas');
  await qRutinas.actualizarRutina('ru3', { activa: false });
  igual((await qRutinas.listarRutinas('u1', true)).length, 1, 'activas tras desactivar ru3');
});

await prueba('agruparRutinas() consolida rutinas por tipo, hora, duracion e intensidad', async () => {
  const agrupadas = rutinasHelper.agruparRutinas([
    { id: 'r-lun', usuario_id: 'u1', dia_semana: 1, hora: '08:30', tipo: 'entrenamiento', duracion_estimada_min: 60, intensidad: 'alta', activa: 1 },
    { id: 'r-mie', usuario_id: 'u1', dia_semana: 3, hora: '08:30', tipo: 'entrenamiento', duracion_estimada_min: 60, intensidad: 'alta', activa: 1 },
    { id: 'r-vie', usuario_id: 'u1', dia_semana: 5, hora: '08:30', tipo: 'entrenamiento', duracion_estimada_min: 60, intensidad: 'alta', activa: 1 },
    { id: 'r-mar', usuario_id: 'u1', dia_semana: 2, hora: '18:00', tipo: 'gimnasio', duracion_estimada_min: 45, intensidad: 'media', activa: 1 },
  ]);
  igual(agrupadas.length, 2, 'cantidad de rutinas agrupadas');
  igual(agrupadas[0].hora, '08:30', 'primera rutina hora');
  igual(agrupadas[0].ids.length, 3, 'primera rutina dias consolidados');
  igual(agrupadas[0].dias.join(','), '1,3,5', 'dias ordenados');
  igual(agrupadas[1].hora, '18:00', 'segunda rutina hora');
  igual(agrupadas[1].ids.length, 1, 'segunda rutina dias');
  igual(rutinasHelper.formatearHoraCorta('08:30'), '8:30', 'hora corta sin cero');
  igual(rutinasHelper.formatearHoraCorta('18:00'), '18:00', 'hora corta tarde');
});

// --- eventos sin responder --------------------------------------------------
//
// `completado = 0` solia querer decir dos cosas: "no lo hice" y "todavia no
// conteste". Estas pruebas son sobre la segunda.
//
// Mismo HOY que la seccion de rutinas: viernes 4/9/2026 14:00 local (-03:00).
// Con horas = 2 el corte cae a las 12:00 local, o sea 15:00 UTC. Cada fixture
// de abajo elige su inicio y su duracion para caer de un lado o del otro.

// Las secciones anteriores dejaron eventos de u1 sin responder (e1, ev-pasado
// y las ocurrencias materializadas). Se responden todos de una para que lo que
// devuelva la consulta sea solo lo que crea esta seccion.
await schema.getDb().runAsync("UPDATE evento SET respondido = 1 WHERE usuario_id = 'u1'");

const sinResponder = async (horas, ahora = HOY) =>
  (await qEventos.listarEventosSinResponder('u1', horas, ahora)).map((e) => e.id);

const crearPendiente = (id, inicio, duracion) =>
  qEventos.crearEvento({
    id, usuario_id: 'u1', tipo: 'entrenamiento',
    fecha_hora_inicio: inicio, duracion_estimada_min: duracion, intensidad: 'media',
  });

await prueba('un evento nace sin responder', async () => {
  const e = await crearPendiente('sr-viejo', '2026-09-04T10:00:00-03:00', 60);
  igual(e.respondido, 0, 'respondido al crearse');
  igual(e.completado, 0, 'completado al crearse');
});

await prueba('uno que termino hace 3 horas y sigue mudo aparece', async () => {
  igual((await sinResponder(2)).includes('sr-viejo'), true, 'sr-viejo en la lista');
});

// Este es tambien el caso que caza una confusion UTC/local: el fin son las
// 13:00 locales y el corte las 15:00 UTC. Comparar sin normalizar el offset lo
// mueve tres horas y lo manda del otro lado.
await prueba('uno que termino hace 1 hora no aparece', async () => {
  await crearPendiente('sr-reciente', '2026-09-04T12:00:00-03:00', 60);
  igual((await sinResponder(2)).includes('sr-reciente'), false, 'sr-reciente fuera');
});

await prueba('uno ya respondido no aparece, diga que si o que no', async () => {
  await crearPendiente('sr-dijo-si', '2026-09-04T10:00:00-03:00', 60);
  await crearPendiente('sr-dijo-no', '2026-09-04T10:00:00-03:00', 60);
  await qEventos.responderEvento('sr-dijo-si', true);
  await qEventos.responderEvento('sr-dijo-no', false);

  const ids = await sinResponder(2);
  igual(ids.includes('sr-dijo-si'), false, 'el que dijo que si');
  igual(ids.includes('sr-dijo-no'), false, 'el que dijo que no');

  // Y la distincion que motivo la columna: "no lo hice" no es "no conteste".
  const no = await qEventos.obtenerEvento('sr-dijo-no');
  igual(no.completado, 0, 'completado');
  igual(no.respondido, 1, 'respondido');
});

await prueba('uno futuro no aparece', async () => {
  await crearPendiente('sr-futuro', '2026-09-04T18:00:00-03:00', 60);
  igual((await sinResponder(2)).includes('sr-futuro'), false, 'sr-futuro fuera');
});

// El fixture del borde es el que prueba que el default se aplica: con 60 el fin
// son las 12:30 y queda afuera; si la duracion se tomara como 0 el fin serian
// las 11:30 y entraria. Que este AFUERA es la afirmacion.
await prueba('duracion_estimada_min NULL usa el default de 60', async () => {
  await crearPendiente('sr-null-entra', '2026-09-04T10:15:00-03:00', null);
  await crearPendiente('sr-null-borde', '2026-09-04T11:30:00-03:00', null);

  const ids = await sinResponder(2);
  igual(ids.includes('sr-null-entra'), true, 'fin 11:15, adentro');
  igual(ids.includes('sr-null-borde'), false, 'fin 12:30, afuera (con 0 entraria)');
});

// Un error de offset son tres horas: mueve los dos fixtures al mismo lado del
// corte y esta prueba lo delata.
await prueba('el corte cae exactamente a las `horas` del fin previsto', async () => {
  await crearPendiente('sr-borde-adentro', '2026-09-04T10:59:00-03:00', 60);
  await crearPendiente('sr-borde-afuera', '2026-09-04T11:01:00-03:00', 60);

  const ids = await sinResponder(2);
  igual(ids.includes('sr-borde-adentro'), true, 'fin 11:59, un minuto adentro');
  igual(ids.includes('sr-borde-afuera'), false, 'fin 12:01, un minuto afuera');
});

// El evento que termina despues de medianoche UTC pero antes de medianoche
// local: su dia local y su dia UTC son distintos, y aun asi cae donde debe.
await prueba('el offset se respeta cruzando la medianoche UTC', async () => {
  const e = await crearPendiente('sr-nocturno', '2026-09-03T23:30:00-03:00', 60);
  igual(e.fecha, '2026-09-03', 'dia local del evento');
  igual(
    new Date(e.fecha_hora_inicio).toISOString().slice(0, 10),
    '2026-09-04',
    'su dia UTC es otro (si no, la prueba no muerde)',
  );
  igual((await sinResponder(2)).includes('sr-nocturno'), true, 'igual aparece');
});

await prueba('vienen del mas viejo al mas nuevo', async () => {
  const ids = await sinResponder(2);
  const esperado = ['sr-nocturno', 'sr-viejo', 'sr-null-entra', 'sr-borde-adentro'];
  igual(ids.join(','), esperado.join(','), 'orden y contenido de la lista');
});

await prueba('el parametro horas corre la ventana', async () => {
  // Con 6 horas de margen solo sobrevive el de anoche.
  igual((await sinResponder(6)).join(','), 'sr-nocturno', 'ventana de 6 horas');
  // Con 0, todo lo que ya termino cuenta, incluido el de hace una hora.
  igual((await sinResponder(0)).includes('sr-reciente'), true, 'ventana de 0 horas');
  igual((await sinResponder(0)).includes('sr-futuro'), false, 'el futuro nunca entra');
});

// El check a mano es una respuesta. Si esto escribiera solo `completado`, el
// evento volveria a aparecer en el cartel despues de que el usuario contesto.
await prueba('marcarCompletado() tambien deja el evento respondido', async () => {
  await qEventos.marcarCompletado('sr-viejo', true);
  const e = await qEventos.obtenerEvento('sr-viejo');
  igual(e.completado, 1, 'completado');
  igual(e.respondido, 1, 'respondido');
  igual((await sinResponder(2)).includes('sr-viejo'), false, 'ya no aparece');
});

// --- sesiones de entrenamiento ----------------------------------------------
//
// Lo que queda guardado cuando el temporizador termina bien: siempre un evento
// retroactivo mas su sesion. Antes habia una segunda rama, para cuando la
// sesion salia de un evento ya agendado, pero al temporizador ya no se llega
// desde la agenda y esa rama se fue con su prueba.
//
// Abandonar no llega hasta aca y por eso no se prueba: guardarSesionTerminada()
// solo se llama al completar.

// El plan de una sesion chica y completa, para no repetirlo en cada prueba.
const CONFIG_PRUEBA = {
  bloques: 2, pasadas: 3, trabajoSeg: 20, descansoSeg: 10, descansoBloqueSeg: 60,
};
const PLAN_PRUEBA = T.construirPlan(CONFIG_PRUEBA);
const DURACION_PRUEBA_MS = T.duracionTotalMs(PLAN_PRUEBA);
// 220 s: dos bloques de (3x20 + 2x10) = 80, mas un descanso de bloque de 60.

await prueba('crea el evento retroactivo y le cuelga la sesion', async () => {
  const inicio = new Date(2026, 8, 5, 7, 30, 0);

  const r = await entrenamiento.guardarSesionTerminada({
    usuarioId: 'u1',
    config: CONFIG_PRUEBA,
    plan: PLAN_PRUEBA,
    inicio,
    duracionRealMs: DURACION_PRUEBA_MS,
  });

  const e = await qEventos.obtenerEvento(r.eventoId);
  igual(e === null, false, 'el evento existe');
  igual(e.tipo, 'entrenamiento', 'tipo');
  // Con offset local, no UTC: de aca sale la columna generada `fecha`.
  igual(e.fecha_hora_inicio, '2026-09-05T07:30:00-03:00', 'arranca cuando arranco la sesion');
  igual(e.fecha, '2026-09-05', 'la fecha generada es el dia local');
  igual(e.completado, 1, 'completado');
  // Lo importante: sin esto, el cartel de pendientes le preguntaria dos horas
  // despues si hizo el entrenamiento que acaba de terminar.
  igual(e.respondido, 1, 'respondido');
  // 220 s -> 4 min. La intensidad sale del ratio 20/10: descanso < trabajo.
  igual(e.duracion_estimada_min, 4, 'duracion redondeada a minutos');
  igual(e.intensidad, 'alta', 'intensidad deducida del ratio');

  // Las columnas de la sesion. Vivian en la prueba de la rama agendada, que se
  // fue con la rama; son lo unico que mira que la config se guarde entera, asi
  // que se mudaron aca en vez de borrarse.
  const ses = await qSesiones.obtenerSesionPorEvento(r.eventoId);
  igual(ses === null, false, 'la sesion existe');
  igual(ses.id, r.sesion.id, 'la sesion es la que devolvio');
  igual(ses.bloques, 2, 'config: bloques');
  igual(ses.pasadas, 3, 'config: pasadas');
  igual(ses.trabajo_seg, 20, 'config: trabajo');
  igual(ses.descanso_seg, 10, 'config: descanso');
  igual(ses.descanso_bloque_seg, 60, 'config: descanso de bloque');
  igual(ses.bloques_completados, 2, 'bloques completados');
  // TOTAL de la sesion, no del ultimo bloque: 2 x 3 = 6.
  igual(ses.pasadas_completadas, 6, 'pasadas completadas (total)');
  igual(ses.duracion_real_seg, 220, 'duracion real en segundos');
  igual(ses.distancia_km, null, 'sin distancia al crearse');

  const evPasadas = await qEventos.obtenerEvento(r.eventoId);
  igual(evPasadas.modo_entrenamiento, 'pasadas', 'evento retroactivo guarda modo_entrenamiento pasadas');
});

await prueba('un evento retroactivo no aparece en el cartel de pendientes', async () => {
  // Es la consecuencia practica de respondido = 1, y vale la pena verla:
  // una sesion de hace horas no tiene que generar una pregunta.
  const inicio = new Date(2026, 8, 5, 7, 30, 0);
  const r = await entrenamiento.guardarSesionTerminada({
    usuarioId: 'u1', config: CONFIG_PRUEBA, plan: PLAN_PRUEBA,
    inicio, duracionRealMs: DURACION_PRUEBA_MS,
  });

  const pendientes = await qEventos.listarEventosSinResponder(
    'u1', 2, new Date(2026, 8, 5, 20, 0, 0),
  );
  igual(pendientes.some((e) => e.id === r.eventoId), false, 'no lo pregunta');
});

await prueba('el cronometro guarda 1 bloque, 1 pasada y su duracion real', async () => {
  const plan = T.construirPlan(T.CONFIG_CRONOMETRO);
  const r = await entrenamiento.guardarSesionTerminada({
    usuarioId: 'u1',
    config: T.CONFIG_CRONOMETRO, plan,
    inicio: new Date(2026, 8, 6, 9, 0, 0),
    duracionRealMs: 2700000,   // 45 min
  });

  const ses = await qSesiones.obtenerSesionPorEvento(r.eventoId);
  igual(ses.trabajo_seg, 0, 'trabajo 0 es lo que define al cronometro');
  // La fase abierta cuenta como hecha: pararla ES terminarla.
  igual(ses.bloques_completados, 1, 'un bloque');
  igual(ses.pasadas_completadas, 1, 'una pasada');
  igual(ses.duracion_real_seg, 2700, '45 min en segundos');

  const e = await qEventos.obtenerEvento(r.eventoId);
  igual(e.duracion_estimada_min, 45, 'el evento dice 45 min');
  igual(e.intensidad, 'media', 'el cronometro es media, no baja');
  igual(e.modo_entrenamiento, 'cronometro', 'evento retroactivo guarda modo_entrenamiento cronometro');
});

await prueba('la distancia se carga despues y solo acepta valores utiles', async () => {
  const plan = T.construirPlan(T.CONFIG_CRONOMETRO);
  const r = await entrenamiento.guardarSesionTerminada({
    usuarioId: 'u1',
    config: T.CONFIG_CRONOMETRO, plan,
    inicio: new Date(2026, 8, 6, 10, 0, 0),
    duracionRealMs: 2700000,
  });
  igual(r.sesion.distancia_km, null, 'nace sin distancia');

  await qSesiones.actualizarDistancia(r.sesion.id, 6.2);
  igual((await qSesiones.obtenerSesion(r.sesion.id)).distancia_km, 6.2, 'cargada');

  // null la borra: es el unico valor que significa "sin distancia".
  await qSesiones.actualizarDistancia(r.sesion.id, null);
  igual((await qSesiones.obtenerSesion(r.sesion.id)).distancia_km, null, 'borrada');

  // El CHECK del DDL rechaza el 0, para que no haya dos formas de decir lo
  // mismo. parsearDistancia() ya lo convierte en null antes de llegar aca;
  // esto verifica que la base no dependa de eso.
  await lanza(
    () => qSesiones.actualizarDistancia(r.sesion.id, 0),
    /CHECK|constraint/i,
    'distancia 0',
  );
  await lanza(
    () => qSesiones.actualizarDistancia(r.sesion.id, -3),
    /CHECK|constraint/i,
    'distancia negativa',
  );
});

// Un evento con sesion para las dos pruebas que siguen. Antes lo dejaba parada
// la prueba de la rama agendada; ahora sale del unico camino que crea sesiones.
// Las dos prueban constraints del DDL, no el temporizador, asi que siguen
// valiendo aunque la rama que las alimentaba ya no exista.
const conSesion = await entrenamiento.guardarSesionTerminada({
  usuarioId: 'u1', config: CONFIG_PRUEBA, plan: PLAN_PRUEBA,
  inicio: new Date(2026, 8, 7, 19, 0, 0), duracionRealMs: DURACION_PRUEBA_MS,
});

await prueba('un evento no puede tener dos sesiones', async () => {
  // El UNIQUE es la promesa que hace obtenerSesionPorEvento() al devolver una
  // fila y no un array.
  await lanza(
    () => qSesiones.crearSesion({
      id: 'ses-duplicada', evento_id: conSesion.eventoId,
      bloques: 1, pasadas: 1, trabajo_seg: 20, descanso_seg: 0, descanso_bloque_seg: 0,
      bloques_completados: 1, pasadas_completadas: 1, duracion_real_seg: 20,
    }),
    /UNIQUE|constraint/i,
    'segunda sesion del mismo evento',
  );
});

await prueba('borrar el evento se lleva su sesion (CASCADE)', async () => {
  const ses = await qSesiones.obtenerSesionPorEvento(conSesion.eventoId);
  igual(ses === null, false, 'estaba');

  await qEventos.eliminarEvento(conSesion.eventoId);

  // Sola, sin el evento, la sesion no significa nada: no queda huerfana.
  igual(await qSesiones.obtenerSesion(ses.id), null, 'la sesion se fue con el evento');
  igual(await qSesiones.obtenerSesionPorEvento(conSesion.eventoId), null, 'no queda nada colgado');
});

await prueba('obtenerSesionPorEvento() da null si el evento no se corrio', async () => {
  await qEventos.crearEvento({
    id: 'ev-sin-sesion', usuario_id: 'u1', tipo: 'partido',
    fecha_hora_inicio: '2026-10-01T16:00:00-03:00', intensidad: 'alta',
  });
  igual(await qSesiones.obtenerSesionPorEvento('ev-sin-sesion'), null, 'sin sesion');
  igual(await qSesiones.obtenerSesionPorEvento('no-existe'), null, 'evento inexistente');
});

await prueba('la semilla cargo el catalogo de ejercicios', async () => {
  const r = await schema.getDb().getFirstAsync('SELECT count(*) AS n FROM ejercicio');
  igual(r.n >= 60, true, 'al menos 60 ejercicios sembrados');
});

await prueba('CRUD de ejercicios y busqueda por nombre y grupo', async () => {
  const ej = await qEjercicios.crearEjercicio({
    id: 'ej-custom-test',
    nombre: 'Ejercicio Especial Pro',
    grupo: 'pecho',
  });
  igual(ej.nombre, 'Ejercicio Especial Pro', 'nombre guardado');
  const buscados = await qEjercicios.buscarEjercicios('Especial Pro');
  igual(buscados.length, 1, 'encontrado por busqueda');
  const delGrupo = await qEjercicios.listarEjercicios('pecho');
  igual(delGrupo.some((x) => x.id === 'ej-custom-test'), true, 'aparece en el grupo');
});

// --- rutinas predefinidas ---------------------------------------------------

await prueba('la semilla cargo las 10 rutinas predefinidas por categoria', async () => {
  const todas = await qRutinasGimnasio.listarRutinasPredefinidas();
  igual(todas.length, 10, 'rutinas sembradas');
  const por = (c) => todas.filter((r) => r.categoria === c).length;
  igual(por('principiante'), 3, 'principiante');
  igual(por('split'), 5, 'split');
  igual(por('especifica'), 2, 'especifica');
  for (const r of todas) {
    if (r.ejercicios.length < 5 || r.ejercicios.length > 8) {
      throw new Error(`${r.id} tiene ${r.ejercicios.length} ejercicios, fuera de 5-8`);
    }
    if (!r.descripcion || r.descripcion.trim().length === 0) {
      throw new Error(`${r.id} no tiene descripcion`);
    }
  }
  const v = await meta.leerMeta(schema.getDb(), 'semilla_rutinas_predefinidas');
  igual(v, String(semillaRutinas.VERSION_SEMILLA_RUTINAS_PREDEFINIDAS), 'marca de semilla');
});

// Se chequea contra el archivo y no solo contra la base: un typo rompe esta
// prueba con el nombre exacto, en vez de un initDb() que tira al arrancar.
await prueba('cada ejercicio de la semilla existe en el catalogo base y no se repite', () => {
  const catalogo = new Set(ejerciciosBase.EJERCICIOS_BASE.map((e) => e.nombre));
  for (const r of rutinasBase.RUTINAS_PREDEFINIDAS_BASE) {
    for (const n of r.ejercicios) {
      if (!catalogo.has(n)) throw new Error(`${r.id}: "${n}" no esta en ejercicios-base`);
    }
    igual(new Set(r.ejercicios).size, r.ejercicios.length, `${r.id} sin ejercicios repetidos`);
  }
  const ids = rutinasBase.RUTINAS_PREDEFINIDAS_BASE.map((r) => r.id);
  igual(new Set(ids).size, ids.length, 'ids de rutina unicos');
});

await prueba('las rutinas sembradas traen sus ejercicios en el orden de la semilla', async () => {
  for (const s of rutinasBase.RUTINAS_PREDEFINIDAS_BASE) {
    const r = await qRutinasGimnasio.obtenerRutinaPredefinida(s.id);
    igual(r.nombre, s.nombre, `nombre de ${s.id}`);
    igual(r.ejercicios.map((e) => e.nombre).join('|'), s.ejercicios.join('|'), `orden de ${s.id}`);
  }
  // Torso/Pierna B no es Legs con otro nombre.
  const legs = await qRutinasGimnasio.obtenerRutinaPredefinida('predef-legs');
  const b = await qRutinasGimnasio.obtenerRutinaPredefinida('predef-torso-pierna-b');
  igual(legs.ejercicios.map((e) => e.id).join() === b.ejercicios.map((e) => e.id).join(), false,
    'Legs y Pierna B distintas');
});

await prueba('sembrarRutinasPredefinidas() de nuevo no inserta ni duplica', async () => {
  const db = schema.getDb();
  igual(await semillaRutinas.sembrarRutinasPredefinidas(db), 0, 'rutinas insertadas en la segunda corrida');
  // Aun borrando la marca, los slugs fijos impiden duplicar.
  await db.runAsync("DELETE FROM meta WHERE clave = 'semilla_rutinas_predefinidas'");
  igual(await semillaRutinas.sembrarRutinasPredefinidas(db), 0, 'rutinas insertadas sin marca');
  const r = await db.getFirstAsync('SELECT count(*) AS n FROM rutina_predefinida');
  igual(r.n, 10, 'rutinas tras resembrar');
  const e = await db.getFirstAsync('SELECT count(*) AS n FROM rutina_predefinida_ejercicio');
  const esperados = rutinasBase.RUTINAS_PREDEFINIDAS_BASE.reduce((n, x) => n + x.ejercicios.length, 0);
  igual(e.n, esperados, 'ejercicios tras resembrar');
  const orden = await db.getAllAsync('SELECT orden FROM rutina_predefinida GROUP BY orden HAVING count(*) > 1');
  igual(orden.length, 0, 'orden sin empates');
});

await prueba('copiarRutinaPredefinida() crea una rutina propia con los mismos ejercicios en orden', async () => {
  const original = await qRutinasGimnasio.obtenerRutinaPredefinida('predef-push');
  const copia = await qRutinasGimnasio.copiarRutinaPredefinida('predef-push', 'u1');
  igual(copia.usuario_id, 'u1', 'usuario');
  igual(copia.nombre, 'Push', 'nombre');
  igual(copia.activa, 1, 'activa');
  igual(copia.ejercicios.length, original.ejercicios.length, 'cantidad');
  igual(copia.ejercicios.map((e) => e.id).join(), original.ejercicios.map((e) => e.id).join(), 'mismos ejercicios');
  igual(copia.ejercicios.map((e) => e.orden).join(), '0,1,2,3,4,5,6', 'orden');
  igual(copia.dias.length, 0, 'sin dias asignados');
  const mias = await qRutinasGimnasio.listarRutinasGimnasio('u1');
  igual(mias.some((r) => r.id === copia.id), true, 'aparece en mis rutinas');
});

await prueba('la copia es independiente: editarla o borrarla no toca la predefinida', async () => {
  const antes = await qRutinasGimnasio.obtenerRutinaPredefinida('predef-pull');
  const copia = await qRutinasGimnasio.copiarRutinaPredefinida('predef-pull', 'u1');

  await qRutinasGimnasio.actualizarRutinaGimnasio({
    id: copia.id,
    nombre: 'Mi pull',
    ejercicio_ids: [copia.ejercicios[2].id, copia.ejercicios[0].id],
  });
  const editada = await qRutinasGimnasio.obtenerRutinaGimnasio(copia.id);
  igual(editada.nombre, 'Mi pull', 'la copia se renombra');
  igual(editada.ejercicios.length, 2, 'la copia pierde ejercicios');

  let despues = await qRutinasGimnasio.obtenerRutinaPredefinida('predef-pull');
  igual(despues.nombre, 'Pull', 'la original conserva el nombre');
  igual(despues.ejercicios.map((e) => e.id).join(), antes.ejercicios.map((e) => e.id).join(),
    'la original conserva ejercicios y orden');

  await qRutinasGimnasio.eliminarRutinaGimnasio(copia.id);
  igual(await qRutinasGimnasio.obtenerRutinaGimnasio(copia.id), null, 'copia borrada');
  despues = await qRutinasGimnasio.obtenerRutinaPredefinida('predef-pull');
  igual(despues.ejercicios.length, antes.ejercicios.length, 'la original sigue entera');
});

await prueba('copiar la misma predefinida dos veces da dos rutinas distintas', async () => {
  const a = await qRutinasGimnasio.copiarRutinaPredefinida('predef-legs', 'u1');
  const b = await qRutinasGimnasio.copiarRutinaPredefinida('predef-legs', 'u1');
  igual(a.id === b.id, false, 'ids distintos');
  const relA = a.ejercicios.map((e) => e.relacion_id);
  const relB = b.ejercicios.map((e) => e.relacion_id);
  igual(relA.some((id) => relB.includes(id)), false, 'filas de ejercicio propias');
  await qRutinasGimnasio.eliminarRutinaGimnasio(a.id);
  const sigue = await qRutinasGimnasio.obtenerRutinaGimnasio(b.id);
  igual(sigue.ejercicios.length, 8, 'borrar una no toca la otra');
  await qRutinasGimnasio.eliminarRutinaGimnasio(b.id);
});

await prueba('copiarRutinaPredefinida() con un id inexistente lanza', () =>
  lanza(
    () => qRutinasGimnasio.copiarRutinaPredefinida('predef-no-existe', 'u1'),
    /No existe la rutina predefinida/,
    'copia inexistente',
  ),
);

// Base aparte, migrada pero sin ejercicios: la semilla tiene que tirar
// nombrando el ejercicio, y no dejar ni rutinas a medias ni la marca.
await prueba('si falta un ejercicio del catalogo la semilla tira y no deja nada', async () => {
  const sqliteShim = req('expo-sqlite');
  const db = await sqliteShim.openDatabaseAsync(':memory:');
  await db.execAsync('PRAGMA foreign_keys = ON;');
  await migrations.migrar(db);
  await lanza(
    () => semillaRutinas.sembrarRutinasPredefinidas(db),
    /no existe en el catalogo/,
    'semilla sin ejercicios',
  );
  const r = await db.getFirstAsync('SELECT count(*) AS n FROM rutina_predefinida');
  igual(r.n, 0, 'sin rutinas a medias');
  igual(await meta.leerMeta(db, 'semilla_rutinas_predefinidas'), null, 'sin marca');
  await db.closeAsync();
});

await prueba('sesion modo rutina permite campos de intervalos en null', async () => {
  await qEventos.crearEvento({
    id: 'ev-rutina-t1', usuario_id: 'u1', tipo: 'entrenamiento',
    fecha_hora_inicio: '2026-10-05T18:00:00-03:00', intensidad: 'media',
  });
  const ses = await qSesiones.crearSesion({
    id: 'ses-rutina-t1',
    evento_id: 'ev-rutina-t1',
    modo: 'rutina',
    duracion_real_seg: 3600,
  });
  igual(ses.modo, 'rutina', 'modo es rutina');
  igual(ses.bloques, null, 'bloques es null');
  igual(ses.pasadas, null, 'pasadas es null');
});

await prueba('series de una sesion: agregar, listar con ejercicio y cascade', async () => {
  await qSesiones.agregarSeries([
    { id: 'ser-t1', sesion_id: 'ses-rutina-t1', ejercicio_id: 'ej-custom-test', orden: 0, repeticiones: 12, peso_kg: 40 },
    { id: 'ser-t2', sesion_id: 'ses-rutina-t1', ejercicio_id: 'ej-custom-test', orden: 1, repeticiones: 10, peso_kg: 42.5 },
  ]);
  const lista = await qSesiones.listarSeriesConEjercicio('ses-rutina-t1');
  igual(lista.length, 2, 'dos series cargadas');
  igual(lista[0].ejercicio_nombre, 'Ejercicio Especial Pro', 'join con ejercicio');
  igual(lista[0].peso_kg, 40, 'peso de la primera serie');

  const res = await qSesiones.obtenerResumenRutina('ses-rutina-t1');
  igual(res.ejercicios_count, 1, 'un ejercicio');
  igual(res.series_count, 2, 'dos series');
  igual(res.series_con_peso_count, 2, 'dos series con peso');
  igual(res.volumen_kg, 12 * 40 + 10 * 42.5, 'volumen calculado');

  await qEventos.eliminarEvento('ev-rutina-t1');
  const seriesRestantes = await schema.getDb().getAllAsync("SELECT * FROM serie WHERE sesion_id = 'ses-rutina-t1'");
  igual(seriesRestantes.length, 0, 'series borradas por cascade');
});

await prueba('guardarRutinaTerminada y obtenerUltimaSesionRutina', async () => {
  const res = await guardarRutina.guardarRutinaTerminada({
    usuarioId: 'u1',
    inicio: new Date(2026, 9, 6, 18, 0, 0),
    duracionRealSeg: 2400,
    series: [
      { ejercicioId: 'ej-custom-test', repeticiones: 12, pesoKg: 30 },
      { ejercicioId: 'ej-custom-test', repeticiones: 10, pesoKg: 35 },
    ],
  });
  igual(res.sesion.modo, 'rutina', 'modo es rutina');
  const ultima = await qSesiones.obtenerUltimaSesionRutina('u1');
  igual(ultima === null, false, 'encuentra la ultima rutina');
  igual(ultima.series.length, 2, 'tiene 2 series');

  // Re-guardar sobre el mismo evento no viola UNIQUE constraint sesion_entrenamiento.evento_id
  const res2 = await guardarRutina.guardarRutinaTerminada({
    usuarioId: 'u1',
    inicio: new Date(2026, 9, 6, 18, 0, 0),
    duracionRealSeg: 2500,
    eventoIdExistente: res.eventoId,
    series: [
      { ejercicioId: 'ej-custom-test', repeticiones: 15, pesoKg: 40 },
      { ejercicioId: 'ej-custom-test', repeticiones: 12, pesoKg: 45 },
    ],
  });
  igual(res2.eventoId, res.eventoId, 'mismo evento reutilizado');
  const seriesActualizadas = await qSesiones.listarSeriesConEjercicio(res2.sesion.id);
  igual(seriesActualizadas.length, 2, 'series reemplazadas limpiamente');
});

await prueba('listarEjerciciosConHistorial y listarSeriesPorEjercicio', async () => {
  const ejercicios = await qSesiones.listarEjerciciosConHistorial('u1');
  igual(ejercicios.some((e) => e.id === 'ej-custom-test'), true, 'ejercicio en historial');

  const seriesE = await qSesiones.listarSeriesPorEjercicio('u1', 'ej-custom-test');
  igual(seriesE.length >= 2, true, 'trae series del ejercicio');
  igual(typeof seriesE[0].fecha, 'string', 'trae fecha de la sesion');
  igual(seriesE[0].fecha.length, 10, 'formato fecha YYYY-MM-DD');
});

await prueba('crearEvento() deja respondido en 0 salvo que se lo pidan', async () => {
  await qEventos.crearEvento({
    id: 'ev-mudo', usuario_id: 'u1', tipo: 'gimnasio',
    fecha_hora_inicio: '2026-10-02T09:00:00-03:00', intensidad: 'media',
  });
  igual((await qEventos.obtenerEvento('ev-mudo')).respondido, 0, 'por defecto sin responder');

  await qEventos.crearEvento({
    id: 'ev-nace-respondido', usuario_id: 'u1', tipo: 'gimnasio',
    fecha_hora_inicio: '2026-10-02T10:00:00-03:00', intensidad: 'media',
    completado: true, respondido: true,
  });
  const e = await qEventos.obtenerEvento('ev-nace-respondido');
  igual(e.respondido, 1, 'respondido');
  igual(e.completado, 1, 'completado');
});

await prueba('crearEvento() persiste deporte propio y permite recuperarlo', async () => {
  await qEventos.crearEvento({
    id: 'ev-dep-tenis', usuario_id: 'u1', tipo: 'entrenamiento',
    fecha_hora_inicio: '2026-10-02T11:00:00-03:00', intensidad: 'media',
    deporte: 'Tenis',
  });
  const e1 = await qEventos.obtenerEvento('ev-dep-tenis');
  igual(e1.deporte, 'Tenis', 'deporte seteado en Tenis');

  await qEventos.crearEvento({
    id: 'ev-dep-null', usuario_id: 'u1', tipo: 'entrenamiento',
    fecha_hora_inicio: '2026-10-02T12:00:00-03:00', intensidad: 'media',
  });
  const e2 = await qEventos.obtenerEvento('ev-dep-null');
  igual(e2.deporte, null, 'deporte omitido queda NULL');
});

// --- consultas de la pantalla de Progreso ------------------------------------
//
// Las dos consultas por RANGO DE DIAS y la lectura de la sesion. Van al final
// a proposito: crean filas propias y la prueba de CASCADE que sigue se las
// lleva puestas junto con todo lo demas.

await prueba('listarItemsConAlimentoPorRango() trae la fecha de la comida y respeta el rango', async () => {
  await qComidas.crearComida({
    id: 'cp1', usuario_id: 'u1', fecha_hora: '2026-11-01T13:00:00-03:00', tipo: 'almuerzo',
  });
  await qComidas.crearComida({
    id: 'cp2', usuario_id: 'u1', fecha_hora: '2026-11-05T21:00:00-03:00', tipo: 'cena',
  });
  await qComidas.agregarItem({ id: 'ip1', comida_id: 'cp1', alimento_id: 'a1', cantidad_g: 150 });
  await qComidas.agregarItem({ id: 'ip2', comida_id: 'cp1', alimento_id: 'a2', cantidad_g: 100 });
  await qComidas.agregarItem({ id: 'ip3', comida_id: 'cp2', alimento_id: 'a1', cantidad_g: 200 });

  // Una sola query para todo el periodo: el promedio de la pantalla de
  // Progreso no puede salir a una consulta por comida.
  const items = await qComidas.listarItemsConAlimentoPorRango('u1', '2026-11-01', '2026-11-30');
  igual(items.length, 3, 'items del mes');
  igual(items[0].fecha, '2026-11-01', 'la fecha viene de la comida, no del item');
  igual(items[0].alimento_nombre, 'Milanesa casera', 'y el JOIN con alimento sigue ahi');

  // El corte es por la columna generada `fecha`, o sea por dia local: la cena
  // de las 21:00 del 5 tiene que quedar afuera de un rango que termina el 4.
  const cortado = await qComidas.listarItemsConAlimentoPorRango('u1', '2026-11-01', '2026-11-04');
  igual(cortado.length, 2, 'solo los del 1');
});

await prueba('listarEventosPorRangoFecha() corta por dia local, no por instante', async () => {
  await qEventos.crearEvento({
    id: 'evp-1', usuario_id: 'u1', tipo: 'gimnasio',
    fecha_hora_inicio: '2026-11-10T09:00:00-03:00', intensidad: 'media',
  });
  // 23:30 del ultimo dia del rango: con un BETWEEN sobre fecha_hora_inicio
  // armado a mano habria que acordarse de poner la hora, y este es el que se
  // escapa cuando alguien pone un T00:00:00 de mas.
  await qEventos.crearEvento({
    id: 'evp-2', usuario_id: 'u1', tipo: 'entrenamiento',
    fecha_hora_inicio: '2026-11-12T23:30:00-03:00', intensidad: 'alta',
  });
  await qEventos.crearEvento({
    id: 'evp-3', usuario_id: 'u1', tipo: 'partido',
    fecha_hora_inicio: '2026-11-13T10:00:00-03:00', intensidad: 'alta',
  });

  const r = await qEventos.listarEventosPorRangoFecha('u1', '2026-11-10', '2026-11-12');
  igual(r.map((e) => e.id).join(','), 'evp-1,evp-2', 'los dos dentro del rango, el del 13 afuera');
});

await prueba('borrar el perfil arrastra todo lo suyo (CASCADE)', async () => {
  await qPerfil.eliminarPerfil('u1');
  for (const t of ['comida', 'registro_sueno', 'registro_energia', 'registro_peso', 'registro_agua', 'evento', 'rutina']) {
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
  igual(r.n, 844, 'alimentos tras instalar');
  await schema.cerrarDb();
});

await prueba('segundo arranque: sale por el marcador, sin tocar el catalogo', async () => {
  const db = await schema.initDb(archivo);
  igual(await semillas.sembrarAlimentos(db), 0, 'filas insertadas');
  const r = await schema.getDb().getFirstAsync('SELECT count(*) AS n FROM alimento');
  igual(r.n, 844, 'alimentos tras reabrir');
  const v = await schema.getDb().getFirstAsync('PRAGMA user_version');
  igual(v.user_version, migrations.VERSION_ESQUEMA, 'user_version');
  await schema.cerrarDb();
});

// --- migracion de semilla entre versiones -----------------------------------
//
// Simula una base existente con la v1 ya sembrada (318 alimentos y meta=1).
// Al correr sembrarAlimentos(), debe insertar los lotes pendientes (411 del lote 2
// y 115 del lote 3 = 526) y actualizar la marca a 3 sin duplicar los 318 existentes.
await prueba('los lotes pendientes 2 y 3 se siembran sobre una base en lote 1', async () => {
  const archivoV1 = join(tmp, 'base-v1.db');
  const db = await schema.initDb(archivoV1);

  // Simular que solo estaba el lote 1 (318 filas) y la marca '1'
  await db.runAsync(
    "DELETE FROM alimento WHERE id NOT IN (SELECT id FROM alimento ORDER BY rowid LIMIT 318)");
  await meta.escribirMeta(db, 'semilla_alimentos', '1');
  const antes = await db.getFirstAsync('SELECT count(*) AS n FROM alimento');
  igual(antes.n, 318, 'base en v1 con 318 alimentos');

  // Ahora corremos sembrarAlimentos(), que debe aplicar lotes 2 y 3
  const insertadas = await semillas.sembrarAlimentos(db);
  igual(insertadas, 526, 'filas nuevas de lotes 2 y 3 insertadas');

  const despues = await db.getFirstAsync('SELECT count(*) AS n FROM alimento');
  igual(despues.n, 844, 'catalogo total tras sumar lotes 2 y 3');

  const v = await meta.leerMeta(db, 'semilla_alimentos');
  igual(v, '3', 'marca actualizada a version 3');

  // Segunda corrida: no debe insertar nada
  const reintento = await semillas.sembrarAlimentos(db);
  igual(reintento, 0, 'cero filas en segunda corrida');

  await schema.cerrarDb();
});

// Simula una base existente con v1 y v2 ya sembrados (729 alimentos y meta=2).
// Al correr sembrarAlimentos(), debe insertar exactamente los 115 del lote 3
// y actualizar la marca a 3 sin duplicar los 729 existentes.
await prueba('el lote 3 se siembra sobre una base que ya tiene el lote 1 y el 2', async () => {
  const archivoV2 = join(tmp, 'base-v2.db');
  const db = await schema.initDb(archivoV2);

  // Simular que estaban los lotes 1 y 2 (729 filas) y la marca '2'
  await db.runAsync(
    "DELETE FROM alimento WHERE id NOT IN (SELECT id FROM alimento ORDER BY rowid LIMIT 729)");
  await meta.escribirMeta(db, 'semilla_alimentos', '2');
  const antes = await db.getFirstAsync('SELECT count(*) AS n FROM alimento');
  igual(antes.n, 729, 'base en v2 con 729 alimentos');

  // Ahora corremos sembrarAlimentos(), que debe aplicar solo el lote 3
  const insertadas = await semillas.sembrarAlimentos(db);
  igual(insertadas, 115, 'filas nuevas del lote 3 insertadas');

  const despues = await db.getFirstAsync('SELECT count(*) AS n FROM alimento');
  igual(despues.n, 844, 'catalogo total tras sumar lote 3');

  const v = await meta.leerMeta(db, 'semilla_alimentos');
  igual(v, '3', 'marca actualizada a version 3');

  // Segunda corrida: no debe insertar nada
  const reintento = await semillas.sembrarAlimentos(db);
  igual(reintento, 0, 'cero filas en segunda corrida');

  await schema.cerrarDb();
});

// --- actualizar una base que ya tenia eventos -------------------------------
//
// Todo lo de arriba corre sobre bases nuevas, donde la 004 crea sus cosas y el
// backfill de `respondido` no encuentra una sola fila. Pero en el telefono de
// alguien que ya viene usando la app la 004 llega a una tabla `evento` con
// historial, y ahi el backfill es lo unico que evita que la primera apertura
// despues de actualizar sea un cartel por cada entrenamiento que registro.
//
// Se arma una base a mano en la version 3 (las migraciones publicadas antes de
// esta tanda), se le meten eventos, y recien ahi se migra.

const sqlite = req('expo-sqlite');
const viejaDb = join(tmp, 'v3-con-datos.db');

await prueba('la 004 sobre una base v3 con eventos: la migra sin perder nada', async () => {
  const db = await sqlite.openDatabaseAsync(viejaDb);
  for (const m of migrations.migraciones.filter((x) => x.version <= 3)) {
    await db.execAsync(m.sql);
  }
  await db.execAsync('PRAGMA user_version = 3');

  const t = '2020-01-01T00:00:00-03:00';
  await db.runAsync(
    'INSERT INTO perfil (id, fecha_alta, created_at, updated_at) VALUES (?, ?, ?, ?)',
    ['viejo', t, t, t],
  );
  const evento = (id, inicio, completado) =>
    db.runAsync(
      `INSERT INTO evento (id, usuario_id, tipo, fecha_hora_inicio, intensidad, completado, created_at, updated_at)
       VALUES (?, ?, 'entrenamiento', ?, 'media', ?, ?, ?)`,
      [id, 'viejo', inicio, completado, t, t],
    );
  await evento('hecho-hace-anos', '2020-01-15T20:00:00-03:00', 1);
  await evento('nunca-marcado', '2020-02-03T20:00:00-03:00', 0);
  await evento('agendado-a-futuro', '2099-06-01T09:00:00-03:00', 0);

  igual(await migrations.migrar(db), migrations.VERSION_ESQUEMA, 'version tras migrar');

  const filas = await db.getAllAsync('SELECT id, completado, respondido FROM evento ORDER BY id');
  igual(filas.length, 3, 'los eventos siguen ahi');

  const por = Object.fromEntries(filas.map((f) => [f.id, f]));
  // Lo que ya paso se da por contestado: nunca se le pregunto y preguntarle
  // ahora por un entrenamiento de hace anos no significa nada.
  igual(por['hecho-hace-anos'].respondido, 1, 'el viejo completado');
  igual(por['nunca-marcado'].respondido, 1, 'el viejo sin completar');
  igual(por['nunca-marcado'].completado, 0, 'y conserva su completado');
  // El futuro queda mudo a proposito: ese si hay que preguntarlo cuando pase.
  igual(por['agendado-a-futuro'].respondido, 0, 'el futuro sigue sin responder');

  // Las tablas nuevas llegaron por el camino de ALTER/CREATE, no por un CREATE
  // limpio: esta base ya existia antes de la 004 y de la 005.
  const r = await db.getFirstAsync("SELECT count(*) AS n FROM sqlite_master WHERE name = 'rutina'");
  igual(r.n, 1, 'la tabla rutina existe tras actualizar');
  const r5 = await db.getFirstAsync(
    "SELECT count(*) AS n FROM sqlite_master WHERE name = 'sesion_entrenamiento'");
  igual(r5.n, 1, 'la tabla sesion_entrenamiento existe tras actualizar');

  await db.closeAsync();
});

// La 005 sola, sobre una base que ya venia en v4. Es el salto que va a hacer
// cualquiera que tenga la app instalada de antes: la 005 solo CREA una tabla,
// asi que lo unico que hay que demostrar es que no toca el historial y que la
// tabla nueva queda usable contra un evento que ya existia.
await prueba('la 005 sobre una base v4 con historial: agrega la tabla y no toca nada', async () => {
  const db = await sqlite.openDatabaseAsync(join(tmp, 'v4-con-datos.db'));
  await db.execAsync('PRAGMA foreign_keys = ON;');
  for (const m of migrations.migraciones.filter((x) => x.version <= 4)) {
    await db.execAsync(m.sql);
  }
  await db.execAsync('PRAGMA user_version = 4');

  const t = '2020-01-01T00:00:00-03:00';
  await db.runAsync(
    'INSERT INTO perfil (id, fecha_alta, created_at, updated_at) VALUES (?, ?, ?, ?)',
    ['v4', t, t, t],
  );
  await db.runAsync(
    `INSERT INTO evento (id, usuario_id, tipo, fecha_hora_inicio, intensidad, completado, created_at, updated_at)
     VALUES ('ev-v4', 'v4', 'entrenamiento', '2025-05-01T18:00:00-03:00', 'media', 1, ?, ?)`,
    [t, t],
  );

  igual(await migrations.migrar(db), migrations.VERSION_ESQUEMA, 'version tras migrar');

  const e = await db.getFirstAsync("SELECT * FROM evento WHERE id = 'ev-v4'");
  igual(e === null, false, 'el evento viejo sigue ahi');
  igual(e.completado, 1, 'y conserva su completado');

  // La tabla nueva arranca vacia: las sesiones anteriores a la 005 no existen
  // y no hay nada que inventarles.
  const n = await db.getFirstAsync('SELECT count(*) AS n FROM sesion_entrenamiento');
  igual(n.n, 0, 'sin sesiones inventadas');

  // Y es usable contra un evento que ya venia de antes.
  await db.runAsync(
    `INSERT INTO sesion_entrenamiento
       (id, evento_id, modo, bloques, pasadas, trabajo_seg, descanso_seg, descanso_bloque_seg,
        bloques_completados, pasadas_completadas, duracion_real_seg, created_at, updated_at)
     VALUES ('ses-v4', 'ev-v4', 'pasadas', 1, 8, 20, 10, 0, 1, 8, 240, ?, ?)`,
    [t, t],
  );
  const ses = await db.getFirstAsync("SELECT * FROM sesion_entrenamiento WHERE id = 'ses-v4'");
  igual(ses.pasadas_completadas, 8, 'la sesion se escribio');
  igual(ses.distancia_km, null, 'la distancia es opcional');

  await db.closeAsync();
});

await prueba('la 006 sobre una base v5 con historial: backfill, recrea tabla y foreign_key_check limpio', async () => {
  const db = await sqlite.openDatabaseAsync(join(tmp, 'v5-con-datos.db'));
  await db.execAsync('PRAGMA foreign_keys = ON;');
  for (const m of migrations.migraciones.filter((x) => x.version <= 5)) {
    await db.execAsync(m.sql);
  }
  await db.execAsync('PRAGMA user_version = 5');

  const t = '2020-01-01T00:00:00-03:00';
  await db.runAsync(
    'INSERT INTO perfil (id, fecha_alta, created_at, updated_at) VALUES (?, ?, ?, ?)',
    ['u-v5', t, t, t],
  );
  await db.runAsync(
    `INSERT INTO evento (id, usuario_id, tipo, fecha_hora_inicio, intensidad, completado, created_at, updated_at)
     VALUES ('ev-v5-1', 'u-v5', 'entrenamiento', '2025-05-01T18:00:00-03:00', 'media', 1, ?, ?)`,
    [t, t],
  );
  await db.runAsync(
    `INSERT INTO evento (id, usuario_id, tipo, fecha_hora_inicio, intensidad, completado, created_at, updated_at)
     VALUES ('ev-v5-2', 'u-v5', 'entrenamiento', '2025-05-02T18:00:00-03:00', 'media', 1, ?, ?)`,
    [t, t],
  );
  // Sesion pasadas en v5 (trabajo_seg = 20)
  await db.runAsync(
    `INSERT INTO sesion_entrenamiento
       (id, evento_id, bloques, pasadas, trabajo_seg, descanso_seg, descanso_bloque_seg,
        bloques_completados, pasadas_completadas, duracion_real_seg, created_at, updated_at)
     VALUES ('ses-v5-pasadas', 'ev-v5-1', 1, 8, 20, 10, 0, 1, 8, 240, ?, ?)`,
    [t, t],
  );
  // Sesion cronometro en v5 (trabajo_seg = 0)
  await db.runAsync(
    `INSERT INTO sesion_entrenamiento
       (id, evento_id, bloques, pasadas, trabajo_seg, descanso_seg, descanso_bloque_seg,
        bloques_completados, pasadas_completadas, duracion_real_seg, created_at, updated_at)
     VALUES ('ses-v5-crono', 'ev-v5-2', 1, 1, 0, 0, 0, 1, 1, 500, ?, ?)`,
    [t, t],
  );

  // Migrar a v6
  igual(await migrations.migrar(db), migrations.VERSION_ESQUEMA, 'version tras migrar a v6');

  // PRAGMA foreign_key_check DEBE devolver 0 filas (observacion 2 del usuario)
  const fkCheck = await db.getAllAsync('PRAGMA foreign_key_check');
  igual(fkCheck.length, 0, 'sin violaciones de foreign key tras migrar 006');

  // Backfill correcto
  const sPasadas = await db.getFirstAsync("SELECT modo FROM sesion_entrenamiento WHERE id = 'ses-v5-pasadas'");
  igual(sPasadas.modo, 'pasadas', 'backfill de pasadas');

  const sCrono = await db.getFirstAsync("SELECT modo FROM sesion_entrenamiento WHERE id = 'ses-v5-crono'");
  igual(sCrono.modo, 'cronometro', 'backfill de cronometro');

  // Tabla serie y ejercicio existen y son operativas
  await db.runAsync(
    "INSERT INTO ejercicio (id, nombre, grupo, created_at, updated_at) VALUES ('ej-1', 'Dominadas', 'espalda', ?, ?)",
    [t, t],
  );
  await db.runAsync(
    "INSERT INTO serie (id, sesion_id, ejercicio_id, orden, repeticiones, peso_kg, created_at, updated_at) VALUES ('ser-1', 'ses-v5-pasadas', 'ej-1', 0, 10, NULL, ?, ?)",
    [t, t],
  );
  const fkCheck2 = await db.getAllAsync('PRAGMA foreign_key_check');
  igual(fkCheck2.length, 0, 'foreign key check con series');

  await db.closeAsync();
});

await prueba('la 007 sobre una base v6 con datos: agrega tablas de rutina_gimnasio y columnas FK limpias', async () => {
  const db = await sqlite.openDatabaseAsync(join(tmp, 'v6-con-datos.db'));
  await db.execAsync('PRAGMA foreign_keys = ON;');
  for (const m of migrations.migraciones.filter((x) => x.version <= 6)) {
    await db.execAsync(m.sql);
  }
  await db.execAsync('PRAGMA user_version = 6');

  const t = '2020-01-01T00:00:00-03:00';
  await db.runAsync(
    'INSERT INTO perfil (id, fecha_alta, created_at, updated_at) VALUES (?, ?, ?, ?)',
    ['u-v6', t, t, t],
  );
  await db.runAsync(
    `INSERT INTO evento (id, usuario_id, tipo, fecha_hora_inicio, intensidad, completado, created_at, updated_at)
     VALUES ('ev-v6-1', 'u-v6', 'entrenamiento', '2025-05-01T18:00:00-03:00', 'media', 1, ?, ?)`,
    [t, t],
  );
  await db.runAsync(
    `INSERT INTO sesion_entrenamiento
       (id, evento_id, modo, duracion_real_seg, created_at, updated_at)
     VALUES ('ses-v6-1', 'ev-v6-1', 'rutina', 3600, ?, ?)`,
    [t, t],
  );

  // Migrar a v7
  igual(await migrations.migrar(db), migrations.VERSION_ESQUEMA, 'version tras migrar a v7');

  const fkCheck = await db.getAllAsync('PRAGMA foreign_key_check');
  igual(fkCheck.length, 0, 'sin violaciones de FK tras migrar 007');

  // rutina_gimnasio existe
  const tabla = await db.getFirstAsync("SELECT name FROM sqlite_master WHERE type='table' AND name='rutina_gimnasio'");
  igual(tabla.name, 'rutina_gimnasio', 'tabla rutina_gimnasio creada en v7');

  await db.closeAsync();
});

await prueba('rutina_gimnasio: definir, materializar en agenda, ejecutar con series y metricas previas', async () => {
  await schema.initDb(':memory:');

  // 1. Crear usuario y perfil
  await qPerfil.crearPerfil({ id: 'u-gym-test', fecha_alta: '2026-10-01' });

  // Crear ejercicio de prueba
  await qEjercicios.crearEjercicio({
    id: 'ej-gym-bench',
    nombre: 'Press de Banca Plano',
    grupo: 'pecho',
  });

  // 2. Definir una rutina de gimnasio (catalogo puro de ejercicios)
  const rg = await qRutinasGimnasio.crearRutinaGimnasio({
    id: 'rg-pecho-triceps',
    usuario_id: 'u-gym-test',
    nombre: 'Pecho y Tríceps',
    activa: true,
    ejercicio_ids: ['ej-gym-bench'],
  });

  igual(rg.nombre, 'Pecho y Tríceps', 'nombre rutina gimnasio');
  igual(rg.ejercicios.length, 1, '1 ejercicio asignado');
  igual(rg.ejercicios[0].orden, 0, 'orden del ejercicio');

  // Programar los dias Lunes, Miercoles y Viernes en tabla rutina
  for (const dia of [1, 3, 5]) {
    await qRutinas.crearRutina({
      id: `rut-gym-${dia}`,
      usuario_id: 'u-gym-test',
      dia_semana: dia,
      hora: '18:30',
      tipo: 'gimnasio',
      duracion_estimada_min: 75,
      intensidad: 'media',
      rutina_gimnasio_id: 'rg-pecho-triceps',
      activa: true,
    });
  }

  // 3. Obtener del dia
  const delLunes = await qRutinasGimnasio.obtenerRutinasGimnasioDelDia('u-gym-test', 1);
  igual(delLunes.length, 1, 'aparece el lunes');
  igual(delLunes[0].hora, '18:30', 'hora obtenida desde rutina');
  igual(delLunes[0].duracion_estimada_min, 75, 'duracion estimada obtenida desde rutina');
  const delMartes = await qRutinasGimnasio.obtenerRutinasGimnasioDelDia('u-gym-test', 2);
  igual(delMartes.length, 0, 'no aparece el martes');

  // 4. Materializar en agenda (reutilizando materializarRutinas unificado)
  const n = await agenda.materializarRutinas('u-gym-test');
  igual(n > 0, true, 'materializo eventos en agenda');

  // Verificar que los eventos generados tienen tipo gimnasio y rutina_gimnasio_id
  const evs = await schema.getDb().getAllAsync(
    "SELECT * FROM evento WHERE usuario_id = 'u-gym-test' AND tipo = 'gimnasio'",
  );
  igual(evs.length > 0, true, 'eventos tipo gimnasio en la agenda');
  igual(evs[0].rutina_gimnasio_id, 'rg-pecho-triceps', 'evento apunta a rutina_gimnasio');
  igual(evs[0].duracion_estimada_min, 75, 'evento hereda duracion estimada');

  // 5. Ejecutar la primera sesion: cargar series de ejercicio
  const primerSesion = await guardarRutina.guardarRutinaTerminada({
    usuarioId: 'u-gym-test',
    inicio: new Date(2026, 9, 12, 18, 30, 0),
    series: [
      { ejercicioId: 'ej-gym-bench', repeticiones: 12, pesoKg: 50 },
      { ejercicioId: 'ej-gym-bench', repeticiones: 10, pesoKg: 55 },
    ],
    rutinaGimnasioId: 'rg-pecho-triceps',
    nombreRutina: 'Pecho y Tríceps',
  });
  igual(primerSesion.sesion.modo, 'rutina', 'sesion modo rutina');
  igual(primerSesion.sesion.rutina_gimnasio_id, 'rg-pecho-triceps', 'sesion asociada a rutina_gimnasio');

  // 6. Consultar referencias previas (ghost metrics) para el ejercicio
  const previas = await qSesiones.obtenerSeriesPreviasPorEjercicio('u-gym-test', 'ej-gym-bench');
  igual(previas.length, 2, '2 series previas recuperadas');
  igual(previas[0].repeticiones, 12, 'repes serie 1');
  igual(previas[0].peso_kg, 50, 'peso serie 1');
  igual(previas[1].repeticiones, 10, 'repes serie 2');
  igual(previas[1].peso_kg, 55, 'peso serie 2');

  // 7. Desactivar rutina y limpiar eventos futuros
  await agenda.desactivarRutinaGimnasioYLimpiar('rg-pecho-triceps');
  const rgDesactivada = await qRutinasGimnasio.obtenerRutinaGimnasio('rg-pecho-triceps');
  igual(rgDesactivada.activa, 0, 'rutina desactivada');

  // Verificar que el check de FK sigue impecable
  const fk = await schema.getDb().getAllAsync('PRAGMA foreign_key_check');
  igual(fk.length, 0, 'foreign key check limpio');
});

await prueba('crearRutina() persiste rutina_gimnasio_id y materializarRutinas() lo propaga al evento', async () => {
  const t = '2020-01-01T00:00:00-03:00';
  await schema.getDb().runAsync(
    'INSERT INTO perfil (id, fecha_alta, deporte_principal, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    ['u-rg-prop', t, 'futbol', t, t],
  );

  const rg = await qRutinasGimnasio.crearRutinaGimnasio({
    id: 'rg-prop-1',
    usuario_id: 'u-rg-prop',
    nombre: 'Espalda y Bíceps',
    ejercicio_ids: [],
  });

  const manana = (new Date().getDay() + 1) % 7;
  const rut = await qRutinas.crearRutina({
    id: 'ru-prop-1',
    usuario_id: 'u-rg-prop',
    dia_semana: manana,
    hora: '17:00',
    tipo: 'gimnasio',
    intensidad: 'media',
    rutina_gimnasio_id: rg.id,
  });
  igual(rut.rutina_gimnasio_id, 'rg-prop-1', 'rutina_gimnasio_id persistido en rutina');

  await agenda.materializarRutinas('u-rg-prop', 1);
  const evGenerado = await schema.getDb().getFirstAsync(
    'SELECT * FROM evento WHERE rutina_id = ?', ['ru-prop-1'],
  );
  igual(evGenerado.tipo, 'gimnasio', 'evento generado tipo gimnasio');
  igual(evGenerado.rutina_gimnasio_id, 'rg-prop-1', 'evento generado hereda rutina_gimnasio_id');
});

await prueba('rutina repetida multi-dia: asigna rutinas distintas y sesion libre sin mezclarse en Agenda', async () => {
  const t = '2020-01-01T00:00:00-03:00';
  await schema.getDb().runAsync(
    'INSERT INTO perfil (id, fecha_alta, deporte_principal, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    ['u-multi-gym', t, 'futbol', t, t],
  );

  // 1. Crear ejercicios y dos rutinas de gimnasio
  await qEjercicios.crearEjercicio({ id: 'ej-m-1', nombre: 'Press Banca', grupo: 'pecho' });
  await qEjercicios.crearEjercicio({ id: 'ej-m-2', nombre: 'Fondos', grupo: 'brazos' });
  await qEjercicios.crearEjercicio({ id: 'ej-m-3', nombre: 'Sentadilla', grupo: 'piernas' });
  await qEjercicios.crearEjercicio({ id: 'ej-m-4', nombre: 'Prensa', grupo: 'piernas' });
  await qEjercicios.crearEjercicio({ id: 'ej-m-5', nombre: 'Plancha', grupo: 'core' });

  const rgPecho = await qRutinasGimnasio.crearRutinaGimnasio({
    id: 'rg-multi-pecho',
    usuario_id: 'u-multi-gym',
    nombre: 'Pecho y Tríceps',
    ejercicio_ids: ['ej-m-1', 'ej-m-2'],
  });

  const rgPierna = await qRutinasGimnasio.crearRutinaGimnasio({
    id: 'rg-multi-pierna',
    usuario_id: 'u-multi-gym',
    nombre: 'Piernas y Core',
    ejercicio_ids: ['ej-m-3', 'ej-m-4', 'ej-m-5'],
  });

  // 2. Definir una regla semanal de 3 dias:
  // - Dia 1: Pecho y Triceps
  // - Dia 3: Piernas y Core
  // - Dia 5: Sin rutina fija (libre)
  await qRutinas.crearRutina({
    id: 'ru-mult-1',
    usuario_id: 'u-multi-gym',
    dia_semana: 1,
    hora: '18:00',
    tipo: 'gimnasio',
    duracion_estimada_min: 50,
    intensidad: 'media',
    rutina_gimnasio_id: rgPecho.id,
  });

  await qRutinas.crearRutina({
    id: 'ru-mult-3',
    usuario_id: 'u-multi-gym',
    dia_semana: 3,
    hora: '18:00',
    tipo: 'gimnasio',
    duracion_estimada_min: 60,
    intensidad: 'alta',
    rutina_gimnasio_id: rgPierna.id,
  });

  await qRutinas.crearRutina({
    id: 'ru-mult-5',
    usuario_id: 'u-multi-gym',
    dia_semana: 5,
    hora: '18:00',
    tipo: 'gimnasio',
    duracion_estimada_min: 45,
    intensidad: 'baja',
    rutina_gimnasio_id: null, // Sin rutina fija
  });

  // 3. Materializar en agenda para una semana fija (arrancando un domingo)
  const domingoAncla = new Date(2026, 9, 4, 0, 0, 0, 0); // 2026-10-04 fue domingo
  await agenda.materializarRutinas('u-multi-gym', 1, domingoAncla);

  // 4. Recuperar los eventos generados
  const eventos = await schema.getDb().getAllAsync(
    `SELECT * FROM evento WHERE usuario_id = 'u-multi-gym' ORDER BY fecha_hora_inicio ASC`,
  );
  igual(eventos.length, 3, '3 eventos generados en la semana');

  const evLunes = eventos.find((e) => e.rutina_id === 'ru-mult-1');
  const evMiercoles = eventos.find((e) => e.rutina_id === 'ru-mult-3');
  const evViernes = eventos.find((e) => e.rutina_id === 'ru-mult-5');

  igual(evLunes.rutina_gimnasio_id, 'rg-multi-pecho', 'lunes tiene rutina Pecho y Tríceps');
  igual(evMiercoles.rutina_gimnasio_id, 'rg-multi-pierna', 'miercoles tiene rutina Piernas y Core');
  igual(evViernes.rutina_gimnasio_id, null, 'viernes es libre sin rutina fija');

  // 5. Simular la resolucion visual de Agenda (agenda.tsx)
  const rutinasDisponibles = await qRutinasGimnasio.listarRutinasGimnasio('u-multi-gym', false);
  const resolverDetalle = (id) => rutinasDisponibles.find((r) => r.id === id) || null;

  // Lunes en Agenda:
  const detLunes = resolverDetalle(evLunes.rutina_gimnasio_id);
  const tituloLunes = detLunes?.nombre || evLunes.notas || 'Gimnasio';
  const subLunes = detLunes
    ? `${evLunes.duracion_estimada_min} min · ${detLunes.ejercicios.length} ejercicios`
    : `${evLunes.duracion_estimada_min} min · Sesión libre`;
  igual(tituloLunes, 'Pecho y Tríceps', 'titulo lunes correcto en agenda');
  igual(subLunes, '50 min · 2 ejercicios', 'subtitulo lunes correcto en agenda');

  // Miercoles en Agenda:
  const detMiercoles = resolverDetalle(evMiercoles.rutina_gimnasio_id);
  const tituloMiercoles = detMiercoles?.nombre || evMiercoles.notas || 'Gimnasio';
  const subMiercoles = detMiercoles
    ? `${evMiercoles.duracion_estimada_min} min · ${detMiercoles.ejercicios.length} ejercicios`
    : `${evMiercoles.duracion_estimada_min} min · Sesión libre`;
  igual(tituloMiercoles, 'Piernas y Core', 'titulo miercoles correcto en agenda');
  igual(subMiercoles, '60 min · 3 ejercicios', 'subtitulo miercoles correcto en agenda');

  // Viernes en Agenda:
  const detViernes = resolverDetalle(evViernes.rutina_gimnasio_id);
  const tituloViernes = detViernes?.nombre || evViernes.notas || 'Gimnasio';
  const subViernes = detViernes
    ? `${evViernes.duracion_estimada_min} min · ${detViernes.ejercicios.length} ejercicios`
    : `${evViernes.duracion_estimada_min} min · Sesión libre`;
  igual(tituloViernes, 'Gimnasio', 'titulo viernes muestra Gimnasio (no inventa rutina)');
  igual(subViernes, '45 min · Sesión libre', 'subtitulo viernes muestra Sesion libre');
});

// Este es el contrato que se rompio pantalla por pantalla despues de la 014:
// la rutina de gimnasio NO tiene dias propios, los trae de la tabla rutina.
// Lo que consumen Entrenamientos, Perfil > Mis rutinas, Nuevo evento y Agenda
// es el objeto que devuelven estas dos funciones, asi que se fija aca y no en
// cada pantalla.
await prueba('rutina de gimnasio: dias/hora siempre salen de la tabla rutina, nunca del catalogo', async () => {
  const t = '2020-01-01T00:00:00-03:00';
  await schema.getDb().runAsync(
    'INSERT INTO perfil (id, fecha_alta, deporte_principal, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    ['u-dias-gym', t, 'futbol', t, t],
  );
  await qEjercicios.crearEjercicio({ id: 'ej-dias-1', nombre: 'Peso Muerto', grupo: 'piernas' });

  const rg = await qRutinasGimnasio.crearRutinaGimnasio({
    id: 'rg-dias',
    usuario_id: 'u-dias-gym',
    nombre: 'Full Body',
    ejercicio_ids: ['ej-dias-1'],
  });

  // Recien creada: esta en el catalogo pero no asignada a ningun dia.
  igual(Array.isArray(rg.dias), true, 'dias es siempre un array, nunca undefined');
  igual(rg.dias.length, 0, 'sin asignar no tiene dias');
  igual(rg.hora, null, 'sin asignar no tiene hora');

  // La pantalla hace [...(r.dias ?? [])].sort(...): tiene que no explotar.
  igual([...rg.dias].sort().length, 0, 'los dias del catalogo se pueden mapear sin romper');

  // Asignarla a martes y jueves desde la tabla rutina.
  await qRutinas.crearRutina({
    id: 'ru-dias-2', usuario_id: 'u-dias-gym', dia_semana: 2, hora: '07:30',
    tipo: 'gimnasio', duracion_estimada_min: 45, intensidad: 'media', rutina_gimnasio_id: 'rg-dias',
  });
  await qRutinas.crearRutina({
    id: 'ru-dias-4', usuario_id: 'u-dias-gym', dia_semana: 4, hora: '07:30',
    tipo: 'gimnasio', duracion_estimada_min: 45, intensidad: 'media', rutina_gimnasio_id: 'rg-dias',
  });

  const porId = await qRutinasGimnasio.obtenerRutinaGimnasio('rg-dias');
  igual(porId.dias.join(','), '2,4', 'obtenerRutinaGimnasio trae los dias de la tabla rutina');
  igual(porId.hora, '07:30', 'obtenerRutinaGimnasio trae la hora de la tabla rutina');
  igual(porId.duracion_estimada_min, 45, 'obtenerRutinaGimnasio trae la duracion de la tabla rutina');

  const listadas = await qRutinasGimnasio.listarRutinasGimnasio('u-dias-gym', true);
  const enLista = listadas.find((r) => r.id === 'rg-dias');
  igual(enLista.dias.join(','), '2,4', 'listarRutinasGimnasio trae los dias (lo que usa Mis Rutinas)');

  const delDia = await qRutinasGimnasio.obtenerRutinasGimnasioDelDia('u-dias-gym', 4);
  igual(delDia.length, 1, 'obtenerRutinasGimnasioDelDia encuentra la rutina del jueves');
  igual(delDia[0].dias.join(','), '2,4', 'la rutina del dia tambien trae su semana completa');

  // Dar de baja la fila de rutina la saca de los dias, pero no del catalogo.
  await qRutinas.actualizarRutina('ru-dias-2', { activa: false });
  const trasBaja = await qRutinasGimnasio.obtenerRutinaGimnasio('rg-dias');
  igual(trasBaja.dias.join(','), '4', 'un dia dado de baja desaparece de dias');
  igual(trasBaja.ejercicios.length, 1, 'el catalogo de ejercicios sigue intacto');
});

await prueba('la 010 sobre una base v9 con datos: agrega modo_entrenamiento y corre backfill selectivo', async () => {
  const db = await sqlite.openDatabaseAsync(join(tmp, 'v9-con-datos.db'));
  await db.execAsync('PRAGMA foreign_keys = ON;');
  for (const m of migrations.migraciones.filter((x) => x.version <= 9)) {
    await db.execAsync(m.sql);
  }
  await db.execAsync('PRAGMA user_version = 9');

  const t = '2020-01-01T00:00:00-03:00';
  await db.runAsync(
    'INSERT INTO perfil (id, fecha_alta, created_at, updated_at) VALUES (?, ?, ?, ?)',
    ['u-v9', t, t, t],
  );
  await db.runAsync(
    `INSERT INTO rutina (id, usuario_id, dia_semana, hora, tipo, intensidad, created_at, updated_at)
     VALUES ('rut-v9', 'u-v9', 1, '18:00', 'entrenamiento', 'media', ?, ?)`,
    [t, t],
  );

  // 1. Evento de rutina programada CON sesion
  await db.runAsync(
    `INSERT INTO evento (id, usuario_id, tipo, fecha_hora_inicio, intensidad, completado, rutina_id, created_at, updated_at)
     VALUES ('ev-v9-rutina', 'u-v9', 'entrenamiento', '2025-05-01T18:00:00-03:00', 'media', 1, 'rut-v9', ?, ?)`,
    [t, t],
  );
  await db.runAsync(
    `INSERT INTO sesion_entrenamiento (id, evento_id, modo, duracion_real_seg, created_at, updated_at)
     VALUES ('ses-v9-1', 'ev-v9-rutina', 'cronometro', 1800, ?, ?)`,
    [t, t],
  );

  // 2. Evento suelto (sin rutina) CON sesion de cronometro
  await db.runAsync(
    `INSERT INTO evento (id, usuario_id, tipo, fecha_hora_inicio, intensidad, completado, rutina_id, created_at, updated_at)
     VALUES ('ev-v9-crono', 'u-v9', 'entrenamiento', '2025-05-02T10:00:00-03:00', 'media', 1, NULL, ?, ?)`,
    [t, t],
  );
  await db.runAsync(
    `INSERT INTO sesion_entrenamiento (id, evento_id, modo, duracion_real_seg, created_at, updated_at)
     VALUES ('ses-v9-2', 'ev-v9-crono', 'cronometro', 2400, ?, ?)`,
    [t, t],
  );

  // 3. Evento suelto (sin rutina) CON sesion de pasadas
  await db.runAsync(
    `INSERT INTO evento (id, usuario_id, tipo, fecha_hora_inicio, intensidad, completado, rutina_id, created_at, updated_at)
     VALUES ('ev-v9-pasadas', 'u-v9', 'entrenamiento', '2025-05-03T10:00:00-03:00', 'alta', 1, NULL, ?, ?)`,
    [t, t],
  );
  await db.runAsync(
    `INSERT INTO sesion_entrenamiento (id, evento_id, modo, duracion_real_seg, created_at, updated_at)
     VALUES ('ses-v9-3', 'ev-v9-pasadas', 'pasadas', 1200, ?, ?)`,
    [t, t],
  );

  // 4. Evento suelto SIN sesion
  await db.runAsync(
    `INSERT INTO evento (id, usuario_id, tipo, fecha_hora_inicio, intensidad, completado, rutina_id, created_at, updated_at)
     VALUES ('ev-v9-suelto', 'u-v9', 'entrenamiento', '2025-05-04T10:00:00-03:00', 'media', 1, NULL, ?, ?)`,
    [t, t],
  );

  // Migrar a v10
  igual(await migrations.migrar(db), migrations.VERSION_ESQUEMA, 'version tras migrar a v10');

  const evRutina = await db.getFirstAsync("SELECT modo_entrenamiento FROM evento WHERE id = 'ev-v9-rutina'");
  igual(evRutina.modo_entrenamiento, null, 'evento de rutina programada NO se pisa (queda NULL)');

  const evCrono = await db.getFirstAsync("SELECT modo_entrenamiento FROM evento WHERE id = 'ev-v9-crono'");
  igual(evCrono.modo_entrenamiento, 'cronometro', 'evento suelto con cronometro backfilleado a cronometro');

  const evPasadas = await db.getFirstAsync("SELECT modo_entrenamiento FROM evento WHERE id = 'ev-v9-pasadas'");
  igual(evPasadas.modo_entrenamiento, 'pasadas', 'evento suelto con pasadas backfilleado a pasadas');

  const evSuelto = await db.getFirstAsync("SELECT modo_entrenamiento FROM evento WHERE id = 'ev-v9-suelto'");
  igual(evSuelto.modo_entrenamiento, null, 'evento suelto sin sesion queda NULL');

  const fkCheck = await db.getAllAsync('PRAGMA foreign_key_check');
  igual(fkCheck.length, 0, 'foreign key check limpio tras migracion 010');

  await db.closeAsync();
});

await prueba('la 011 sobre una base v10 con datos: agrega columna deporte y corre backfill selectivo', async () => {
  const db = await sqlite.openDatabaseAsync(join(tmp, 'v10-con-datos.db'));
  await db.execAsync('PRAGMA foreign_keys = ON;');
  for (const m of migrations.migraciones.filter((x) => x.version <= 10)) {
    await db.execAsync(m.sql);
  }
  await db.execAsync('PRAGMA user_version = 10');

  const t = '2020-01-01T00:00:00-03:00';
  await db.runAsync(
    'INSERT INTO perfil (id, fecha_alta, deporte_principal, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    ['u-v10', t, 'padel', t, t],
  );

  // 1. Evento entrenamiento estandar (modo_entrenamiento IS NULL) -> DEBE recibir backfill
  await db.runAsync(
    `INSERT INTO evento (id, usuario_id, tipo, fecha_hora_inicio, intensidad, completado, modo_entrenamiento, created_at, updated_at)
     VALUES ('ev-v10-entrena-libre', 'u-v10', 'entrenamiento', '2025-05-01T18:00:00-03:00', 'media', 1, NULL, ?, ?)`,
    [t, t],
  );

  // 2. Evento entrenamiento estructurado con cronometro -> NO debe recibir backfill (queda NULL)
  await db.runAsync(
    `INSERT INTO evento (id, usuario_id, tipo, fecha_hora_inicio, intensidad, completado, modo_entrenamiento, created_at, updated_at)
     VALUES ('ev-v10-entrena-crono', 'u-v10', 'entrenamiento', '2025-05-02T10:00:00-03:00', 'media', 1, 'cronometro', ?, ?)`,
    [t, t],
  );

  // 3. Evento entrenamiento estructurado con pasadas -> NO debe recibir backfill (queda NULL)
  await db.runAsync(
    `INSERT INTO evento (id, usuario_id, tipo, fecha_hora_inicio, intensidad, completado, modo_entrenamiento, created_at, updated_at)
     VALUES ('ev-v10-entrena-pasadas', 'u-v10', 'entrenamiento', '2025-05-03T10:00:00-03:00', 'alta', 1, 'pasadas', ?, ?)`,
    [t, t],
  );

  // 4. Evento de otro tipo (partido) -> NO debe recibir backfill (queda NULL)
  await db.runAsync(
    `INSERT INTO evento (id, usuario_id, tipo, fecha_hora_inicio, intensidad, completado, modo_entrenamiento, created_at, updated_at)
     VALUES ('ev-v10-partido', 'u-v10', 'partido', '2025-05-04T10:00:00-03:00', 'alta', 1, NULL, ?, ?)`,
    [t, t],
  );

  // Migrar a v11
  igual(await migrations.migrar(db), migrations.VERSION_ESQUEMA, 'version tras migrar a v11');

  const evEntrenaLibre = await db.getFirstAsync("SELECT deporte FROM evento WHERE id = 'ev-v10-entrena-libre'");
  igual(evEntrenaLibre.deporte, 'padel', 'evento entrenamiento sin modo estructurado recibe deporte_principal');

  const evEntrenaCrono = await db.getFirstAsync("SELECT deporte FROM evento WHERE id = 'ev-v10-entrena-crono'");
  igual(evEntrenaCrono.deporte, null, 'evento estructurado con cronometro queda con deporte NULL');

  const evEntrenaPasadas = await db.getFirstAsync("SELECT deporte FROM evento WHERE id = 'ev-v10-entrena-pasadas'");
  igual(evEntrenaPasadas.deporte, null, 'evento estructurado con pasadas queda con deporte NULL');

  const evPartido = await db.getFirstAsync("SELECT deporte FROM evento WHERE id = 'ev-v10-partido'");
  igual(evPartido.deporte, null, 'evento partido queda con deporte NULL');

  const fkCheck = await db.getAllAsync('PRAGMA foreign_key_check');
  igual(fkCheck.length, 0, 'foreign key check limpio tras migracion 011');

  await db.closeAsync();
});

await prueba('la 012 sobre una base v11 con datos: agrega rutina_gimnasio_id a la tabla rutina', async () => {
  const db = await sqlite.openDatabaseAsync(join(tmp, 'v11-con-datos.db'));
  await db.execAsync('PRAGMA foreign_keys = ON;');
  for (const m of migrations.migraciones.filter((x) => x.version <= 11)) {
    await db.execAsync(m.sql);
  }
  await db.execAsync('PRAGMA user_version = 11');

  const t = '2020-01-01T00:00:00-03:00';
  await db.runAsync(
    'INSERT INTO perfil (id, fecha_alta, deporte_principal, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    ['u-v11', t, 'padel', t, t],
  );
  await db.runAsync(
    `INSERT INTO rutina (id, usuario_id, dia_semana, hora, tipo, intensidad, created_at, updated_at)
     VALUES ('rut-v11', 'u-v11', 1, '18:00', 'gimnasio', 'media', ?, ?)`,
    [t, t],
  );

  // Migrar a v12
  igual(await migrations.migrar(db), migrations.VERSION_ESQUEMA, 'version tras migrar a v12');

  const rut = await db.getFirstAsync("SELECT rutina_gimnasio_id FROM rutina WHERE id = 'rut-v11'");
  igual(rut.rutina_gimnasio_id, null, 'rutina existente queda con rutina_gimnasio_id NULL');

  const fkCheck = await db.getAllAsync('PRAGMA foreign_key_check');
  igual(fkCheck.length, 0, 'foreign key check limpio tras migracion 012');

  await db.closeAsync();
});

await prueba('etiquetaTipo resuelve deporte propio, fallback a principal, structured modes y generico', () => {
  const deporte = 'futbol';

  // Con deporte propio en el evento: prioriza el deporte propio del evento
  igual(
    formato.etiquetaTipo('entrenamiento', deporte, { deporte: 'tenis' }),
    'Tenis',
    'prioriza deporte propio del evento sobre deporte principal',
  );
  igual(
    formato.etiquetaTipo('entrenamiento', null, { deporte: 'natacion' }),
    'Natación',
    'deporte propio funciona aun sin deporte principal en el perfil',
  );

  // Sin deporte propio en el evento (o null): fallback al deporte principal del perfil
  igual(
    formato.etiquetaTipo('entrenamiento', deporte, { rutinaId: 'rut-1', modoEntrenamiento: null }),
    'Fútbol',
    'con rutina_id sin deporte propio cae a deporte principal',
  );
  igual(
    formato.etiquetaTipo('entrenamiento', deporte, { rutinaId: null, modoEntrenamiento: null }),
    'Fútbol',
    'sin rutina_id y sin deporte propio cae a deporte principal',
  );
  igual(
    formato.etiquetaTipo('entrenamiento', deporte),
    'Fútbol',
    'sin opciones cae a deporte principal',
  );

  // Modos estructurados: se priorizan por sobre cualquier deporte
  igual(
    formato.etiquetaTipo('entrenamiento', deporte, { modoEntrenamiento: 'cronometro', deporte: 'tenis' }),
    'Cronómetro libre',
    'modo cronometro libre tiene prioridad',
  );
  igual(
    formato.etiquetaTipo('entrenamiento', deporte, { modoEntrenamiento: 'pasadas', deporte: 'tenis' }),
    'Pasadas',
    'modo pasadas tiene prioridad',
  );
  igual(
    formato.etiquetaTipo('entrenamiento', deporte, { modoEntrenamiento: 'rutina', deporte: 'tenis' }),
    'Gimnasio',
    'modo rutina tiene prioridad',
  );

  // Fallback final: si ni el evento ni el perfil tienen deporte -> "Entrenamiento"
  igual(
    formato.etiquetaTipo('entrenamiento', null, { deporte: null }),
    'Entrenamiento',
    'sin deporte en evento ni perfil muestra Entrenamiento generico',
  );
  igual(
    formato.etiquetaTipo('entrenamiento', null),
    'Entrenamiento',
    'sin perfil ni opciones muestra Entrenamiento generico',
  );

  // Otros tipos de evento
  igual(
    formato.etiquetaTipo('gimnasio', deporte),
    'Gimnasio',
    'tipo gimnasio devuelve Gimnasio',
  );
  igual(
    formato.etiquetaTipo('partido', deporte),
    'Partido',
    'tipo partido devuelve Partido',
  );
  igual(
    formato.etiquetaTipo('competencia', deporte),
    'Competencia',
    'tipo competencia devuelve Competencia',
  );
});

await prueba('la 013 sobre una base con rutina_gimnasio_dia: migra a rutina y preserva eventos completados sin borrar historial', async () => {
  const db = await sqlite.openDatabaseAsync(join(tmp, 'v13-test.db'));
  await db.execAsync('PRAGMA foreign_keys = ON;');

  // Aplicar hasta v12
  for (let v = 1; v <= 12; v++) {
    const m = migrations.migraciones.find((mig) => mig.version === v);
    if (m) {
      await db.execAsync(m.sql);
    }
  }
  await db.execAsync('PRAGMA user_version = 12');

  // Insertar datos previos en v12
  const t = new Date().toISOString();
  await db.runAsync("INSERT INTO perfil (id, fecha_alta, created_at, updated_at) VALUES ('u-mig-13', '2026-09-01', ?, ?)", [t, t]);
  await db.runAsync(
    "INSERT INTO rutina_gimnasio (id, usuario_id, nombre, hora, duracion_estimada_min, activa, created_at, updated_at) VALUES ('rg-13', 'u-mig-13', 'Fuerza', '10:00', 60, 1, ?, ?)",
    [t, t],
  );
  // Asignar lunes (1) y miercoles (3) en rutina_gimnasio_dia
  await db.runAsync("INSERT INTO rutina_gimnasio_dia (rutina_gimnasio_id, dia_semana) VALUES ('rg-13', 1)");
  await db.runAsync("INSERT INTO rutina_gimnasio_dia (rutina_gimnasio_id, dia_semana) VALUES ('rg-13', 3)");

  // evento.rutina_id tiene FK a rutina(id) y la base corre con foreign_keys=ON,
  // asi que el evento "bueno" necesita una fila de rutina real a la que apuntar.
  // Se deja con rutina_gimnasio_id NULL (gimnasio libre) para que no satisfaga
  // el NOT EXISTS del paso 1 y la migracion igual cree los dos dias de rg-13.
  await db.runAsync(
    "INSERT INTO rutina (id, usuario_id, dia_semana, hora, tipo, duracion_estimada_min, intensidad, activa, rutina_gimnasio_id, created_at, updated_at) VALUES ('ru-previa-13', 'u-mig-13', 1, '10:00', 'gimnasio', 60, 'media', 1, NULL, ?, ?)",
    [t, t],
  );

  // Simular evento duplicado en fecha futura (2026-10-05 cae lunes):
  // e1: evento huerfano sin rutina_id, no completado
  // e2: evento con rutina_id
  // e3: evento huerfano COMPLETADO (NO debe borrarse jamas)
  await db.runAsync(
    "INSERT INTO evento (id, usuario_id, tipo, intensidad, fecha_hora_inicio, completado, respondido, rutina_gimnasio_id, created_at, updated_at) VALUES ('ev-fut-dup-huerfano', 'u-mig-13', 'gimnasio', 'media', '2026-10-05T10:00:00-03:00', 0, 0, 'rg-13', ?, ?)",
    [t, t],
  );
  await db.runAsync(
    "INSERT INTO evento (id, usuario_id, tipo, intensidad, fecha_hora_inicio, completado, respondido, rutina_gimnasio_id, rutina_id, created_at, updated_at) VALUES ('ev-fut-dup-bueno', 'u-mig-13', 'gimnasio', 'media', '2026-10-05T10:00:00-03:00', 0, 0, 'rg-13', 'ru-previa-13', ?, ?)",
    [t, t],
  );
  await db.runAsync(
    "INSERT INTO evento (id, usuario_id, tipo, intensidad, fecha_hora_inicio, completado, respondido, rutina_gimnasio_id, created_at, updated_at) VALUES ('ev-fut-completado', 'u-mig-13', 'gimnasio', 'media', '2026-10-07T10:00:00-03:00', 1, 1, 'rg-13', ?, ?)",
    [t, t],
  );

  // Aplicar migracion 13
  const m13 = migrations.migraciones.find((mig) => mig.version === 13);
  await db.withExclusiveTransactionAsync(async (txn) => {
    await txn.execAsync(m13.sql);
    await txn.execAsync('PRAGMA user_version = 13');
  });

  // Verificar que se migraron las filas a tabla rutina
  const rutinas = await db.getAllAsync("SELECT * FROM rutina WHERE usuario_id = 'u-mig-13' AND tipo = 'gimnasio' AND rutina_gimnasio_id = 'rg-13' ORDER BY dia_semana ASC");
  igual(rutinas.length, 2, 'migro los 2 dias a la tabla rutina');
  igual(rutinas[0].dia_semana, 1, 'lunes migrado');
  igual(rutinas[0].rutina_gimnasio_id, 'rg-13', 'apunta a rutina_gimnasio');
  igual(rutinas[1].dia_semana, 3, 'miercoles migrado');

  // Verificar duplicados: el huerfano no completado debe haberse borrado, el bueno conservarse
  const evBueno = await db.getFirstAsync("SELECT * FROM evento WHERE id = 'ev-fut-dup-bueno'");
  igual(Boolean(evBueno), true, 'evento bueno se conserva');
  const evHuerfano = await db.getFirstAsync("SELECT * FROM evento WHERE id = 'ev-fut-dup-huerfano'");
  igual(Boolean(evHuerfano), false, 'duplicado huerfano no completado fue eliminado');

  // CRITICO: el evento completado NO debe haberse borrado
  const evCompletado = await db.getFirstAsync("SELECT * FROM evento WHERE id = 'ev-fut-completado'");
  igual(Boolean(evCompletado), true, 'evento completado NO fue borrado');

  // Aplicar migracion 14
  const m14 = migrations.migraciones.find((mig) => mig.version === 14);
  await db.withExclusiveTransactionAsync(async (txn) => {
    await txn.execAsync(m14.sql);
    await txn.execAsync('PRAGMA user_version = 14');
  });

  // Verificar que rutina_gimnasio_dia ya no existe
  const tablaDia = await db.getFirstAsync("SELECT name FROM sqlite_master WHERE type='table' AND name = 'rutina_gimnasio_dia'");
  igual(Boolean(tablaDia), false, 'tabla rutina_gimnasio_dia fue eliminada en v14');

  // Verificar que las columnas hora y duracion_estimada_min ya no existen en rutina_gimnasio
  const cols = await db.getAllAsync("PRAGMA table_info(rutina_gimnasio)");
  const colNombres = cols.map((c) => c.name);
  igual(colNombres.includes('hora'), false, 'columna hora eliminada de rutina_gimnasio');
  igual(colNombres.includes('duracion_estimada_min'), false, 'columna duracion_estimada_min eliminada de rutina_gimnasio');

  await db.closeAsync();
});

// --- rutinas semanales sin duplicados (programarRutinaSemanal + migracion 015)
//
// El bug: cargar gimnasio L/M/Mi asignando rutinas por dia, y volver a hacerlo,
// dejaba dos filas activas por dia. De ahi dos eventos por fecha y el dia
// repetido en los badges de Entrenamientos (keys duplicadas en React).

await prueba('programarRutinaSemanal() dos veces con los mismos dias no duplica filas ni eventos', async () => {
  const t = '2020-01-01T00:00:00-03:00';
  await schema.getDb().runAsync(
    'INSERT INTO perfil (id, fecha_alta, created_at, updated_at) VALUES (?, ?, ?, ?)',
    ['u-prog', t, t, t],
  );
  await qEjercicios.crearEjercicio({ id: 'ej-prog-1', nombre: 'Press Prog', grupo: 'pecho' });
  for (const id of ['rg-prog-a', 'rg-prog-b']) {
    await qRutinasGimnasio.crearRutinaGimnasio({
      id, usuario_id: 'u-prog', nombre: id, ejercicio_ids: ['ej-prog-1'],
    });
  }

  const programacion = {
    usuarioId: 'u-prog', tipo: 'gimnasio', hora: '18:00',
    duracion_estimada_min: 60, intensidad: 'media',
    dias: [
      { dia_semana: 1, rutina_gimnasio_id: 'rg-prog-a' },
      { dia_semana: 2, rutina_gimnasio_id: 'rg-prog-b' },
      { dia_semana: 3, rutina_gimnasio_id: 'rg-prog-a' },
    ],
  };

  const primera = await agenda.programarRutinaSemanal(programacion, HOY);
  igual(primera.creadas, 3, 'la primera vez crea una fila por dia');

  const segunda = await agenda.programarRutinaSemanal(programacion, HOY);
  igual(segunda.creadas, 0, 'la segunda vez no crea nada');
  igual(segunda.actualizadas, 3, 'la segunda vez reutiliza las tres filas');

  const activas = await qRutinas.listarRutinas('u-prog', true);
  igual(activas.length, 3, 'filas activas de rutina');

  const repetidos = await schema.getDb().getAllAsync(
    `SELECT fecha FROM evento WHERE usuario_id = ?
     GROUP BY fecha, rutina_gimnasio_id HAVING count(*) > 1`,
    ['u-prog'],
  );
  igual(repetidos.length, 0, 'fechas con evento repetido');

  const rgA = await qRutinasGimnasio.obtenerRutinaGimnasio('rg-prog-a');
  igual(rgA.dias.join(','), '1,3', 'la rutina A no repite dias');
});

await prueba('programarRutinaSemanal() con otra hora actualiza la fila y regenera los eventos', async () => {
  await agenda.programarRutinaSemanal({
    usuarioId: 'u-prog', tipo: 'gimnasio', hora: '07:30',
    duracion_estimada_min: 60, intensidad: 'media',
    dias: [{ dia_semana: 1, rutina_gimnasio_id: 'rg-prog-a' }],
  }, HOY);

  const lunes = await qRutinas.buscarRutinaActivaDelDia('u-prog', 1, 'gimnasio', '07:30', 'rg-prog-a');
  igual(lunes.hora, '07:30', 'la fila del lunes tiene la hora nueva');

  const horas = await schema.getDb().getAllAsync(
    'SELECT DISTINCT substr(fecha_hora_inicio, 12, 5) AS h FROM evento WHERE rutina_id = ?',
    [lunes.id],
  );
  igual(horas.map((x) => x.h).join(','), '07:30', 'los eventos futuros del lunes van a la hora nueva');
  igual((await qRutinas.listarRutinas('u-prog', true)).length, 3, 'siguen siendo 3 filas activas');
});

await prueba('la base rechaza una segunda fila activa de la misma rutina el mismo dia', () =>
  lanza(
    () =>
      qRutinas.crearRutina({
        id: 'ru-prog-dup', usuario_id: 'u-prog', dia_semana: 1, hora: '20:00',
        tipo: 'gimnasio', intensidad: 'media', rutina_gimnasio_id: 'rg-prog-a',
      }),
    /UNIQUE/i,
    'duplicado de rg-prog-a el lunes',
  ),
);

await prueba('la 015 sobre una base v14 con duplicados: deja la fila mas vieja y limpia sus eventos futuros', async () => {
  const db = await sqlite.openDatabaseAsync(join(tmp, 'v15-test.db'));
  await db.execAsync('PRAGMA foreign_keys = ON;');
  for (let v = 1; v <= 14; v++) {
    await db.execAsync(migrations.migraciones.find((mig) => mig.version === v).sql);
  }
  await db.execAsync('PRAGMA user_version = 14');

  const t = '2026-09-01T00:00:00.000Z';
  const tDespues = '2026-09-02T00:00:00.000Z';
  await db.runAsync("INSERT INTO perfil (id, fecha_alta, created_at, updated_at) VALUES ('u-15', '2026-09-01', ?, ?)", [t, t]);
  await db.runAsync("INSERT INTO rutina_gimnasio (id, usuario_id, nombre, activa, created_at, updated_at) VALUES ('rg-15', 'u-15', 'Pecho', 1, ?, ?)", [t, t]);

  const insertarRutina = (id, dia, hora, rg, creada) =>
    db.runAsync(
      `INSERT INTO rutina (id, usuario_id, dia_semana, hora, tipo, duracion_estimada_min, intensidad, activa, rutina_gimnasio_id, created_at, updated_at)
       VALUES (?, 'u-15', ?, ?, 'gimnasio', 60, 'media', 1, ?, ?, ?)`,
      [id, dia, hora, rg, creada, creada],
    );
  await insertarRutina('ru-15-vieja', 1, '18:00', 'rg-15', t);
  await insertarRutina('ru-15-dup', 1, '18:00', 'rg-15', tDespues);
  await insertarRutina('ru-15-libre', 2, '10:00', null, t);
  await insertarRutina('ru-15-libre-dup', 2, '10:00', null, tDespues);

  const insertarEvento = (id, rutinaId, inicio, completado) =>
    db.runAsync(
      `INSERT INTO evento (id, usuario_id, tipo, intensidad, fecha_hora_inicio, completado, respondido, rutina_id, rutina_gimnasio_id, created_at, updated_at)
       VALUES (?, 'u-15', 'gimnasio', 'media', ?, ?, ?, ?, 'rg-15', ?, ?)`,
      [id, inicio, completado, completado, rutinaId, t, t],
    );
  // 2027-01-04 cae lunes: en el futuro sin importar cuando corra la prueba.
  await insertarEvento('ev-15-bueno', 'ru-15-vieja', '2027-01-04T18:00:00-03:00', 0);
  await insertarEvento('ev-15-dup', 'ru-15-dup', '2027-01-04T18:00:00-03:00', 0);
  await insertarEvento('ev-15-pasado', 'ru-15-dup', '2025-01-06T18:00:00-03:00', 1);

  const m15 = migrations.migraciones.find((mig) => mig.version === 15);
  await db.withExclusiveTransactionAsync(async (txn) => {
    await txn.execAsync(m15.sql);
    await txn.execAsync('PRAGMA user_version = 15');
  });

  const activas = await db.getAllAsync("SELECT id FROM rutina WHERE activa = 1 ORDER BY id");
  igual(activas.map((r) => r.id).join(','), 'ru-15-libre,ru-15-vieja', 'sobreviven las filas mas viejas');

  const eventos = await db.getAllAsync('SELECT id FROM evento ORDER BY id');
  igual(eventos.map((e) => e.id).join(','), 'ev-15-bueno,ev-15-pasado',
    'se borra el evento futuro del duplicado; el historial queda');

  await lanza(
    () => insertarRutina('ru-15-otra', 1, '20:00', 'rg-15', tDespues),
    /UNIQUE/i,
    'el indice unico existe tras la 015',
  );

  await db.closeAsync();
});

// --- salida ----------------------------------------------------------------

rmSync(tmp, { recursive: true, force: true });

console.log(`\n${ok} pasan, ${fallos.length} fallan`);
if (fallos.length) {
  for (const f of fallos) console.log('  -', f);
  process.exit(1);
}
