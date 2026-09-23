---
name: Athletic Performance & Strength Design System
colors:
  surface: '#faf9f7'
  surface-dim: '#dadad8'
  surface-bright: '#faf9f7'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f4f3f1'
  surface-container: '#efeeec'
  surface-container-high: '#e9e8e6'
  surface-container-highest: '#e3e2e0'
  on-surface: '#1a1c1b'
  on-surface-variant: '#444651'
  inverse-surface: '#2f3130'
  inverse-on-surface: '#f1f1ef'
  outline: '#757682'
  outline-variant: '#c5c6d2'
  surface-tint: '#435aa4'
  primary: '#00226b'
  on-primary: '#ffffff'
  primary-container: '#203a82'
  on-primary-container: '#90a7f6'
  inverse-primary: '#b5c4ff'
  secondary: '#625f4d'
  on-secondary: '#ffffff'
  secondary-container: '#e6e0c9'
  on-secondary-container: '#676351'
  tertiary: '#1c2a3c'
  on-tertiary: '#ffffff'
  tertiary-container: '#324053'
  on-tertiary-container: '#9dacc2'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dbe1ff'
  primary-fixed-dim: '#b5c4ff'
  on-primary-fixed: '#00164d'
  on-primary-fixed-variant: '#29428a'
  secondary-fixed: '#e9e2cc'
  secondary-fixed-dim: '#cdc6b1'
  on-secondary-fixed: '#1e1c0e'
  on-secondary-fixed-variant: '#4a4736'
  tertiary-fixed: '#d5e3fc'
  tertiary-fixed-dim: '#b9c7df'
  on-tertiary-fixed: '#0d1c2e'
  on-tertiary-fixed-variant: '#3a485b'
  background: '#faf9f7'
  on-background: '#1a1c1b'
  surface-variant: '#e3e2e0'
typography:
  display-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 40px
    fontWeight: '700'
    lineHeight: 48px
  display-lg-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 38px
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 28px
    fontWeight: '700'
    lineHeight: 34px
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 22px
    fontWeight: '600'
    lineHeight: 28px
  headline-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
  title-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 22px
  body-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
  label-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 15px
    fontWeight: '600'
    lineHeight: 20px
  label-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
  label-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 11px
    fontWeight: '500'
    lineHeight: 14px
  metric-headline:
    fontFamily: Plus Jakarta Sans
    fontSize: 36px
    fontWeight: '800'
    lineHeight: 42px
  metric-counter:
    fontFamily: Plus Jakarta Sans
    fontSize: 20px
    fontWeight: '700'
    lineHeight: 26px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  spacing-2xs: 0.25rem
  spacing-xs: 0.5rem
  spacing-sm: 0.75rem
  spacing-md: 1rem
  spacing-lg: 1.25rem
  spacing-xl: 1.5rem
  spacing-2xl: 2rem
  gutter-mobile: 1rem
  margin-screen: 1.25rem
---

## Brand & Style

This design system establishes an elite, focused, and premium atmosphere for sports performance and strength training athletes. Drawing inspiration from the quiet confidence and data precision of Whoop, Apple Fitness, Nike Training, and Strava, the aesthetic rejects hyper-aggressive neon gym tropes in favor of restrained athleticism, deliberate typography, and high visual legibility under active physical strain.

The design movement combines **Minimalism** with subtle **Tactile Warmth**:
- High-clarity information architecture centered around athlete routines, macronutrient targets, and scheduling.
- A foundational warm off-white canvas that softens screen glare during intense workouts or early morning sessions.
- Purposeful deep athletic navy accents that evoke discipline, focus, and institutional performance excellence.
- Calibrated golden-cream badges and warm accents that humanize data points without cluttering the hierarchy.

## Colors

The palette relies on a nuanced, performance-focused scale that pairs an intentional dark navy with warm, organic neutrals:

- **Primary Accent (`#203A82` / `#1E3A8A`)**: Deep athletic navy. Serves as the high-impact focal point for primary calls-to-action, active bottom tab navigation icons, calendar selection states, and primary button fills.
- **Secondary Accent (`#FBF4DD` / `#FEF3C7`)**: Warm golden-cream. Utilized specifically for routine indicator badges, motivational insight callout banners, and scheduled routine day pills (e.g., day abbreviation badges like "M Mi J V").
- **Tertiary Accent (`#475569` / `#64748B`)**: Slate neutral. Designated for secondary timestamps, workout durations, inactive calendar days, and supporting contextual copy.
- **Background & Canvas (`#F9F8F6`)**: Subtle warm off-white ground. Provides an ambient, premium backdrop that elevates pure white surface cards.
- **Surface Cards (`#FFFFFF`)**: Pure crisp white surfaces hosting modular widgets, calendar grids, macro counters, and workout agenda rows.
- **Text & Hierarchy**: Primary dark slate (`#0F172A`) for high-contrast titles and numerical metrics; secondary slate (`#64748B`) for units and metadata; bordered elements use `#E2E8F0` / `#F1F5F9`.

## Typography

**Plus Jakarta Sans** is selected across all roles for its balanced geometric cleanliness, contemporary sports-tech feel, and open letterforms.

- **Tabular & Metric Figures**: All numeric data—including calorie totals, sets, repetitions, and timestamps—must enforce tabular figures (`font-variant-numeric: tabular-nums`) to preserve alignment across tabular macro readouts and calendar day columns.
- **Hierarchy Scale**:
  - `metric-headline` (36px, Weight 800): Prominent readout numbers (e.g., remaining daily energy "3.507").
  - `metric-counter` (20px, Weight 700): Dense macro splits (Protein, Carbs, Fats).
  - `title-md` / `headline-sm` (16px–18px, Weight 600): Workout titles ("Entrenamiento", "Gimnasio").
  - `label-sm` / `label-md` (11px–12px, Weight 500–600): Tab navigation labels, weekday initials, and uppercase subheadings ("COMISTE").

## Elevation & Depth

Visual hierarchy is communicated via clean **Tonal Stacking** paired with ultra-diffused, soft-tinted ambient shadows. Avoid heavy drop-shadows or stark borders.

- **Level 0 (Canvas Base)**: `#F9F8F6` matte foundation.
- **Level 1 (Surface Cards & Lists)**: `#FFFFFF` fill resting on the warm ground. Defined by a soft, diffused ambient shadow: `box-shadow: 0 4px 20px -2px rgba(15, 23, 42, 0.04), 0 1px 3px 0 rgba(15, 23, 42, 0.02)`.
- **Level 2 (Active States & Popovers)**: Selected calendar active date tokens, floating quick-action pills, or pressed buttons: `box-shadow: 0 6px 16px -2px rgba(32, 58, 130, 0.20)`.
- **Separators & Dividers**: Crisp hairline strokes (`#F1F5F9` or `#E2E8F0`) with a thickness of `1px` inside routine cards and calendar matrices.

## Shapes

The design system employs a refined modern curvature (`roundedness: 2` base) that aligns with sports hardware, digital bands, and fitness tracking devices:

- **Surface Cards & Routine Panels**: `16px` (`1rem` to `1.25rem`) corner radius, creating soft, welcoming card modules.
- **Action Buttons & Inputs**: `12px` (`0.75rem`) to `14px` border radius, ensuring touch targets feel stable and substantial.
- **Badge Pills & Routine Indicators**: Fully rounded capsule shape (`9999px`) for routine tags ("D", "M Mi J V", "L") and calendar activity markers.
- **Calendar Selected Day Box**: `12px` rounded squircle for the active day highlighting the date while accommodating dot status indicators.

## Components

### Buttons
- **Primary Action Button**: Deep athletic navy fill (`#203A82`), pure white text (`#FFFFFF`), `14px` radius, height `52px`, center-aligned bold label. Light feedback press scale (`transform: scale(0.98)`).
- **Secondary / Outlined Button**: White background, solid `1.5px` border in `#203A82`, navy text and icon. Used for complementary actions like "Entrenar".
- **Ghost Action Links**: Transparent background with navy typography and clean leading inline plus-icon (`+ Definir rutina`).

### Routine Badges & Chips
- **Routine Day Badges**: Soft golden-cream fill (`#FBF4DD`), deep dark slate text (`#1E293B`), minimum height `26px`, padded with `10px` horizontal padding, capsule radius (`9999px`).
- **Status Indicator Dots**: Solid `4px` or `5px` navy blue circular dots placed beneath active calendar dates with scheduled workouts.

### Cards & Metric Displays
- **Nutritional / Macro Cards**: Modular white sub-cards (`#FFFFFF`) with `12px` corner radii, subtle border (`1px solid #F1F5F9`), micro gray label (`12px`, `#64748B`), bold numeric split (`16px`, `#0F172A`), and an inline progress bar track (`#E2E8F0` background with `#203A82` fill).
- **Motivational / Coaching Banner**: Warm pale cream fill (`#FEF3C7` / `#FBF4DD`), accented with a `3px` solid navy left border bar, dark warm text, and `12px` rounded radius.

### Lists & Agenda Rows
- **Workout Routine Rows**: Height `56px` to `64px`, featuring day capsule badges left-aligned, stacked workout name (`16px` semibold) and schedule time/duration (`13px` muted slate), terminating with an unobtrusive ghost delete or edit icon (`#94A3B8`).
- **Dividers**: Subtle `1px` horizontal rule (`#F1F5F9`) inset by `16px` to cleanly separate successive training blocks.

### Bottom Navigation Bar
- **Bar Structure**: Fixed white base (`#FFFFFF`) with subtle top border (`#E2E8F0`), height `64px` excluding safe area.
- **Tab Items**: Vertical icon-and-label pair. Active state rendered in `#203A82` with semibold weight; inactive state rendered in `#94A3B8` with medium weight.