import { Pressable, Text, ActivityIndicator, StyleSheet } from 'react-native';
import type { PressableProps, ViewStyle, TextStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, fontSize, fontWeight, sizes } from './theme';

type Variante = 'primario' | 'secundario' | 'fantasma';

type Props = Omit<PressableProps, 'style'> & {
  titulo: string;
  variante?: Variante;
  cargando?: boolean;
  ancho?: boolean;
  /**
   * Icono opcional a la izquierda del texto. Toma el color de la variante,
   * asi que no hay forma de pintarlo distinto al titulo y desalinearlo del
   * resto. Decorativo: lo que anuncia el boton es `titulo`.
   */
  icono?: keyof typeof Ionicons.glyphMap;
};

// Mapa de variantes: cuando llegue la cuarta, agregas una entrada.
// Sin esto terminas con ternarios anidados que no se pueden leer.
const variantes: Record<
  Variante,
  { contenedor: ViewStyle; presionado: ViewStyle; texto: TextStyle }
> = {
  primario: {
    contenedor: { backgroundColor: colors.action },
    presionado: { backgroundColor: colors.actionPressed },
    texto: { color: colors.textOnAction },
  },
  secundario: {
    contenedor: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    presionado: { backgroundColor: colors.surfaceAlt },
    texto: { color: colors.textPrimary },
  },
  fantasma: {
    contenedor: { backgroundColor: 'transparent' },
    presionado: { backgroundColor: colors.surfaceAlt },
    texto: { color: colors.textSecondary },
  },
};

export function Boton({
  titulo,
  variante = 'primario',
  cargando = false,
  ancho = false,
  icono,
  disabled,
  ...props
}: Props) {
  const v = variantes[variante];
  const inactivo = disabled || cargando;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inactivo, busy: cargando }}
      disabled={inactivo}
      // style acepta una funcion que recibe el estado de presion.
      // Asi no hace falta useState para el feedback tactil.
      style={({ pressed }) => [
        estilos.base,
        v.contenedor,
        ancho && estilos.ancho,
        pressed && !inactivo && v.presionado,
        inactivo && estilos.inactivo,
      ]}
      {...props}
    >
      {cargando ? (
        <ActivityIndicator color={v.texto.color} />
      ) : (
        <>
          {icono && (
            <Ionicons
              name={icono}
              size={sizes.iconSmall}
              color={v.texto.color}
              accessibilityElementsHidden
              importantForAccessibility="no"
            />
          )}
          {/* El texto NO hereda estilos del contenedor.
              Si el color va solo en el Pressable, no pasa nada. */}
          <Text style={[estilos.texto, v.texto]}>{titulo}</Text>
        </>
      )}
    </Pressable>
  );
}

// Fuera del componente: se evalua una vez al importar el modulo,
// no en cada render.
const estilos = StyleSheet.create({
  base: {
    height: sizes.control,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  ancho: {
    alignSelf: 'stretch',
  },
  inactivo: {
    opacity: 0.5,
  },
  texto: {
    fontSize: fontSize.body,
    fontWeight: fontWeight.medium,
  },
});
