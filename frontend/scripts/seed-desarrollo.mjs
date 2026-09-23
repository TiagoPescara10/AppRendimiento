// scripts/seed-desarrollo.mjs
//
// Seed de datos realistas para entorno de desarrollo.
//
// IMPORTANTE:
// Este script es EXCLUSIVAMENTE para desarrollo y pruebas locales.
// NO se llama nunca desde initDb() ni desde ningun flujo de la aplicacion en
// produccion. Se ejecuta manualmente desde la terminal contra la base SQLite
// local del entorno, simulador o dispositivo.
//
// Uso:
//   node scripts/seed-desarrollo.mjs [--db <ruta_o_nombre>] [--perfil <id_perfil>]
//
// Ejemplos:
//   node scripts/seed-desarrollo.mjs
//   node scripts/seed-desarrollo.mjs --db apprendimiento.db
//   node scripts/seed-desarrollo.mjs --db /ruta/a/apprendimiento.db --perfil mi-usuario-uuid
//
// Que carga:
//   1. Registros de peso: ~18 pesadas en las ultimas 7 semanas con tendencia realista.
//   2. Rutinas de entrenamiento deportivo: Futbol martes y jueves a las 19:00.
//   3. Rutinas de gimnasio: "Lunes: Pecho y triceps" y "Miercoles: Espalda y biceps"
//      con ejercicios reales del catalogo base.
//   4. Eventos y sesiones completadas en las ultimas 4 semanas con progresion leve de
//      cargas (series, repeticiones y peso creciente para Fuerza y Progresion y Progreso).
//   5. Comidas registradas en 22 de los ultimos 30 dias con alimentos reales del catalogo.
//   6. Materializacion de las proximas semanas en la agenda.

process.env.TZ = 'America/Argentina/Buenos_Aires';

import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, '..');

// --- Compilacion de TypeScript en temporal con shims de Expo ----------------

const tmp = mkdtempSync(join(tmpdir(), 'seed-desarrollo-'));
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
      baseUrl: RAIZ,
      paths: { '@/*': ['src/*'] },
    },
    include: [
      join(RAIZ, 'src/db/**/*.ts'),
      join(RAIZ, 'src/lib/**/*.ts'),
      join(RAIZ, 'src/features/agenda/**/*.ts'),
      join(RAIZ, 'src/features/entrenamiento/guardarSesion.ts'),
      join(RAIZ, 'src/features/entrenamiento/guardarRutina.ts'),
      join(RAIZ, 'src/features/comidas/porciones.ts'),
    ],
  }),
);

try {
  execFileSync('npx', ['tsc', '-p', tsconfig], { cwd: RAIZ, stdio: 'pipe' });
} catch (e) {
  console.error('Error al compilar codigo TypeScript para el seed:\n' + (e.stdout?.toString() ?? e.message));
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

process.on('exit', () => {
  try {
    rmSync(tmp, { recursive: true, force: true });
  } catch {}
});

// --- Carga de modulos compilados -------------------------------------------

const schema = req('./db/schema.js');
const qPerfil = req('./db/queries/perfil.js');
const qPeso = req('./db/queries/peso.js');
const qRutinas = req('./db/queries/rutinas.js');
const qRutinasGimnasio = req('./db/queries/rutinasGimnasio.js');
const qEjercicios = req('./db/queries/ejercicios.js');
const qEventos = req('./db/queries/eventos.js');
const qSesiones = req('./db/queries/sesiones.js');
const qComidas = req('./db/queries/comidas.js');
const qAlimentos = req('./db/queries/alimentos.js');
const guardarRutina = req('./features/entrenamiento/guardarRutina.js');
const agenda = req('./features/agenda/materializar.js');
const uuid = req('./db/sync/uuid.js');
const fechas = req('./lib/fechas.js');

// --- Parseo de argumentos de linea de comandos -----------------------------

function parsearArgs() {
  const args = process.argv.slice(2);
  let rutaDb = schema.NOMBRE_DB;
  let perfilId = null;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h' || arg === '--ayuda') {
      console.log(`
Seed de desarrollo para AppRendimiento

Uso:
  node scripts/seed-desarrollo.mjs [opciones]

Opciones:
  --db <ruta>        Ruta o nombre del archivo de base de datos SQLite (default: ${schema.NOMBRE_DB})
  --perfil <id>      ID del perfil a poblar (default: toma el unico perfil si hay uno solo)
  -h, --help         Muestra este mensaje de ayuda
`);
      process.exit(0);
    } else if (arg === '--db' && i + 1 < args.length) {
      rutaDb = args[++i];
    } else if ((arg === '--perfil' || arg === '--perfil-id') && i + 1 < args.length) {
      perfilId = args[++i];
    } else if (!arg.startsWith('--') && (arg.endsWith('.db') || arg.endsWith('.sqlite'))) {
      rutaDb = arg;
    }
  }

  return { rutaDb, perfilId };
}

// --- Helpers de fechas y numeros -------------------------------------------

function restarDias(fecha, dias) {
  const d = new Date(fecha.getTime());
  d.setDate(d.getDate() - dias);
  return d;
}

function fijarHora(fecha, horaStr) {
  const [hh, mm] = horaStr.split(':').map(Number);
  const d = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate(), hh, mm, 0, 0);
  return d;
}

function redondear1Dec(num) {
  return Math.round(num * 10) / 10;
}

// --- Logica principal del seed ---------------------------------------------

async function ejecutarSeed() {
  const { rutaDb, perfilId } = parsearArgs();

  console.log(`\n======================================================`);
  console.log(`  Seed de desarrollo - AppRendimiento`);
  console.log(`======================================================\n`);
  console.log(`[db] Conectando a la base: ${rutaDb}`);

  const db = await schema.initDb(rutaDb);

  // 1. Obtener perfil
  const perfiles = await db.getAllAsync('SELECT * FROM perfil ORDER BY created_at ASC');
  let perfil = null;

  if (perfilId) {
    perfil = await qPerfil.obtenerPerfil(perfilId);
    if (!perfil) {
      console.error(`[error] No se encontro ningun perfil con el ID: ${perfilId}`);
      process.exit(1);
    }
  } else {
    if (perfiles.length === 0) {
      console.log(`[perfil] No se encontro perfil en la base: creando perfil por defecto para pruebas...`);
      const fechaAlta = fechas.aISOLocal(restarDias(new Date(), 60));
      perfil = await qPerfil.crearPerfil({
        id: uuid.randomUUID(),
        nombre: 'Usuario Desarrollo',
        fecha_alta: fechaAlta,
        fecha_nacimiento: '1998-05-15',
        sexo_biologico: 'masculino',
        altura_cm: 180,
        nivel_actividad: 'alto',
        deporte_principal: 'Futbol',
        objetivo: 'bajar',
        peso_objetivo_kg: 76.0,
        meta_agua_manual_ml: 2500,
        modo_nutricion: 'objetivo',
      });
      console.log(`[perfil] Perfil creado exitosamente: ${perfil.nombre} (${perfil.id})`);
    } else if (perfiles.length === 1) {
      perfil = perfiles[0];
    } else {
      console.error(`[error] Hay multiples perfiles en la base de datos (${perfiles.length}):`);
      for (const p of perfiles) {
        console.error(`  - ID: ${p.id} (Nombre: ${p.nombre ?? 'Sin nombre'})`);
      }
      console.error(`\nPor favor, ejecuta el script especificando el perfil con --perfil <id>.`);
      process.exit(1);
    }
  }

  console.log(`[perfil] Usando perfil: ${perfil.nombre ?? 'Sin nombre'} (${perfil.id})`);

  const hoy = new Date();
  const fechaHoyStr = fechas.aFechaLocal(hoy);

  // -------------------------------------------------------------------------
  // 1. Registros de peso (ultimas 7-8 semanas, tendencia bajista realista)
  // -------------------------------------------------------------------------
  console.log(`\n--- 1. Cargando registros de peso ---`);

  // Peso inicial segun objetivo del perfil o un estandar realista
  let pesoInicial = 82.8;
  if (perfil.peso_objetivo_kg && perfil.peso_objetivo_kg > 0) {
    pesoInicial = perfil.peso_objetivo_kg + 4.5;
  }

  // Lista de dias hacia atras donde hubo pesada (unos 18 registros en ~50 dias)
  const diasHaciaAtras = [
    50, 47, 44, 41, 38, 35, 32, 29, 26, 23, 20, 17, 14, 11, 8, 5, 3, 1,
  ];

  // Ruido controlado para que la linea no sea recta
  const ruidos = [
    0.0, 0.2, -0.1, 0.3, -0.2, 0.1, -0.3, 0.2, -0.1, 0.2, -0.2, 0.1, -0.1, 0.2, -0.3, 0.1, -0.1, 0.0,
  ];

  let pesosCargados = 0;
  for (let i = 0; i < diasHaciaAtras.length; i++) {
    const diasAtras = diasHaciaAtras[i];
    const fechaPesada = restarDias(hoy, diasAtras);
    const fechaStr = fechas.aFechaLocal(fechaPesada);

    // Caida promedio de 0.08 kg por dia + ruido
    const caidaAcumulada = (50 - diasAtras) * 0.08;
    const pesoCalc = redondear1Dec(pesoInicial - caidaAcumulada + ruidos[i]);

    // Verificar si ya existe un registro para no duplicar en esa fecha
    const existente = await db.getFirstAsync(
      'SELECT id FROM registro_peso WHERE usuario_id = ? AND fecha = ?',
      [perfil.id, fechaStr],
    );

    if (!existente) {
      await qPeso.crearRegistroPeso({
        id: uuid.randomUUID(),
        usuario_id: perfil.id,
        peso_kg: pesoCalc,
        fecha: fechaStr,
        fuente: 'manual',
      });
      pesosCargados++;
    }
  }

  console.log(`[peso] Se cargaron ${pesosCargados} registros de peso (desde ${pesoInicial} kg con tendencia realista).`);

  // -------------------------------------------------------------------------
  // 2. Rutinas deportivas de entrenamiento (Futbol martes y jueves 19:00)
  // -------------------------------------------------------------------------
  console.log(`\n--- 2. Cargando rutinas de entrenamiento deportivo ---`);

  // Buscar si ya existen rutinas de futbol para martes o jueves
  const rutinasExistentes = await qRutinas.listarRutinas(perfil.id, false);

  let rutinaFutbolMartes = rutinasExistentes.find(
    (r) => r.dia_semana === 2 && r.hora === '19:00' && r.tipo === 'entrenamiento',
  );
  if (!rutinaFutbolMartes) {
    rutinaFutbolMartes = await qRutinas.crearRutina({
      id: uuid.randomUUID(),
      usuario_id: perfil.id,
      dia_semana: 2, // Martes
      hora: '19:00',
      tipo: 'entrenamiento',
      duracion_estimada_min: 90,
      intensidad: 'alta',
      activa: true,
    });
    console.log(`[rutina] Creada rutina: Futbol - Martes 19:00`);
  } else {
    console.log(`[rutina] Ya existia rutina: Futbol - Martes 19:00`);
  }

  let rutinaFutbolJueves = rutinasExistentes.find(
    (r) => r.dia_semana === 4 && r.hora === '19:00' && r.tipo === 'entrenamiento',
  );
  if (!rutinaFutbolJueves) {
    rutinaFutbolJueves = await qRutinas.crearRutina({
      id: uuid.randomUUID(),
      usuario_id: perfil.id,
      dia_semana: 4, // Jueves
      hora: '19:00',
      tipo: 'entrenamiento',
      duracion_estimada_min: 90,
      intensidad: 'alta',
      activa: true,
    });
    console.log(`[rutina] Creada rutina: Futbol - Jueves 19:00`);
  } else {
    console.log(`[rutina] Ya existia rutina: Futbol - Jueves 19:00`);
  }

  // Las rutinas semanales de gimnasio se crean mas abajo, despues de las
  // rutinas de gimnasio en si: desde la 014 la fila de `rutina` es la que
  // guarda el dia y tiene que apuntar al catalogo con rutina_gimnasio_id.

  // -------------------------------------------------------------------------
  // 3. Rutinas de gimnasio con ejercicios del catalogo
  // -------------------------------------------------------------------------
  console.log(`\n--- 3. Cargando rutinas de gimnasio ---`);

  // Buscamos ejercicios reales en el catalogo
  async function buscarEjercicioSeguro(nombreParcial) {
    const lista = await qEjercicios.buscarEjercicios(nombreParcial);
    if (lista.length > 0) return lista[0];
    throw new Error(`Ejercicio no encontrado en catalogo: ${nombreParcial}`);
  }

  const ejPressPlano = await buscarEjercicioSeguro('Press de banca plano con barra');
  const ejPressInclinado = await buscarEjercicioSeguro('Press de banca inclinado con mancuernas');
  const ejCrucesPolea = await buscarEjercicioSeguro('Cruces en polea');
  const ejTricepsPolea = await buscarEjercicioSeguro('Extension de triceps en polea con soga');

  const ejRemoBarra = await buscarEjercicioSeguro('Remo con barra');
  const ejJalonPecho = await buscarEjercicioSeguro('Jalon al pecho en polea');
  const ejRemoMancuerna = await buscarEjercicioSeguro('Remo con mancuerna a una mano');
  const ejCurlBiceps = await buscarEjercicioSeguro('Curl de biceps con barra de pie');

  // Rutina 1: Lunes: Pecho y triceps
  const rutinasGimExistentes = await qRutinasGimnasio.listarRutinasGimnasio(perfil.id, false);

  let rutinaGim1 = rutinasGimExistentes.find((r) => r.nombre.includes('Pecho y triceps'));
  if (!rutinaGim1) {
    rutinaGim1 = await qRutinasGimnasio.crearRutinaGimnasio({
      id: uuid.randomUUID(),
      usuario_id: perfil.id,
      nombre: 'Lunes: Pecho y triceps',
      activa: true,
      ejercicio_ids: [ejPressPlano.id, ejPressInclinado.id, ejCrucesPolea.id, ejTricepsPolea.id],
    });
    console.log(`[rutina_gim] Creada rutina: Lunes: Pecho y triceps (4 ejercicios)`);
  } else {
    console.log(`[rutina_gim] Ya existia rutina: Lunes: Pecho y triceps`);
  }

  // Rutina 2: Miercoles: Espalda y biceps
  let rutinaGim2 = rutinasGimExistentes.find((r) => r.nombre.includes('Espalda y biceps'));
  if (!rutinaGim2) {
    rutinaGim2 = await qRutinasGimnasio.crearRutinaGimnasio({
      id: uuid.randomUUID(),
      usuario_id: perfil.id,
      nombre: 'Miercoles: Espalda y biceps',
      activa: true,
      ejercicio_ids: [ejRemoBarra.id, ejJalonPecho.id, ejRemoMancuerna.id, ejCurlBiceps.id],
    });
    console.log(`[rutina_gim] Creada rutina: Miercoles: Espalda y biceps (4 ejercicios)`);
  } else {
    console.log(`[rutina_gim] Ya existia rutina: Miercoles: Espalda y biceps`);
  }

  // Programacion semanal del gimnasio: una fila de `rutina` por dia, apuntando
  // al catalogo con rutina_gimnasio_id. Es lo unico que hace que la rutina
  // aparezca con sus dias en Entrenamientos, Perfil > Mis rutinas y Agenda.
  let rutinaGimLunes = rutinasExistentes.find(
    (r) => r.dia_semana === 1 && r.hora === '18:00' && r.tipo === 'gimnasio',
  );
  if (!rutinaGimLunes) {
    rutinaGimLunes = await qRutinas.crearRutina({
      id: uuid.randomUUID(),
      usuario_id: perfil.id,
      dia_semana: 1, // Lunes
      hora: '18:00',
      tipo: 'gimnasio',
      duracion_estimada_min: 60,
      intensidad: 'media',
      rutina_gimnasio_id: rutinaGim1.id,
      activa: true,
    });
    console.log(`[rutina] Creada rutina semanal: Gimnasio - Lunes 18:00`);
  }

  let rutinaGimMiercoles = rutinasExistentes.find(
    (r) => r.dia_semana === 3 && r.hora === '18:00' && r.tipo === 'gimnasio',
  );
  if (!rutinaGimMiercoles) {
    rutinaGimMiercoles = await qRutinas.crearRutina({
      id: uuid.randomUUID(),
      usuario_id: perfil.id,
      dia_semana: 3, // Miercoles
      hora: '18:00',
      tipo: 'gimnasio',
      duracion_estimada_min: 60,
      intensidad: 'media',
      rutina_gimnasio_id: rutinaGim2.id,
      activa: true,
    });
    console.log(`[rutina] Creada rutina semanal: Gimnasio - Miercoles 18:00`);
  }

  // -------------------------------------------------------------------------
  // 4. Eventos y sesiones completadas en el pasado (ultimas 3-4 semanas)
  // -------------------------------------------------------------------------
  console.log(`\n--- 4. Cargando eventos y sesiones pasadas con progresion de carga ---`);

  // Calculamos las fechas de los ultimos 4 lunes, martes, miercoles y jueves
  function obtenerFechasDiaSemana(diaSemanaDeseado, semanasAtras = 4) {
    const resultado = [];
    for (let w = semanasAtras; w >= 1; w--) {
      const d = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - w * 7);
      const diff = diaSemanaDeseado - d.getDay();
      d.setDate(d.getDate() + diff);
      // Solo si la fecha es estrictamente anterior a hoy
      if (d.getTime() < hoy.getTime()) {
        resultado.push(d);
      }
    }
    return resultado;
  }

  const lunesPasados = obtenerFechasDiaSemana(1, 4);
  const martesPasados = obtenerFechasDiaSemana(2, 4);
  const miercolesPasados = obtenerFechasDiaSemana(3, 4);
  const juevesPasados = obtenerFechasDiaSemana(4, 4);

  let eventosDeportivosCargados = 0;
  let sesionesGimCargadas = 0;

  // Futbol martes y jueves
  const diasFutbol = [
    ...martesPasados.map((f) => ({ fecha: f, rutina: rutinaFutbolMartes })),
    ...juevesPasados.map((f) => ({ fecha: f, rutina: rutinaFutbolJueves })),
  ].sort((a, b) => a.fecha.getTime() - b.fecha.getTime());

  for (let idx = 0; idx < diasFutbol.length; idx++) {
    const item = diasFutbol[idx];
    const fechaHora = fijarHora(item.fecha, '19:00');
    const fechaStr = fechas.aFechaLocal(fechaHora);

    const eventoExistente = await db.getFirstAsync(
      'SELECT id FROM evento WHERE usuario_id = ? AND fecha = ? AND tipo = ?',
      [perfil.id, fechaStr, 'entrenamiento'],
    );

    if (!eventoExistente) {
      // Dejamos 1 falta realista (ej: idx === 3 no asistio pero respondio)
      const fueCompletado = idx !== 3;

      await qEventos.crearEvento({
        id: uuid.randomUUID(),
        usuario_id: perfil.id,
        tipo: 'entrenamiento',
        fecha_hora_inicio: fechas.aISOLocal(fechaHora),
        duracion_estimada_min: 90,
        intensidad: 'alta',
        completado: fueCompletado,
        respondido: true,
        notas: 'Fútbol',
        rutina_id: item.rutina.id,
      });
      eventosDeportivosCargados++;
    }
  }

  // Sesiones de gimnasio con progresion de carga:
  // Lunes: Pecho y triceps
  // Progresion de 4 semanas:
  //   Press plano: 60kg x 10 -> 62.5kg x 10 -> 65kg x 8 -> 67.5kg x 8 (1RM sube de 80 a 85.5)
  //   Press inclinado: 20kg -> 22kg -> 24kg -> 24kg
  //   Cruces polea: 15kg -> 17.5kg -> 20kg -> 20kg
  //   Triceps polea: 17.5kg -> 20kg -> 22.5kg -> 22.5kg
  const cargasPecho = [
    { plano: { reps: 10, kg: 60.0 }, inc: { reps: 10, kg: 20.0 }, cruces: { reps: 12, kg: 15.0 }, tri: { reps: 12, kg: 17.5 } },
    { plano: { reps: 10, kg: 62.5 }, inc: { reps: 10, kg: 20.0 }, cruces: { reps: 12, kg: 17.5 }, tri: { reps: 12, kg: 20.0 } },
    { plano: { reps: 8, kg: 65.0 }, inc: { reps: 8, kg: 22.0 }, cruces: { reps: 10, kg: 20.0 }, tri: { reps: 10, kg: 22.5 } },
    { plano: { reps: 8, kg: 67.5 }, inc: { reps: 8, kg: 24.0 }, cruces: { reps: 10, kg: 20.0 }, tri: { reps: 10, kg: 22.5 } },
  ];

  for (let i = 0; i < lunesPasados.length; i++) {
    const fechaSesion = fijarHora(lunesPasados[i], '18:00');
    const fechaStr = fechas.aFechaLocal(fechaSesion);

    const eventoExistente = await db.getFirstAsync(
      'SELECT id FROM evento WHERE usuario_id = ? AND fecha = ? AND tipo = ?',
      [perfil.id, fechaStr, 'gimnasio'],
    );

    if (!eventoExistente) {
      const c = cargasPecho[Math.min(i, cargasPecho.length - 1)];
      const series = [
        // Press banca plano (3 series)
        { ejercicioId: ejPressPlano.id, repeticiones: c.plano.reps, pesoKg: c.plano.kg },
        { ejercicioId: ejPressPlano.id, repeticiones: c.plano.reps, pesoKg: c.plano.kg },
        { ejercicioId: ejPressPlano.id, repeticiones: c.plano.reps, pesoKg: c.plano.kg },
        // Press inclinado (3 series)
        { ejercicioId: ejPressInclinado.id, repeticiones: c.inc.reps, pesoKg: c.inc.kg },
        { ejercicioId: ejPressInclinado.id, repeticiones: c.inc.reps, pesoKg: c.inc.kg },
        { ejercicioId: ejPressInclinado.id, repeticiones: c.inc.reps, pesoKg: c.inc.kg },
        // Cruces en polea (3 series)
        { ejercicioId: ejCrucesPolea.id, repeticiones: c.cruces.reps, pesoKg: c.cruces.kg },
        { ejercicioId: ejCrucesPolea.id, repeticiones: c.cruces.reps, pesoKg: c.cruces.kg },
        { ejercicioId: ejCrucesPolea.id, repeticiones: c.cruces.reps, pesoKg: c.cruces.kg },
        // Triceps polea (3 series)
        { ejercicioId: ejTricepsPolea.id, repeticiones: c.tri.reps, pesoKg: c.tri.kg },
        { ejercicioId: ejTricepsPolea.id, repeticiones: c.tri.reps, pesoKg: c.tri.kg },
        { ejercicioId: ejTricepsPolea.id, repeticiones: c.tri.reps, pesoKg: c.tri.kg },
      ];

      const res = await guardarRutina.guardarRutinaTerminada({
        usuarioId: perfil.id,
        inicio: fechaSesion,
        duracionRealSeg: 3600,
        series,
        rutinaGimnasioId: rutinaGim1.id,
        nombreRutina: 'Lunes: Pecho y triceps',
        intensidad: 'media',
      });

      // Vinculamos tambien rutina_id para que entre en la asistencia de Progreso
      await db.runAsync('UPDATE evento SET rutina_id = ? WHERE id = ?', [
        rutinaGimLunes.id,
        res.eventoId,
      ]);

      sesionesGimCargadas++;
    }
  }

  // Miercoles: Espalda y biceps
  // Progresion de 4 semanas:
  //   Remo con barra: 50kg x 10 -> 52.5kg x 10 -> 55kg x 8 -> 57.5kg x 8 (1RM sube de 66.7 a 72.8)
  //   Jalon al pecho: 55kg -> 60kg -> 62.5kg -> 65kg
  //   Remo con mancuerna: 22kg -> 24kg -> 24kg -> 26kg
  //   Curl con barra: 25kg -> 27.5kg -> 30kg -> 30kg
  const cargasEspalda = [
    { remo: { reps: 10, kg: 50.0 }, jalon: { reps: 10, kg: 55.0 }, mancuerna: { reps: 10, kg: 22.0 }, curl: { reps: 10, kg: 25.0 } },
    { remo: { reps: 10, kg: 52.5 }, jalon: { reps: 10, kg: 60.0 }, mancuerna: { reps: 10, kg: 24.0 }, curl: { reps: 10, kg: 27.5 } },
    { remo: { reps: 8, kg: 55.0 }, jalon: { reps: 8, kg: 62.5 }, mancuerna: { reps: 8, kg: 24.0 }, curl: { reps: 8, kg: 30.0 } },
    { remo: { reps: 8, kg: 57.5 }, jalon: { reps: 8, kg: 65.0 }, mancuerna: { reps: 8, kg: 26.0 }, curl: { reps: 8, kg: 30.0 } },
  ];

  for (let i = 0; i < miercolesPasados.length; i++) {
    const fechaSesion = fijarHora(miercolesPasados[i], '18:00');
    const fechaStr = fechas.aFechaLocal(fechaSesion);

    const eventoExistente = await db.getFirstAsync(
      'SELECT id FROM evento WHERE usuario_id = ? AND fecha = ? AND tipo = ?',
      [perfil.id, fechaStr, 'gimnasio'],
    );

    if (!eventoExistente) {
      const c = cargasEspalda[Math.min(i, cargasEspalda.length - 1)];
      const series = [
        // Remo con barra (3 series)
        { ejercicioId: ejRemoBarra.id, repeticiones: c.remo.reps, pesoKg: c.remo.kg },
        { ejercicioId: ejRemoBarra.id, repeticiones: c.remo.reps, pesoKg: c.remo.kg },
        { ejercicioId: ejRemoBarra.id, repeticiones: c.remo.reps, pesoKg: c.remo.kg },
        // Jalon al pecho (3 series)
        { ejercicioId: ejJalonPecho.id, repeticiones: c.jalon.reps, pesoKg: c.jalon.kg },
        { ejercicioId: ejJalonPecho.id, repeticiones: c.jalon.reps, pesoKg: c.jalon.kg },
        { ejercicioId: ejJalonPecho.id, repeticiones: c.jalon.reps, pesoKg: c.jalon.kg },
        // Remo mancuerna (3 series)
        { ejercicioId: ejRemoMancuerna.id, repeticiones: c.mancuerna.reps, pesoKg: c.mancuerna.kg },
        { ejercicioId: ejRemoMancuerna.id, repeticiones: c.mancuerna.reps, pesoKg: c.mancuerna.kg },
        { ejercicioId: ejRemoMancuerna.id, repeticiones: c.mancuerna.reps, pesoKg: c.mancuerna.kg },
        // Curl con barra (3 series)
        { ejercicioId: ejCurlBiceps.id, repeticiones: c.curl.reps, pesoKg: c.curl.kg },
        { ejercicioId: ejCurlBiceps.id, repeticiones: c.curl.reps, pesoKg: c.curl.kg },
        { ejercicioId: ejCurlBiceps.id, repeticiones: c.curl.reps, pesoKg: c.curl.kg },
      ];

      const res = await guardarRutina.guardarRutinaTerminada({
        usuarioId: perfil.id,
        inicio: fechaSesion,
        duracionRealSeg: 3600,
        series,
        rutinaGimnasioId: rutinaGim2.id,
        nombreRutina: 'Miercoles: Espalda y biceps',
        intensidad: 'media',
      });

      // Vinculamos tambien rutina_id para que entre en la asistencia de Progreso
      await db.runAsync('UPDATE evento SET rutina_id = ? WHERE id = ?', [
        rutinaGimMiercoles.id,
        res.eventoId,
      ]);

      sesionesGimCargadas++;
    }
  }

  console.log(`[eventos] Se cargaron ${eventosDeportivosCargados} eventos deportivos pasados (Fútbol).`);
  console.log(`[sesiones] Se cargaron ${sesionesGimCargadas} sesiones pasadas de gimnasio con series y sobrecarga progresiva.`);

  // -------------------------------------------------------------------------
  // 5. Comidas registradas en 22 de los ultimos 30 dias
  // -------------------------------------------------------------------------
  console.log(`\n--- 5. Cargando comidas en 22 de los ultimos 30 dias ---`);

  // Buscamos alimentos frecuentes en el catalogo
  async function buscarAlimentoSeguro(nombreParcial) {
    const lista = await qAlimentos.buscarAlimentosPorNombre(nombreParcial, 5);
    if (lista.length > 0) return lista[0];
    throw new Error(`Alimento no encontrado en catalogo: ${nombreParcial}`);
  }

  const alAvena = await buscarAlimentoSeguro('Avena en hojuelas');
  const alLeche = await buscarAlimentoSeguro('Leche descremada');
  const alBanana = await buscarAlimentoSeguro('Banana');
  const alPollo = await buscarAlimentoSeguro('Pechuga de pollo');
  const alArroz = await buscarAlimentoSeguro('Arroz blanco');
  const alManzana = await buscarAlimentoSeguro('Manzana');
  const alYogur = await buscarAlimentoSeguro('Yogur');
  const alCarne = await buscarAlimentoSeguro('Bife de');
  const alPapa = await buscarAlimentoSeguro('Papa');

  // Exactamente 22 dias dentro de la ventana de 30 dias (de ayer hacia atras 30 dias)
  // Saltamos 8 dias: 28, 24, 21, 18, 12, 7, 4, 1 dias atras
  const diasConComida = [
    30, 29, 27, 26, 25, 23, 22, 20, 19, 17, 16, 15, 14, 13, 11, 10, 9, 8, 6, 5, 3, 2,
  ];

  let comidasCreadas = 0;
  let itemsCreados = 0;

  for (const diasAtras of diasConComida) {
    const fechaDia = restarDias(hoy, diasAtras);
    const fechaStr = fechas.aFechaLocal(fechaDia);

    // Verificar si ya tiene comidas ese dia
    const comidasExistentes = await qComidas.listarComidasPorFecha(perfil.id, fechaStr);
    if (comidasExistentes.length > 0) continue;

    // 1. Desayuno
    const fechaHoraDesayuno = fijarHora(fechaDia, '08:30');
    const comidaDesayuno = await qComidas.crearComida({
      id: uuid.randomUUID(),
      usuario_id: perfil.id,
      fecha_hora: fechas.aISOLocal(fechaHoraDesayuno),
      tipo: 'desayuno',
      notas: 'Desayuno habitual',
    });
    comidasCreadas++;

    await qComidas.agregarItem({
      id: uuid.randomUUID(),
      comida_id: comidaDesayuno.id,
      alimento_id: alAvena.id,
      cantidad_g: 50,
    });
    await qComidas.agregarItem({
      id: uuid.randomUUID(),
      comida_id: comidaDesayuno.id,
      alimento_id: alLeche.id,
      cantidad_g: 200,
    });
    await qComidas.agregarItem({
      id: uuid.randomUUID(),
      comida_id: comidaDesayuno.id,
      alimento_id: alBanana.id,
      cantidad_g: 120,
    });
    itemsCreados += 3;

    // 2. Almuerzo
    const fechaHoraAlmuerzo = fijarHora(fechaDia, '13:00');
    const comidaAlmuerzo = await qComidas.crearComida({
      id: uuid.randomUUID(),
      usuario_id: perfil.id,
      fecha_hora: fechas.aISOLocal(fechaHoraAlmuerzo),
      tipo: 'almuerzo',
      notas: 'Almuerzo proteico',
    });
    comidasCreadas++;

    await qComidas.agregarItem({
      id: uuid.randomUUID(),
      comida_id: comidaAlmuerzo.id,
      alimento_id: alPollo.id,
      cantidad_g: 200,
    });
    await qComidas.agregarItem({
      id: uuid.randomUUID(),
      comida_id: comidaAlmuerzo.id,
      alimento_id: alArroz.id,
      cantidad_g: 150,
    });
    itemsCreados += 2;

    // 3. Merienda
    const fechaHoraMerienda = fijarHora(fechaDia, '17:00');
    const comidaMerienda = await qComidas.crearComida({
      id: uuid.randomUUID(),
      usuario_id: perfil.id,
      fecha_hora: fechas.aISOLocal(fechaHoraMerienda),
      tipo: 'merienda',
      notas: 'Merienda ligera',
    });
    comidasCreadas++;

    await qComidas.agregarItem({
      id: uuid.randomUUID(),
      comida_id: comidaMerienda.id,
      alimento_id: alYogur.id,
      cantidad_g: 180,
    });
    await qComidas.agregarItem({
      id: uuid.randomUUID(),
      comida_id: comidaMerienda.id,
      alimento_id: alManzana.id,
      cantidad_g: 150,
    });
    itemsCreados += 2;

    // 4. Cena
    const fechaHoraCena = fijarHora(fechaDia, '21:30');
    const comidaCena = await qComidas.crearComida({
      id: uuid.randomUUID(),
      usuario_id: perfil.id,
      fecha_hora: fechas.aISOLocal(fechaHoraCena),
      tipo: 'cena',
      notas: 'Cena equilibrada',
    });
    comidasCreadas++;

    await qComidas.agregarItem({
      id: uuid.randomUUID(),
      comida_id: comidaCena.id,
      alimento_id: alCarne.id,
      cantidad_g: 180,
    });
    await qComidas.agregarItem({
      id: uuid.randomUUID(),
      comida_id: comidaCena.id,
      alimento_id: alPapa.id,
      cantidad_g: 200,
    });
    itemsCreados += 2;
  }

  console.log(`[comidas] Se crearon ${comidasCreadas} comidas con ${itemsCreados} items en ${diasConComida.length} dias pasados.`);

  // -------------------------------------------------------------------------
  // 6. Materializar rutinas hacia adelante en la agenda
  // -------------------------------------------------------------------------
  console.log(`\n--- 6. Materializando eventos futuros en la agenda ---`);
  const materializados = await agenda.materializarRutinas(perfil.id, 4, hoy);
  console.log(`[agenda] Se materializaron ${materializados} eventos futuros para las proximas 4 semanas.`);

  await schema.cerrarDb();

  console.log(`\n======================================================`);
  console.log(`  Seed de desarrollo completado exitosamente.`);
  console.log(`======================================================\n`);
}

ejecutarSeed().catch((e) => {
  console.error('\n[error fatal en seed]:', e);
  process.exit(1);
});
