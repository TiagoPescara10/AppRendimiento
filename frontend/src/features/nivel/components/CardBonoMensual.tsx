// src/features/nivel/components/CardBonoMensual.tsx
//
// El aviso del coach cuando el mes anterior cerro con buena asistencia. Una
// sola vez por mes (la marca vive en la tabla meta). Mismo lenguaje visual
// que la recomendacion del leon: informa, no festeja.

import { View, Text, Image, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, fontSize, lineHeight, shadow } from '@/ui/theme';

interface Props {
  texto: string;
  onCerrar: () => void;
}

export function CardBonoMensual({ texto, onCerrar }: Props) {
  return (
    <View style={estilos.card}>
      <View style={estilos.avatar}>
        <Image
          source={require('@/assets/images/leon-avatar.png')}
          style={estilos.avatarImagen}
          resizeMode="cover"
        />
      </View>
      <Text style={estilos.texto}>{texto}</Text>
      <Pressable
        onPress={onCerrar}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel="Cerrar aviso"
      >
        <Ionicons name="close" size={18} color={colors.textSecondary} />
      </Pressable>
    </View>
  );
}

const estilos = StyleSheet.create({
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
  avatar: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    backgroundColor: colors.avatarFondo,
    borderWidth: 1,
    borderColor: colors.avatarBorde,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImagen: { width: 30, height: 30 },
  texto: {
    flex: 1,
    fontSize: fontSize.small,
    lineHeight: lineHeight.small,
    color: colors.textPrimary,
  },
});
