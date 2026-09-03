// src/db/queries/peso.ts
//
// Serie temporal de peso. No hay "peso actual" como campo: es el registro mas
// reciente. El calculo de tendencia o media movil no vive aca.

import { getDb } from '../schema';
import type { FuentePeso, RegistroPesoRow } from '../schema';

const ahora = (): string => new Date().toISOString();

export interface NuevoRegistroPeso {
  id: string;
  usuario_id: string;
  peso_kg: number;
  /** YYYY-MM-DD, dia local. */
  fecha: string;
  fuente: FuentePeso;
}

export async function crearRegistroPeso(datos: NuevoRegistroPeso): Promise<RegistroPesoRow> {
  const t = ahora();
  await getDb().runAsync(
    `INSERT INTO registro_peso (id, usuario_id, peso_kg, fecha, fuente, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [datos.id, datos.usuario_id, datos.peso_kg, datos.fecha, datos.fuente, t, t],
  );

  const fila = await obtenerRegistroPeso(datos.id);
  if (!fila) throw new Error(`No se pudo leer el registro de peso recien creado: ${datos.id}`);
  return fila;
}

export async function obtenerRegistroPeso(id: string): Promise<RegistroPesoRow | null> {
  return getDb().getFirstAsync<RegistroPesoRow>('SELECT * FROM registro_peso WHERE id = ?', [id]);
}

/** Mas reciente primero. `desde` y `hasta` son YYYY-MM-DD inclusive. */
export async function listarPesos(
  usuarioId: string,
  desde?: string,
  hasta?: string,
): Promise<RegistroPesoRow[]> {
  const condiciones = ['usuario_id = ?'];
  const params: (string | number)[] = [usuarioId];

  if (desde) {
    condiciones.push('fecha >= ?');
    params.push(desde);
  }
  if (hasta) {
    condiciones.push('fecha <= ?');
    params.push(hasta);
  }

  return getDb().getAllAsync<RegistroPesoRow>(
    `SELECT * FROM registro_peso
     WHERE ${condiciones.join(' AND ')}
     ORDER BY fecha DESC, created_at DESC`,
    params,
  );
}

export async function ultimoPeso(usuarioId: string): Promise<RegistroPesoRow | null> {
  return getDb().getFirstAsync<RegistroPesoRow>(
    `SELECT * FROM registro_peso
     WHERE usuario_id = ?
     ORDER BY fecha DESC, created_at DESC
     LIMIT 1`,
    [usuarioId],
  );
}

export async function actualizarRegistroPeso(
  id: string,
  cambios: { peso_kg?: number; fecha?: string; fuente?: FuentePeso },
): Promise<void> {
  const campos: string[] = [];
  const valores: (string | number)[] = [];

  if (cambios.peso_kg !== undefined) {
    campos.push('peso_kg = ?');
    valores.push(cambios.peso_kg);
  }
  if (cambios.fecha !== undefined) {
    campos.push('fecha = ?');
    valores.push(cambios.fecha);
  }
  if (cambios.fuente !== undefined) {
    campos.push('fuente = ?');
    valores.push(cambios.fuente);
  }
  if (campos.length === 0) return;

  await getDb().runAsync(
    `UPDATE registro_peso SET ${campos.join(', ')}, updated_at = ? WHERE id = ?`,
    [...valores, ahora(), id],
  );
}

export async function eliminarRegistroPeso(id: string): Promise<void> {
  await getDb().runAsync('DELETE FROM registro_peso WHERE id = ?', [id]);
}
