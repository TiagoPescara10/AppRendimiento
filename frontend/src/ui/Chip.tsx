// src/ui/Chip.tsx
//
// Chip seleccionable: el selector Semana | Mes de Progreso y de Mis comidas.
// Activo va lleno con el color de accion; el resto, borde fino.

import { Pressable, StyleSheet, Text } from 'react-native';

import { colors, fontSize, fontWeight, lineHeight, radius, sizes, spacing } from './theme';

export function Chip({
  texto,
  activo,
  onPress,
}: {
  texto: string;
  activo: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: activo }}
      onPress={onPress}
      style={({ pressed }) => [
        estilos.chip,
        activo && estilos.chipActivo,
        pressed && !activo && estilos.chipPresionado,
      ]}
    >
      <Text style={[estilos.chipTexto, activo && estilos.chipTextoActivo]}>{texto}</Text>
    </Pressable>
  );
}

const estilos = StyleSheet.create({
  chip: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: sizes.hairline,
    borderColor: colors.borderStrong,
  },
  chipActivo: { backgroundColor: colors.action, borderColor: colors.action },
  chipPresionado: { backgroundColor: colors.surfaceAlt },
  chipTexto: {
    fontSize: fontSize.small,
    lineHeight: lineHeight.small,
    fontWeight: fontWeight.medium,
    color: colors.textSecondary,
  },
  chipTextoActivo: { color: colors.textOnAction },
});
