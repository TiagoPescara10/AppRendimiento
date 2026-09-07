// Una fila de la configuracion del temporizador: etiqueta y ayuda a la
// izquierda, y a la derecha [−] [numero] [+].
//
// El numero es un TextInput, no un Text. Pasar de 20 a 90 segundos con el [+]
// son catorce toques; escribirlo son dos. Los +/- siguen estando porque para
// mover de a poco son mejores que abrir el teclado.
//
// El [+] va en color de accion y el [−] en superficie: subir es lo que se hace
// mas seguido, y de las dos es la que conviene encontrar sin mirar.

import { useState } from 'react';
import { View, Text, Pressable, TextInput, StyleSheet } from 'react-native';
import { colors, spacing, radius, fontSize, lineHeight, fontWeight, sizes } from '@/ui/theme';

type Props = {
  etiqueta: string;
  /** El numero crudo. El formato lo arma este componente. */
  valor: number;
  /** Unidad al lado del numero, tipo "s". */
  sufijo?: string;
  /**
   * Si viene, reemplaza al input. Es para estados que no son un numero, como
   * el "Libre" del cronometro.
   */
  textoFijo?: string;
  /** Renglon chico bajo la etiqueta. Para explicar sin abrir un dialogo. */
  ayuda?: string;
  onBajar: () => void;
  onSubir: () => void;
  /** Lo que se escribio a mano. Quien recibe lo pasa por ajustarConfig. */
  onEscribir: (n: number) => void;
  puedeBajar?: boolean;
  puedeSubir?: boolean;
  /** Atajo opcional debajo de la ayuda, tipo "Sin limite". */
  atajo?: { titulo: string; activo: boolean; onPress: () => void };
};

export function FilaNumero({
  etiqueta,
  valor,
  sufijo,
  textoFijo,
  ayuda,
  onBajar,
  onSubir,
  onEscribir,
  puedeBajar = true,
  puedeSubir = true,
  atajo,
}: Props) {
  // Mientras se edita, el texto vive aca y no en la config: si cada tecla
  // pasara por ajustarConfig, borrar el "2" de "20" dejaria un 0 acotado al
  // minimo y el campo se pelearia con el usuario mientras escribe.
  const [texto, setTexto] = useState<string | null>(null);

  const confirmar = () => {
    const n = Number(texto);
    // Vacio, con letras o fuera de rango: se descarta y vuelve al valor de
    // antes, sin alert. El limite real lo pone ajustarConfig aguas arriba.
    if (texto !== null && texto.trim() !== '' && Number.isFinite(n)) onEscribir(n);
    setTexto(null);
  };

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
        <BotonRedondo
          signo="−"
          onPress={onBajar}
          activo={puedeBajar}
          etiqueta={`Bajar ${etiqueta}`}
        />

        {textoFijo !== undefined ? (
          <Text style={estilos.fijo} numberOfLines={1}>
            {textoFijo}
          </Text>
        ) : (
          <View style={estilos.campo}>
            <TextInput
              // selectTextOnFocus deja todo seleccionado al tocar: se escribe
              // encima en vez de tener que borrar digito por digito.
              selectTextOnFocus
              value={texto ?? String(valor)}
              onChangeText={setTexto}
              onFocus={() => setTexto(String(valor))}
              onBlur={confirmar}
              onSubmitEditing={confirmar}
              keyboardType="number-pad"
              returnKeyType="done"
              accessibilityLabel={etiqueta}
              style={estilos.input}
            />
            {sufijo ? <Text style={estilos.sufijo}>{sufijo}</Text> : null}
          </View>
        )}

        <BotonRedondo
          signo="+"
          onPress={onSubir}
          activo={puedeSubir}
          etiqueta={`Subir ${etiqueta}`}
          primario
        />
      </View>
    </View>
  );
}

function BotonRedondo({
  signo,
  onPress,
  activo,
  etiqueta,
  primario = false,
}: {
  signo: string;
  onPress: () => void;
  activo: boolean;
  etiqueta: string;
  primario?: boolean;
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
        primario ? estilos.botonPrimario : estilos.botonSecundario,
        pressed && activo && (primario ? estilos.presionadoPrimario : estilos.presionado),
        !activo && estilos.inactivo,
      ]}
    >
      <Text style={[estilos.signo, primario && estilos.signoPrimario]}>{signo}</Text>
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  botonSecundario: {
    borderWidth: sizes.hairline,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  botonPrimario: { backgroundColor: colors.action },
  presionado: { backgroundColor: colors.surfaceAlt },
  presionadoPrimario: { backgroundColor: colors.actionPressed },
  inactivo: { opacity: 0.35 },
  signo: {
    fontSize: fontSize.subtitle,
    lineHeight: lineHeight.subtitle,
    color: colors.textPrimary,
  },
  signoPrimario: { color: colors.textOnAction },

  // Ancho fijo: sin esto los botones se corren al pasar de "9" a "10".
  campo: {
    minWidth: 68,
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: 2,
  },
  input: {
    minWidth: 40,
    textAlign: 'center',
    paddingVertical: 0,
    fontSize: fontSize.subtitle,
    lineHeight: lineHeight.subtitle,
    fontWeight: fontWeight.medium,
    color: colors.textPrimary,
  },
  sufijo: { fontSize: fontSize.small, color: colors.textSecondary },
  fijo: {
    minWidth: 68,
    textAlign: 'center',
    fontSize: fontSize.subtitle,
    lineHeight: lineHeight.subtitle,
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
