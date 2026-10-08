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
  actualizarEvento,
  eliminarEventosFuturosDeRutina,
  eventoDeHoySinResponder,
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
  copiarRutinaPredefinidaSinTransaccion,
  desactivarRutinaGimnasio,
} from '../../db/queries/rutinasGimnasio';
import { getDb } from '../../db/schema';
import type { Intensidad, TipoEvento } from '../../db/schema';
import { randomUUID } from '../../db/sync/uuid';
import { aFechaLocal, aISOLocal } from '../../lib/fechas';
import type { DestinoRutina, PlanSemana } from '../entrenamiento/miSemana';

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

/** El instante desde el que una ocurrencia cuenta como futura: hoy, al minuto. */
function corteFuturo(hoy: Date): string {
  const alMinuto = new Date(hoy);
  alMinuto.setSeconds(0, 0);
  return aISOLocal(alMinuto);
}

/**
 * Apaga la rutina y borra sus ocurrencias desde `corte`; las pasadas quedan.
 * Sin transaccion propia: la ponen desactivarRutina() y guardarMiSemana().
 */
async function apagarRutinaYLimpiar(rutinaId: string, corte: string): Promise<number> {
  await actualizarRutina(rutinaId, { activa: false });
  return eliminarEventosFuturosDeRutina(rutinaId, corte);
}

/**
 * Apaga la rutina y limpia sus ocurrencias futuras. Devuelve cuantas borro.
 */
export async function desactivarRutina(
  rutinaId: string,
  hoy: Date = new Date(),
): Promise<number> {
  const corte = corteFuturo(hoy);

  let borrados = 0;
  await getDb().withTransactionAsync(async () => {
    borrados = await apagarRutinaYLimpiar(rutinaId, corte);
  });

  return borrados;
}

/**
 * Escribe el plan del asistente Mi semana (features/entrenamiento/miSemana.ts)
 * en una sola transaccion y despues materializa:
 *   1. copia cada predefinida del plan a Mis rutinas, una vez;
 *   2. desactiva las filas que sobran, borrando sus ocurrencias futuras y
 *      nunca las pasadas (lo mismo que desactivarRutina). Va antes que las
 *      altas: asi un dia nunca tiene dos filas activas con la misma rutina,
 *      que el indice unico de la migracion 015 rechazaria;
 *   3. actualiza las filas que cambiaron y borra sus ocurrencias futuras,
 *      que materializarRutinas vuelve a crear con la hora y la rutina nuevas.
 *      La de hoy que ya empezo no es futura, pero si el usuario todavia no
 *      contesto si fue, se corrige en el lugar: si no, editar un miercoles a
 *      la noche dejaba el miercoles de hoy con la rutina vieja en la agenda.
 *      Si ya contesto, o hay una sesion, queda como estaba;
 *   4. crea las filas nuevas.
 *
 * Con un plan sin cambios no escribe nada. Devuelve cuantas rutinas copio.
 */
export async function guardarMiSemana(
  usuarioId: string,
  plan: PlanSemana,
  hoy: Date = new Date(),
): Promise<{ copiadas: number }> {
  if (plan.sinCambios) return { copiadas: 0 };
  const corte = corteFuturo(hoy);

  await getDb().withTransactionAsync(async () => {
    const copias = new Map<string, string>();
    for (const predefinidaId of plan.copiar) {
      copias.set(predefinidaId, await copiarRutinaPredefinidaSinTransaccion(predefinidaId, usuarioId));
    }
    const resolver = (destino: DestinoRutina): string => {
      if (destino.tipo === 'existente') return destino.id;
      const id = copias.get(destino.predefinidaId);
      if (!id) throw new Error(`El plan usa una predefinida sin copiar: ${destino.predefinidaId}`);
      return id;
    };

    for (const id of plan.desactivar) {
      await apagarRutinaYLimpiar(id, corte);
    }

    for (const a of plan.actualizar) {
      await actualizarRutina(a.id, {
        hora: a.hora,
        duracion_estimada_min: a.duracion_estimada_min,
        rutina_gimnasio_id: resolver(a.rutina),
      });
      await eliminarEventosFuturosDeRutina(a.id, corte);

      const deHoy = await eventoDeHoySinResponder(a.id, aFechaLocal(hoy), corte);
      if (deHoy) {
        await actualizarEvento(deHoy.id, {
          fecha_hora_inicio: inicioLocalISO(hoy, a.hora),
          duracion_estimada_min: a.duracion_estimada_min,
          rutina_gimnasio_id: resolver(a.rutina),
        });
      }
    }

    for (const c of plan.crear) {
      await crearRutina({
        id: randomUUID(),
        usuario_id: usuarioId,
        dia_semana: c.dia_semana,
        hora: c.hora,
        tipo: 'gimnasio',
        duracion_estimada_min: c.duracion_estimada_min,
        intensidad: 'media',
        rutina_gimnasio_id: resolver(c.rutina),
      });
    }
  });

  await materializarRutinas(usuarioId, 8, hoy);
  return { copiadas: plan.copiar.length };
}

/**
 * Apaga la rutina de gimnasio y limpia sus ocurrencias futuras. Devuelve cuantas borro.
 */
export async function desactivarRutinaGimnasioYLimpiar(
  rutinaGimnasioId: string,
  hoy: Date = new Date(),
): Promise<number> {
  const corte = corteFuturo(hoy);

  let borrados = 0;
  await getDb().withTransactionAsync(async () => {
    await desactivarRutinaGimnasio(rutinaGimnasioId);
    borrados = await eliminarEventosFuturosDeRutinaGimnasio(rutinaGimnasioId, corte);
  });

  return borrados;
}
