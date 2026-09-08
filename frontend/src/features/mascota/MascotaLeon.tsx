// src/features/mascota/MascotaLeon.tsx
//
// Encabezado principal del Dashboard:
// - Arriba a la izquierda: avatar del leon solo.
// - Al lado: "Buen dia, Tiago" y abajo en chiquito y gris "martes, 8 de septiembre" a la misma altura.
// - Abajo de eso: la recomendacion del leon con barra lateral de color (marino para rutina, ambar para evento).

import React from 'react';
import { View, Text, StyleSheet, Pressable, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { colors, spacing, radius, fontSize, fontWeight, lineHeight, shadow } from '@/ui/theme';
import type { ConsejoLeon } from './logicaConsejos';

interface Props {
  consejo: ConsejoLeon;
  nombreUsuario?: string | null;
  fechaTexto: string;
}

export function MascotaLeon({ consejo, nombreUsuario, fechaTexto }: Props) {
  const router = useRouter();

  // Momento del dia + nombre si esta disponible
  const hora = new Date().getHours();
  const momento = hora < 13 ? 'Buen día' : hora < 20 ? 'Buenas tardes' : 'Buenas noches';
  const saludoTexto = nombreUsuario ? `${momento}, ${nombreUsuario}` : momento;

  // Barra lateral: ambar cuando hay evento, marino para rutina habitual
  const colorBarra = consejo.esEvento ? colors.warning : colors.action;

  return (
    <View style={estilos.contenedor}>
      {/* 1. Encabezado: Avatar a la izquierda, Saludo y fecha al lado a la misma altura */}
      <View style={estilos.headerFila}>
        <View style={estilos.leonBadgeWrapper}>
          <Image
            source={require('@/assets/images/leon-avatar.png')}
            style={estilos.leonImagen}
            resizeMode="cover"
          />
        </View>

        <View style={estilos.saludoColumna}>
          <Text style={estilos.saludoTexto}>{saludoTexto}</Text>
          <Text style={estilos.fechaTexto}>{fechaTexto}</Text>
        </View>
      </View>

      {/* 2. Abajo de eso: la recomendacion del leon con barra lateral de color */}
      <View style={[estilos.card, { borderLeftColor: colorBarra }]}>
        <Text style={estilos.mensajeTexto}>
          {consejo.mensaje}
        </Text>

        {consejo.accion && (
          <Pressable
            onPress={() => router.push(consejo.accion!.ruta as any)}
            style={({ pressed }) => [
              estilos.accionBoton,
              pressed && estilos.accionBotonPresionado,
            ]}
          >
            <Text style={[estilos.accionTexto, { color: colorBarra }]}>
              {consejo.accion.texto}
            </Text>
            <Ionicons name="chevron-forward" size={13} color={colorBarra} />
          </Pressable>
        )}
      </View>
    </View>
  );
}

const estilos = StyleSheet.create({
  contenedor: {
    gap: spacing.sm,
  },
  headerFila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  leonBadgeWrapper: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#1E2D4A',
    borderWidth: 2,
    borderColor: '#D9A86C',
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.card,
  },
  leonImagen: {
    width: 46,
    height: 46,
    borderRadius: 23,
  },
  saludoColumna: {
    justifyContent: 'center',
    gap: 2,
  },
  saludoTexto: {
    fontSize: fontSize.subtitle,
    lineHeight: lineHeight.subtitle,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  fechaTexto: {
    fontSize: fontSize.caption,
    color: colors.textSecondary,
  },
  card: {
    backgroundColor: colors.accentSoft,
    borderRadius: radius.md,
    borderLeftWidth: 4,
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
    ...shadow.card,
  },
  mensajeTexto: {
    fontSize: fontSize.small,
    lineHeight: lineHeight.small,
    color: colors.textPrimary,
  },
  accionBoton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    alignSelf: 'flex-start',
  },
  accionBotonPresionado: {
    opacity: 0.7,
  },
  accionTexto: {
    fontSize: fontSize.caption,
    fontWeight: fontWeight.bold,
    marginRight: 2,
  },
});
