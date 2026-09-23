// src/features/agenda/rutinas.ts
//
// Agrupacion y helpers para las rutinas de la app.
// Cada dia de una rutina semanal se guarda en una fila propia de la tabla
// `rutina`. Este modulo las agrupa por sus caracteristicas compartidas
// (tipo, hora, duracion, intensidad) para mostrarlas unificadas.

import type { RutinaRow, TipoEvento, Intensidad } from '../../db/schema';

export interface RutinaAgrupada {
  ids: string[];
  tipo: TipoEvento;
  deporte: string | null;
  hora: string;
  duracion_estimada_min: number | null;
  intensidad: Intensidad;
  dias: number[];
}

export const DIAS_SEMANA = ['D', 'L', 'M', 'Mi', 'J', 'V', 'S'];

/**
 * Agrupa filas individuales de la tabla `rutina` por tipo, deporte, hora,
 * duracion e intensidad.
 */
export function agruparRutinas(rutinas: RutinaRow[]): RutinaAgrupada[] {
  const mapa = new Map<string, RutinaAgrupada>();

  for (const r of rutinas) {
    const clave = `${r.tipo}|${r.deporte ?? ''}|${r.hora}|${r.duracion_estimada_min ?? ''}|${r.intensidad}`;
    const existente = mapa.get(clave);

    if (existente) {
      existente.ids.push(r.id);
      if (!existente.dias.includes(r.dia_semana)) {
        existente.dias.push(r.dia_semana);
        existente.dias.sort((a, b) => a - b);
      }
    } else {
      mapa.set(clave, {
        ids: [r.id],
        tipo: r.tipo,
        deporte: r.deporte ?? null,
        hora: r.hora,
        duracion_estimada_min: r.duracion_estimada_min ?? null,
        intensidad: r.intensidad,
        dias: [r.dia_semana],
      });
    }
  }

  return Array.from(mapa.values()).sort((a, b) => a.hora.localeCompare(b.hora));
}

/**
 * Muestra la hora sin cero inicial (ej: "8:30" en lugar de "08:30").
 */
export function formatearHoraCorta(hora: string): string {
  return hora.replace(/^0/, '');
}

export interface RutinaGimnasioAgrupada {
  ids: string[];
  rutinaGimnasioId: string | null;
  nombre: string;
  hora: string;
  duracion_estimada_min: number | null;
  intensidad: Intensidad;
  dias: number[];
  ejerciciosCount: number;
}

/**
 * Agrupa las filas de la tabla rutina con tipo 'gimnasio' asociandolas
 * a su definicion de rutina de gimnasio correspondiente o marcandolas
 * como gimnasio libre si no tienen rutina fija.
 */
export function agruparRutinasGimnasio(
  rutinasGim: RutinaRow[],
  plantillas: { id: string; nombre: string; ejercicios: unknown[] }[],
): RutinaGimnasioAgrupada[] {
  const mapaPlantillas = new Map<string, typeof plantillas[0]>();
  for (const p of plantillas) {
    mapaPlantillas.set(p.id, p);
  }

  const mapa = new Map<string, RutinaGimnasioAgrupada>();

  for (const r of rutinasGim) {
    const clave = `${r.rutina_gimnasio_id ?? 'libre'}|${r.hora}|${r.duracion_estimada_min ?? ''}`;
    const existente = mapa.get(clave);

    if (existente) {
      existente.ids.push(r.id);
      if (!existente.dias.includes(r.dia_semana)) {
        existente.dias.push(r.dia_semana);
        existente.dias.sort((a, b) => a - b);
      }
    } else {
      const plantilla = r.rutina_gimnasio_id ? mapaPlantillas.get(r.rutina_gimnasio_id) : null;
      const nombre = plantilla
        ? plantilla.nombre
        : 'Gimnasio libre (sin rutina fija)';

      mapa.set(clave, {
        ids: [r.id],
        rutinaGimnasioId: r.rutina_gimnasio_id ?? null,
        nombre,
        hora: r.hora,
        duracion_estimada_min: r.duracion_estimada_min ?? null,
        intensidad: r.intensidad,
        dias: [r.dia_semana],
        ejerciciosCount: plantilla ? plantilla.ejercicios.length : 0,
      });
    }
  }

  // Sumar plantillas de catalogo que todavia no fueron asignadas a ningun dia
  const asignadasIds = new Set(
    rutinasGim
      .map((r) => r.rutina_gimnasio_id)
      .filter((id): id is string => Boolean(id)),
  );

  for (const p of plantillas) {
    if (!asignadasIds.has(p.id)) {
      mapa.set(`plantilla_${p.id}`, {
        ids: [],
        rutinaGimnasioId: p.id,
        nombre: p.nombre,
        hora: '',
        duracion_estimada_min: null,
        intensidad: 'media',
        dias: [],
        ejerciciosCount: p.ejercicios.length,
      });
    }
  }

  return Array.from(mapa.values()).sort((a, b) => (a.hora || '99:99').localeCompare(b.hora || '99:99'));
}
