// src/features/comidas/tipos.ts
//
// Los tipos de comida en el orden del dia y el que corresponde a la hora.

import type { TipoComida } from '@/db/schema';

export const TIPOS_COMIDA: TipoComida[] = ['desayuno', 'almuerzo', 'merienda', 'cena', 'snack'];

/** El tipo mas probable segun la hora. El usuario lo puede cambiar. */
export function tipoPorHora(fecha: Date = new Date()): TipoComida {
  const h = fecha.getHours();
  if (h < 11) return 'desayuno';
  if (h < 15) return 'almuerzo';
  if (h < 19) return 'merienda';
  return 'cena';
}

export function nombreTipo(tipo: TipoComida): string {
  return tipo.charAt(0).toUpperCase() + tipo.slice(1);
}
