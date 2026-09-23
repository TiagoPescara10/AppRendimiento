// src/db/queries/agua.ts
//
// Registro de tomas de agua vaso por vaso.
// Permite registrar consumos individuales, calcular el total acumulado
// y eliminar la ultima toma en caso de error.

import { getDb } from '../schema';
import type { RegistroAguaRow } from '../schema';
import { randomUUID } from '../sync/uuid';
import { aFechaLocal } from '../../lib/fechas';

const ahora = (): string => new Date().toISOString();

export interface NuevoRegistroAgua {
  id?: string;
  usuario_id: string;
  /** YYYY-MM-DD local. Si no se pasa, toma la fecha actual. */
  fecha?: string;
  /** HH:MM local. Si no se pasa, toma la hora actual. */
  hora?: string;
  ml: number;
}

export async function registrarAgua(datos: NuevoRegistroAgua): Promise<RegistroAguaRow> {
  const t = ahora();
  const id = datos.id ?? randomUUID();
  const d = new Date();
  const fecha = datos.fecha ?? aFechaLocal(d);
  const pad = (n: number) => String(n).padStart(2, '0');
  const hora = datos.hora ?? `${pad(d.getHours())}:${pad(d.getMinutes())}`;

  await getDb().runAsync(
    `INSERT INTO registro_agua (id, usuario_id, fecha, hora, ml, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, datos.usuario_id, fecha, hora, datos.ml, t, t],
  );

  const fila = await obtenerRegistroAgua(id);
  if (!fila) throw new Error(`No se pudo leer el registro de agua recien creado: ${id}`);
  return fila;
}

export async function obtenerRegistroAgua(id: string): Promise<RegistroAguaRow | null> {
  return getDb().getFirstAsync<RegistroAguaRow>(
    'SELECT * FROM registro_agua WHERE id = ?',
    [id],
  );
}

/**
 * Tomas de agua del dia, ordenadas cronologicamente.
 */
export async function listarAguaDelDia(
  usuarioId: string,
  fecha: string,
): Promise<RegistroAguaRow[]> {
  return getDb().getAllAsync<RegistroAguaRow>(
    `SELECT * FROM registro_agua
     WHERE usuario_id = ? AND fecha = ?
     ORDER BY hora ASC, created_at ASC`,
    [usuarioId, fecha],
  );
}

/**
 * Elimina la ultima toma de agua registrada en el dia para ese usuario.
 */
export async function eliminarUltimoRegistro(
  usuarioId: string,
  fecha: string,
): Promise<void> {
  await getDb().runAsync(
    `DELETE FROM registro_agua
     WHERE id = (
       SELECT id FROM registro_agua
       WHERE usuario_id = ? AND fecha = ?
       ORDER BY hora DESC, created_at DESC
       LIMIT 1
     )`,
    [usuarioId, fecha],
  );
}

/**
 * Suma total de ml consumidos en la fecha especificada.
 * Incluye tanto las tomas registradas directamente como los items
 * de agua registrados en comidas del dia.
 */
export async function totalDelDia(
  usuarioId: string,
  fecha: string,
): Promise<number> {
  const fila = await getDb().getFirstAsync<{ total: number | null }>(
    `SELECT (
       COALESCE((
         SELECT SUM(ml)
         FROM registro_agua
         WHERE usuario_id = ? AND fecha = ?
       ), 0) +
       COALESCE((
         SELECT SUM(CAST(ic.cantidad_g AS INTEGER))
         FROM comida c
         JOIN item_comida ic ON ic.comida_id = c.id
         JOIN alimento a ON a.id = ic.alimento_id
         WHERE c.usuario_id = ?
           AND c.fecha = ?
           AND (
             LOWER(a.nombre) LIKE 'agua%'
             OR (a.categoria = 'bebidas' AND LOWER(a.nombre) LIKE '%agua%')
           )
       ), 0)
     ) as total`,
    [usuarioId, fecha, usuarioId, fecha],
  );
  return fila?.total ?? 0;
}
