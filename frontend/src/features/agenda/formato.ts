// src/features/agenda/formato.ts
//
// Como se le muestra un evento al usuario. Vive aca y no en cada pantalla
// porque el calendario, el detalle del dia y el detalle de un evento suelto
// tienen que decir lo mismo: si "gimnasio" se lee "Gimnasio" en un lado y
// "Gym" en otro, parecen dos cosas distintas.
//
// Solo formato. El criterio de agenda esta en materializar.ts y el SQL en
// db/queries/eventos.ts.

import type { TipoEvento, Intensidad } from '../../db/schema';

export const ETIQUETA_TIPO: Record<TipoEvento, string> = {
  entrenamiento: 'Entrenamiento',
  gimnasio: 'Gimnasio',
  partido: 'Partido',
  competencia: 'Competencia',
};

export const ETIQUETA_INTENSIDAD: Record<Intensidad, string> = {
  baja: 'Intensidad baja',
  media: 'Intensidad media',
  alta: 'Intensidad alta',
};

/**
 * "8:30" a partir del ISO con offset local.
 *
 * Es un slice y no un Date a proposito: `fecha_hora_inicio` ya se guarda en
 * hora local, asi que los caracteres 11 a 16 SON la hora que hay que mostrar.
 * Pasarlo por Date solo abre la puerta a una conversion a UTC.
 */
export function horaDe(fechaHora: string): string {
  return fechaHora.slice(11, 16);
}

/**
 * "Miércoles 4" y "Septiembre" a partir de "YYYY-MM-DD".
 *
 * El T00:00:00 sin offset hace que el Date se interprete en hora local. Con
 * new Date("2026-09-04") a secas, JS lo lee como UTC y en Argentina muestra
 * el dia anterior.
 */
export function partesFecha(clave: string): { dia: string; mes: string } {
  const d = new Date(`${clave}T00:00:00`);
  const dia = d.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric' });
  const mes = d.toLocaleDateString('es-AR', { month: 'long' });
  return {
    dia: dia.charAt(0).toUpperCase() + dia.slice(1),
    mes: mes.charAt(0).toUpperCase() + mes.slice(1),
  };
}
