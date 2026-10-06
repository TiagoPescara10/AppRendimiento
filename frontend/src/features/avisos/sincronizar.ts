// src/features/avisos/sincronizar.ts
//
// Lleva el plan de planificar.ts a las notificaciones locales del sistema:
// cancela las nuestras (las que empiezan con "aviso-") y programa el plan
// nuevo. Sin servidor: todo es expo-notifications, asi funciona en Expo Go.
//
// Corre con debounce: materializarRutinas inserta decenas de eventos seguidos
// y cada insert avisa un cambio; tienen que terminar en UNA sincronizacion.
// Si llega un cambio mientras una corrida esta programando, se encola una
// sola corrida mas al final, asi un cancelar y un programar nunca se pisan.
//
// Nada de aca puede hacer fallar a quien lo disparo: los errores se loguean.
//
// No importa react-native a proposito: el canal y el handler viven en
// configurar.ts. Asi este modulo se prueba en node con un shim de
// expo-notifications (scripts/probar-avisos.mjs).

import * as Notifications from 'expo-notifications';

import { escucharCambios } from '../../db/cambios';
import { listarEventosPorRango } from '../../db/queries/eventos';
import { obtenerPerfil } from '../../db/queries/perfil';
import { ultimoPeso } from '../../db/queries/peso';
import type { PerfilRow } from '../../db/schema';
import { aISOLocal } from '../../lib/fechas';
import {
  planificarAvisos,
  PREFIJO_AVISO,
  VENTANA_DIAS,
  type PreferenciasAvisos,
} from './planificar';

/** Canal de Android. Importancia por defecto: informa, no interrumpe. */
export const CANAL_AVISOS = 'avisos';

/** Cuanto se espera sin cambios nuevos antes de sincronizar. */
export const ESPERA_SINCRONIZAR_MS = 800;

/** Cuanto para atras se leen eventos: los ya empezados todavia tienen post. */
const HORAS_HACIA_ATRAS = 24;

export function preferenciasDe(perfil: PerfilRow): PreferenciasAvisos {
  // `!== 0` y no `=== 1`: un perfil leido antes de la migracion 020 no tiene
  // las columnas y tiene que quedar con todo activado, que es el default.
  return {
    activos: perfil.avisos_activos !== 0,
    antes: perfil.avisos_antes !== 0,
    despues: perfil.avisos_despues !== 0,
    gimnasio: perfil.avisos_gimnasio !== 0,
  };
}

/** Una corrida completa: leer, cancelar las nuestras y programar. */
async function correr(usuarioId: string): Promise<void> {
  const ahora = new Date();
  const permiso = await Notifications.getPermissionsAsync();
  const perfil = await obtenerPerfil(usuarioId);

  let plan: ReturnType<typeof planificarAvisos> = [];
  // Sin permiso igual se cancela: si lo saco desde Ajustes, que no queden
  // avisos viejos colgados para cuando lo vuelva a dar.
  if (perfil && permiso.granted) {
    const desde = aISOLocal(new Date(ahora.getTime() - HORAS_HACIA_ATRAS * 3_600_000));
    const hasta = aISOLocal(new Date(ahora.getTime() + VENTANA_DIAS * 24 * 3_600_000));
    const [eventos, peso] = await Promise.all([
      listarEventosPorRango(usuarioId, desde, hasta),
      ultimoPeso(usuarioId),
    ]);
    plan = planificarAvisos({
      eventos,
      pesoKg: peso?.peso_kg ?? null,
      modoNutricion: perfil.modo_nutricion,
      deportePrincipal: perfil.deporte_principal,
      preferencias: preferenciasDe(perfil),
      ahora,
    });
  }

  const programadas = await Notifications.getAllScheduledNotificationsAsync();
  for (const n of programadas) {
    if (n.identifier.startsWith(PREFIJO_AVISO)) {
      await Notifications.cancelScheduledNotificationAsync(n.identifier);
    }
  }

  for (const aviso of plan) {
    try {
      await Notifications.scheduleNotificationAsync({
        identifier: aviso.id,
        content: {
          title: aviso.titulo,
          body: aviso.cuerpo,
          data: { url: `/evento/${aviso.eventoId}`, eventoId: aviso.eventoId },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: aviso.fecha,
          channelId: CANAL_AVISOS,
        },
      });
    } catch (e) {
      // Uno que falla no se lleva puestos a los demas.
      console.error(`No se pudo programar ${aviso.id}:`, e);
    }
  }
}

// ---------------------------------------------------------------------------
// Debounce y cola
// ---------------------------------------------------------------------------

let temporizador: ReturnType<typeof setTimeout> | null = null;
let usuarioPendiente: string | null = null;
let corriendo = false;
let otraVez = false;

async function lanzar(): Promise<void> {
  if (corriendo) {
    otraVez = true;
    return;
  }
  const usuarioId = usuarioPendiente;
  if (!usuarioId) return;

  corriendo = true;
  try {
    await correr(usuarioId);
  } catch (e) {
    console.error('Error al sincronizar avisos:', e);
  } finally {
    corriendo = false;
  }

  if (otraVez) {
    otraVez = false;
    await lanzar();
  }
}

/**
 * Pide una sincronizacion. No espera ni tira: corre sola cuando pasan
 * ESPERA_SINCRONIZAR_MS sin otro pedido.
 */
export function sincronizarAvisos(usuarioId: string): void {
  usuarioPendiente = usuarioId;
  if (temporizador) clearTimeout(temporizador);
  temporizador = setTimeout(() => {
    temporizador = null;
    void lanzar();
  }, ESPERA_SINCRONIZAR_MS);
}

/**
 * Engancha los avisos a los cambios de la base (eventos, peso, perfil) y
 * pide una primera sincronizacion. Devuelve la funcion para desengancharlos.
 */
export function iniciarAvisos(usuarioId: string): () => void {
  const dejar = escucharCambios(() => sincronizarAvisos(usuarioId));
  sincronizarAvisos(usuarioId);
  return dejar;
}
