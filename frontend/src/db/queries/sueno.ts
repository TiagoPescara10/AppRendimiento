// src/db/queries/sueno.ts
//
// Una fila por noche: el indice unico (usuario_id, fecha) lo garantiza y
// habilita el UPSERT, para que re-registrar la misma noche pise en vez de
// duplicar. La correlacion sueno/energia no se calcula aca.

import { getDb } from '../schema';
import type { FuenteSueno, RegistroSuenoRow } from '../schema';

const ahora = (): string => new Date().toISOString();

export interface NuevoRegistroSueno {
  id: string;
  usuario_id: string;
  /** YYYY-MM-DD de la noche que corresponde (la del dia en que se acosto). */
  fecha: string;
  /** ISO 8601 completo, no solo la hora: el sueno cruza medianoche. */
  hora_dormir?: string | null;
  hora_despertar?: string | null;
  duracion_min: number;
  /** 1-5, opcional. */
  calidad_percibida?: number | null;
  fuente: FuenteSueno;
}

/**
 * Inserta la noche o la pisa si ya existe. El `id` del parametro solo se usa
 * cuando la fila es nueva; si ya habia registro para esa noche, conserva el suyo.
 */
export async function guardarSueno(datos: NuevoRegistroSueno): Promise<RegistroSuenoRow> {
  const t = ahora();
  await getDb().runAsync(
    `INSERT INTO registro_sueno
       (id, usuario_id, fecha, hora_dormir, hora_despertar, duracion_min,
        calidad_percibida, fuente, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(usuario_id, fecha) DO UPDATE SET
       hora_dormir       = excluded.hora_dormir,
       hora_despertar    = excluded.hora_despertar,
       duracion_min      = excluded.duracion_min,
       calidad_percibida = excluded.calidad_percibida,
       fuente            = excluded.fuente,
       updated_at        = excluded.updated_at`,
    [
      datos.id,
      datos.usuario_id,
      datos.fecha,
      datos.hora_dormir ?? null,
      datos.hora_despertar ?? null,
      datos.duracion_min,
      datos.calidad_percibida ?? null,
      datos.fuente,
      t,
      t,
    ],
  );

  const fila = await obtenerSuenoPorFecha(datos.usuario_id, datos.fecha);
  if (!fila) throw new Error(`No se pudo leer el registro de sueno: ${datos.fecha}`);
  return fila;
}

export async function obtenerSueno(id: string): Promise<RegistroSuenoRow | null> {
  return getDb().getFirstAsync<RegistroSuenoRow>('SELECT * FROM registro_sueno WHERE id = ?', [
    id,
  ]);
}

export async function obtenerSuenoPorFecha(
  usuarioId: string,
  fecha: string,
): Promise<RegistroSuenoRow | null> {
  return getDb().getFirstAsync<RegistroSuenoRow>(
    'SELECT * FROM registro_sueno WHERE usuario_id = ? AND fecha = ?',
    [usuarioId, fecha],
  );
}

/** Mas reciente primero. `desde` y `hasta` son YYYY-MM-DD inclusive. */
export async function listarSuenoPorRango(
  usuarioId: string,
  desde: string,
  hasta: string,
): Promise<RegistroSuenoRow[]> {
  return getDb().getAllAsync<RegistroSuenoRow>(
    `SELECT * FROM registro_sueno
     WHERE usuario_id = ? AND fecha BETWEEN ? AND ?
     ORDER BY fecha DESC`,
    [usuarioId, desde, hasta],
  );
}

export async function ultimoSueno(usuarioId: string): Promise<RegistroSuenoRow | null> {
  return getDb().getFirstAsync<RegistroSuenoRow>(
    'SELECT * FROM registro_sueno WHERE usuario_id = ? ORDER BY fecha DESC LIMIT 1',
    [usuarioId],
  );
}

export async function eliminarSueno(id: string): Promise<void> {
  await getDb().runAsync('DELETE FROM registro_sueno WHERE id = ?', [id]);
}
