// src/features/comidas/components/TarjetaTotales.tsx
//
// Calorias destacadas y los tres macros con su punto de color fijo. La usan
// Registrar comida (total de lo cargado) y el editor de recetas (por porcion).
// Recibe valores sin redondear: redondea al mostrar, asi la suma de las
// partes da el total que se ve.

import { StyleSheet, Text, View } from 'react-native';

import { colors, fontSize, fontWeight, lineHeight, radius, shadow, sizes, spacing } from '@/ui/theme';

export function TarjetaTotales({
  titulo = 'Calorías',
  kcal,
  proteina,
  carbohidratos,
  grasa,
}: {
  titulo?: string;
  kcal: number;
  proteina: number;
  carbohidratos: number;
  grasa: number;
}) {
  const macros = [
    { nombre: 'Proteína', valor: proteina, color: colors.protein },
    { nombre: 'Carbohidratos', valor: carbohidratos, color: colors.carbs },
    { nombre: 'Grasas', valor: grasa, color: colors.fat },
  ];
  return (
    <View style={estilos.cardTotal}>
      <View style={estilos.totalCaloriasFila}>
        <Text style={estilos.totalCaloriasLabel}>{titulo}</Text>
        <View style={estilos.totalCaloriasValorFila}>
          <Text style={estilos.totalCaloriasNumero}>
            {Math.round(kcal).toLocaleString('es-AR')}
          </Text>
          <Text style={estilos.totalCaloriasUnidad}>kcal</Text>
        </View>
      </View>

      <View style={estilos.totalSeparador} />

      <View style={estilos.totalMacrosFila}>
        {macros.map((m) => (
          <View key={m.nombre} style={estilos.totalMacroItem}>
            <View style={[estilos.puntoMacro, { backgroundColor: m.color }]} />
            <Text style={estilos.totalMacroTexto}>
              {m.nombre}{' '}
              <Text style={estilos.totalMacroValor}>{Math.round(m.valor)} g</Text>
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const estilos = StyleSheet.create({
  cardTotal: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
    ...shadow.card,
  },
  totalCaloriasFila: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  totalCaloriasLabel: {
    fontSize: fontSize.body,
    fontWeight: fontWeight.medium,
    color: colors.textSecondary,
  },
  totalCaloriasValorFila: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.xs,
  },
  totalCaloriasNumero: {
    fontSize: fontSize.title,
    lineHeight: lineHeight.title,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  totalCaloriasUnidad: {
    fontSize: fontSize.small,
    color: colors.textSecondary,
    fontWeight: fontWeight.regular,
  },
  totalSeparador: {
    height: sizes.hairline,
    backgroundColor: colors.border,
  },
  totalMacrosFila: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: spacing.md,
    rowGap: spacing.xs,
    alignItems: 'center',
  },
  totalMacroItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  puntoMacro: {
    width: 7,
    height: 7,
    borderRadius: radius.pill,
  },
  totalMacroTexto: {
    fontSize: fontSize.small,
    lineHeight: lineHeight.small,
    color: colors.textSecondary,
  },
  totalMacroValor: {
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
});
