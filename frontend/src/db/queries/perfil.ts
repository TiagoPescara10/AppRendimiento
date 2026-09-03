// src/db/queries/perfil.ts
//
// Solo lectura y escritura. Nada de logica de dominio: si "el perfil esta
// completo" se deriva de que los campos requeridos no sean null, eso vive en
// src/lib/ o en features/perfil/, no aca.

import { getDb } from '../schema';
import type { PerfilRow } from '../schema';

const ahora = (): string => new Date().toISOString();

export interface NuevoPerfil {
  id: string;
  /** ISO 8601. Cuando se creo la cuenta. */
  fecha_alta: string;
  nombre?: string | null;
  fecha_nacimiento?: string | null;
  sexo_biologico?: PerfilRow['sexo_biologico'];
  altura_cm?: number | null;
  nivel_actividad?: PerfilRow['nivel_actividad'];
  deporte_principal?: string | null;
  objetivo?: PerfilRow['objetivo'];
  peso_objetivo_kg?: number | null;
}

// Whitelist de columnas editables. Los nombres de columna se interpolan en el
// UPDATE, asi que NUNCA pueden venir del input: salen de esta constante.
const CAMPOS_EDITABLES = [
  'nombre',
  'fecha_nacimiento',
  'sexo_biologico',
  'altura_cm',
  'nivel_actividad',
  'deporte_principal',
  'objetivo',
  'peso_objetivo_kg',
] as const;

type CampoEditable = (typeof CAMPOS_EDITABLES)[number];

export type CambiosPerfil = Partial<Pick<PerfilRow, CampoEditable>>;

export async function crearPerfil(datos: NuevoPerfil): Promise<PerfilRow> {
  const t = ahora();
  await getDb().runAsync(
    `INSERT INTO perfil (
       id, nombre, fecha_nacimiento, sexo_biologico, altura_cm,
       nivel_actividad, deporte_principal, objetivo, peso_objetivo_kg,
       fecha_alta, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      datos.id,
      datos.nombre ?? null,
      datos.fecha_nacimiento ?? null,
      datos.sexo_biologico ?? null,
      datos.altura_cm ?? null,
      datos.nivel_actividad ?? null,
      datos.deporte_principal ?? null,
      datos.objetivo ?? null,
      datos.peso_objetivo_kg ?? null,
      datos.fecha_alta,
      t,
      t,
    ],
  );

  const fila = await obtenerPerfil(datos.id);
  if (!fila) throw new Error(`No se pudo leer el perfil recien creado: ${datos.id}`);
  return fila;
}

export async function obtenerPerfil(id: string): Promise<PerfilRow | null> {
  return getDb().getFirstAsync<PerfilRow>('SELECT * FROM perfil WHERE id = ?', [id]);
}

/** En el cliente hay un solo perfil local. Atajo para no arrastrar el id. */
export async function obtenerPerfilLocal(): Promise<PerfilRow | null> {
  return getDb().getFirstAsync<PerfilRow>('SELECT * FROM perfil LIMIT 1');
}

/**
 * Actualiza solo las claves presentes en `cambios`. Pasar `null` explicito
 * borra el valor; omitir la clave lo deja como esta. Esa distincion es la que
 * permite guardar el onboarding paso a paso.
 */
export async function actualizarPerfil(id: string, cambios: CambiosPerfil): Promise<void> {
  const claves = CAMPOS_EDITABLES.filter((c) => c in cambios);
  if (claves.length === 0) return;

  const set = claves.map((c) => `${c} = ?`).join(', ');
  const valores: (string | number | null)[] = claves.map((c) => cambios[c] ?? null);

  await getDb().runAsync(`UPDATE perfil SET ${set}, updated_at = ? WHERE id = ?`, [
    ...valores,
    ahora(),
    id,
  ]);
}

export async function eliminarPerfil(id: string): Promise<void> {
  await getDb().runAsync('DELETE FROM perfil WHERE id = ?', [id]);
}
