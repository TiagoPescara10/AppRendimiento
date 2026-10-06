// src/lib/coccion.ts
//
// Crudo y cocido. Un alimento no se duplica en dos versiones: guarda en que
// estado estan sus valores por 100 g (estado_base) y cuanto cambia su peso al
// cocinarse (factor_coccion = peso cocido / peso crudo).
//
//   Semilla:    valores de COCIDO. Arroz 2,81: 100 g crudos -> 281 g cocidos.
//   Escaneados: valores del paquete, o sea SECO. Fideos 2,35.
//
// item_comida.cantidad_g se guarda SIEMPRE en el estado_base de su alimento.
// Asi los totales siguen siendo kcal_por_100g x cantidad_g / 100 en todas las
// queries de agregacion, sin tocar ninguna. Lo que el usuario peso de verdad
// ("300 g crudo") va aparte, solo para mostrar.
//
// Los factores salen de USDA FoodData Central, SR Legacy:
//   factor = kcal por 100 g crudo / kcal por 100 g cocido
// Solo para cocciones que cambian AGUA (hervido, plancha, horno, vapor).
// Nunca para fritos ni preparaciones con aceite: ahi ademas se suma grasa y
// el factor no representa nada.
//
// Imports relativos y sin '@/': este archivo entra al build de los scripts de
// prueba, que no reescriben los alias.

export type EstadoCoccion = 'crudo' | 'cocido';

/**
 * Lleva los gramos que peso el usuario al estado en que estan los valores del
 * alimento, que es en el que se guarda cantidad_g.
 *
 *   base cocido, pesado crudo  -> gramos x factor  (300 g de arroz crudo = 843 g cocido)
 *   base crudo,  pesado cocido -> gramos / factor  (600 g de fideos cocidos = 255 g secos)
 *   mismo estado               -> sin cambio
 *
 * Sin factor o sin estado base no hay conversion posible: los gramos quedan
 * como vinieron, que es el comportamiento de siempre.
 */
export function convertirAEstadoBase(
  gramos: number,
  estadoIngresado: EstadoCoccion,
  estadoBase: EstadoCoccion | null,
  factor: number | null,
): number {
  if (estadoBase === null || factor === null || !(factor > 0)) return gramos;
  if (estadoIngresado === estadoBase) return gramos;
  return estadoBase === 'cocido' ? gramos * factor : gramos / factor;
}

/** Si el alimento admite elegir crudo o cocido. Hacen falta las dos cosas. */
export function admiteCoccion(
  estadoBase: EstadoCoccion | null,
  factor: number | null,
): estadoBase is EstadoCoccion {
  return estadoBase !== null && factor !== null && factor > 0;
}

export interface OpcionCoccion {
  estado: EstadoCoccion;
  etiqueta: string;
}

/**
 * Las dos opciones del selector, la del estado base primero: es la
 * predeterminada y es el comportamiento de antes.
 *
 * Para un paquete (base crudo) se habla de seco y no de crudo: "pese seco" se
 * entiende sin pensar con un paquete de fideos en la mano.
 */
export function opcionesCoccion(estadoBase: EstadoCoccion): [OpcionCoccion, OpcionCoccion] {
  return estadoBase === 'cocido'
    ? [
        { estado: 'cocido', etiqueta: 'Cocido' },
        { estado: 'crudo', etiqueta: 'Crudo' },
      ]
    : [
        { estado: 'crudo', etiqueta: 'Pesé seco' },
        { estado: 'cocido', etiqueta: 'Pesé cocido' },
      ];
}

/** "1.096": separador de miles con punto, sin depender del Intl del motor. */
function miles(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/**
 * Como se nombra un estado al lado de unos gramos. El crudo de un paquete es
 * "secos"; el de un alimento de la semilla, "crudo".
 */
function nombreEstado(estado: EstadoCoccion, estadoBase: EstadoCoccion): string {
  if (estado === 'cocido') return 'cocido';
  return estadoBase === 'crudo' ? 'secos' : 'crudo';
}

/**
 * La equivalencia que se muestra debajo del campo de gramos, para que el
 * usuario vea que la cuenta tiene sentido:
 *   "300 g crudo ≈ 843 g cocido · 1.096 kcal"
 *   "600 g cocido ≈ 255 g secos · 945 kcal"
 * null si no hay conversion (mismo estado, sin factor o sin gramos).
 */
export function textoEquivalencia(
  gramos: number,
  estadoIngresado: EstadoCoccion,
  estadoBase: EstadoCoccion | null,
  factor: number | null,
  kcalPor100g: number,
): string | null {
  if (!admiteCoccion(estadoBase, factor) || estadoIngresado === estadoBase) return null;
  if (!(gramos > 0)) return null;

  const enBase = convertirAEstadoBase(gramos, estadoIngresado, estadoBase, factor);
  const kcal = (kcalPor100g * enBase) / 100;
  return (
    `${miles(gramos)} g ${nombreEstado(estadoIngresado, estadoBase)} ≈ ` +
    `${miles(enBase)} g ${nombreEstado(estadoBase, estadoBase)} · ${miles(kcal)} kcal`
  );
}

/** "300 g crudo", "600 g cocido": lo que se muestra de un item cargado en otro estado. */
export function textoCantidadIngresada(
  gramos: number,
  estadoCarga: EstadoCoccion,
  estadoBase: EstadoCoccion | null,
): string {
  return `${miles(gramos)} g ${nombreEstado(estadoCarga, estadoBase ?? 'cocido')}`;
}

// ---------------------------------------------------------------------------
// Productos escaneados que se cocinan
//
// Open Food Facts trae los valores del producto como se vende: un paquete de
// fideos es por 100 g SECOS. Si cae en una categoria que se cocina, se le
// asigna estado_base 'crudo' y un factor generico de la categoria, derivado de
// USDA igual que los de la semilla. Si la categoria no se reconoce, no se
// inventa: sin switch, y pesar seco y cargar gramos sigue dando bien.
// ---------------------------------------------------------------------------

export type TipoCoccion = 'pasta' | 'arroz' | 'legumbres' | 'quinoa' | 'cuscus';

export interface CoccionDetectada {
  tipo: TipoCoccion;
  factor: number;
  /** La porcion seca tipica, que pasa a ser la predeterminada. */
  porcionSecaG: number;
}

/** Porcion seca por persona. Pasta 80, arroz 70, legumbres 60, quinoa y cuscus 60. */
export const PORCION_SECA_G: Record<TipoCoccion, number> = {
  pasta: 80,
  arroz: 70,
  legumbres: 60,
  quinoa: 60,
  cuscus: 60,
};

/**
 * Productos que ya vienen cocidos o preparados. Ganan siempre, aunque ademas
 * tengan una categoria de las de abajo: categories_tags trae todos los
 * ancestros, y una lata de lentejas es tambien 'en:lentils'.
 */
const CATEGORIAS_EXCLUIDAS = [
  'en:canned-legumes',
  'en:meals',
  'en:prepared-lentils',
  'en:prepared-couscous',
  'en:precooked-rices',
  'en:instant-noodles',
  'en:stuffed-pastas',
];

/**
 * De la mas especifica a la mas general: se queda con la primera que aparezca.
 * El integral va antes que 'en:rices', y cada legumbre antes que 'en:pulses'.
 *
 *   pasta seca 2,35   Pasta, dry, enriched 371 / cooked 158
 *   arroz integral    Rice, brown, long-grain 367 / 123
 *   arroz 2,81        Rice, white, long-grain, regular 365 / 130
 *   lentejas 3,03     Lentils 352 / 116
 *   garbanzos 2,30    Chickpeas 378 / 164
 *   porotos 2,40      Beans, white 333 / 139
 *   otras 2,50        mediana de los pares de legumbres (2,30 2,40 2,65 3,03)
 *   quinoa 3,07       Quinoa 368 / 120
 *   cuscus 3,36       Couscous 376 / 112
 */
const CATEGORIAS_COCCION: { tag: string; tipo: TipoCoccion; factor: number }[] = [
  { tag: 'en:dry-pastas', tipo: 'pasta', factor: 2.35 },
  { tag: 'en:brown-rices', tipo: 'arroz', factor: 2.98 },
  { tag: 'en:rices', tipo: 'arroz', factor: 2.81 },
  { tag: 'en:lentils', tipo: 'legumbres', factor: 3.03 },
  { tag: 'en:chickpeas', tipo: 'legumbres', factor: 2.3 },
  { tag: 'en:common-beans', tipo: 'legumbres', factor: 2.4 },
  { tag: 'en:pulses', tipo: 'legumbres', factor: 2.5 },
  { tag: 'en:quinoa', tipo: 'quinoa', factor: 3.07 },
  { tag: 'en:durum-wheat-semolinas-for-couscous', tipo: 'cuscus', factor: 3.36 },
];

/** Si el producto se cocina, con que factor y cual es su porcion seca. null si no se reconoce. */
export function detectarCoccion(categorias: readonly string[] | null | undefined): CoccionDetectada | null {
  if (!categorias || categorias.length === 0) return null;
  const tags = new Set(categorias.map((c) => c.toLowerCase()));

  if (CATEGORIAS_EXCLUIDAS.some((t) => tags.has(t))) return null;

  const regla = CATEGORIAS_COCCION.find((r) => tags.has(r.tag));
  if (!regla) return null;

  return { tipo: regla.tipo, factor: regla.factor, porcionSecaG: PORCION_SECA_G[regla.tipo] };
}
