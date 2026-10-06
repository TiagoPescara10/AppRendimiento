// src/features/foto/components/AnalizandoFoto.tsx
//
// Lo que se ve mientras se analiza la foto. La foto es la protagonista: ocupa
// el 60 % del alto, y una linea la recorre de arriba a abajo en loop como
// senal de que se esta "leyendo". Con "reducir movimiento" del sistema, la
// linea no aparece.
//
// Abajo, un texto que cambia cada 2 s. Sin porcentajes ni barras: no hay
// forma honesta de saber cuanto falta.

import { useEffect, useState } from 'react';
import { AccessibilityInfo, Image, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { Boton } from '@/ui/Boton';
import { colors, fontSize, fontWeight, lineHeight, radius, spacing } from '@/ui/theme';

const FRASES = ['Buscando alimentos…', 'Estimando cantidades…', 'Comparando con tu catálogo…'];
const CADA_MS = 2000;
const RECORRIDO_MS = 2200;

/** Alto de la franja que baja: un halo suave con la linea en el borde de abajo. */
const ALTO_HALO = 36;
const GROSOR_LINEA = 3;

/** null mientras no se sabe: asi la linea no aparece un instante y se va. */
function useReducirMovimiento(): boolean | null {
  const [reducir, setReducir] = useState<boolean | null>(null);
  useEffect(() => {
    let vivo = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => { if (vivo) setReducir(v); })
      .catch(() => { if (vivo) setReducir(false); });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReducir);
    return () => {
      vivo = false;
      sub.remove();
    };
  }, []);
  return reducir;
}

function LineaEscaneo({ alto }: { alto: number }) {
  const avance = useSharedValue(0);

  useEffect(() => {
    avance.value = withRepeat(
      withTiming(1, { duration: RECORRIDO_MS, easing: Easing.inOut(Easing.quad) }),
      -1,
      false,
    );
    return () => cancelAnimation(avance);
  }, [avance]);

  const estilo = useAnimatedStyle(() => ({
    transform: [{ translateY: avance.value * (alto - ALTO_HALO) }],
  }));

  return (
    <Animated.View pointerEvents="none" style={[estilos.franja, estilo]}>
      <View style={estilos.halo} />
      <View style={estilos.linea} />
    </Animated.View>
  );
}

export function AnalizandoFoto({ uri, onCancelar }: { uri: string; onCancelar: () => void }) {
  const { height } = useWindowDimensions();
  const alto = Math.round(height * 0.6);
  const reducir = useReducirMovimiento();
  const [frase, setFrase] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setFrase((f) => (f + 1) % FRASES.length), CADA_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <View style={estilos.contenedor}>
      <View style={[estilos.marco, { height: alto }]}>
        <Image
          source={{ uri }}
          style={estilos.foto}
          resizeMode="cover"
          accessibilityLabel="La foto que se está analizando"
        />
        {reducir === false && <LineaEscaneo alto={alto} />}
      </View>

      <View style={estilos.textos} accessibilityLiveRegion="polite">
        <Text style={estilos.titulo}>Analizando tu comida</Text>
        <Text style={estilos.frase}>{FRASES[frase]}</Text>
      </View>

      <Boton titulo="Cancelar" variante="secundario" onPress={onCancelar} />
    </View>
  );
}

const estilos = StyleSheet.create({
  contenedor: { gap: spacing.lg },
  marco: {
    width: '100%',
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.surfaceAlt,
  },
  foto: { width: '100%', height: '100%' },
  franja: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: ALTO_HALO,
    justifyContent: 'flex-end',
  },
  // El halo y la linea son el mismo color con distinta opacidad: el resplandor
  // ayuda a verla sobre fotos claras.
  halo: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.accentSoft,
    opacity: 0.25,
  },
  linea: {
    height: GROSOR_LINEA,
    backgroundColor: colors.accentSoft,
    opacity: 0.9,
  },
  textos: { alignItems: 'center', gap: spacing.xs },
  titulo: {
    fontSize: fontSize.subtitle,
    lineHeight: lineHeight.subtitle,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  frase: {
    fontSize: fontSize.body,
    lineHeight: lineHeight.body,
    color: colors.textSecondary,
  },
});
