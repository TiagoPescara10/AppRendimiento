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
}

export async function crearRutina(datos: NuevaRutina): Promise<RutinaRow> {
  const t = ahora();
  await getDb().runAsync(
    `INSERT INTO rutina
       (id, usuario_id, dia_semana, hora, tipo, duracion_estimada_min,
        intensidad, activa, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      datos.id,
      datos.usuario_id,
      datos.dia_semana,
      datos.hora,
      datos.tipo,
      datos.duracion_estimada_min ?? null,
      datos.intensidad,
      datos.activa === false ? 0 : 1,
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
