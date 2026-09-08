// Preview: registro de comidas por foto.
//
// Es una ILUSTRACION, no la pantalla real ni el estado del usuario: los datos
// son falsos y fijos, a proposito. Lo que tiene que quedar claro de un vistazo
// es que sacas una foto y salen alimentos con su porcion y sus kcal.
//
// Es un componente y no una captura de pantalla para que el dia que cambie el
// diseño de la app esto se actualice solo con los tokens.

import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, fontSize, lineHeight, fontWeight, shadow, sizes } from '@/ui/theme';

/** Lo que "detecto" la foto. Inventado. */
const DETECTADOS = [
  { nombre: 'Milanesa de carne', porcion: '1 unidad grande', kcal: 420 },
  { nombre: 'Puré de papas', porcion: '1 taza', kcal: 210 },
];

const TOTAL = DETECTADOS.reduce((suma, a) => suma + a.kcal, 0);

export function PreviewComidas() {
  return (
    <View style={estilos.card}>
      {/* El lugar de la foto. Un icono sobre crema y no una imagen: no hay
          foto real que mostrar y una de stock mentiria sobre lo que hace. */}
      <View style={estilos.foto}>
        <Ionicons name="camera-outline" size={sizes.icon} color={colors.textSecondary} />
        <Text style={estilos.fotoTexto}>Tu foto</Text>
      </View>

      {DETECTADOS.map((a) => (
        <View key={a.nombre} style={estilos.fila}>
          <View style={estilos.flex}>
            <Text style={estilos.nombre}>{a.nombre}</Text>
            <Text style={estilos.porcion}>{a.porcion}</Text>
          </View>
          <Text style={estilos.kcal}>{a.kcal} kcal</Text>
        </View>
      ))}

      <View style={estilos.total}>
        <Text style={estilos.totalLabel}>Total</Text>
        <Text style={estilos.totalValor}>{TOTAL} kcal</Text>
      </View>
    </View>
  );
}

const estilos = StyleSheet.create({
  flex: { flex: 1 },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
    ...shadow.card,
  },

  // flex 1 con minHeight: la foto se queda con el alto que sobre, pero nunca
  // se achica tanto que el icono quede pegado al texto.
  foto: {
    flex: 1,
    minHeight: 96,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  fotoTexto: {
    fontSize: fontSize.small,
    lineHeight: lineHeight.small,
    color: colors.textSecondary,
  },

  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  nombre: {
    fontSize: fontSize.body,
    lineHeight: lineHeight.body,
    color: colors.textPrimary,
  },
  porcion: {
    fontSize: fontSize.small,
    lineHeight: lineHeight.small,
    color: colors.textSecondary,
  },
  kcal: {
    fontSize: fontSize.small,
    lineHeight: lineHeight.small,
    color: colors.textSecondary,
    fontVariant: ['tabular-nums'],
  },

  total: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: spacing.sm,
    borderTopWidth: sizes.hairline,
    borderTopColor: colors.border,
  },
  totalLabel: {
    fontSize: fontSize.body,
    lineHeight: lineHeight.body,
    color: colors.textSecondary,
  },
  totalValor: {
    fontSize: fontSize.subtitle,
    lineHeight: lineHeight.subtitle,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    fontVariant: ['tabular-nums'],
  },
});
