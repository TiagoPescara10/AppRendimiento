// Implementa la superficie de expo-sqlite que usa src/db/, sobre node:sqlite.
// Sirve para correr la capa de datos real en Node, sin emulador.
//
// Solo cubre lo que el codigo del proyecto llama. Si algun dia se usan
// sessions o serialize, hay que agregarlos aca.

const { DatabaseSync } = require('node:sqlite');

function envolver(db) {
  const api = {
    async execAsync(source) {
      exigirTexto(source, 'execAsync');
      db.exec(source);
    },
    async runAsync(source, params = []) {
      exigirTexto(source, 'runAsync');
      const r = db.prepare(source).run(...params);
      return { lastInsertRowId: Number(r.lastInsertRowid), changes: Number(r.changes) };
    },
    async getFirstAsync(source, params = []) {
      exigirTexto(source, 'getFirstAsync');
      return db.prepare(source).get(...params) ?? null;
    },
    async getAllAsync(source, params = []) {
      exigirTexto(source, 'getAllAsync');
      return db.prepare(source).all(...params);
    },
    // El seed de alimentos mete sus filas con un statement preparado: son 318
    // ejecuciones del mismo SQL y prepararlo una sola vez es la diferencia
    // entre un arranque y una espera.
    async prepareAsync(source) {
      exigirTexto(source, 'prepareAsync');
      const stmt = db.prepare(source);
      return {
        // expo-sqlite acepta los parametros como array o sueltos; el resultado
        // real tambien es iterable para los SELECT, que aca nadie usa.
        async executeAsync(...args) {
          const params = args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
          const r = stmt.run(...params);
          return { lastInsertRowId: Number(r.lastInsertRowid), changes: Number(r.changes) };
        },
        async finalizeAsync() {
          // node:sqlite no expone finalize: el statement lo libera el GC.
        },
      };
    },
    // Deferred, a diferencia de withExclusiveTransactionAsync. Y no le pasa el
    // txn a la tarea: en expo-sqlite la firma es () => Promise<void>.
    async withTransactionAsync(task) {
      db.exec('BEGIN');
      try {
        await task();
        db.exec('COMMIT');
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },
    async withExclusiveTransactionAsync(task) {
      db.exec('BEGIN IMMEDIATE');
      try {
        await task(api);
        db.exec('COMMIT');
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },
    async closeAsync() {
      db.close();
    },
  };
  return api;
}

// expo-sqlite delega en un modulo nativo cuyo parametro `source` es String.
// Cuando llega undefined tira ERR_ARGUMENT_CAST, un mensaje que no dice donde
// fue. Aca se reproduce esa falla pero nombrando la funcion.
function exigirTexto(source, fn) {
  if (typeof source !== 'string') {
    throw new TypeError(
      `${fn}(): el SQL llego como ${source === undefined ? 'undefined' : typeof source}, ` +
        'no como string. En el dispositivo esto sale como ERR_ARGUMENT_CAST.',
    );
  }
}

exports.openDatabaseAsync = async function openDatabaseAsync(databaseName) {
  return envolver(new DatabaseSync(databaseName));
};

exports.openDatabaseSync = function openDatabaseSync(databaseName) {
  return envolver(new DatabaseSync(databaseName));
};
