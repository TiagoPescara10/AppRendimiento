// src/db/seeds/coccion.ts
//
// Factores de coccion de la semilla. Paso versionado y no migracion, por lo
// mismo que los lotes de alimentos: si se suma o se corrige un alimento, se
// sube VERSION_COCCION y las bases que ya corrieron la version anterior
// reciben el cambio en el proximo arranque.
//
// Cada fila guarda el par de USDA FoodData Central (SR Legacy) de donde sale:
//   factor = kcal por 100 g crudo / kcal por 100 g cocido
// y el factor se calcula de ahi, no se escribe a mano. Asi el numero se puede
// auditar contra la fuente, y scripts/probar-db.mjs controla la regla que
// decide que entra: el cocido de USDA tiene que cerrar contra el valor de
// nuestra semilla con una diferencia de hasta 15%. Si no cierra, no entra, y
// no se hacen excepciones a mano.
//
// Lo que NO lleva factor, y por que:
// - Fritos, rebozados y todo lo que absorbe aceite: ahi ademas se suma grasa.
// - Verduras: los pares de USDA dan cerca de 1 o en la direccion equivocada
//   (espinaca 23/23, zanahoria 41/35, batata 86/76). El metodo no capta el
//   cambio de peso de una verdura hervida, y el impacto en kcal es minimo.
// - Salmon de criadero: 208 crudo / 206 cocido. La grasa se va con el agua.
// - Cortes grasos (asado, vacio, costilla, bondiola, achuras, embutidos):
//   la grasa domina y el par magro de USDA no representa lo que se come aca.
// - Polenta, bife de chorizo, carne picada, trigo sarraceno, pulpo, almejas,
//   abadejo: el cocido de USDA no cierra contra nuestra semilla.
// - Sin par crudo/cocido en SR Legacy: entrana, calamar, atun fresco, lentejas
//   rojas, poroto tape, T-bone, colita de cuadril, pescados de rio.
//
// TODO: "Bife angosto a la plancha" (215 kcal, lote 2) y "Bife de chorizo"
// (250 kcal, lote 1) son el MISMO corte en Argentina: es un duplicado de la
// semilla con valores distintos. Hay que unificarlos en un solo alimento y ahi
// decidir si lleva factor segun el valor que quede. Hoy el angosto cierra
// contra USDA (lean 189, 12%) y el de chorizo no (32%), y por eso solo el
// angosto tiene factor.

import type * as SQLite from 'expo-sqlite';
import { escribirMeta, leerMeta } from '../meta';

const CLAVE = 'semilla_coccion';

/** Subirla cada vez que cambia la tabla de abajo. */
export const VERSION_COCCION = 1;

/** [nombre exacto en la semilla, kcal crudo USDA, kcal cocido USDA, fdcId crudo/cocido y descripcion] */
type FilaCoccion = readonly [string, number, number, string];

export const FILAS_COCCION: readonly FilaCoccion[] = [
  // --- granos -------------------------------------------------------------
  ['Arroz blanco cocido', 365, 130, '168877/168878 Rice, white, long-grain, regular, enriched'],
  ['Arroz jazmin cocido', 365, 130, '168877/168878 Rice, white, long-grain, regular, enriched'],
  ['Arroz basmati cocido', 365, 130, '168877/168878 Rice, white, long-grain, regular, enriched'],
  ['Arroz carnaroli cocido (para risotto)', 360, 130, '168879/168880 Rice, white, medium-grain, enriched'],
  ['Arroz integral cocido', 367, 123, '169703/169704 Rice, brown, long-grain'],
  ['Arroz yamaní cocido', 367, 123, '169703/169704 Rice, brown, long-grain'],
  ['Arroz salvaje cocido', 357, 101, '169726/168897 Wild rice'],
  ['Fideos cocidos', 371, 158, '169736/169737 Pasta, enriched, without added salt'],
  ['Quinoa cocida', 368, 120, '168874/168917 Quinoa'],
  ['Quinoa roja cocida', 368, 120, '168874/168917 Quinoa'],
  ['Cuscus cocido', 376, 112, '169699/169700 Couscous'],
  ['Mijo pelado cocido', 378, 119, '169702/168871 Millet'],
  ['Trigo burgol cocido', 342, 83, '170688/170287 Bulgur'],
  ['Cebada perlada cocida', 352, 123, '170284/170285 Barley, pearled'],

  // --- legumbres ----------------------------------------------------------
  ['Lentejas cocidas', 352, 116, '172420/172421 Lentils, boiled, without salt'],
  ['Lentejon cocido', 352, 116, '172420/172421 Lentils, boiled, without salt'],
  ['Garbanzos cocidos', 378, 164, '173756/173757 Chickpeas, mature seeds, boiled'],
  // El generico del lote 1 va con la alubia, que es lo que se entiende por
  // "porotos" aca.
  ['Porotos cocidos', 333, 139, '175202/175203 Beans, white, mature seeds, boiled'],
  ['Porotos alubias cocidos', 333, 139, '175202/175203 Beans, white, mature seeds, boiled'],
  ['Porotos colorados cocidos', 337, 127, '173744/175194 Beans, kidney, red, mature seeds, boiled'],
  ['Porotos negros cocidos', 341, 132, '173734/173735 Beans, black, mature seeds, boiled'],
  ['Porotos pallares cocidos', 338, 115, '174252/174253 Lima beans, large, mature seeds, boiled'],
  // El poroto manteca es un pallar grande: mismo par.
  ['Porotos manteca cocidos', 338, 115, '174252/174253 Lima beans, large, mature seeds, boiled'],
  ['Soja en porotos cocida', 446, 172, '174270/174271 Soybeans, mature seeds, boiled'],

  // --- aves ---------------------------------------------------------------
  ['Pechuga de pollo a la plancha', 120, 165, '171077/171477 Chicken breast, meat only, roasted'],
  ['Pechuga de pollo hervida', 120, 151, '171077/171478 Chicken breast, meat only, stewed'],
  ['Pata muslo sin piel', 120, 174, '173619/172380 Chicken leg, meat only, roasted'],
  ['Pata de pollo sin piel al horno', 120, 174, '173619/172380 Chicken leg, meat only, roasted'],
  ['Muslo de pollo sin piel al horno', 121, 179, '173627/172388 Chicken thigh, meat only, roasted'],
  ['Pechuga de pavo asada al horno', 114, 147, '171098/171496 Turkey breast, meat only, roasted'],

  // --- vaca (solo lo magro) -------------------------------------------------
  ['Bife de lomo', 153, 200, '171812/171811 Beef tenderloin steak, lean, 1/8", broiled'],
  ['Bife angosto a la plancha', 138, 189, '171814/171813 Beef top loin steak, lean, 1/8", broiled'],
  ['Cuadril a la plancha', 131, 178, '174055/174054 Beef top sirloin steak, lean, 1/8", broiled'],
  ['Nalga a la plancha', 121, 162, '171757/168649 Beef top round steak, lean, 0", grilled'],
  ['Peceto al horno', 121, 163, '173998/170633 Beef eye of round roast, lean, 0", roasted'],

  // --- cerdo --------------------------------------------------------------
  // Carre y chuleta con el par de magro y grasa: el magro solo da 162 cocido
  // y no cierra contra los 210 y 230 de la semilla.
  ['Carre de cerdo', 201, 229, '168286/168298 Pork loin center chops, boneless, lean and fat, pan-broiled'],
  ['Chuleta de cerdo a la plancha', 201, 229, '168286/168298 Pork loin center chops, boneless, lean and fat, pan-broiled'],
  ['Solomillo de cerdo a la plancha', 109, 143, '168249/168250 Pork tenderloin, lean, roasted'],
  ['Lomo de cerdo asado magro', 109, 143, '168249/168250 Pork tenderloin, lean, roasted'],
  ['Pernil de cerdo asado al horno', 136, 211, '168224/168225 Pork leg (ham), whole, lean, roasted'],

  // --- pescados y mariscos --------------------------------------------------
  // Merluza y brotola con el bacalao: USDA no tiene ninguna de las dos, y son
  // pescados blancos de la misma familia.
  ['Merluza a la plancha', 82, 105, '171955/171956 Fish, cod, Atlantic, dry heat'],
  ['Brotola a la plancha', 82, 105, '171955/171956 Fish, cod, Atlantic, dry heat'],
  ['Brotola al horno', 82, 105, '171955/171956 Fish, cod, Atlantic, dry heat'],
  ['Pez espada a la plancha', 144, 172, '173703/173704 Fish, swordfish, dry heat'],
  ['Langostinos hervidos', 85, 99, '175179/175180 Crustaceans, shrimp'],
];

/** Dos decimales: mas precision que eso no la tiene ni la tabla de USDA. */
export function factorDeFila(fila: FilaCoccion): number {
  return Math.round((fila[1] / fila[2]) * 100) / 100;
}

/**
 * Los alimentos de la semilla y nada mas: sin codigo de barras, fuente
 * 'manual' y verificados. Un alimento que el usuario cargo a mano con el
 * mismo nombre queda en verificado 0, y no se toca: sus valores son suyos.
 */
const ES_SEMILLA = "codigo_barras IS NULL AND fuente = 'manual' AND verificado = 1";

/**
 * Aplica la tabla si su version es mas nueva que la ultima aplicada.
 *
 * Primero limpia los factores de toda la semilla y despues escribe los de la
 * tabla: asi un alimento que se saca de la lista pierde su factor, en vez de
 * quedarse con el viejo para siempre. Todo en una transaccion con la marca
 * adentro, igual que sembrarAlimentos().
 *
 * Tiene que correr DESPUES de sembrarAlimentos: en una base nueva, las filas
 * a las que les pone el factor recien existen cuando termino la semilla.
 */
export async function sembrarFactoresCoccion(db: SQLite.SQLiteDatabase): Promise<number> {
  const aplicada = Number((await leerMeta(db, CLAVE)) ?? 0) || 0;
  if (aplicada >= VERSION_COCCION) return 0;

  let actualizados = 0;
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `UPDATE alimento SET factor_coccion = NULL, estado_base = NULL WHERE ${ES_SEMILLA}`,
    );
    for (const fila of FILAS_COCCION) {
      const r = await db.runAsync(
        `UPDATE alimento SET factor_coccion = ?, estado_base = 'cocido', updated_at = ?
         WHERE nombre = ? AND ${ES_SEMILLA}`,
        [factorDeFila(fila), new Date().toISOString(), fila[0]],
      );
      actualizados += r.changes;
    }
    await escribirMeta(db, CLAVE, String(VERSION_COCCION));
  });

  console.log(
    `[db] factores de coccion v${VERSION_COCCION}: ${actualizados}/${FILAS_COCCION.length} alimentos`,
  );
  return actualizados;
}
