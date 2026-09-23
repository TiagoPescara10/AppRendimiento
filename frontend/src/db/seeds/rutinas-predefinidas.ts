// src/db/seeds/rutinas-predefinidas.ts
//
// Carga la biblioteca de rutinas predefinidas en rutina_predefinida y
// rutina_predefinida_ejercicio. Corre en initDb() despues de
// sembrarEjercicios(), porque resuelve los ejercicios por nombre contra la
// tabla ejercicio. Sigue el mismo patron versionado por lotes que
// src/db/seeds/ejercicios.ts.
//
// Si un nombre de ejercicio no existe en la tabla, la semilla tira y la
// transaccion vuelve atras: sin marca en meta, sin rutinas a medias. Es a
// proposito: una rutina sembrada con un ejercicio de menos pasaria
// desapercibida para siempre.

import type * as SQLite from 'expo-sqlite';
import { escribirMeta, leerMeta } from '../meta';
import type { RutinaPredefinidaSemilla } from './rutinas-predefinidas-base';
import { RUTINAS_PREDEFINIDAS_BASE } from './rutinas-predefinidas-base';

const CLAVE_SEMILLA = 'semilla_rutinas_predefinidas';

interface LoteSemillaRutinas {
  version: number;
  rutinas: RutinaPredefinidaSemilla[];
}

const LOTES: LoteSemillaRutinas[] = [
  { version: 1, rutinas: RUTINAS_PREDEFINIDAS_BASE },
];

export const VERSION_SEMILLA_RUTINAS_PREDEFINIDAS: number = LOTES.reduce(
  (max, l) => (l.version > max ? l.version : max),
  0,
);

const SQL_INSERT_RUTINA = `
INSERT INTO rutina_predefinida
  (id, nombre, categoria, descripcion, orden, created_at, updated_at)
SELECT ?, ?, ?, ?, ?, ?, ?
WHERE NOT EXISTS (SELECT 1 FROM rutina_predefinida WHERE id = ?)
`;

const SQL_INSERT_EJERCICIO = `
INSERT INTO rutina_predefinida_ejercicio
  (id, rutina_predefinida_id, ejercicio_id, orden)
VALUES (?, ?, ?, ?)
`;

// Si el usuario creo un homonimo despues de la semilla, se usa el sembrado
// (el mas viejo): es el que tienen todas las instalaciones.
const SQL_BUSCAR_EJERCICIO = `
SELECT id FROM ejercicio WHERE nombre = ? ORDER BY created_at ASC LIMIT 1
`;

export async function sembrarRutinasPredefinidas(
  db: SQLite.SQLiteDatabase,
): Promise<number> {
  const marca = await leerMeta(db, CLAVE_SEMILLA);
  const aplicada = Number(marca ?? 0) || 0;

  const pendientes = LOTES.filter((l) => l.version > aplicada).sort(
    (a, b) => a.version - b.version,
  );
  if (pendientes.length === 0) return 0;

  const arranque = Date.now();
  const t = new Date().toISOString();
  let insertadas = 0;

  // El orden de pantalla es global y sigue el orden de los lotes: se sigue
  // contando desde el ultimo sembrado, asi una rutina de un lote nuevo cae al
  // final de su categoria y no empata con las del lote anterior.
  const ultimo = await db.getFirstAsync<{ n: number }>(
    'SELECT COALESCE(MAX(orden) + 1, 0) AS n FROM rutina_predefinida',
  );
  let orden = ultimo?.n ?? 0;

  await db.withTransactionAsync(async () => {
    const stmtRutina = await db.prepareAsync(SQL_INSERT_RUTINA);
    const stmtEjercicio = await db.prepareAsync(SQL_INSERT_EJERCICIO);
    try {
      for (const lote of pendientes) {
        for (const r of lote.rutinas) {
          // Se resuelven antes de insertar la rutina: si falta uno, no queda
          // ninguna fila escrita de esta rutina.
          const ejercicioIds: string[] = [];
          for (const nombre of r.ejercicios) {
            const fila = await db.getFirstAsync<{ id: string }>(SQL_BUSCAR_EJERCICIO, [nombre]);
            if (!fila) {
              throw new Error(
                `Semilla de rutinas: la rutina "${r.id}" usa el ejercicio "${nombre}", que no existe en el catalogo`,
              );
            }
            ejercicioIds.push(fila.id);
          }

          const res = await stmtRutina.executeAsync([
            r.id,
            r.nombre,
            r.categoria,
            r.descripcion,
            orden++,
            t,
            t,
            r.id,
          ]);
          // Ya estaba (lote reaplicado a mano o base restaurada): no se
          // tocan sus ejercicios.
          if (res.changes === 0) continue;
          insertadas++;

          for (let i = 0; i < ejercicioIds.length; i++) {
            await stmtEjercicio.executeAsync([`${r.id}-${i}`, r.id, ejercicioIds[i], i]);
          }
        }
      }
    } finally {
      await stmtRutina.finalizeAsync();
      await stmtEjercicio.finalizeAsync();
    }
    await escribirMeta(
      db,
      CLAVE_SEMILLA,
      String(VERSION_SEMILLA_RUTINAS_PREDEFINIDAS),
    );
  });

  const total = pendientes.reduce((n, l) => n + l.rutinas.length, 0);
  console.log(
    `[db] semilla rutinas predefinidas v${VERSION_SEMILLA_RUTINAS_PREDEFINIDAS}: ${insertadas}/${total} rutinas en ${
      Date.now() - arranque
    }ms`,
  );

  return insertadas;
}
