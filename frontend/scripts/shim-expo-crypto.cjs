// Shim de 'expo-crypto' para probar-db.mjs.
//
// src/db/sync/uuid.ts lo usa para los UUID que genera el cliente. En el
// dispositivo lo resuelve el bundler de Expo; aca no existe, y sin este shim
// el harness muere al importar schema.js -> seeds/alimentos.js -> sync/uuid.js.
//
// randomUUID de node:crypto es el mismo v4 que devuelve expo-crypto.

const { randomUUID } = require('node:crypto');

module.exports = { randomUUID };
