// src/db/queries/comidas.ts
//
// Comidas y sus items.
//
// El catalogo (`alimento`) vive en queries/alimentos.ts. Se separo cuando
// dejo de ser un detalle de las comidas: ahora tambien lo llenan el seed y el
// escaneo. Lo unico que queda aca del catalogo es el JOIN de
// listarItemsConAlimento, que trae los macros pegados al item.
//
// Ningun total de kcal ni de macros se calcula aca: esto devuelve filas.

import { getDb } from '../schema';
import type { ComidaRow, ItemComidaRow, TipoComida } from '../schema';

const ahora = (): string => new Date().toISOString();

// ---------------------------------------------------------------------------
// Comida
// ---------------------------------------------------------------------------

export interface NuevaComida {
  id: string;
  usuario_id: string;
  /** ISO 8601 CON offset local, ej "2026-08-31T13:00:00-03:00".
   *  La columna generada `fecha` sale de sus primeros 10 caracteres, asi que
   *  guardar esto en UTC manda las cenas al dia siguiente. */
  fecha_hora: string;
  tipo: TipoComida;
  foto_url?: string | null;
  notas?: string | null;
}

export async function crearComida(datos: NuevaComida): Promise<ComidaRow> {
  const t = ahora();
  await getDb().runAsync(
    `INSERT INTO comida (id, usuario_id, fecha_hora, tipo, foto_url, notas, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      datos.id,
      datos.usuario_id,
      datos.fecha_hora,
      datos.tipo,
      datos.foto_url ?? null,
      datos.notas ?? null,
      t,
      t,
    ],
  );

  const fila = await obtenerComida(datos.id);
  if (!fila) throw new Error(`No se pudo leer la comida recien creada: ${datos.id}`);
  return fila;
}

export async function obtenerComida(id: string): Promise<ComidaRow | null> {
  return getDb().getFirstAsync<ComidaRow>('SELECT * FROM comida WHERE id = ?', [id]);
}

/** `fecha` es YYYY-MM-DD local. Pega contra idx_comida_fecha. */
export async function listarComidasPorFecha(
  usuarioId: string,
  fecha: string,
): Promise<ComidaRow[]> {
  return getDb().getAllAsync<ComidaRow>(
    `SELECT * FROM comida
     WHERE usuario_id = ? AND fecha = ?
     ORDER BY fecha_hora ASC`,
    [usuarioId, fecha],
  );
}

export async function listarComidasPorRango(
  usuarioId: string,
  desde: string,
  hasta: string,
): Promise<ComidaRow[]> {
  return getDb().getAllAsync<ComidaRow>(
    `SELECT * FROM comida
     WHERE usuario_id = ? AND fecha BETWEEN ? AND ?
     ORDER BY fecha_hora ASC`,
    [usuarioId, desde, hasta],
  );
}

export async function actualizarComida(
  id: string,
  cambios: {
    fecha_hora?: string;
    tipo?: TipoComida;
    foto_url?: string | null;
    notas?: string | null;
  },
): Promise<void> {
  const campos: string[] = [];
  const valores: (string | number | null)[] = [];

  if (cambios.fecha_hora !== undefined) {
    campos.push('fecha_hora = ?');
    valores.push(cambios.fecha_hora);
  }
  if (cambios.tipo !== undefined) {
    campos.push('tipo = ?');
    valores.push(cambios.tipo);
  }
  if (cambios.foto_url !== undefined) {
    campos.push('foto_url = ?');
    valores.push(cambios.foto_url);
  }
  if (cambios.notas !== undefined) {
    campos.push('notas = ?');
    valores.push(cambios.notas);
  }
  if (campos.length === 0) return;

  await getDb().runAsync(`UPDATE comida SET ${campos.join(', ')}, updated_at = ? WHERE id = ?`, [
    ...valores,
    ahora(),
    id,
  ]);
}

/** Los items caen solos por ON DELETE CASCADE (requiere PRAGMA foreign_keys = ON). */
export async function eliminarComida(id: string): Promise<void> {
  await getDb().runAsync('DELETE FROM comida WHERE id = ?', [id]);
}

// ---------------------------------------------------------------------------
// ItemComida
// ---------------------------------------------------------------------------

export interface NuevoItemComida {
  id: string;
  comida_id: string;
  alimento_id: string;
  cantidad_g: number;
  editado_por_usuario?: boolean;
}

/** Fila de item con los datos del alimento pegados. Lo que necesita el detalle. */
export interface ItemComidaConAlimento extends ItemComidaRow {
  alimento_nombre: string;
  alimento_marca: string | null;
  kcal_por_100g: number;
  proteina_g: number;
  carbohidratos_g: number;
  grasa_g: number;
  fibra_g: number | null;
}

export async function agregarItem(datos: NuevoItemComida): Promise<ItemComidaRow> {
  const t = ahora();
  await getDb().runAsync(
    `INSERT INTO item_comida
       (id, comida_id, alimento_id, cantidad_g, editado_por_usuario, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      datos.id,
      datos.comida_id,
      datos.alimento_id,
      datos.cantidad_g,
      datos.editado_por_usuario ? 1 : 0,
      t,
      t,
    ],
  );

  const fila = await getDb().getFirstAsync<ItemComidaRow>(
    'SELECT * FROM item_comida WHERE id = ?',
    [datos.id],
  );
  if (!fila) throw new Error(`No se pudo leer el item recien creado: ${datos.id}`);
  return fila;
}

export async function listarItems(comidaId: string): Promise<ItemComidaRow[]> {
  return getDb().getAllAsync<ItemComidaRow>(
    'SELECT * FROM item_comida WHERE comida_id = ? ORDER BY created_at ASC',
    [comidaId],
  );
}

export async function listarItemsConAlimento(
  comidaId: string,
): Promise<ItemComidaConAlimento[]> {
  return getDb().getAllAsync<ItemComidaConAlimento>(
    `SELECT
       i.*,
       a.nombre          AS alimento_nombre,
       a.marca           AS alimento_marca,
       a.kcal_por_100g   AS kcal_por_100g,
       a.proteina_g      AS proteina_g,
       a.carbohidratos_g AS carbohidratos_g,
       a.grasa_g         AS grasa_g,
       a.fibra_g         AS fibra_g
     FROM item_comida i
     JOIN alimento a ON a.id = i.alimento_id
     WHERE i.comida_id = ?
     ORDER BY i.created_at ASC`,
    [comidaId],
  );
}

export async function actualizarItem(
  id: string,
  cambios: { cantidad_g?: number; editado_por_usuario?: boolean },
): Promise<void> {
  const campos: string[] = [];
  const valores: (string | number)[] = [];

  if (cambios.cantidad_g !== undefined) {
    campos.push('cantidad_g = ?');
    valores.push(cambios.cantidad_g);
  }
  if (cambios.editado_por_usuario !== undefined) {
    campos.push('editado_por_usuario = ?');
    valores.push(cambios.editado_por_usuario ? 1 : 0);
  }
  if (campos.length === 0) return;

  await getDb().runAsync(
    `UPDATE item_comida SET ${campos.join(', ')}, updated_at = ? WHERE id = ?`,
    [...valores, ahora(), id],
  );
}

export async function eliminarItem(id: string): Promise<void> {
  await getDb().runAsync('DELETE FROM item_comida WHERE id = ?', [id]);
}
