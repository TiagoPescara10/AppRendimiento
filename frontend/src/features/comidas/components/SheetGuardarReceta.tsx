// src/features/comidas/components/SheetGuardarReceta.tsx
//
// "Guardar como receta" desde una comida: solo pide el nombre. La receta
// rinde 1 porcion y copia los items tal cual (guardarComidaComoReceta).
// Es un sheet y no Alert.prompt porque ese solo existe en iOS.

import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Boton } from '@/ui/Boton';
import { colors, fontSize, lineHeight, radius, shadow, spacing } from '@/ui/theme';

export function SheetGuardarReceta({
  visible,
  nombreSugerido = '',
  onCerrar,
  onGuardar,
}: {
  visible: boolean;
  nombreSugerido?: string;
  onCerrar: () => void;
  onGuardar: (nombre: string) => void;
}) {
  const [nombre, setNombre] = useState(nombreSugerido);

  useEffect(() => {
    if (visible) setNombre(nombreSugerido);
  }, [visible, nombreSugerido]);

  if (!visible) return null;
  const limpio = nombre.trim();

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onCerrar}>
      <KeyboardAvoidingView
        style={estilos.fondo}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <Pressable style={estilos.flex} onPress={onCerrar} />
        <View style={estilos.sheet}>
          <View style={estilos.agarre} />
          <Text style={estilos.titulo}>Guardar como receta</Text>
          <Text style={estilos.detalle}>
            Rinde 1 porción, con estos alimentos y cantidades. Después la podés editar.
          </Text>
          <TextInput
            style={estilos.input}
            value={nombre}
            onChangeText={setNombre}
            placeholder="Nombre de la receta"
            placeholderTextColor={colors.textMuted}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={() => limpio && onGuardar(limpio)}
          />
          <Boton titulo="Guardar" onPress={() => limpio && onGuardar(limpio)} disabled={!limpio} />
        </View>
      </KeyboardAvoidingView>
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
    marginBottom: spacing.xs,
  },
  titulo: {
    fontSize: fontSize.subtitle,
    lineHeight: lineHeight.subtitle,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  detalle: { fontSize: fontSize.small, lineHeight: lineHeight.small, color: colors.textSecondary },
  input: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSize.body,
    color: colors.textPrimary,
  },
});
