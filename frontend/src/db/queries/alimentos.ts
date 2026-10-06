// src/db/queries/alimentos.ts
//
// Catalogo local de alimentos. Salio de queries/comidas.ts cuando el catalogo
// dejo de ser un detalle de las comidas: hoy lo llenan el seed, el escaneo de
// codigo de barras y vision, y lo lee la busqueda.
//
// Contrato del modulo: la columna `porciones` es un JSON en la base y NUNCA
// sale de aca como string. Todo lo que devuelve este archivo es `Alimento`,
// con `porciones` ya como array. `AlimentoRow` (con el string crudo) es
// interno; si aparece en un import de fuera de db/, es un bug.

import { getDb } from '../schema';
import type { AlimentoRow, EstadoCoccion, FuenteAlimento, PorcionTipica } from '../schema';

const ahora = (): string => new Date().toISOString();

/** Una fila de alimento como la ve el resto de la app. */
export interface Alimento extends Omit<AlimentoRow, 'porciones'> {
  porciones: PorcionTipica[];
}

// ---------------------------------------------------------------------------
// Serializacion de porciones
// ---------------------------------------------------------------------------

/**
 * Tolerante a proposito: un JSON roto devuelve [] en vez de tirar.
 * Un alimento sin porciones se sigue pudiendo cargar en gramos, que es el
 * unico dato que las pantallas realmente necesitan; hacer explotar la busqueda
 * entera por una fila mal escrita seria mucho peor que perder sus atajos.
 */
function parsearPorciones(crudo: string): PorcionTipica[] {
  if (!crudo) return [];
  try {
    const valor: unknown = JSON.parse(crudo);
    if (!Array.isArray(valor)) return [];
    return valor.filter(
      (p): p is PorcionTipica =>
        typeof p === 'object' &&
        p !== null &&
        typeof (p as PorcionTipica).nombre === 'string' &&
        typeof (p as PorcionTipica).gramos === 'number',
    );
  } catch {
    return [];
  }
}

function mapear(fila: AlimentoRow): Alimento {
  return { ...fila, porciones: parsearPorciones(fila.porciones) };
}

// ---------------------------------------------------------------------------
// Escritura
// ---------------------------------------------------------------------------

export interface NuevoAlimento {
  id: string;
  nombre: string;
  marca?: string | null;
  codigo_barras?: string | null;
  kcal_por_100g: number;
  proteina_g?: number;
  carbohidratos_g?: number;
  grasa_g?: number;
  fibra_g?: number | null;
  fuente: FuenteAlimento;
  verificado?: boolean;
  porciones?: PorcionTipica[];
  categoria?: string;
  /**
   * Crudo/cocido. undefined = no tocar lo que ya tenga la fila (un segundo
   * guardado que no sabe nada de coccion, como corregir los macros, no tiene
   * que borrarla). null = no aplica.
   */
  coccion?: { estado_base: EstadoCoccion; factor_coccion: number } | null;
  /** true cuando ya se le pidieron las categorias a Open Food Facts. Nunca vuelve a false. */
  categorias_revisadas?: boolean;
}

/**
 * Inserta o actualiza por codigo de barras. El indice unico parcial sobre
 * codigo_barras hace que un segundo escaneo del mismo producto no duplique la
 * fila; los alimentos sin codigo siempre insertan.
 *
 * El `WHERE codigo_barras IS NOT NULL` del ON CONFLICT no es adorno: cuando el
 * indice es parcial, SQLite exige que el target repita su WHERE. Sin eso tira
 * "ON CONFLICT clause does not match any PRIMARY KEY or UNIQUE constraint".
 *
 * La coccion solo se pisa si el que llama la trae (ver NuevoAlimento), y
 * categorias_revisadas solo sube: MAX() para que un guardado posterior que no
 * sabe de categorias no vuelva a mandar el producto a revisar.
 */
export async function guardarAlimento(datos: NuevoAlimento): Promise<Alimento> {
  const t = ahora();
  await getDb().runAsync(
    `INSERT INTO alimento
       (id, nombre, marca, codigo_barras, kcal_por_100g, proteina_g, carbohidratos_g,
        grasa_g, fibra_g, fuente, verificado, porciones, categoria,
        factor_coccion, estado_base, categorias_revisadas, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(codigo_barras) WHERE codigo_barras IS NOT NULL DO UPDATE SET
       nombre          = excluded.nombre,
       marca           = excluded.marca,
       kcal_por_100g   = excluded.kcal_por_100g,
       proteina_g      = excluded.proteina_g,
       carbohidratos_g = excluded.carbohidratos_g,
       grasa_g         = excluded.grasa_g,
       fibra_g         = excluded.fibra_g,
       fuente          = excluded.fuente,
       verificado      = excluded.verificado,
       porciones       = excluded.porciones,
       categoria       = excluded.categoria,
       factor_coccion  = CASE WHEN ? THEN excluded.factor_coccion ELSE alimento.factor_coccion END,
       estado_base     = CASE WHEN ? THEN excluded.estado_base ELSE alimento.estado_base END,
       categorias_revisadas = MAX(alimento.categorias_revisadas, excluded.categorias_revisadas),
       updated_at      = excluded.updated_at`,
    [
      datos.id,
      datos.nombre,
      datos.marca ?? null,
      datos.codigo_barras ?? null,
      datos.kcal_por_100g,
      datos.proteina_g ?? 0,
      datos.carbohidratos_g ?? 0,
      datos.grasa_g ?? 0,
      datos.fibra_g ?? null,
      datos.fuente,
      datos.verificado ? 1 : 0,
      JSON.stringify(datos.porciones ?? []),
      datos.categoria ?? 'otros',
      datos.coccion?.factor_coccion ?? null,
      datos.coccion?.estado_base ?? null,
      datos.categorias_revisadas ? 1 : 0,
      t,
      t,
      datos.coccion !== undefined ? 1 : 0,
      datos.coccion !== undefined ? 1 : 0,
    ],
  );

  // Con codigo de barras el UPSERT pudo haber caido sobre una fila con otro id.
  const fila = datos.codigo_barras
    ? await obtenerAlimentoPorCodigoBarras(datos.codigo_barras)
    : await obtenerAlimento(datos.id);
  if (!fila) throw new Error(`No se pudo leer el alimento recien guardado: ${datos.id}`);
  return fila;
}

/**
 * Cierra la revision de categorias de un producto escaneado: lo marca como
 * revisado y, si se detecto que se cocina, le completa estado base, factor y
 * las porciones de paquete.
 *
 * Es para los productos guardados antes de que existiera la coccion. Nunca se
 * llama si la consulta a la red fallo: en ese caso queda en 0 y se reintenta
 * en el proximo escaneo.
 */
export async function completarCategoriasEscaneado(
  id: string,
  coccion: { estado_base: EstadoCoccion; factor_coccion: number; porciones: PorcionTipica[] } | null,
): Promise<void> {
  if (!coccion) {
    await getDb().runAsync(
      'UPDATE alimento SET categorias_revisadas = 1, updated_at = ? WHERE id = ?',
      [ahora(), id],
    );
    return;
  }
  await getDb().runAsync(
    `UPDATE alimento
       SET categorias_revisadas = 1, estado_base = ?, factor_coccion = ?, porciones = ?, updated_at = ?
     WHERE id = ?`,
    [coccion.estado_base, coccion.factor_coccion, JSON.stringify(coccion.porciones), ahora(), id],
  );
}

export async function eliminarAlimento(id: string): Promise<void> {
  await getDb().runAsync('DELETE FROM alimento WHERE id = ?', [id]);
}

// ---------------------------------------------------------------------------
// Lectura — todo sale mapeado, nunca con el JSON crudo
// ---------------------------------------------------------------------------

export async function obtenerAlimento(id: string): Promise<Alimento | null> {
  const fila = await getDb().getFirstAsync<AlimentoRow>('SELECT * FROM alimento WHERE id = ?', [
    id,
  ]);
  return fila ? mapear(fila) : null;
}

export async function obtenerAlimentoPorCodigoBarras(codigo: string): Promise<Alimento | null> {
  const fila = await getDb().getFirstAsync<AlimentoRow>(
    'SELECT * FROM alimento WHERE codigo_barras = ?',
    [codigo],
  );
  return fila ? mapear(fila) : null;
}

/** Busqueda por prefijo/substring. Verificados primero. */
export async function buscarAlimentosPorNombre(
  texto: string,
  limite: number = 30,
): Promise<Alimento[]> {
  const filas = await getDb().getAllAsync<AlimentoRow>(
    `SELECT * FROM alimento
     WHERE nombre LIKE ?
     ORDER BY verificado DESC, nombre ASC
     LIMIT ?`,
    [`%${texto}%`, limite],
  );
  return filas.map(mapear);
}

/**
 * El catalogo entero, para emparejar lo que vio la foto
 * (src/features/foto/emparejar.ts). Son unas 850 filas: traerlas una vez y
 * comparar en JS es lo que permite ignorar tildes y plurales, que el LIKE de
 * buscarAlimentosPorNombre no hace.
 */
export async function listarAlimentosParaEmparejar(): Promise<Alimento[]> {
  const filas = await getDb().getAllAsync<AlimentoRow>(
    'SELECT * FROM alimento ORDER BY verificado DESC, nombre ASC',
  );
  return filas.map(mapear);
}
