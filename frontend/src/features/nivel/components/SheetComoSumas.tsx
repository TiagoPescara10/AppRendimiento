// src/features/nivel/components/SheetComoSumas.tsx
//
// La explicacion de como se suman puntos. Mismo patron de bottom sheet que
// SheetPorciones. El texto sale de textosComoSumas() en lib/nivel.ts, armado
// con las constantes de la cuenta: aca solo se dibuja.

import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Boton } from '@/ui/Boton';
import { colors, spacing, radius, fontSize, lineHeight, fontWeight, shadow } from '@/ui/theme';
import { textosComoSumas } from '@/lib/nivel';
import { InsigniaNivel } from './InsigniaNivel';

interface Props {
  visible: boolean;
  /** Para resaltar la fila del nivel actual. */
  nivelActual: number;
  onCerrar: () => void;
}

export function SheetComoSumas({ visible, nivelActual, onCerrar }: Props) {
  if (!visible) return null;
  const t = textosComoSumas();

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onCerrar}>
      <View style={estilos.fondo}>
        {/* El fondo tocable ocupa solo el espacio libre de arriba: un toque
            sobre el sheet nunca lo cierra por burbujeo. */}
        <Pressable style={estilos.flex} onPress={onCerrar} />

        <View style={estilos.sheet}>
          <View style={estilos.agarre} />
          <Text style={estilos.titulo}>{t.titulo}</Text>

          <View style={estilos.reglas}>
            {t.reglas.map((r) => (
              <View key={r} style={estilos.regla}>
                <Text style={estilos.punto}>·</Text>
                <Text style={[estilos.texto, estilos.flex]}>{r}</Text>
              </View>
            ))}
          </View>

          <View style={estilos.niveles}>
            {t.niveles.map((n) => {
              const actual = n.nivel === nivelActual;
              return (
                <View key={n.nivel} style={[estilos.fila, actual && estilos.filaActual]}>
                  <InsigniaNivel nivel={n.nivel} tamano={24} />
                  <Text style={[estilos.texto, estilos.flex, actual && estilos.textoActual]}>
                    {n.nombre}
                  </Text>
                  <Text style={estilos.detalle}>{n.desde}</Text>
                </View>
              );
            })}
          </View>

          <Text style={estilos.detalle}>{t.cierre}</Text>

          <Boton titulo="Entendido" variante="secundario" onPress={onCerrar} ancho />
        </View>
      </View>
    </Modal>
  );
}

const estilos = StyleSheet.create({
  flex: { flex: 1 },
  fondo: { flex: 1, justifyContent: 'flex-end', backgroundColor: colors.overlay },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.lg,
    paddingBottom: spacing.xxxl,
    gap: spacing.md,
    ...shadow.sheet,
  },
  agarre: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center',
  },
  titulo: {
    fontSize: fontSize.subtitle,
    lineHeight: lineHeight.subtitle,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  reglas: { gap: spacing.sm },
  regla: { flexDirection: 'row', gap: spacing.sm },
  punto: { fontSize: fontSize.body, lineHeight: lineHeight.body, color: colors.textSecondary },
  texto: { fontSize: fontSize.body, lineHeight: lineHeight.body, color: colors.textPrimary },
  textoActual: { fontWeight: fontWeight.medium },
  detalle: { fontSize: fontSize.small, lineHeight: lineHeight.small, color: colors.textSecondary },
  niveles: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.xs,
    ...shadow.card,
  },
  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
  },
  filaActual: { backgroundColor: colors.accentSoft },
});
