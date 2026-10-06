// src/features/compartir/components/TarjetaCompartir.tsx
//
// La tarjeta para compartir una sesion de cronometro. Tamano logico FIJO de
// 360 x 640, que es 1080 x 1920 dividido 3: captureRef la exporta a 1080 x 1920
// y la imagen sale igual en cualquier celular. En pantalla se muestra escalada
// desde el contenedor de afuera (ver app/evento/compartir.tsx), nunca con un
// transform sobre esta misma vista, que es la que se captura.
//
// Todas las medidas estan en esas unidades logicas y salen de las referencias
// tarjeta_A.png (con foto) y tarjeta_D.png (sin foto), dividiendo por 3.
//
// Capas, de atras hacia adelante:
//   1. fondo: la foto a sangre, o colors.action con los chevrons de las insignias
//   2. degrade de arriba, solo con foto: negro 45% -> transparente en 100
//   3. degrade de abajo, solo con foto: transparente -> negro 78% desde la mitad
//   4. textos
//
// Que se muestra lo decide contenidoTarjeta(); aca solo se dibuja. Los numeros
// van solos: sin festejo ni medallas.

import { forwardRef } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { colors, fontWeight } from '@/ui/theme';
import type { ContenidoTarjeta } from '../tarjeta';

export const ANCHO_TARJETA = 360;
export const ALTO_TARJETA = 640;

const MARGEN = 27;

interface Props {
  contenido: ContenidoTarjeta;
  fotoUri: string | null;
}

/**
 * Los tres chevrons de las insignias, como en tarjeta_D.png: de x 47 a 313,
 * con el vertice arriba en el centro, separados 67 entre si.
 */
function Chevrons() {
  const chevron = (dy: number) => `M 47 ${160 + dy} L 180 ${87 + dy} L 313 ${160 + dy}`;
  return (
    <Svg width={ANCHO_TARJETA} height={ALTO_TARJETA} style={StyleSheet.absoluteFill}>
      {[0, 67, 133].map((dy) => (
        <Path
          key={dy}
          d={chevron(dy)}
          stroke={colors.marcaAguaNivel}
          strokeWidth={13}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      ))}
    </Svg>
  );
}

/** Los dos degrades que hacen legible el blanco sobre cualquier foto. */
function Degrades() {
  return (
    <Svg width={ANCHO_TARJETA} height={ALTO_TARJETA} style={StyleSheet.absoluteFill}>
      <Defs>
        <LinearGradient id="arriba" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={colors.overlayFotoSuave} stopOpacity={1} />
          <Stop offset="1" stopColor={colors.overlayFotoSuave} stopOpacity={0} />
        </LinearGradient>
        <LinearGradient id="abajo" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={colors.overlayFotoFuerte} stopOpacity={0} />
          <Stop offset="1" stopColor={colors.overlayFotoFuerte} stopOpacity={1} />
        </LinearGradient>
      </Defs>
      <Rect x={0} y={0} width={ANCHO_TARJETA} height={100} fill="url(#arriba)" />
      <Rect x={0} y={ALTO_TARJETA / 2} width={ANCHO_TARJETA} height={ALTO_TARJETA / 2} fill="url(#abajo)" />
    </Svg>
  );
}

export const TarjetaCompartir = forwardRef<View, Props>(function TarjetaCompartir(
  { contenido, fotoUri },
  ref,
) {
  const conFoto = !!fotoUri;

  return (
    // collapsable={false}: en Android una vista que no dibuja nada propio se
    // aplana, y captureRef no tendria que capturar.
    <View ref={ref} collapsable={false} style={[estilos.tarjeta, !conFoto && estilos.sinFoto]}>
      {conFoto ? (
        <>
          <Image source={{ uri: fotoUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          <Degrades />
        </>
      ) : (
        <Chevrons />
      )}

      <View style={estilos.arriba}>
        <Text style={[estilos.marca, !conFoto && estilos.marcaSinFoto]}>AVANZA</Text>
        <Text style={estilos.fecha}>{contenido.fecha}</Text>
      </View>

      <View style={estilos.abajo}>
        {contenido.actividad && <Text style={estilos.actividad}>{contenido.actividad}</Text>}

        <View style={estilos.principalFila}>
          <Text style={estilos.principalValor}>{contenido.principal.valor}</Text>
          <Text style={estilos.principalUnidad}>{contenido.principal.unidad}</Text>
        </View>

        {contenido.columnas.length > 0 && (
          <View style={estilos.columnas}>
            {contenido.columnas.map((c, i) => (
              <View key={c.etiqueta} style={[estilos.columna, i > 0 && estilos.columnaConSeparador]}>
                <Text style={estilos.columnaValor} numberOfLines={1}>
                  {c.valor}
                </Text>
                <Text style={estilos.columnaEtiqueta}>{c.etiqueta}</Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </View>
  );
});

const estilos = StyleSheet.create({
  tarjeta: {
    width: ANCHO_TARJETA,
    height: ALTO_TARJETA,
    overflow: 'hidden',
    backgroundColor: colors.action,
  },
  sinFoto: { backgroundColor: colors.action },

  arriba: {
    position: 'absolute',
    top: 33,
    left: MARGEN,
    right: MARGEN,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  marca: {
    fontSize: 10,
    fontWeight: fontWeight.bold,
    letterSpacing: 2,
    color: colors.textoSobreFoto,
    opacity: 0.85,
  },
  marcaSinFoto: { color: colors.accentSoft },
  fecha: { fontSize: 11, color: colors.textoSobreFoto, opacity: 0.8 },

  abajo: { position: 'absolute', left: MARGEN, right: MARGEN, bottom: 30 },
  actividad: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: fontWeight.bold,
    letterSpacing: 1.5,
    color: colors.accentSoft,
  },
  principalFila: { flexDirection: 'row', alignItems: 'baseline' },
  principalValor: {
    fontSize: 76,
    lineHeight: 84,
    fontWeight: fontWeight.bold,
    letterSpacing: -2,
    color: colors.textoSobreFoto,
  },
  principalUnidad: { fontSize: 23, marginLeft: 5, color: colors.textoSobreFoto },

  // Unos 45 de linea de base a linea de base entre el numero y los valores.
  columnas: { flexDirection: 'row', marginTop: 8 },
  columna: { flex: 1 },
  columnaConSeparador: {
    borderLeftWidth: 1,
    borderLeftColor: colors.separadorSobreFoto,
    paddingLeft: 13,
  },
  columnaValor: {
    fontSize: 24,
    lineHeight: 28,
    fontWeight: fontWeight.bold,
    color: colors.textoSobreFoto,
  },
  columnaEtiqueta: { fontSize: 11, lineHeight: 14, color: colors.textoSobreFotoSuave },
});
