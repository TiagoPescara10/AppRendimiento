import { ScrollView, StyleSheet, View, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { colors, spacing } from './theme';

type Props = {
  children: ReactNode;
  scroll?: boolean;
  style?: StyleProp<ViewStyle>;
  /**
   * Fondo distinto al de la app. Existe para el temporizador, que pinta la
   * pantalla entera segun la fase; el color tiene que llegar hasta el borde
   * de arriba, o sea al SafeAreaView, y no solo al contenido.
   * Siempre un token de colors, nunca un hex suelto.
   */
  fondo?: string;
};

export function Pantalla({ children, scroll = true, style, fondo }: Props) {
  return (
    <SafeAreaView style={[estilos.safe, !!fondo && { backgroundColor: fondo }]} edges={['top']}>
      <KeyboardAvoidingView
        style={estilos.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {scroll ? (
          <ScrollView
            contentContainerStyle={[estilos.contenido, style]}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>
        ) : (
          <View style={[estilos.contenido, estilos.flex, style]}>{children}</View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const estilos = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  contenido: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xxxl,
    gap: spacing.md,
  },
});