// src/features/foto/emparejar.ts
//
// Lleva lo que vio el modelo en la foto ("milanesa", 200 g, cocido) a un
// alimento del catalogo local, que es el que tiene kcal y macros.
//
// Puro: recibe el catalogo por parametro. Lo prueba scripts/probar-foto.mjs.
// Imports relativos y sin '@/' por eso mismo.
//
// Por que no usa buscarAlimentosPorNombre: esa es un LIKE de SQLite, que no
// ignora tildes ni plurales ("pure de papa" no encuentra "Pure de papas").
// Aca se compara por palabras normalizadas:
//   - sin tildes, minusculas, sin signos;
//   - cada palabra en singular con reglas simples del castellano;
//   - sin las palabras de relleno ("de", "con", "al"...).
//
// El puntaje premia que las palabras del item esten en el alimento (cobertura)
// y, en menor medida, que el alimento no tenga muchas de mas (precision). Con
// eso solo, "milanesa" a secas preferiria "Milanesa suiza" a "Milanesa de
// carne frita" (menos palabras de mas), asi que una tabla corta de GENERICOS
// dice que es lo que la gente quiere decir con el nombre pelado.

import { convertirAEstadoBase } from '../../lib/coccion';
import type { EstadoCoccion } from '../../lib/coccion';
import type { ItemFoto } from './respuesta';

/** Lo minimo del alimento que hace falta para emparejar. */
export interface AlimentoParaEmparejar {
  id: string;
  nombre: string;
  verificado: 0 | 1;
  estado_base: EstadoCoccion | null;
  factor_coccion: number | null;
}

export interface CargaFoto {
  estado_carga: EstadoCoccion;
  cantidad_ingresada_g: number;
}

export interface ItemEmparejado<A extends AlimentoParaEmparejar> {
  item: ItemFoto;
  /** null = sin emparejar: el usuario elige a mano. */
  alimento: A | null;
  /** Hasta 2 alternativas, de mejor a peor. */
  alternativas: A[];
  /** En el estado_base del alimento, que es como se guarda. */
  cantidad_g: number;
  /** Solo si el modelo lo vio en el estado contrario al base del alimento. */
  carga: CargaFoto | null;
  /** Confianza baja o sin emparejar: la pantalla lo marca para revisar. */
  revisar: boolean;
}

/** Por debajo de esto el candidato no se ofrece como elegido. */
export const UMBRAL_EMPAREJAR = 0.5;
const ALTERNATIVAS = 2;

const RELLENO = new Set([
  'de', 'del', 'con', 'sin', 'al', 'a', 'la', 'el', 'los', 'las', 'y', 'e', 'en', 'un', 'una', 'tipo',
]);

/**
 * Nombre pelado -> alimento que se quiere decir. Las dos puntas normalizadas
 * (ver clave()). Solo para nombres genericos que el modelo usa mucho y que en
 * el catalogo tienen varias variantes.
 */
const GENERICOS: Record<string, string> = {
  milanesa: 'milanesa carne frita',
  'milanesa carne': 'milanesa carne frita',
  'milanesa pollo': 'milanesa pollo frita',
  pure: 'pure papa',
  arroz: 'arroz blanco cocido',
  fideo: 'fideo cocido',
  papa: 'papa hervida',
  'papa frita': 'papa frita',
};

// ---------------------------------------------------------------------------
// Normalizacion
// ---------------------------------------------------------------------------

/** "PURE de Papas!", con o sin tildes -> "pure de papas". */
export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Singular con reglas simples. No es un lematizador: alcanza para los
 * nombres de comida.
 *   nueces -> nuez, panes -> pan, limones -> limon, tomates -> tomate,
 *   papas -> papa
 */
export function singular(palabra: string): string {
  if (palabra.length <= 3 || !palabra.endsWith('s')) return palabra;
  if (palabra.endsWith('ces')) return palabra.slice(0, -3) + 'z';
  if (palabra.endsWith('es')) {
    const raiz = palabra.slice(0, -2);
    // "pan-es", "limon-es", "flan-es": la raiz termina en consonante que
    // pide -es. "tomat-es" no: ahi el plural es solo la s.
    if (raiz.length >= 3 && /[lnrdjy]$/.test(raiz)) return raiz;
  }
  return palabra.slice(0, -1);
}

/** Las palabras que importan, normalizadas y en singular. */
export function palabras(texto: string): string[] {
  return normalizar(texto)
    .split(' ')
    .filter((p) => p && !RELLENO.has(p))
    .map(singular);
}

/** Clave comparable de un nombre entero: palabras unidas por espacio. */
export function clave(texto: string): string {
  return palabras(texto).join(' ');
}

// ---------------------------------------------------------------------------
// Puntaje
// ---------------------------------------------------------------------------

/** 0 a 1. 1 solo si las dos claves son iguales. */
export function puntaje(item: string, alimento: string): number {
  const pi = palabras(item);
  const pa = palabras(alimento);
  if (pi.length === 0 || pa.length === 0) return 0;

  const ki = pi.join(' ');
  const ka = pa.join(' ');
  if (ki === ka) return 1;

  const setA = new Set(pa);
  const comunes = new Set(pi.filter((p) => setA.has(p))).size;
  if (comunes === 0) return 0;

  const cobertura = comunes / new Set(pi).size;
  const precision = comunes / setA.size;
  let s = 0.6 * cobertura + 0.4 * precision;

  // La primera palabra suele ser la cosa ("milanesa", "pure", "arroz").
  if (pi[0] === pa[0]) s += 0.1;

  // El generico del nombre entero, o si no, el de su primera palabra
  // ("milanesa rebozada" -> el de "milanesa").
  const generico = GENERICOS[ki] ?? GENERICOS[pi[0]];
  if (generico === ka) s += 0.3;

  // Nunca empata con una coincidencia exacta.
  return Math.min(s, 0.99);
}

// ---------------------------------------------------------------------------
// Emparejar
// ---------------------------------------------------------------------------

function cantidadYCarga(
  item: ItemFoto,
  alimento: AlimentoParaEmparejar | null,
): { cantidad_g: number; carga: CargaFoto | null } {
  if (!alimento || item.estado === null) return { cantidad_g: item.gramos, carga: null };

  const base = convertirAEstadoBase(item.gramos, item.estado, alimento.estado_base, alimento.factor_coccion);
  // Sin conversion (mismo estado, o el alimento no tiene factor): se guarda
  // tal cual y no hace falta recordar como se peso.
  if (base === item.gramos) return { cantidad_g: item.gramos, carga: null };
  return {
    cantidad_g: Math.round(base),
    carga: { estado_carga: item.estado, cantidad_ingresada_g: item.gramos },
  };
}

/**
 * Empareja un item contra el catalogo. Publica para que la pantalla la use
 * cuando el usuario elige otro alimento con "Cambiar": la conversion de
 * crudo/cocido tiene que seguir al alimento nuevo.
 */
export function aplicarAlimento<A extends AlimentoParaEmparejar>(
  item: ItemFoto,
  alimento: A | null,
  alternativas: A[] = [],
): ItemEmparejado<A> {
  const { cantidad_g, carga } = cantidadYCarga(item, alimento);
  return {
    item,
    alimento,
    alternativas,
    cantidad_g,
    carga,
    revisar: alimento === null || item.confianza === 'baja',
  };
}

export function emparejarItem<A extends AlimentoParaEmparejar>(
  item: ItemFoto,
  catalogo: readonly A[],
): ItemEmparejado<A> {
  const candidatos = catalogo
    .map((a) => ({ a, s: puntaje(item.nombre, a.nombre) }))
    .filter((c) => c.s > 0)
    .sort(
      (x, y) =>
        y.s - x.s ||
        // Empate: primero los verificados, despues el nombre mas corto (el
        // mas generico), y al final alfabetico para que sea estable.
        y.a.verificado - x.a.verificado ||
        x.a.nombre.length - y.a.nombre.length ||
        x.a.nombre.localeCompare(y.a.nombre),
    );

  const mejor = candidatos[0];
  if (!mejor || mejor.s < UMBRAL_EMPAREJAR) {
    // Sin coincidencia razonable. Las parecidas igual se ofrecen como
    // atajo para elegir a mano.
    return aplicarAlimento<A>(item, null, candidatos.slice(0, ALTERNATIVAS).map((c) => c.a));
  }
  return aplicarAlimento(
    item,
    mejor.a,
    candidatos.slice(1, 1 + ALTERNATIVAS).map((c) => c.a),
  );
}

export function emparejar<A extends AlimentoParaEmparejar>(
  items: readonly ItemFoto[],
  catalogo: readonly A[],
): ItemEmparejado<A>[] {
  return items.map((it) => emparejarItem(it, catalogo));
}
