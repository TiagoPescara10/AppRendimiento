import { View, StyleSheet } from 'react-native';
import type { ViewProps } from 'react-native';
import { colors, spacing, radius, shadow } from './theme';

export function Card({ style, children, ...props }: ViewProps) {
  return (
    <View style={[estilos.card, style]} {...props}>
      {children}
    </View>
  );
}

const estilos = StyleSheet.create({
  // El blanco sobre el crema ya insinua la card; la sombra la despega.
  // Antes esto era un borde de 0.5px, que sobre un fondo casi blanco era la
  // unica forma de marcar el limite.
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    ...shadow.card,
  },
});