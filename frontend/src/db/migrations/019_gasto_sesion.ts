// src/db/migrations/019_gasto_sesion.ts
//
// Version 19: gasto estimado y foto de las sesiones de cronometro libre.
//
// actividad       'correr' | 'caminar' | 'bici'. El cronometro libre es para
//                 esas tres cosas: no se estima el gasto de otros deportes.
//                 NULL en las sesiones de antes y en pasadas o rutina.
// kcal_estimadas  gasto NETO (sin el reposo, que ya esta en el TDEE), con el
//                 peso del momento de la sesion. Queda guardado: si despues
//                 cambia el peso, la tarjeta de esa sesion no cambia. Es un
//                 dato de la sesion y nada mas: no suma al objetivo del dia.
// foto_uri        la foto de la tarjeta para compartir, copiada a los
//                 documentos de la app para poder volver a generarla.
//
// Ver src/lib/gasto.ts para la cuenta.

import type { Migracion } from './index';

export const migracion019: Migracion = {
  version: 19,
  nombre: 'gasto_sesion',
  sql: `
ALTER TABLE sesion_entrenamiento ADD COLUMN actividad TEXT
  CHECK (actividad IS NULL OR actividad IN ('correr', 'caminar', 'bici'));
ALTER TABLE sesion_entrenamiento ADD COLUMN kcal_estimadas REAL
  CHECK (kcal_estimadas IS NULL OR kcal_estimadas >= 0);
ALTER TABLE sesion_entrenamiento ADD COLUMN foto_uri TEXT;
`,
};
