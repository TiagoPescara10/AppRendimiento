// app/perfil/privacidad.tsx
//
// Que pasa con los datos del usuario. Corto y en concreto: hoy todo vive en
// el celular, salvo la foto que se manda a analizar, que el servidor descarta
// (ver supabase/functions/analizar-foto).
//
// La atribucion de Open Food Facts va aca y en ningun otro lado: la licencia
// ODbL pide citarla, y esta es la pantalla donde se explica de donde salen
// los datos.

import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { Pantalla } from '@/ui/Pantalla';
import { colors, spacing, radius, fontSize, fontWeight, lineHeight, shadow } from '@/ui/theme';

const PARRAFOS = [
  'Tus datos se guardan solo en este celular: tu perfil, tus comidas, tus entrenamientos, tu peso y las fotos de tus comidas. No los mandamos a ningún servidor. Si desinstalás la app, se borran.',
  'Cuando usás la foto con IA, la imagen se manda a nuestro servidor para analizarla y se descarta enseguida: no se guarda.',
];

export default function PrivacidadScreen() {
  const router = useRouter();

  return (
    <Pantalla>
      <View style={estilos.header}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={estilos.volverBoton}
          accessibilityLabel="Volver"
        >
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={estilos.headerTitulo}>Privacidad</Text>
      </View>

      <View style={estilos.card}>
        {PARRAFOS.map((p) => (
          <Text key={p} style={estilos.parrafo}>
            {p}
          </Text>
        ))}
        <Text style={estilos.atribucion}>Datos de productos: Open Food Facts (licencia ODbL).</Text>
      </View>
    </Pantalla>
  );
}

const estilos = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  volverBoton: { padding: spacing.xs },
  headerTitulo: {
    fontSize: fontSize.title,
    lineHeight: lineHeight.title,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  card: {
    marginTop: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadow.card,
  },
  parrafo: {
    fontSize: fontSize.body,
    lineHeight: lineHeight.body,
    color: colors.textPrimary,
  },
  atribucion: {
    fontSize: fontSize.small,
    lineHeight: lineHeight.small,
    color: colors.textSecondary,
  },
});
