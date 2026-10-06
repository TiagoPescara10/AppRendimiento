// src/features/nivel/api.ts
//
// Lee la base y llama a las funciones puras de src/lib/nivel.ts. Una sola
// query: todos los eventos hasta hoy. No se lee ninguna sesion, asi que no
// hay N+1 (ver el encabezado de lib/nivel.ts para por que alcanza).

import { obtenerPerfilLocal } from '@/db/queries/perfil';
import { listarEventosPorRangoFecha } from '@/db/queries/eventos';
import { getDb } from '@/db/schema';
import { leerMeta, escribirMeta } from '@/db/meta';
import { aFechaLocal } from '@/lib/fechas';
import {
  calcularXP,
  enVentanaDeBono,
  mejorRachaSemanas,
  mesAnterior,
  nivelDesdeXP,
  resumenDelMes,
  sesionesCompletadas,
  textoBonoMensual,
} from '@/lib/nivel';
import type { EventoNivel, Nivel } from '@/lib/nivel';

/** Mismo truco que en progreso/api.ts: una fecha imposible y no un null. */
const INICIO_DE_LOS_TIEMPOS = '0001-01-01';

export interface DatosNivel extends Nivel {
  /** Historico: nunca baja salvo que se borre un entrenamiento. */
  sesionesTotales: number;
  /** Mejor racha historica de semanas seguidas, no la actual. */
  mejorRachaSemanas: number;
}

/** El nivel a partir de eventos ya leidos. Progreso lo usa para no repetir la query. */
export function nivelDeEventos(eventos: EventoNivel[], ahora: Date = new Date()): DatosNivel {
  return {
    ...nivelDesdeXP(calcularXP(eventos, ahora)),
    sesionesTotales: sesionesCompletadas(eventos),
    mejorRachaSemanas: mejorRachaSemanas(eventos),
  };
}

async function eventosHastaHoy(usuarioId: string): Promise<EventoNivel[]> {
  return listarEventosPorRangoFecha(usuarioId, INICIO_DE_LOS_TIEMPOS, aFechaLocal(new Date()));
}

export async function cargarNivel(): Promise<DatosNivel | null> {
  const perfil = await obtenerPerfilLocal();
  if (!perfil) return null;
  return nivelDeEventos(await eventosHastaHoy(perfil.id));
}

const claveBono = (mes: string) => `bono_mostrado_${mes}`;

/**
 * El texto del bono del mes anterior si corresponde mostrarlo, o null.
 *
 * Solo mira el mes ANTERIOR y solo en los primeros dias del mes (ver
 * DIAS_VENTANA_BONO): un mes que no se llego a avisar no aparece tarde,
 * aunque su XP si cuenta. Fuera de la ventana no se escribe ninguna marca.
 *
 * Dentro de la ventana, la marca se graba aunque el mes no haya llegado al
 * 75%: asi no se recalcula en cada foco, y no hay cartel de "no llegaste".
 */
export async function bonoMensualPendiente(usuarioId: string): Promise<string | null> {
  const ahora = new Date();
  if (!enVentanaDeBono(ahora)) return null;

  const mes = mesAnterior(ahora);
  const clave = claveBono(mes);
  const db = getDb();

  if (await leerMeta(db, clave)) return null;

  const resumen = resumenDelMes(await eventosHastaHoy(usuarioId), mes, ahora);
  await escribirMeta(db, clave, resumen?.cobraBono ? 'mostrado' : 'sin_bono');

  return resumen?.cobraBono ? textoBonoMensual(resumen) : null;
}
