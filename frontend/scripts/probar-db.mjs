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
const semillas = req('./db/seeds/alimentos.js');
const alimentosAr = req('./db/seeds/alimentos-ar.js');
const alimentosLote2 = req('./db/seeds/alimentos-ar-lote2.js');
const agenda = req('./features/agenda/materializar.js');
const qSesiones = req('./db/queries/sesiones.js');
const entrenamiento = req('./features/entrenamiento/guardarSesion.js');
const T = req('./features/entrenamiento/temporizador.js');

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

await prueba('las 11 tablas existen', async () => {
  const filas = await schema
    .getDb()
    .getAllAsync("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
  const nombres = filas.map((f) => f.name);
  const esperadas = [
    'alimento', 'comida', 'evento', 'item_comida', 'meta',
    'perfil', 'registro_energia', 'registro_peso', 'registro_sueno', 'rutina',
    'sesion_entrenamiento',
  ];
  igual(nombres.join(','), esperadas.join(','), 'tablas');
});

// --- semilla de alimentos ---------------------------------------------------

await prueba('la semilla cargo el catalogo entero', async () => {
  const r = await schema.getDb().getFirstAsync(
    "SELECT count(*) AS n FROM alimento WHERE fuente = 'manual' AND verificado = 1");
  igual(r.n, 729, 'alimentos sembrados');
});

await prueba('el validador de coherencia no detecta errores en el catalogo unificado', async () => {
  const todos = [...alimentosAr.ALIMENTOS_AR, ...alimentosLote2.ALIMENTOS_AR_LOTE2];
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

await prueba('borrar el perfil arrastra todo lo suyo (CASCADE)', async () => {
  await qPerfil.eliminarPerfil('u1');
  for (const t of ['comida', 'registro_sueno', 'registro_energia', 'registro_peso', 'evento', 'rutina']) {
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
  igual(r.n, 729, 'alimentos tras instalar');
  await schema.cerrarDb();
});

await prueba('segundo arranque: sale por el marcador, sin tocar el catalogo', async () => {
  const db = await schema.initDb(archivo);
  igual(await semillas.sembrarAlimentos(db), 0, 'filas insertadas');
  const r = await schema.getDb().getFirstAsync('SELECT count(*) AS n FROM alimento');
  igual(r.n, 729, 'alimentos tras reabrir');
  const v = await schema.getDb().getFirstAsync('PRAGMA user_version');
  igual(v.user_version, migrations.VERSION_ESQUEMA, 'user_version');
  await schema.cerrarDb();
});

// --- migracion de semilla v1 a v2 -------------------------------------------
//
// Simula una base existente con la v1 ya sembrada (318 alimentos y meta=1).
// Al correr sembrarAlimentos(), debe insertar exactamente los 411 del lote 2
// y actualizar la marca a 2 sin duplicar los 318 existentes.
await prueba('el lote 2 se siembra sobre una base que ya tiene el lote 1', async () => {
  const archivoV1 = join(tmp, 'base-v1.db');
  const db = await schema.initDb(archivoV1);

  // Simular que solo estaba el lote 1 (318 filas) y la marca '1'
  await db.runAsync(
    "DELETE FROM alimento WHERE id NOT IN (SELECT id FROM alimento ORDER BY rowid LIMIT 318)");
  await meta.escribirMeta(db, 'semilla_alimentos', '1');
  const antes = await db.getFirstAsync('SELECT count(*) AS n FROM alimento');
  igual(antes.n, 318, 'base en v1 con 318 alimentos');

  // Ahora corremos sembrarAlimentos(), que debe aplicar solo el lote 2
  const insertadas = await semillas.sembrarAlimentos(db);
  igual(insertadas, 411, 'filas nuevas del lote 2 insertadas');

  const despues = await db.getFirstAsync('SELECT count(*) AS n FROM alimento');
  igual(despues.n, 729, 'catalogo total tras sumar lote 2');

  const v = await meta.leerMeta(db, 'semilla_alimentos');
  igual(v, '2', 'marca actualizada a version 2');

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
       (id, evento_id, bloques, pasadas, trabajo_seg, descanso_seg, descanso_bloque_seg,
        bloques_completados, pasadas_completadas, duracion_real_seg, created_at, updated_at)
     VALUES ('ses-v4', 'ev-v4', 1, 8, 20, 10, 0, 1, 8, 240, ?, ?)`,
    [t, t],
  );
  const ses = await db.getFirstAsync("SELECT * FROM sesion_entrenamiento WHERE id = 'ses-v4'");
  igual(ses.pasadas_completadas, 8, 'la sesion se escribio');
  igual(ses.distancia_km, null, 'la distancia es opcional');

  await db.closeAsync();
});

// --- salida ----------------------------------------------------------------

rmSync(tmp, { recursive: true, force: true });

console.log(`\n${ok} pasan, ${fallos.length} fallan`);
if (fallos.length) {
  for (const f of fallos) console.log('  -', f);
  process.exit(1);
}
