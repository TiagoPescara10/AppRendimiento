// src/db/migrations/016_deporte_rutina.ts
//
// Version 16: deporte especifico para rutinas tipo 'entrenamiento'.
//
// Permite que una rutina semanal de entrenamiento registre explicitamente
// a que deporte corresponde (ej: futbol, basquet, natacion, padel), evitando
// asumir deporte_principal del perfil al materializar ocurrencias en la agenda.

import type { Migracion } from './index';

export const migracion016: Migracion = {
  version: 16,
  nombre: 'deporte_rutina',
  sql: `
-- 1. Columna deporte en rutina (aplica principalmente a tipo 'entrenamiento')
ALTER TABLE rutina ADD COLUMN deporte TEXT NULL;

-- 2. Indice para busquedas y filtros por deporte
CREATE INDEX IF NOT EXISTS idx_rutina_deporte ON rutina(deporte);

-- 3. Backfill: A las rutinas tipo 'entrenamiento' existentes sin deporte,
-- les asignamos el deporte_principal actual del perfil de su usuario.
UPDATE rutina
SET deporte = (
  SELECT p.deporte_principal
  FROM perfil p
  WHERE p.id = rutina.usuario_id
)
WHERE tipo = 'entrenamiento'
  AND rutina_gimnasio_id IS NULL
  AND deporte IS NULL;
`,
};
