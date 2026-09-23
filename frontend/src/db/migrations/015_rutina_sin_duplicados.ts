// src/db/migrations/015_rutina_sin_duplicados.ts
//
// Version 15: una sola fila activa de `rutina` por dia y por cosa programada.
//
// Nuevo evento insertaba una fila por dia sin mirar las que ya habia, asi que
// volver a asignar la misma rutina de gimnasio al lunes dejaba dos filas
// activas: dos eventos por fecha en la agenda y el dia repetido en los badges
// de Entrenamientos (React rompia por keys duplicadas).
//
// Orden de los pasos:
//   1. desactivar los duplicados, conservando la fila mas vieja de cada grupo;
//   2. borrar los eventos futuros sin completar de las filas desactivadas en 1;
//   3. crear los indices unicos parciales, que ya no chocan con nada.

import type { Migracion } from './index';

export const migracion015: Migracion = {
  version: 15,
  nombre: 'rutina_sin_duplicados',
  sql: `
-- 1a. Gimnasio con rutina fija: un dia, una fila activa por rutina_gimnasio_id.
-- La fila mas vieja nunca se desactiva (no hay otra anterior), asi que el
-- resultado no depende del orden en que SQLite recorra el UPDATE.
UPDATE rutina
SET activa = 0, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE activa = 1
  AND rutina_gimnasio_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM rutina r2
    WHERE r2.activa = 1
      AND r2.usuario_id = rutina.usuario_id
      AND r2.dia_semana = rutina.dia_semana
      AND r2.rutina_gimnasio_id = rutina.rutina_gimnasio_id
      AND (r2.created_at < rutina.created_at
           OR (r2.created_at = rutina.created_at AND r2.id < rutina.id))
  );

-- 1b. Sin rutina de gimnasio: duplicado es mismo dia, tipo y hora.
UPDATE rutina
SET activa = 0, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE activa = 1
  AND rutina_gimnasio_id IS NULL
  AND EXISTS (
    SELECT 1 FROM rutina r2
    WHERE r2.activa = 1
      AND r2.rutina_gimnasio_id IS NULL
      AND r2.usuario_id = rutina.usuario_id
      AND r2.dia_semana = rutina.dia_semana
      AND r2.tipo = rutina.tipo
      AND r2.hora = rutina.hora
      AND (r2.created_at < rutina.created_at
           OR (r2.created_at = rutina.created_at AND r2.id < rutina.id))
  );

-- 2. Eventos futuros sin completar de rutinas inactivas. desactivarRutina()
-- ya los borra al dar de baja, asi que en una base sana solo alcanza a los
-- del paso 1. Nunca toca completados ni eventos con sesion registrada.
DELETE FROM evento
WHERE rutina_id IN (SELECT id FROM rutina WHERE activa = 0)
  AND completado = 0
  AND datetime(fecha_hora_inicio) >= datetime('now')
  AND id NOT IN (SELECT evento_id FROM sesion_entrenamiento);

-- 3. Que la base rechace cualquier duplicado futuro.
CREATE UNIQUE INDEX idx_rutina_dia_gimnasio
  ON rutina(usuario_id, dia_semana, rutina_gimnasio_id)
  WHERE activa = 1 AND rutina_gimnasio_id IS NOT NULL;

CREATE UNIQUE INDEX idx_rutina_dia_libre
  ON rutina(usuario_id, dia_semana, tipo, hora)
  WHERE activa = 1 AND rutina_gimnasio_id IS NULL;
`,
};
