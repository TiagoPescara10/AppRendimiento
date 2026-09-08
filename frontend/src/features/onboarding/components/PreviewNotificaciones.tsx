// Preview: las notificaciones que manda la app antes y despues de un partido.
//
// Simula una pantalla de bloqueo porque ahi es donde se leen de verdad: el
// punto es que no hace falta abrir la app. Las tres notificaciones son el arco
// completo de un partido (antes, justo antes, despues), apiladas con opacidad
// decreciente para que se lea como una pila y no como una lista de tres cosas
// del mismo peso.
//
// Datos falsos y fijos: es una ilustracion, no el estado del usuario.

import { View, Text, StyleSheet } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { colors, spacing, radius, fontSize, lineHeight, fontWeight } from '@/ui/theme';

const NOTIFICACIONES = [
  {
    titulo: 'Partido en 3 horas',
    cuerpo: 'Comé algo con carbohidratos ahora: pasta, arroz o pan. Liviano en grasas.',
  },
  {
    titulo: 'Falta una hora',
    cuerpo: 'Tomá agua ahora y no comas nada pesado hasta después.',
  },
  {
    titulo: '¿Cómo salió?',
    cuerpo: 'Metele proteína en los próximos 45 minutos para recuperar.',
  },
];

/**
 * Opacidad de cada notificacion segun su lugar en la pila. La de arriba es la
 * que importa; las de abajo estan para contar que esto pasa varias veces a lo
 * largo del dia, no para leerse una por una.
 *
 * Va sobre el View entero, con el fondo en blanco SOLIDO. Un blanco
 * translucido como color de fondo (rgba) sobre el marino no da blanco tenue,
 * da celeste: es el mismo motivo por el que en el temporizador los blancos
 * translucidos son solo decorativos y el texto va en blanco pleno.
 *
 * Y no bajan mas de 0.7 por lo mismo: pasado ese punto el marino de atras
 * empieza a teñir la tarjeta y deja de leerse como una notificacion.
 */
const OPACIDAD = [1, 0.85, 0.7];

export function PreviewNotificaciones() {
  return (
    <View style={estilos.contenedor}>
      <View style={estilos.pantalla}>
        {/* El degradado va en SVG y no con expo-linear-gradient: react-native-svg
            ya es una dependencia del proyecto por el anillo del temporizador,
            asi que esto no agrega ninguna.
            viewBox de 1x1 con preserveAspectRatio="none" en vez de width="100%":
            el porcentaje se resuelve contra una caja que no siempre es la del
            contenedor, y cuando queda corto se ve el crema de la pagina asomando
            por el borde. Con viewBox el rect se estira a lo que mida el Svg,
            mida lo que mida. */}
        <Svg style={StyleSheet.absoluteFill} viewBox="0 0 1 1" preserveAspectRatio="none">
          <Defs>
            <LinearGradient id="fondoMarino" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={colors.accent} />
              <Stop offset="1" stopColor={colors.actionPressed} />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="1" height="1" fill="url(#fondoMarino)" />
        </Svg>

        <Text style={estilos.hora} allowFontScaling={false}>9:41</Text>
        <Text style={estilos.fecha}>Sábado 12 de abril</Text>

        <View style={estilos.pila}>
          {NOTIFICACIONES.map((n, i) => (
            <View key={n.titulo} style={[estilos.notificacion, { opacity: OPACIDAD[i] }]}>
              <Text style={estilos.notiTitulo}>{n.titulo}</Text>
              <Text style={estilos.notiCuerpo} numberOfLines={2}>{n.cuerpo}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Afuera de la pantalla de bloqueo y no adentro: adentro iba en blanco
          translucido sobre el degradado oscuro, o sea ilegible, y ademas le
          peleaba el lugar a la tercera notificacion. Aca es una aclaracion en
          gris sobre el crema, que es lo que es. */}
      <Text style={estilos.nota}>Sale de tu peso, tu objetivo y lo que ya comiste hoy</Text>
    </View>
  );
}

const estilos = StyleSheet.create({
  contenedor: {
    flex: 1,
    gap: spacing.sm,
  },

  pantalla: {
    flex: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    // Fondo solido ademas del degradado: es la red de seguridad para que un
    // pixel donde el Svg no llegue sea marino y no el crema de la pagina.
    // Es el stop de abajo del degradado, asi que no se nota.
    backgroundColor: colors.actionPressed,
    // Recorta el rect del degradado contra el radio de la card.
    overflow: 'hidden',
    gap: spacing.xs,
  },

  hora: {
    fontSize: fontSize.display,
    lineHeight: lineHeight.display,
    fontWeight: fontWeight.bold,
    color: colors.textOnFase,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  fecha: {
    fontSize: fontSize.small,
    lineHeight: lineHeight.small,
    color: colors.onFaseMedio,
    textAlign: 'center',
  },

  // space-between y no center: centradas dejaban un hueco muerto entre la
  // tercera y el fondo. Asi las tres reparten el alto que sobra debajo de la
  // hora, y la ultima apoya contra el borde de abajo.
  //
  // paddingTop porque space-between pega la primera contra la fecha: el hueco
  // que reparte es el de ABAJO de cada tarjeta, no el de arriba de la pila.
  pila: {
    flex: 1,
    justifyContent: 'space-between',
    paddingTop: spacing.md,
  },
  notificacion: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 2,
  },
  notiTitulo: {
    fontSize: fontSize.small,
    lineHeight: lineHeight.small,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  notiCuerpo: {
    fontSize: fontSize.small,
    lineHeight: lineHeight.small,
    color: colors.textSecondary,
  },

  nota: {
    fontSize: fontSize.caption,
    lineHeight: lineHeight.caption,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
