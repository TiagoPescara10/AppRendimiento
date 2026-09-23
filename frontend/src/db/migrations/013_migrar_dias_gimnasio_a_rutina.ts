// src/db/migrations/013_migrar_dias_gimnasio_a_rutina.ts
//
// Version 13: migracion de asignaciones de dias de gimnasio a la tabla rutina
// y limpieza segura de duplicados futuros no completados.
//
// Elimina la necesidad de materializar desde dos fuentes paralelas: la tabla
// `rutina` pasa a ser la unica fuente de verdad para el cronograma semanal.

import type { Migracion } from './index';

export const migracion013: Migracion = {
  version: 13,
  nombre: 'migrar_dias_gimnasio_a_rutina',
  sql: `
-- 1. Migrar dias activos de rutina_gimnasio_dia hacia la tabla rutina
INSERT INTO rutina (
  id,
  usuario_id,
  dia_semana,
  hora,
  tipo,
  duracion_estimada_min,
  intensidad,
  activa,
  rutina_gimnasio_id,
  created_at,
  updated_at
)
SELECT
  lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' ||
  substr(lower(hex(randomblob(2))), 2) || '-a' || substr(lower(hex(randomblob(2))), 2) ||
  '-' || lower(hex(randomblob(6))),
  rg.usuario_id,
  rgd.dia_semana,
  rg.hora,
  'gimnasio',
  COALESCE(rg.duracion_estimada_min, 60),
  'media',
  rg.activa,
  rg.id,
  rg.created_at,
  rg.updated_at
FROM rutina_gimnasio_dia rgd
JOIN rutina_gimnasio rg ON rg.id = rgd.rutina_gimnasio_id
WHERE NOT EXISTS (
  SELECT 1 FROM rutina r
  WHERE r.usuario_id = rg.usuario_id
    AND r.dia_semana = rgd.dia_semana
    AND r.tipo = 'gimnasio'
    AND r.rutina_gimnasio_id = rg.id
    AND r.activa = 1
);

-- 2. Eliminar eventos duplicados futuros NO completados si ya existe otro con rutina_id.
--
-- Va ANTES del backfill del paso 3 a proposito: el criterio para reconocer al
-- duplicado huerfano es justamente que tenga rutina_id NULL. Si primero se
-- corriera el backfill, el huerfano quedaria con rutina_id no nulo y este
-- DELETE no lo alcanzaria nunca, dejando los dos eventos en la agenda.
DELETE FROM evento
WHERE id IN (
  SELECT e1.id
  FROM evento e1
  JOIN evento e2 ON e1.usuario_id = e2.usuario_id
                 AND e1.fecha = e2.fecha
                 AND e1.rutina_gimnasio_id = e2.rutina_gimnasio_id
  WHERE e1.id != e2.id
    AND e1.rutina_id IS NULL
    AND e2.rutina_id IS NOT NULL
    AND e1.completado = 0
    AND datetime(e1.fecha_hora_inicio) >= datetime('now')
);

-- 3. Vincular rutina_id en los eventos futuros no completados que sobrevivieron
UPDATE evento
SET rutina_id = (
  SELECT r.id FROM rutina r
  WHERE r.usuario_id = evento.usuario_id
    AND r.rutina_gimnasio_id = evento.rutina_gimnasio_id
    AND r.activa = 1
    AND strftime('%w', datetime(evento.fecha_hora_inicio)) = CAST(r.dia_semana AS TEXT)
  LIMIT 1
)
WHERE rutina_id IS NULL
  AND rutina_gimnasio_id IS NOT NULL
  AND completado = 0
  AND datetime(fecha_hora_inicio) >= datetime('now');
`,
};
