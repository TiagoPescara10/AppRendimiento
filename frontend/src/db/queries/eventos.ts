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
  /**
   * Si el evento nace ya contestado. Por defecto false, que es lo correcto
   * para cualquier evento agendado a futuro.
   *
   * Lo pone en true el temporizador, que crea el evento retroactivo cuando la
   * sesion se corrio sin nada agendado: un entrenamiento que el usuario acaba
   * de hacer con el cronometro en la mano no necesita que despues le
   * pregunten si lo hizo.
   */
  respondido?: boolean;
  notas?: string | null;
  /** La rutina que lo genero. null o ausente para un evento suelto. */
  rutina_id?: string | null;
}

export async function crearEvento(datos: NuevoEvento): Promise<EventoRow> {
  const t = ahora();
  await getDb().runAsync(
    `INSERT INTO evento
       (id, usuario_id, tipo, fecha_hora_inicio, duracion_estimada_min,
        intensidad, completado, respondido, notas, rutina_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      datos.id,
      datos.usuario_id,
      datos.tipo,
      datos.fecha_hora_inicio,
      datos.duracion_estimada_min ?? null,
      datos.intensidad,
      datos.completado ? 1 : 0,
      datos.respondido ? 1 : 0,
      datos.notas ?? null,
      datos.rutina_id ?? null,
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
    rutina_id?: string | null;
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
  if (cambios.rutina_id !== undefined) {
    campos.push('rutina_id = ?');
    valores.push(cambios.rutina_id);
  }
  if (campos.length === 0) return;

  await getDb().runAsync(`UPDATE evento SET ${campos.join(', ')}, updated_at = ? WHERE id = ?`, [
    ...valores,
    ahora(),
    id,
  ]);
}

/**
 * Atajo del check en la lista del dia. Delega en responderEvento() a proposito:
 * marcar el check A MANO es contestar. Si esto escribiera solo `completado`,
 * dejaria el evento en respondido = 0 y volveria a aparecer en el cartel de
 * pendientes despues de que el usuario ya dijo lo suyo.
 */
export async function marcarCompletado(id: string, completado: boolean): Promise<void> {
  await responderEvento(id, completado);
}

export async function eliminarEvento(id: string): Promise<void> {
  await getDb().runAsync('DELETE FROM evento WHERE id = ?', [id]);
}

// ---------------------------------------------------------------------------
// Eventos sin responder
//
// `completado = 0` solia significar dos cosas: "no lo hice" y "todavia no
// conteste". `respondido` las separa, y esto es lo que busca a quien
// preguntarle: eventos cuyo fin previsto ya paso hace rato y siguen mudos.
// ---------------------------------------------------------------------------

/** Lo que se asume cuando el evento no tiene duracion cargada. */
const DURACION_POR_DEFECTO_MIN = 60;

/**
 * Eventos cuyo fin previsto (inicio + duracion_estimada_min) ya paso hace mas
 * de `horas` y que siguen sin responder. Del mas viejo al mas nuevo.
 *
 * Sobre las fechas, que es lo delicado de esta consulta:
 * `fecha_hora_inicio` se guarda como ISO 8601 CON offset local, no en UTC.
 * datetime() de SQLite lee ese offset y normaliza a UTC
 * ('2026-09-04T22:00:00-03:00' -> '2026-09-05 01:00:00'), asi que sumarle la
 * duracion ahi adentro da el fin real. El corte se manda ya en UTC: los dos
 * lados de la comparacion quedan en la misma escala y el offset no se pierde.
 *
 * El ORDER BY tambien pasa por datetime() y se despega del resto del archivo,
 * que ordena por el texto crudo. Ordenar strings a pelo solo funciona si todas
 * las filas tienen el mismo offset; aca la funcion ya se esta llamando igual.
 *
 * El instante se inyecta para las pruebas; se llama `ahoraRef` y no `ahora`
 * porque `ahora()` ya es el helper de timestamps de este modulo. Las pantallas
 * la llaman con uno o dos argumentos.
 */
export async function listarEventosSinResponder(
  usuarioId: string,
  horas: number = 2,
  ahoraRef: Date = new Date(),
): Promise<EventoRow[]> {
  // 'YYYY-MM-DD HH:MM:SS' en UTC, el formato que compara datetime().
  const corte = new Date(ahoraRef.getTime() - horas * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 19)
    .replace('T', ' ');

  return getDb().getAllAsync<EventoRow>(
    `SELECT * FROM evento
     WHERE usuario_id = ?
       AND respondido = 0
       AND datetime(fecha_hora_inicio, '+' || COALESCE(duracion_estimada_min, ?) || ' minutes') < ?
     ORDER BY datetime(fecha_hora_inicio) ASC`,
    [usuarioId, DURACION_POR_DEFECTO_MIN, corte],
  );
}

/**
 * Marca la respuesta del usuario. Deja respondido = 1 siempre: haya dicho que
 * si o que no, ya contesto y no hay que volver a preguntarle.
 *
 * Es tambien el camino de "Empezar" y del check a mano, que responden con
 * completado = true. Esa regla vive aca y no en las pantallas para que una
 * pantalla nueva no se olvide de escribir `respondido`.
 */
export async function responderEvento(id: string, completado: boolean): Promise<void> {
  await getDb().runAsync(
    'UPDATE evento SET completado = ?, respondido = 1, updated_at = ? WHERE id = ?',
    [completado ? 1 : 0, ahora(), id],
  );
}

// ---------------------------------------------------------------------------
// Eventos que vienen de una rutina
//
// Las dos consultas que necesita la materializacion. Viven aca y no en
// features/agenda/ para que todo el SQL contra `evento` quede en un archivo.
// ---------------------------------------------------------------------------

/**
 * Los pares (rutina_id, fecha) ya materializados en la ventana. Es la lectura
 * del anti-duplicado: una consulta en vez de una por ocurrencia candidata.
 *
 * La clave es (rutina_id, fecha) y no fecha_hora_inicio: si el usuario mueve
 * el horario de la rutina, ese dia ya tiene su evento y no corresponde otro.
 * Pega contra idx_evento_rutina.
 */
export async function fechasMaterializadas(
  rutinaIds: string[],
  desde: string,
  hasta: string,
): Promise<{ rutina_id: string; fecha: string }[]> {
  if (rutinaIds.length === 0) return [];
  const huecos = rutinaIds.map(() => '?').join(', ');
  return getDb().getAllAsync<{ rutina_id: string; fecha: string }>(
    `SELECT rutina_id, fecha FROM evento
     WHERE rutina_id IN (${huecos}) AND fecha BETWEEN ? AND ?`,
    [...rutinaIds, desde, hasta],
  );
}

/**
 * Borra las ocurrencias futuras de una rutina y devuelve cuantas borro.
 * `desde` es ISO 8601 con offset local, comparado como texto contra
 * fecha_hora_inicio: lo pasado queda intacto, que es todo el punto.
 */
export async function eliminarEventosFuturosDeRutina(
  rutinaId: string,
  desde: string,
): Promise<number> {
  const r = await getDb().runAsync(
    'DELETE FROM evento WHERE rutina_id = ? AND fecha_hora_inicio >= ?',
    [rutinaId, desde],
  );
  return r.changes;
}
