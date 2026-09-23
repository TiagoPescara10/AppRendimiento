// src/lib/fuerza.ts
//
// Funciones puras para el analisis de fuerza y progresion de cargas en rutinas
// de gimnasio. No tocan la base ni React, para poder probarse directo en Node.

import type { SerieRow } from '@/db/schema';
import { diasEntre } from './fechas';

export interface SerieConFecha extends SerieRow {
  fecha: string; // 'YYYY-MM-DD'
  fecha_hora_inicio?: string;
}

export interface PuntoEvolucion1RM {
  fecha: string;
  estimado: number;
}

export interface ResumenFuerzaEjercicio {
  unRMEstimado: number | null;
  mejorSerie: SerieRow | null;
  volumenSemanaKg: number;
  frecuenciaSemanal: number;
}

/**
 * Estima el 1RM (repeticion maxima) usando la formula clasica de Epley:
 *   1RM = peso * (1 + repeticiones / 30)
 *
 * IMPORTANTE: Devuelve null si repeticiones > 12. Por encima de 12 repeticiones,
 * el margen de error de la estimacion de fuerza maxima se dispara por la
 * intervencion de la resistencia a la fatiga, y mostrar un numero preciso
 * seria enganoso.
 *
 * Tambien devuelve null si las repeticiones o el peso son menores o iguales a cero.
 */
export function estimarUnaRM(pesoKg: number | null, repeticiones: number): number | null {
  if (pesoKg === null || pesoKg <= 0 || repeticiones <= 0) {
    return null;
  }
  if (repeticiones > 12) {
    return null;
  }
  if (repeticiones === 1) {
    return pesoKg;
  }
  const valor = pesoKg * (1 + repeticiones / 30);
  return Math.round(valor * 10) / 10;
}

/**
 * Encuentra la serie con mayor carga de trabajo efectiva (peso_kg * repeticiones).
 * No se basa unicamente en el peso absoluto, ya que una serie de 80 kg x 6 representa
 * un volumen de 480 kg, mientras que 100 kg x 1 representa 100 kg.
 * Si ninguna serie tiene peso, devuelve null.
 */
export function mejorSerieDe(series: SerieRow[]): SerieRow | null {
  let mejor: SerieRow | null = null;
  let maxCarga = 0;

  for (const s of series) {
    const peso = s.peso_kg ?? 0;
    if (peso <= 0 || s.repeticiones <= 0) continue;
    const carga = peso * s.repeticiones;
    if (carga > maxCarga) {
      maxCarga = carga;
      mejor = s;
    }
  }

  return mejor;
}

/**
 * Calcula la suma de peso_kg * repeticiones para todas las series,
 * ignorando las series sin peso o de peso corporal.
 */
export function volumenTotal(series: SerieRow[]): number {
  let total = 0;
  for (const s of series) {
    const peso = s.peso_kg ?? 0;
    if (peso > 0 && s.repeticiones > 0) {
      total += peso * s.repeticiones;
    }
  }
  return Math.round(total * 10) / 10;
}

/**
 * Construye la serie temporal de 1RM estimado para el grafico de evolucion.
 * Agrupa las series por fecha de sesion, seleccionando el mejor 1RM valido de cada dia.
 * Devuelve los puntos ordenados cronologicamente por fecha ascendente.
 */
export function evolucion1RM(series: SerieConFecha[]): PuntoEvolucion1RM[] {
  if (series.length === 0) return [];

  // Agrupar el mejor 1RM de cada fecha
  const mejorPorDia = new Map<string, number>();

  for (const s of series) {
    const est = estimarUnaRM(s.peso_kg, s.repeticiones);
    if (est === null) continue;

    const actual = mejorPorDia.get(s.fecha);
    if (actual === undefined || est > actual) {
      mejorPorDia.set(s.fecha, est);
    }
  }

  const fechasOrdenadas = Array.from(mejorPorDia.keys()).sort((a, b) => a.localeCompare(b));

  return fechasOrdenadas.map((fecha) => ({
    fecha,
    estimado: mejorPorDia.get(fecha)!,
  }));
}

/**
 * Genera un texto informativo y sobrio del coach sobre la progresion de carga.
 * Sin calificar, sin trofeos, sin signos de admiracion ni lenguaje de refuerzo.
 */
export function textoCoachFuerza(
  evolucion: PuntoEvolucion1RM[],
  nombreEjercicio: string,
): string | null {
  if (evolucion.length < 2) {
    return null;
  }

  const primerPunto = evolucion[0];
  const ultimoPunto = evolucion[evolucion.length - 1];
  const delta = Math.round((ultimoPunto.estimado - primerPunto.estimado) * 10) / 10;
  const dias = Math.max(1, diasEntre(primerPunto.fecha, ultimoPunto.fecha));
  const semanas = Math.max(1, Math.round(dias / 7));

  const periodoTexto =
    semanas === 1 ? 'en la ultima semana' : `en las ultimas ${semanas} semanas`;

  if (Math.abs(delta) < 0.5) {
    return `Mismo nivel de carga estimada en ${nombreEjercicio.toLowerCase()} ${periodoTexto}.`;
  }

  if (delta > 0) {
    return `Tu 1RM estimado en ${nombreEjercicio.toLowerCase()} subio ${delta} kg ${periodoTexto}.`;
  }

  return `Tu 1RM estimado en ${nombreEjercicio.toLowerCase()} vario ${delta} kg ${periodoTexto}.`;
}

// ---------------------------------------------------------------------------
// Lista de ejercicios por rutina (pantalla 1 de Fuerza y Progresion)
// ---------------------------------------------------------------------------

export type Tendencia = 'sube' | 'baja' | 'igual';

export interface ResumenFilaEjercicio {
  /** Ultimo 1RM estimado, o null si ninguna serie permite estimarlo. */
  unRM: number | null;
  /** Ultimo punto contra el anterior; null con menos de dos puntos. */
  tendencia: Tendencia | null;
  /** Fecha de la sesion mas reciente con este ejercicio. */
  ultimaFecha: string | null;
  /** Para los ejercicios sin 1RM (peso corporal, mas de 12 reps). */
  mejorSerie: SerieRow | null;
}

/**
 * Lo que entra en una fila de la lista: sin grafico ni historial, solo lo que
 * dice de un vistazo como viene el ejercicio. La tolerancia de 0,5 kg es la
 * misma que usa textoCoachFuerza para "mismo nivel".
 */
export function resumenFilaEjercicio(series: SerieConFecha[]): ResumenFilaEjercicio {
  const evo = evolucion1RM(series);
  const ultimo = evo[evo.length - 1] ?? null;
  const previo = evo[evo.length - 2] ?? null;

  let tendencia: Tendencia | null = null;
  if (ultimo && previo) {
    const delta = ultimo.estimado - previo.estimado;
    tendencia = Math.abs(delta) < 0.5 ? 'igual' : delta > 0 ? 'sube' : 'baja';
  }

  let ultimaFecha: string | null = null;
  for (const s of series) {
    if (ultimaFecha === null || s.fecha > ultimaFecha) ultimaFecha = s.fecha;
  }

  return {
    unRM: ultimo?.estimado ?? null,
    tendencia,
    ultimaFecha,
    mejorSerie: mejorSerieDe(series),
  };
}

export interface GrupoEjercicios<E extends { id: string }> {
  /** id de la rutina de gimnasio, o 'otros'. */
  id: string;
  nombre: string;
  ejercicios: { ejercicio: E; conHistorial: boolean }[];
}

/**
 * Arma los grupos de la lista: una entrada por rutina, con sus ejercicios en
 * el orden de la rutina, y al final "Otros" con los ejercicios que tienen
 * historial pero no estan en ninguna rutina (sesiones libres, o sacados de la
 * rutina). Sin "Otros", ese historial quedaria inaccesible.
 *
 * Las rutinas sin ejercicios no aparecen: un chip que lleva a una lista vacia
 * no sirve para nada.
 */
export function agruparEjerciciosPorRutina<E extends { id: string }>(
  rutinas: { id: string; nombre: string; ejercicios: E[] }[],
  conHistorial: E[],
): GrupoEjercicios<E>[] {
  const idsHistorial = new Set(conHistorial.map((e) => e.id));
  const enRutina = new Set<string>();
  const grupos: GrupoEjercicios<E>[] = [];

  for (const r of rutinas) {
    if (r.ejercicios.length === 0) continue;
    grupos.push({
      id: r.id,
      nombre: r.nombre,
      ejercicios: r.ejercicios.map((e) => {
        enRutina.add(e.id);
        return { ejercicio: e, conHistorial: idsHistorial.has(e.id) };
      }),
    });
  }

  const otros = conHistorial.filter((e) => !enRutina.has(e.id));
  if (otros.length > 0) {
    grupos.push({
      id: 'otros',
      nombre: 'Otros',
      ejercicios: otros.map((e) => ({ ejercicio: e, conHistorial: true })),
    });
  }

  return grupos;
}
