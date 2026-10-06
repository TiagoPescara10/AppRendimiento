// src/features/nivel/components/GananciaXP.tsx
//
// Lo que se ve al cerrar una sesion: un check, "+15 XP", la insignia con el
// nivel y la barra ya actualizada. Sobrio a proposito: informa, no festeja.
// Sin animacion. La insignia va sin circulo: aca el fondo es claro.
//
// No se usa al responder "Si, fui" en el cartel de pendientes: seria un modal
// arriba de otro modal. Ahi la XP suma en silencio.

import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, fontSize, lineHeight, fontWeight, sizes } from '@/ui/theme';
import { XP_POR_SESION } from '@/lib/nivel';
import type { Nivel } from '@/lib/nivel';
import { BarraNivel } from './BarraNivel';
import { InsigniaNivel } from './InsigniaNivel';

export function GananciaXP({ nivel }: { nivel: Nivel }) {
  return (
    <View style={estilos.contenedor}>
      <View style={estilos.fila}>
        <Ionicons name="checkmark-circle" size={sizes.iconSmall} color={colors.action} />
        <Text style={estilos.xp}>+{XP_POR_SESION} XP</Text>
        <View style={estilos.nivelFila}>
          <InsigniaNivel nivel={nivel.nivel} tamano={32} />
          <Text style={estilos.nivel} numberOfLines={1}>
            Nivel {nivel.nivel} · {nivel.nombre}
          </Text>
        </View>
      </View>
      <BarraNivel nivel={nivel} />
    </View>
  );
}

const estilos = StyleSheet.create({
  // alignSelf stretch: las pantallas de cierre centran a sus hijos, y sin esto
  // la barra se encoge al ancho de su texto.
  contenedor: {
    alignSelf: 'stretch',
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
  },
  fila: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  xp: {
    fontSize: fontSize.body,
    lineHeight: lineHeight.body,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  nivelFila: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: spacing.sm,
  },
  nivel: {
    flexShrink: 1,
    fontSize: fontSize.small,
    lineHeight: lineHeight.small,
    color: colors.textSecondary,
  },
});
