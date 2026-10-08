// src/features/guias/components/BotonGuia.tsx
//
// El "?" de las pantallas que tienen guia: abre esa guia directo. El id es
// GuiaId, asi que un id que no existe no compila; y scripts/probar-guias.mjs
// verifica ademas que cada pantalla que lo necesita lo tenga.
//
// Va al final de la fila del header. El id va siempre como texto fijo (id="mi-semana"): el script lo busca asi.

import { Pressable, StyleSheet } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { colors, radius, sizes } from '@/ui/theme';
import type { GuiaId } from '../contenido';

export function BotonGuia({ id, style }: { id: GuiaId; style?: StyleProp<ViewStyle> }) {
  const router = useRouter();
  return (
    <Pressable
      style={({ pressed }) => [estilos.boton, pressed && estilos.presionado, style]}
      onPress={() => router.push({ pathname: '/perfil/guia/[id]', params: { id } })}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel="Ver guía"
    >
      <Ionicons name="help-circle-outline" size={sizes.icon} color={colors.textSecondary} />
    </Pressable>
  );
}

const estilos = StyleSheet.create({
  // marginLeft auto: en la fila del header queda al final sin que cada
  // pantalla tenga que empujarlo.
  boton: {
    marginLeft: 'auto',
    width: sizes.controlSmall,
    height: sizes.controlSmall,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  presionado: { backgroundColor: colors.surfaceAlt },
});
