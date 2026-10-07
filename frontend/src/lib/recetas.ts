// src/lib/recetas.ts
//
// Recetas: el escalado de ingredientes por porciones, el agrupado de items de
// una comida por receta y los textos. Puro, para probarlo en Node.
//
// Una receta guarda los ingredientes de la receta entera y en cuantas
// porciones rinde. Al registrarla, cada ingrediente se escala por
// porciones comidas / porciones que rinde: rinde 4 y se comen 1,5 da 0,375
// de cada uno. Se escalan los gramos en el estado base (de donde salen los
// totales) y los que se pesaron de verdad (lo que se muestra).

/** Lo que importa de un ingrediente para escalarlo. */
export interface CantidadIngrediente {
  cantidad_g: number;
  cantidad_ingresada_g: number | null;
}

/** Porciones comidas / porciones que rinde. */
export function factorPorciones(porcionesComidas: number, porcionesQueRinde: number): number {
  if (porcionesQueRinde <= 0) throw new Error('Una receta rinde al menos una porcion.');
  if (porcionesComidas <= 0) throw new Error('Hay que comer mas de cero porciones.');
  return porcionesComidas / porcionesQueRinde;
}

/** Redondeo a 0,1 g: suficiente para cualquier balanza y sin ruido de coma flotante. */
function redondearGramos(g: number): number {
  return Math.round(g * 10) / 10;
}

export function escalarIngrediente<T extends CantidadIngrediente>(item: T, factor: number): T {
  return {
    ...item,
    cantidad_g: redondearGramos(item.cantidad_g * factor),
    cantidad_ingresada_g:
      item.cantidad_ingresada_g === null ? null : redondearGramos(item.cantidad_ingresada_g * factor),
  };
}

/** "1 porción", "1,5 porciones", "0,5 porciones". */
export function textoPorciones(n: number): string {
  const numero = String(Math.round(n * 100) / 100).replace('.', ',');
  return `${numero} ${n === 1 ? 'porción' : 'porciones'}`;
}

// ---------------------------------------------------------------------------
// Agrupado en el detalle de una comida
// ---------------------------------------------------------------------------

/** Lo que importa de un item de comida para agruparlo. */
export interface ItemConReceta {
  receta_grupo: string | null;
  receta_nombre: string | null;
  receta_porciones: number | null;
}

export type BloqueDetalle<T> =
  | { tipo: 'suelto'; item: T }
  | { tipo: 'receta'; grupo: string; nombre: string; porciones: number; items: T[] };

/**
 * Agrupa los items que salieron de una misma vez que se agrego una receta.
 * El grupo queda donde aparece su primer item, y el resto en su orden.
 *
 * Agrupa por receta_grupo y lee el nombre guardado en el item, no el de la
 * receta: si la receta se borro o se renombro, el detalle sigue mostrando lo
 * que se comio en ese momento. Un item sin nombre (dato a medias) va suelto.
 */
export function agruparPorReceta<T extends ItemConReceta>(items: T[]): BloqueDetalle<T>[] {
  const bloques: BloqueDetalle<T>[] = [];
  const porGrupo = new Map<string, Extract<BloqueDetalle<T>, { tipo: 'receta' }>>();

  for (const item of items) {
    if (item.receta_grupo === null || item.receta_nombre === null) {
      bloques.push({ tipo: 'suelto', item });
      continue;
    }
    const existente = porGrupo.get(item.receta_grupo);
    if (existente) {
      existente.items.push(item);
      continue;
    }
    const nuevo = {
      tipo: 'receta' as const,
      grupo: item.receta_grupo,
      nombre: item.receta_nombre,
      porciones: item.receta_porciones ?? 1,
      items: [item],
    };
    porGrupo.set(item.receta_grupo, nuevo);
    bloques.push(nuevo);
  }
  return bloques;
}

// ---------------------------------------------------------------------------
// Totales por porcion
// ---------------------------------------------------------------------------

/** Un ingrediente con los valores por 100 g de su alimento. */
export interface IngredienteConValores {
  cantidad_g: number;
  kcal_por_100g: number;
  proteina_g: number;
  carbohidratos_g: number;
  grasa_g: number;
}

export interface Macros {
  kcal: number;
  proteina: number;
  carbohidratos: number;
  grasa: number;
}

/** kcal y macros de una porcion. Sin redondear: se redondea al mostrar. */
export function porPorcion(ingredientes: IngredienteConValores[], porciones: number): Macros {
  const total = ingredientes.reduce(
    (acc, i) => {
      const f = i.cantidad_g / 100;
      return {
        kcal: acc.kcal + i.kcal_por_100g * f,
        proteina: acc.proteina + i.proteina_g * f,
        carbohidratos: acc.carbohidratos + i.carbohidratos_g * f,
        grasa: acc.grasa + i.grasa_g * f,
      };
    },
    { kcal: 0, proteina: 0, carbohidratos: 0, grasa: 0 },
  );
  const p = Math.max(1, porciones);
  return {
    kcal: total.kcal / p,
    proteina: total.proteina / p,
    carbohidratos: total.carbohidratos / p,
    grasa: total.grasa / p,
  };
}
