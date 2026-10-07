// src/db/queries/recetas.ts
//
// Recetas: comidas armadas que se reusan. Ver la migracion 023.
//
// Una receta no se registra "como receta": al agregarla a una comida, sus
// ingredientes se cargan como items normales, escalados por las porciones
// comidas, con una referencia para agrupar en el detalle. Asi totales y
// progreso no saben nada de recetas. El escalado vive en src/lib/recetas.ts.

import { getDb } from '../schema';
import type { ComidaRow, EstadoCoccion, RecetaItemRow, RecetaRow, TipoComida } from '../schema';
import { randomUUID } from '../sync/uuid';
import { escalarIngrediente, factorPorciones } from '../../lib/recetas';
import { crearComidaConItems, listarItems } from './comidas';

const ahora = (): string => new Date().toISOString();

/** Una receta con lo que muestra la lista: valores por porcion e ingredientes. */
export interface RecetaConResumen extends RecetaRow {
  ingredientes: number;
  kcal_porcion: number;
  proteina_porcion: number;
  carbohidratos_porcion: number;
  grasa_porcion: number;
}

/**
 * Las recetas con sus valores por porcion, calculados en SQL. Primero las
 * usadas mas recientemente; las que nunca se usaron, al final y de la mas
 * nueva a la mas vieja.
 */
const SQL_RESUMEN = `
  SELECT r.*,
         COUNT(ri.id) AS ingredientes,
         COALESCE(SUM(ri.cantidad_g * a.kcal_por_100g / 100.0), 0) / r.porciones AS kcal_porcion,
         COALESCE(SUM(ri.cantidad_g * a.proteina_g / 100.0), 0) / r.porciones AS proteina_porcion,
         COALESCE(SUM(ri.cantidad_g * a.carbohidratos_g / 100.0), 0) / r.porciones AS carbohidratos_porcion,
         COALESCE(SUM(ri.cantidad_g * a.grasa_g / 100.0), 0) / r.porciones AS grasa_porcion
  FROM receta r
  LEFT JOIN receta_item ri ON ri.receta_id = r.id
  LEFT JOIN alimento a ON a.id = ri.alimento_id
`;
const ORDEN_RESUMEN = `
  GROUP BY r.id
  ORDER BY r.usada_en IS NULL, r.usada_en DESC, r.created_at DESC
`;

export async function listarRecetas(usuarioId: string): Promise<RecetaConResumen[]> {
  return getDb().getAllAsync<RecetaConResumen>(
    `${SQL_RESUMEN} WHERE r.usuario_id = ? ${ORDEN_RESUMEN}`,
    [usuarioId],
  );
}

/** Para el buscador de Registrar comida: las que coinciden por nombre. */
export async function buscarRecetas(usuarioId: string, termino: string): Promise<RecetaConResumen[]> {
  const limpio = termino.trim();
  if (!limpio) return [];
  return getDb().getAllAsync<RecetaConResumen>(
    `${SQL_RESUMEN} WHERE r.usuario_id = ? AND r.nombre LIKE ? ${ORDEN_RESUMEN}`,
    [usuarioId, `%${limpio}%`],
  );
}

/** Ingrediente con los datos de su alimento: lo que necesitan el editor y el registro. */
export interface IngredienteConAlimento extends RecetaItemRow {
  alimento_nombre: string;
  kcal_por_100g: number;
  proteina_g: number;
  carbohidratos_g: number;
  grasa_g: number;
}

export interface RecetaCompleta extends RecetaRow {
  items: IngredienteConAlimento[];
}

export async function obtenerReceta(id: string): Promise<RecetaCompleta | null> {
  const db = getDb();
  const receta = await db.getFirstAsync<RecetaRow>('SELECT * FROM receta WHERE id = ?', [id]);
  if (!receta) return null;
  const items = await db.getAllAsync<IngredienteConAlimento>(
    `SELECT ri.*,
            a.nombre AS alimento_nombre,
            a.kcal_por_100g, a.proteina_g, a.carbohidratos_g, a.grasa_g
     FROM receta_item ri
     JOIN alimento a ON a.id = ri.alimento_id
     WHERE ri.receta_id = ?
     ORDER BY ri.orden ASC`,
    [id],
  );
  return { ...receta, items };
}

/** Un ingrediente para guardar: igual que un item de comida, sin comida. */
export interface NuevoIngrediente {
  alimento_id: string;
  /** En el estado_base del alimento, para la receta entera. */
  cantidad_g: number;
  estado_carga: EstadoCoccion | null;
  cantidad_ingresada_g: number | null;
}

export interface DatosReceta {
  id: string;
  usuario_id: string;
  nombre: string;
  porciones: number;
  ingredientes: NuevoIngrediente[];
}

async function insertarIngredientes(recetaId: string, ingredientes: NuevoIngrediente[], t: string) {
  for (let i = 0; i < ingredientes.length; i++) {
    const ing = ingredientes[i];
    await getDb().runAsync(
      `INSERT INTO receta_item
         (id, receta_id, alimento_id, orden, cantidad_g, estado_carga, cantidad_ingresada_g, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        randomUUID(),
        recetaId,
        ing.alimento_id,
        i,
        ing.cantidad_g,
        ing.estado_carga,
        ing.cantidad_ingresada_g,
        t,
        t,
      ],
    );
  }
}

/** El INSERT de la receta y sus ingredientes, sin transaccion: la pone quien llama. */
async function insertarReceta(datos: DatosReceta, t: string): Promise<void> {
  await getDb().runAsync(
    `INSERT INTO receta (id, usuario_id, nombre, porciones, usada_en, created_at, updated_at)
     VALUES (?, ?, ?, ?, NULL, ?, ?)`,
    [datos.id, datos.usuario_id, datos.nombre.trim(), datos.porciones, t, t],
  );
  await insertarIngredientes(datos.id, datos.ingredientes, t);
}

export async function crearReceta(datos: DatosReceta): Promise<RecetaCompleta> {
  if (datos.ingredientes.length === 0) throw new Error('Una receta sin ingredientes no se guarda.');
  const t = ahora();
  await getDb().withTransactionAsync(() => insertarReceta(datos, t));
  const res = await obtenerReceta(datos.id);
  if (!res) throw new Error(`No se pudo leer la receta creada: ${datos.id}`);
  return res;
}

/** Reemplaza nombre, porciones e ingredientes. Las comidas ya registradas no cambian. */
export async function actualizarReceta(
  datos: Omit<DatosReceta, 'usuario_id'>,
): Promise<RecetaCompleta> {
  if (datos.ingredientes.length === 0) throw new Error('Una receta sin ingredientes no se guarda.');
  const t = ahora();
  const db = getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE receta SET nombre = ?, porciones = ?, updated_at = ? WHERE id = ?', [
      datos.nombre.trim(),
      datos.porciones,
      t,
      datos.id,
    ]);
    await db.runAsync('DELETE FROM receta_item WHERE receta_id = ?', [datos.id]);
    await insertarIngredientes(datos.id, datos.ingredientes, t);
  });
  const res = await obtenerReceta(datos.id);
  if (!res) throw new Error(`No se pudo leer la receta actualizada: ${datos.id}`);
  return res;
}

/**
 * Borra la receta y sus ingredientes. Las comidas registradas con ella
 * quedan intactas: sus items siguen, con receta_id en null por el ON DELETE
 * SET NULL, y con el nombre que tenian guardado.
 */
export async function borrarReceta(id: string): Promise<void> {
  await getDb().runAsync('DELETE FROM receta WHERE id = ?', [id]);
}

/**
 * Registra `porciones` de la receta en una comida nueva: los ingredientes
 * como items escalados, todos con el mismo grupo. Marca la receta como usada.
 */
export async function registrarReceta(datos: {
  recetaId: string;
  usuarioId: string;
  tipo: TipoComida;
  /** ISO con offset local, como cualquier comida. */
  fechaHora: string;
  porciones: number;
  comidaId?: string;
}): Promise<ComidaRow> {
  const receta = await obtenerReceta(datos.recetaId);
  if (!receta) throw new Error(`No existe la receta: ${datos.recetaId}`);

  const comida = await crearComidaConItems(
    {
      id: datos.comidaId ?? randomUUID(),
      usuario_id: datos.usuarioId,
      fecha_hora: datos.fechaHora,
      tipo: datos.tipo,
    },
    itemsDeReceta(receta, datos.porciones),
  );
  await marcarUsada(receta.id);
  return comida;
}

/**
 * Los items de comida que salen de comer `porciones` de una receta. Lo usan
 * registrarReceta y Registrar comida, que arma la comida con otros alimentos.
 */
export function itemsDeReceta(receta: RecetaCompleta, porciones: number) {
  const factor = factorPorciones(porciones, receta.porciones);
  const grupo = randomUUID();
  return receta.items.map((ing) => {
    const escalado = escalarIngrediente(ing, factor);
    return {
      id: randomUUID(),
      alimento_id: ing.alimento_id,
      cantidad_g: escalado.cantidad_g,
      editado_por_usuario: false,
      carga:
        ing.estado_carga !== null && escalado.cantidad_ingresada_g !== null
          ? { estado_carga: ing.estado_carga, cantidad_ingresada_g: escalado.cantidad_ingresada_g }
          : null,
      receta: { receta_id: receta.id, grupo, nombre: receta.nombre, porciones },
    };
  });
}

/** La receta quedo usada ahora: sube en la lista de Guardadas. */
export async function marcarUsada(recetaId: string): Promise<void> {
  const t = ahora();
  await getDb().runAsync('UPDATE receta SET usada_en = ?, updated_at = ? WHERE id = ?', [t, t, recetaId]);
}

/**
 * "Guardar como receta" desde el detalle de una comida: rinde 1 porcion y
 * copia los items con sus cantidades y su estado de carga. La comida queda
 * apuntando a la receta (receta_guardada_id), en la misma transaccion.
 */
export async function guardarComidaComoReceta(datos: {
  comidaId: string;
  usuarioId: string;
  nombre: string;
  recetaId?: string;
}): Promise<RecetaCompleta> {
  const items = await listarItems(datos.comidaId);
  if (items.length === 0) throw new Error('Una receta sin ingredientes no se guarda.');
  const receta: DatosReceta = {
    id: datos.recetaId ?? randomUUID(),
    usuario_id: datos.usuarioId,
    nombre: datos.nombre,
    porciones: 1,
    ingredientes: items.map((it) => ({
      alimento_id: it.alimento_id,
      cantidad_g: it.cantidad_g,
      estado_carga: it.estado_carga,
      cantidad_ingresada_g: it.cantidad_ingresada_g,
    })),
  };
  const t = ahora();
  const db = getDb();
  await db.withTransactionAsync(async () => {
    await insertarReceta(receta, t);
    await db.runAsync('UPDATE comida SET receta_guardada_id = ?, updated_at = ? WHERE id = ?', [
      receta.id,
      t,
      datos.comidaId,
    ]);
  });
  const res = await obtenerReceta(receta.id);
  if (!res) throw new Error(`No se pudo leer la receta creada: ${receta.id}`);
  return res;
}
