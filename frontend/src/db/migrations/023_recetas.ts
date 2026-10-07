// src/db/migrations/023_recetas.ts
//
// Version 23: recetas (comidas armadas que se reusan) y su rastro en las
// comidas registradas.
//
// receta / receta_item
//   Los ingredientes son para la receta entera, con el mismo modelo que
//   item_comida: cantidad_g en el estado base del alimento y, si se peso en
//   el otro estado, lo que se peso de verdad. porciones dice en cuantas rinde.
//   usada_en ordena la lista: la ultima vez que se registro en una comida.
//
// item_comida
//   Al registrar una receta, sus ingredientes se guardan como items normales,
//   escalados por porciones comidas / porciones que rinde, asi que totales y
//   progreso no cambian. Lo que se suma es el contexto para agrupar:
//   receta_id         de que receta salio. ON DELETE SET NULL: borrar la
//                     receta no toca las comidas.
//   receta_grupo      mismo valor en los items de UNA vez que se agrego. Si
//                     en una comida se agrega dos veces, son dos grupos.
//   receta_nombre     el nombre en ese momento. El historial muestra lo que
//                     se comio, aunque la receta se borre o se renombre.
//   receta_porciones  cuantas porciones se comieron.
//
// ADD COLUMN con REFERENCES es valido porque el default es NULL: no hace
// falta recrear item_comida.

import type { Migracion } from './index';

export const migracion023: Migracion = {
  version: 23,
  nombre: 'recetas',
  sql: `
CREATE TABLE receta (
  id          TEXT PRIMARY KEY,
  usuario_id  TEXT NOT NULL REFERENCES perfil(id) ON DELETE CASCADE,
  nombre      TEXT NOT NULL CHECK (length(trim(nombre)) > 0),
  porciones   INTEGER NOT NULL CHECK (porciones >= 1),
  usada_en    TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
CREATE INDEX idx_receta_usuario ON receta(usuario_id, usada_en DESC);

CREATE TABLE receta_item (
  id                    TEXT PRIMARY KEY,
  receta_id             TEXT NOT NULL REFERENCES receta(id) ON DELETE CASCADE,
  alimento_id           TEXT NOT NULL REFERENCES alimento(id) ON DELETE RESTRICT,
  orden                 INTEGER NOT NULL CHECK (orden >= 0),
  cantidad_g            REAL NOT NULL CHECK (cantidad_g > 0),
  estado_carga          TEXT CHECK (estado_carga IS NULL OR estado_carga IN ('crudo', 'cocido')),
  cantidad_ingresada_g  REAL CHECK (cantidad_ingresada_g IS NULL OR cantidad_ingresada_g > 0),
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL
);
CREATE INDEX idx_receta_item ON receta_item(receta_id, orden);

ALTER TABLE item_comida ADD COLUMN receta_id TEXT
  REFERENCES receta(id) ON DELETE SET NULL;
ALTER TABLE item_comida ADD COLUMN receta_grupo TEXT;
ALTER TABLE item_comida ADD COLUMN receta_nombre TEXT;
ALTER TABLE item_comida ADD COLUMN receta_porciones REAL
  CHECK (receta_porciones IS NULL OR receta_porciones > 0);
CREATE INDEX idx_item_comida_receta ON item_comida(receta_id);
`,
};
