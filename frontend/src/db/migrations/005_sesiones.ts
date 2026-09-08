// src/db/migrations/005_sesiones.ts
//
// Version 5: el detalle de una sesion de temporizador.
//
// Hasta ahora terminar un entrenamiento solo escribia `evento.completado = 1`.
// Eso alcanza para el calendario y para nada mas: no queda registro de que se
// hizo, y si la sesion se corrio sin evento agendado (desde "Entrenar" en el
// dashboard) no quedaba absolutamente nada.
//
// Por que la config Y lo completado, por separado:
// programar 6 bloques y cortar en el 4 son dos hechos distintos, y la
// diferencia entre los dos es justamente el dato interesante. Guardar solo lo
// completado pierde la intencion; guardar solo la config miente.
//
// La sesion cuelga del evento y no del usuario: el evento ya tiene el
// usuario_id, la fecha y el tipo, y duplicarlos aca abriria la puerta a que
// digan cosas distintas. El ON DELETE CASCADE es la consecuencia: borrar el
// entrenamiento del martes se lleva su detalle, que solo, sin el evento, no
// significa nada.
//
// El UNIQUE sobre evento_id es la promesa que hace obtenerSesionPorEvento() al
// devolver una fila o null. Si algun dia se quiere rehacer un entrenamiento y
// guardar dos sesiones contra el mismo evento, hace falta migracion.
//
// trabajo_seg admite 0 y no es un descuido: el cronometro ES trabajo_seg = 0.
// Ese cero es lo que lo define, ver esCronometro() en features/entrenamiento.
//
// distancia_km solo tiene sentido en el cronometro; un entrenamiento de
// pasadas no tiene kilometros. El CHECK obliga a que "sin distancia" sea
// siempre NULL y nunca 0: un 0 km no significa nada y daria ritmo nulo igual,
// asi que dejarlo entrar seria tener dos formas de decir lo mismo.

import type { Migracion } from './index';

export const migracion005: Migracion = {
  version: 5,
  nombre: 'sesiones_entrenamiento',
  sql: `
CREATE TABLE sesion_entrenamiento (
  id                    TEXT PRIMARY KEY,
  evento_id             TEXT NOT NULL REFERENCES evento(id) ON DELETE CASCADE,

  -- lo configurado, tal como quedo al tocar "Empezar"
  bloques               INTEGER NOT NULL CHECK (bloques >= 1),
  pasadas               INTEGER NOT NULL CHECK (pasadas >= 1),
  trabajo_seg           INTEGER NOT NULL CHECK (trabajo_seg >= 0),
  descanso_seg          INTEGER NOT NULL CHECK (descanso_seg >= 0),
  descanso_bloque_seg   INTEGER NOT NULL CHECK (descanso_bloque_seg >= 0),

  -- lo que se hizo de verdad
  bloques_completados   INTEGER NOT NULL CHECK (bloques_completados >= 0),

  -- OJO CON LA UNIDAD: es el TOTAL de pasadas de toda la sesion, no las del
  -- ultimo bloque. Con 6 bloques de 8 pasadas completos, aca va 48 y no 8.
  --
  -- Va en total por dos razones. Una, esta al lado de duracion_real_seg, que
  -- tambien es total, y mezclar escalas en el mismo grupo de columnas se lee
  -- mal. Dos, y es la que decide: del total se puede derivar el bloque actual
  -- dividiendo, pero del "8 del ultimo bloque" no se puede reconstruir el
  -- total sin asumir que todos los bloques anteriores estuvieron completos.
  pasadas_completadas   INTEGER NOT NULL CHECK (pasadas_completadas >= 0),

  duracion_real_seg     INTEGER NOT NULL CHECK (duracion_real_seg >= 0),

  distancia_km          REAL CHECK (distancia_km IS NULL OR distancia_km > 0),

  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL
);

CREATE UNIQUE INDEX idx_sesion_evento ON sesion_entrenamiento(evento_id);
`,
};
