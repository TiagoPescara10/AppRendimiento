
import { View, Text, Pressable, StyleSheet } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { colors, spacing, radius, fontSize, lineHeight, shadow } from './theme';

// El generico <T> hace que `valor` y `onChange` compartan el mismo tipo.
// Asi, si le pasas opciones con valor 'bajar' | 'subir', TypeScript te
// obliga a que el estado sea de ese tipo y no un string cualquiera.
type Opcion<T extends string> = {
  valor: T;
  titulo: string;
  descripcion?: string;
};

type Props<T extends string> = {
  opciones: Opcion<T>[];
  valor: T | null;              // null = todavia no eligio nada
  onChange: (valor: T) => void;
  style?: StyleProp<ViewStyle>;
};

export function ListaOpciones<T extends string>({
  opciones,
  valor,
  onChange,
  style,
}: Props<T>) {
  return (
    // accessibilityRole="radiogroup" agrupa las opciones para el
    // lector de pantalla: anuncia "1 de 5" en vez de leerlas sueltas.
    <View style={style} accessibilityRole="radiogroup">
      {opciones.map((opcion, i) => {
        const seleccionada = opcion.valor === valor;

        return (
          <Pressable
            key={opcion.valor}
            onPress={() => onChange(opcion.valor)}
            accessibilityRole="radio"
            accessibilityState={{ selected: seleccionada }}
            style={({ pressed }) => [
              estilos.opcion,
              // margen entre opciones, menos en la ultima
              i < opciones.length - 1 && estilos.separacion,
              seleccionada && estilos.seleccionada,
              // feedback tactil solo si NO esta ya seleccionada
              pressed && !seleccionada && estilos.presionada,
            ]}
          >
            <View style={estilos.texto}>
              <Text
                style={[
                  estilos.titulo,
                  seleccionada && estilos.tituloSeleccionado,
                ]}
              >
                {opcion.titulo}
              </Text>

              {/* Ternario y no &&: con descripcion="" el && devuelve ""
                  y React Native crashea con "Text strings must be
                  rendered within a <Text> component". */}
              {opcion.descripcion ? (
                <Text style={estilos.descripcion}>{opcion.descripcion}</Text>
              ) : null}
            </View>

            {/* Circulito de radio. Dos Views concentricos:
                el borde siempre, el punto solo si esta elegida. */}
            <View
              style={[
                estilos.circulo,
                seleccionada && estilos.circuloSeleccionado,
              ]}
            >
              {seleccionada ? <View style={estilos.punto} /> : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const estilos = StyleSheet.create({
  opcion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    backgroundColor: colors.surface,
    ...shadow.card,
    borderRadius: radius.lg,
    // El borde hairline se queda aunque la separacion ahora la de la sombra:
    // `seleccionada` sube a 1.5 y en RN el borde ocupa lugar. Sin una base de
    // 0.5, elegir una opcion la correria 1.5px en vez de 1. La separacion la
    // hace la sombra; esto es geometria.
    borderWidth: 0.5,
    borderColor: colors.border,
  },
  separacion: {
    marginBottom: spacing.sm,
  },
  // Borde mas grueso + fondo distinto. NO uso solo color:
  // si el usuario no distingue bien los colores, el grosor
  // del borde y el punto del circulo siguen indicando cual eligio.
  seleccionada: {
    borderWidth: 1.5,
    borderColor: colors.action,
    backgroundColor: colors.surfaceAlt,
  },
  presionada: {
    backgroundColor: colors.surfaceAlt,
  },

  texto: {
    flex: 1,   // ocupa todo el ancho sobrante y empuja el circulo a la derecha
  },
  titulo: {
    fontSize: fontSize.body,
    lineHeight: lineHeight.body,
    color: colors.textPrimary,
  },
  tituloSeleccionado: {
    fontWeight: '500',
  },
  descripcion: {
    fontSize: fontSize.small,
    lineHeight: lineHeight.small,
    color: colors.textSecondary,
    marginTop: 2,
  },

  circulo: {
    width: 22,
    height: 22,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circuloSeleccionado: {
    borderColor: colors.action,
  },
  punto: {
    width: 10,
    height: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.action,
  },
});
