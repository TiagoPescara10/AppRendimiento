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

  // neutrales calidos (stone)
  stone50: '#FAFAF9',
  stone100: '#F5F5F4',
  stone200: '#E7E5E4',
  stone300: '#D6D3D1',
  stone400: '#A8A29E',
  stone500: '#78716C',
  stone700: '#44403C',
  stone900: '#1C1917',

  // violeta — un unico ramp para accion y accent
  violet100: '#E9E7FA',
  violet500: '#7F77DD',
  violet600: '#675ECA',
  violet700: '#534AB7',
  violet900: '#3A3475',

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
  // superficies
  bg: palette.stone50,
  surface: palette.white,
  surfaceAlt: palette.stone100,

  // bordes
  border: palette.stone200,
  borderStrong: palette.stone300,

  // texto
  textPrimary: palette.stone900,
  textSecondary: palette.stone500,
  textMuted: palette.stone400,
  textOnAction: palette.white,
  textOnAccent: palette.white,
  textOnAccentSoft: palette.violet900,

  // acciones
  // action es el stop MAS oscuro y pressed el mas claro: al reves que el
  // ramp. Es a proposito, para que el texto blanco del boton en reposo
  // llegue a 6.93:1 en vez de 3.76:1.
  action: palette.violet700,
  actionPressed: palette.violet500,
  actionDisabled: palette.stone300,

  accent: palette.violet600,
  accentPressed: palette.violet700,
  accentSoft: palette.violet100,

  // macros — FIJOS. Nunca reasignar entre pantallas.
  protein: palette.rose500,
  carbs: palette.emerald400,
  fat: palette.amber500,
  fiber: palette.stone400,

  // estados
  success: palette.green600,
  warning: palette.amber600,
  danger: palette.red600,

  // overlay
  overlay: 'rgba(28, 25, 23, 0.5)',
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
} as const;

export const lineHeight = {
  caption: 16,
  small: 20,
  body: 24,
  subtitle: 26,
  title: 28,
  display: 38,
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
