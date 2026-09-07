// El anillo de progreso de la fase actual, con el numero adentro.
//
// Un numero solo no dice si falta mucho o poco: hay que leer el digito y
// compararlo contra la duracion que uno recuerda haber puesto. El arco se lee
// de reojo, que es como se mira esto en el medio de una serie.
//
// El anillo se VACIA a medida que corre la fase: arranca completo y se va
// consumiendo.

import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { colors, fontSize, lineHeight, fontWeight } from '@/ui/theme';

const TAMANO = 260;
const GROSOR = 12;

// El radio es el de la LINEA MEDIA del trazo, no el del borde: SVG centra el
// stroke sobre el path, asi que con r = TAMANO/2 medio grosor quedaria cortado
// contra el borde del lienzo.
const RADIO = (TAMANO - GROSOR) / 2;
const CIRCUNFERENCIA = 2 * Math.PI * RADIO;

export function Anillo({
  numero,
  /** 1 = fase entera por delante, 0 = terminada. null = sin anillo. */
  fraccion,
}: {
  numero: string;
  fraccion: number | null;
}) {
  return (
    <View style={estilos.caja}>
      {fraccion !== null && (
        <Svg width={TAMANO} height={TAMANO}>
          {/* La pista: el anillo entero, tenue, para que se vea cuanto falta
              ademas de cuanto queda. */}
          <Circle
            cx={TAMANO / 2}
            cy={TAMANO / 2}
            r={RADIO}
            fill="none"
            stroke={colors.onFaseTenue}
            strokeWidth={GROSOR}
          />
          {/* Lo que queda de la fase.
              Con strokeDasharray = circunferencia el guion mide una vuelta
              exacta, asi que el offset recorta desde el final: en 0 se dibuja
              el circulo completo y en la circunferencia entera, nada.
              El rotate(-90) mueve el arranque de las 3 a las 12. */}
          <Circle
            cx={TAMANO / 2}
            cy={TAMANO / 2}
            r={RADIO}
            fill="none"
            stroke={colors.textOnFase}
            strokeWidth={GROSOR}
            strokeLinecap="round"
            strokeDasharray={CIRCUNFERENCIA}
            strokeDashoffset={CIRCUNFERENCIA * (1 - fraccion)}
            transform={`rotate(-90 ${TAMANO / 2} ${TAMANO / 2})`}
          />
        </Svg>
      )}

      <View style={estilos.centro} pointerEvents="none">
        <Text style={estilos.numero} allowFontScaling={false}>
          {numero}
        </Text>
      </View>
    </View>
  );
}

const estilos = StyleSheet.create({
  caja: {
    width: TAMANO,
    height: TAMANO,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Absoluto y no dentro del Svg: el numero es texto normal y asi conserva su
  // tipografia y su tabular-nums.
  centro: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  numero: {
    fontSize: fontSize.timer,
    lineHeight: lineHeight.timer,
    fontWeight: fontWeight.bold,
    color: colors.textOnFase,
    // Los digitos no cambian de ancho al pasar de 9 a 8: sin esto el numero
    // se mueve solo en cada segundo.
    fontVariant: ['tabular-nums'],
  },
});
