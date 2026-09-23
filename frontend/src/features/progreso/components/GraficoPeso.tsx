// El grafico de peso: los registros crudos finitos y en gris, la tendencia
// gruesa y en marino.
//
// LA JERARQUIA VISUAL ES EL PUNTO DE ESTE COMPONENTE, no una decision
// estetica. El peso oscila hasta dos kilos por retencion de liquidos, asi que
// una serie de puntos crudos dibuja picos que no le pasaron a nadie y asustan
// sin motivo. Lo que se puede leer es la tendencia, y por eso es la unica
// linea que resalta. Los crudos quedan igual —tapar los datos reales seria
// otra cosa— pero se leen como lo que son: la nube de la que sale la linea.
//
// El componente no calcula nada mas que coordenadas: la tendencia llega ya
// suavizada desde lib/nutricion.ts y el dominio sale de lib/progreso.ts.

import { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';

import { colors, spacing, fontSize, lineHeight } from '@/ui/theme';
import type { PuntoPeso } from '@/lib/nutricion';
import { dominioPeso, objetivoVisible } from '@/lib/progreso';
import { diasEntre } from '@/lib/fechas';
import { kg } from '../formato';

const ALTO = 160;

/** Aire a los costados para que un punto del borde no quede cortado al medio. */
const MARGEN_X = 6;
const MARGEN_Y = 10;

/** Ancho de la franja derecha donde va la etiqueta del objetivo. */
const ANCHO_ETIQUETA = 44;

type Props = {
  /** Un punto por dia. Linea fina gris con sus puntitos. */
  crudos: PuntoPeso[];
  /** Media movil. Vacia cuando no hay dias suficientes: entonces no se dibuja. */
  tendencia: PuntoPeso[];
  objetivoKg: number | null;
};

export function GraficoPeso({ crudos, tendencia, objetivoKg }: Props) {
  // El ancho no se sabe hasta que el layout corre: en React Native un Svg
  // necesita un numero, no un porcentaje que resuelva el navegador.
  const [ancho, setAncho] = useState(0);

  const puntos = crudos.length > 0 ? crudos : tendencia;
  const listo = ancho > 0 && puntos.length > 0;

  // El dominio vertical mira las dos series: si la tendencia se saliera del
  // rango de los crudos, la linea marino quedaria cortada contra el borde.
  const valores = [...crudos, ...tendencia].map((p) => p.peso_kg);
  const dominio = dominioPeso(valores, objetivoKg);
  const dibujarObjetivo = objetivoVisible(dominio, objetivoKg);

  // Eje x en DIAS y no por indice: dos pesadas con diez dias de hueco tienen
  // que verse con el hueco. Por indice, una pausa de un mes se veria igual que
  // dos dias seguidos.
  const primera = puntos[0]?.fecha ?? '';
  const ultima = puntos[puntos.length - 1]?.fecha ?? '';
  const dias = Math.max(1, diasEntre(primera, ultima));

  const anchoUtil = Math.max(1, ancho - MARGEN_X * 2 - (dibujarObjetivo ? ANCHO_ETIQUETA : 0));
  const altoUtil = ALTO - MARGEN_Y * 2;

  const x = (fecha: string) => MARGEN_X + (diasEntre(primera, fecha) / dias) * anchoUtil;
  const y = (peso: number) =>
    MARGEN_Y + (1 - (peso - dominio.min) / Math.max(0.001, dominio.max - dominio.min)) * altoUtil;

  const camino = (serie: PuntoPeso[]) =>
    serie.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(p.fecha)} ${y(p.peso_kg)}`).join(' ');

  return (
    <View onLayout={(e) => setAncho(e.nativeEvent.layout.width)} style={estilos.caja}>
      {listo && (
        <Svg width={ancho} height={ALTO}>
          {/* El objetivo, punteado: es una meta, no un dato medido. */}
          {dibujarObjetivo && objetivoKg !== null && (
            <Line
              x1={MARGEN_X}
              y1={y(objetivoKg)}
              x2={MARGEN_X + anchoUtil}
              y2={y(objetivoKg)}
              stroke={colors.borderStrong}
              strokeWidth={1}
              strokeDasharray="4 4"
            />
          )}

          {/* Los crudos: linea fina y puntitos. Van primero para que la
              tendencia les pase por encima donde se crucen. */}
          {crudos.length > 1 && (
            <Path d={camino(crudos)} fill="none" stroke={colors.borderStrong} strokeWidth={1} />
          )}
          {crudos.map((p) => (
            <Circle
              key={p.fecha}
              cx={x(p.fecha)}
              cy={y(p.peso_kg)}
              r={2.5}
              fill={colors.borderStrong}
            />
          ))}

          {/* La tendencia. Gruesa y marino: es la que hay que leer. */}
          {tendencia.length > 1 && (
            <Path
              d={camino(tendencia)}
              fill="none"
              stroke={colors.action}
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
        </Svg>
      )}

      {/* La etiqueta del objetivo va en texto normal y no en un <Text> de SVG:
          asi hereda la tipografia de la app y acompaña al font scaling. */}
      {listo && dibujarObjetivo && objetivoKg !== null && (
        <Text
          style={[estilos.etiquetaObjetivo, { top: y(objetivoKg) - lineHeight.caption / 2 }]}
          numberOfLines={1}
        >
          {kg(objetivoKg)} kg
        </Text>
      )}
    </View>
  );
}

const estilos = StyleSheet.create({
  caja: {
    height: ALTO,
    marginTop: spacing.sm,
  },
  etiquetaObjetivo: {
    position: 'absolute',
    right: 0,
    width: ANCHO_ETIQUETA,
    textAlign: 'right',
    fontSize: fontSize.caption,
    lineHeight: lineHeight.caption,
    color: colors.textSecondary,
  },
});
