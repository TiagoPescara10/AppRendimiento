// src/features/guias/components/CardGuias.tsx
//
// La invitacion a las guias en Inicio. Mismo lenguaje visual que el aviso del
// bono mensual (CardBonoMensual): una linea, un acceso y una X. Tocarla abre
// Perfil > Guias; tocarla o cerrarla la oculta para siempre (cardInicio.ts).

import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, spacing, radius, fontSize, fontWeight, lineHeight, shadow, sizes } from '@/ui/theme';

export function CardGuias({ onAbrir, onCerrar }: { onAbrir: () => void; onCerrar: () => void }) {
  return (
    <View style={estilos.card}>
      <Pressable
        style={({ pressed }) => [estilos.cuerpo, pressed && estilos.presionado]}
        onPress={onAbrir}
        accessibilityRole="button"
      >
        <Ionicons name="help-circle-outline" size={sizes.icon} color={colors.action} />
        <View style={estilos.flex}>
          <Text style={estilos.titulo}>¿Recién empezás? Mirá las guías</Text>
          <Text style={estilos.detalle}>Cómo armar tu semana, tus rutinas y registrar comidas. 2 min cada una.</Text>
        </View>
      </Pressable>
      <Pressable onPress={onCerrar} hitSlop={12} accessibilityRole="button" accessibilityLabel="Cerrar aviso">
        <Ionicons name="close" size={18} color={colors.textSecondary} />
      </Pressable>
    </View>
  );
}

const estilos = StyleSheet.create({
  flex: { flex: 1 },
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderLeftWidth: 4,
    borderLeftColor: colors.action,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    ...shadow.card,
  },
  cuerpo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  presionado: { opacity: 0.7 },
  titulo: {
    fontSize: fontSize.small,
    lineHeight: lineHeight.small,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  detalle: {
    fontSize: fontSize.small,
    lineHeight: lineHeight.small,
    color: colors.textSecondary,
  },
});
