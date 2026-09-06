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

// ---------------------------------------------------------------------------
// Enums — reflejan los CHECK del DDL. Si cambia uno, cambia el otro.
// ---------------------------------------------------------------------------

export type SexoBiologico = 'masculino' | 'femenino';
export type NivelActividad = 'sedentario' | 'ligero' | 'moderado' | 'alto' | 'muy_alto';
export type Objetivo = 'bajar' | 'mantener' | 'subir' | 'rendimiento';
export type FuentePeso = 'manual' | 'balanza' | 'health_kit';
export type FuenteAlimento = 'open_food_facts' | 'usda' | 'manual' | 'vision';
export type TipoComida = 'desayuno' | 'almuerzo' | 'merienda' | 'cena' | 'snack';
export type TipoEvento = 'partido' | 'entrenamiento' | 'gimnasio' | 'competencia';
export type Intensidad = 'baja' | 'media' | 'alta';
export type FuenteSueno = 'manual' | 'health_kit' | 'health_connect';
export type MomentoDia = 'manana' | 'tarde' | 'noche';

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
  fecha_alta: string;
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
