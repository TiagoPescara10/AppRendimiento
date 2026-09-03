import { View, StyleSheet } from 'react-native';
import type { ViewProps } from 'react-native';
import { colors, spacing, radius } from './theme';

export function Card({ style, children, ...props }: ViewProps) {
  return (
    <View style={[estilos.card, style]} {...props}>
      {children}
    </View>
  );
}

const estilos = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderWidth: 0.5,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
});