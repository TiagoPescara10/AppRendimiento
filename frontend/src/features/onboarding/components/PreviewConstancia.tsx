// Preview: la constancia. Cargas la semana una vez, la app pregunta despues si
// fuiste, y al mes sale el numero.
//
// Arriba el cartel que pregunta (la entrada de datos) y abajo el porcentaje
// acumulado (lo que devuelve). Ese orden cuenta el trato: contestas dos
// botones y a cambio tenes el historial.
//
// Datos falsos y fijos: es una ilustracion, no el progreso del usuario.

import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, radius, fontSize, lineHeight, fontWeight, sizes } from '@/ui/theme';

const FUE = 112;
const TOTAL = 130;
const PORCENTAJE = Math.round((FUE / TOTAL) * 100);

/** Los ultimos 7 meses, en porcentaje de cumplimiento. Inventados. */
const MESES = [
  { mes: 'Oct', pct: 71 },
  { mes: 'Nov', pct: 64 },
  { mes: 'Dic', pct: 52 },
  { mes: 'Ene', pct: 83 },
  { mes: 'Feb', pct: 90 },
  { mes: 'Mar', pct: 86 },
  { mes: 'Abr', pct: 94 },
];

export function PreviewConstancia() {
  return (
    <View style={estilos.card}>
      {/* El cartel: los mismos dos botones que aparecen de verdad cuando un
          entrenamiento queda sin responder. */}
      <View style={estilos.cartel}>
        <Text style={estilos.cartelTitulo}>¿Cómo te fue?</Text>
        <Text style={estilos.cartelDetalle}>Fútbol · martes 19:00</Text>
        <View style={estilos.cartelBotones}>
          <View style={estilos.si}>
            <Text style={estilos.siTexto}>Sí fui</Text>
          </View>
          <View style={estilos.no}>
            <Text style={estilos.noTexto}>No fui</Text>
          </View>
        </View>
      </View>

      <View style={estilos.resumen}>
        <Text style={estilos.porcentaje} allowFontScaling={false}>{PORCENTAJE}%</Text>
        <Text style={estilos.detalle}>Fuiste a {FUE} de {TOTAL} entrenamientos</Text>

        <View style={estilos.barra}>
          <View style={[estilos.barraLlena, { width: `${PORCENTAJE}%` }]} />
        </View>
      </View>

      {/* El grafico de meses. Barras a mano y no una libreria: son siete
          rectangulos con altura porcentual, no vale una dependencia. */}
      <View style={estilos.grafico}>
        {MESES.map((m) => (
          <View key={m.mes} style={estilos.columna}>
            <View style={estilos.pista}>
              <View style={[estilos.barraMes, { height: `${m.pct}%` }]} />
            </View>
            <Text style={estilos.mes}>{m.mes}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const estilos = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
    justifyContent: 'center',
  },

  cartel: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  cartelTitulo: {
    fontSize: fontSize.body,
    lineHeight: lineHeight.body,
    fontWeight: fontWeight.medium,
    color: colors.textPrimary,
  },
  cartelDetalle: {
    fontSize: fontSize.small,
    lineHeight: lineHeight.small,
    color: colors.textSecondary,
  },
  cartelBotones: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  si: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.action,
  },
  siTexto: { fontSize: fontSize.small, color: colors.textOnAction },
  no: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: sizes.hairline,
    borderColor: colors.borderStrong,
  },
  noTexto: { fontSize: fontSize.small, color: colors.textPrimary },

  resumen: { gap: spacing.xs },
  porcentaje: {
    fontSize: fontSize.display,
    lineHeight: lineHeight.display,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  detalle: {
    fontSize: fontSize.small,
    lineHeight: lineHeight.small,
    color: colors.textSecondary,
  },
  barra: {
    height: 10,
    borderRadius: radius.md,
    backgroundColor: colors.border,
    overflow: 'hidden',
    marginTop: spacing.xs,
  },
  barraLlena: {
    height: '100%',
    backgroundColor: colors.action,
  },

  // flex 1 con minHeight por lo mismo que la foto del preview de comidas: el
  // grafico se come lo que sobre sin llegar a aplastarse.
  grafico: {
    flex: 1,
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
  },
  columna: { flex: 1, gap: spacing.xs },
  // La pista es el 100% del alto disponible; la barra se mide contra ella en
  // porcentaje. Sin la pista, un height porcentual no tendria contra que.
  pista: { flex: 1, justifyContent: 'flex-end' },
  barraMes: {
    borderRadius: radius.sm,
    backgroundColor: colors.accentSoft,
  },
  mes: {
    fontSize: fontSize.caption,
    lineHeight: lineHeight.caption,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
