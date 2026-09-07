// Una fila de la configuracion del temporizador: etiqueta, valor y los dos
// botones de +/-.
//
// Los botones son grandes (sizes.control) y no iconitos: esto se toca con la
// mano transpirada y apurado, antes de arrancar. El valor va en el medio con
// ancho fijo para que no se muevan los botones al pasar de "9" a "10".

import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors, spacing, radius, fontSize, lineHeight, fontWeight, sizes } from '@/ui/theme';

type Props = {
  etiqueta: string;
  /** Ya formateado: "20 s", "6", "Libre". */
  valor: string;
  /** Renglon chico bajo la etiqueta. Para explicar sin abrir un dialogo. */
  ayuda?: string;
  onBajar: () => void;
  onSubir: () => void;
  puedeBajar?: boolean;
  puedeSubir?: boolean;
  /** Atajo opcional a la derecha, tipo "Libre". */
  atajo?: { titulo: string; activo: boolean; onPress: () => void };
};

export function FilaNumero({
  etiqueta,
  valor,
  ayuda,
  onBajar,
  onSubir,
  puedeBajar = true,
  puedeSubir = true,
  atajo,
}: Props) {
  return (
    <View style={estilos.fila}>
      <View style={estilos.textos}>
        <Text style={estilos.etiqueta}>{etiqueta}</Text>
        {ayuda ? <Text style={estilos.ayuda}>{ayuda}</Text> : null}

        {atajo ? (
          <Pressable
            onPress={atajo.onPress}
            accessibilityRole="button"
            accessibilityState={{ selected: atajo.activo }}
            style={({ pressed }) => [
              estilos.atajo,
              atajo.activo && estilos.atajoActivo,
              pressed && estilos.presionado,
            ]}
          >
            <Text style={[estilos.atajoTexto, atajo.activo && estilos.atajoTextoActivo]}>
              {atajo.titulo}
            </Text>
          </Pressable>
        ) : null}
      </View>

      <View style={estilos.controles}>
        <Boton signo="−" onPress={onBajar} activo={puedeBajar} etiqueta={`Bajar ${etiqueta}`} />
        <Text style={estilos.valor} numberOfLines={1}>
          {valor}
        </Text>
        <Boton signo="+" onPress={onSubir} activo={puedeSubir} etiqueta={`Subir ${etiqueta}`} />
      </View>
    </View>
  );
}

function Boton({
  signo,
  onPress,
  activo,
  etiqueta,
}: {
  signo: string;
  onPress: () => void;
  activo: boolean;
  etiqueta: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!activo}
      accessibilityRole="button"
      accessibilityLabel={etiqueta}
      // El area tactil real es mas grande que el circulo dibujado.
      hitSlop={spacing.sm}
      style={({ pressed }) => [
        estilos.boton,
        pressed && activo && estilos.presionado,
        !activo && estilos.inactivo,
      ]}
    >
      <Text style={estilos.signo}>{signo}</Text>
    </Pressable>
  );
}

const estilos = StyleSheet.create({
  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  textos: { flex: 1, gap: spacing.xs },
  etiqueta: {
    fontSize: fontSize.body,
    lineHeight: lineHeight.body,
    color: colors.textPrimary,
  },
  ayuda: {
    fontSize: fontSize.caption,
    lineHeight: lineHeight.caption,
    color: colors.textSecondary,
  },

  controles: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  boton: {
    width: sizes.controlSmall,
    height: sizes.controlSmall,
    borderRadius: radius.pill,
    borderWidth: sizes.hairline,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  presionado: { backgroundColor: colors.surfaceAlt },
  inactivo: { opacity: 0.35 },
  signo: {
    fontSize: fontSize.subtitle,
    lineHeight: lineHeight.subtitle,
    color: colors.textPrimary,
  },

  // Ancho fijo: sin esto los botones se corren al pasar de "9 s" a "10 s".
  valor: {
    minWidth: 64,
    textAlign: 'center',
    fontSize: fontSize.body,
    lineHeight: lineHeight.body,
    fontWeight: fontWeight.medium,
    color: colors.textPrimary,
  },

  atajo: {
    alignSelf: 'flex-start',
    marginTop: spacing.xs,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: sizes.hairline,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  atajoActivo: { backgroundColor: colors.accentSoft, borderColor: colors.accentSoft },
  atajoTexto: { fontSize: fontSize.caption, color: colors.textSecondary },
  atajoTextoActivo: { color: colors.textOnAccentSoft },
});
