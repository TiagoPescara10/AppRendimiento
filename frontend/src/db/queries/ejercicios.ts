// src/db/queries/ejercicios.ts
//
// Acceso a datos para el catalogo de ejercicios.
// Busqueda por nombre, filtrado por grupo muscular y alta manual por el usuario.

import { getDb } from '../schema';
import type { EjercicioRow, GrupoMuscular } from '../schema';

const ahora = (): string => new Date().toISOString();

export async function listarEjercicios(grupo?: GrupoMuscular): Promise<EjercicioRow[]> {
  if (grupo) {
    return getDb().getAllAsync<EjercicioRow>(
      'SELECT * FROM ejercicio WHERE grupo = ? ORDER BY nombre ASC',
      [grupo],
    );
  }
  return getDb().getAllAsync<EjercicioRow>('SELECT * FROM ejercicio ORDER BY nombre ASC');
}

export async function buscarEjercicios(termino: string): Promise<EjercicioRow[]> {
  const limpio = termino.trim();
  if (!limpio) return listarEjercicios();

  return getDb().getAllAsync<EjercicioRow>(
    'SELECT * FROM ejercicio WHERE nombre LIKE ? ORDER BY nombre ASC',
    [`%${limpio}%`],
  );
}

export async function obtenerEjercicio(id: string): Promise<EjercicioRow | null> {
  return getDb().getFirstAsync<EjercicioRow>('SELECT * FROM ejercicio WHERE id = ?', [id]);
}

export interface NuevoEjercicio {
  id: string;
  nombre: string;
  grupo: GrupoMuscular;
}

export async function crearEjercicio(datos: NuevoEjercicio): Promise<EjercicioRow> {
  const t = ahora();
  await getDb().runAsync(
    'INSERT INTO ejercicio (id, nombre, grupo, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    [datos.id, datos.nombre.trim(), datos.grupo, t, t],
  );

  const fila = await obtenerEjercicio(datos.id);
  if (!fila) throw new Error(`No se pudo leer el ejercicio recien creado: ${datos.id}`);
  return fila;
}
