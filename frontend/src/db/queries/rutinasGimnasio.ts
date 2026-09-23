// src/db/queries/rutinasGimnasio.ts
//
// Acceso a datos para rutinas definidas de gimnasio.
// Lee y escribe filas de rutina_gimnasio y rutina_gimnasio_ejercicio.
//
// Desde la migracion 014 `rutina_gimnasio` es un catalogo puro (nombre +
// ejercicios): no tiene dias ni hora propios. La programacion semanal vive
// unicamente en la tabla `rutina` (una fila por dia, apuntando con
// rutina_gimnasio_id). Toda lectura de dias/hora de una rutina de gimnasio
// pasa por `diasAsignados()`; no hay ningun campo de dias que leer de la
// rutina de gimnasio en si.
//
// Tambien lee la biblioteca de rutinas predefinidas (migracion 017), que es
// de solo lectura: aca no hay ninguna query que la edite ni la borre, solo
// `copiarRutinaPredefinida()`, que la duplica a rutina_gimnasio.

import { getDb } from '../schema';
import type {
  RutinaGimnasioRow,
  RutinaPredefinidaRow,
  EjercicioRow,
  GrupoMuscular,
} from '../schema';
import { randomUUID } from '../sync/uuid';

const ahora = (): string => new Date().toISOString();

export interface EjercicioEnRutinaGimnasio extends EjercicioRow {
  orden: number;
  relacion_id: string;
}

export interface RutinaGimnasioConDetalle extends RutinaGimnasioRow {
  ejercicios: EjercicioEnRutinaGimnasio[];
  /**
   * Dias de la semana en que esta rutina esta programada, leidos de la tabla
   * `rutina`. Siempre presente: vacio si la rutina esta en el catalogo pero no
   * asignada a ningun dia. No es opcional a proposito, para que ninguna
   * pantalla pueda leer `undefined` y creer que la rutina no tiene dias.
   */
  dias: number[];
  /** Hora del primer dia asignado, o null si no hay ninguno. */
  hora: string | null;
  duracion_estimada_min: number | null;
}

/**
 * Lee la programacion semanal de una rutina de gimnasio desde la tabla
 * `rutina`, que es la unica fuente de verdad desde la migracion 013/014.
 */
async function diasAsignados(
  rutinaGimnasioId: string,
): Promise<Pick<RutinaGimnasioConDetalle, 'dias' | 'hora' | 'duracion_estimada_min'>> {
  const db = getDb();
  const asignaciones = await db.getAllAsync<{
    dia_semana: number;
    hora: string;
    duracion_estimada_min: number | null;
  }>(
    `SELECT dia_semana, hora, duracion_estimada_min
     FROM rutina
     WHERE rutina_gimnasio_id = ? AND activa = 1
     ORDER BY dia_semana ASC`,
    [rutinaGimnasioId],
  );

  // Set y no map directo: con dos filas activas para el mismo dia (datos de
  // antes de la migracion 015) la pantalla recibia [1, 1] y React rompia por
  // keys repetidas al dibujar los badges.
  return {
    dias: [...new Set(asignaciones.map((a) => a.dia_semana))],
    hora: asignaciones[0]?.hora ?? null,
    duracion_estimada_min: asignaciones[0]?.duracion_estimada_min ?? null,
  };
}

export interface NuevaRutinaGimnasio {
  id: string;
  usuario_id: string;
  nombre: string;
  activa?: boolean;
  ejercicio_ids: string[];
}

export async function crearRutinaGimnasio(
  datos: NuevaRutinaGimnasio,
): Promise<RutinaGimnasioConDetalle> {
  const t = ahora();
  const db = getDb();

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO rutina_gimnasio
         (id, usuario_id, nombre, activa, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        datos.id,
        datos.usuario_id,
        datos.nombre.trim(),
        datos.activa === false ? 0 : 1,
        t,
        t,
      ],
    );

    for (let i = 0; i < datos.ejercicio_ids.length; i++) {
      await db.runAsync(
        `INSERT INTO rutina_gimnasio_ejercicio
           (id, rutina_gimnasio_id, ejercicio_id, orden, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [randomUUID(), datos.id, datos.ejercicio_ids[i], i, t, t],
      );
    }
  });

  const res = await obtenerRutinaGimnasio(datos.id);
  if (!res) throw new Error(`No se pudo leer la rutina de gimnasio creada: ${datos.id}`);
  return res;
}

export async function obtenerRutinaGimnasio(
  id: string,
): Promise<RutinaGimnasioConDetalle | null> {
  const db = getDb();
  const fila = await db.getFirstAsync<RutinaGimnasioRow>(
    'SELECT * FROM rutina_gimnasio WHERE id = ?',
    [id],
  );
  if (!fila) return null;

  const ejercicios = await db.getAllAsync<EjercicioEnRutinaGimnasio>(
    `SELECT e.*, rge.orden, rge.id AS relacion_id
     FROM rutina_gimnasio_ejercicio rge
     JOIN ejercicio e ON e.id = rge.ejercicio_id
     WHERE rge.rutina_gimnasio_id = ?
     ORDER BY rge.orden ASC`,
    [id],
  );

  return {
    ...fila,
    ejercicios,
    ...(await diasAsignados(id)),
  };
}

export async function listarRutinasGimnasio(
  usuarioId: string,
  soloActivas = true,
): Promise<RutinaGimnasioConDetalle[]> {
  const db = getDb();
  const sql = soloActivas
    ? 'SELECT * FROM rutina_gimnasio WHERE usuario_id = ? AND activa = 1 ORDER BY nombre ASC'
    : 'SELECT * FROM rutina_gimnasio WHERE usuario_id = ? ORDER BY nombre ASC';

  const filas = await db.getAllAsync<RutinaGimnasioRow>(sql, [usuarioId]);
  const resultado: RutinaGimnasioConDetalle[] = [];

  for (const f of filas) {
    // obtenerRutinaGimnasio ya resuelve dias/hora contra la tabla rutina.
    const detalle = await obtenerRutinaGimnasio(f.id);
    if (detalle) resultado.push(detalle);
  }

  return resultado;
}

export async function obtenerRutinasGimnasioDelDia(
  usuarioId: string,
  diaSemana: number,
): Promise<RutinaGimnasioConDetalle[]> {
  const db = getDb();
  // Consulta directa a traves de la tabla rutina como fuente de verdad
  const filas = await db.getAllAsync<RutinaGimnasioRow & { hora: string; duracion_estimada_min: number | null }>(
    `SELECT DISTINCT rg.*, r.hora, r.duracion_estimada_min
     FROM rutina_gimnasio rg
     JOIN rutina r ON r.rutina_gimnasio_id = rg.id
     WHERE r.usuario_id = ? AND r.dia_semana = ? AND r.activa = 1 AND rg.activa = 1
     ORDER BY r.hora ASC`,
    [usuarioId, diaSemana],
  );

  const resultado: RutinaGimnasioConDetalle[] = [];
  for (const f of filas) {
    const detalle = await obtenerRutinaGimnasio(f.id);
    if (detalle) {
      detalle.hora = f.hora;
      detalle.duracion_estimada_min = f.duracion_estimada_min;
      resultado.push(detalle);
    }
  }

  return resultado;
}

export async function desactivarRutinaGimnasio(id: string): Promise<void> {
  const t = ahora();
  const db = getDb();
  await db.runAsync(
    'UPDATE rutina_gimnasio SET activa = 0, updated_at = ? WHERE id = ?',
    [t, id],
  );
  await db.runAsync(
    'UPDATE rutina SET activa = 0, updated_at = ? WHERE rutina_gimnasio_id = ?',
    [t, id],
  );
}

export async function activarRutinaGimnasio(id: string): Promise<void> {
  const t = ahora();
  const db = getDb();
  await db.runAsync(
    'UPDATE rutina_gimnasio SET activa = 1, updated_at = ? WHERE id = ?',
    [t, id],
  );
  await db.runAsync(
    'UPDATE rutina SET activa = 1, updated_at = ? WHERE rutina_gimnasio_id = ?',
    [t, id],
  );
}

export async function eliminarRutinaGimnasio(id: string): Promise<void> {
  const db = getDb();
  await db.runAsync('DELETE FROM rutina WHERE rutina_gimnasio_id = ?', [id]);
  await db.runAsync('DELETE FROM rutina_gimnasio WHERE id = ?', [id]);
}

export interface ActualizarRutinaGimnasio {
  id: string;
  nombre: string;
  ejercicio_ids: string[];
}

export async function actualizarRutinaGimnasio(
  datos: ActualizarRutinaGimnasio,
): Promise<RutinaGimnasioConDetalle> {
  const t = ahora();
  const db = getDb();

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `UPDATE rutina_gimnasio
       SET nombre = ?, updated_at = ?
       WHERE id = ?`,
      [datos.nombre.trim(), t, datos.id],
    );

    await db.runAsync(
      'DELETE FROM rutina_gimnasio_ejercicio WHERE rutina_gimnasio_id = ?',
      [datos.id],
    );
    for (let i = 0; i < datos.ejercicio_ids.length; i++) {
      await db.runAsync(
        `INSERT INTO rutina_gimnasio_ejercicio
           (id, rutina_gimnasio_id, ejercicio_id, orden, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [randomUUID(), datos.id, datos.ejercicio_ids[i], i, t, t],
      );
    }
  });

  const res = await obtenerRutinaGimnasio(datos.id);
  if (!res) throw new Error(`No se pudo leer la rutina de gimnasio actualizada: ${datos.id}`);
  return res;
}

// ---------------------------------------------------------------------------
// Rutinas predefinidas (solo lectura)
// ---------------------------------------------------------------------------

export interface EjercicioEnRutinaPredefinida extends EjercicioRow {
  orden: number;
}

export interface RutinaPredefinidaConEjercicios extends RutinaPredefinidaRow {
  ejercicios: EjercicioEnRutinaPredefinida[];
}

async function ejerciciosDePredefinida(
  rutinaPredefinidaId: string,
): Promise<EjercicioEnRutinaPredefinida[]> {
  return getDb().getAllAsync<EjercicioEnRutinaPredefinida>(
    `SELECT e.*, rpe.orden
     FROM rutina_predefinida_ejercicio rpe
     JOIN ejercicio e ON e.id = rpe.ejercicio_id
     WHERE rpe.rutina_predefinida_id = ?
     ORDER BY rpe.orden ASC`,
    [rutinaPredefinidaId],
  );
}

/** Toda la biblioteca, en el orden de la semilla, con sus ejercicios. */
export async function listarRutinasPredefinidas(): Promise<RutinaPredefinidaConEjercicios[]> {
  const filas = await getDb().getAllAsync<RutinaPredefinidaRow>(
    'SELECT * FROM rutina_predefinida ORDER BY orden ASC',
  );
  const resultado: RutinaPredefinidaConEjercicios[] = [];
  for (const f of filas) {
    resultado.push({ ...f, ejercicios: await ejerciciosDePredefinida(f.id) });
  }
  return resultado;
}

export async function obtenerRutinaPredefinida(
  id: string,
): Promise<RutinaPredefinidaConEjercicios | null> {
  const fila = await getDb().getFirstAsync<RutinaPredefinidaRow>(
    'SELECT * FROM rutina_predefinida WHERE id = ?',
    [id],
  );
  if (!fila) return null;
  return { ...fila, ejercicios: await ejerciciosDePredefinida(id) };
}

/**
 * Copia una rutina predefinida a la coleccion del usuario: una fila nueva en
 * rutina_gimnasio con el mismo nombre y los mismos ejercicios en el mismo
 * orden. La copia es independiente: no guarda ninguna referencia a la
 * original, asi que editarla o borrarla no toca la biblioteca, y copiar la
 * misma dos veces da dos rutinas distintas.
 */
export async function copiarRutinaPredefinida(
  rutinaPredefinidaId: string,
  usuarioId: string,
): Promise<RutinaGimnasioConDetalle> {
  const original = await obtenerRutinaPredefinida(rutinaPredefinidaId);
  if (!original) {
    throw new Error(`No existe la rutina predefinida: ${rutinaPredefinidaId}`);
  }

  return crearRutinaGimnasio({
    id: randomUUID(),
    usuario_id: usuarioId,
    nombre: original.nombre,
    ejercicio_ids: original.ejercicios.map((e) => e.id),
  });
}
