// src/features/entrenamiento/sonidos.ts
//
// Los pitidos del temporizador. Un modulo con estado propio y no un hook,
// porque los players se crean una vez al arrancar la sesion y se liberan al
// terminarla: no siguen el ciclo de vida de un render.
//
// Los archivos salen de scripts/generar-sonidos.mjs. Son WAV cortos: agudo y
// doble al entrar en trabajo, grave y simple al entrar en descanso, y una
// bajada de tres tonos al terminar. Que trabajo y descanso suenen distinto es
// el punto de todo esto; con un unico pitido habria que mirar la pantalla
// para saber cual de las dos cosas paso.
//
// ---------------------------------------------------------------------------
// ALCANCE: esto suena con la app ABIERTA y la pantalla despierta.
//
// La pantalla del temporizador mantiene el telefono despierto con
// expo-keep-awake, asi que el caso normal (el telefono apoyado a la vista
// mientras entrenas) esta cubierto. Si el usuario bloquea la pantalla a mano
// o se va a otra app, iOS suspende el proceso, los timers de JS se congelan y
// los pitidos dejan de salir hasta que se vuelve. Al volver, el temporizador
// se resincroniza solo contra el reloj del sistema y sigue en la fase que
// corresponde: no se desfasa, solo se pierde el aviso sonoro de las fases que
// pasaron a oscuras.
//
// COMO SE HABILITA EL AUDIO EN SEGUNDO PLANO (cuando haya development build):
//
//   1. Agregar el config plugin en app.json:
//
//        ["expo-audio", { "enableBackgroundPlayback": true }]
//
//      Eso escribe UIBackgroundModes: ["audio"] en el Info.plist de iOS y, en
//      Android, el permiso FOREGROUND_SERVICE_MEDIA_PLAYBACK y el servicio de
//      reproduccion. Es un cambio de Info.plist y de manifest, o sea que deja
//      de correr en Expo Go: necesita development build. Por eso hoy el plugin
//      no esta en app.json.
//
//   2. Poner shouldPlayInBackground: true en el modo de audio de abajo.
//
//   3. Y lo que no es obvio: el flag SOLO no alcanza. UIBackgroundModes
//      mantiene la app viva mientras hay audio SONANDO, y un pitido de 200 ms
//      no es "sonando": entre pitido y pitido iOS suspende el proceso igual y
//      el pitido siguiente nunca se programa. Hace falta un cuarto WAV de
//      silencio en loop (player.loop = true) reproduciendose durante toda la
//      sesion, para que la sesion de audio no quede nunca inactiva. Se arranca
//      al empezar y se libera al terminar, junto con el resto.
//      En Android ademas hay que llamar a setActiveForLockScreen(true, ...)
//      con interruptionMode: 'doNotMix', o el sistema corta a los ~3 minutos.
// ---------------------------------------------------------------------------

import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import type { AudioPlayer } from 'expo-audio';

import type { TipoFase } from './temporizador';

export type Pitido = 'trabajo' | 'descanso' | 'fin';

// Las rutas son relativas y no con el alias @/assets porque un require de
// asset lo resuelve Metro, no TypeScript, y asi no depende de que el alias
// este bien mapeado en las dos puntas.
const FUENTES: Record<Pitido, number> = {
  trabajo: require('../../../assets/sonidos/trabajo.wav'),
  descanso: require('../../../assets/sonidos/descanso.wav'),
  fin: require('../../../assets/sonidos/fin.wav'),
};

let players: Record<Pitido, AudioPlayer> | null = null;

/** Que pitido corresponde a la fase en la que se ENTRA. */
export function pitidoDeFase(tipo: TipoFase): Pitido {
  return tipo === 'trabajo' ? 'trabajo' : 'descanso';
}

/**
 * Crea los players y configura la sesion de audio. Se llama una vez, al
 * arrancar la sesion.
 *
 * Nunca tira: un temporizador mudo sigue siendo un temporizador usable, y
 * romper la pantalla porque no se pudo abrir la sesion de audio seria peor.
 */
export async function prepararSonidos(): Promise<void> {
  try {
    await setAudioModeAsync({
      // Lo mas importante del bloque para un iPhone: mucha gente entrena con
      // el switch de silencio puesto, y sin esto no se escucharia nada.
      playsInSilentMode: true,
      // Que no le corte la musica al usuario. Los pitidos se mezclan encima.
      interruptionMode: 'mixWithOthers',
      // Ver el bloque de arriba: hoy no hace nada sin el config plugin.
      shouldPlayInBackground: false,
    });
  } catch (e) {
    console.warn('No se pudo configurar la sesión de audio:', e);
  }

  if (players) return;

  try {
    players = {
      trabajo: createAudioPlayer(FUENTES.trabajo),
      descanso: createAudioPlayer(FUENTES.descanso),
      fin: createAudioPlayer(FUENTES.fin),
    };
  } catch (e) {
    console.warn('No se pudieron cargar los sonidos:', e);
    players = null;
  }
}

/**
 * Dispara un pitido. Sincrono y sin await a proposito: lo llama el efecto que
 * detecta el cambio de fase y no puede quedarse esperando a nadie.
 *
 * El seekTo(0) es lo que permite repetirlo: despues de sonar, el player queda
 * al final y un play() a secas no haria nada.
 */
export function reproducir(pitido: Pitido): void {
  const player = players?.[pitido];
  if (!player) return;

  try {
    // seekTo devuelve una promesa que no se espera; el catch esta para que no
    // quede colgada sin manejar si el player se libero en el medio.
    void player.seekTo(0).catch(() => {});
    player.play();
  } catch (e) {
    console.warn('No se pudo reproducir el sonido:', e);
  }
}

/** Libera los players. Va en la limpieza de la pantalla, siempre. */
export function liberarSonidos(): void {
  if (!players) return;
  for (const player of Object.values(players)) {
    try {
      player.remove();
    } catch {
      // Ya liberado o nunca cargado: no hay nada que hacer ni que avisar.
    }
  }
  players = null;
}
