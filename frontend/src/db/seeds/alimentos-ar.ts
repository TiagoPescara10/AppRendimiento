// Base de alimentos argentinos.
//
// Valores por 100 g del producto TAL COMO SE COME (cocido cuando corresponde).
// Son promedios de tablas de composicion; la variacion real entre marcas y
// preparaciones es alta, sobre todo en frituras y cortes de carne. Sirven para
// estimar tendencias, no para nutricion clinica.
//
// Formato compacto a proposito: una linea por alimento. En formato objeto esto
// serian ~4500 lineas y nadie las revisa. El parser de abajo lo expande.
//
// Campos: nombre, categoria, kcal, proteina, carbohidratos, grasa, fibra, porciones
// Porciones: "nombre:gramos" separadas por |. El * marca la preseleccionada.

export type CategoriaAlimento =
  | 'carnes'
  | 'guarniciones'
  | 'masas'
  | 'panificados'
  | 'lacteos'
  | 'frutas'
  | 'verduras'
  | 'legumbres'
  | 'snacks'
  | 'bebidas'
  | 'condimentos'
  | 'suplementos';

// La definicion canonica vive en schema.ts, que es donde esta la columna que
// las guarda. Se re-exporta aca para no romper los imports que ya la tomaban
// de este archivo. Es `export type`: se borra al compilar y no crea un ciclo.
export type { PorcionTipica } from '../schema';
import type { PorcionTipica } from '../schema';

export interface AlimentoSemilla {
  nombre: string;
  categoria: CategoriaAlimento;
  kcal_por_100g: number;
  proteina_g: number;
  carbohidratos_g: number;
  grasa_g: number;
  fibra_g: number;
  porciones: PorcionTipica[];
}

type FilaCruda = [string, CategoriaAlimento, number, number, number, number, number, string];

// ---------------------------------------------------------------------------
// Convenciones de porciones
//
// Lo que se cuenta (empanadas, milanesas, huevos) va por unidad: es mas exacto
// y mas natural que chico/mediano/grande.
//
// Lo que se sirve en plato usa la escala chico / mediano / grande. Cada
// alimento ajusta los gramos a lo suyo: un plato de guiso pesa mucho mas que
// uno de ensalada.
// ---------------------------------------------------------------------------

const CRUDO: FilaCruda[] = [
  // === CARNES Y PESCADOS ===
  ['Milanesa de carne frita', 'carnes', 270, 18, 14, 16, 0.8, '1 chica:90|1 milanesa:130*|1 grande:180'],
  ['Milanesa de carne al horno', 'carnes', 200, 20, 13, 8, 0.8, '1 milanesa:130*|1 grande:180'],
  ['Milanesa de pollo frita', 'carnes', 250, 20, 14, 12, 0.8, '1 milanesa:120*|1 grande:170'],
  ['Milanesa de pollo al horno', 'carnes', 185, 22, 13, 5, 0.8, '1 milanesa:120*|1 grande:170'],
  ['Milanesa napolitana', 'carnes', 265, 19, 14, 15, 1, '1 napolitana:200*'],
  ['Milanesa de soja', 'carnes', 215, 14, 20, 9, 3.5, '1 milanesa:90*|2 milanesas:180'],
  ['Milanesa de berenjena', 'carnes', 195, 5, 22, 10, 3, '1 milanesa:100*'],
  ['Asado de tira', 'carnes', 290, 22, 0, 22, 0, '1 tira:150|Porcion:250*|Porcion grande:400'],
  ['Vacio', 'carnes', 240, 24, 0, 16, 0, 'Porcion:200*|Porcion grande:350'],
  ['Bife de chorizo', 'carnes', 250, 25, 0, 17, 0, '1 bife:250*|1 bife grande:350'],
  ['Bife de lomo', 'carnes', 195, 27, 0, 9, 0, '1 bife:200*'],
  ['Cuadril a la plancha', 'carnes', 190, 27, 0, 9, 0, 'Porcion:200*'],
  ['Nalga a la plancha', 'carnes', 175, 29, 0, 6, 0, 'Porcion:200*'],
  ['Peceto al horno', 'carnes', 170, 29, 0, 5, 0, 'Porcion:180*'],
  ['Matambre a la pizza', 'carnes', 265, 20, 4, 19, 0.5, 'Porcion:180*'],
  ['Entrana', 'carnes', 265, 24, 0, 19, 0, 'Porcion:200*'],
  ['Costilla de cerdo', 'carnes', 290, 22, 0, 22, 0, 'Porcion:200*'],
  ['Bondiola de cerdo', 'carnes', 270, 22, 0, 20, 0, 'Porcion:200*'],
  ['Carre de cerdo', 'carnes', 210, 26, 0, 12, 0, '1 chuleta:180*'],
  ['Chorizo', 'carnes', 340, 16, 1, 30, 0, '1 chorizo:100*|2 chorizos:200'],
  ['Morcilla', 'carnes', 320, 12, 4, 28, 0, '1 morcilla:90*'],
  ['Mollejas', 'carnes', 300, 20, 0, 24, 0, 'Porcion:150*'],
  ['Chinchulines', 'carnes', 280, 18, 0, 23, 0, 'Porcion:150*'],
  ['Rinones', 'carnes', 130, 20, 1, 5, 0, 'Porcion:150*'],
  ['Higado a la plancha', 'carnes', 175, 26, 4, 6, 0, 'Porcion:150*'],
  ['Carne picada comun', 'carnes', 250, 18, 0, 20, 0, 'Porcion:150*'],
  ['Carne picada especial', 'carnes', 190, 18, 0, 12.8, 0, 'Porcion:150*'],
  ['Hamburguesa casera de carne', 'carnes', 260, 19, 3, 19, 0, '1 hamburguesa:120*|2 hamburguesas:240'],
  ['Hamburguesa de paquete', 'carnes', 250, 15, 6, 18, 0.5, '1 hamburguesa:80*|2 hamburguesas:160'],
  ['Albondigas con salsa', 'carnes', 190, 14, 8, 11, 1, 'Porcion:250*'],
  ['Pechuga de pollo a la plancha', 'carnes', 165, 31, 0, 3.6, 0, 'Media pechuga:85|1 pechuga:170*'],
  ['Pollo al horno con piel', 'carnes', 220, 26, 0, 13, 0, '1 pata muslo:180*|1/4 de pollo:300'],
  ['Pata muslo sin piel', 'carnes', 170, 26, 0, 7, 0, '1 pata muslo:150*'],
  ['Pollo al spiedo', 'carnes', 240, 25, 1, 15, 0, '1/4 de pollo:280*|Medio pollo:550'],
  ['Suprema de pollo', 'carnes', 245, 22, 13, 12, 0.8, '1 suprema:180*'],
  ['Nuggets de pollo', 'carnes', 290, 15, 18, 18, 1, '6 unidades:100*|10 unidades:170'],
  ['Merluza a la plancha', 'carnes', 90, 18, 0, 1.5, 0, '1 filet:150*'],
  ['Merluza rebozada', 'carnes', 215, 15, 15, 11, 0.7, '1 filet:150*'],
  ['Salmon a la plancha', 'carnes', 210, 22, 0, 13, 0, 'Porcion:150*'],
  // USDA Foundation mide 90 kcal y 19g P en atun al natural escurrido. El rotulado argentino suele declarar 110 kcal y 24g P.
  ['Atun al natural en lata', 'carnes', 90, 19, 0, 1, 0, '1 lata escurrida:120*'],
  ['Atun en aceite en lata', 'carnes', 190, 22, 0, 11, 0, '1 lata escurrida:120*'],
  ['Sardinas en lata', 'carnes', 200, 22, 0, 12, 0, '1 lata:90*'],
  ['Caballa en lata', 'carnes', 180, 20, 0, 11, 0, '1 lata escurrida:120*'],
  ['Jamon cocido', 'carnes', 145, 18, 1.5, 7, 0, '1 feta:20|3 fetas:60*'],
  ['Jamon crudo', 'carnes', 240, 30, 0, 13, 0, '2 fetas:30*'],
  ['Salame', 'carnes', 390, 22, 2, 32, 0, '5 fetas:30*'],
  ['Mortadela', 'carnes', 310, 15, 3, 26, 0, '2 fetas:40*'],
  ['Panceta', 'carnes', 540, 12, 0, 54, 0, '2 fetas:30*'],
  ['Salchicha', 'carnes', 300, 12, 3, 27, 0, '1 salchicha:50*|2 salchichas:100'],
  ['Arrollado de pollo', 'carnes', 200, 18, 3, 13, 0, '2 fetas:60*'],

  // === GUARNICIONES Y PLATOS ===
  ['Pure de papas', 'guarniciones', 90, 2, 14, 3, 1.5, 'Chico:120|Mediano:200*|Grande:300'],
  ['Pure mixto de papa y calabaza', 'guarniciones', 75, 1.8, 13, 2, 2, 'Mediano:200*'],
  ['Papas fritas', 'guarniciones', 310, 3.4, 41, 15, 3.5, 'Chica:120|Normal:200*|Para compartir:350'],
  ['Papas al horno', 'guarniciones', 150, 3, 27, 4, 2.5, 'Normal:200*'],
  ['Papas noisette', 'guarniciones', 250, 3, 33, 12, 2.5, 'Porcion:150*'],
  ['Bastones de mandioca fritos', 'guarniciones', 290, 2, 40, 14, 2.5, 'Porcion:150*'],
  ['Arroz blanco cocido', 'guarniciones', 130, 2.7, 28, 0.3, 0.4, 'Media taza:90|1 plato:200*|Plato grande:300'],
  ['Arroz integral cocido', 'guarniciones', 120, 2.6, 25, 1, 1.8, '1 plato:200*'],
  ['Arroz con pollo', 'guarniciones', 145, 9, 19, 4, 1, 'Plato mediano:350*|Plato grande:450'],
  ['Risotto', 'guarniciones', 160, 4, 24, 5, 0.8, 'Plato mediano:300*'],
  ['Fideos cocidos', 'guarniciones', 158, 5.8, 31, 0.9, 1.8, '1 plato:250*|Plato grande:380'],
  ['Fideos con salsa de tomate', 'guarniciones', 130, 4.5, 24, 2, 2, 'Plato mediano:300*|Plato grande:450'],
  ['Fideos con tuco y carne', 'guarniciones', 160, 8, 22, 5, 2, 'Plato mediano:350*|Plato grande:480'],
  ['Fideos con crema', 'guarniciones', 200, 6, 26, 8, 1.5, 'Plato mediano:300*'],
  ['Nioquis con salsa', 'guarniciones', 165, 4.5, 30, 3, 1.8, 'Plato mediano:300*|Plato grande:420'],
  ['Ravioles con salsa', 'guarniciones', 185, 8, 26, 5, 1.8, 'Plato mediano:300*|Plato grande:420'],
  ['Sorrentinos con salsa', 'guarniciones', 210, 9, 26, 8, 1.5, 'Plato mediano:300*'],
  ['Canelones', 'guarniciones', 190, 10, 20, 8, 1.5, '2 canelones:250*|3 canelones:375'],
  ['Lasagna', 'guarniciones', 200, 11, 18, 9, 1.5, 'Porcion:280*'],
  ['Polenta cocida', 'guarniciones', 85, 2, 18, 0.5, 1, '1 plato:250*'],
  ['Polenta con salsa', 'guarniciones', 110, 3.5, 18, 3, 1.5, 'Plato mediano:300*'],
  ['Faina', 'guarniciones', 180, 6, 20, 8, 3, '1 porcion:100*'],
  ['Tortilla de papa', 'guarniciones', 170, 6, 15, 10, 1.5, '1 porcion:150*|Porcion grande:250'],
  ['Guiso de lentejas', 'guarniciones', 110, 6, 15, 3, 4, 'Plato mediano:350*|Plato grande:500'],
  ['Guiso de fideos', 'guarniciones', 125, 6, 17, 4, 1.5, 'Plato mediano:350*|Plato grande:500'],
  ['Guiso de arroz', 'guarniciones', 120, 5, 18, 3, 1.2, 'Plato mediano:350*'],
  ['Locro', 'guarniciones', 130, 7, 14, 5, 3, 'Plato mediano:350*|Plato grande:500'],
  ['Puchero', 'guarniciones', 110, 9, 9, 4, 2, 'Plato mediano:400*'],
  ['Estofado de carne', 'guarniciones', 140, 12, 8, 7, 1.5, 'Plato mediano:300*'],
  ['Pastel de papa', 'guarniciones', 130, 8, 12, 5, 1.5, 'Chico:250|Mediano:350*|Grande:500'],
  ['Zapallitos rellenos', 'guarniciones', 100, 5, 8, 5, 2, '2 unidades:250*'],
  ['Humita en chala', 'guarniciones', 130, 4, 18, 5, 2.5, '1 unidad:200*'],
  ['Tamal', 'guarniciones', 190, 7, 22, 8, 2.5, '1 tamal:150*'],
  ['Sopa de verduras', 'guarniciones', 35, 1.5, 6, 0.5, 1.2, '1 plato:300*'],
  ['Sopa crema de calabaza', 'guarniciones', 60, 2, 9, 2, 1.5, '1 plato:300*'],
  ['Ensalada mixta', 'guarniciones', 25, 1, 4, 0.3, 1.5, 'Chica:100|1 plato:150*|Grande:250'],
  ['Ensalada rusa', 'guarniciones', 145, 2.5, 12, 10, 2, 'Porcion:150*'],
  ['Ensalada Waldorf', 'guarniciones', 170, 2, 14, 12, 2, 'Porcion:150*'],
  ['Ensalada cesar con pollo', 'guarniciones', 130, 10, 6, 8, 1.5, 'Plato mediano:300*'],
  ['Ensalada de tomate y cebolla', 'guarniciones', 30, 1, 5, 0.5, 1.5, '1 plato:150*'],
  ['Zapallo al horno', 'guarniciones', 45, 1, 10, 0.2, 1.5, 'Porcion:200*'],
  ['Berenjenas al escabeche', 'guarniciones', 130, 1.5, 6, 11, 3, 'Porcion:80*'],
  ['Revuelto de verduras', 'guarniciones', 70, 4, 6, 3.5, 2, 'Porcion:200*'],
  ['Tortilla de acelga', 'guarniciones', 130, 8, 6, 8, 2, '1 porcion:150*'],
  ['Croquetas de arroz', 'guarniciones', 230, 6, 28, 10, 1.5, '3 unidades:120*'],

  // === EMPANADAS, PIZZA, SANDWICHES ===
  ['Empanada de carne al horno', 'masas', 250, 9, 26, 12, 1.2, '1 empanada:100*|2 empanadas:200|3 empanadas:300'],
  ['Empanada de carne frita', 'masas', 310, 9, 27, 18, 1.2, '1 empanada:100*|2 empanadas:200|3 empanadas:300'],
  ['Empanada de jamon y queso', 'masas', 270, 11, 25, 14, 1, '1 empanada:100*|2 empanadas:200'],
  ['Empanada de pollo', 'masas', 240, 11, 26, 10, 1, '1 empanada:100*|2 empanadas:200'],
  ['Empanada de humita', 'masas', 250, 7, 30, 11, 1.5, '1 empanada:100*|2 empanadas:200'],
  ['Empanada de verdura', 'masas', 230, 7, 27, 10, 2, '1 empanada:100*|2 empanadas:200'],
  ['Empanada arabe', 'masas', 260, 11, 27, 12, 1.2, '1 empanada:90*|3 empanadas:270'],
  ['Pizza de muzzarella', 'masas', 270, 12, 30, 11, 2, '1 porcion:120*|2 porciones:240|Media pizza:400'],
  ['Pizza napolitana', 'masas', 260, 12, 29, 11, 2.2, '1 porcion:130*|2 porciones:260'],
  ['Pizza de jamon y morrones', 'masas', 265, 13, 29, 11, 2, '1 porcion:130*|2 porciones:260'],
  ['Pizza fugazzeta', 'masas', 290, 13, 30, 14, 2.2, '1 porcion:140*|2 porciones:280'],
  ['Pizza a la piedra', 'masas', 250, 12, 28, 10, 1.8, '1 porcion:100*|2 porciones:200'],
  ['Tarta de jamon y queso', 'masas', 230, 10, 20, 12, 1.5, '1 porcion:150*'],
  ['Tarta de verdura', 'masas', 195, 7, 20, 10, 2.5, '1 porcion:150*'],
  ['Tarta de choclo', 'masas', 210, 6, 25, 10, 2, '1 porcion:150*'],
  ['Choripan', 'masas', 300, 13, 26, 16, 1.5, '1 choripan:180*'],
  ['Sandwich de milanesa', 'masas', 260, 14, 27, 11, 2, '1 sandwich:280*'],
  ['Sandwich de miga de jamon y queso', 'masas', 280, 12, 32, 11, 1.5, '1 triple:70*|3 triples:210'],
  ['Sandwich de jamon y queso', 'masas', 265, 13, 30, 10, 1.8, '1 sandwich:150*'],
  ['Sandwich de lomito', 'masas', 250, 15, 25, 10, 1.8, '1 lomito:280*'],
  ['Hamburguesa completa', 'masas', 250, 13, 24, 12, 1.5, '1 hamburguesa:250*'],
  ['Pancho', 'masas', 270, 10, 27, 14, 1.2, '1 pancho:120*|2 panchos:240'],
  ['Tostado de jamon y queso', 'masas', 290, 15, 28, 13, 1.5, '1 tostado:120*'],
  ['Pebete de jamon y queso', 'masas', 275, 13, 31, 11, 1.5, '1 pebete:120*'],
  ['Prepizza con muzzarella', 'masas', 280, 12, 32, 11, 2, 'Media prepizza:150*'],

  // === PANIFICADOS ===
  ['Pan frances', 'panificados', 270, 9, 55, 1.5, 2.5, '1 rodaja:30|1 pancito:60*|Media flauta:120'],
  ['Pan lactal blanco', 'panificados', 265, 8, 49, 3.5, 2.5, '1 rebanada:28*|2 rebanadas:56'],
  ['Pan lactal integral', 'panificados', 245, 9, 43, 3.5, 6, '1 rebanada:28*|2 rebanadas:56'],
  ['Pan integral', 'panificados', 240, 10, 43, 3, 6.5, '1 rodaja:35*|2 rodajas:70'],
  ['Pan de salvado', 'panificados', 235, 10, 41, 3, 7, '1 rodaja:35*'],
  ['Pan casero', 'panificados', 280, 8, 54, 3.5, 2.5, '1 rodaja:50*'],
  ['Pan arabe', 'panificados', 275, 9, 55, 1.5, 2.5, '1 unidad:60*'],
  ['Pan de hamburguesa', 'panificados', 280, 9, 50, 5, 2, '1 pan:70*'],
  ['Medialuna de manteca', 'panificados', 400, 6, 45, 22, 1.5, '1 medialuna:40*|2 medialunas:80|3 medialunas:120'],
  ['Medialuna de grasa', 'panificados', 380, 6, 48, 18, 1.5, '1 medialuna:40*|2 medialunas:80'],
  ['Factura con dulce de leche', 'panificados', 380, 6, 50, 17, 1.5, '1 factura:60*|2 facturas:120'],
  ['Factura con crema pastelera', 'panificados', 360, 6, 48, 16, 1.2, '1 factura:60*'],
  ['Vigilante', 'panificados', 370, 6, 52, 15, 1.5, '1 vigilante:55*'],
  ['Churro relleno', 'panificados', 420, 5, 50, 22, 1.5, '1 churro:60*|2 churros:120'],
  ['Churro simple', 'panificados', 380, 5, 45, 20, 1.5, '1 churro:45*'],
  ['Bizcochos de grasa', 'panificados', 450, 7, 55, 22, 2, '4 unidades:40*'],
  ['Criollos', 'panificados', 400, 7, 52, 18, 2, '2 unidades:50*'],
  ['Galletitas de agua', 'panificados', 430, 10, 70, 12, 3, '4 galletitas:25*|Medio paquete:60'],
  ['Galletitas de salvado', 'panificados', 400, 10, 65, 11, 8, '4 galletitas:25*'],
  ['Galletitas dulces de vainilla', 'panificados', 450, 6, 72, 15, 2, '4 galletitas:30*'],
  ['Galletitas rellenas de chocolate', 'panificados', 480, 5, 68, 21, 2.5, '3 galletitas:35*|Paquete:120'],
  ['Tostadas de pan lactal', 'panificados', 300, 9, 56, 4, 3, '2 tostadas:50*'],
  ['Tostadas de arroz', 'panificados', 390, 8, 81, 3, 4, '3 unidades:25*'],
  ['Grisines', 'panificados', 400, 11, 70, 9, 3, '5 unidades:30*'],
  ['Budin de vainilla', 'panificados', 380, 5, 52, 17, 1, '1 rodaja:60*'],
  ['Bizcochuelo', 'panificados', 330, 6, 50, 12, 1, '1 porcion:70*'],
  ['Torta de chocolate', 'panificados', 390, 5, 50, 19, 2, '1 porcion:100*'],
  ['Pastafrola', 'panificados', 340, 5, 55, 11, 1.5, '1 porcion:90*'],
  ['Facturas surtidas', 'panificados', 390, 6, 48, 19, 1.5, '1 factura:50*|3 facturas:150'],

  // === LACTEOS Y HUEVOS ===
  ['Leche entera', 'lacteos', 61, 3.2, 4.8, 3.3, 0, '1 taza:200*|1 vaso:250'],
  ['Leche descremada', 'lacteos', 35, 3.4, 5, 0.1, 0, '1 taza:200*|1 vaso:250'],
  ['Leche chocolatada', 'lacteos', 80, 3.2, 12, 2.2, 0.3, '1 vaso:250*'],
  ['Yogur natural entero', 'lacteos', 61, 3.5, 4.7, 3.3, 0, '1 pote:190*'],
  ['Yogur descremado', 'lacteos', 42, 4, 6, 0.2, 0, '1 pote:190*'],
  ['Yogur con frutas', 'lacteos', 85, 3.2, 14, 2, 0.3, '1 pote:190*'],
  ['Yogur bebible', 'lacteos', 75, 3, 12, 1.5, 0, '1 botellita:200*'],
  ['Yogur griego', 'lacteos', 100, 9, 4, 5, 0, '1 pote:150*'],
  ['Queso cremoso', 'lacteos', 300, 20, 2, 24, 0, '1 feta:25*|1 porcion:60'],
  ['Queso port salut', 'lacteos', 320, 21, 1.5, 26, 0, '1 feta:25*|1 porcion:60'],
  ['Queso port salut descremado', 'lacteos', 220, 24, 2, 13, 0, '1 feta:25*'],
  ['Muzzarella', 'lacteos', 280, 22, 2, 21, 0, '1 feta:30*|1 porcion:80'],
  ['Queso rallado', 'lacteos', 390, 32, 3, 28, 0, '1 cucharada:10*|2 cucharadas:20'],
  ['Queso untable entero', 'lacteos', 240, 7, 4, 22, 0, '1 cucharada:20*'],
  ['Queso untable descremado', 'lacteos', 130, 10, 5, 8, 0, '1 cucharada:20*'],
  ['Queso de maquina', 'lacteos', 330, 22, 2, 26, 0, '2 fetas:40*'],
  ['Provoleta', 'lacteos', 350, 24, 2, 28, 0, '1 porcion:80*'],
  ['Ricota entera', 'lacteos', 170, 11, 3, 13, 0, '1 porcion:100*'],
  ['Ricota descremada', 'lacteos', 100, 13, 3, 4, 0, '1 porcion:100*'],
  ['Queso roquefort', 'lacteos', 350, 21, 2, 29, 0, '1 porcion:40*'],
  ['Dulce de leche', 'lacteos', 315, 6, 55, 7, 0, '1 cucharada:20*|2 cucharadas:40'],
  ['Manteca', 'lacteos', 717, 0.9, 0.1, 81, 0, '1 cucharadita:8*|1 cucharada:15'],
  ['Margarina', 'lacteos', 630, 0.5, 0.5, 70, 0, '1 cucharadita:8*'],
  ['Crema de leche', 'lacteos', 340, 2, 3, 35, 0, '1 cucharada:15*'],
  ['Flan casero', 'lacteos', 145, 5, 22, 4, 0, '1 porcion:150*'],
  ['Postre de chocolate', 'lacteos', 130, 3, 20, 4, 0.5, '1 pote:100*'],
  ['Huevo', 'lacteos', 143, 13, 1, 10, 0, '1 huevo:55*|2 huevos:110|3 huevos:165'],
  ['Huevo frito', 'lacteos', 200, 13, 1, 16, 0, '1 huevo:60*|2 huevos:120'],
  ['Huevo duro', 'lacteos', 143, 13, 1, 10, 0, '1 huevo:55*|2 huevos:110'],
  ['Revuelto de huevo', 'lacteos', 165, 12, 2, 12, 0, '2 huevos:120*'],
  ['Clara de huevo', 'lacteos', 52, 11, 0.7, 0.2, 0, '1 clara:33*|3 claras:100'],
  ['Omelette de queso', 'lacteos', 200, 15, 2, 15, 0, '1 omelette:150*'],

  // === FRUTAS ===
  ['Banana', 'frutas', 89, 1.1, 23, 0.3, 2.6, '1 banana:120*|2 bananas:240'],
  ['Manzana', 'frutas', 62, 0.3, 14.8, 0.2, 2.4, '1 manzana:180*'],
  ['Naranja', 'frutas', 47, 0.9, 12, 0.1, 2.4, '1 naranja:180*'],
  ['Mandarina', 'frutas', 53, 0.8, 13, 0.3, 1.8, '1 mandarina:100*|2 mandarinas:200'],
  ['Pera', 'frutas', 57, 0.4, 15, 0.1, 3.1, '1 pera:170*'],
  ['Durazno', 'frutas', 39, 0.9, 10, 0.3, 1.5, '1 durazno:150*'],
  ['Ciruela', 'frutas', 46, 0.7, 11, 0.3, 1.4, '2 ciruelas:130*'],
  ['Uva', 'frutas', 69, 0.7, 18, 0.2, 0.9, '1 racimo chico:120*'],
  ['Frutilla', 'frutas', 32, 0.7, 8, 0.3, 2, '1 taza:150*'],
  ['Sandia', 'frutas', 30, 0.6, 8, 0.2, 0.4, '1 porcion:250*'],
  ['Melon', 'frutas', 34, 0.8, 8, 0.2, 0.9, '1 porcion:200*'],
  ['Anana', 'frutas', 50, 0.5, 13, 0.1, 1.4, '1 rodaja:80*'],
  ['Kiwi', 'frutas', 61, 1.1, 15, 0.5, 3, '1 kiwi:80*'],
  ['Palta', 'frutas', 160, 2, 9, 15, 7, 'Media palta:100*|1 palta:200'],
  ['Pomelo', 'frutas', 42, 0.8, 11, 0.1, 1.6, 'Medio pomelo:150*'],
  ['Higo', 'frutas', 74, 0.8, 19, 0.3, 2.9, '2 higos:100*'],
  ['Cereza', 'frutas', 63, 1, 16, 0.2, 2.1, '1 taza:140*'],
  ['Arandano', 'frutas', 57, 0.7, 14, 0.3, 2.4, '1 taza:140*'],
  ['Pasas de uva', 'frutas', 300, 3, 79, 0.5, 4, '1 punado:30*'],
  ['Ciruela pasa', 'frutas', 240, 2.2, 64, 0.4, 7, '3 unidades:25*'],
  ['Datil', 'frutas', 280, 2.5, 75, 0.4, 7, '2 unidades:25*'],
  ['Ensalada de frutas', 'frutas', 55, 0.7, 14, 0.2, 1.8, '1 plato:250*'],
  ['Compota de manzana', 'frutas', 70, 0.3, 18, 0.1, 1.8, '1 pote:150*'],

  // === VERDURAS ===
  ['Lechuga', 'verduras', 15, 1.4, 2.9, 0.2, 1.3, '1 plato:80*'],
  ['Tomate', 'verduras', 18, 0.9, 3.9, 0.2, 1.2, '1 tomate:120*'],
  ['Cebolla', 'verduras', 40, 1.1, 9, 0.1, 1.7, 'Media cebolla:60*'],
  ['Zanahoria', 'verduras', 41, 0.9, 10, 0.2, 2.8, '1 zanahoria:70*'],
  ['Zapallo', 'verduras', 26, 1, 6.5, 0.1, 0.5, 'Porcion:150*'],
  ['Zapallito', 'verduras', 17, 1.2, 3.1, 0.3, 1, '2 unidades:200*'],
  ['Berenjena', 'verduras', 25, 1, 6, 0.2, 3, '1 berenjena:200*'],
  ['Morron', 'verduras', 26, 1, 6, 0.3, 2.1, '1 morron:120*'],
  ['Brocoli', 'verduras', 34, 2.8, 7, 0.4, 2.6, 'Porcion:150*'],
  ['Coliflor', 'verduras', 25, 1.9, 5, 0.3, 2, 'Porcion:150*'],
  ['Espinaca', 'verduras', 23, 2.9, 3.6, 0.4, 2.2, 'Porcion:100*'],
  ['Acelga', 'verduras', 19, 1.8, 3.7, 0.2, 1.6, 'Porcion:150*'],
  ['Repollo', 'verduras', 25, 1.3, 6, 0.1, 2.5, 'Porcion:100*'],
  ['Chaucha', 'verduras', 31, 1.8, 7, 0.1, 2.7, 'Porcion:150*'],
  ['Choclo', 'verduras', 96, 3.4, 21, 1.5, 2.4, '1 choclo:150*'],
  ['Papa hervida', 'verduras', 87, 2, 20, 0.1, 1.8, '1 papa mediana:150*'],
  ['Batata hervida', 'verduras', 90, 2, 21, 0.1, 3.3, '1 batata:150*'],
  ['Remolacha', 'verduras', 43, 1.6, 10, 0.2, 2.8, 'Porcion:100*'],
  ['Pepino', 'verduras', 15, 0.7, 3.6, 0.1, 0.5, 'Medio pepino:100*'],
  ['Apio', 'verduras', 16, 0.7, 3, 0.2, 1.6, '2 tallos:80*'],
  ['Puerro', 'verduras', 61, 1.5, 14, 0.3, 1.8, '1 puerro:80*'],
  ['Champinon', 'verduras', 22, 3.1, 3.3, 0.3, 1, 'Porcion:100*'],
  ['Palmitos', 'verduras', 28, 2.5, 4.6, 0.6, 2.5, 'Porcion:100*'],
  ['Rucula', 'verduras', 25, 2.6, 3.7, 0.7, 1.6, '1 plato:60*'],
  ['Verduras al vapor', 'verduras', 40, 2, 8, 0.3, 2.5, '1 plato:200*'],

  // === LEGUMBRES Y CEREALES ===
  ['Lentejas cocidas', 'legumbres', 116, 9, 20, 0.4, 8, '1 plato:200*'],
  ['Garbanzos cocidos', 'legumbres', 164, 9, 27, 2.6, 8, '1 plato:200*'],
  ['Porotos cocidos', 'legumbres', 130, 9, 23, 0.5, 7, '1 plato:200*'],
  ['Arvejas', 'legumbres', 81, 5, 14, 0.4, 5, 'Porcion:100*'],
  ['Soja texturizada hidratada', 'legumbres', 105, 15, 8, 1, 4, 'Porcion:150*'],
  ['Hummus', 'legumbres', 170, 8, 14, 9, 6, '1 porcion:60*'],
  ['Avena en hojuelas', 'legumbres', 380, 13, 60, 7, 10, '3 cucharadas:40*'],
  ['Avena cocida con leche', 'legumbres', 90, 4, 13, 2.5, 1.8, '1 plato:250*'],
  ['Granola', 'legumbres', 450, 10, 60, 18, 7, '1 porcion:50*'],
  ['Copos de maiz sin azucar', 'legumbres', 370, 7, 84, 0.9, 3, '1 taza:30*'],
  ['Cereal con azucar', 'legumbres', 390, 6, 85, 3, 2.5, '1 taza:35*'],
  ['Quinoa cocida', 'legumbres', 120, 4.4, 21, 1.9, 2.8, '1 plato:180*'],
  ['Cuscus cocido', 'legumbres', 112, 3.8, 23, 0.2, 1.4, '1 plato:180*'],
  ['Salvado de avena', 'legumbres', 380, 17, 66, 7, 15, '2 cucharadas:20*'],
  ['Semillas de chia', 'legumbres', 490, 17, 42, 31, 34, '1 cucharada:12*'],

  // === SNACKS Y DULCES ===
  ['Alfajor triple de dulce de leche', 'snacks', 450, 5, 60, 21, 1.5, '1 alfajor:70*'],
  ['Alfajor simple de chocolate', 'snacks', 440, 5, 62, 19, 1.5, '1 alfajor:45*'],
  ['Alfajor de maicena', 'snacks', 420, 4, 62, 18, 1, '1 alfajor:50*'],
  ['Alfajor santafesino', 'snacks', 430, 4, 63, 18, 1, '1 alfajor:60*'],
  ['Papas fritas de paquete', 'snacks', 540, 6, 53, 34, 4, 'Paquete chico:35*|Paquete grande:120'],
  ['Palitos salados', 'snacks', 400, 10, 72, 8, 3, 'Punado:30*'],
  ['Chizitos', 'snacks', 520, 6, 57, 30, 1.5, 'Paquete chico:35*'],
  ['Mani salado', 'snacks', 570, 25, 16, 48, 8, '1 punado:30*'],
  ['Mani con chocolate', 'snacks', 520, 13, 45, 32, 4, '1 punado:35*'],
  ['Almendras', 'snacks', 580, 21, 22, 50, 12, '1 punado:30*'],
  ['Nueces', 'snacks', 650, 15, 14, 65, 7, '1 punado:30*'],
  ['Castanas de caju', 'snacks', 550, 18, 30, 44, 3, '1 punado:30*'],
  ['Mix de frutos secos', 'snacks', 570, 17, 25, 47, 8, '1 punado:35*'],
  ['Chocolate con leche', 'snacks', 540, 7, 58, 31, 3, '2 cuadraditos:20*|Media barra:50'],
  ['Chocolate amargo 70%', 'snacks', 580, 8, 46, 42, 11, '2 cuadraditos:20*'],
  ['Bombon', 'snacks', 520, 6, 55, 30, 2.5, '1 bombon:15*|3 bombones:45'],
  ['Helado de crema', 'snacks', 200, 3.5, 24, 10, 0.5, '1 bocha:80*|1/4 kilo:250'],
  ['Helado de agua', 'snacks', 120, 0.5, 30, 0, 0.3, '1 bocha:80*'],
  ['Palito helado', 'snacks', 150, 2, 25, 5, 0.3, '1 palito:70*'],
  ['Barrita de cereal', 'snacks', 400, 6, 65, 12, 5, '1 barrita:25*'],
  ['Turron de mani', 'snacks', 450, 12, 55, 20, 3, '1 turron:25*'],
  ['Caramelos', 'snacks', 390, 0, 97, 0, 0, '3 caramelos:15*'],
  ['Gomitas', 'snacks', 340, 6, 78, 0.2, 0, '1 punado:40*'],
  ['Pochoclo dulce', 'snacks', 430, 6, 75, 13, 8, '1 balde chico:60*'],
  ['Pochoclo salado', 'snacks', 390, 9, 70, 10, 12, '1 balde chico:50*'],
  ['Galletitas de arroz con chocolate', 'snacks', 440, 6, 70, 15, 3, '2 unidades:30*'],
  ['Mermelada', 'snacks', 250, 0.4, 62, 0.1, 1, '1 cucharada:20*'],
  ['Miel', 'snacks', 300, 0.3, 82, 0, 0, '1 cucharada:20*'],
  ['Dulce de membrillo', 'snacks', 260, 0.3, 65, 0.1, 1.5, '1 porcion:40*'],
  ['Dulce de batata', 'snacks', 250, 0.5, 62, 0.1, 1.5, '1 porcion:40*'],

  // === BEBIDAS ===
  ['Mate cebado sin azucar', 'bebidas', 2, 0, 0.3, 0, 0, '1 mateada:500*|Termo entero:1000'],
  ['Mate cocido con azucar', 'bebidas', 20, 0, 5, 0, 0, '1 taza:200*'],
  ['Cafe negro', 'bebidas', 2, 0.1, 0, 0, 0, '1 pocillo:60*|1 taza:200'],
  ['Cafe con leche', 'bebidas', 45, 2.4, 3.6, 2.4, 0, '1 taza:200*'],
  ['Cafe con leche y azucar', 'bebidas', 65, 2.3, 8, 2.3, 0, '1 taza:200*'],
  ['Te sin azucar', 'bebidas', 1, 0, 0.2, 0, 0, '1 taza:200*'],
  ['Submarino', 'bebidas', 95, 3.5, 12, 4, 0.5, '1 taza:250*'],
  ['Gaseosa cola', 'bebidas', 42, 0, 10.6, 0, 0, '1 vaso:250*|1 lata:354|Medio litro:500'],
  ['Gaseosa lima limon', 'bebidas', 40, 0, 10, 0, 0, '1 vaso:250*|1 lata:354'],
  ['Gaseosa naranja', 'bebidas', 45, 0, 11, 0, 0, '1 vaso:250*|1 lata:354'],
  ['Gaseosa light', 'bebidas', 0.3, 0, 0, 0, 0, '1 vaso:250*|1 lata:354'],
  ['Agua saborizada', 'bebidas', 20, 0, 5, 0, 0, '1 vaso:250*|1 botella:500'],
  ['Agua mineral', 'bebidas', 0, 0, 0, 0, 0, '1 vaso:250*|1 botella:500'],
  ['Jugo de naranja exprimido', 'bebidas', 45, 0.7, 10, 0.2, 0.2, '1 vaso:250*'],
  ['Jugo en polvo preparado', 'bebidas', 25, 0, 6, 0, 0, '1 vaso:250*'],
  ['Licuado de banana con leche', 'bebidas', 80, 2.8, 14, 1.8, 1, '1 vaso:300*'],
  ['Cerveza rubia', 'bebidas', 43, 0.5, 3.6, 0, 0, '1 vaso:330*|1 porron:473|1 litro:1000'],
  ['Cerveza negra', 'bebidas', 50, 0.5, 5, 0, 0, '1 vaso:330*|1 pinta:473'],
  ['Vino tinto', 'bebidas', 85, 0.1, 2.6, 0, 0, '1 copa:150*'],
  ['Vino blanco', 'bebidas', 82, 0.1, 2.6, 0, 0, '1 copa:150*'],
  ['Fernet con cola', 'bebidas', 95, 0, 12, 0, 0, '1 vaso:300*'],
  ['Whisky', 'bebidas', 250, 0, 0, 0, 0, '1 medida:45*'],
  ['Gin tonic', 'bebidas', 80, 0, 7, 0, 0, '1 vaso:250*'],
  ['Champagne', 'bebidas', 85, 0.2, 3, 0, 0, '1 copa:150*'],
  ['Bebida isotonica', 'bebidas', 25, 0, 6, 0, 0, '1 botella:500*'],

  // === CONDIMENTOS Y ACEITES ===
  ['Aceite de girasol', 'condimentos', 884, 0, 0, 100, 0, '1 cucharada:14*|1 chorro:20'],
  ['Aceite de oliva', 'condimentos', 884, 0, 0, 100, 0, '1 cucharada:14*|1 chorro:20'],
  ['Mayonesa', 'condimentos', 680, 1, 2, 75, 0, '1 cucharada:15*|2 cucharadas:30'],
  ['Mayonesa light', 'condimentos', 300, 1, 8, 29, 0, '1 cucharada:15*'],
  ['Ketchup', 'condimentos', 110, 1.2, 26, 0.2, 0.5, '1 cucharada:17*'],
  ['Mostaza', 'condimentos', 65, 4, 6, 3.5, 3, '1 cucharada:15*'],
  ['Salsa golf', 'condimentos', 500, 1, 10, 51, 0.3, '1 cucharada:15*'],
  ['Chimichurri', 'condimentos', 300, 1, 5, 31, 1.5, '1 cucharada:15*'],
  ['Salsa de tomate', 'condimentos', 40, 1.5, 7, 0.8, 1.5, '1 cucharon:80*'],
  ['Vinagre', 'condimentos', 20, 0, 0.9, 0, 0, '1 cucharada:15*'],
  ['Azucar', 'condimentos', 400, 0, 100, 0, 0, '1 cucharadita:5*|1 cucharada:12'],
  ['Pan rallado', 'condimentos', 380, 12, 72, 4, 3, '1 cucharada:15*'],
  ['Caldo en cubo preparado', 'condimentos', 5, 0.3, 0.5, 0.2, 0, '1 taza:200*'],

  // === SUPLEMENTOS ===
  ['Proteina de suero (whey)', 'suplementos', 380, 75, 8, 5, 0, '1 scoop:30*|2 scoops:60'],
  ['Caseina', 'suplementos', 360, 72, 8, 3, 0, '1 scoop:30*'],
  ['Proteina vegetal', 'suplementos', 370, 70, 10, 5, 3, '1 scoop:30*'],
  ['Ganador de peso', 'suplementos', 380, 20, 65, 4, 2, '1 scoop:75*|2 scoops:150'],
  ['Barra de proteina', 'suplementos', 350, 30, 35, 10, 5, '1 barra:60*'],
  ['Gel energetico', 'suplementos', 250, 0, 62, 0, 0, '1 sobre:40*'],
];

/** "1 milanesa:130*|1 grande:180" a objetos. El * marca la predeterminada. */
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

export const ALIMENTOS_AR: AlimentoSemilla[] = CRUDO.map(
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

/**
 * Chequeo de coherencia: proteina*4 + carbos*4 + grasa*9 tiene que dar
 * aproximadamente las kcal declaradas. No es exacto (el alcohol aporta 7
 * kcal/g y la fibra cuenta distinto), pero una desviacion grande casi
 * siempre es un valor mal cargado. Va en un test, no en runtime.
 *
 * Las bebidas alcoholicas fallan a proposito: sus calorias vienen del
 * alcohol, que no es ninguno de los tres macros.
 */
export function alimentosIncoherentes(tolerancia = 0.25): string[] {
  return ALIMENTOS_AR.filter((a) => {
    if (a.kcal_por_100g < 20) return false;
    const calculadas = a.proteina_g * 4 + a.carbohidratos_g * 4 + a.grasa_g * 9;
    return Math.abs(calculadas - a.kcal_por_100g) / a.kcal_por_100g > tolerancia;
  }).map((a) => a.nombre);
}