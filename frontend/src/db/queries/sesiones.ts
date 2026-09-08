// src/db/queries/sesiones.ts
//
// El detalle de una sesion del temporizador, crudo. Esto lee y escribe filas
// de `sesion_entrenamiento` y nada mas.
//
// Decidir si hay que crear un evento retroactivo, deducir la intensidad y
// dejar las dos escrituras en una transaccion es politica de entrenamiento,
// no acceso a datos: vive en src/features/entrenamiento/guardarSesion.ts.

import { getDb } from '../schema';
import type { SesionEntrenamientoRow } from '../schema';

const ahora = (): string => new Date().toISOString();

export interface NuevaSesion {
  id: string;
  evento_id: string;

  // lo configurado
  bloques: number;
  pasadas: number;
  trabajo_seg: number;
  descanso_seg: number;
  descanso_bloque_seg: number;

  // lo que se hizo
  bloques_completados: number;
  /** TOTAL de la sesion, no del ultimo bloque. Ver SesionEntrenamientoRow. */
  pasadas_completadas: number;
  duracion_real_seg: number;

  /** Solo cronometro. Ausente o null en una sesion de pasadas. */
  distancia_km?: number | null;
}

export async function crearSesion(datos: NuevaSesion): Promise<SesionEntrenamientoRow> {
  const t = ahora();
  await getDb().runAsync(
    `INSERT INTO sesion_entrenamiento
       (id, evento_id, bloques, pasadas, trabajo_seg, descanso_seg,
        descanso_bloque_seg, bloques_completados, pasadas_completadas,
        duracion_real_seg, distancia_km, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      datos.id,
      datos.evento_id,
      datos.bloques,
      datos.pasadas,
      datos.trabajo_seg,
      datos.descanso_seg,
      datos.descanso_bloque_seg,
      datos.bloques_completados,
      datos.pasadas_completadas,
      datos.duracion_real_seg,
      datos.distancia_km ?? null,
      t,
      t,
    ],
  );

  const fila = await obtenerSesion(datos.id);
  if (!fila) throw new Error(`No se pudo leer la sesion recien creada: ${datos.id}`);
  return fila;
}

export async function obtenerSesion(id: string): Promise<SesionEntrenamientoRow | null> {
  return getDb().getFirstAsync<SesionEntrenamientoRow>(
    'SELECT * FROM sesion_entrenamiento WHERE id = ?',
    [id],
  );
}

/**
 * La sesion de un evento, o null si ese evento no se corrio con temporizador.
 *
 * Devuelve una sola fila y no un array porque el UNIQUE de idx_sesion_evento
 * garantiza que no puede haber dos.
 */
export async function obtenerSesionPorEvento(
  eventoId: string,
): Promise<SesionEntrenamientoRow | null> {
  return getDb().getFirstAsync<SesionEntrenamientoRow>(
    'SELECT * FROM sesion_entrenamiento WHERE evento_id = ?',
    [eventoId],
  );
}

/**
 * Carga la distancia despues de haber guardado la sesion.
 *
 * Existe porque los dos datos no llegan juntos: la sesion se escribe apenas
 * termina el entrenamiento —para no perderla si se muere la app— y los
 * kilometros los escribe el usuario despues, en la pantalla de "Listo".
 *
 * null borra la distancia. El CHECK del DDL rechaza el 0, asi que "sin
 * distancia" tiene una sola representacion posible.
 */
export async function actualizarDistancia(
  sesionId: string,
  distanciaKm: number | null,
): Promise<void> {
  await getDb().runAsync(
    'UPDATE sesion_entrenamiento SET distancia_km = ?, updated_at = ? WHERE id = ?',
    [distanciaKm, ahora(), sesionId],
  );
}
