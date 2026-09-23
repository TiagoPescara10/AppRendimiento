// src/db/migrations/010_modo_entrenamiento_evento.ts
//
// Version 10: modo de entrenamiento estructurado en evento.
//
// Permite distinguir eventos retroactivos creados por cronometro libre,
// pasadas o rutina de gimnasio, sin inferir de notas de texto libre ni
// confundirlos con el deporte principal del perfil cuando rutina_id es NULL.

import type { Migracion } from './index';

export const migracion010: Migracion = {
  version: 10,
  nombre: 'modo_entrenamiento_evento',
  sql: `
-- 1. Columna estructurada para el modo de entrenamiento
ALTER TABLE evento ADD COLUMN modo_entrenamiento TEXT NULL
  CHECK (modo_entrenamiento IN ('cronometro', 'pasadas', 'rutina') OR modo_entrenamiento IS NULL);

-- 2. Indice para busquedas y filtrado por modo
CREATE INDEX IF NOT EXISTS idx_evento_modo_entrenamiento ON evento(modo_entrenamiento);

-- 3. Backfill: poblar eventos historicos que ya cuentan con sesion_entrenamiento
-- Solo para eventos que NO provienen de una rutina deportiva programada (rutina_id IS NULL).
UPDATE evento
SET modo_entrenamiento = (
  SELECT s.modo
  FROM sesion_entrenamiento s
  WHERE s.evento_id = evento.id
)
WHERE rutina_id IS NULL
  AND EXISTS (
    SELECT 1
    FROM sesion_entrenamiento s
    WHERE s.evento_id = evento.id
  );
`,
};
