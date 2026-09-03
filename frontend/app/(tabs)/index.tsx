// app/(tabs)/index.tsx
//
// Placeholder del dashboard. Los botones de desarrollo se van cuando
// esta pantalla sea la de verdad.

import { Text, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { Pantalla } from '@/ui/Pantalla';
import { Boton } from '@/ui/Boton';
import { colors, spacing, fontSize, lineHeight } from '@/ui/theme';

export default function Hoy() {
  return (
    <Pantalla>
      <Text style={estilos.titulo}>Hoy</Text>
      <Text style={estilos.texto}>Acá va el dashboard.</Text>

      {/* --- SOLO DESARROLLO: sacar antes de publicar --- */}
      <Text style={estilos.seccion}>Desarrollo</Text>
      <Boton
        titulo="Playground"
        variante="secundario"
        onPress={() => router.push('/playground')}
      />
    </Pantalla>
  );
}

const estilos = StyleSheet.create({
  titulo: {
    fontSize: fontSize.title,
    lineHeight: lineHeight.title,
    fontWeight: 'bold',
    color: colors.textPrimary,
  },
  texto: {
    fontSize: fontSize.body,
    lineHeight: lineHeight.body,
    color: colors.textSecondary,
  },
  seccion: {
    fontSize: fontSize.small,
    lineHeight: lineHeight.small,
    color: colors.textSecondary,
    marginTop: spacing.xl,
  },
});