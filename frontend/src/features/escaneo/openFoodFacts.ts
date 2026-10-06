// src/features/escaneo/openFoodFacts.ts
//
// Open Food Facts: el pedido y la lectura de lo que devuelve. Salio de
// app/comida/escanear.tsx; la regla de negocio es la misma.
//
// Open Food Facts es una base colaborativa: muchos productos estan a medias.
//   1. energy-kcal_100g es obligatorio: sin calorias no sirve para registrar.
//   2. Si faltan dos o mas de los tres macros, no es confiable: no encontrado.
//   3. Si falta uno, se muestra como "sin dato" (nunca 0 g inventado) y se
//      avisa antes de guardar.
//   4. Nombre y marca se conservan siempre: la carga a mano arranca con eso.
//
// quantity (envase) y serving_size (porcion sugerida) son texto libre: "2.5 L",
// "1 pote (190 g)", "6 x 330 ml" o nada. Las porciones salen de ahi con un
// parseo defensivo (features/comidas/porciones.ts).
//
// Los productos que se cocinan (fideos, arroz, legumbres) vienen en SECO: con
// categories_tags se detecta y el alimento queda con estado_base 'crudo' y su
// factor (src/lib/coccion.ts).
//
// normalizarProductoOff es pura y la prueba scripts/probar-escaneo.mjs.
// Imports relativos y sin '@/' por eso mismo.

import { detectarCoccion } from '../../lib/coccion';
import type { EstadoCoccion } from '../../lib/coccion';
import {
  esProbableBebida,
  generarPorcionesAutomaticas,
  generarPorcionesPaquete,
} from '../comidas/porciones';
import type { FuenteAlimento, PorcionTipica } from '../../db/schema';

/** Un producto escaneado, listo para mostrar. Valores por 100 g. */
export interface ProductoEscaneado {
  codigo: string;
  nombre: string;
  marca: string | null;
  kcal100g: number;
  proteina100g: number | null;
  carbos100g: number | null;
  grasa100g: number | null;
  fibra100g: number | null;
  /** El unico macro que falta, si falta uno. */
  macroFaltante: string | null;
  porciones: PorcionTipica[];
  fuente?: FuenteAlimento;
  verificado?: boolean;
  /** Solo si el producto se cocina: sus valores son de SECO. */
  coccion: { estado_base: EstadoCoccion; factor_coccion: number } | null;
  /** Categoria con la que se guarda ('bebidas', 'otros'...). */
  categoria: string;
}

export interface RescateProducto {
  nombre: string;
  marca: string | null;
}

export type LecturaOff =
  | { tipo: 'encontrado'; producto: ProductoEscaneado }
  | { tipo: 'no_encontrado'; rescate: RescateProducto };

const URL_PRODUCTO = 'https://world.openfoodfacts.org/api/v2/product/';

/** Solo lo que se usa. serving_size define la porcion predeterminada. */
export const CAMPOS_OFF = [
  'product_name',
  'product_name_es',
  'brands',
  'nutriments',
  'categories_tags',
  'quantity',
  'serving_size',
].join(',');

export const TIMEOUT_OFF_MS = 8000;

/** Open Food Facts pide identificarse con nombre, version y contacto. */
export function userAgentOff(version: string): string {
  return `Avanza/${version || '0.0.0'} (contacto: contacto.pbdevhouse@gmail.com)`;
}

const numero = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;

const unDecimal = (v: number) => Math.round(v * 10) / 10;

/** Lee la respuesta de /api/v2/product/{codigo}.json. Pura. */
export function normalizarProductoOff(data: unknown, codigo: string): LecturaOff {
  const d = data as { status?: unknown; product?: Record<string, unknown> } | null;
  if (!d || d.status !== 1 || !d.product) {
    return { tipo: 'no_encontrado', rescate: { nombre: '', marca: null } };
  }

  const prod = d.product;
  const texto = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  const nombre = texto(prod.product_name) || texto(prod.product_name_es);
  const marca = texto(prod.brands) || null;
  const rescate = { nombre, marca };

  const nutriments = (prod.nutriments ?? {}) as Record<string, unknown>;
  const kcal = numero(nutriments['energy-kcal_100g']);
  if (kcal === null || kcal < 0) return { tipo: 'no_encontrado', rescate };

  const prot = numero(nutriments.proteins_100g);
  const carb = numero(nutriments.carbohydrates_100g);
  const grasa = numero(nutriments.fat_100g);

  const faltantes: string[] = [];
  if (prot === null) faltantes.push('Proteina');
  if (carb === null) faltantes.push('Carbohidratos');
  if (grasa === null) faltantes.push('Grasa');
  if (faltantes.length >= 2) return { tipo: 'no_encontrado', rescate };

  const quantity = typeof prod.quantity === 'string' ? prod.quantity : null;
  const servingSize = typeof prod.serving_size === 'string' ? prod.serving_size : null;
  const categorias = Array.isArray(prod.categories_tags)
    ? prod.categories_tags.filter((t): t is string => typeof t === 'string')
    : null;

  // Si se cocina, porciones de paquete en seco. Si no, las automaticas segun
  // quantity y serving_size. Un producto que se cocina nunca es bebida.
  const det = detectarCoccion(categorias);
  const porciones = det
    ? generarPorcionesPaquete(det.porcionSecaG, quantity)
    : generarPorcionesAutomaticas(nombre, servingSize, quantity);
  const esBebida = !det && esProbableBebida(nombre, quantity, servingSize);

  return {
    tipo: 'encontrado',
    producto: {
      codigo,
      nombre: nombre || 'Producto sin nombre',
      marca,
      kcal100g: Math.round(kcal),
      proteina100g: prot === null ? null : unDecimal(prot),
      carbos100g: carb === null ? null : unDecimal(carb),
      grasa100g: grasa === null ? null : unDecimal(grasa),
      fibra100g: numero(nutriments.fiber_100g),
      macroFaltante: faltantes.length === 1 ? faltantes[0] : null,
      porciones,
      fuente: 'open_food_facts',
      verificado: false,
      coccion: det ? { estado_base: 'crudo', factor_coccion: det.factor } : null,
      categoria: esBebida ? 'bebidas' : 'otros',
    },
  };
}

/** Gramos de la porcion predeterminada, o 100 si no hay. */
export function gramosPredeterminados(porciones: PorcionTipica[]): number {
  const p = porciones.find((x) => x.predeterminada) ?? porciones[0];
  return p ? p.gramos : 100;
}

// ---------------------------------------------------------------------------
// Red
// ---------------------------------------------------------------------------

/**
 * GET con timeout. Tira si la red falla o se agota el tiempo; devuelve null
 * si la respuesta no es 2xx (el producto no esta, o el servidor fallo).
 */
async function pedirJson(url: string, version: string): Promise<unknown | null> {
  const control = new AbortController();
  const corte = setTimeout(() => control.abort(), TIMEOUT_OFF_MS);
  try {
    const res = await fetch(url, {
      signal: control.signal,
      headers: { 'User-Agent': userAgentOff(version) },
    });
    if (!res.ok) return null;
    return await res.json();
  } finally {
    clearTimeout(corte);
  }
}

/** El producto entero. Tira sin red; ver pedirJson. */
export async function pedirProductoOff(codigo: string, version: string): Promise<LecturaOff> {
  const data = await pedirJson(
    `${URL_PRODUCTO}${encodeURIComponent(codigo)}.json?fields=${CAMPOS_OFF}`,
    version,
  );
  return normalizarProductoOff(data, codigo);
}

/**
 * Solo categorias y envase, para revisar los productos guardados antes de
 * que existiera la coccion. null si la red falla o no esta: no se marca nada
 * y se reintenta en el proximo escaneo.
 */
export async function pedirCategoriasOff(
  codigo: string,
  version: string,
): Promise<{ categorias: string[]; quantity: string | null } | null> {
  try {
    const data = (await pedirJson(
      `${URL_PRODUCTO}${encodeURIComponent(codigo)}.json?fields=categories_tags,quantity`,
      version,
    )) as { status?: unknown; product?: Record<string, unknown> } | null;
    if (!data || data.status !== 1 || !data.product) return null;
    const tags = Array.isArray(data.product.categories_tags) ? data.product.categories_tags : [];
    return {
      categorias: tags.filter((t): t is string => typeof t === 'string'),
      quantity: typeof data.product.quantity === 'string' ? data.product.quantity : null,
    };
  } catch {
    return null;
  }
}
