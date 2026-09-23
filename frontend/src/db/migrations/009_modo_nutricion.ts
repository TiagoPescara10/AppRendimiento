// src/db/migrations/009_modo_nutricion.ts
//
// Version 9: modo de uso dual (objetivo vs recuento) en perfil.

import type { Migracion } from './index';

export const migracion009: Migracion = {
  version: 9,
  nombre: 'modo_nutricion',
  sql: `
ALTER TABLE perfil ADD COLUMN modo_nutricion TEXT NOT NULL DEFAULT 'objetivo'
  CHECK (modo_nutricion IN ('objetivo', 'recuento'));
`,
};
