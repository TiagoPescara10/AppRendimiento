// src/features/entrenamiento/useGps.ts
//
// El GPS del cronometro libre, en primer plano. La cuenta de km vive en
// gps.ts, que es puro; aca quedan el permiso, la suscripcion y AppState.
//
// Reglas:
//
//   - El permiso se pide al tocar Empezar (iniciar()), nunca antes.
//   - El watcher queda prendido toda la sesion, aunque a los 30 s se de el GPS
//     por perdido: el caso tipico es arrancar adentro y salir a la calle a los
//     dos minutos, y ahi tiene que empezar a contar.
//   - Pausa: cortarTramo y los puntos se ignoran hasta reanudar. Al reanudar se
//     vuelve a cortar, por si entro un punto entre la pausa y el render.
//   - Segundo plano: igual que una pausa, y al volver queda el aviso. Con
//     GPS_SEGUNDO_PLANO prendido, no se corta: los puntos siguen llegando por
//     la tarea de gpsSegundoPlano.ts.

import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import * as Location from 'expo-location';

import type { Actividad } from '@/lib/gasto';
import { ESTADO_GPS_INICIAL, agregarPunto, cortarTramo } from './gps';
import type { EstadoGps, Punto } from './gps';
import {
  GPS_SEGUNDO_PLANO,
  detenerSegundoPlano,
  escucharSegundoPlano,
  iniciarSegundoPlano,
} from './gpsSegundoPlano';

export type PermisoGps = 'sinPedir' | 'concedido' | 'denegado';

/**
 * Un punto mas viejo que esto no es de ahora. Al suscribirse, iOS puede
 * entregar primero la ultima ubicacion que tenia guardada, que puede ser de
 * hace una hora y de otro lugar: si anclara, el primer punto real sumaria
 * todo ese trayecto.
 */
const PUNTO_VIEJO_MS = 10_000;

function aPunto(u: Location.LocationObject): Punto | null {
  if (Date.now() - u.timestamp > PUNTO_VIEJO_MS) return null;
  return {
    lat: u.coords.latitude,
    lon: u.coords.longitude,
    // Sin precision no hay forma de saber cuanto creerle: gps.ts lo descarta.
    precisionM: u.coords.accuracy ?? Infinity,
    t: u.timestamp,
  };
}

interface Opciones {
  /** true mientras corre una sesion de cronometro libre. */
  activo: boolean;
  actividad: Actividad;
  /** Tiempo de sesion, sin pausas. Se llama en el momento de cada punto. */
  sesionMs: () => number;
}

export function useGps({ activo, actividad, sesionMs }: Opciones) {
  const [permiso, setPermiso] = useState<PermisoGps>('sinPedir');
  const [estado, setEstado] = useState<EstadoGps>(ESTADO_GPS_INICIAL);
  const [huboCorte, setHuboCorte] = useState(false);

  // Lo que leen los callbacks del GPS y de AppState, que no se vuelven a
  // suscribir en cada render.
  const pausado = useRef(false);
  const actividadRef = useRef(actividad);
  const sesionMsRef = useRef(sesionMs);
  useEffect(() => {
    actividadRef.current = actividad;
    sesionMsRef.current = sesionMs;
  });

  const procesar = useCallback((u: Location.LocationObject) => {
    if (pausado.current) return;
    if (!GPS_SEGUNDO_PLANO && AppState.currentState === 'background') return;
    const punto = aPunto(u);
    if (!punto) return;
    const ms = sesionMsRef.current();
    const act = actividadRef.current;
    setEstado((e) => agregarPunto(e, punto, act, ms));
  }, []);

  /** Se llama al tocar Empezar. Nunca tira: sin GPS el cronometro sigue. */
  const iniciar = useCallback(async () => {
    setEstado(ESTADO_GPS_INICIAL);
    setHuboCorte(false);
    pausado.current = false;
    try {
      const r = await Location.requestForegroundPermissionsAsync();
      setPermiso(r.granted ? 'concedido' : 'denegado');
    } catch (e) {
      console.warn('No se pudo pedir el permiso de ubicación:', e);
      setPermiso('denegado');
    }
  }, []);

  const marcarPausa = useCallback((enPausa: boolean) => {
    pausado.current = enPausa;
    setEstado(cortarTramo);
  }, []);

  const cerrarAviso = useCallback(() => setHuboCorte(false), []);

  // --- suscripcion ----------------------------------------------------------

  useEffect(() => {
    if (!activo || permiso !== 'concedido') return;
    let vivo = true;
    let sub: Location.LocationSubscription | null = null;

    Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, distanceInterval: 5 },
      procesar,
      (error) => console.warn('Error del GPS:', error),
    )
      .then((s) => {
        if (vivo) sub = s;
        else s.remove();
      })
      .catch((e) => console.warn('No se pudo arrancar el GPS:', e));

    if (GPS_SEGUNDO_PLANO) {
      escucharSegundoPlano((us) => us.forEach(procesar));
      iniciarSegundoPlano().catch((e) => console.warn('No se pudo arrancar el GPS en segundo plano:', e));
    }

    return () => {
      vivo = false;
      sub?.remove();
      if (GPS_SEGUNDO_PLANO) {
        escucharSegundoPlano(null);
        detenerSegundoPlano().catch(() => {});
      }
    };
  }, [activo, permiso, procesar]);

  // --- segundo plano ----------------------------------------------------------

  useEffect(() => {
    if (!activo || permiso !== 'concedido' || GPS_SEGUNDO_PLANO) return;
    // Solo 'background'. 'inactive' es el centro de control o una llamada
    // entrante: la app sigue a la vista y los puntos siguen siendo validos.
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'background') return;
      setEstado(cortarTramo);
      if (!pausado.current) setHuboCorte(true);
    });
    return () => sub.remove();
  }, [activo, permiso]);

  return { estado, permiso, huboCorte, iniciar, marcarPausa, cerrarAviso };
}
