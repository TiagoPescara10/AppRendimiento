// src/features/agenda/materializar.ts
//
// Convierte las rutinas activas en eventos reales. Es politica de agenda, no
// acceso a datos: el SQL vive en db/queries/, aca esta el criterio.
//
// Por que materializar en vez de guardar la regla y calcular al vuelo:
// `completado` y el temporizador operan sobre una ocurrencia concreta, y no
// hay donde escribir eso si el evento del martes no existe como fila.
//
// La hora local es el punto delicado de todo el archivo: `evento.fecha` es una
// columna generada con substr(fecha_hora_inicio, 1, 10). Por eso las fechas
// salen de aFechaLocal() y aISOLocal(), de lib/fechas.ts, donde esta explicado
// por que no se pasa por toISOString().

import {
  eliminarEventosFuturosDeRutina,
  fechasMaterializadas,
  eliminarEventosFuturosDeRutinaGimnasio,
  crearEvento,
} from '../../db/queries/eventos';
import {
  actualizarRutina,
  buscarRutinaActivaDelDia,
  crearRutina,
  listarRutinas,
} from '../../db/queries/rutinas';
import {
  desactivarRutinaGimnasio,
} from '../../db/queries/rutinasGimnasio';
import { getDb } from '../../db/schema';
import type { Intensidad, TipoEvento } from '../../db/schema';
import { randomUUID } from '../../db/sync/uuid';
import { aFechaLocal, aISOLocal } from '../../lib/fechas';

/**
 * ISO 8601 con offset local a partir de un dia y un "HH:MM".
 * El Date se construye con el constructor local, no con Date.UTC: el offset
 * que estampa aISOLocal tiene que ser el del instante, y en una zona con
 * horario de verano no es el mismo todo el ano.
 *
 * Los segundos van en cero por construccion, asi que aISOLocal escribe ":00"
 * igual que la version que vivia aca.
 */
function inicioLocalISO(dia: Date, hora: string): string {
  const [hh, mm] = hora.split(':').map(Number);
  return aISOLocal(new Date(dia.getFullYear(), dia.getMonth(), dia.getDate(), hh, mm, 0, 0));
}

/** Medianoche local del dia de `d`. El ancla de la ventana. */
function medianocheLocal(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

/**
 * Genera los eventos de las rutinas activas del usuario (tanto de entrenamiento
 * como de gimnasio), `semanas` semanas hacia adelante desde hoy, y devuelve
 * cuantos inserto.
 *
 * Que NO hace, y son las tres cosas que la vuelven segura de correr en cada
 * arranque:
 *   - no duplica: si ya hay un evento de esa rutina ese dia, lo saltea;
 *   - no toca eventos pasados ni eventos sin rutina_id/rutina_gimnasio_id;
 *   - no genera ocurrencias que ya pasaron, ni siquiera las de hoy mas
 *     temprano: crear a las 20:00 el entrenamiento de las 08:30 de esta manana
 *     solo agrega una fila incompleta que nadie va a marcar.
 *
 * `hoy` existe para las pruebas. Las pantallas la llaman con dos argumentos.
 */
export async function materializarRutinas(
  usuarioId: string,
  semanas: number = 8,
  hoy: Date = new Date(),
): Promise<number> {
  const rutinas = await listarRutinas(usuarioId, true);

  if (rutinas.length === 0) return 0;

  const dias = semanas * 7;
  const inicio = medianocheLocal(hoy);
  const ultimo = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate() + dias - 1);

  let insertados = 0;

  await getDb().withTransactionAsync(async () => {
    // Anti-duplicado unico para todas las rutinas (entrenamiento, partido y gimnasio)
    const yaHayRutina = await fechasMaterializadas(
      rutinas.map((r) => r.id),
      aFechaLocal(inicio),
      aFechaLocal(ultimo),
    );
    const vistosRutina = new Set(yaHayRutina.map((f) => `${f.rutina_id}|${f.fecha}`));

    for (let i = 0; i < dias; i++) {
      const dia = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate() + i);
      const fecha = aFechaLocal(dia);
      const diaSemana = dia.getDay();

      for (const rutina of rutinas) {
        if (rutina.dia_semana !== diaSemana) continue;

        const clave = `${rutina.id}|${fecha}`;
        if (vistosRutina.has(clave)) continue;

        const inicioISO = inicioLocalISO(dia, rutina.hora);
        if (new Date(inicioISO).getTime() < hoy.getTime()) continue;

        await crearEvento({
          id: randomUUID(),
          usuario_id: usuarioId,
          tipo: rutina.tipo,
          fecha_hora_inicio: inicioISO,
          duracion_estimada_min: rutina.duracion_estimada_min,
          intensidad: rutina.intensidad,
          rutina_id: rutina.id,
          rutina_gimnasio_id: rutina.rutina_gimnasio_id ?? null,
          deporte: rutina.deporte ?? null,
        });

        vistosRutina.add(clave);
        insertados++;
      }
    }

    // Sincronizar deporte en eventos futuros no completados si la rutina tiene deporte
    await getDb().runAsync(
      `UPDATE evento
       SET deporte = (SELECT r.deporte FROM rutina r WHERE r.id = evento.rutina_id)
       WHERE rutina_id IS NOT NULL
         AND completado = 0
         AND (SELECT r.deporte FROM rutina r WHERE r.id = evento.rutina_id) IS NOT NULL
         AND (deporte IS NULL OR deporte != (SELECT r.deporte FROM rutina r WHERE r.id = evento.rutina_id))`,
    );
  });

  return insertados;
}

export interface ProgramacionSemanal {
  usuarioId: string;
  tipo: TipoEvento;
  /** "HH:MM", hora local. */
  hora: string;
  duracion_estimada_min: number | null;
  intensidad: Intensidad;
  /** Deporte especifico si tipo === 'entrenamiento'. */
  deporte?: string | null;
  /** Un dia por entrada; con gimnasio, cada dia lleva su rutina (o null). */
  dias: { dia_semana: number; rutina_gimnasio_id: string | null }[];
}

/**
 * Guarda la programacion semanal que arma Nuevo evento y materializa. Devuelve
 * cuantas filas de `rutina` creo y cuantas reutilizo.
 *
 * Es idempotente a proposito: si el dia ya tiene esa rutina activa, actualiza
 * la fila existente en vez de insertar otra. Antes se insertaba siempre, y
 * volver a asignar la misma rutina de gimnasio al lunes dejaba dos filas, dos
 * eventos por fecha y el dia repetido en los badges de Entrenamientos.
 */
export async function programarRutinaSemanal(
  datos: ProgramacionSemanal,
  hoy: Date = new Date(),
): Promise<{ creadas: number; actualizadas: number }> {
  const alMinuto = new Date(hoy);
  alMinuto.setSeconds(0, 0);
  const corte = aISOLocal(alMinuto);

  // Un mismo dia repetido en la entrada cuenta una sola vez.
  const porDia = new Map(datos.dias.map((d) => [d.dia_semana, d.rutina_gimnasio_id]));

  let creadas = 0;
  let actualizadas = 0;

  await getDb().withTransactionAsync(async () => {
    for (const [dia, rgId] of porDia) {
      const existente = await buscarRutinaActivaDelDia(
        datos.usuarioId,
        dia,
        datos.tipo,
        datos.hora,
        rgId,
        datos.deporte,
      );

      if (!existente) {
        await crearRutina({
          id: randomUUID(),
          usuario_id: datos.usuarioId,
          dia_semana: dia,
          hora: datos.hora,
          tipo: datos.tipo,
          duracion_estimada_min: datos.duracion_estimada_min,
          intensidad: datos.intensidad,
          rutina_gimnasio_id: rgId,
          deporte: datos.deporte ?? null,
        });
        creadas++;
        continue;
      }

      const cambio =
        existente.hora !== datos.hora ||
        existente.duracion_estimada_min !== datos.duracion_estimada_min ||
        existente.intensidad !== datos.intensidad ||
        existente.tipo !== datos.tipo ||
        existente.deporte !== (datos.deporte ?? null);

      if (cambio) {
        await actualizarRutina(existente.id, {
          hora: datos.hora,
          duracion_estimada_min: datos.duracion_estimada_min,
          intensidad: datos.intensidad,
          tipo: datos.tipo,
          deporte: datos.deporte ?? null,
        });
        // Los eventos futuros ya generados tienen la hora vieja: se borran y
        // materializarRutinas los vuelve a crear con la nueva.
        await eliminarEventosFuturosDeRutina(existente.id, corte);
      }
      actualizadas++;
    }
  });

  await materializarRutinas(datos.usuarioId, 8, hoy);
  return { creadas, actualizadas };
}

/**
 * Apaga la rutina y limpia sus ocurrencias futuras. Devuelve cuantas borro.
 */
export async function desactivarRutina(
  rutinaId: string,
  hoy: Date = new Date(),
): Promise<number> {
  const alMinuto = new Date(hoy);
  alMinuto.setSeconds(0, 0);
  const corte = aISOLocal(alMinuto);

  let borrados = 0;
  await getDb().withTransactionAsync(async () => {
    await actualizarRutina(rutinaId, { activa: false });
    borrados = await eliminarEventosFuturosDeRutina(rutinaId, corte);
  });

  return borrados;
}

/**
 * Apaga la rutina de gimnasio y limpia sus ocurrencias futuras. Devuelve cuantas borro.
 */
export async function desactivarRutinaGimnasioYLimpiar(
  rutinaGimnasioId: string,
  hoy: Date = new Date(),
): Promise<number> {
  const alMinuto = new Date(hoy);
  alMinuto.setSeconds(0, 0);
  const corte = aISOLocal(alMinuto);

  let borrados = 0;
  await getDb().withTransactionAsync(async () => {
    await desactivarRutinaGimnasio(rutinaGimnasioId);
    borrados = await eliminarEventosFuturosDeRutinaGimnasio(rutinaGimnasioId, corte);
  });

  return borrados;
}
