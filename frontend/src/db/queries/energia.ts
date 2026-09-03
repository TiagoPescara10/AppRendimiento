// src/db/queries/energia.ts
//
// Una fila por (dia, momento). El indice unico habilita el UPSERT: volver a
// tocar "3/5" en la misma tarde corrige en vez de duplicar.

import { getDb } from '../schema';
import type { MomentoDia, RegistroEnergiaRow } from '../schema';

const ahora = (): string => new Date().toISOString();

export interface NuevoRegistroEnergia {
  id: string;
  usuario_id: string;
  /** YYYY-MM-DD local. */
  fecha: string;
  /** 1-5, subjetivo. */
  nivel: number;
  momento: MomentoDia;
}

/**
 * Inserta o pisa el registro de ese (dia, momento). El `id` del parametro solo
 * se usa cuando la fila es nueva.
 */
export async function guardarEnergia(
  datos: NuevoRegistroEnergia,
): Promise<RegistroEnergiaRow> {
  const t = ahora();
  await getDb().runAsync(
    `INSERT INTO registro_energia
       (id, usuario_id, fecha, nivel, momento, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(usuario_id, fecha, momento) DO UPDATE SET
       nivel      = excluded.nivel,
       updated_at = excluded.updated_at`,
    [datos.id, datos.usuario_id, datos.fecha, datos.nivel, datos.momento, t, t],
  );

  const fila = await obtenerEnergiaPorMomento(datos.usuario_id, datos.fecha, datos.momento);
  if (!fila) throw new Error(`No se pudo leer el registro de energia: ${datos.fecha}`);
  return fila;
}

export async function obtenerEnergia(id: string): Promise<RegistroEnergiaRow | null> {
  return getDb().getFirstAsync<RegistroEnergiaRow>(
    'SELECT * FROM registro_energia WHERE id = ?',
    [id],
  );
}

export async function obtenerEnergiaPorMomento(
  usuarioId: string,
  fecha: string,
  momento: MomentoDia,
): Promise<RegistroEnergiaRow | null> {
  return getDb().getFirstAsync<RegistroEnergiaRow>(
    'SELECT * FROM registro_energia WHERE usuario_id = ? AND fecha = ? AND momento = ?',
    [usuarioId, fecha, momento],
  );
}

export async function listarEnergiaPorFecha(
  usuarioId: string,
  fecha: string,
): Promise<RegistroEnergiaRow[]> {
  return getDb().getAllAsync<RegistroEnergiaRow>(
    'SELECT * FROM registro_energia WHERE usuario_id = ? AND fecha = ?',
    [usuarioId, fecha],
  );
}

/** Mas reciente primero. `desde` y `hasta` son YYYY-MM-DD inclusive. */
export async function listarEnergiaPorRango(
  usuarioId: string,
  desde: string,
  hasta: string,
): Promise<RegistroEnergiaRow[]> {
  return getDb().getAllAsync<RegistroEnergiaRow>(
    `SELECT * FROM registro_energia
     WHERE usuario_id = ? AND fecha BETWEEN ? AND ?
     ORDER BY fecha DESC`,
    [usuarioId, desde, hasta],
  );
}

export async function eliminarEnergia(id: string): Promise<void> {
  await getDb().runAsync('DELETE FROM registro_energia WHERE id = ?', [id]);
}
