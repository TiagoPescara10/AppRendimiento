// src/db/migrations/024_comida_receta_guardada.ts
//
// Version 24: la comida recuerda la receta que se creo desde ella con
// "Guardar como receta". Asi el detalle sigue mostrando "Receta guardada" al
// volver a entrar, y el menu del historial no la ofrece de nuevo.
//
// ON DELETE SET NULL: si la receta se borra, la comida vuelve a ofrecer
// guardarla. Es la receta que salio de la comida, no la inversa: los items
// que salieron de una receta usan item_comida.receta_id (migracion 023).

import type { Migracion } from './index';

export const migracion024: Migracion = {
  version: 24,
  nombre: 'comida_receta_guardada',
  sql: `
ALTER TABLE comida ADD COLUMN receta_guardada_id TEXT
  REFERENCES receta(id) ON DELETE SET NULL;
CREATE INDEX idx_comida_receta_guardada ON comida(receta_guardada_id);
`,
};
