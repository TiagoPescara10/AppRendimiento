// src/ui/SheetAcciones.tsx
//
// Menu de acciones de una fila (el "⋯"): un sheet chico desde abajo con una
// opcion por linea. Tocar afuera cierra sin hacer nada.

import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, fontSize, lineHeight, radius, shadow, sizes, spacing } from './theme';

/** Lo que tarda la animacion de cierre del Modal. */
const ESPERA_CIERRE_MS = 350;

export interface Accion {
  texto: string;
  icono: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
}

export function SheetAcciones({
  visible,
  titulo,
  acciones,
  onCerrar,
}: {
  visible: boolean;
  titulo?: string;
  acciones: Accion[];
  onCerrar: () => void;
}) {
  const insets = useSafeAreaInsets();
  if (!visible) return null;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onCerrar}>
      <View style={estilos.fondo}>
        <Pressable style={estilos.flex} onPress={onCerrar} />
        <View style={[estilos.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
          <View style={estilos.agarre} />
          {titulo ? <Text style={estilos.titulo}>{titulo}</Text> : null}
          {acciones.map((a) => (
            <Pressable
              key={a.texto}
              style={({ pressed }) => [estilos.opcion, pressed && estilos.opcionPresionada]}
              onPress={() => {
                onCerrar();
                // La accion corre cuando el sheet ya se fue: en iOS, abrir otro
                // Modal mientras este se cierra deja al segundo sin mostrarse.
                setTimeout(a.onPress, ESPERA_CIERRE_MS);
              }}
            >
              <Ionicons name={a.icono} size={sizes.iconSmall} color={colors.action} />
              <Text style={estilos.opcionTexto}>{a.texto}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    </Modal>
  );
}

const estilos = StyleSheet.create({
  fondo: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  flex: { flex: 1 },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    gap: spacing.xs,
    ...shadow.sheet,
  },
  agarre: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: spacing.xs,
  },
  titulo: {
    fontSize: fontSize.small,
    lineHeight: lineHeight.small,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  opcion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
  },
  opcionPresionada: { backgroundColor: colors.surfaceAlt },
  opcionTexto: {
    fontSize: fontSize.body,
    lineHeight: lineHeight.body,
    fontWeight: '600',
    color: colors.textPrimary,
  },
});
