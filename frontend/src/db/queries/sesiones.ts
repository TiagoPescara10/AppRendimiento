// src/db/queries/sesiones.ts
//
// El detalle de una sesion de entrenamiento (pasadas, cronometro o rutina).
// Lee y escribe filas de sesion_entrenamiento y serie.

import { getDb } from '../schema';
import type {
  SesionEntrenamientoRow,
  SerieRow,
  EjercicioRow,
  ModoEntrenamiento,
  GrupoMuscular,
  EventoRow,
  TipoEvento,
  Intensidad,
} from '../schema';

const ahora = (): string => new Date().toISOString();

export interface NuevaSesion {
  id: string;
  evento_id: string;
  modo?: ModoEntrenamiento;
  rutina_gimnasio_id?: string | null;

  // lo configurado (solo pasadas y cronometro)
  bloques?: number | null;
  pasadas?: number | null;
  trabajo_seg?: number | null;
  descanso_seg?: number | null;
  descanso_bloque_seg?: number | null;

  // lo que se hizo
  bloques_completados?: number | null;
  pasadas_completadas?: number | null;
  duracion_real_seg?: number | null;

  /** Solo cronometro. */
  distancia_km?: number | null;
}

export async function crearSesion(datos: NuevaSesion): Promise<SesionEntrenamientoRow> {
  const t = ahora();
  const modo: ModoEntrenamiento =
    datos.modo ?? (datos.trabajo_seg === 0 ? 'cronometro' : 'pasadas');

  await getDb().runAsync(
    `INSERT INTO sesion_entrenamiento
       (id, evento_id, modo, rutina_gimnasio_id, bloques, pasadas, trabajo_seg, descanso_seg,
        descanso_bloque_seg, bloques_completados, pasadas_completadas,
        duracion_real_seg, distancia_km, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      datos.id,
      datos.evento_id,
      modo,
      datos.rutina_gimnasio_id ?? null,
      datos.bloques ?? null,
      datos.pasadas ?? null,
      datos.trabajo_seg ?? null,
      datos.descanso_seg ?? null,
      datos.descanso_bloque_seg ?? null,
      datos.bloques_completados ?? null,
      datos.pasadas_completadas ?? null,
      datos.duracion_real_seg ?? null,
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
 * La sesion de un evento, o null si ese evento no tiene sesion asociada.
 */
export async function obtenerSesionPorEvento(
  eventoId: string,
): Promise<SesionEntrenamientoRow | null> {
  return getDb().getFirstAsync<SesionEntrenamientoRow>(
    'SELECT * FROM sesion_entrenamiento WHERE evento_id = ?',
    [eventoId],
  );
}

export async function actualizarDistancia(
  sesionId: string,
  distanciaKm: number | null,
): Promise<void> {
  await getDb().runAsync(
    'UPDATE sesion_entrenamiento SET distancia_km = ?, updated_at = ? WHERE id = ?',
    [distanciaKm, ahora(), sesionId],
  );
}

// ---------------------------------------------------------------------------
// Series (Rutina de gimnasio)
// ---------------------------------------------------------------------------

export interface NuevaSerie {
  id: string;
  sesion_id: string;
  ejercicio_id: string;
  orden: number;
  repeticiones: number;
  peso_kg?: number | null;
}

export async function agregarSerie(datos: NuevaSerie): Promise<SerieRow> {
  const t = ahora();
  await getDb().runAsync(
    `INSERT INTO serie (id, sesion_id, ejercicio_id, orden, repeticiones, peso_kg, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      datos.id,
      datos.sesion_id,
      datos.ejercicio_id,
      datos.orden,
      datos.repeticiones,
      datos.peso_kg ?? null,
      t,
      t,
    ],
  );

  const fila = await getDb().getFirstAsync<SerieRow>(
    'SELECT * FROM serie WHERE id = ?',
    [datos.id],
  );
  if (!fila) throw new Error(`No se pudo leer la serie creada: ${datos.id}`);
  return fila;
}

export async function agregarSeries(series: NuevaSerie[]): Promise<void> {
  if (series.length === 0) return;
  const t = ahora();
  for (const s of series) {
    await getDb().runAsync(
      `INSERT INTO serie (id, sesion_id, ejercicio_id, orden, repeticiones, peso_kg, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [s.id, s.sesion_id, s.ejercicio_id, s.orden, s.repeticiones, s.peso_kg ?? null, t, t],
    );
  }
}

export async function eliminarSerie(id: string): Promise<void> {
  await getDb().runAsync('DELETE FROM serie WHERE id = ?', [id]);
}

export interface SerieConEjercicio extends SerieRow {
  ejercicio_nombre: string;
  ejercicio_grupo: GrupoMuscular;
}

export async function listarSeriesConEjercicio(sesionId: string): Promise<SerieConEjercicio[]> {
  return getDb().getAllAsync<SerieConEjercicio>(
    `SELECT s.*, e.nombre AS ejercicio_nombre, e.grupo AS ejercicio_grupo
     FROM serie s
     JOIN ejercicio e ON e.id = s.ejercicio_id
     WHERE s.sesion_id = ?
     ORDER BY s.orden ASC`,
    [sesionId],
  );
}

export interface UltimaRutinaGimnasio {
  sesion: SesionEntrenamientoRow;
  evento: EventoRow;
  series: SerieConEjercicio[];
}

/**
 * Devuelve la ultima sesion de gimnasio con sus series, para ofrecer repetirla.
 */
export async function obtenerUltimaSesionRutina(
  usuarioId: string,
): Promise<UltimaRutinaGimnasio | null> {
  const fila = await getDb().getFirstAsync<SesionEntrenamientoRow & { fecha: string }>(
    `SELECT s.*, e.fecha
     FROM sesion_entrenamiento s
     JOIN evento e ON e.id = s.evento_id
     WHERE e.usuario_id = ? AND s.modo = 'rutina'
     ORDER BY e.fecha_hora_inicio DESC
     LIMIT 1`,
    [usuarioId],
  );

  if (!fila) return null;

  const evento = await getDb().getFirstAsync<EventoRow>(
    'SELECT * FROM evento WHERE id = ?',
    [fila.evento_id],
  );
  if (!evento) return null;

  const series = await listarSeriesConEjercicio(fila.id);
  if (series.length === 0) return null;

  return { sesion: fila, evento, series };
}

export interface ResumenRutina {
  ejercicios_count: number;
  series_count: number;
  series_con_peso_count: number;
  volumen_kg: number;
}

export async function obtenerResumenRutina(sesionId: string): Promise<ResumenRutina> {
  const fila = await getDb().getFirstAsync<{
    ejercicios_count: number;
    series_count: number;
    series_con_peso_count: number;
    volumen_kg: number;
  }>(
    `SELECT
       COUNT(DISTINCT ejercicio_id) AS ejercicios_count,
       COUNT(*) AS series_count,
       COALESCE(SUM(CASE WHEN peso_kg IS NOT NULL AND peso_kg > 0 THEN 1 ELSE 0 END), 0) AS series_con_peso_count,
       COALESCE(SUM(CASE WHEN peso_kg IS NOT NULL AND peso_kg > 0 THEN repeticiones * peso_kg ELSE 0 END), 0) AS volumen_kg
     FROM serie
     WHERE sesion_id = ?`,
    [sesionId],
  );

  return {
    ejercicios_count: fila?.ejercicios_count ?? 0,
    series_count: fila?.series_count ?? 0,
    series_con_peso_count: fila?.series_con_peso_count ?? 0,
    volumen_kg: fila?.volumen_kg ?? 0,
  };
}

export interface SeriePreviaEjercicio {
  orden: number;
  repeticiones: number;
  peso_kg: number | null;
  fecha: string;
}

/**
 * Devuelve las series que el usuario hizo la ultima vez con este ejercicio.
 * Se busca la sesion mas reciente que contenga este ejercicio y se traen sus series ordenadas.
 */
export async function obtenerSeriesPreviasPorEjercicio(
  usuarioId: string,
  ejercicioId: string,
  sesionIdExcluir?: string,
): Promise<SeriePreviaEjercicio[]> {
  const db = getDb();
  // Encontrar la sesion mas reciente donde se hizo este ejercicio (opcionalmente excluyendo una sesion)
  const query = sesionIdExcluir
    ? `SELECT s.sesion_id, e.fecha
       FROM serie s
       JOIN sesion_entrenamiento se ON se.id = s.sesion_id
       JOIN evento e ON e.id = se.evento_id
       WHERE e.usuario_id = ? AND s.ejercicio_id = ? AND se.id != ?
       ORDER BY e.fecha_hora_inicio DESC
       LIMIT 1`
    : `SELECT s.sesion_id, e.fecha
       FROM serie s
       JOIN sesion_entrenamiento se ON se.id = s.sesion_id
       JOIN evento e ON e.id = se.evento_id
       WHERE e.usuario_id = ? AND s.ejercicio_id = ?
       ORDER BY e.fecha_hora_inicio DESC
       LIMIT 1`;

  const params = sesionIdExcluir
    ? [usuarioId, ejercicioId, sesionIdExcluir]
    : [usuarioId, ejercicioId];

  const ultimaSesion = await db.getFirstAsync<{ sesion_id: string; fecha: string }>(
    query,
    params,
  );

  if (!ultimaSesion) return [];

  const series = await db.getAllAsync<{
    orden: number;
    repeticiones: number;
    peso_kg: number | null;
  }>(
    `SELECT orden, repeticiones, peso_kg
     FROM serie
     WHERE sesion_id = ? AND ejercicio_id = ?
     ORDER BY orden ASC`,
    [ultimaSesion.sesion_id, ejercicioId],
  );

  return series.map((s) => ({
    ...s,
    fecha: ultimaSesion.fecha,
  }));
}

export interface SesionReciente {
  evento_id: string;
  tipo: TipoEvento;
  fecha: string;
  fecha_hora_inicio: string;
  duracion_estimada_min: number | null;
  intensidad: Intensidad;
  sesion_id: string | null;
  modo: ModoEntrenamiento | null;
  duracion_real_seg: number | null;
  distancia_km: number | null;
  bloques_completados: number | null;
  pasadas_completadas: number | null;
  rutina_nombre: string | null;
  series_count: number;
  ejercicios_count: number;
  volumen_kg: number;
}

/**
 * Devuelve las sesiones/eventos completados del usuario en orden cronológico inverso,
 * con sus métricas calculadas (series, volumen, duración, distancia).
 */
export async function listarEntrenamientosCompletados(
  usuarioId: string,
  limite: number = 20,
): Promise<SesionReciente[]> {
  const db = getDb();
  return db.getAllAsync<SesionReciente>(
    `SELECT
       e.id AS evento_id,
       CASE
         WHEN s.modo = 'rutina' OR e.rutina_gimnasio_id IS NOT NULL OR (SELECT COUNT(*) FROM serie WHERE sesion_id = s.id) > 0 THEN 'gimnasio'
         ELSE e.tipo
       END AS tipo,
       e.fecha,
       e.fecha_hora_inicio,
       e.duracion_estimada_min,
       e.intensidad,
       s.id AS sesion_id,
       s.modo,
       s.duracion_real_seg,
       s.distancia_km,
       s.bloques_completados,
       s.pasadas_completadas,
       COALESCE(rg.nombre, CASE WHEN e.tipo = 'gimnasio' AND e.notas != 'Gimnasio' THEN e.notas ELSE NULL END) AS rutina_nombre,
       COALESCE((SELECT COUNT(*) FROM serie WHERE sesion_id = s.id), 0) AS series_count,
       COALESCE((SELECT COUNT(DISTINCT ejercicio_id) FROM serie WHERE sesion_id = s.id), 0) AS ejercicios_count,
       COALESCE((SELECT SUM(repeticiones * COALESCE(peso_kg, 0)) FROM serie WHERE sesion_id = s.id), 0) AS volumen_kg
     FROM evento e
     LEFT JOIN sesion_entrenamiento s ON s.evento_id = e.id
     LEFT JOIN rutina_gimnasio rg ON rg.id = COALESCE(e.rutina_gimnasio_id, s.rutina_gimnasio_id)
     WHERE e.usuario_id = ? AND e.completado = 1
     ORDER BY e.fecha_hora_inicio DESC
     LIMIT ?`,
    [usuarioId, limite],
  );
}

export interface SerieConSesion extends SerieRow {
  fecha: string;
  fecha_hora_inicio: string;
}

/**
 * Devuelve unicamente los ejercicios que el usuario ya realizo en alguna serie,
 * ordenados por la fecha de la sesion mas reciente en que se hicieron.
 */
export async function listarEjerciciosConHistorial(
  usuarioId: string,
): Promise<EjercicioRow[]> {
  const db = getDb();
  return db.getAllAsync<EjercicioRow>(
    `SELECT e.id, e.nombre, e.grupo, e.created_at, e.updated_at
     FROM ejercicio e
     JOIN serie s ON s.ejercicio_id = e.id
     JOIN sesion_entrenamiento se ON se.id = s.sesion_id
     JOIN evento ev ON ev.id = se.evento_id
     WHERE ev.usuario_id = ?
     GROUP BY e.id
     ORDER BY MAX(ev.fecha_hora_inicio) DESC, e.nombre ASC`,
    [usuarioId],
  );
}

/**
 * Devuelve todas las series registradas para un ejercicio especifico,
 * con la fecha y hora de la sesion correspondiente, ordenadas cronologicamente.
 */
export async function listarSeriesPorEjercicio(
  usuarioId: string,
  ejercicioId: string,
  desde?: string,
  hasta?: string,
): Promise<SerieConSesion[]> {
  const db = getDb();
  let sql = `
    SELECT s.*, ev.fecha, ev.fecha_hora_inicio
    FROM serie s
    JOIN sesion_entrenamiento se ON se.id = s.sesion_id
    JOIN evento ev ON ev.id = se.evento_id
    WHERE ev.usuario_id = ? AND s.ejercicio_id = ?
  `;
  const params: (string | number)[] = [usuarioId, ejercicioId];

  if (desde) {
    sql += ' AND ev.fecha >= ?';
    params.push(desde);
  }
  if (hasta) {
    sql += ' AND ev.fecha <= ?';
    params.push(hasta);
  }

  sql += ' ORDER BY ev.fecha_hora_inicio ASC, s.orden ASC';

  return db.getAllAsync<SerieConSesion>(sql, params);
}

