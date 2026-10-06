// src/db/migrations/018_coccion.ts
//
// Version 18: crudo y cocido. Ver src/lib/coccion.ts para el modelo completo.
//
// Solo agrega columnas. Los factores de la semilla NO se cargan aca: una
// migracion corre una sola vez, y un alimento que se sume o se corrija despues
// no le llegaria a una base ya migrada. Se cargan con un paso versionado de
// semilla (src/db/seeds/coccion.ts), con marca en meta como los lotes.
//
// alimento
//   factor_coccion        peso cocido / peso crudo. NULL = no aplica.
//   estado_base           en que estado estan los valores por 100 g. NULL = no aplica.
//   categorias_revisadas  1 cuando ya se le pidieron las categorias a Open Food
//                         Facts. Los escaneados de antes de esta version quedan
//                         en 0 y se completan la proxima vez que se escanean.
//
// item_comida
//   estado_carga          en que estado lo peso el usuario. NULL = en el estado
//                         base del alimento, que es lo de siempre.
//   cantidad_ingresada_g  lo que peso de verdad, solo para mostrar.
//
// cantidad_g NO cambia de significado: sigue en el estado base del alimento,
// y por eso ninguna query de totales se toca. Los items existentes quedan
// bien sin migrar datos: la semilla siempre fue cocido, y los escaneados
// siempre guardaron gramos del producto como se vende.

import type { Migracion } from './index';

export const migracion018: Migracion = {
  version: 18,
  nombre: 'coccion',
  sql: `
ALTER TABLE alimento ADD COLUMN factor_coccion REAL
  CHECK (factor_coccion IS NULL OR factor_coccion > 0);
ALTER TABLE alimento ADD COLUMN estado_base TEXT
  CHECK (estado_base IS NULL OR estado_base IN ('crudo', 'cocido'));
ALTER TABLE alimento ADD COLUMN categorias_revisadas INTEGER NOT NULL DEFAULT 0
  CHECK (categorias_revisadas IN (0, 1));

ALTER TABLE item_comida ADD COLUMN estado_carga TEXT
  CHECK (estado_carga IS NULL OR estado_carga IN ('crudo', 'cocido'));
ALTER TABLE item_comida ADD COLUMN cantidad_ingresada_g REAL
  CHECK (cantidad_ingresada_g IS NULL OR cantidad_ingresada_g > 0);
`,
};
