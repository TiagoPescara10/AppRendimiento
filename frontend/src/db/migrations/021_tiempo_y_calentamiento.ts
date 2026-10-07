// src/db/migrations/021_tiempo_y_calentamiento.ts
//
// Version 21: ejercicios que se miden por tiempo y bloque de calentamiento.
//
// 1. ejercicio.medida ('repeticiones' | 'tiempo'). ADD COLUMN acepta CHECK,
//    asi que no hace falta recrear ejercicio. Y no conviene: es padre de serie,
//    rutina_gimnasio_ejercicio y rutina_predefinida_ejercicio, y con
//    foreign_keys = ON el RENAME reescribe las FK de las hijas hacia la tabla
//    vieja. Apagar foreign_keys no tiene efecto dentro de la transaccion en la
//    que corre cada migracion.
//    El UPDATE cubre a los usuarios que ya tenian sembrado el catalogo. En una
//    base nueva la tabla esta vacia aca y la medida la pone la semilla.
//
// 2. rutina_gimnasio_ejercicio.bloque ('calentamiento' | 'principal'). El
//    orden pasa a ser dentro de cada bloque.
//
// 3. serie se recrea, como sesion_entrenamiento en la 006, porque
//    repeticiones deja de ser NOT NULL. Una serie tiene repeticiones o
//    duracion_seg, exactamente una de las dos. es_calentamiento se guarda en
//    la serie y no se lee de la rutina: si el usuario cambia la rutina
//    despues, las estadisticas siguen filtrando lo que fue calentamiento.
//    Nadie referencia a serie, asi que renombrarla es seguro. Los indices
//    viejos se van con la tabla renombrada: se crean despues del DROP, porque
//    antes IF NOT EXISTS veria los nombres viejos y no haria nada.

import type { Migracion } from './index';

export const migracion021: Migracion = {
  version: 21,
  nombre: 'tiempo_y_calentamiento',
  sql: `
-- 1. Tipo de medida del ejercicio
ALTER TABLE ejercicio ADD COLUMN medida TEXT NOT NULL DEFAULT 'repeticiones'
  CHECK (medida IN ('repeticiones', 'tiempo'));

UPDATE ejercicio
SET medida = 'tiempo', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE nombre IN (
  'Plancha isometrica', 'Plancha lateral', 'Vacio abdominal',
  'Cinta de correr', 'Bicicleta fija', 'Eliptico',
  'Remo ergometro', 'Salto a la soga', 'Escalador'
);

-- 2. Bloque del ejercicio en la rutina
ALTER TABLE rutina_gimnasio_ejercicio ADD COLUMN bloque TEXT NOT NULL DEFAULT 'principal'
  CHECK (bloque IN ('calentamiento', 'principal'));

-- 3. Recreacion de serie
ALTER TABLE serie RENAME TO _serie_v20;

CREATE TABLE serie (
  id                    TEXT PRIMARY KEY,
  sesion_id             TEXT NOT NULL REFERENCES sesion_entrenamiento(id) ON DELETE CASCADE,
  ejercicio_id          TEXT NOT NULL REFERENCES ejercicio(id),
  orden                 INTEGER NOT NULL CHECK (orden >= 0),
  repeticiones          INTEGER CHECK (repeticiones IS NULL OR repeticiones >= 1),
  duracion_seg          INTEGER CHECK (duracion_seg IS NULL OR duracion_seg >= 1),
  peso_kg               REAL CHECK (peso_kg IS NULL OR peso_kg >= 0),
  es_calentamiento      INTEGER NOT NULL DEFAULT 0 CHECK (es_calentamiento IN (0, 1)),
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL,
  -- Exactamente una de las dos: repeticiones o tiempo
  CHECK ((repeticiones IS NULL) <> (duracion_seg IS NULL))
);

INSERT INTO serie (
  id, sesion_id, ejercicio_id, orden, repeticiones, duracion_seg,
  peso_kg, es_calentamiento, created_at, updated_at
)
SELECT
  id, sesion_id, ejercicio_id, orden, repeticiones, NULL,
  peso_kg, 0, created_at, updated_at
FROM _serie_v20;

DROP TABLE _serie_v20;

CREATE INDEX idx_serie_sesion ON serie(sesion_id, orden);
CREATE INDEX idx_serie_ejercicio ON serie(ejercicio_id);
`,
};
