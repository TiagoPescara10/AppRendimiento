// src/db/migrations/022_superseries.ts
//
// Version 22: superseries y circuitos en las rutinas de gimnasio.
//
// rutina_gimnasio_ejercicio.grupo: null es un ejercicio suelto; el mismo
// numero agrupa ejercicios consecutivos en una superserie (2) o un circuito
// (3 o mas). La numeracion es por rutina, no por bloque, asi que un numero
// nunca aparece en los dos bloques. Los triggers lo garantizan igual ante
// cualquier escritura que no pase por las queries.
//
// Que los ejercicios de un grupo sean consecutivos no lo controla la base: lo
// garantiza la forma de guardar (una lista de unidades, ver
// rutinasGimnasio.ts). Las series no cambian: se siguen guardando por
// ejercicio y las estadisticas no saben de grupos.

import type { Migracion } from './index';

export const migracion022: Migracion = {
  version: 22,
  nombre: 'superseries',
  sql: `
ALTER TABLE rutina_gimnasio_ejercicio ADD COLUMN grupo INTEGER
  CHECK (grupo IS NULL OR grupo >= 1);

CREATE TRIGGER trg_rge_grupo_un_bloque_ins
BEFORE INSERT ON rutina_gimnasio_ejercicio
WHEN NEW.grupo IS NOT NULL AND EXISTS (
  SELECT 1 FROM rutina_gimnasio_ejercicio
  WHERE rutina_gimnasio_id = NEW.rutina_gimnasio_id
    AND grupo = NEW.grupo AND bloque <> NEW.bloque
)
BEGIN
  SELECT RAISE(ABORT, 'un grupo no puede mezclar calentamiento y principal');
END;

CREATE TRIGGER trg_rge_grupo_un_bloque_upd
BEFORE UPDATE OF grupo, bloque ON rutina_gimnasio_ejercicio
WHEN NEW.grupo IS NOT NULL AND EXISTS (
  SELECT 1 FROM rutina_gimnasio_ejercicio
  WHERE rutina_gimnasio_id = NEW.rutina_gimnasio_id AND id <> NEW.id
    AND grupo = NEW.grupo AND bloque <> NEW.bloque
)
BEGIN
  SELECT RAISE(ABORT, 'un grupo no puede mezclar calentamiento y principal');
END;
`,
};
