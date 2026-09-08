// El cascaron de una pagina del pager de beneficios: titulo, bajada y preview.
//
// Las cuatro paginas tienen exactamente esta estructura, asi que vive una vez
// aca en vez de cuatro veces en beneficios.tsx. Lo unico que cambia entre
// paginas es el texto y que componente entra como preview.
//
// El ancho lo manda el pager, no la pagina: cada item de la FlatList tiene que
// medir una pantalla exacta o el paginado se desalinea.

import { View, Text, StyleSheet } from 'react-native';
import type { ReactNode } from 'react';
import { colors, spacing, fontSize, lineHeight, fontWeight } from '@/ui/theme';

export function PantallaBeneficio({
  ancho,
  titulo,
  bajada,
  children,
}: {
  ancho: number;
  titulo: string;
  bajada: string;
  children: ReactNode;
}) {
  return (
    <View style={[estilos.pagina, { width: ancho }]}>
      <Text style={estilos.titulo}>{titulo}</Text>
      <Text style={estilos.bajada}>{bajada}</Text>

      {/* flex 1 y no una altura fija: el preview se queda con lo que sobra
          despues del titulo y la bajada, que en un telefono normal es el ~60%
          del alto. Con una fraccion fija, en una pantalla chica desbordaria.
          overflow hidden porque algunos previews dibujan de borde a borde. */}
      <View style={estilos.preview}>{children}</View>
    </View>
  );
}

const estilos = StyleSheet.create({
  pagina: {
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  titulo: {
    fontSize: fontSize.display,
    lineHeight: lineHeight.display,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  bajada: {
    fontSize: fontSize.body,
    lineHeight: lineHeight.body,
    color: colors.textSecondary,
  },
  preview: {
    flex: 1,
    justifyContent: 'center',
    marginTop: spacing.sm,
    overflow: 'hidden',
  },
});
