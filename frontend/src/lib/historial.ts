// src/lib/historial.ts
//
// Periodos del historial de comidas (Mis comidas). Puro, para probarlo en
// Node: todo entra y sale como 'YYYY-MM-DD' local.
//
// A diferencia de Progreso, que usa ventanas moviles ("ultimos 7 dias"), aca
// los periodos son de calendario: la semana va de lunes a domingo y el mes es
// el mes calendario. Con flechas para ir al anterior y al siguiente es lo que
// se entiende; una ventana movil no tiene un "anterior" natural.

import { desdeFechaLocal, diasEntre, sumarDias } from './fechas';

export type PeriodoHistorial = 'semana' | 'mes';

export interface Rango {
  desde: string;
  hasta: string;
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
  'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const DIAS_CORTOS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

function partes(fecha: string): { a: number; m: number; d: number } {
  const [a, m, d] = fecha.split('-').map(Number);
  return { a, m, d };
}

function armar(a: number, m: number, d: number): string {
  return `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** El periodo que contiene `fecha`. La semana arranca el lunes. */
export function rangoDe(periodo: PeriodoHistorial, fecha: string): Rango {
  if (periodo === 'semana') {
    // getDay: 0 domingo .. 6 sabado. Desde el lunes: domingo es el dia 6.
    const desdeLunes = (desdeFechaLocal(fecha).getDay() + 6) % 7;
    const desde = sumarDias(fecha, -desdeLunes);
    return { desde, hasta: sumarDias(desde, 6) };
  }
  const { a, m } = partes(fecha);
  // El dia 0 del mes siguiente es el ultimo de este
  const ultimo = new Date(a, m, 0).getDate();
  return { desde: armar(a, m, 1), hasta: armar(a, m, ultimo) };
}

/** El periodo anterior (-1) o siguiente (+1) al que contiene `fecha`. */
export function moverPeriodo(periodo: PeriodoHistorial, fecha: string, delta: -1 | 1): Rango {
  const actual = rangoDe(periodo, fecha);
  if (periodo === 'semana') return rangoDe('semana', sumarDias(actual.desde, 7 * delta));
  const { a, m } = partes(actual.desde);
  const d = new Date(a, m - 1 + delta, 1);
  return rangoDe('mes', armar(d.getFullYear(), d.getMonth() + 1, 1));
}

/** No se avanza mas alla del periodo actual. */
export function hayPeriodoSiguiente(rango: Rango, hoy: string): boolean {
  return rango.hasta < hoy;
}

/**
 * Los dias que cuentan para "Registraste N de M dias": el periodo entero, o
 * hasta hoy si es el actual. Un miercoles, la semana tiene 3 dias, no 7.
 */
export function diasDelPeriodo(rango: Rango, hoy: string): number {
  const hasta = rango.hasta < hoy ? rango.hasta : hoy;
  return Math.max(0, diasEntre(rango.desde, hasta) + 1);
}

/** "6 – 12 oct", "29 sep – 5 oct", "Octubre", "Octubre 2025". */
export function tituloPeriodo(periodo: PeriodoHistorial, rango: Rango, hoy: string): string {
  const desde = partes(rango.desde);
  const hasta = partes(rango.hasta);
  const anioHoy = partes(hoy).a;
  if (periodo === 'mes') {
    const mes = MESES[desde.m - 1];
    const titulo = mes[0].toUpperCase() + mes.slice(1);
    return desde.a === anioHoy ? titulo : `${titulo} ${desde.a}`;
  }
  const anio = hasta.a === anioHoy ? '' : ` ${hasta.a}`;
  if (desde.m === hasta.m) {
    return `${desde.d} – ${hasta.d} ${MESES_CORTOS[hasta.m - 1]}${anio}`;
  }
  return `${desde.d} ${MESES_CORTOS[desde.m - 1]} – ${hasta.d} ${MESES_CORTOS[hasta.m - 1]}${anio}`;
}

/** "Hoy", "Ayer" o "Mar 6 oct". */
export function etiquetaDia(fecha: string, hoy: string): string {
  if (fecha === hoy) return 'Hoy';
  if (fecha === sumarDias(hoy, -1)) return 'Ayer';
  const { m, d } = partes(fecha);
  return `${DIAS_CORTOS[desdeFechaLocal(fecha).getDay()]} ${d} ${MESES_CORTOS[m - 1]}`;
}

/** 2340 -> "2.340". Sin Intl: el formato tiene que ser el mismo en todos lados. */
export function miles(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/**
 * "Registraste 5 de 7 días · promedio 2.340 kcal". El promedio es solo de
 * los dias con algo registrado. Sin comparar contra el objetivo: son datos.
 */
export function textoResumen(kcalPorDia: number[], diasPeriodo: number): string {
  const registrados = kcalPorDia.length;
  const dias = `${diasPeriodo === 1 ? 'día' : 'días'}`;
  if (registrados === 0) return `Registraste 0 de ${diasPeriodo} ${dias}`;
  const promedio = kcalPorDia.reduce((a, b) => a + b, 0) / registrados;
  return `Registraste ${registrados} de ${diasPeriodo} ${dias} · promedio ${miles(promedio)} kcal`;
}
