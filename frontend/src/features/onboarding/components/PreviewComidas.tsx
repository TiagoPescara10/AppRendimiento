// src/features/onboarding/components/PreviewComidas.tsx
//
// Preview: registro de comidas por foto.
//
// Es una ILUSTRACION, no la pantalla real ni el estado del usuario: los datos
// son falsos y fijos, a proposito. Lo que tiene que quedar claro de un vistazo
// es que sacas una foto y salen alimentos con su porcion y sus kcal.
//
// Ocupa el espacio disponible con flex: 1 entre la bajada y el boton, dando
// mayor protagonismo a los alimentos detectados y cerrando con el total
// destacado sobre fondo accentSoft.

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  colors,
  spacing,
  radius,
  fontSize,
  lineHeight,
  fontWeight,
  shadow,
  sizes,
} from '@/ui/theme';

/** Lo que detecto la foto. Inventado. */
const DETECTADOS = [
  { nombre: 'Milanesa de carne', porcion: '1 unidad grande', kcal: 420 },
  { nombre: 'Puré de papas', porcion: '1 taza', kcal: 210 },
];

const TOTAL = DETECTADOS.reduce((suma, a) => suma + a.kcal, 0);

export function PreviewComidas() {
  return (
    <View style={estilos.contenedor}>
      <View style={estilos.card}>
        {/* El lugar de la foto mas compacto y equilibrado */}
        <View style={estilos.foto}>
          <Ionicons
            name="camera-outline"
            size={sizes.icon}
            color={colors.textSecondary}
          />
          <Text style={estilos.fotoTexto}>Tu foto</Text>
        </View>

        {/* Bloque inferior: Alimentos detectados y Total juntos */}
        <View style={estilos.bloqueInferior}>
          <View style={estilos.listaComidas}>
            {DETECTADOS.map((a, index) => (
              <View key={a.nombre} style={estilos.itemBloque}>
                {index > 0 && <View style={estilos.divisor} />}
                <View style={estilos.fila}>
                  <View style={estilos.flex}>
                    <Text style={estilos.nombre}>{a.nombre}</Text>
                    <Text style={estilos.porcion}>{a.porcion}</Text>
                  </View>
                  <Text style={estilos.kcal}>{a.kcal} kcal</Text>
                </View>
              </View>
            ))}
          </View>

          {/* Cierre destacado con fondo accentSoft, pegado a la ultima comida */}
          <View style={estilos.total}>
            <Text style={estilos.totalLabel}>Total</Text>
            <Text style={estilos.totalValor}>{TOTAL} kcal</Text>
          </View>
        </View>
      </View>

      {/* Bloque de alternativas con mayor tamano, iconos y relevancia visual */}
      <View style={estilos.bloqueAlternativas}>
        <View style={estilos.iconosAlternativas}>
          <Ionicons name="search-outline" size={16} color={colors.action} />
          <Ionicons name="barcode-outline" size={16} color={colors.action} />
        </View>
        <Text style={estilos.textoAlternativas}>
          También podés buscar por nombre o escanear el código de barras.
        </Text>
      </View>
    </View>
  );
}

const estilos = StyleSheet.create({
  contenedor: {
    flex: 1,
    gap: spacing.sm,
  },

  flex: {
    flex: 1,
  },

  card: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
    marginVertical: spacing.xs / 2,
    ...shadow.card,
  },

  foto: {
    flex: 1,
    minHeight: 110,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  fotoTexto: {
    fontSize: fontSize.small,
    lineHeight: lineHeight.small,
    color: colors.textSecondary,
    fontWeight: fontWeight.medium,
  },

  bloqueInferior: {
    gap: spacing.sm,
  },
  listaComidas: {
    gap: 0,
  },
  itemBloque: {
    width: '100%',
  },
  divisor: {
    height: sizes.hairline,
    backgroundColor: colors.border,
  },
  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  nombre: {
    fontSize: fontSize.body,
    lineHeight: lineHeight.body,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  porcion: {
    fontSize: fontSize.small,
    lineHeight: lineHeight.small,
    color: colors.textSecondary,
    marginTop: 2,
  },
  kcal: {
    fontSize: fontSize.body,
    lineHeight: lineHeight.body,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    fontVariant: ['tabular-nums'],
  },

  total: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.accentSoft,
    borderRadius: radius.md,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
  },
  totalLabel: {
    fontSize: fontSize.body,
    lineHeight: lineHeight.body,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  totalValor: {
    fontSize: fontSize.title,
    lineHeight: lineHeight.title,
    fontWeight: fontWeight.bold,
    color: colors.action,
    fontVariant: ['tabular-nums'],
  },

  bloqueAlternativas: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  iconosAlternativas: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  textoAlternativas: {
    fontSize: fontSize.small,
    lineHeight: lineHeight.small,
    fontWeight: fontWeight.medium,
    color: colors.textPrimary,
    flexShrink: 1,
  },
});
