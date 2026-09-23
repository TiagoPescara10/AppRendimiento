// Base de alimentos argentinos - Lote 3 (115 alimentos adicionales).
//
// Fuente oficial de datos nutricionales:
// U.S. Department of Agriculture, Agricultural Research Service. FoodData Central, 2024-2025.
// Publicado bajo dedicacion de dominio publico CC0 1.0 Universal (CC0 1.0 Public Domain Dedication).
// https://fdc.nal.usda.gov/
//
// Cita requerida:
// "U.S. Department of Agriculture, Agricultural Research Service. FoodData Central, 2024-2025. fdc.nal.usda.gov."
//
// Mismo formato y criterio que los Lotes 1 y 2 (alimentos-ar.ts y alimentos-ar-lote2.ts):
// Valores por 100 g del producto tal como se come (cocido cuando corresponde).
// Porciones tipicas en espanol rioplatense con exactamente una predeterminada (*).
//
// Campos: nombre, categoria, kcal, proteina, carbohidratos, grasa, fibra, porciones
// Porciones: "nombre:gramos" separadas por |. El * marca la preseleccionada.

import type { AlimentoSemilla, CategoriaAlimento, PorcionTipica } from './alimentos-ar';

type FilaCruda = [string, CategoriaAlimento, number, number, number, number, number, string];

const CRUDO_LOTE3: FilaCruda[] = [
  // === TANDA 1: PESCADOS Y MARISCOS PREPARADOS (18 alimentos) ===
  ["Brotola al horno", 'carnes', 105, 21, 0, 2.2, 0, '1 filet:160*|1 filet grande:220'],
  ["Brotola a la plancha", 'carnes', 110, 22, 0, 2.5, 0, '1 filet:160*'],
  ["Merluza al horno con tomate y cebolla", 'carnes', 115, 17, 3.5, 3.5, 0.8, '1 porcion:220*|1 porcion grande:300'],
  ["Filet de atun fresco a la plancha", 'carnes', 140, 26, 0, 3.8, 0, '1 bife:150*|1 bife grande:220'],
  ["Pez espada a la plancha", 'carnes', 155, 24, 0, 6.5, 0, '1 bife:180*'],
  ["Salmon ahumado en fetas", 'carnes', 170, 21, 0, 9.5, 0, '2 fetas:50*|4 fetas:100'],
  ["Arenque en conserva escurrido", 'carnes', 215, 18, 0, 16, 0, '1 filet chico:80*|1 porcion:120'],
  ["Anchoas en aceite escurridas", 'carnes', 210, 28, 0, 10.5, 0, '4 filetes:20*|8 filetes:40'],
  ["Langostinos hervidos", 'carnes', 100, 22, 0.5, 1.2, 0, '1 porcion:120*|1 porcion grande:200'],
  ["Camarones al vapor", 'carnes', 95, 20.5, 0.5, 1.1, 0, '1 taza:120*|1 porcion:180'],
  ["Calamar hervido", 'carnes', 92, 16.5, 1.5, 1.4, 0, '1 porcion:150*|1 porcion grande:250'],
  ["Tentaculos de calamar a la plancha", 'carnes', 135, 21, 2, 4.8, 0, '1 porcion:160*'],
  ["Pulpo hervido", 'carnes', 85, 15, 2.2, 1.1, 0, '1 porcion:150*'],
  ["Pulpo a la gallega", 'carnes', 145, 15, 3, 8, 0.5, '1 plato:200*|1 porcion chica:120'],
  ["Almejas al vapor", 'carnes', 80, 13.5, 3, 1.1, 0, '1 plato hondo:180*'],
  ["Berberechos al natural", 'carnes', 75, 13, 2.5, 0.8, 0, '1 porcion:100*'],
  ["Vieiras salteadas a la plancha", 'carnes', 110, 18, 3.5, 2.5, 0, '6 unidades:100*|12 unidades:200'],
  ["Chupin de pescado tradicional", 'carnes', 125, 14, 6.5, 4.5, 1.2, '1 plato hondo:320*'],

  // === TANDA 2: CORTES Y PREPARACIONES DE CARNE (28 alimentos) ===
  ["T-bone a la plancha", 'carnes', 235, 26, 0, 14.5, 0, '1 bife con hueso:350*'],
  ["Bife angosto a la plancha", 'carnes', 215, 27, 0, 11.8, 0, '1 bife:220*|1 bife grande:300'],
  ["Tapa de nalga asada al horno", 'carnes', 205, 27, 0, 10.5, 0, '1 porcion:180*|1 porcion grande:250'],
  ["Palomita al horno con verduras", 'carnes', 185, 24, 4, 7.8, 1, '1 porcion:220*'],
  ["Tortuguita braseada al vino tinto", 'carnes', 195, 26, 2, 9, 0.5, '1 porcion:200*|1 porcion grande:280'],
  ["Aguja a la cacerola con verduras", 'carnes', 220, 23, 4.5, 12, 1, '1 plato:260*'],
  ["Azotillo al horno", 'carnes', 210, 25, 0, 12.2, 0, '1 porcion:180*'],
  ["Estofado de ternera casero", 'carnes', 165, 19, 6, 7, 1.2, '1 plato hondo:300*'],
  ["Carne mechada con zanahoria y panceta", 'carnes', 215, 24, 2, 12.5, 0.4, '2 rodajas:160*|3 rodajas:240'],
  ["Brochette de carne vacuna con vegetales", 'carnes', 175, 22, 4, 7.8, 1.1, '2 brochettes:200*'],
  ["Lengua a la vinagreta casera", 'carnes', 190, 17, 2, 12.8, 0.4, '3 rodajas:120*|5 rodajas:200'],
  ["Pernil de cerdo asado al horno", 'carnes', 210, 27, 0, 11, 0, '1 porcion:180*|1 porcion grande:250'],
  ["Bondiola braseada a la cerveza", 'carnes', 255, 23, 3.5, 16.5, 0.3, '1 porcion:200*'],
  ["Carre de cerdo al horno con batatas", 'carnes', 195, 22, 10, 7.2, 1.2, '1 plato:280*'],
  ["Lomo de cerdo asado magro", 'carnes', 160, 28, 0, 5, 0, '2 medallones:160*|3 medallones:240'],
  ["Costillitas de cordero a la plancha", 'carnes', 270, 23, 0, 19.5, 0, '2 costillitas:160*|3 costillitas:240'],
  ["Paleta de cordero al horno con romero", 'carnes', 240, 24, 0, 15.8, 0, '1 porcion:200*'],
  ["Cordero asado a la parrilla", 'carnes', 260, 23, 0, 18.5, 0, '1 porcion:200*|1 porcion grande:300'],
  ["Costillar de cordero al horno", 'carnes', 280, 21, 0, 21.5, 0, '1 porcion:180*'],
  ["Pechuga de pavo asada al horno", 'carnes', 145, 30, 0, 2.5, 0, '1 porcion:150*|1 porcion grande:220'],
  ["Pechuga de pavo en fetas", 'carnes', 110, 22, 1.5, 1.8, 0, '3 fetas:60*|5 fetas:100'],
  ["Pata de pavo asada al horno", 'carnes', 180, 27, 0, 7.8, 0, '1 pata:220*'],
  ["Albondigas de pollo con salsa liviana", 'carnes', 160, 17, 6, 7.2, 0.9, '4 albondigas:220*'],
  ["Brochette de pollo con vegetales", 'carnes', 145, 23, 4, 3.8, 1.1, '2 brochettes:200*'],
  ["Salteado de pollo tipo wok con verduras", 'carnes', 135, 18, 5, 4.5, 1.5, '1 plato:280*'],
  ["Suprema de pollo rellena con jamon y queso", 'carnes', 230, 26, 6, 10.8, 0.4, '1 suprema:220*'],
  ["Suprema de pollo rellena con espinaca y ricota", 'carnes', 185, 25, 4, 7.2, 1.2, '1 suprema:220*'],
  ["Higado encebollado a la sarten", 'carnes', 180, 23, 6.5, 6.8, 1, '1 porcion:180*'],

  // === TANDA 3: PREPARACIONES CON HUEVO (18 alimentos) ===
  ["Huevo pasado por agua", 'lacteos', 145, 12.6, 0.8, 10, 0, '1 huevo:55|2 huevos:110*'],
  ["Huevos al plato con salsa de tomate", 'lacteos', 130, 9.5, 4.5, 8, 0.8, '1 cazuela c/2 huevos:180*'],
  ["Huevos rancheros con salsa", 'lacteos', 160, 9, 11, 8.8, 1.5, '1 porcion c/2 huevos:200*'],
  ["Huevos rellenos con atun y mayonesa", 'lacteos', 215, 14, 2, 16.5, 0.2, '2 mitades:70|4 mitades:140*'],
  ["Huevos rellenos con palta y ciboulette", 'lacteos', 175, 9.5, 3.5, 13.5, 2.2, '2 mitades:70|4 mitades:140*'],
  ["Omelette frances clasico", 'lacteos', 175, 12, 1, 13.8, 0, '1 omelette c/2 huevos:120*'],
  ["Omelette de jamon y queso", 'lacteos', 225, 17, 2, 16.5, 0, '1 omelette:150*'],
  ["Omelette de champinones y queso", 'lacteos', 180, 13.5, 3, 12.5, 0.8, '1 omelette:150*'],
  ["Omelette de espinaca y queso", 'lacteos', 170, 13, 3, 11.5, 1.2, '1 omelette:150*'],
  ["Omelette caprese con albahaca", 'lacteos', 185, 14, 3.5, 12.5, 0.6, '1 omelette:150*'],
  ["Omelette de claras con atun y queso blanco", 'lacteos', 105, 18, 2, 2.5, 0, '1 omelette:160*'],
  ["Revuelto de huevo con jamon cocido", 'lacteos', 170, 14, 1.2, 12, 0, '1 plato:160*'],
  ["Revuelto de huevo con champinones y perejil", 'lacteos', 135, 10.5, 2.5, 9, 0.8, '1 plato:160*'],
  ["Revuelto de zapallitos con cebolla y huevo", 'guarniciones', 90, 5.5, 4.5, 5.2, 1.6, '1 plato hondo:240*'],
  ["Tortilla individual de cebolla", 'guarniciones', 140, 6.5, 9, 8.5, 1.8, '1 tortilla chica:160*'],
  ["Frittata de verduras al horno", 'guarniciones', 120, 8.5, 5.5, 6.8, 1.8, '1 porcion:180*'],
  ["Souffle de queso individual", 'guarniciones', 190, 11, 8, 12.2, 0.4, '1 cazoleta:140*'],
  ["Shakshuka con morron y tomate", 'guarniciones', 115, 7, 6.5, 6.5, 1.6, '1 plato c/2 huevos:220*'],

  // === TANDA 4: LACTEOS Y QUESOS (28 alimentos) ===
  ["Leche sin lactosa entera", 'lacteos', 61, 3.2, 4.8, 3.3, 0, '1 taza:200*|1 vaso:250'],
  ["Leche sin lactosa descremada", 'lacteos', 35, 3.4, 5, 0.1, 0, '1 taza:200*|1 vaso:250'],
  ["Queso port salut light", 'lacteos', 210, 24, 2, 12, 0, '1 feta:25*|1 porcion:60'],
  ["Queso untable saborizado con hierbas", 'lacteos', 160, 8, 4.5, 12, 0.3, '1 cucharada:20*|2 cucharadas:40'],
  ["Yogur bebible descremado", 'lacteos', 45, 3.2, 7.5, 0.1, 0, '1 botellita:200*|1 vaso:250'],
  ["Queso cottage bajo en grasa", 'lacteos', 85, 11.5, 4, 2.2, 0, '1 pote chico:150*|3 cucharadas:90'],
  ["Queso cottage entero", 'lacteos', 105, 11.5, 3.5, 4.5, 0, '1 pote chico:150*|3 cucharadas:90'],
  ["Queso ricota cremosa magra", 'lacteos', 115, 12, 4.5, 5.5, 0, '2 cucharadas colmadas:80*|1 taza:180'],
  ["Queso mascarpone", 'lacteos', 410, 4.5, 3.5, 42, 0, '1 cucharada:25*|2 cucharadas:50'],
  ["Queso feta en salmuera", 'lacteos', 265, 14.5, 4, 21, 0, '1 trozo:40*|1 taza desmenuzado:100'],
  ["Queso Edam", 'lacteos', 355, 25, 1.4, 27.5, 0, '1 feta:30*|1 porcion:60'],
  ["Queso Emmental con ojos", 'lacteos', 380, 28, 1.5, 29, 0, '1 feta:30*|1 porcion:60'],
  ["Queso Parmesano rallado fino", 'lacteos', 420, 36, 3.5, 29, 0, '1 cucharada sopera:15*|2 cucharadas:30'],
  ["Queso Pecorino romano", 'lacteos', 390, 26, 3, 31, 0, '1 trozo:30*|1 porcion:60'],
  ["Queso Provolone curado", 'lacteos', 370, 26, 2.2, 28.5, 0, '1 feta gruesa:40*|1 porcion:70'],
  ["Queso Halloumi a la plancha", 'lacteos', 320, 21, 2, 25, 0, '2 rodajas:80*|3 rodajas:120'],
  ["Queso Camembert", 'lacteos', 300, 20, 0.5, 24, 0, '1 triangulo:40*|1 porcion:70'],
  ["Queso Gorgonzola", 'lacteos', 350, 21, 2, 28.5, 0, '1 trozo:40*|1 porcion:70'],
  ["Queso blanco tipo Finlandia light", 'lacteos', 135, 9.5, 5, 8.5, 0, '1 cucharada:25*|2 cucharadas:50'],
  ["Queso crema doble crema", 'lacteos', 345, 6, 4, 34, 0, '1 cucharada:25*'],
  ["Yogur griego natural entero", 'lacteos', 95, 8.8, 4.5, 4.5, 0, '1 pote:150*|1 taza:200'],
  ["Yogur griego descremado natural", 'lacteos', 59, 10, 3.6, 0.4, 0, '1 pote:150*|1 taza:200'],
  ["Yogur griego descremado con frutos rojos", 'lacteos', 85, 8.5, 12, 0.4, 0.6, '1 pote:150*'],
  ["Kefir natural de leche", 'lacteos', 58, 3.3, 4.5, 3.0, 0, '1 vaso:200*|1 taza:250'],
  ["Leche condensada tradicional", 'lacteos', 320, 7.5, 54, 8.5, 0, '1 cucharada:20*|2 cucharadas:40'],
  ["Leche condensada descremada", 'lacteos', 275, 8.5, 58, 0.5, 0, '1 cucharada:20*'],
  ["Leche evaporada", 'lacteos', 135, 6.8, 10, 7.5, 0, '1/2 taza:120*'],
  ["Leche de cabra fluida", 'lacteos', 69, 3.6, 4.5, 4.1, 0, '1 vaso:200*'],

  // === TANDA 5: CEREALES Y LEGUMBRES PREPARADOS (23 alimentos) ===
  ["Arroz jazmin cocido", 'legumbres', 130, 2.7, 28.5, 0.4, 0.5, '1 plato:220*|1 porcion chica:150'],
  ["Arroz salvaje cocido", 'legumbres', 105, 4, 21.5, 0.3, 1.8, '1 plato:200*'],
  ["Arroz salteado con verduras tipo chaufan", 'guarniciones', 145, 3.8, 25, 3.2, 1.8, '1 plato:250*'],
  ["Risotto de calabaza casero", 'legumbres', 150, 3.5, 24, 4.2, 1.6, '1 plato:250*'],
  ["Arroz amarillo con azafran", 'legumbres', 135, 2.8, 27, 1.5, 0.8, '1 plato:220*'],
  ["Quinoa roja cocida", 'legumbres', 120, 4.4, 21, 1.9, 2.8, '1 plato:200*'],
  ["Quinoa con pollo y vegetales fria", 'legumbres', 155, 11, 18, 3.8, 2.2, '1 bowl:260*'],
  ["Couscous con vegetales salteados", 'guarniciones', 135, 3.8, 24, 2.5, 2, '1 plato:220*'],
  ["Avena cocida porridge con agua", 'guarniciones', 70, 2.5, 12, 1.4, 1.8, '1 bowl:250*'],
  ["Avena cocida porridge con leche", 'guarniciones', 110, 4.8, 16, 2.8, 1.8, '1 bowl:250*'],
  ["Avena horneada simple", 'panificados', 190, 6.5, 32, 3.8, 3.5, '1 porcion:120*'],
  ["Pudding de chia con leche y vainilla", 'lacteos', 115, 4.5, 9, 6.5, 4.5, '1 frasco individual:160*'],
  ["Curry de garbanzos con tomate", 'legumbres', 135, 5.5, 18, 4.2, 4.2, '1 plato hondo:280*'],
  ["Garbanzos especiados crocantes al horno", 'snacks', 180, 8.5, 26, 4.5, 6, '1 puñado:40*|1 taza:80'],
  ["Pasta de porotos blancos al limon y oliva", 'legumbres', 145, 6.5, 17, 5.2, 4.5, '2 cucharadas colmadas:60*|1 pote chico:150'],
  ["Ensalada tibia de garbanzos y espinaca", 'guarniciones', 125, 5.8, 15, 4.5, 3.8, '1 bowl:240*'],
  ["Ensalada de porotos negros choclo y palta", 'guarniciones', 140, 5, 17, 5.5, 4.5, '1 bowl:240*'],
  ["Guiso de lentejas vegetariano", 'guarniciones', 115, 6.5, 16, 2.5, 4.5, '1 plato hondo:300*'],
  ["Sopa crema de lentejas rojas", 'legumbres', 95, 5, 14, 1.8, 2.8, '1 plato hondo:280*'],
  ["Porotos tape cocidos", 'legumbres', 115, 7.5, 20, 0.5, 5.5, '1 plato:200*'],
  ["Edamame cocido al vapor con sal", 'legumbres', 120, 11.5, 9, 5, 5, '1 taza c/chaucha:150*|1/2 taza desgranado:80'],
  ["Tempeh a la plancha con soja", 'carnes', 195, 20, 7.5, 10.5, 1.5, '1 porcion:120*'],
  ["Hamburguesa de quinoa y calabaza casera", 'guarniciones', 165, 5.5, 26, 4.2, 3.2, '1 medallon:110*|2 medallones:220'],
];

function parsearPorciones(crudo: string): PorcionTipica[] {
  return crudo.split('|').map((parte) => {
    const predeterminada = parte.endsWith('*');
    const limpio = predeterminada ? parte.slice(0, -1) : parte;
    const corte = limpio.lastIndexOf(':');
    return {
      nombre: limpio.slice(0, corte),
      gramos: Number(limpio.slice(corte + 1)),
      predeterminada,
    };
  });
}

export const ALIMENTOS_AR_LOTE3: AlimentoSemilla[] = CRUDO_LOTE3.map(
  ([nombre, categoria, kcal, prot, carb, grasa, fibra, porciones]) => ({
    nombre,
    categoria,
    kcal_por_100g: kcal,
    proteina_g: prot,
    carbohidratos_g: carb,
    grasa_g: grasa,
    fibra_g: fibra,
    porciones: parsearPorciones(porciones),
  }),
);
