// src/db/migrations/011_deporte_evento.ts
//
// Version 11: deporte especifico para eventos tipo 'entrenamiento'.
//
// Permite que un evento de entrenamiento registre explicitamente a que deporte
// corresponde (ej: futbol, tenis, natacion), evitando asumir deporte_principal
// del perfil en usuarios multideporte.
//
// Incluye backfill que copia el deporte_principal del perfil a los eventos de
// tipo 'entrenamiento' existentes que no sean modos estructurados (modo_entrenamiento IS NULL).

import type { Migracion } from './index';

export const migracion011: Migracion = {
  version: 11,
  nombre: 'deporte_evento',
  sql: `
-- 1. Columna deporte en evento (solo aplica a tipo 'entrenamiento')
ALTER TABLE evento ADD COLUMN deporte TEXT NULL;

-- 2. Indice para busquedas y filtros por deporte
CREATE INDEX IF NOT EXISTS idx_evento_deporte ON evento(deporte);

-- 3. Backfill: A los eventos tipo 'entrenamiento' existentes les asignamos
-- el deporte_principal actual del perfil de su usuario, excluyendo modos estructurados.
UPDATE evento
SET deporte = (
  SELECT p.deporte_principal
  FROM perfil p
  WHERE p.id = evento.usuario_id
)
WHERE tipo = 'entrenamiento'
  AND modo_entrenamiento IS NULL;
`,
};
