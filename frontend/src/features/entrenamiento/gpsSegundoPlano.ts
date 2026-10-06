// src/features/entrenamiento/gpsSegundoPlano.ts
//
// El GPS con la pantalla bloqueada o la app en segundo plano. APAGADO: en
// Expo Go iOS no deja registrar tareas de ubicacion en segundo plano, asi que
// hoy, al pasar a segundo plano, useGps.ts corta el tramo igual que una pausa
// y avisa al volver.
//
// COMO SE PRENDE (cuando haya development build):
//
//   1. En app.json, en el plugin de expo-location:
//
//        "isIosBackgroundLocationEnabled": true,
//        "locationAlwaysAndWhenInUsePermission": "...",
//
//      Eso escribe UIBackgroundModes: ["location"] en el Info.plist. En
//      Android agrega el foreground service; el aviso persistente lo arma
//      startLocationUpdatesAsync con foregroundService, mas abajo.
//
//   2. GPS_SEGUNDO_PLANO = true.
//
//   3. Importar este archivo desde app/_layout.tsx (import '@/features/
//      entrenamiento/gpsSegundoPlano'). TaskManager.defineTask tiene que
//      correr al cargar la app, no recien al abrir el temporizador: si iOS
//      relanza el proceso para entregar ubicaciones, la tarea ya tiene que
//      estar definida.
//
// Con "mientras se usa la app" alcanza: iOS sigue entregando ubicaciones a una
// app que arranco las actualizaciones en primer plano, y muestra la pastilla
// azul de ubicacion. No hace falta pedir "siempre".

import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

/** boolean y no `false` literal: si no, TypeScript da por muertas las ramas del flag. */
export const GPS_SEGUNDO_PLANO: boolean = false;

const TAREA_GPS = 'cronometro-gps';

type Oyente = (ubicaciones: Location.LocationObject[]) => void;

// La tarea corre en el mismo proceso de JS, asi que le pasa los puntos al hook
// por un oyente de modulo. Si el proceso murio, no hay hook que escuche y los
// puntos se pierden: es el mismo corte de hoy, solo que menos frecuente.
let oyente: Oyente | null = null;

export function escucharSegundoPlano(fn: Oyente | null): void {
  oyente = fn;
}

if (GPS_SEGUNDO_PLANO) {
  TaskManager.defineTask<{ locations: Location.LocationObject[] }>(TAREA_GPS, async ({ data, error }) => {
    if (error) {
      console.warn('Error en la tarea de GPS:', error.message);
      return;
    }
    if (data?.locations) oyente?.(data.locations);
  });
}

export async function iniciarSegundoPlano(): Promise<void> {
  if (!GPS_SEGUNDO_PLANO) return;
  await Location.startLocationUpdatesAsync(TAREA_GPS, {
    accuracy: Location.Accuracy.High,
    distanceInterval: 5,
    activityType: Location.ActivityType.Fitness,
    // Si iOS pausa las actualizaciones al detectar que estas quieto, despues
    // tarda en volver a arrancarlas y se pierde el primer tramo.
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: 'Cronómetro en curso',
      notificationBody: 'Midiendo los km con el GPS.',
    },
  });
}

export async function detenerSegundoPlano(): Promise<void> {
  if (!GPS_SEGUNDO_PLANO) return;
  if (await Location.hasStartedLocationUpdatesAsync(TAREA_GPS)) {
    await Location.stopLocationUpdatesAsync(TAREA_GPS);
  }
}
