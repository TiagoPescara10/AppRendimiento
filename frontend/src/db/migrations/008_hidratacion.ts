// src/db/migrations/008_hidratacion.ts
//
// Version 8: registro de hidratacion diaria y meta manual de agua en perfil.

import type { Migracion } from './index';

export const migracion008: Migracion = {
  version: 8,
  nombre: 'hidratacion',
  sql: `
-- 1. Registro de agua vaso por vaso
CREATE TABLE IF NOT EXISTS registro_agua (
  id          TEXT PRIMARY KEY,
  usuario_id  TEXT NOT NULL REFERENCES perfil(id) ON DELETE CASCADE,
  fecha       TEXT NOT NULL,
  hora        TEXT NOT NULL CHECK (hora GLOB '[0-2][0-9]:[0-5][0-9]'),
  ml          INTEGER NOT NULL CHECK (ml > 0),
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_registro_agua_usuario_fecha
  ON registro_agua(usuario_id, fecha);

-- 2. Meta de hidratacion manual configurable en perfil
ALTER TABLE perfil ADD COLUMN meta_agua_manual_ml INTEGER CHECK (meta_agua_manual_ml IS NULL OR meta_agua_manual_ml > 0);
`,
};
