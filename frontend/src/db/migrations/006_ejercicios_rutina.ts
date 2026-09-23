// src/db/migrations/006_ejercicios_rutina.ts
//
// Version 6: ejercicios de gimnasio, series y modos de sesion de entrenamiento.
//
// 1. sesion_entrenamiento:
//    Agrega la columna modo ('pasadas' | 'cronometro' | 'rutina').
//    Para que las columnas de intervalos (bloques, pasadas, descansos) dejen de
//    aplicar y sean NULL en modo 'rutina', se recrea la tabla copiando los datos
//    existentes con backfill: trabajo_seg = 0 pasa a 'cronometro', el resto a
//    'pasadas'.
//    duracion_real_seg pasa a ser nullable: en pasadas/cronometro es el tiempo
//    medido por el temporizador; en rutina el usuario no tiene cronometro.
//
// 2. ejercicio:
//    Catalogo base de ejercicios con nombre y grupo muscular.
//
// 3. serie:
//    Registro de series realizadas por sesion (repeticiones y peso en kg).
//    Cuelga de sesion_entrenamiento con ON DELETE CASCADE.

import type { Migracion } from './index';

export const migracion006: Migracion = {
  version: 6,
  nombre: 'ejercicios_rutina',
  sql: `
-- 1. Catalogo de ejercicios
CREATE TABLE IF NOT EXISTS ejercicio (
  id                    TEXT PRIMARY KEY,
  nombre                TEXT NOT NULL,
  grupo                 TEXT NOT NULL CHECK (grupo IN ('pecho', 'espalda', 'piernas', 'hombros', 'brazos', 'core', 'cardio')),
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ejercicio_grupo_nombre ON ejercicio(grupo, nombre);
CREATE INDEX IF NOT EXISTS idx_ejercicio_nombre ON ejercicio(nombre);

-- 2. Recreacion de sesion_entrenamiento
ALTER TABLE sesion_entrenamiento RENAME TO _sesion_entrenamiento_v5;

CREATE TABLE sesion_entrenamiento (
  id                    TEXT PRIMARY KEY,
  evento_id             TEXT NOT NULL REFERENCES evento(id) ON DELETE CASCADE,
  modo                  TEXT NOT NULL CHECK (modo IN ('pasadas', 'cronometro', 'rutina')),

  -- Columnas de intervalos: aplican en pasadas y cronometro, NULL en rutina
  bloques               INTEGER CHECK (bloques IS NULL OR bloques >= 1),
  pasadas               INTEGER CHECK (pasadas IS NULL OR pasadas >= 1),
  trabajo_seg           INTEGER CHECK (trabajo_seg IS NULL OR trabajo_seg >= 0),
  descanso_seg          INTEGER CHECK (descanso_seg IS NULL OR descanso_seg >= 0),
  descanso_bloque_seg   INTEGER CHECK (descanso_bloque_seg IS NULL OR descanso_bloque_seg >= 0),
  bloques_completados   INTEGER CHECK (bloques_completados IS NULL OR bloques_completados >= 0),
  pasadas_completadas   INTEGER CHECK (pasadas_completadas IS NULL OR pasadas_completadas >= 0),

  -- NULLABLE: en rutina no se exige cronometro
  duracion_real_seg     INTEGER CHECK (duracion_real_seg IS NULL OR duracion_real_seg >= 0),
  distancia_km          REAL CHECK (distancia_km IS NULL OR distancia_km > 0),

  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL
);

INSERT INTO sesion_entrenamiento (
  id, evento_id, modo,
  bloques, pasadas, trabajo_seg, descanso_seg, descanso_bloque_seg,
  bloques_completados, pasadas_completadas,
  duracion_real_seg, distancia_km, created_at, updated_at
)
SELECT
  id, evento_id,
  CASE WHEN trabajo_seg = 0 THEN 'cronometro' ELSE 'pasadas' END,
  bloques, pasadas, trabajo_seg, descanso_seg, descanso_bloque_seg,
  bloques_completados, pasadas_completadas,
  duracion_real_seg, distancia_km, created_at, updated_at
FROM _sesion_entrenamiento_v5;

DROP TABLE _sesion_entrenamiento_v5;

CREATE UNIQUE INDEX IF NOT EXISTS idx_sesion_evento ON sesion_entrenamiento(evento_id);
CREATE INDEX IF NOT EXISTS idx_sesion_modo ON sesion_entrenamiento(modo);

-- 3. Series ejecutadas en una sesion
CREATE TABLE IF NOT EXISTS serie (
  id                    TEXT PRIMARY KEY,
  sesion_id             TEXT NOT NULL REFERENCES sesion_entrenamiento(id) ON DELETE CASCADE,
  ejercicio_id          TEXT NOT NULL REFERENCES ejercicio(id),
  orden                 INTEGER NOT NULL CHECK (orden >= 0),
  repeticiones          INTEGER NOT NULL CHECK (repeticiones >= 1),
  peso_kg               REAL CHECK (peso_kg IS NULL OR peso_kg >= 0),
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_serie_sesion ON serie(sesion_id, orden);
CREATE INDEX IF NOT EXISTS idx_serie_ejercicio ON serie(ejercicio_id);
`,
};
