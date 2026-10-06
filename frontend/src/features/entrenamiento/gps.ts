// src/features/entrenamiento/gps.ts
//
// Los km del cronometro libre a partir de los puntos del GPS. Puro y sin
// imports de expo: el hook useGps.ts le pasa los puntos y esto decide cuales
// cuentan. Asi entra directo a scripts/probar-gps.mjs.
//
// La distancia se acumula de a tramos. Un tramo empieza en un ANCLA (el primer
// punto bueno) y cada punto que cuenta pasa a ser el ancla siguiente. Pausar o
// pasar a segundo plano corta el tramo: el ancla queda en null y el proximo
// punto arranca otro tramo, sin unirse al ultimo de antes. Si se unieran, una
// pausa de 10 minutos caminando sumaria esa caminata en linea recta.
//
// Que punto NO cuenta:
//
//   - precision peor que 25 m: es ruido, no posicion;
//   - para anclar un tramo, precision peor que 15 m: el ancla es la base de
//     todo lo que viene despues, y un ancla corrida corre el primer tramo.
//     Salvo que pasen 10 s sin ninguno mejor: entonces se ancla en el mejor
//     candidato de hasta 25 m que haya llegado. Sin eso, con 20 m de precision
//     sostenida (comun entre edificios) el tramo no arrancaria nunca. El
//     candidato puede ser de hace unos segundos: lo caminado mientras tanto se
//     mide contra el y no se pierde;
//   - un salto que implica mas de 45 km/h a pie u 80 km/h en bici: un rebote
//     de la señal, no alguien que se movio;
//   - un movimiento menor a la SUMA de las precisiones del ancla y del punto
//     nuevo (con piso de 3 m). Quieto, el GPS del iPhone deriva 5 a 10 m. Si
//     se mirara solo la precision del punto nuevo, quedaria afuera que el
//     ancla tambien esta corrida: dos puntos con 8 m de precision pueden
//     estar a 16 m sin que nadie se haya movido. En la simulacion de
//     scripts/probar-gps.mjs, parado 60 s, con la precision del punto nuevo
//     sola se acumulan hasta 44 m; con la suma, 0.
//
// En los dos ultimos casos el ancla NO se mueve. Si se moviera con cada punto
// descartado, caminando despacio (puntos cada 5 m con 10 m de precision) nunca
// se pasaria el umbral y no se sumaria nada. Con el ancla fija, el movimiento
// real se junta hasta superarlo y entra entero.
//
// La excepcion: si el ANCLA es el rebote, todos los puntos buenos que siguen
// parecen saltos, hasta que pasa el tiempo suficiente para que la velocidad
// "alcance" y se suma la distancia falsa entera. Por eso, con 3 saltos
// seguidos, el ancla se da por mala y se reemplaza por el punto nuevo, sin
// sumar nada. Un rebote real es un punto suelto; tres seguidos son el ancla.

import type { Actividad } from '../../lib/gasto';

export interface Punto {
  lat: number;
  lon: number;
  /** Radio de incertidumbre en metros, el `accuracy` de expo-location. */
  precisionM: number;
  /** Instante del punto, en ms. */
  t: number;
}

export interface EstadoGps {
  km: number;
  /** El ancla del tramo actual. null = tramo cortado (o todavia sin señal). */
  ultimo: Punto | null;
  /**
   * Tiempo de SESION (sin pausas) en que se anclo el primer punto. null si
   * todavia no hubo ninguno. Es lo que distingue "medio todo" de "empezo a
   * medir tarde".
   */
  primerPuntoSesionMs: number | null;
  /** Puntos descartados por salto, seguidos, contra el ancla actual. */
  saltosSeguidos: number;
  /**
   * Sin ancla: el mejor punto de entre 15 y 25 m visto hasta ahora en este
   * tramo, y desde cuando (ms) se espera uno mejor.
   */
  candidata: Punto | null;
  candidataDesde: number | null;
}

export const ESTADO_GPS_INICIAL: EstadoGps = {
  km: 0,
  ultimo: null,
  primerPuntoSesionMs: null,
  saltosSeguidos: 0,
  candidata: null,
  candidataDesde: null,
};

/** Peor precision que se acepta para sumar. */
export const PRECISION_MAX_M = 25;
/** Peor precision que se acepta para anclar un tramo. */
export const PRECISION_ANCLA_M = 15;
/** Piso del umbral de movimiento: con 2 m de precision, 2 m sigue siendo ruido. */
export const MOVIMIENTO_MIN_M = 3;
/** Sin ningun punto bueno en este tiempo de sesion, se da el GPS por perdido. */
export const ESPERA_SENAL_MS = 30_000;
/** Saltos seguidos contra la misma ancla a partir de los cuales el ancla es la mala. */
export const SALTOS_PARA_REANCLAR = 3;
/** Cuanto se espera un ancla de 15 m antes de conformarse con una de hasta 25. */
export const ESPERA_ANCLA_MS = 10_000;

export const VELOCIDAD_MAX_KMH: Record<Actividad, number> = {
  correr: 45,
  caminar: 45,
  bici: 80,
};

const RADIO_TIERRA_KM = 6371.0088;
const rad = (g: number) => (g * Math.PI) / 180;

/** Distancia en km sobre la esfera. A estas escalas, el error contra el elipsoide es < 0,5%. */
export function haversineKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * RADIO_TIERRA_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

const valido = (p: Punto) =>
  Number.isFinite(p.lat) && Number.isFinite(p.lon) && Number.isFinite(p.precisionM) && Number.isFinite(p.t);

/**
 * Suma un punto, o lo descarta. Devuelve el mismo objeto si no cambio nada,
 * asi un setState con esto no provoca un render de mas.
 *
 * `sesionMs` es el tiempo de sesion en ese momento; solo se usa para anotar
 * cuando se anclo el primer punto.
 */
export function agregarPunto(
  estado: EstadoGps,
  punto: Punto,
  actividad: Actividad,
  sesionMs: number = 0,
): EstadoGps {
  if (!valido(punto) || punto.precisionM > PRECISION_MAX_M) return estado;

  const ancla = estado.ultimo;
  if (ancla === null) {
    if (punto.precisionM <= PRECISION_ANCLA_M) return anclar(estado, punto, sesionMs);

    const { candidata, candidataDesde } = estado;
    if (candidata === null || candidataDesde === null) {
      return { ...estado, candidata: punto, candidataDesde: punto.t };
    }
    const mejor = punto.precisionM < candidata.precisionM ? punto : candidata;
    if (punto.t - candidataDesde < ESPERA_ANCLA_MS) {
      return mejor === candidata ? estado : { ...estado, candidata: mejor };
    }
    // Se cumplio la espera. Si la mejor es este mismo punto, ancla y listo;
    // si es una anterior, ancla ahi y este punto se mide contra ella.
    const anclado = anclar(estado, mejor, sesionMs);
    return mejor === punto ? anclado : agregarPunto(anclado, punto, actividad, sesionMs);
  }

  const dt = (punto.t - ancla.t) / 1000;
  // Fuera de orden o repetido: no hay velocidad que calcular.
  if (dt <= 0) return estado;

  const metros = haversineKm(ancla, punto) * 1000;

  if ((metros / dt) * 3.6 > VELOCIDAD_MAX_KMH[actividad]) {
    const saltosSeguidos = estado.saltosSeguidos + 1;
    // Y el reemplazo tiene que servir de ancla, como cualquier otra.
    if (saltosSeguidos < SALTOS_PARA_REANCLAR || punto.precisionM > PRECISION_ANCLA_M) {
      return { ...estado, saltosSeguidos };
    }
    // El ancla era el rebote. Se reancla sin sumar: lo que hubo entre el
    // rebote y aca se pierde, que es mucho menos que sumar el salto entero.
    return { ...estado, ultimo: punto, saltosSeguidos: 0 };
  }

  const sinSaltos = estado.saltosSeguidos === 0 ? estado : { ...estado, saltosSeguidos: 0 };
  if (metros <= Math.max(punto.precisionM + ancla.precisionM, MOVIMIENTO_MIN_M)) return sinSaltos;

  return { ...sinSaltos, km: estado.km + metros / 1000, ultimo: punto };
}

function anclar(estado: EstadoGps, punto: Punto, sesionMs: number): EstadoGps {
  return {
    ...estado,
    ultimo: punto,
    saltosSeguidos: 0,
    candidata: null,
    candidataDesde: null,
    primerPuntoSesionMs: estado.primerPuntoSesionMs ?? sesionMs,
  };
}

/** Pausa o segundo plano: el proximo punto arranca un tramo nuevo. */
export function cortarTramo(estado: EstadoGps): EstadoGps {
  if (estado.ultimo === null && estado.candidata === null) return estado;
  return { ...estado, ultimo: null, saltosSeguidos: 0, candidata: null, candidataDesde: null };
}

/** Los km de una lista de puntos, en un solo tramo. Para probar y para depurar. */
export function acumularDistancia(puntos: readonly Punto[], actividad: Actividad): number {
  return puntos.reduce((e, p) => agregarPunto(e, p, actividad), ESTADO_GPS_INICIAL).km;
}

// ---------------------------------------------------------------------------
// Señal
// ---------------------------------------------------------------------------

export type SenalGps = 'buscando' | 'ok' | 'sinGps';

/**
 * Que muestra la pantalla:
 *
 *   - sin permiso, siempre sinGps;
 *   - con algun punto anclado, ok (aunque despues se pierda: los km medidos
 *     siguen siendo validos);
 *   - sin puntos, buscando los primeros 30 s de sesion y sinGps despues.
 *
 * De sinGps se vuelve a ok: el caso tipico es tocar Empezar adentro y salir a
 * la calle a los dos minutos. Ese caso queda marcado con gpsParcial().
 */
export function senalGps(estado: EstadoGps, sesionMs: number, conPermiso: boolean): SenalGps {
  if (!conPermiso) return 'sinGps';
  if (estado.primerPuntoSesionMs !== null) return 'ok';
  return sesionMs >= ESPERA_SENAL_MS ? 'sinGps' : 'buscando';
}

/** true si el GPS empezo a medir despues de haberse dado por perdido. */
export function gpsParcial(estado: EstadoGps): boolean {
  return estado.primerPuntoSesionMs !== null && estado.primerPuntoSesionMs >= ESPERA_SENAL_MS;
}

/** El minuto de sesion en que empezo a medir, para el aviso. Nunca 0. */
export function minutoInicioGps(estado: EstadoGps): number | null {
  if (estado.primerPuntoSesionMs === null) return null;
  return Math.max(1, Math.round(estado.primerPuntoSesionMs / 60_000));
}
