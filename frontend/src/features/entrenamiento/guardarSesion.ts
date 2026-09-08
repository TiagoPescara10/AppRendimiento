// src/features/entrenamiento/guardarSesion.ts
//
// Que pasa cuando una sesion del temporizador termina bien.
//
// Vive aca y no en la pantalla por lo mismo que materializar.ts vive en
// features/agenda: es politica, no dibujo ni acceso a datos. Las queries de
// db/queries/sesiones.ts escriben filas; decidir si hace falta un evento
// retroactivo, de donde sale la intensidad y que las dos escrituras sean
// atomicas se decide aca.
//
// Los imports son relativos y no con el alias '@/': asi el archivo entra al
// build de scripts/probar-db.mjs, que compila con resolucion de node y sin los
// paths del tsconfig del proyecto.
//
// ABANDONAR NO ESCRIBE NADA. Esta funcion se llama solo cuando la sesion se
// completa; esa regla vive en la pantalla y no cambia.

import { crearEvento } from '../../db/queries/eventos';
import { crearSesion } from '../../db/queries/sesiones';
import { getDb } from '../../db/schema';
import type { SesionEntrenamientoRow } from '../../db/schema';
import { randomUUID } from '../../db/sync/uuid';
import { aISOLocal } from '../../lib/fechas';
import { intensidadDe, progresoEn } from './temporizador';
import type { ConfigTemporizador, Fase } from './temporizador';

export interface DatosSesionTerminada {
  usuarioId: string;
  config: ConfigTemporizador;
  plan: Fase[];
  /** Cuando arranco la sesion. Es la hora del evento retroactivo. */
  inicio: Date;
  /**
   * En ms y no en segundos: de aca sale tambien el conteo de fases hechas, y
   * redondear antes puede correr una fase que termina justo en el limite.
   */
  duracionRealMs: number;
}

export interface ResultadoGuardado {
  eventoId: string;
  sesion: SesionEntrenamientoRow;
}

/** Minutos que se le estampan al evento. Nunca 0: una sesion existio. */
function minutosDe(ms: number): number {
  return Math.max(1, Math.round(ms / 60000));
}

/**
 * Deja registrado un entrenamiento terminado: el evento y su detalle.
 *
 * Siempre crea el evento retroactivo, ya completado y ya respondido. Antes
 * habia un segundo camino, para cuando la sesion salia de un evento agendado,
 * pero al temporizador ya no se llega desde la agenda: un entrenamiento de
 * club o gimnasio es algo a lo que vas y hacés lo que te dicen, y de eso la
 * app solo pregunta si fuiste. El temporizador es para el entrenamiento
 * propio, que arranca desde "Entrenar" y no tiene evento previo.
 *
 * Lo de "respondido" no es un detalle: sin eso, el cartel de pendientes le
 * preguntaria dos horas despues si hizo el entrenamiento que acaba de
 * terminar con el telefono en la mano.
 *
 * Las dos escrituras van en una transaccion porque una sesion sin evento no
 * se puede leer (obtenerSesionPorEvento parte del evento) y un evento
 * retroactivo sin sesion es un entrenamiento fantasma en el calendario. O
 * quedan las dos o no queda ninguna.
 */
export async function guardarSesionTerminada(
  datos: DatosSesionTerminada,
): Promise<ResultadoGuardado> {
  const { usuarioId, config, plan, inicio, duracionRealMs } = datos;

  const progreso = progresoEn(plan, duracionRealMs);
  const duracionSeg = Math.max(0, Math.round(duracionRealMs / 1000));

  // Fuera de la transaccion: es un id nuevo, no depende de leer nada.
  const idEvento = randomUUID();
  let sesion: SesionEntrenamientoRow | null = null;

  await getDb().withTransactionAsync(async () => {
    await crearEvento({
      id: idEvento,
      usuario_id: usuarioId,
      tipo: 'entrenamiento',
      fecha_hora_inicio: aISOLocal(inicio),
      duracion_estimada_min: minutosDe(duracionRealMs),
      intensidad: intensidadDe(config),
      completado: true,
      respondido: true,
    });

    sesion = await crearSesion({
      id: randomUUID(),
      evento_id: idEvento,
      bloques: config.bloques,
      pasadas: config.pasadas,
      trabajo_seg: config.trabajoSeg,
      descanso_seg: config.descansoSeg,
      descanso_bloque_seg: config.descansoBloqueSeg,
      bloques_completados: progreso.bloquesCompletados,
      pasadas_completadas: progreso.pasadasCompletadas,
      duracion_real_seg: duracionSeg,
      // La distancia llega despues, desde la pantalla de "Listo". Ver
      // actualizarDistancia() en db/queries/sesiones.ts.
      distancia_km: null,
    });
  });

  // Defensivo, no esperable: si la transaccion no tiro, las dos escrituras
  // corrieron. Es lo que le da a TypeScript la certeza de que no es null.
  if (!sesion) {
    throw new Error('La sesion no se pudo guardar.');
  }

  return { eventoId: idEvento, sesion };
}
