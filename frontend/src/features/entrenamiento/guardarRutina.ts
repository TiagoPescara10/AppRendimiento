// src/features/entrenamiento/guardarRutina.ts
//
// Guarda una sesion de gimnasio terminada: asocia o crea el evento, la sesion
// con modo 'rutina' y todas sus series. Corre dentro de una transaccion.

import {
  crearEvento,
  responderEvento,
  actualizarEvento,
  buscarEventoDelDiaPorRutinaGimnasio,
} from '../../db/queries/eventos';
import { crearSesion, agregarSeries } from '../../db/queries/sesiones';
import { getDb } from '../../db/schema';
import type { Intensidad, SesionEntrenamientoRow } from '../../db/schema';
import { randomUUID } from '../../db/sync/uuid';
import { aFechaLocal, aISOLocal } from '../../lib/fechas';

export interface SerieParaGuardar {
  ejercicioId: string;
  repeticiones: number;
  pesoKg: number | null;
}

export interface DatosRutinaTerminada {
  usuarioId: string;
  inicio: Date;
  duracionRealSeg?: number | null;
  series: SerieParaGuardar[];
  rutinaGimnasioId?: string | null;
  eventoIdExistente?: string | null;
  nombreRutina?: string | null;
  intensidad?: Intensidad;
}

export interface ResultadoGuardadoRutina {
  eventoId: string;
  sesion: SesionEntrenamientoRow;
}

export async function guardarRutinaTerminada(
  datos: DatosRutinaTerminada,
): Promise<ResultadoGuardadoRutina> {
  const {
    usuarioId,
    inicio,
    duracionRealSeg = null,
    series,
    rutinaGimnasioId = null,
    eventoIdExistente = null,
    nombreRutina = null,
    intensidad = 'media',
  } = datos;

  // Si no se proveyo duracion, calcular el tiempo transcurrido desde el inicio (al menos 1 seg)
  const duracionSeg =
    duracionRealSeg != null && duracionRealSeg > 0
      ? duracionRealSeg
      : Math.max(1, Math.floor((Date.now() - inicio.getTime()) / 1000));

  let idEvento = eventoIdExistente;
  const idSesion = randomUUID();
  let sesion: SesionEntrenamientoRow | null = null;

  const minutos = Math.max(1, Math.round(duracionSeg / 60));

  await getDb().withTransactionAsync(async () => {
    if (idEvento) {
      // 1. Ya teniamos el ID del evento de la agenda: responderlo, completarlo
      // y asegurar tipo gimnasio para que no quede con etiqueta deportiva.
      await responderEvento(idEvento, true);
      await actualizarEvento(idEvento, {
        duracion_estimada_min: minutos,
        tipo: 'gimnasio',
        rutina_gimnasio_id: rutinaGimnasioId ?? undefined,
        notas: nombreRutina ?? undefined,
      });
    } else if (rutinaGimnasioId) {
      // 2. Buscar si ya habia un evento materializado para esta rutina hoy
      const fechaHoy = aFechaLocal(inicio);
      const eventoHoy = await buscarEventoDelDiaPorRutinaGimnasio(
        usuarioId,
        rutinaGimnasioId,
        fechaHoy,
      );

      // Reutilizar el evento programado de la agenda solo si aun no estaba completado
      if (eventoHoy && eventoHoy.completado === 0) {
        idEvento = eventoHoy.id;
        await responderEvento(idEvento, true);
        await actualizarEvento(idEvento, {
          duracion_estimada_min: minutos,
          tipo: 'gimnasio',
        });
      } else {
        // Se ejecuto un dia que no tocaba o el evento de hoy ya fue completado:
        // crear evento nuevo completado y respondido
        idEvento = randomUUID();
        await crearEvento({
          id: idEvento,
          usuario_id: usuarioId,
          tipo: 'gimnasio',
          fecha_hora_inicio: aISOLocal(inicio),
          duracion_estimada_min: minutos,
          intensidad,
          completado: true,
          respondido: true,
          notas: nombreRutina ?? 'Gimnasio',
          rutina_gimnasio_id: rutinaGimnasioId,
          modo_entrenamiento: 'rutina',
        });
      }
    } else {
      // 3. Sesion libre sin rutina de gimnasio
      idEvento = randomUUID();
      await crearEvento({
        id: idEvento,
        usuario_id: usuarioId,
        tipo: 'gimnasio',
        fecha_hora_inicio: aISOLocal(inicio),
        duracion_estimada_min: minutos,
        intensidad,
        completado: true,
        respondido: true,
        notas: nombreRutina ?? 'Gimnasio',
        modo_entrenamiento: 'rutina',
      });
    }

    // Si el evento ya tenia una sesion previa (ej. reintento o edicion),
    // eliminarla para respetar la restriccion UNIQUE sobre evento_id.
    // ON DELETE CASCADE elimina en cascada las filas de serie correspondientes.
    await getDb().runAsync('DELETE FROM sesion_entrenamiento WHERE evento_id = ?', [idEvento]);

    sesion = await crearSesion({
      id: idSesion,
      evento_id: idEvento,
      modo: 'rutina',
      rutina_gimnasio_id: rutinaGimnasioId,
      duracion_real_seg: duracionSeg,
    });

    const seriesFilas = series.map((s, index) => ({
      id: randomUUID(),
      sesion_id: idSesion,
      ejercicio_id: s.ejercicioId,
      orden: index,
      repeticiones: s.repeticiones,
      peso_kg: s.pesoKg,
    }));

    await agregarSeries(seriesFilas);
  });

  if (!sesion || !idEvento) {
    throw new Error('La sesion de rutina no se pudo guardar.');
  }

  return { eventoId: idEvento, sesion };
}
