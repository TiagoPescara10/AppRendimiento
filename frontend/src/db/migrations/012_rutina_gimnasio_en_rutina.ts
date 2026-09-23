// src/db/migrations/012_rutina_gimnasio_en_rutina.ts
//
// Version 12: referencia opcional a rutina_gimnasio en la tabla rutina.
//
// Permite que una regla semanal repetida de tipo 'gimnasio' (tabla rutina)
// apunte a una definicion especifica de rutina_gimnasio para ese dia de la semana,
// o quede en NULL si es sesion libre.

import type { Migracion } from './index';

export const migracion012: Migracion = {
  version: 12,
  nombre: 'rutina_gimnasio_en_rutina',
  sql: `
-- 1. Columna rutina_gimnasio_id en rutina
ALTER TABLE rutina ADD COLUMN rutina_gimnasio_id TEXT REFERENCES rutina_gimnasio(id) ON DELETE SET NULL;

-- 2. Indice para busquedas y joins
CREATE INDEX IF NOT EXISTS idx_rutina_rutina_gim ON rutina(rutina_gimnasio_id);
`,
};
