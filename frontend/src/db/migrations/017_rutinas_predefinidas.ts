// src/db/migrations/017_rutinas_predefinidas.ts
//
// Version 17: biblioteca de rutinas de gimnasio predefinidas.
//
// Tablas separadas de rutina_gimnasio a proposito: rutina_gimnasio es la
// coleccion de cada usuario, esta es un catalogo de solo lectura que se
// siembra al arrancar (src/db/seeds/rutinas-predefinidas.ts). El usuario no
// la edita nunca: copia una a rutina_gimnasio y a partir de ahi la copia es
// suya, sin ningun vinculo con la original. Por eso no hay columna que apunte
// de rutina_gimnasio a rutina_predefinida.
//
// No entran en la cola de sync: son datos del build, no del usuario.

import type { Migracion } from './index';

export const migracion017: Migracion = {
  version: 17,
  nombre: 'rutinas_predefinidas',
  sql: `
CREATE TABLE rutina_predefinida (
  id           TEXT PRIMARY KEY,
  nombre       TEXT NOT NULL,
  categoria    TEXT NOT NULL CHECK (categoria IN ('principiante', 'split', 'especifica')),
  descripcion  TEXT,
  orden        INTEGER NOT NULL,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

CREATE TABLE rutina_predefinida_ejercicio (
  id                     TEXT PRIMARY KEY,
  rutina_predefinida_id  TEXT NOT NULL REFERENCES rutina_predefinida(id) ON DELETE CASCADE,
  ejercicio_id           TEXT NOT NULL REFERENCES ejercicio(id),
  orden                  INTEGER NOT NULL
);

CREATE INDEX idx_rutina_predefinida_ejercicio_rutina
  ON rutina_predefinida_ejercicio(rutina_predefinida_id, orden);
`,
};
