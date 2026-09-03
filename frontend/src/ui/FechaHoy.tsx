import { Text, View, StyleSheet } from 'react-native';
import { colors, fontSize, lineHeight } from '@/ui/theme';

const opciones: Intl.DateTimeFormatOptions = {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
};

export function FechaHoy() {
  const hoy = new Date();

  return (
    <View>
      <Text style={estilos.fecha}>
        {hoy.toLocaleDateString('es-AR', opciones)}
      </Text>
    </View>
  );
}

const estilos = StyleSheet.create({
  fecha: {
    fontSize: fontSize.small,
    lineHeight: lineHeight.small,
    color: colors.textSecondary,
  },
});