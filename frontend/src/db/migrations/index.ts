// src/db/migrations/index.ts
//
// Versionado con PRAGMA user_version. Es un entero que vive en el header del
// archivo .db, lo maneja SQLite y es transaccional: si la migracion falla, el
// rollback deja tambien la version anterior. No hace falta tabla de control.
//
// Para agregar una migracion:
//   1. crear 00N_loquesea.ts exportando una Migracion con version: N
//   2. sumarla al array `migraciones` de abajo
//   3. NO editar una migracion ya publicada: los usuarios existentes ya la corrieron

import type * as SQLite from 'expo-sqlite';
import { migracion001 } from './001_inicial';
import { migracion002 } from './002_alimento_porciones';
import { migracion003 } from './003_meta';
import { migracion004 } from './004_rutinas';
import { migracion005 } from './005_sesiones';

export interface Migracion {
  /** Entero creciente, sin huecos. Termina en PRAGMA user_version. */
  version: number;
  nombre: string;
  /** Una o mas sentencias separadas por ';'. Corre dentro de una transaccion. */
  sql: string;
}

export const migraciones: Migracion[] = [
  migracion001,
  migracion002,
  migracion003,
  migracion004,
  migracion005,
];

/** Version del esquema que espera este build. */
export const VERSION_ESQUEMA: number = migraciones.reduce(
  (max, m) => (m.version > max ? m.version : max),
  0,
);

async function versionActual(db: SQLite.SQLiteDatabase): Promise<number> {
  const fila = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  return fila?.user_version ?? 0;
}

/**
 * Aplica las migraciones pendientes en orden y devuelve la version resultante.
 * Cada una corre en su propia transaccion exclusiva: si la 3 falla, la 2 queda
 * aplicada y el proximo arranque reintenta desde la 3.
 */
export async function migrar(db: SQLite.SQLiteDatabase): Promise<number> {
  const desde = await versionActual(db);

  const pendientes = migraciones
    .filter((m) => m.version > desde)
    .sort((a, b) => a.version - b.version);

  if (pendientes.length === 0) return desde;

  for (const m of pendientes) {
    await db.withExclusiveTransactionAsync(async (txn) => {
      await txn.execAsync(m.sql);
      // PRAGMA no acepta parametros ligados: hay que interpolar.
      // El valor sale del array de migraciones de este mismo build, no de input externo.
      await txn.execAsync(`PRAGMA user_version = ${m.version}`);
    });
  }

  return pendientes[pendientes.length - 1].version;
}
