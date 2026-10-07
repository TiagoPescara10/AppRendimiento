// src/features/entrenamiento/miSemana.ts
//
// La logica del asistente "Arma tu semana de gimnasio", sin base de datos.
//
// El asistente no tiene modelo propio: por dentro sigue habiendo una fila de
// `rutina` (tipo gimnasio) por dia, apuntando a una rutina_gimnasio. Este
// modulo traduce entre las dos cosas:
//   - estadoDesdeRutinas(): las filas activas -> lo que muestra el asistente;
//   - planDesdeAsistente(): lo que eligio el usuario -> que filas crear,
//     actualizar y desactivar. Es un diff: si nada cambio, el plan esta vacio.
//
// Puro a proposito: no importa nada de db/ (ni tipos), asi se prueba con tsc
// y node solos (scripts/probar-mi-semana.mjs). Las filas se describen con
// interfaces estructurales que RutinaRow cumple.

/** Lunes primero, con el criterio de Date.getDay() (0 = domingo). */
export const ORDEN_SEMANA = [1, 2, 3, 4, 5, 6, 0] as const;

export const NOMBRE_DIA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
export const NOMBRE_DIA_CORTO = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
export const LETRA_DIA = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];

export const DURACIONES_SEMANA = [45, 60, 75, 90] as const;
export const DURACION_POR_DEFECTO = 60;
export const HORA_POR_DEFECTO = '19:00';

/** Ids de la semilla (src/db/seeds/rutinas-predefinidas-base.ts). */
export const PREDEF = {
  fullBody: 'predef-full-body-principiante',
  torsoPiernaA: 'predef-torso-pierna-a',
  torsoPiernaB: 'predef-torso-pierna-b',
  push: 'predef-push',
  pull: 'predef-pull',
  legs: 'predef-legs',
} as const;

/** Lo que el usuario eligio para un dia: una rutina lista o una propia. */
export interface RefRutina {
  origen: 'predefinida' | 'propia';
  id: string;
}

export interface EstadoAsistente {
  /** Siempre en ORDEN_SEMANA y sin repetidos. */
  dias: number[];
  rutinaPorDia: Partial<Record<number, RefRutina>>;
  horaUnica: string;
  distintaPorDia: boolean;
  /** Solo se lee con distintaPorDia; si falta un dia, vale horaUnica. */
  horaPorDia: Partial<Record<number, string>>;
  duracionMin: number;
}

/** Lo que hace falta de una fila de `rutina`. RutinaRow lo cumple. */
export interface FilaRutinaSemana {
  id: string;
  dia_semana: number;
  hora: string;
  tipo: string;
  duracion_estimada_min: number | null;
  rutina_gimnasio_id: string | null;
  activa: number;
}

export interface RutinaConNombre {
  id: string;
  nombre: string;
}

/** A que rutina_gimnasio apunta una fila: una que ya existe o una copia por hacer. */
export type DestinoRutina =
  | { tipo: 'existente'; id: string }
  | { tipo: 'copia'; predefinidaId: string };

export interface PlanSemana {
  /** Predefinidas a copiar a Mis rutinas, una vez cada una. */
  copiar: string[];
  crear: { dia_semana: number; hora: string; duracion_estimada_min: number; rutina: DestinoRutina }[];
  /** Filas que siguen pero cambian. Sus ocurrencias futuras se regeneran. */
  actualizar: { id: string; hora: string; duracion_estimada_min: number; rutina: DestinoRutina }[];
  desactivar: string[];
  sinCambios: boolean;
}

export function ordenarDias(dias: Iterable<number>): number[] {
  const set = new Set(dias);
  return ORDEN_SEMANA.filter((d) => set.has(d));
}

export function estadoVacio(): EstadoAsistente {
  return {
    dias: [],
    rutinaPorDia: {},
    horaUnica: HORA_POR_DEFECTO,
    distintaPorDia: false,
    horaPorDia: {},
    duracionMin: DURACION_POR_DEFECTO,
  };
}

export function horaDelDia(estado: EstadoAsistente, dia: number): string {
  if (!estado.distintaPorDia) return estado.horaUnica;
  return estado.horaPorDia[dia] ?? estado.horaUnica;
}

/** Los dias elegidos que todavia no tienen rutina. */
export function diasSinRutina(estado: EstadoAsistente): number[] {
  return estado.dias.filter((d) => !estado.rutinaPorDia[d]);
}

// ---------------------------------------------------------------------------
// Sugerencias
// ---------------------------------------------------------------------------

export interface Sugerencia {
  /** dia -> id de rutina predefinida. */
  porDia: Record<number, string>;
  /** Por que esa combinacion, para mostrar debajo del boton. */
  motivo: string;
}

/**
 * La rutina lista que conviene para cada dia segun cuantos dias va:
 *   1 a 3 -> Full body principiante en todos;
 *   4     -> Torso/Pierna A y B alternados;
 *   5 o 6 -> Push, Pull y Legs en orden, y se repite.
 * Con 7 tambien Push, Pull y Legs: el asistente lo deja elegir y repartir en
 * tres es lo que mejor aguanta una semana entera.
 */
export function sugerirRutinas(dias: number[]): Sugerencia {
  const orden = ordenarDias(dias);
  const n = orden.length;
  const porDia: Record<number, string> = {};
  if (n === 0) return { porDia, motivo: '' };

  let ciclo: string[];
  let motivo: string;
  if (n <= 3) {
    ciclo = [PREDEF.fullBody];
    motivo =
      n === 1
        ? 'Con 1 día, una rutina de cuerpo completo trabaja todos los músculos cada vez que vas.'
        : `Con ${n} días, una rutina de cuerpo completo trabaja todos los músculos cada vez que vas.`;
  } else if (n === 4) {
    ciclo = [PREDEF.torsoPiernaA, PREDEF.torsoPiernaB];
    motivo = 'Con 4 días, alternar torso y pierna te deja descansar cada grupo.';
  } else {
    ciclo = [PREDEF.push, PREDEF.pull, PREDEF.legs];
    motivo = `Con ${n} días, Push, Pull y Legs reparten el trabajo y cada grupo descansa antes de repetirse.`;
  }

  orden.forEach((dia, i) => {
    porDia[dia] = ciclo[i % ciclo.length];
  });
  return { porDia, motivo };
}

// ---------------------------------------------------------------------------
// Filas -> estado (precarga al editar)
// ---------------------------------------------------------------------------

function filasGimnasioActivas<F extends FilaRutinaSemana>(filas: F[]): F[] {
  return filas.filter((f) => f.tipo === 'gimnasio' && f.activa === 1);
}

/** Las filas activas de gimnasio de cada dia, la de hora mas temprana primero. */
function porDiaOrdenadas<F extends FilaRutinaSemana>(filas: F[]): Map<number, F[]> {
  const mapa = new Map<number, F[]>();
  for (const f of filasGimnasioActivas(filas)) {
    const lista = mapa.get(f.dia_semana) ?? [];
    lista.push(f);
    mapa.set(f.dia_semana, lista);
  }
  for (const lista of mapa.values()) {
    lista.sort((a, b) => a.hora.localeCompare(b.hora) || a.id.localeCompare(b.id));
  }
  return mapa;
}

/** El valor que mas se repite; a igual cantidad, el que aparece primero. */
function masFrecuente<T>(valores: T[]): T | undefined {
  const cuenta = new Map<T, number>();
  for (const v of valores) cuenta.set(v, (cuenta.get(v) ?? 0) + 1);
  let mejor: T | undefined;
  let max = 0;
  for (const v of valores) {
    const c = cuenta.get(v)!;
    if (c > max) {
      mejor = v;
      max = c;
    }
  }
  return mejor;
}

/**
 * El estado del asistente para editar la semana que ya hay. Un dia con varias
 * filas toma la de hora mas temprana (al guardar, las otras se desactivan).
 * Un dia de gimnasio libre (sin rutina_gimnasio_id) queda sin rutina, asi el
 * usuario tiene que elegir una para seguir.
 */
export function estadoDesdeRutinas(filas: FilaRutinaSemana[]): EstadoAsistente {
  const mapa = porDiaOrdenadas(filas);
  if (mapa.size === 0) return estadoVacio();

  const dias = ordenarDias(mapa.keys());
  const primeras = dias.map((d) => mapa.get(d)![0]);

  const rutinaPorDia: Partial<Record<number, RefRutina>> = {};
  const horaPorDia: Partial<Record<number, string>> = {};
  for (const f of primeras) {
    if (f.rutina_gimnasio_id) rutinaPorDia[f.dia_semana] = { origen: 'propia', id: f.rutina_gimnasio_id };
    horaPorDia[f.dia_semana] = f.hora;
  }

  const horas = primeras.map((f) => f.hora);
  const distintaPorDia = new Set(horas).size > 1;
  const duraciones = primeras
    .map((f) => f.duracion_estimada_min)
    .filter((d): d is number => d != null && d > 0);

  return {
    dias,
    rutinaPorDia,
    horaUnica: masFrecuente(horas) ?? HORA_POR_DEFECTO,
    distintaPorDia,
    horaPorDia: distintaPorDia ? horaPorDia : {},
    duracionMin: masFrecuente(duraciones) ?? DURACION_POR_DEFECTO,
  };
}

// ---------------------------------------------------------------------------
// Estado -> plan (el diff)
// ---------------------------------------------------------------------------

export interface ContextoPlan {
  /** Mis rutinas activas. Una con el mismo nombre exacto que una predefinida la reemplaza. */
  propias: RutinaConNombre[];
  predefinidas: RutinaConNombre[];
}

/**
 * Resuelve lo elegido a una rutina concreta. Una predefinida que ya tiene una
 * copia en Mis rutinas (mismo nombre exacto) usa esa copia: elegir "Push" de
 * las rutinas listas no tiene que dejar otro "Push" en Mis rutinas.
 */
export function resolverRutina(ref: RefRutina, contexto: ContextoPlan): DestinoRutina {
  if (ref.origen === 'propia') return { tipo: 'existente', id: ref.id };
  const predef = contexto.predefinidas.find((p) => p.id === ref.id);
  const copia = predef ? contexto.propias.find((p) => p.nombre === predef.nombre) : undefined;
  if (copia) return { tipo: 'existente', id: copia.id };
  return { tipo: 'copia', predefinidaId: ref.id };
}

function mismoDestino(a: DestinoRutina, b: DestinoRutina): boolean {
  if (a.tipo === 'existente' && b.tipo === 'existente') return a.id === b.id;
  if (a.tipo === 'copia' && b.tipo === 'copia') return a.predefinidaId === b.predefinidaId;
  return false;
}

/**
 * Que hay que escribir para que las filas activas de gimnasio queden
 * exactamente como el estado del asistente. No toca filas de otro tipo
 * (deporte, partidos): esas no son del asistente.
 *
 * Por dia elegido:
 *   - sin fila activa -> se crea;
 *   - con fila -> se conserva una (la que ya apunta a la rutina elegida, si
 *     hay; si no, la de hora mas temprana) y se actualiza solo si cambio la
 *     hora, la duracion o la rutina. Las demas filas del dia se desactivan.
 * Los dias que ya no estan se desactivan enteros.
 *
 * Tira si algun dia no tiene rutina: el asistente no deja llegar ahi.
 */
export function planDesdeAsistente(
  estado: EstadoAsistente,
  rutinasActuales: FilaRutinaSemana[],
  contexto: ContextoPlan = { propias: [], predefinidas: [] },
): PlanSemana {
  const faltan = diasSinRutina(estado);
  if (faltan.length > 0) {
    throw new Error(`Hay dias sin rutina: ${faltan.join(', ')}`);
  }

  const actuales = porDiaOrdenadas(rutinasActuales);
  const elegidos = new Set(estado.dias);
  const plan: PlanSemana = { copiar: [], crear: [], actualizar: [], desactivar: [], sinCambios: true };

  for (const dia of ordenarDias(estado.dias)) {
    const destino = resolverRutina(estado.rutinaPorDia[dia]!, contexto);
    const hora = horaDelDia(estado, dia);
    const duracion = estado.duracionMin;
    const filas = actuales.get(dia) ?? [];

    if (destino.tipo === 'copia' && !plan.copiar.includes(destino.predefinidaId)) {
      plan.copiar.push(destino.predefinidaId);
    }

    if (filas.length === 0) {
      plan.crear.push({ dia_semana: dia, hora, duracion_estimada_min: duracion, rutina: destino });
      continue;
    }

    const conservada =
      (destino.tipo === 'existente' && filas.find((f) => f.rutina_gimnasio_id === destino.id)) ||
      filas[0];

    for (const f of filas) {
      if (f.id !== conservada.id) plan.desactivar.push(f.id);
    }

    const actual: DestinoRutina | null = conservada.rutina_gimnasio_id
      ? { tipo: 'existente', id: conservada.rutina_gimnasio_id }
      : null;
    const cambio =
      conservada.hora !== hora ||
      conservada.duracion_estimada_min !== duracion ||
      !actual ||
      !mismoDestino(actual, destino);

    if (cambio) {
      plan.actualizar.push({ id: conservada.id, hora, duracion_estimada_min: duracion, rutina: destino });
    }
  }

  for (const [dia, filas] of actuales) {
    if (elegidos.has(dia)) continue;
    for (const f of filas) plan.desactivar.push(f.id);
  }

  plan.sinCambios =
    plan.copiar.length === 0 &&
    plan.crear.length === 0 &&
    plan.actualizar.length === 0 &&
    plan.desactivar.length === 0;
  return plan;
}

/**
 * Lo que el resumen tiene que avisar antes de guardar, porque se pierde:
 * los dias que el usuario saco y los dias que tenian mas de una rutina.
 */
export function avisosDelPlan(
  estado: EstadoAsistente,
  rutinasActuales: FilaRutinaSemana[],
): { diasSacados: number[]; diasConVarias: number[] } {
  const actuales = porDiaOrdenadas(rutinasActuales);
  const elegidos = new Set(estado.dias);
  const diasSacados: number[] = [];
  const diasConVarias: number[] = [];
  for (const dia of ordenarDias(actuales.keys())) {
    if (!elegidos.has(dia)) diasSacados.push(dia);
    else if (actuales.get(dia)!.length > 1) diasConVarias.push(dia);
  }
  return { diasSacados, diasConVarias };
}

/** "8:30" -> "08:30". El CHECK de rutina.hora exige el padding. */
export function horaConPadding(h: number, m: number): string {
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** "08:30" -> "8:30", como se muestra en la app. */
export function horaCorta(hora: string): string {
  return hora.replace(/^0(?=\d:)/, '');
}
