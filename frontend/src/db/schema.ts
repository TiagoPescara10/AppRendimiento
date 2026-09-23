// src/db/schema.ts
//
// Tipos de fila de la base local (SQLite via expo-sqlite) y manejo de conexion.
//
// El DDL NO vive aca: cada version del esquema es una migracion en
// src/db/migrations/. Este archivo solo describe las filas en TypeScript y
// abre la base. Mantenerlo asi evita el ciclo de imports
// schema -> migrations -> 00N -> schema, que deja el SQL en undefined.
//
// Si cambia una columna, cambian dos cosas: la migracion nueva y el tipo de
// abajo. El tipo no se valida solo contra la base; son dos fuentes que hay que
// mover juntas.

import * as SQLite from 'expo-sqlite';
import { migrar } from './migrations';
import { sembrarAlimentos } from './seeds/alimentos';
import { sembrarEjercicios } from './seeds/ejercicios';
import { sembrarRutinasPredefinidas } from './seeds/rutinas-predefinidas';

// ---------------------------------------------------------------------------
// Enums — reflejan los CHECK del DDL. Si cambia uno, cambia el otro.
// ---------------------------------------------------------------------------

export type SexoBiologico = 'masculino' | 'femenino';
export type NivelActividad = 'sedentario' | 'ligero' | 'moderado' | 'alto' | 'muy_alto';
export type Objetivo = 'bajar' | 'mantener' | 'subir' | 'rendimiento';
export type ModoNutricion = 'objetivo' | 'recuento';
export type FuentePeso = 'manual' | 'balanza' | 'health_kit';
export type FuenteAlimento = 'open_food_facts' | 'usda' | 'manual' | 'vision';
export type TipoComida = 'desayuno' | 'almuerzo' | 'merienda' | 'cena' | 'snack';
export type TipoEvento = 'partido' | 'entrenamiento' | 'gimnasio' | 'competencia';
export type Intensidad = 'baja' | 'media' | 'alta';
export type FuenteSueno = 'manual' | 'health_kit' | 'health_connect';
export type MomentoDia = 'manana' | 'tarde' | 'noche';
export type ModoEntrenamiento = 'pasadas' | 'cronometro' | 'rutina';
export type GrupoMuscular = 'pecho' | 'espalda' | 'piernas' | 'hombros' | 'brazos' | 'core' | 'cardio';
export type CategoriaRutinaPredefinida = 'principiante' | 'split' | 'especifica';

/** SQLite no tiene booleano: se guarda 0/1. */
export type Bool01 = 0 | 1;

/**
 * Porcion tipica de un alimento: como la nombra el usuario y cuanto pesa.
 * Se guarda serializada en alimento.porciones; las queries la devuelven ya
 * parseada, asi que fuera de db/ nunca se ve el JSON.
 */
export interface PorcionTipica {
  /** Como lo dice el usuario: "1 milanesa", "Plato mediano". */
  nombre: string;
  gramos: number;
  /** La que aparece preseleccionada al elegir el alimento. */
  predeterminada: boolean;
}

// ---------------------------------------------------------------------------
// Tipos de fila — coinciden 1:1 con las columnas. Lo que devuelven las queries.
// ---------------------------------------------------------------------------

export interface PerfilRow {
  id: string;
  nombre: string | null;
  fecha_nacimiento: string | null;
  sexo_biologico: SexoBiologico | null;
  altura_cm: number | null;
  nivel_actividad: NivelActividad | null;
  deporte_principal: string | null;
  objetivo: Objetivo | null;
  peso_objetivo_kg: number | null;
  meta_agua_manual_ml: number | null;
  modo_nutricion: ModoNutricion;
  fecha_alta: string;
  created_at: string;
  updated_at: string;
}

export interface RegistroAguaRow {
  id: string;
  usuario_id: string;
  fecha: string;
  hora: string;
  ml: number;
  created_at: string;
  updated_at: string;
}

export interface RegistroPesoRow {
  id: string;
  usuario_id: string;
  peso_kg: number;
  fecha: string;
  fuente: FuentePeso;
  created_at: string;
  updated_at: string;
}

export interface AlimentoRow {
  id: string;
  nombre: string;
  marca: string | null;
  codigo_barras: string | null;
  kcal_por_100g: number;
  proteina_g: number;
  carbohidratos_g: number;
  grasa_g: number;
  fibra_g: number | null;
  fuente: FuenteAlimento;
  verificado: Bool01;
  /** JSON con PorcionTipica[]. Crudo: usar las funciones de queries/alimentos.ts. */
  porciones: string;
  /** Sin CHECK en el DDL: la lista crece sin migracion. 'otros' si no se sabe. */
  categoria: string;
  created_at: string;
  updated_at: string;
}

export interface ComidaRow {
  id: string;
  usuario_id: string;
  fecha_hora: string;
  /** Columna generada: substr(fecha_hora, 1, 10). Solo lectura. */
  fecha: string;
  tipo: TipoComida;
  foto_url: string | null;
  notas: string | null;
  created_at: string;
  updated_at: string;
}

export interface ItemComidaRow {
  id: string;
  comida_id: string;
  alimento_id: string;
  cantidad_g: number;
  editado_por_usuario: Bool01;
  created_at: string;
  updated_at: string;
}

export interface EventoRow {
  id: string;
  usuario_id: string;
  tipo: TipoEvento;
  fecha_hora_inicio: string;
  /** Columna generada: substr(fecha_hora_inicio, 1, 10). Solo lectura. */
  fecha: string;
  duracion_estimada_min: number | null;
  intensidad: Intensidad;
  completado: Bool01;
  /**
   * Si el usuario ya contesto por este evento. Separa "no lo hice" (respondido
   * 1, completado 0) de "todavia no conteste" (respondido 0), que antes eran
   * el mismo 0 en `completado`.
   */
  respondido: Bool01;
  notas: string | null;
  /** null si el evento se creo suelto. Apunta a la rutina que lo genero. */
  rutina_id: string | null;
  /** null si no salio de una rutina de gimnasio. */
  rutina_gimnasio_id: string | null;
  /** null para eventos manuales o de rutina deportiva. 'cronometro' | 'pasadas' | 'rutina' cuando proviene de sesion retroactiva. */
  modo_entrenamiento: ModoEntrenamiento | null;
  /** null para partido, competencia o gimnasio. Deporte especifico si tipo === 'entrenamiento'. */
  deporte: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Regla semanal que se materializa como filas de `evento`. No es la ocurrencia:
 * `completado` y el temporizador viven en el evento, no aca.
 */
export interface RutinaRow {
  id: string;
  usuario_id: string;
  /** 0 = domingo, 6 = sabado. Mismo criterio que Date.getDay(). */
  dia_semana: number;
  /** "08:30", hora local. El CHECK del DDL exige el padding. */
  hora: string;
  tipo: TipoEvento;
  duracion_estimada_min: number | null;
  intensidad: Intensidad;
  activa: Bool01;
  /** null si no es de gimnasio o no tiene rutina de gimnasio fija asociada. */
  rutina_gimnasio_id: string | null;
  /** null para gimnasio o si no se especifico. Deporte especifico si tipo === 'entrenamiento'. */
  deporte: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Catalogo de rutina de gimnasio: nombre y estado. Los ejercicios
 * viven en rutina_gimnasio_ejercicio y la programacion de dias/horarios
 * vive en la tabla rutina.
 */
export interface RutinaGimnasioRow {
  id: string;
  usuario_id: string;
  nombre: string;
  activa: Bool01;
  created_at: string;
  updated_at: string;
}

/**
 * Rutina de la biblioteca predefinida (migracion 017). Solo lectura: el
 * usuario la copia a rutina_gimnasio, nunca la edita ni la borra.
 */
export interface RutinaPredefinidaRow {
  id: string;
  nombre: string;
  categoria: CategoriaRutinaPredefinida;
  descripcion: string | null;
  orden: number;
  created_at: string;
  updated_at: string;
}

export interface RutinaPredefinidaEjercicioRow {
  id: string;
  rutina_predefinida_id: string;
  ejercicio_id: string;
  orden: number;
}

// La tabla rutina_gimnasio_dia se elimino en la migracion 014: los dias de una
// rutina de gimnasio se leen de la tabla `rutina` via rutina_gimnasio_id.

export interface RutinaGimnasioEjercicioRow {
  id: string;
  rutina_gimnasio_id: string;
  ejercicio_id: string;
  orden: number;
  created_at: string;
  updated_at: string;
}

/**
 * Detalle de una sesion de entrenamiento (pasadas, cronometro o rutina de gimnasio).
 *
 * Cuelga del evento: el usuario, la fecha y el tipo ya viven ahi y no se
 * duplican. Se guarda lo CONFIGURADO y lo COMPLETADO por separado en pasadas y
 * cronometro. En rutina los campos de intervalos son null y el detalle vive
 * en las filas de `serie`.
 */
export interface SesionEntrenamientoRow {
  id: string;
  evento_id: string;
  modo: ModoEntrenamiento;
  /** null si la sesion de gimnasio fue libre o ad-hoc sin rutina predefinida. */
  rutina_gimnasio_id: string | null;

  // lo configurado (null en rutina)
  bloques: number | null;
  pasadas: number | null;
  /** 0 = cronometro, o sea trabajo sin limite. Ver esCronometro(). */
  trabajo_seg: number | null;
  descanso_seg: number | null;
  descanso_bloque_seg: number | null;

  // lo que se hizo (null en rutina)
  bloques_completados: number | null;
  /**
   * TOTAL de pasadas de la sesion entera, no las del ultimo bloque: 6 bloques
   * de 8 completos son 48. El bloque actual sale de dividir; al reves no se
   * puede reconstruir el total. Misma unidad que duracion_real_seg.
   */
  pasadas_completadas: number | null;
  /**
   * En pasadas/cronometro: tiempo medido por el temporizador.
   * En rutina: nullable (no se cuenta tiempo salvo que se mida).
   */
  duracion_real_seg: number | null;

  /** Solo el cronometro la tiene. null en cualquier sesion de pasadas o rutina. */
  distancia_km: number | null;

  created_at: string;
  updated_at: string;
}

export interface EjercicioRow {
  id: string;
  nombre: string;
  grupo: GrupoMuscular;
  created_at: string;
  updated_at: string;
}

export interface SerieRow {
  id: string;
  sesion_id: string;
  ejercicio_id: string;
  orden: number;
  repeticiones: number;
  peso_kg: number | null;
  created_at: string;
  updated_at: string;
}

export interface RegistroSuenoRow {
  id: string;
  usuario_id: string;
  fecha: string;
  hora_dormir: string | null;
  hora_despertar: string | null;
  duracion_min: number;
  calidad_percibida: number | null;
  fuente: FuenteSueno;
  created_at: string;
  updated_at: string;
}

export interface RegistroEnergiaRow {
  id: string;
  usuario_id: string;
  fecha: string;
  nivel: number;
  momento: MomentoDia;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Conexion
// ---------------------------------------------------------------------------

export const NOMBRE_DB = 'apprendimiento.db';

let conexion: SQLite.SQLiteDatabase | null = null;

/**
 * Abre la base, aplica los PRAGMAs y corre las migraciones pendientes.
 * Idempotente: llamarla dos veces devuelve la misma conexion.
 */
export async function initDb(nombre: string = NOMBRE_DB): Promise<SQLite.SQLiteDatabase> {
  if (conexion) return conexion;

  const db = await SQLite.openDatabaseAsync(nombre);

  // WAL: lecturas concurrentes con una escritura en curso.
  // foreign_keys: SQLite las trae APAGADAS por defecto y es por conexion,
  // no una propiedad del archivo. Sin esto, los ON DELETE CASCADE no corren.
  await db.execAsync('PRAGMA journal_mode = WAL;');
  await db.execAsync('PRAGMA foreign_keys = ON;');

  await migrar(db);

  // El catalogo se siembra aca y no desde una pantalla: no hay ningun caso en
  // que la base sirva sin alimentos, y asi no se descubre el olvido el dia que
  // aparece una pantalla nueva. Idempotente; en el arranque normal es un
  // SELECT COUNT(*) y nada mas. Va antes de asignar `conexion` porque recibe
  // `db` por parametro: getDb() todavia tiraria.
  await sembrarAlimentos(db);
  await sembrarEjercicios(db);
  // Despues de los ejercicios: las rutinas los referencian por nombre.
  await sembrarRutinasPredefinidas(db);

  conexion = db;
  return conexion;
}

/** Devuelve la conexion ya abierta. Lanza si initDb() no corrio todavia. */
export function getDb(): SQLite.SQLiteDatabase {
  if (!conexion) {
    throw new Error('Base no inicializada: llama a initDb() antes de usar las queries.');
  }
  return conexion;
}

/** Cierra la conexion. Para tests y para el logout. */
export async function cerrarDb(): Promise<void> {
  if (!conexion) return;
  await conexion.closeAsync();
  conexion = null;
}
