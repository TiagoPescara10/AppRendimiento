// app/perfil/guia/[id].tsx
//
// Una guia: titulo, pasos numerados y "Probalo ahora", que lleva a la
// pantalla de verdad. Se llega desde Perfil > Guias o desde el "?" de cada
// pantalla (src/features/guias/components/BotonGuia.tsx).

import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';

import { Pantalla } from '@/ui/Pantalla';
import { Boton } from '@/ui/Boton';
import { colors, spacing, radius, fontSize, lineHeight, fontWeight, shadow } from '@/ui/theme';
import { obtenerGuia } from '@/features/guias/contenido';

export default function GuiaDetalle() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const guia = id ? obtenerGuia(id) : undefined;

  const volver = (
    <Pressable
      onPress={() => router.back()}
      hitSlop={12}
      style={estilos.botonVolver}
      accessibilityRole="button"
      accessibilityLabel="Volver"
    >
      <Text style={estilos.flechaVolver}>‹</Text>
    </Pressable>
  );

  if (!guia) {
    return (
      <Pantalla>
        <View style={estilos.headerBar}>{volver}</View>
        <Text style={estilos.texto}>Esta guía no existe.</Text>
        <Boton titulo="Ver todas las guías" variante="secundario" onPress={() => router.replace('/perfil/guias')} />
      </Pantalla>
    );
  }

  return (
    <Pantalla>
      <View style={estilos.headerBar}>
        {volver}
        <Text style={[estilos.tituloPantalla, estilos.flex]}>{guia.titulo}</Text>
      </View>
      <Text style={estilos.descripcion}>{guia.descripcion}</Text>

      <View style={estilos.pasos}>
        {guia.pasos.map((p, i) => (
          <View key={p.titulo} style={estilos.paso}>
            <View style={estilos.numero}>
              <Text style={estilos.numeroTexto}>{i + 1}</Text>
            </View>
            <View style={estilos.flex}>
              <Text style={estilos.pasoTitulo}>{p.titulo}</Text>
              <Text style={estilos.texto}>{p.texto}</Text>
            </View>
          </View>
        ))}
      </View>

      <Boton
        titulo="Probalo ahora"
        // El destino es un dato (contenido.ts), no un literal: las rutas
        // tipadas no lo pueden verificar aca. probar-guias.mjs si.
        onPress={() => router.push(guia.destino as Href)}
      />
    </Pantalla>
  );
}

const estilos = StyleSheet.create({
  flex: { flex: 1 },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  botonVolver: { paddingRight: spacing.xs },
  flechaVolver: { fontSize: 28, color: colors.textSecondary, marginTop: -2 },
  tituloPantalla: {
    fontSize: fontSize.title,
    lineHeight: lineHeight.title,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  descripcion: {
    fontSize: fontSize.body,
    lineHeight: lineHeight.body,
    color: colors.textSecondary,
  },
  pasos: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.lg,
    ...shadow.card,
  },
  paso: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  numero: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  numeroTexto: {
    fontSize: fontSize.small,
    fontWeight: fontWeight.bold,
    color: colors.textOnAccentSoft,
  },
  pasoTitulo: {
    fontSize: fontSize.body,
    lineHeight: lineHeight.body,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  texto: {
    fontSize: fontSize.small,
    lineHeight: lineHeight.small,
    color: colors.textPrimary,
  },
});
