// src/ui/theme.ts
//
// Capa 1: palette  -> valores crudos. NO usar desde componentes.
// Capa 2: colors   -> roles semanticos. Esto es lo que se usa.
//
// Regla: si en un componente escribis un hex, algo esta mal.

// ---------------------------------------------------------------------------
// Capa 1 — paleta cruda
// ---------------------------------------------------------------------------

const palette = {
  white: '#FFFFFF',
  black: '#000000',

  // neutrales calidos (stone). Ya no son superficie: quedan para texto.
  stone50: '#FAFAF9',
  stone100: '#F5F5F4',
  stone200: '#E7E5E4',
  stone300: '#D6D3D1',
  stone400: '#A8A29E',
  stone500: '#78716C',
  stone600: '#57534E',
  stone700: '#44403C',
  stone900: '#1C1917',

  // crema — el lienzo de la app.
  //
  // La saturacion BAJA al oscurecer, y es a proposito: cream50 esta al 58% y
  // cream200 al 29%. Un borde a saturacion plena se lee amarillo, no como una
  // linea. El hue se mantiene en ~43deg en todo el ramp.
  cream50: '#FAF6EC',
  cream100: '#F5EFE0',
  cream200: '#F0EDE4',
  cream300: '#E3DED0',

  // marino — un unico ramp para accion y accent, derivado sobre H=227.1deg,
  // el hue de navy700. Es el color de accion de la marca.
  navy100: '#E3E8F7',
  navy500: '#4560C4',
  navy600: '#304AA6',
  navy700: '#243B8F',
  navy800: '#1B2C6A',
  navy900: '#152251',

  // el crema saturado. Para avisos y destacados puntuales, NUNCA como fondo
  // de pantalla: a pantalla completa compite con el lienzo.
  amber100: '#FFF0C9',

  // base de las sombras. Tintada calida, no negra: sobre crema una sombra
  // gris se ve sucia. La opacidad la pone cada token de shadow.
  shadowWarm: '#5A4614',

  lime600: '#65A30D',

  orange600: '#EA580C',

  // macros
  rose500: '#D4537E',
  emerald400: '#5DCAA5',
  amber500: '#EF9F27',

  green600: '#16A34A',
  green700: '#15803D',
  amber600: '#D97706',
  yellow600: '#CA8A04',
  red600: '#DC2626',
  red700: '#B91C1C',
} as const;

// ---------------------------------------------------------------------------
// Capa 2 — roles semanticos
// ---------------------------------------------------------------------------

export const colors = {
  // superficies — tres niveles: crema = lienzo, blanco = contenido.
  // Lo que separa una card del fondo es la SOMBRA, no un borde.
  bg: palette.cream50,
  surface: palette.white,
  surfaceAlt: palette.cream100,

  // bordes. Calidos, no gris frio: sobre crema un neutro se ve sucio.
  // Quedan para separadores DENTRO de una card y para controles (inputs,
  // chips), que no llevan sombra porque no estan elevados.
  border: palette.cream200,
  borderStrong: palette.cream300,

  // texto
  textPrimary: palette.stone900,
  // stone600 y no stone500: sobre el crema, stone500 da 4.45:1 y no llega a
  // AA. Este es el color de casi todo el texto secundario de la app, asi que
  // no puede quedar al filo. stone600 da 7.07 sobre crema y 7.63 sobre
  // blanco, y sigue bien separado de textPrimary (16.20).
  textSecondary: palette.stone600,
  // OJO: 2.34:1 sobre crema, no cumple AA. Ya fallaba antes del crema (2.41
  // sobre el fondo viejo). Solo se usa como placeholder de Input y en el
  // playground; queda pendiente de un pase de accesibilidad aparte.
  textMuted: palette.stone400,
  textOnAction: palette.white,
  textOnAccent: palette.white,
  textOnAccentSoft: palette.navy900,

  // acciones
  // pressed es mas OSCURO que action, que es lo natural del ramp. Con el
  // violeta habia que invertirlo para que el blanco del boton en reposo
  // llegara a 6.93:1; el marino arranca en 10.01:1, asi que la inversion ya
  // no hace falta y pressed puede hundirse como corresponde (13.00:1).
  action: palette.navy700,
  actionPressed: palette.navy800,
  actionDisabled: palette.stone300,

  accent: palette.navy600,
  accentPressed: palette.navy700,
  // calido, no marino: es el crema saturado. navy900 encima da 13.45:1.
  accentSoft: palette.amber100,

  // macros — FIJOS. Nunca reasignar entre pantallas.
  protein: palette.rose500,
  carbs: palette.emerald400,
  fat: palette.amber500,
  fiber: palette.stone400,

  // estados
  // success y warning NO cumplen AA sobre crema (3.05 y 2.95), igual que no
  // lo cumplian sobre el fondo viejo. Pendiente de un pase aparte.
  success: palette.green600,
  warning: palette.amber600,
  // red700 y no red600: sobre crema red600 da 4.47:1 y se queda al borde de
  // AA. red700 da 6.00 y ya estaba en la paleta.
  danger: palette.red700,

  // fases del temporizador de intervalos.
  // Son fondos de pantalla completa: el color es lo que te deja saber en que
  // fase estas de reojo, sin leer, asi que aca pesa mas el contraste entre
  // los tres que la coherencia con el marino de la marca. Los tres llevan
  // textOnFase encima: 10.01, 5.02 y 10.27 contra blanco.
  //
  // faseDescanso es la mas justa de las tres y aun asi cumple AA. No se
  // oscurece mas a proposito: bajarla la acerca al gris de descansoBloque, y
  // que las tres se distingan ENTRE SI importa tanto como el contraste del
  // texto. Se mira transpirado y en movimiento.
  faseTrabajo: palette.navy700,
  faseDescanso: palette.green700,
  faseDescansoBloque: palette.stone700,
  textOnFase: palette.white,

  // Blancos translucidos para lo DECORATIVO sobre el fondo de fase: la pista
  // del anillo, los segmentos vacios, los puntitos apagados.
  //
  // Solo decorativo, nunca texto. Sobre faseDescanso el blanco pleno ya es el
  // techo con 5.02:1, asi que cualquier translucidez cae abajo de AA: al 72%
  // da 3.39 y hay que llegar al 95% para pasar, punto en el que ya no se ve
  // translucido. El texto sobre la fase va con textOnFase, pleno.
  onFaseMedio: 'rgba(255, 255, 255, 0.55)',
  onFaseTenue: 'rgba(255, 255, 255, 0.24)',

  // overlay de los modales. Tintado calido por lo mismo que las sombras.
  overlay: 'rgba(50, 40, 20, 0.5)',
} as const;

// escala de energia percibida 1-5.
// el color acompaña, nunca reemplaza al numero.
export const energyScale = [
  palette.red700,
  palette.orange600,
  palette.yellow600,
  palette.lime600,
  palette.green700,
] as const;

export const macroColors = {
  protein: colors.protein,
  carbs: colors.carbs,
  fat: colors.fat,
  fiber: colors.fiber,
} as const;

// ---------------------------------------------------------------------------
// Espaciado — escala de 4. No inventar valores intermedios.
// ---------------------------------------------------------------------------

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

// ---------------------------------------------------------------------------
// Sombras
//
// Lo que separa una card del lienzo crema. Antes era un borde de 0.5px; el
// esquema nuevo lo da con elevacion.
//
// En React Native la sombra es de a dos plataformas y no hay forma de
// unificarla: iOS lee shadowColor/Offset/Opacity/Radius y Android lee
// elevation. Cada token trae las dos, asi que un componente hace
// `...shadow.card` y no tiene que acordarse de ninguna.
//
// El color es calido (shadowWarm), no negro: sobre crema una sombra gris se
// ve como suciedad y no como profundidad.
// ---------------------------------------------------------------------------

export const shadow = {
  /** Una card en reposo. Apenas despega del lienzo. */
  card: {
    shadowColor: palette.shadowWarm,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07,
    shadowRadius: 3,
    elevation: 2,
  },
  /**
   * Bottom sheets y el cartel de pendientes. Mas marcada, porque tapan
   * contenido y tienen que leerse como una capa aparte.
   *
   * El offset es NEGATIVO: un sheet sube desde el borde de abajo, asi que su
   * sombra cae hacia arriba, sobre lo que esta tapando.
   */
  sheet: {
    shadowColor: palette.shadowWarm,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 16,
  },
} as const;

// ---------------------------------------------------------------------------
// Radios
// ---------------------------------------------------------------------------

export const radius = {
  sm: 6,
  md: 10,
  lg: 16,
  pill: 999,
} as const;

// ---------------------------------------------------------------------------
// Tipografia
//
// OJO: en React Native lineHeight es un valor ABSOLUTO en px,
// no un multiplicador como en CSS. Por eso van numeros grandes.
// ---------------------------------------------------------------------------

export const fontSize = {
  caption: 12,
  small: 14,
  body: 16,
  subtitle: 18,
  title: 22,
  display: 32,   // numeros grandes del dashboard (kcal restantes)
  timer: 96,     // la cuenta del temporizador, que se lee a un metro
} as const;

export const lineHeight = {
  caption: 16,
  small: 20,
  body: 24,
  subtitle: 26,
  title: 28,
  display: 38,
  timer: 104,
} as const;

export const fontWeight = {
  regular: '400',
  medium: '500',
  bold: '600',
} as const;

// alturas de control — que botones e inputs coincidan
export const sizes = {
  control: 48,        // altura minima tactil recomendada
  controlSmall: 36,
  icon: 24,
  iconSmall: 20,
  hairline: 0.5,
} as const;

// ---------------------------------------------------------------------------
// Export unico
// ---------------------------------------------------------------------------

export const theme = {
  colors,
  macroColors,
  energyScale,
  shadow,
  spacing,
  radius,
  fontSize,
  lineHeight,
  fontWeight,
  sizes,
} as const;

export type Theme = typeof theme;
export type ColorToken = keyof typeof colors;
export type SpacingToken = keyof typeof spacing;
export type ShadowToken = keyof typeof shadow;
