// src/features/entrenamiento/rondas.ts
//
// A donde va el foco del teclado despues de confirmar una serie en la rutina.
// Puro y sin React, para probarlo en Node.
//
// Una unidad es un ejercicio suelto o una superserie/circuito. Dentro de una
// unidad se avanza en ronda: A1 -> B1 -> A2 -> B2... Despues de confirmar en
// el ejercicio k, se recorren los otros de la unidad en orden circular desde
// k+1, y el primero con algo pendiente recibe el foco en su PRIMERA serie
// pendiente. De esa regla salen solos los casos:
// - si un ejercicio tiene menos series, cuando termina se saltea;
// - si se cargo una serie fuera de orden (A3 antes que A2), al volver a A
//   el foco va a A2;
// - un suelto es una unidad de uno: va a su siguiente serie pendiente.
// Cuando la unidad no tiene mas pendientes, el foco pasa a la siguiente
// unidad con pendientes, y si no hay, da la vuelta desde el principio.

export interface EjercicioRonda {
  clave: string;
  /** Misma unidad = mismo grupo. Un suelto tiene una unidad propia. */
  unidad: string;
  series: { id: string; confirmada: boolean }[];
}

export interface Foco {
  clave: string;
  serieId: string;
}

/**
 * El foco despues de confirmar `serieId` de `clave`, o null si no queda nada
 * pendiente. La serie recien confirmada cuenta como confirmada aunque la lista
 * todavia no lo diga: la pantalla llama a esto en el mismo toque.
 */
export function siguienteFoco(lista: EjercicioRonda[], clave: string, serieId: string): Foco | null {
  const idx = lista.findIndex((e) => e.clave === clave);
  if (idx < 0) return null;

  const pendiente = (i: number): Foco | null => {
    const e = lista[i];
    const s = e.series.find((x) => !x.confirmada && !(e.clave === clave && x.id === serieId));
    return s ? { clave: e.clave, serieId: s.id } : null;
  };

  // 1. La ronda dentro de la unidad, desde el siguiente ejercicio
  const unidad = lista[idx].unidad;
  const miembros = lista.map((e, i) => (e.unidad === unidad ? i : -1)).filter((i) => i >= 0);
  const k = miembros.indexOf(idx);
  for (let paso = 1; paso <= miembros.length; paso++) {
    const foco = pendiente(miembros[(k + paso) % miembros.length]);
    if (foco) return foco;
  }

  // 2. La siguiente unidad con pendientes, y despues desde el principio
  for (let i = miembros[miembros.length - 1] + 1; i < lista.length; i++) {
    const foco = pendiente(i);
    if (foco) return foco;
  }
  for (let i = 0; i < miembros[0]; i++) {
    const foco = pendiente(i);
    if (foco) return foco;
  }
  return null;
}
