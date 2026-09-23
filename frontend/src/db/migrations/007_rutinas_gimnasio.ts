// src/db/migrations/007_rutinas_gimnasio.ts
//
// Version 7: definicion de rutinas fijas de gimnasio con dias de la semana,
// orden de ejercicios y asociacion a eventos y sesiones de entrenamiento.

import type { Migracion } from './index';

export const migracion007: Migracion = {
  version: 7,
  nombre: 'rutinas_gimnasio',
  sql: `
-- 1. Definicion de rutinas de gimnasio
CREATE TABLE IF NOT EXISTS rutina_gimnasio (
  id                    TEXT PRIMARY KEY,
  usuario_id            TEXT NOT NULL REFERENCES perfil(id) ON DELETE CASCADE,
  nombre                TEXT NOT NULL,
  hora                  TEXT NOT NULL CHECK (hora GLOB '[0-2][0-9]:[0-5][0-9]'),
  duracion_estimada_min INTEGER CHECK (duracion_estimada_min IS NULL OR duracion_estimada_min > 0),
  activa                INTEGER NOT NULL DEFAULT 1 CHECK (activa IN (0, 1)),
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rutina_gimnasio_usuario ON rutina_gimnasio(usuario_id, activa);

-- 2. Dias de la semana de la rutina
CREATE TABLE IF NOT EXISTS rutina_gimnasio_dia (
  rutina_gimnasio_id    TEXT NOT NULL REFERENCES rutina_gimnasio(id) ON DELETE CASCADE,
  dia_semana            INTEGER NOT NULL CHECK (dia_semana BETWEEN 0 AND 6),
  PRIMARY KEY (rutina_gimnasio_id, dia_semana)
);
CREATE INDEX IF NOT EXISTS idx_rutina_gimnasio_dia ON rutina_gimnasio_dia(dia_semana);

-- 3. Ejercicios ordenados de la rutina
CREATE TABLE IF NOT EXISTS rutina_gimnasio_ejercicio (
  id                    TEXT PRIMARY KEY,
  rutina_gimnasio_id    TEXT NOT NULL REFERENCES rutina_gimnasio(id) ON DELETE CASCADE,
  ejercicio_id          TEXT NOT NULL REFERENCES ejercicio(id),
  orden                 INTEGER NOT NULL CHECK (orden >= 0),
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rutina_gim_ej_orden ON rutina_gimnasio_ejercicio(rutina_gimnasio_id, orden);

-- 4. Evento: referencia opcional a rutina_gimnasio
ALTER TABLE evento ADD COLUMN rutina_gimnasio_id TEXT REFERENCES rutina_gimnasio(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_evento_rutina_gim ON evento(rutina_gimnasio_id, fecha);

-- 5. Sesion: referencia opcional a rutina_gimnasio
ALTER TABLE sesion_entrenamiento ADD COLUMN rutina_gimnasio_id TEXT REFERENCES rutina_gimnasio(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_sesion_rutina_gim ON sesion_entrenamiento(rutina_gimnasio_id);
`,
};
