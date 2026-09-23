// src/db/migrations/014_limpiar_rutina_gimnasio_catalogo.ts
//
// Version 14: convertir rutina_gimnasio en un catalogo puro de nombre + ejercicios.
// Se eliminan las columnas hora y duracion_estimada_min, y se descarta la tabla
// rutina_gimnasio_dia. La programacion temporal vive unicamente en la tabla rutina.

import type { Migracion } from './index';

export const migracion014: Migracion = {
  version: 14,
  nombre: 'limpiar_rutina_gimnasio_catalogo',
  sql: `
-- 1. Eliminar la tabla redundante de dias de gimnasio
DROP TABLE IF EXISTS rutina_gimnasio_dia;

-- 2. Eliminar hora y duracion_estimada_min de rutina_gimnasio
ALTER TABLE rutina_gimnasio DROP COLUMN hora;
ALTER TABLE rutina_gimnasio DROP COLUMN duracion_estimada_min;
`,
};
