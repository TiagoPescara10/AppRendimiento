// src/db/migrations/002_alimento_porciones.ts
//
// Version 2: porciones tipicas y categoria en el catalogo de alimentos.
//
// `porciones` es un JSON: [{"nombre":"1 milanesa","gramos":130,"predeterminada":true}]
// Se guarda serializado porque son datos de solo lectura que siempre se
// consumen enteros junto al alimento. Una tabla aparte obligaria a un JOIN en
// cada busqueda para no ganar nada: nadie consulta una porcion sin su alimento.
// El parseo vive en queries/alimentos.ts; fuera de db/ nunca se ve el string.
//
// `categoria` va sin CHECK a proposito. La lista va a crecer (hoy son 12) y un
// CHECK obligaria a una migracion nueva por cada categoria nueva. El default
// 'otros' es para las filas que ya existen: lo que entro por open_food_facts o
// por vision no trae categoria.

import type { Migracion } from './index';

export const migracion002: Migracion = {
  version: 2,
  nombre: 'alimento_porciones',
  sql: `
ALTER TABLE alimento ADD COLUMN porciones TEXT NOT NULL DEFAULT '[]';
ALTER TABLE alimento ADD COLUMN categoria TEXT NOT NULL DEFAULT 'otros';
`,
};
