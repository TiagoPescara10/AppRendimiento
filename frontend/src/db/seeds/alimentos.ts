// src/db/seeds/alimentos.ts
//
// Carga la base de alimentos argentinos en la tabla alimento. Corre al final
// de initDb(), en cada arranque.
//
// Recibe la conexion por parametro en vez de usar getDb() por dos motivos:
// initDb() todavia no la asigno cuando llama aca (getDb() tiraria), y un
// import de getDb cerraria el ciclo schema -> seeds -> schema que la cabecera
// de schema.ts documenta.

import type * as SQLite from 'expo-sqlite';
import { escribirMeta, leerMeta } from '../meta';
import { randomUUID } from '../sync/uuid';
import type { AlimentoSemilla } from './alimentos-ar';
import { ALIMENTOS_AR } from './alimentos-ar';
import { ALIMENTOS_AR_LOTE2 } from './alimentos-ar-lote2';
import { ALIMENTOS_AR_LOTE3 } from './alimentos-ar-lote3';

const CLAVE_SEMILLA = 'semilla_alimentos';

interface LoteSemilla {
  /** Entero creciente, como las migraciones. */
  version: number;
  alimentos: AlimentoSemilla[];
}

/**
 * Para sumar alimentos mas adelante: lote nuevo con version incremental, no editar anteriores.
 * Los lotes ya aplicados no se vuelven a intentar en las bases que ya los tienen.
 */
const LOTES: LoteSemilla[] = [
  { version: 1, alimentos: ALIMENTOS_AR },
  { version: 2, alimentos: ALIMENTOS_AR_LOTE2 },
  { version: 3, alimentos: ALIMENTOS_AR_LOTE3 },
];

export const VERSION_SEMILLA: number = LOTES.reduce(
  (max, l) => (l.version > max ? l.version : max),
  0,
);

/**
 * El WHERE NOT EXISTS por nombre cubre dos casos que el marcador de version no
 * ve: un homonimo que el usuario cargo a mano —sus valores le ganan a la
 * semilla, es su alimento— y una transaccion anterior que no llego a commitear.
 */
const SQL_INSERT = `
INSERT INTO alimento
  (id, nombre, marca, codigo_barras, kcal_por_100g, proteina_g, carbohidratos_g,
   grasa_g, fibra_g, fuente, verificado, porciones, categoria, created_at, updated_at)
SELECT ?, ?, NULL, NULL, ?, ?, ?, ?, ?, 'manual', 1, ?, ?, ?, ?
WHERE NOT EXISTS (SELECT 1 FROM alimento WHERE nombre = ?)
`;

/**
 * Corre los lotes que falten y devuelve cuantas filas inserto. 0 si no habia
 * nada pendiente, que es el caso normal a partir del segundo arranque.
 *
 * El atajo es el marcador en `meta`, no un conteo de filas: un contador se
 * desincroniza en cuanto el usuario tiene un homonimo, y entonces el seed
 * vuelve a preparar los 318 statements en cada apertura de la app sin insertar
 * nada. Leer una clave primaria no se desincroniza nunca.
 *
 * El marcador se escribe DENTRO de la misma transaccion que los inserts. Si
 * quedara afuera, un corte entre medio dejaria la semilla marcada como
 * aplicada con las filas a medias, y nada la completaria despues.
 *
 * Semantica: el marcador dice "el lote N ya corrio", no "las filas estan". Si
 * el usuario borra un alimento sembrado, no vuelve en el proximo arranque.
 * Borrarlo fue una decision suya.
 */
export async function sembrarAlimentos(db: SQLite.SQLiteDatabase): Promise<number> {
  const marca = await leerMeta(db, CLAVE_SEMILLA);
  const aplicada = Number(marca ?? 0) || 0;

  const pendientes = LOTES.filter((l) => l.version > aplicada).sort(
    (a, b) => a.version - b.version,
  );
  if (pendientes.length === 0) return 0;

  const arranque = Date.now();
  const t = new Date().toISOString();
  let insertados = 0;

  // Una sola transaccion para todo el lote: de a un INSERT suelto cada uno es
  // un fsync, y el primer arranque se va a varios segundos.
  await db.withTransactionAsync(async () => {
    const stmt = await db.prepareAsync(SQL_INSERT);
    try {
      for (const lote of pendientes) {
        for (const a of lote.alimentos) {
          const r = await stmt.executeAsync([
            randomUUID(),
            a.nombre,
            a.kcal_por_100g,
            a.proteina_g,
            a.carbohidratos_g,
            a.grasa_g,
            a.fibra_g,
            JSON.stringify(a.porciones),
            a.categoria,
            t,
            t,
            a.nombre,
          ]);
          insertados += r.changes;
        }
      }
    } finally {
      await stmt.finalizeAsync();
    }
    await escribirMeta(db, CLAVE_SEMILLA, String(VERSION_SEMILLA));
  });

  // Esto corre durante el splash, en el primer arranque despues de instalar.
  // El log esta para medirlo en un telefono real: si son ~200ms no molesta a
  // nadie, si son dos segundos el seed tiene que salir del arranque y pasar a
  // background. Solo se imprime cuando hubo trabajo, asi que en el uso normal
  // no aparece nunca.
  const total = pendientes.reduce((n, l) => n + l.alimentos.length, 0);
  console.log(
    `[db] semilla alimentos v${VERSION_SEMILLA}: ${insertados}/${total} filas en ${
      Date.now() - arranque
    }ms`,
  );

  return insertados;
}
