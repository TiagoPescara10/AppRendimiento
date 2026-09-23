// src/db/seeds/ejercicios.ts
//
// Carga el catalogo base de ejercicios en la tabla ejercicio.
// Corre al final de initDb(), en cada arranque.
// Sigue el mismo patron versionado por lotes que src/db/seeds/alimentos.ts.

import type * as SQLite from 'expo-sqlite';
import { escribirMeta, leerMeta } from '../meta';
import { randomUUID } from '../sync/uuid';
import type { EjercicioSemilla } from './ejercicios-base';
import { EJERCICIOS_BASE } from './ejercicios-base';

const CLAVE_SEMILLA = 'semilla_ejercicios';

interface LoteSemillaEjercicios {
  version: number;
  ejercicios: EjercicioSemilla[];
}

const LOTES: LoteSemillaEjercicios[] = [
  { version: 1, ejercicios: EJERCICIOS_BASE },
];

export const VERSION_SEMILLA_EJERCICIOS: number = LOTES.reduce(
  (max, l) => (l.version > max ? l.version : max),
  0,
);

const SQL_INSERT = `
INSERT INTO ejercicio
  (id, nombre, grupo, created_at, updated_at)
SELECT ?, ?, ?, ?, ?
WHERE NOT EXISTS (SELECT 1 FROM ejercicio WHERE nombre = ?)
`;

export async function sembrarEjercicios(db: SQLite.SQLiteDatabase): Promise<number> {
  const marca = await leerMeta(db, CLAVE_SEMILLA);
  const aplicada = Number(marca ?? 0) || 0;

  const pendientes = LOTES.filter((l) => l.version > aplicada).sort(
    (a, b) => a.version - b.version,
  );
  if (pendientes.length === 0) return 0;

  const arranque = Date.now();
  const t = new Date().toISOString();
  let insertados = 0;

  await db.withTransactionAsync(async () => {
    const stmt = await db.prepareAsync(SQL_INSERT);
    try {
      for (const lote of pendientes) {
        for (const e of lote.ejercicios) {
          const r = await stmt.executeAsync([
            randomUUID(),
            e.nombre,
            e.grupo,
            t,
            t,
            e.nombre,
          ]);
          insertados += r.changes;
        }
      }
    } finally {
      await stmt.finalizeAsync();
    }
    await escribirMeta(db, CLAVE_SEMILLA, String(VERSION_SEMILLA_EJERCICIOS));
  });

  const total = pendientes.reduce((n, l) => n + l.ejercicios.length, 0);
  console.log(
    `[db] semilla ejercicios v${VERSION_SEMILLA_EJERCICIOS}: ${insertados}/${total} filas en ${
      Date.now() - arranque
    }ms`,
  );

  return insertados;
}
