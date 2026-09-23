// frontend/scripts/probar-seed-desarrollo.mjs
//
// Prueba automatizada del script de seed de desarrollo.
// Verifica que seed-desarrollo.mjs cargue correctamente pesos, rutinas,
// sesiones con series y sobrecarga progresiva, comidas pasadas y materializacion.

process.env.TZ = 'America/Argentina/Buenos_Aires';

import { execFileSync } from 'node:child_process';
import { unlinkSync, existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, '..');
const dbPath = join(RAIZ, 'test-seed-temp.db');

if (existsSync(dbPath)) unlinkSync(dbPath);

console.log('--- Iniciando prueba de seed-desarrollo.mjs ---');

// 1. Crear la base y aplicar migraciones usando initDb via Node
const { DatabaseSync: NodeDb } = await import('node:sqlite');

// Corremos un script rapido para inicializar la base con initDb real y crear un perfil
const initScript = `
process.env.TZ = 'America/Argentina/Buenos_Aires';
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('${dbPath}');
db.exec('PRAGMA user_version = 0');
db.close();
`;

// Dejamos que seed-desarrollo o initDb corra las 9 migraciones y siembre alimentos/ejercicios
// Para eso, creamos la base ejecutando probar-db o una ejecucion de initDb
execFileSync('node', ['-e', `
process.env.TZ = 'America/Argentina/Buenos_Aires';
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('${dbPath}');
// Crear las tablas oficiales para el test
db.exec(\`
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS meta (clave TEXT PRIMARY KEY, valor TEXT, updated_at TEXT);
  CREATE TABLE IF NOT EXISTS perfil (
    id TEXT PRIMARY KEY,
    nombre TEXT,
    fecha_nacimiento TEXT,
    sexo_biologico TEXT CHECK (sexo_biologico IS NULL OR sexo_biologico IN ('masculino','femenino')),
    altura_cm REAL,
    nivel_actividad TEXT CHECK (nivel_actividad IS NULL OR nivel_actividad IN ('sedentario','ligero','moderado','alto','muy_alto')),
    deporte_principal TEXT,
    objetivo TEXT CHECK (objetivo IS NULL OR objetivo IN ('bajar','mantener','subir','rendimiento')),
    peso_objetivo_kg REAL,
    meta_agua_manual_ml INTEGER,
    modo_nutricion TEXT NOT NULL DEFAULT 'objetivo' CHECK (modo_nutricion IN ('objetivo','recuento')),
    fecha_alta TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS registro_peso (
    id TEXT PRIMARY KEY,
    usuario_id TEXT NOT NULL REFERENCES perfil(id) ON DELETE CASCADE,
    peso_kg REAL NOT NULL,
    fecha TEXT NOT NULL,
    fuente TEXT NOT NULL CHECK (fuente IN ('manual','balanza','health_kit')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS alimento (
    id TEXT PRIMARY KEY,
    nombre TEXT NOT NULL,
    marca TEXT,
    codigo_barras TEXT,
    kcal_por_100g REAL NOT NULL,
    proteina_g REAL NOT NULL DEFAULT 0,
    carbohidratos_g REAL NOT NULL DEFAULT 0,
    grasa_g REAL NOT NULL DEFAULT 0,
    fibra_g REAL,
    fuente TEXT NOT NULL CHECK (fuente IN ('open_food_facts','usda','manual','vision')),
    verificado INTEGER NOT NULL DEFAULT 0 CHECK (verificado IN (0,1)),
    porciones TEXT NOT NULL DEFAULT '[]',
    categoria TEXT NOT NULL DEFAULT 'otros',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_alimento_barcode ON alimento(codigo_barras) WHERE codigo_barras IS NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_alimento_nombre ON alimento(nombre);

  CREATE TABLE IF NOT EXISTS comida (
    id TEXT PRIMARY KEY,
    usuario_id TEXT NOT NULL REFERENCES perfil(id) ON DELETE CASCADE,
    fecha_hora TEXT NOT NULL,
    fecha TEXT GENERATED ALWAYS AS (substr(fecha_hora, 1, 10)) VIRTUAL,
    tipo TEXT NOT NULL CHECK (tipo IN ('desayuno','almuerzo','merienda','cena','snack')),
    foto_url TEXT,
    notas TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_comida_fecha ON comida(usuario_id, fecha);

  CREATE TABLE IF NOT EXISTS item_comida (
    id TEXT PRIMARY KEY,
    comida_id TEXT NOT NULL REFERENCES comida(id) ON DELETE CASCADE,
    alimento_id TEXT NOT NULL REFERENCES alimento(id) ON DELETE RESTRICT,
    cantidad_g REAL NOT NULL,
    editado_por_usuario INTEGER NOT NULL DEFAULT 0 CHECK (editado_por_usuario IN (0,1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_item_comida ON item_comida(comida_id);

  CREATE TABLE IF NOT EXISTS rutina (
    id TEXT PRIMARY KEY,
    usuario_id TEXT NOT NULL REFERENCES perfil(id) ON DELETE CASCADE,
    dia_semana INTEGER NOT NULL CHECK (dia_semana BETWEEN 0 AND 6),
    hora TEXT NOT NULL CHECK (hora GLOB '[0-2][0-9]:[0-5][0-9]'),
    tipo TEXT NOT NULL CHECK (tipo IN ('partido','entrenamiento','gimnasio','competencia')),
    duracion_estimada_min INTEGER,
    intensidad TEXT NOT NULL CHECK (intensidad IN ('baja','media','alta')),
    activa INTEGER NOT NULL DEFAULT 1 CHECK (activa IN (0,1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_rutina_usuario ON rutina(usuario_id, activa);

  -- OJO: este bloque es una foto del esquema en la version 9 (ver PRAGMA
  -- user_version = 9 mas abajo). Las migraciones 10 a 14 corren encima cuando
  -- el seed llama a initDb(), asi que rutina_gimnasio TIENE que tener todavia
  -- hora/duracion_estimada_min y rutina_gimnasio_dia tiene que existir: la 013
  -- lee esa tabla para migrar los dias y la 014 dropea esas columnas.
  -- No "modernizar" este DDL: romperia las migraciones que se estan probando.
  CREATE TABLE IF NOT EXISTS rutina_gimnasio (
    id TEXT PRIMARY KEY,
    usuario_id TEXT NOT NULL REFERENCES perfil(id) ON DELETE CASCADE,
    nombre TEXT NOT NULL,
    hora TEXT NOT NULL CHECK (hora GLOB '[0-2][0-9]:[0-5][0-9]'),
    duracion_estimada_min INTEGER CHECK (duracion_estimada_min IS NULL OR duracion_estimada_min > 0),
    activa INTEGER NOT NULL DEFAULT 1 CHECK (activa IN (0, 1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_rutina_gimnasio_usuario ON rutina_gimnasio(usuario_id, activa);

  CREATE TABLE IF NOT EXISTS rutina_gimnasio_dia (
    rutina_gimnasio_id TEXT NOT NULL REFERENCES rutina_gimnasio(id) ON DELETE CASCADE,
    dia_semana INTEGER NOT NULL CHECK (dia_semana BETWEEN 0 AND 6),
    PRIMARY KEY (rutina_gimnasio_id, dia_semana)
  );

  CREATE TABLE IF NOT EXISTS ejercicio (
    id TEXT PRIMARY KEY,
    nombre TEXT NOT NULL,
    grupo TEXT NOT NULL CHECK (grupo IN ('pecho','espalda','piernas','hombros','brazos','core','cardio')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS rutina_gimnasio_ejercicio (
    id TEXT PRIMARY KEY,
    rutina_gimnasio_id TEXT NOT NULL REFERENCES rutina_gimnasio(id) ON DELETE CASCADE,
    ejercicio_id TEXT NOT NULL REFERENCES ejercicio(id),
    orden INTEGER NOT NULL CHECK (orden >= 0),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS evento (
    id TEXT PRIMARY KEY,
    usuario_id TEXT NOT NULL REFERENCES perfil(id) ON DELETE CASCADE,
    tipo TEXT NOT NULL CHECK (tipo IN ('partido','entrenamiento','gimnasio','competencia')),
    fecha_hora_inicio TEXT NOT NULL,
    fecha TEXT GENERATED ALWAYS AS (substr(fecha_hora_inicio, 1, 10)) VIRTUAL,
    duracion_estimada_min INTEGER,
    intensidad TEXT NOT NULL CHECK (intensidad IN ('baja','media','alta')),
    completado INTEGER NOT NULL DEFAULT 0 CHECK (completado IN (0,1)),
    respondido INTEGER NOT NULL DEFAULT 0 CHECK (respondido IN (0,1)),
    notas TEXT,
    rutina_id TEXT REFERENCES rutina(id) ON DELETE SET NULL,
    rutina_gimnasio_id TEXT REFERENCES rutina_gimnasio(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_evento_inicio ON evento(usuario_id, fecha_hora_inicio);
  CREATE INDEX IF NOT EXISTS idx_evento_rutina ON evento(rutina_id, fecha);
  CREATE INDEX IF NOT EXISTS idx_evento_rutina_gim ON evento(rutina_gimnasio_id, fecha);

  CREATE TABLE IF NOT EXISTS sesion_entrenamiento (
    id TEXT PRIMARY KEY,
    evento_id TEXT NOT NULL UNIQUE REFERENCES evento(id) ON DELETE CASCADE,
    modo TEXT NOT NULL CHECK (modo IN ('pasadas','cronometro','rutina')),
    rutina_gimnasio_id TEXT REFERENCES rutina_gimnasio(id) ON DELETE SET NULL,
    bloques INTEGER,
    pasadas INTEGER,
    trabajo_seg INTEGER,
    descanso_seg INTEGER,
    descanso_bloque_seg INTEGER,
    bloques_completados INTEGER,
    pasadas_completadas INTEGER,
    duracion_real_seg INTEGER,
    distancia_km REAL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS serie (
    id TEXT PRIMARY KEY,
    sesion_id TEXT NOT NULL REFERENCES sesion_entrenamiento(id) ON DELETE CASCADE,
    ejercicio_id TEXT NOT NULL REFERENCES ejercicio(id),
    orden INTEGER NOT NULL CHECK (orden >= 0),
    repeticiones INTEGER NOT NULL CHECK (repeticiones > 0),
    peso_kg REAL CHECK (peso_kg IS NULL OR peso_kg >= 0),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  PRAGMA user_version = 9;

  INSERT INTO perfil (
    id, nombre, fecha_nacimiento, sexo_biologico, altura_cm, nivel_actividad,
    deporte_principal, objetivo, peso_objetivo_kg, fecha_alta, created_at, updated_at
  ) VALUES (
    'usr-valen-test', 'Valentin Gomez', '1998-04-12', 'masculino', 182, 'alto',
    'Futbol', 'bajar', 76.0, '2026-06-01T10:00:00-03:00', '2026-06-01T10:00:00-03:00', '2026-06-01T10:00:00-03:00'
  );
\`);
db.close();
`], { cwd: RAIZ, stdio: 'inherit' });

console.log('[test] Base de prueba preparada con perfil "usr-valen-test".');

// 2. Ejecutar seed-desarrollo.mjs contra test-seed-temp.db
console.log('[test] Ejecutando seed-desarrollo.mjs...');
execFileSync('node', ['scripts/seed-desarrollo.mjs', '--db', dbPath], {
  cwd: RAIZ,
  stdio: 'inherit',
});

// 3. Verificaciones
const db = new DatabaseSync(dbPath);

const pesos = db.prepare('SELECT count(*) as c FROM registro_peso WHERE usuario_id = ?').get('usr-valen-test');
console.log(`[check] Pesos: ${pesos.c} (esperado: >= 15)`);
if (pesos.c < 15) throw new Error(`Esperaba >= 15 pesos, dio ${pesos.c}`);

const rutinas = db.prepare('SELECT count(*) as c FROM rutina WHERE usuario_id = ?').get('usr-valen-test');
console.log(`[check] Rutinas semanales: ${rutinas.c} (esperado: >= 2)`);
if (rutinas.c < 2) throw new Error(`Esperaba >= 2 rutinas, dio ${rutinas.c}`);

const rutinasGim = db.prepare('SELECT count(*) as c FROM rutina_gimnasio WHERE usuario_id = ?').get('usr-valen-test');
console.log(`[check] Rutinas gimnasio: ${rutinasGim.c} (esperado: >= 2)`);
if (rutinasGim.c < 2) throw new Error(`Esperaba >= 2 rutinas gimnasio, dio ${rutinasGim.c}`);

// Cada rutina de gimnasio tiene que quedar programada en algun dia via la tabla
// rutina: sin esto el seed deja rutinas "sin dias asignados" y Entrenamientos,
// Perfil > Mis rutinas y Agenda las muestran vacias.
const gimSinDias = db.prepare(`
  SELECT count(*) as c FROM rutina_gimnasio rg
  WHERE rg.usuario_id = ?
    AND NOT EXISTS (SELECT 1 FROM rutina r WHERE r.rutina_gimnasio_id = rg.id AND r.activa = 1)
`).get('usr-valen-test');
console.log(`[check] Rutinas gimnasio sin dias asignados: ${gimSinDias.c} (esperado: 0)`);
if (gimSinDias.c !== 0) throw new Error(`Esperaba 0 rutinas de gimnasio sin dias, dio ${gimSinDias.c}`);

const gimConRutina = db.prepare("SELECT count(*) as c FROM rutina WHERE usuario_id = ? AND tipo = 'gimnasio' AND rutina_gimnasio_id IS NOT NULL").get('usr-valen-test');
console.log(`[check] Rutinas semanales de gimnasio linkeadas al catalogo: ${gimConRutina.c} (esperado: >= 2)`);
if (gimConRutina.c < 2) throw new Error(`Esperaba >= 2 rutinas de gimnasio linkeadas, dio ${gimConRutina.c}`);

const eventos = db.prepare('SELECT count(*) as c FROM evento WHERE usuario_id = ? AND completado = 1').get('usr-valen-test');
console.log(`[check] Eventos completados: ${eventos.c} (esperado: >= 10)`);
if (eventos.c < 10) throw new Error(`Esperaba >= 10 eventos completados, dio ${eventos.c}`);

const series = db.prepare('SELECT count(*) as c FROM serie').get();
console.log(`[check] Series de gimnasio: ${series.c} (esperado: >= 60)`);
if (series.c < 60) throw new Error(`Esperaba >= 60 series, dio ${series.c}`);

const diasComida = db.prepare('SELECT count(DISTINCT fecha) as c FROM comida WHERE usuario_id = ?').get('usr-valen-test');
console.log(`[check] Dias con comidas registradas: ${diasComida.c} (esperado: 22)`);
if (diasComida.c !== 22) throw new Error(`Esperaba 22 dias con comida, dio ${diasComida.c}`);

db.close();
unlinkSync(dbPath);

console.log('\nTodas las verificaciones de seed-desarrollo.mjs pasaron correctamente!');
