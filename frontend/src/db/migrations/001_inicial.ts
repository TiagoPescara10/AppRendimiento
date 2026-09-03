// src/db/migrations/001_inicial.ts
//
// Version 1: esquema completo inicial.
//
// El DDL vive ACA, literal, y no en schema.ts. Dos motivos:
//
//  1. Una migracion publicada no se toca nunca mas. Tenerla junto a los tipos,
//     que si evolucionan, invitaba a editarla.
//  2. Si schema.ts exportara el DDL, importarlo desde aca cerraria un ciclo
//     (schema -> migrations -> 001_inicial -> schema). En ese ciclo el objeto
//     de abajo se construye mientras schema.ts esta a medio evaluar, y `sql`
//     queda congelado en undefined: la app arranca y muere en el execAsync de
//     la migracion con un ERR_ARGUMENT_CAST que no dice nada.

import type { Migracion } from './index';

export const migracion001: Migracion = {
  version: 1,
  nombre: 'inicial',
  sql: `
CREATE TABLE perfil (
  id                TEXT PRIMARY KEY,
  nombre            TEXT,
  fecha_nacimiento  TEXT,
  sexo_biologico    TEXT CHECK (sexo_biologico IS NULL OR sexo_biologico IN ('masculino','femenino')),
  altura_cm         REAL,
  nivel_actividad   TEXT CHECK (nivel_actividad IS NULL OR nivel_actividad IN ('sedentario','ligero','moderado','alto','muy_alto')),
  deporte_principal TEXT,
  objetivo          TEXT CHECK (objetivo IS NULL OR objetivo IN ('bajar','mantener','subir','rendimiento')),
  peso_objetivo_kg  REAL,
  fecha_alta        TEXT NOT NULL,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);

CREATE TABLE registro_peso (
  id         TEXT PRIMARY KEY,
  usuario_id TEXT NOT NULL REFERENCES perfil(id) ON DELETE CASCADE,
  peso_kg    REAL NOT NULL,
  fecha      TEXT NOT NULL,
  fuente     TEXT NOT NULL CHECK (fuente IN ('manual','balanza','health_kit')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_peso_fecha ON registro_peso(usuario_id, fecha DESC);

CREATE TABLE alimento (
  id              TEXT PRIMARY KEY,
  nombre          TEXT NOT NULL,
  marca           TEXT,
  codigo_barras   TEXT,
  kcal_por_100g   REAL NOT NULL,
  proteina_g      REAL NOT NULL DEFAULT 0,
  carbohidratos_g REAL NOT NULL DEFAULT 0,
  grasa_g         REAL NOT NULL DEFAULT 0,
  fibra_g         REAL,
  fuente          TEXT NOT NULL CHECK (fuente IN ('open_food_facts','usda','manual','vision')),
  verificado      INTEGER NOT NULL DEFAULT 0 CHECK (verificado IN (0,1)),
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);
CREATE UNIQUE INDEX idx_alimento_barcode ON alimento(codigo_barras) WHERE codigo_barras IS NOT NULL;
CREATE INDEX idx_alimento_nombre ON alimento(nombre);

CREATE TABLE comida (
  id         TEXT PRIMARY KEY,
  usuario_id TEXT NOT NULL REFERENCES perfil(id) ON DELETE CASCADE,
  fecha_hora TEXT NOT NULL,
  fecha      TEXT GENERATED ALWAYS AS (substr(fecha_hora, 1, 10)) VIRTUAL,
  tipo       TEXT NOT NULL CHECK (tipo IN ('desayuno','almuerzo','merienda','cena','snack')),
  foto_url   TEXT,
  notas      TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_comida_fecha ON comida(usuario_id, fecha);

CREATE TABLE item_comida (
  id                  TEXT PRIMARY KEY,
  comida_id           TEXT NOT NULL REFERENCES comida(id) ON DELETE CASCADE,
  alimento_id         TEXT NOT NULL REFERENCES alimento(id) ON DELETE RESTRICT,
  cantidad_g          REAL NOT NULL,
  editado_por_usuario INTEGER NOT NULL DEFAULT 0 CHECK (editado_por_usuario IN (0,1)),
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL
);
CREATE INDEX idx_item_comida ON item_comida(comida_id);

CREATE TABLE evento (
  id                    TEXT PRIMARY KEY,
  usuario_id            TEXT NOT NULL REFERENCES perfil(id) ON DELETE CASCADE,
  tipo                  TEXT NOT NULL CHECK (tipo IN ('partido','entrenamiento','gimnasio','competencia')),
  fecha_hora_inicio     TEXT NOT NULL,
  fecha                 TEXT GENERATED ALWAYS AS (substr(fecha_hora_inicio, 1, 10)) VIRTUAL,
  duracion_estimada_min INTEGER,
  intensidad            TEXT NOT NULL CHECK (intensidad IN ('baja','media','alta')),
  completado            INTEGER NOT NULL DEFAULT 0 CHECK (completado IN (0,1)),
  notas                 TEXT,
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL
);
CREATE INDEX idx_evento_inicio ON evento(usuario_id, fecha_hora_inicio);

CREATE TABLE registro_sueno (
  id                TEXT PRIMARY KEY,
  usuario_id        TEXT NOT NULL REFERENCES perfil(id) ON DELETE CASCADE,
  fecha             TEXT NOT NULL,
  hora_dormir       TEXT,
  hora_despertar    TEXT,
  duracion_min      INTEGER NOT NULL,
  calidad_percibida INTEGER CHECK (calidad_percibida IS NULL OR calidad_percibida BETWEEN 1 AND 5),
  fuente            TEXT NOT NULL CHECK (fuente IN ('manual','health_kit','health_connect')),
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);
CREATE UNIQUE INDEX idx_sueno_fecha ON registro_sueno(usuario_id, fecha);

CREATE TABLE registro_energia (
  id         TEXT PRIMARY KEY,
  usuario_id TEXT NOT NULL REFERENCES perfil(id) ON DELETE CASCADE,
  fecha      TEXT NOT NULL,
  nivel      INTEGER NOT NULL CHECK (nivel BETWEEN 1 AND 5),
  momento    TEXT NOT NULL CHECK (momento IN ('manana','tarde','noche')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX idx_energia ON registro_energia(usuario_id, fecha, momento);
`,
};
