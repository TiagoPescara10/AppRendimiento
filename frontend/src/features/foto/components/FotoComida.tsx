// src/features/foto/components/FotoComida.tsx
//
// La foto guardada de una comida, en sus dos tamanos: la miniatura de la
// lista "Comiste" y la foto del detalle, que al tocarla se abre a pantalla
// completa.
//
// Si el archivo ya no esta (restaurar el celular, borrar datos), la imagen
// falla y el componente no muestra nada: la comida se ve como una sin foto.
// Ver features/foto/archivo.ts.

import { useState } from 'react';
import { Image, Modal, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radius, spacing } from '@/ui/theme';

const LADO_MINIATURA = 40;
const ALTO_DETALLE = 220;

export function MiniaturaComida({ uri }: { uri: string }) {
  const [fallo, setFallo] = useState(false);
  if (fallo) return null;
  return (
    <Image
      source={{ uri }}
      style={estilos.miniatura}
      resizeMode="cover"
      onError={() => setFallo(true)}
      accessibilityIgnoresInvertColors
    />
  );
}

export function FotoDetalleComida({ uri }: { uri: string }) {
  const [fallo, setFallo] = useState(false);
  const [abierta, setAbierta] = useState(false);
  const insets = useSafeAreaInsets();
  if (fallo) return null;

  return (
    <>
      <Pressable
        onPress={() => setAbierta(true)}
        accessibilityRole="imagebutton"
        accessibilityLabel="Ver la foto de la comida"
      >
        <Image
          source={{ uri }}
          style={estilos.detalle}
          resizeMode="cover"
          onError={() => setFallo(true)}
          accessibilityIgnoresInvertColors
        />
      </Pressable>

      <Modal
        visible={abierta}
        animationType="fade"
        onRequestClose={() => setAbierta(false)}
        supportedOrientations={['portrait', 'landscape']}
      >
        <View style={estilos.completa}>
          <Image source={{ uri }} style={estilos.imagenCompleta} resizeMode="contain" />
          <Pressable
            onPress={() => setAbierta(false)}
            hitSlop={12}
            style={[estilos.cerrar, { top: insets.top + spacing.md }]}
            accessibilityRole="button"
            accessibilityLabel="Cerrar la foto"
          >
            <Ionicons name="close" size={28} color={colors.textoSobreFoto} />
          </Pressable>
        </View>
      </Modal>
    </>
  );
}

const estilos = StyleSheet.create({
  miniatura: {
    width: LADO_MINIATURA,
    height: LADO_MINIATURA,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
  },
  detalle: {
    width: '100%',
    height: ALTO_DETALLE,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceAlt,
  },
  completa: { flex: 1, backgroundColor: colors.fondoFotoCompleta, justifyContent: 'center' },
  imagenCompleta: { width: '100%', height: '100%' },
  cerrar: { position: 'absolute', right: spacing.lg },
});
