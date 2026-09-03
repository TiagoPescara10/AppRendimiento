// src/db/queries/eventos.ts
//
// Eventos deportivos. La seleccion de "que comer antes" no vive aca: esto solo
// devuelve el proximo evento y sus datos.

import { getDb } from '../schema';
import type { EventoRow, Intensidad, TipoEvento } from '../schema';

const ahora = (): string => new Date().toISOString();

export interface NuevoEvento {
  id: string;
  usuario_id: string;
  tipo: TipoEvento;
  /** ISO 8601 CON offset local. La columna generada `fecha` sale de aca. */
  fecha_hora_inicio: string;
  duracion_estimada_min?: number | null;
  intensidad: Intensidad;
  completado?: boolean;
  notas?: string | null;
}

export async function crearEvento(datos: NuevoEvento): Promise<EventoRow> {
  const t = ahora();
  await getDb().runAsync(
    `INSERT INTO evento
       (id, usuario_id, tipo, fecha_hora_inicio, duracion_estimada_min,
        intensidad, completado, notas, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      datos.id,
      datos.usuario_id,
      datos.tipo,
      datos.fecha_hora_inicio,
      datos.duracion_estimada_min ?? null,
      datos.intensidad,
      datos.completado ? 1 : 0,
      datos.notas ?? null,
      t,
      t,
    ],
  );

  const fila = await obtenerEvento(datos.id);
  if (!fila) throw new Error(`No se pudo leer el evento recien creado: ${datos.id}`);
  return fila;
}

export async function obtenerEvento(id: string): Promise<EventoRow | null> {
  return getDb().getFirstAsync<EventoRow>('SELECT * FROM evento WHERE id = ?', [id]);
}

/** `desde` y `hasta` son ISO 8601 completos, comparados como texto. */
export async function listarEventosPorRango(
  usuarioId: string,
  desde: string,
  hasta: string,
): Promise<EventoRow[]> {
  return getDb().getAllAsync<EventoRow>(
    `SELECT * FROM evento
     WHERE usuario_id = ? AND fecha_hora_inicio BETWEEN ? AND ?
     ORDER BY fecha_hora_inicio ASC`,
    [usuarioId, desde, hasta],
  );
}

export async function listarEventosPorFecha(
  usuarioId: string,
  fecha: string,
): Promise<EventoRow[]> {
  return getDb().getAllAsync<EventoRow>(
    `SELECT * FROM evento
     WHERE usuario_id = ? AND fecha = ?
     ORDER BY fecha_hora_inicio ASC`,
    [usuarioId, fecha],
  );
}

/**
 * Eventos que arrancan a partir de `desde`, mas cercano primero.
 * La ventana de 12h del motor de sugerencias se arma pasando `hasta`.
 */
export async function proximosEventos(
  usuarioId: string,
  desde: string,
  hasta?: string,
  limite: number = 10,
): Promise<EventoRow[]> {
  if (hasta) {
    return getDb().getAllAsync<EventoRow>(
      `SELECT * FROM evento
       WHERE usuario_id = ? AND fecha_hora_inicio >= ? AND fecha_hora_inicio <= ?
       ORDER BY fecha_hora_inicio ASC
       LIMIT ?`,
      [usuarioId, desde, hasta, limite],
    );
  }
  return getDb().getAllAsync<EventoRow>(
    `SELECT * FROM evento
     WHERE usuario_id = ? AND fecha_hora_inicio >= ?
     ORDER BY fecha_hora_inicio ASC
     LIMIT ?`,
    [usuarioId, desde, limite],
  );
}

export async function actualizarEvento(
  id: string,
  cambios: {
    tipo?: TipoEvento;
    fecha_hora_inicio?: string;
    duracion_estimada_min?: number | null;
    intensidad?: Intensidad;
    completado?: boolean;
    notas?: string | null;
  },
): Promise<void> {
  const campos: string[] = [];
  const valores: (string | number | null)[] = [];

  if (cambios.tipo !== undefined) {
    campos.push('tipo = ?');
    valores.push(cambios.tipo);
  }
  if (cambios.fecha_hora_inicio !== undefined) {
    campos.push('fecha_hora_inicio = ?');
    valores.push(cambios.fecha_hora_inicio);
  }
  if (cambios.duracion_estimada_min !== undefined) {
    campos.push('duracion_estimada_min = ?');
    valores.push(cambios.duracion_estimada_min);
  }
  if (cambios.intensidad !== undefined) {
    campos.push('intensidad = ?');
    valores.push(cambios.intensidad);
  }
  if (cambios.completado !== undefined) {
    campos.push('completado = ?');
    valores.push(cambios.completado ? 1 : 0);
  }
  if (cambios.notas !== undefined) {
    campos.push('notas = ?');
    valores.push(cambios.notas);
  }
  if (campos.length === 0) return;

  await getDb().runAsync(`UPDATE evento SET ${campos.join(', ')}, updated_at = ? WHERE id = ?`, [
    ...valores,
    ahora(),
    id,
  ]);
}

export async function eliminarEvento(id: string): Promise<void> {
  await getDb().runAsync('DELETE FROM evento WHERE id = ?', [id]);
}
