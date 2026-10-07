// src/ui/Toast.tsx
//
// Aviso corto al pie ("Agregado a hoy") que se va solo. No bloquea nada ni
// se toca: confirma que algo paso sin pedir una accion.
//
// Lo controla la pantalla con un estado: mensaje null es oculto. Un mensaje
// nuevo (aunque sea el mismo texto) se pasa con otra `clave` para reiniciar
// el tiempo.

import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, fontSize, lineHeight, radius, shadow, spacing } from './theme';

const DURACION_MS = 1800;
const FUNDIDO_MS = 180;

export function Toast({
  mensaje,
  clave,
  onOculto,
}: {
  mensaje: string | null;
  /** Cambiarla reinicia el toast aunque el texto sea el mismo. */
  clave?: number;
  onOculto: () => void;
}) {
  const insets = useSafeAreaInsets();
  const opacidad = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (mensaje === null) return;
    opacidad.setValue(0);
    const animacion = Animated.sequence([
      Animated.timing(opacidad, { toValue: 1, duration: FUNDIDO_MS, useNativeDriver: true }),
      Animated.delay(DURACION_MS),
      Animated.timing(opacidad, { toValue: 0, duration: FUNDIDO_MS, useNativeDriver: true }),
    ]);
    animacion.start(({ finished }) => {
      if (finished) onOculto();
    });
    return () => animacion.stop();
    // onOculto puede cambiar en cada render de la pantalla: no reinicia el toast
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mensaje, clave, opacidad]);

  if (mensaje === null) return null;

  return (
    <Animated.View
      pointerEvents="none"
      accessibilityLiveRegion="polite"
      style={[estilos.toast, { bottom: insets.bottom + spacing.xl, opacity: opacidad }]}
    >
      <Text style={estilos.texto}>{mensaje}</Text>
    </Animated.View>
  );
}

const estilos = StyleSheet.create({
  toast: {
    position: 'absolute',
    alignSelf: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    backgroundColor: colors.action,
    ...shadow.sheet,
  },
  texto: {
    fontSize: fontSize.small,
    lineHeight: lineHeight.small,
    fontWeight: '600',
    color: colors.textOnAction,
  },
});
