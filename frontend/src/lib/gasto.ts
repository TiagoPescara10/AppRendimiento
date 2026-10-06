// src/lib/gasto.ts
//
// Gasto estimado de una sesion de cronometro libre: correr, caminar o bici.
// No se estima el gasto de otros deportes.
//
// Es gasto NETO: se resta el reposo (3,5 ml/kg/min, o sea 1 MET), porque el
// reposo ya esta contado en el TDEE. Sumarlo seria contar dos veces la misma
// hora. Y es un dato de la sesion y nada mas: no se suma al objetivo del dia.
//
// Dos metodos:
//
// 1. Con km, a pie: ecuaciones metabolicas de ACSM, sin pendiente.
//      carrera   VO2 = 0,2 x v + 3,5    (v en m/min)
//      caminata  VO2 = 0,1 x v + 3,5
//      kcal/min  = (VO2 - 3,5) x peso / 1000 x 5 = (VO2 - 3,5) x peso / 200
//    ACSM separa las dos ecuaciones en 134 m/min (~8 km/h): por encima de eso
//    se esta corriendo aunque el usuario haya elegido caminar.
//
// 2. Sin km, o en bici: MET del Compendium of Physical Activities 2024
//    (pacompendium.com), tambien neto: kcal/min = (MET - 1) x 3,5 x peso / 200.
//      correr    8,0   12150  Running (Taylor Code 200)
//      caminar   3,5   17160  Walking for pleasure (Taylor Code 010)
//      bici      7,0   01014  Bicycling, general
//    Bici con km, por velocidad (los codigos vienen en mph, pasados a km/h):
//      < 16,1 km/h        4,0   01010  <10 mph, leisure
//      16,1 a < 19,3      6,8   01020  10-11.9 mph, leisure, slow, light effort
//      19,3 a < 22,5      8,0   01030  12-13.9 mph, leisure, moderate effort
//      22,5 a < 25,7     10,0   01040  14-15.9 mph, racing or leisure, fast
//      25,7 a < 32,2     12,0   01050  16-19 mph, racing, very fast
//      32,2 o mas        16,8   01060  >20 mph, racing, not drafting
//    01050 cubre 16-19 mph y 01060 arranca en 20: el hueco de 19 a 20 va con
//    01050, que es el de abajo.
//
// Velocidades imposibles: a pie, mas de 25 km/h; en bici, mas de 60 km/h. Eso
// no es una sesion rapida, es un km mal cargado: se ignoran los km y se usa el
// MET fijo de la actividad.
//
// Redondeo a 10 kcal. Una estimacion de gasto tiene un error de 10 a 20%: dar
// 417 kcal seria fingir una precision que no hay.
//
// Puro y sin imports: entra directo a scripts/probar-gasto.mjs.

export type Actividad = 'correr' | 'caminar' | 'bici';

export const ACTIVIDADES: readonly Actividad[] = ['correr', 'caminar', 'bici'];

/** MET del Compendium 2024 cuando no hay velocidad con que calcular. */
export const MET_SIN_KM: Record<Actividad, number> = {
  correr: 8.0, // 12150
  caminar: 3.5, // 17160
  bici: 7.0, // 01014
};

const KMH_POR_MPH = 1.609344;

/** Por encima de esto ACSM usa la ecuacion de carrera: 134 m/min. */
export const KMH_CAMINATA_A_CARRERA = 8;
/** A pie, por encima de esto los km se toman como mal cargados. */
export const KMH_MAX_A_PIE = 25;
/** En bici, idem. */
export const KMH_MAX_BICI = 60;

/** Rangos de bici del Compendium 2024. `hastaKmh` es exclusivo. */
export const RANGOS_BICI: readonly { hastaKmh: number; met: number; codigo: string }[] = [
  { hastaKmh: 10 * KMH_POR_MPH, met: 4.0, codigo: '01010' },
  { hastaKmh: 12 * KMH_POR_MPH, met: 6.8, codigo: '01020' },
  { hastaKmh: 14 * KMH_POR_MPH, met: 8.0, codigo: '01030' },
  { hastaKmh: 16 * KMH_POR_MPH, met: 10.0, codigo: '01040' },
  { hastaKmh: 20 * KMH_POR_MPH, met: 12.0, codigo: '01050' },
  { hastaKmh: Infinity, met: 16.8, codigo: '01060' },
];

export interface DatosGasto {
  actividad: Actividad;
  duracionSeg: number;
  /** null o 0 si no se cargo. */
  distanciaKm: number | null;
  /** El ultimo peso registrado. null si no hay ninguno. */
  pesoKg: number | null;
}

/** kcal por minuto, netas, a partir de un MET. */
function kcalMinDesdeMet(met: number, pesoKg: number): number {
  return ((met - 1) * 3.5 * pesoKg) / 200;
}

/** kcal por minuto, netas, con las ecuaciones de ACSM a pie. */
function kcalMinAPie(actividad: Actividad, kmh: number, pesoKg: number): number {
  const mPorMin = (kmh * 1000) / 60;
  const esCarrera = actividad === 'correr' || kmh > KMH_CAMINATA_A_CARRERA;
  const vo2Neto = (esCarrera ? 0.2 : 0.1) * mPorMin;
  return (vo2Neto * pesoKg) / 200;
}

/** El MET de bici para una velocidad, por los rangos del Compendium. */
export function metBici(kmh: number): number {
  return RANGOS_BICI.find((r) => kmh < r.hastaKmh)!.met;
}

/**
 * Gasto neto estimado, redondeado a 10 kcal. null si no hay peso o si la
 * sesion no duro nada: sin eso no hay cuenta posible, y un 0 seria mentir.
 */
export function estimarKcal({ actividad, duracionSeg, distanciaKm, pesoKg }: DatosGasto): number | null {
  if (pesoKg === null || !Number.isFinite(pesoKg) || pesoKg <= 0) return null;
  if (!Number.isFinite(duracionSeg) || duracionSeg <= 0) return null;

  const minutos = duracionSeg / 60;
  const kmh =
    distanciaKm !== null && Number.isFinite(distanciaKm) && distanciaKm > 0
      ? distanciaKm / (duracionSeg / 3600)
      : null;

  let kcalMin: number;
  if (actividad === 'bici') {
    kcalMin =
      kmh !== null && kmh <= KMH_MAX_BICI
        ? kcalMinDesdeMet(metBici(kmh), pesoKg)
        : kcalMinDesdeMet(MET_SIN_KM.bici, pesoKg);
  } else {
    kcalMin =
      kmh !== null && kmh <= KMH_MAX_A_PIE
        ? kcalMinAPie(actividad, kmh, pesoKg)
        : kcalMinDesdeMet(MET_SIN_KM[actividad], pesoKg);
  }

  return Math.round((kcalMin * minutos) / 10) * 10;
}
