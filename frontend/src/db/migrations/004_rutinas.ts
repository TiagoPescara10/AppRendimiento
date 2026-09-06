// src/db/migrations/004_rutinas.ts
//
// Version 4: rutinas semanales y el vinculo con los eventos que generan.
//
// Una rutina es la regla ("entrenamiento los lunes a las 08:30"), no la
// ocurrencia. Las ocurrencias se materializan como filas de `evento` en vez de
// calcularse al vuelo desde la regla: `completado` y el temporizador operan
// sobre un dia concreto, y no hay donde guardar eso si el evento no existe.
//
// `evento.rutina_id` es lo que hace posible las dos operaciones que necesita
// la materializacion: saber que ocurrencias ya se generaron (para no
// duplicarlas) y cuales borrar si el usuario desactiva la rutina.
//
// ON DELETE SET NULL y no CASCADE: borrar la regla no puede borrar el
// historial. El entrenamiento del martes pasado ocurrio; queda como evento
// suelto.
//
// El ALTER TABLE con REFERENCES es legal con foreign_keys = ON solo porque el
// default de la columna es NULL. Con cualquier otro default SQLite lo rechaza.
// Por eso tambien el CREATE de rutina va antes: al llegar al ALTER la tabla
// referenciada ya existe.
//
// El CHECK de `hora` no es decorativo. La hora se concatena con la fecha para
// armar el ISO 8601 del evento; un "8:30" sin padding produce un
// fecha_hora_inicio sintacticamente roto que no falla al escribirse, falla mas
// tarde y en otro lado.
//
// ---------------------------------------------------------------------------
//
// `evento.respondido` viene en esta misma migracion porque la de rutinas
// todavia no se publico. Resuelve una ambiguedad de `completado`: el 0 querria
// decir a la vez "no lo hice" y "todavia no conteste", y sin separarlas no hay
// forma de saber a quien preguntarle.
//
// Es una columna nueva y no un `completado` de tres estados en TEXT: convertir
// el tipo obliga a migrar los datos y a tocar todo lo que ya lo lee.
//
// El UPDATE del final es la contracara de agregarla con DEFAULT 0: sin el,
// TODO evento que ya existe en el telefono nace sin responder, y la primera
// apertura despues de actualizar es una avalancha de carteles preguntando por
// entrenamientos de hace meses. Un evento anterior a que la funcion existiera
// nunca se pregunto y no tiene sentido preguntarlo ahora. Los futuros quedan
// en 0 y entran al circuito normal.

import type { Migracion } from './index';

export const migracion004: Migracion = {
  version: 4,
  nombre: 'rutinas',
  sql: `
CREATE TABLE rutina (
  id                    TEXT PRIMARY KEY,
  usuario_id            TEXT NOT NULL REFERENCES perfil(id) ON DELETE CASCADE,
  dia_semana            INTEGER NOT NULL CHECK (dia_semana BETWEEN 0 AND 6),
  hora                  TEXT NOT NULL CHECK (hora GLOB '[0-2][0-9]:[0-5][0-9]'),
  tipo                  TEXT NOT NULL CHECK (tipo IN ('partido','entrenamiento','gimnasio','competencia')),
  duracion_estimada_min INTEGER,
  intensidad            TEXT NOT NULL CHECK (intensidad IN ('baja','media','alta')),
  activa                INTEGER NOT NULL DEFAULT 1 CHECK (activa IN (0,1)),
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL
);
CREATE INDEX idx_rutina_usuario ON rutina(usuario_id, activa);

ALTER TABLE evento ADD COLUMN rutina_id TEXT REFERENCES rutina(id) ON DELETE SET NULL;
CREATE INDEX idx_evento_rutina ON evento(rutina_id, fecha);

ALTER TABLE evento ADD COLUMN respondido INTEGER NOT NULL DEFAULT 0 CHECK (respondido IN (0,1));

-- Indice parcial: los sin responder son siempre pocas filas contra una tabla
-- que crece 8 semanas de rutinas por materializacion. Indexa solo esas.
CREATE INDEX idx_evento_sin_responder ON evento(usuario_id, fecha_hora_inicio) WHERE respondido = 0;

-- Backfill. datetime() normaliza el offset local a UTC, igual que datetime('now'),
-- asi que los dos lados de la comparacion estan en la misma escala.
UPDATE evento SET respondido = 1 WHERE datetime(fecha_hora_inicio) < datetime('now');
`,
};
