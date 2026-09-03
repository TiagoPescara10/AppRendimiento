// src/db/migrations/003_meta.ts
//
// Version 3: tabla `meta`, clave/valor para estado interno de la base.
//
// Nace para marcar que semilla de alimentos ya corrio. `user_version` no
// servia: lo usa el mecanismo de migraciones y es un solo entero por archivo.
//
// Es a proposito generica y no "semillas": el proximo dato de este tipo
// (ultima sincronizacion, id de instalacion) entra sin migracion nueva. Nada
// que el usuario vea va aca; esto es estado del motor, no datos suyos.

import type { Migracion } from './index';

export const migracion003: Migracion = {
  version: 3,
  nombre: 'meta',
  sql: `
CREATE TABLE meta (
  clave      TEXT PRIMARY KEY,
  valor      TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`,
};
