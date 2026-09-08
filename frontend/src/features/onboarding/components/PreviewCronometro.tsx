// Preview: el temporizador de intervalos corriendo.
//
// Reusa el Anillo de verdad (features/entrenamiento/components/Anillo) con
// datos falsos, no una copia: si el anillo cambia, esto cambia con el.
//
// El anillo pinta en textOnFase (blanco) y onFaseTenue, o sea que esta hecho
// para vivir sobre un fondo de fase. Por eso el preview va sobre faseTrabajo:
// es la misma combinacion que ve el usuario en la pantalla real.

import { View, Text, StyleSheet } from 'react-native';
import { Anillo, TAMANO as TAMANO_ANILLO } from '@/features/entrenamiento/components/Anillo';
import { colors, spacing, radius, fontSize, lineHeight, fontWeight } from '@/ui/theme';

// El anillo real mide para una pantalla completa; aca entra en el hueco de un
// preview. Se achica con transform y no con props porque el componente no
// recibe tamaño: el scale es visual y no toca su layout interno.
const ESCALA = 0.62;
const LADO = Math.round(TAMANO_ANILLO * ESCALA);

/** Una serie a mitad de camino. Inventada. */
const PASADAS = 8;
const PASADA_ACTUAL = 3;

export function PreviewCronometro() {
  return (
    <View style={estilos.pantalla}>
      <Text style={estilos.fase}>Trabajo</Text>

      {/* La caja mide lo que mide el anillo YA escalado. El anillo adentro
          sigue midiendo 260 y desborda parejo a los dos lados; el scale desde
          el centro lo mete justo. */}
      <View style={estilos.caja}>
        <View style={estilos.escalado}>
          <Anillo numero="0:45" fraccion={0.7} />
        </View>
      </View>

      <Text style={estilos.progreso}>Pasada {PASADA_ACTUAL} de {PASADAS}</Text>

      <View style={estilos.puntos}>
        {Array.from({ length: PASADAS }, (_, i) => {
          const n = i + 1;
          return (
            <View
              key={n}
              style={[
                estilos.punto,
                n < PASADA_ACTUAL && estilos.puntoHecho,
                n === PASADA_ACTUAL && estilos.puntoActual,
              ]}
            />
          );
        })}
      </View>
    </View>
  );
}

const estilos = StyleSheet.create({
  pantalla: {
    flex: 1,
    borderRadius: radius.lg,
    backgroundColor: colors.faseTrabajo,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    gap: spacing.sm,
    overflow: 'hidden',
  },

  fase: {
    fontSize: fontSize.subtitle,
    lineHeight: lineHeight.subtitle,
    fontWeight: fontWeight.medium,
    color: colors.textOnFase,
  },

  caja: {
    width: LADO,
    height: LADO,
    alignItems: 'center',
    justifyContent: 'center',
  },
  escalado: {
    transform: [{ scale: ESCALA }],
  },

  progreso: {
    fontSize: fontSize.small,
    lineHeight: lineHeight.small,
    color: colors.textOnFase,
  },

  // Mismos puntitos que la pantalla real: cuantas pasadas van y cual es la de
  // ahora. El actual mas grande, no solo mas claro.
  puntos: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  punto: {
    width: 6,
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.onFaseTenue,
  },
  puntoHecho: { backgroundColor: colors.onFaseMedio },
  puntoActual: {
    width: 10,
    height: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.textOnFase,
  },
});
