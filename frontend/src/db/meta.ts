// src/db/meta.ts
//
// Clave/valor para estado interno de la base: que semilla corrio, cuando fue
// la ultima sincronizacion. No es para datos del usuario.
//
// Reciben la conexion por parametro y no usan getDb() porque el primer
// consumidor es el seed, que corre dentro de initDb() antes de que la conexion
// quede asignada. Ademas evita el ciclo schema -> seeds -> meta -> schema.

import type * as SQLite from 'expo-sqlite';

/** null si la clave nunca se escribio. */
export async function leerMeta(
  db: SQLite.SQLiteDatabase,
  clave: string,
): Promise<string | null> {
  const fila = await db.getFirstAsync<{ valor: string }>(
    'SELECT valor FROM meta WHERE clave = ?',
    [clave],
  );
  return fila?.valor ?? null;
}

export async function escribirMeta(
  db: SQLite.SQLiteDatabase,
  clave: string,
  valor: string,
): Promise<void> {
  await db.runAsync(
    `INSERT INTO meta (clave, valor, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor, updated_at = excluded.updated_at`,
    [clave, valor, new Date().toISOString()],
  );
}
