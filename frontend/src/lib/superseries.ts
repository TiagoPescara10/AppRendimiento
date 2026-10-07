// src/lib/superseries.ts
//
// Superseries y circuitos en el editor de rutina. Un bloque (calentamiento o
// principal) es una lista de unidades: un ejercicio suelto, o un grupo de 2
// (superserie) o mas (circuito) que se hacen en ronda.
//
// Puro y generico sobre el tipo del ejercicio, para probarlo en Node. Todas
// las operaciones devuelven una lista nueva y mantienen la regla de que un
// grupo tiene al menos dos ejercicios: si queda con uno, pasa a suelto.

export type Unidad<T> = { tipo: 'suelto'; item: T } | { tipo: 'grupo'; items: T[] };

export function itemsDe<T>(u: Unidad<T>): T[] {
  return u.tipo === 'suelto' ? [u.item] : u.items;
}

/** De una lista de ejercicios a una unidad: suelto si es uno, grupo si son mas. */
function unidadDe<T>(items: T[]): Unidad<T> {
  return items.length === 1 ? { tipo: 'suelto', item: items[0] } : { tipo: 'grupo', items };
}

/** "Superserie" con 2 ejercicios, "Circuito" con 3 o mas. */
export function etiquetaGrupo(cantidad: number): string {
  return cantidad >= 3 ? 'Circuito' : 'Superserie';
}

/**
 * Arma las unidades de un bloque desde las filas ya ordenadas de la base.
 * Los consecutivos con el mismo grupo no nulo van juntos.
 */
export function unidadesDesdeFilas<T>(filas: T[], grupoDe: (fila: T) => number | null): Unidad<T>[] {
  const unidades: Unidad<T>[] = [];
  let actual: T[] = [];
  let grupoActual: number | null = null;

  const cerrar = () => {
    if (actual.length > 0) unidades.push(unidadDe(actual));
    actual = [];
  };

  for (const fila of filas) {
    const g = grupoDe(fila);
    if (g === null) {
      cerrar();
      unidades.push({ tipo: 'suelto', item: fila });
      grupoActual = null;
    } else if (g === grupoActual) {
      actual.push(fila);
    } else {
      cerrar();
      actual = [fila];
      grupoActual = g;
    }
  }
  cerrar();
  return unidades;
}

/** Une la unidad i con la i+1. Dos grupos se funden en un circuito. */
export function unirConSiguiente<T>(unidades: Unidad<T>[], i: number): Unidad<T>[] {
  if (i < 0 || i >= unidades.length - 1) return unidades;
  const unida: Unidad<T> = {
    tipo: 'grupo',
    items: [...itemsDe(unidades[i]), ...itemsDe(unidades[i + 1])],
  };
  return [...unidades.slice(0, i), unida, ...unidades.slice(i + 2)];
}

/** Deshace el grupo entero: todos sus ejercicios quedan sueltos, en el mismo orden. */
export function separar<T>(unidades: Unidad<T>[], i: number): Unidad<T>[] {
  const u = unidades[i];
  if (!u || u.tipo === 'suelto') return unidades;
  const sueltos: Unidad<T>[] = u.items.map((item) => ({ tipo: 'suelto', item }));
  return [...unidades.slice(0, i), ...sueltos, ...unidades.slice(i + 1)];
}

/** Mueve una unidad entera (un suelto o el grupo completo) un lugar. */
export function moverUnidad<T>(
  unidades: Unidad<T>[],
  i: number,
  direccion: 'arriba' | 'abajo',
): Unidad<T>[] {
  const j = direccion === 'arriba' ? i - 1 : i + 1;
  if (i < 0 || i >= unidades.length || j < 0 || j >= unidades.length) return unidades;
  const copia = [...unidades];
  [copia[i], copia[j]] = [copia[j], copia[i]];
  return copia;
}

/** Reordena un ejercicio dentro de su grupo. No lo saca del grupo. */
export function moverDentroDeGrupo<T>(
  unidades: Unidad<T>[],
  i: number,
  k: number,
  direccion: 'arriba' | 'abajo',
): Unidad<T>[] {
  const u = unidades[i];
  if (!u || u.tipo === 'suelto') return unidades;
  const j = direccion === 'arriba' ? k - 1 : k + 1;
  if (k < 0 || k >= u.items.length || j < 0 || j >= u.items.length) return unidades;
  const items = [...u.items];
  [items[k], items[j]] = [items[j], items[k]];
  return [...unidades.slice(0, i), { tipo: 'grupo', items }, ...unidades.slice(i + 1)];
}

/**
 * Quita el ejercicio k de la unidad i (k = 0 en un suelto). Si el grupo queda
 * con uno solo, ese pasa a suelto.
 */
export function quitarDeUnidad<T>(unidades: Unidad<T>[], i: number, k: number): Unidad<T>[] {
  const u = unidades[i];
  if (!u) return unidades;
  const restantes = itemsDe(u).filter((_, idx) => idx !== k);
  const reemplazo = restantes.length === 0 ? [] : [unidadDe(restantes)];
  return [...unidades.slice(0, i), ...reemplazo, ...unidades.slice(i + 1)];
}

/** Todos los ejercicios del bloque, en orden. */
export function aplanar<T>(unidades: Unidad<T>[]): T[] {
  return unidades.flatMap(itemsDe);
}

/** Lo que se manda a guardar: string para un suelto, array para un grupo. */
export function aDatos<T>(unidades: Unidad<T>[], idDe: (item: T) => string): (string | string[])[] {
  return unidades.map((u) => (u.tipo === 'suelto' ? idDe(u.item) : u.items.map(idDe)));
}
