// src/db/queries/rutinas.ts
//
// La regla semanal, cruda. Esto lee y escribe filas de `rutina` y nada mas.
//
// Generar las ocurrencias, no duplicarlas y limpiar las futuras al desactivar
// una rutina son politica de agenda, no acceso a datos: viven en
// src/features/agenda/materializar.ts. Aca `activa` es una columna como
// cualquier otra; que apagarla tenga consecuencias sobre `evento` no se decide
// en este archivo.

import { getDb } from '../schema';
import type { Intensidad, RutinaRow, TipoEvento } from '../schema';

const ahora = (): string => new Date().toISOString();

export interface NuevaRutina {
  id: string;
  usuario_id: string;
  /** 0 = domingo, 6 = sabado. Mismo criterio que Date.getDay(). */
  dia_semana: number;
  /** "08:30", hora local, con padding. El CHECK del DDL rechaza "8:30". */
  hora: string;
  tipo: TipoEvento;
  duracion_estimada_min?: number | null;
  intensidad: Intensidad;
  /** Por defecto true: una rutina recien creada arranca generando. */
  activa?: boolean;
  /** null si no tiene rutina de gimnasio fija asociada. */
  rutina_gimnasio_id?: string | null;
  /** null para gimnasio o si no se especifico. Deporte especifico si tipo === 'entrenamiento'. */
  deporte?: string | null;
}

export async function crearRutina(datos: NuevaRutina): Promise<RutinaRow> {
  const t = ahora();
  await getDb().runAsync(
    `INSERT INTO rutina
       (id, usuario_id, dia_semana, hora, tipo, duracion_estimada_min,
        intensidad, activa, rutina_gimnasio_id, deporte, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      datos.id,
      datos.usuario_id,
      datos.dia_semana,
      datos.hora,
      datos.tipo,
      datos.duracion_estimada_min ?? null,
      datos.intensidad,
      datos.activa === false ? 0 : 1,
      datos.rutina_gimnasio_id ?? null,
      datos.deporte ?? null,
      t,
      t,
    ],
  );

  const fila = await obtenerRutina(datos.id);
  if (!fila) throw new Error(`No se pudo leer la rutina recien creada: ${datos.id}`);
  return fila;
}

export async function obtenerRutina(id: string): Promise<RutinaRow | null> {
  return getDb().getFirstAsync<RutinaRow>('SELECT * FROM rutina WHERE id = ?', [id]);
}

/**
 * La fila activa que ya ocupa ese dia para la misma cosa, o null.
 *
 * Con rutina de gimnasio, "la misma cosa" es la rutina en si: un dia tiene a
 * lo sumo una fila activa por rutina_gimnasio_id, sin importar la hora (el
 * indice unico de la migracion 015 lo exige). Sin rutina de gimnasio no hay
 * identidad propia, asi que se compara por tipo y hora.
 */
export async function buscarRutinaActivaDelDia(
  usuarioId: string,
  diaSemana: number,
  tipo: TipoEvento,
  hora: string,
  rutinaGimnasioId: string | null,
  deporte?: string | null,
): Promise<RutinaRow | null> {
  if (rutinaGimnasioId) {
    return getDb().getFirstAsync<RutinaRow>(
      `SELECT * FROM rutina
       WHERE usuario_id = ? AND dia_semana = ? AND rutina_gimnasio_id = ? AND activa = 1`,
      [usuarioId, diaSemana, rutinaGimnasioId],
    );
  }
  if (deporte) {
    return getDb().getFirstAsync<RutinaRow>(
      `SELECT * FROM rutina
       WHERE usuario_id = ? AND dia_semana = ? AND tipo = ? AND hora = ?
         AND deporte = ? AND rutina_gimnasio_id IS NULL AND activa = 1`,
      [usuarioId, diaSemana, tipo, hora, deporte],
    );
  }
  return getDb().getFirstAsync<RutinaRow>(
    `SELECT * FROM rutina
     WHERE usuario_id = ? AND dia_semana = ? AND tipo = ? AND hora = ?
       AND rutina_gimnasio_id IS NULL AND activa = 1`,
    [usuarioId, diaSemana, tipo, hora],
  );
}

/**
 * Ordenadas como se leen en la semana: domingo primero, y dentro del dia por
 * hora. `soloActivas` pega contra idx_rutina_usuario.
 */
export async function listarRutinas(
  usuarioId: string,
  soloActivas: boolean = false,
): Promise<RutinaRow[]> {
  const filtro = soloActivas ? ' AND activa = 1' : '';
  return getDb().getAllAsync<RutinaRow>(
    `SELECT * FROM rutina
     WHERE usuario_id = ?${filtro}
     ORDER BY dia_semana ASC, hora ASC`,
    [usuarioId],
  );
}

export async function actualizarRutina(
  id: string,
  cambios: {
    dia_semana?: number;
    hora?: string;
    tipo?: TipoEvento;
    duracion_estimada_min?: number | null;
    intensidad?: Intensidad;
    activa?: boolean;
    rutina_gimnasio_id?: string | null;
    deporte?: string | null;
  },
): Promise<void> {
  const campos: string[] = [];
  const valores: (string | number | null)[] = [];

  if (cambios.dia_semana !== undefined) {
    campos.push('dia_semana = ?');
    valores.push(cambios.dia_semana);
  }
  if (cambios.hora !== undefined) {
    campos.push('hora = ?');
    valores.push(cambios.hora);
  }
  if (cambios.tipo !== undefined) {
    campos.push('tipo = ?');
    valores.push(cambios.tipo);
  }
  if (cambios.duracion_estimada_min !== undefined) {
    campos.push('duracion_estimada_min = ?');
    valores.push(cambios.duracion_estimada_min);
  }
  if (cambios.intensidad !== undefined) {
    campos.push('intensidad = ?');
    valores.push(cambios.intensidad);
  }
  if (cambios.activa !== undefined) {
    campos.push('activa = ?');
    valores.push(cambios.activa ? 1 : 0);
  }
  if (cambios.rutina_gimnasio_id !== undefined) {
    campos.push('rutina_gimnasio_id = ?');
    valores.push(cambios.rutina_gimnasio_id);
  }
  if (cambios.deporte !== undefined) {
    campos.push('deporte = ?');
    valores.push(cambios.deporte);
  }
  if (campos.length === 0) return;

  await getDb().runAsync(`UPDATE rutina SET ${campos.join(', ')}, updated_at = ? WHERE id = ?`, [
    ...valores,
    ahora(),
    id,
  ]);
}

/**
 * Borra la regla. Los eventos que genero NO se borran: quedan sueltos con
 * rutina_id en NULL por el ON DELETE SET NULL. Para apagar una rutina
 * conservando el historial pero limpiando lo futuro esta desactivarRutina()
 * en features/agenda/materializar.ts.
 */
export async function eliminarRutina(id: string): Promise<void> {
  await getDb().runAsync('DELETE FROM rutina WHERE id = ?', [id]);
}
