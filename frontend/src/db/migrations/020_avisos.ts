// src/db/migrations/020_avisos.ts
//
// Version 20: preferencias de los avisos antes y despues de los eventos.
//
// avisos_activos   interruptor general.
// avisos_antes     avisos de 3 h, 2 h, 1 h antes y el de la noche anterior.
// avisos_despues   aviso al terminar el evento.
// avisos_gimnasio  si los eventos de gimnasio tambien avisan.
//
// Van en perfil y no en meta: meta es estado del motor y esto lo elige el
// usuario. Todo en 1 por defecto, asi los perfiles existentes arrancan con
// los avisos prendidos. Ver src/features/avisos/.

import type { Migracion } from './index';

export const migracion020: Migracion = {
  version: 20,
  nombre: 'avisos',
  sql: `
ALTER TABLE perfil ADD COLUMN avisos_activos INTEGER NOT NULL DEFAULT 1
  CHECK (avisos_activos IN (0, 1));
ALTER TABLE perfil ADD COLUMN avisos_antes INTEGER NOT NULL DEFAULT 1
  CHECK (avisos_antes IN (0, 1));
ALTER TABLE perfil ADD COLUMN avisos_despues INTEGER NOT NULL DEFAULT 1
  CHECK (avisos_despues IN (0, 1));
ALTER TABLE perfil ADD COLUMN avisos_gimnasio INTEGER NOT NULL DEFAULT 1
  CHECK (avisos_gimnasio IN (0, 1));
`,
};
