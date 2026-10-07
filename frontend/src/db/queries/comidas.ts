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
import type { ComidaRow, EstadoCoccion, ItemComidaRow, TipoComida } from '../schema';
import { randomUUID } from '../sync/uuid';

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
  /** En el estado_base del alimento. Ver src/lib/coccion.ts. */
  cantidad_g: number;
  editado_por_usuario?: boolean;
  /** Solo si el usuario peso en un estado distinto del base del alimento. */
  carga?: CargaCoccion | null;
  /** Solo si el item salio de una receta. */
  receta?: RefReceta | null;
}

/**
 * De que receta salio un item. Los items de una misma vez que se agrego la
 * receta comparten `grupo`. El nombre se guarda tal como estaba: el detalle lo
 * muestra aunque la receta se borre o se renombre.
 */
export interface RefReceta {
  receta_id: string | null;
  grupo: string;
  nombre: string;
  porciones: number;
}

/** Lo que el usuario peso de verdad, cuando no fue en el estado base. Solo para mostrar. */
export interface CargaCoccion {
  estado_carga: EstadoCoccion;
  cantidad_ingresada_g: number;
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
  factor_coccion: number | null;
  estado_base: EstadoCoccion | null;
}

export async function agregarItem(datos: NuevoItemComida): Promise<ItemComidaRow> {
  const t = ahora();
  await getDb().runAsync(
    `INSERT INTO item_comida
       (id, comida_id, alimento_id, cantidad_g, editado_por_usuario,
        estado_carga, cantidad_ingresada_g,
        receta_id, receta_grupo, receta_nombre, receta_porciones, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      datos.id,
      datos.comida_id,
      datos.alimento_id,
      datos.cantidad_g,
      datos.editado_por_usuario ? 1 : 0,
      datos.carga?.estado_carga ?? null,
      datos.carga?.cantidad_ingresada_g ?? null,
      datos.receta?.receta_id ?? null,
      datos.receta?.grupo ?? null,
      datos.receta?.nombre ?? null,
      datos.receta?.porciones ?? null,
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
       a.fibra_g         AS fibra_g,
       a.factor_coccion  AS factor_coccion,
       a.estado_base     AS estado_base
     FROM item_comida i
     JOIN alimento a ON a.id = i.alimento_id
     WHERE i.comida_id = ?
     ORDER BY i.created_at ASC`,
    [comidaId],
  );
}

/** Un item con la fecha de su comida. Lo que necesita un promedio por periodo. */
export interface ItemComidaConFecha extends ItemComidaConAlimento {
  /** 'YYYY-MM-DD' local: la columna generada de `comida`. */
  fecha: string;
}

/**
 * Todos los items de un rango de dias, con su alimento y con la fecha de la
 * comida a la que pertenecen.
 *
 * Existe para la pantalla de Progreso y no reusa listarItemsConAlimento() a
 * proposito: esa es por comida, y un promedio de noventa dias saldria a
 * doscientas queries. Esta es una sola.
 *
 * `desde` y `hasta` son 'YYYY-MM-DD' inclusive, y se comparan contra la
 * columna generada `fecha`, que ya es el dia LOCAL. Comparar contra
 * `fecha_hora` obligaria a armar un ISO con offset y saldria mal en cuanto
 * haya dos offsets distintos en la serie.
 */
export async function listarItemsConAlimentoPorRango(
  usuarioId: string,
  desde: string,
  hasta: string,
): Promise<ItemComidaConFecha[]> {
  return getDb().getAllAsync<ItemComidaConFecha>(
    `SELECT
       i.*,
       c.fecha           AS fecha,
       a.nombre          AS alimento_nombre,
       a.marca           AS alimento_marca,
       a.kcal_por_100g   AS kcal_por_100g,
       a.proteina_g      AS proteina_g,
       a.carbohidratos_g AS carbohidratos_g,
       a.grasa_g         AS grasa_g,
       a.fibra_g         AS fibra_g,
       a.factor_coccion  AS factor_coccion,
       a.estado_base     AS estado_base
     FROM item_comida i
     JOIN comida c   ON c.id = i.comida_id
     JOIN alimento a ON a.id = i.alimento_id
     WHERE c.usuario_id = ? AND c.fecha BETWEEN ? AND ?
     ORDER BY c.fecha ASC, i.created_at ASC`,
    [usuarioId, desde, hasta],
  );
}

export async function actualizarItem(
  id: string,
  cambios: {
    cantidad_g?: number;
    editado_por_usuario?: boolean;
    /** null borra la carga: el item vuelve a estar pesado en el estado base. */
    carga?: CargaCoccion | null;
  },
): Promise<void> {
  const campos: string[] = [];
  const valores: (string | number | null)[] = [];

  if (cambios.cantidad_g !== undefined) {
    campos.push('cantidad_g = ?');
    valores.push(cambios.cantidad_g);
  }
  if (cambios.editado_por_usuario !== undefined) {
    campos.push('editado_por_usuario = ?');
    valores.push(cambios.editado_por_usuario ? 1 : 0);
  }
  if (cambios.carga !== undefined) {
    campos.push('estado_carga = ?', 'cantidad_ingresada_g = ?');
    valores.push(cambios.carga?.estado_carga ?? null, cambios.carga?.cantidad_ingresada_g ?? null);
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

// ---------------------------------------------------------------------------
// Comida con sus items, de una vez
// ---------------------------------------------------------------------------

/** Un item de crearComidaConItems: como NuevoItemComida, sin comida_id. */
export type ItemParaComida = Omit<NuevoItemComida, 'comida_id'>;

/**
 * Crea la comida y todos sus items en UNA transaccion: o queda todo, o no
 * queda nada. Antes nueva.tsx los insertaba uno por uno y un error a la
 * mitad dejaba una comida a medias.
 *
 * Usa agregarItem/crearComida adentro para que el SQL siga en un solo lugar;
 * withTransactionAsync envuelve todo lo que corre en el callback.
 */
export async function crearComidaConItems(
  comida: NuevaComida,
  items: ItemParaComida[],
): Promise<ComidaRow> {
  if (items.length === 0) throw new Error('Una comida sin items no se guarda.');

  let creada: ComidaRow | null = null;
  await getDb().withTransactionAsync(async () => {
    creada = await crearComida(comida);
    for (const item of items) {
      await agregarItem({ ...item, comida_id: comida.id });
    }
  });
  if (!creada) throw new Error(`No se pudo crear la comida: ${comida.id}`);
  return creada;
}

// ---------------------------------------------------------------------------
// Repetir una comida
// ---------------------------------------------------------------------------

/**
 * Copia una comida a `fechaHora` (ISO con offset local): mismo tipo y mismos
 * items, con su cantidad, estado de carga y receta. La foto no se copia: es
 * de aquella comida, no de esta.
 *
 * Cada grupo de receta recibe un grupo nuevo, para que la copia no quede
 * pegada a la original, y la receta (si sigue existiendo) queda como usada
 * ahora. Todo en una transaccion.
 */
export async function repetirComida(
  comidaId: string,
  fechaHora: string,
  nuevaId: string = randomUUID(),
): Promise<ComidaRow> {
  const db = getDb();
  const original = await obtenerComida(comidaId);
  if (!original) throw new Error(`No existe la comida: ${comidaId}`);
  const items = await listarItems(comidaId);
  if (items.length === 0) throw new Error('Una comida sin items no se repite.');

  const gruposNuevos = new Map<string, string>();
  const t = ahora();

  await db.withTransactionAsync(async () => {
    await crearComida({
      id: nuevaId,
      usuario_id: original.usuario_id,
      fecha_hora: fechaHora,
      tipo: original.tipo,
    });
    for (const it of items) {
      let receta: RefReceta | null = null;
      if (it.receta_grupo !== null && it.receta_nombre !== null) {
        let grupo = gruposNuevos.get(it.receta_grupo);
        if (!grupo) {
          grupo = randomUUID();
          gruposNuevos.set(it.receta_grupo, grupo);
        }
        receta = {
          receta_id: it.receta_id,
          grupo,
          nombre: it.receta_nombre,
          porciones: it.receta_porciones ?? 1,
        };
      }
      await agregarItem({
        id: randomUUID(),
        comida_id: nuevaId,
        alimento_id: it.alimento_id,
        cantidad_g: it.cantidad_g,
        editado_por_usuario: it.editado_por_usuario === 1,
        carga:
          it.estado_carga !== null && it.cantidad_ingresada_g !== null
            ? { estado_carga: it.estado_carga, cantidad_ingresada_g: it.cantidad_ingresada_g }
            : null,
        receta,
      });
    }
    const recetas = [...new Set(items.map((i) => i.receta_id).filter((r): r is string => r !== null))];
    for (const recetaId of recetas) {
      await db.runAsync('UPDATE receta SET usada_en = ?, updated_at = ? WHERE id = ?', [t, t, recetaId]);
    }
  });

  const creada = await obtenerComida(nuevaId);
  if (!creada) throw new Error(`No se pudo leer la comida repetida: ${nuevaId}`);
  return creada;
}

// ---------------------------------------------------------------------------
// Historial por rango
// ---------------------------------------------------------------------------

/** Un dia con algo registrado y su total. */
export interface DiaHistorial {
  /** 'YYYY-MM-DD' local. */
  fecha: string;
  kcal: number;
}

/**
 * Total de kcal por dia, solo de los dias con comidas, del mas reciente al
 * mas viejo. Calculado en SQL: un JOIN con los items y el catalogo, sin
 * recorrer comida por comida.
 *
 * Filtra por la columna generada `fecha`, que ya es el dia LOCAL: una cena a
 * las 22:30 -03:00 (01:30 UTC del dia siguiente) cae en su dia.
 */
export async function totalesPorDia(
  usuarioId: string,
  desde: string,
  hasta: string,
): Promise<DiaHistorial[]> {
  return getDb().getAllAsync<DiaHistorial>(
    `SELECT c.fecha AS fecha,
            COALESCE(SUM(i.cantidad_g * a.kcal_por_100g / 100.0), 0) AS kcal
     FROM comida c
     LEFT JOIN item_comida i ON i.comida_id = c.id
     LEFT JOIN alimento a ON a.id = i.alimento_id
     WHERE c.usuario_id = ? AND c.fecha BETWEEN ? AND ?
     GROUP BY c.fecha
     ORDER BY c.fecha DESC`,
    [usuarioId, desde, hasta],
  );
}

/** Una comida del historial, con su total ya sumado. */
export interface ComidaHistorial {
  id: string;
  fecha: string;
  fecha_hora: string;
  tipo: TipoComida;
  foto_url: string | null;
  kcal: number;
}

/** Las comidas de un rango con su total, de la mas reciente a la mas vieja. */
export async function comidasPorRango(
  usuarioId: string,
  desde: string,
  hasta: string,
): Promise<ComidaHistorial[]> {
  return getDb().getAllAsync<ComidaHistorial>(
    `SELECT c.id, c.fecha, c.fecha_hora, c.tipo, c.foto_url,
            COALESCE(SUM(i.cantidad_g * a.kcal_por_100g / 100.0), 0) AS kcal
     FROM comida c
     LEFT JOIN item_comida i ON i.comida_id = c.id
     LEFT JOIN alimento a ON a.id = i.alimento_id
     WHERE c.usuario_id = ? AND c.fecha BETWEEN ? AND ?
     GROUP BY c.id
     ORDER BY c.fecha_hora DESC`,
    [usuarioId, desde, hasta],
  );
}
