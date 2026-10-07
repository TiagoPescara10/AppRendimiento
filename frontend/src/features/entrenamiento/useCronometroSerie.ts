// src/features/entrenamiento/useCronometroSerie.ts
//
// Cronometro de una serie por tiempo (plancha, cardio) en la pantalla de
// rutina. Cuenta hacia arriba, pita cada 15 s y con otro sonido al parar. No
// corta solo: si la serie anterior tiene un tiempo, la pantalla lo muestra
// como objetivo y el usuario decide cuando parar.
//
// El tiempo sale de Date.now() contra el inicio, no de sumar ticks, asi que
// al volver de segundo plano se resincroniza solo. Mientras corre mantiene la
// pantalla encendida, como el temporizador. Con la pantalla bloqueada tiene la
// misma limitacion de Expo Go que los pitidos del temporizador: ver sonidos.ts.

import { useCallback, useEffect, useRef, useState } from 'react';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';

import { cruzoMarca } from '@/lib/duracion';
import { liberarSonidos, prepararSonidos, reproducir } from './sonidos';

const TAG_DESPIERTO = 'cronometro-serie';
const TICK_MS = 250;

export interface CronometroSerie {
  corriendo: boolean;
  /** Segundos enteros desde Iniciar. 0 si no corre. */
  segundos: number;
  iniciar: () => void;
  /** Para y devuelve los segundos medidos (al menos 1). */
  parar: () => number;
  /** Para sin sonido y sin devolver nada: la serie se abandono. */
  cancelar: () => void;
}

export function useCronometroSerie(): CronometroSerie {
  const [inicioMs, setInicioMs] = useState<number | null>(null);
  const [segundos, setSegundos] = useState(0);
  const ultimoSeg = useRef(0);
  const sonidosListos = useRef(false);

  const corriendo = inicioMs !== null;

  useEffect(() => {
    if (inicioMs === null) return;
    const id = setInterval(() => {
      const seg = Math.floor((Date.now() - inicioMs) / 1000);
      if (cruzoMarca(ultimoSeg.current, seg)) reproducir('descanso');
      ultimoSeg.current = seg;
      setSegundos(seg);
    }, TICK_MS);
    return () => clearInterval(id);
  }, [inicioMs]);

  useEffect(() => {
    if (!corriendo) return;
    activateKeepAwakeAsync(TAG_DESPIERTO).catch(() => {});
    return () => {
      try {
        deactivateKeepAwake(TAG_DESPIERTO);
      } catch {
        // Nunca llego a activarse. No hay nada que soltar.
      }
    };
  }, [corriendo]);

  // Los players se crean la primera vez que se inicia y se liberan al salir
  // de la pantalla. Una rutina sin ejercicios por tiempo no abre el audio.
  useEffect(() => {
    return () => {
      if (sonidosListos.current) liberarSonidos();
    };
  }, []);

  const iniciar = useCallback(() => {
    if (!sonidosListos.current) {
      sonidosListos.current = true;
      void prepararSonidos();
    }
    ultimoSeg.current = 0;
    setSegundos(0);
    setInicioMs(Date.now());
  }, []);

  const parar = useCallback((): number => {
    const seg = inicioMs === null ? 0 : Math.floor((Date.now() - inicioMs) / 1000);
    setInicioMs(null);
    setSegundos(0);
    reproducir('fin');
    return Math.max(1, seg);
  }, [inicioMs]);

  const cancelar = useCallback(() => {
    setInicioMs(null);
    setSegundos(0);
  }, []);

  return { corriendo, segundos, iniciar, parar, cancelar };
}
