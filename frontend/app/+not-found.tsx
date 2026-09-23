// app/+not-found.tsx
//
// La pantalla que ve el usuario cuando cae en una ruta que no existe: un link
// viejo, un deep link mal armado, un push a una pantalla que se renombro.
//
// No dice "404 Not Found" ni habla de HTTP. El usuario no rompio nada y no
// tiene por que enterarse de como funciona el router: se salio de la rutina y
// el Coach Leon lo trae de vuelta. El objetivo es que salga de aca en un toque,
// asi que entra entera en el viewport y no scrollea.

import { useEffect } from 'react';
import { View, Text, Image, Pressable, StyleSheet } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { Pantalla } from '@/ui/Pantalla';
import { Boton } from '@/ui/Boton';
import {
  colors, spacing, radius, fontSize, lineHeight, fontWeight, shadow, sizes,
} from '@/ui/theme';

/** El "0" del medio: el aro que enmarca al leon. */
const ARO = 116;

/** Los dos "4". Arrancan de fontSize.timer y se recortan para que la
 *  composicion entera (4 + aro + 4) entre a lo ancho de 390px. */
const DIGITO = fontSize.timer - 8;

/** Los tres accesos de rescate. "Ayuda y soporte" no es una ruta propia:
 *  vive como bloque dentro de la pestaña Perfil, y ahi apunta. */
const RESCATES = [
  { icono: 'barbell-outline', texto: 'Entrenamientos', ruta: '/(tabs)/entrenamientos' },
  { icono: 'trending-up-outline', texto: 'Progreso', ruta: '/(tabs)/progreso' },
  { icono: 'help-buoy-outline', texto: 'Ayuda', ruta: '/(tabs)/perfil' },
] as const;

export default function NoEncontrado() {
  const router = useRouter();
  // La ruta que fallo. Es el unico dato util de esta pantalla: sin el, un link
  // roto se reporta como "me tiro error" y no hay con que buscarlo.
  const rutaFallida = usePathname();

  useEffect(() => {
    // TODO: cuando exista la capa de analitica, mandar aca el evento
    // `404_view` con { ruta: rutaFallida }. Por ahora queda en consola, que en
    // desarrollo alcanza para detectar el link roto.
    console.warn('[404_view] ruta inexistente:', rutaFallida);
  }, [rutaFallida]);

  // El header vuelve atras, pero si se llego por deep link no hay atras:
  // el fallback es el mismo destino que el boton principal.
  const volver = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  };

  return (
    <Pantalla scroll={false} style={estilos.pantalla}>
      {/* --- Header ------------------------------------------------------ */}
      {/* Tres columnas y no dos: el espaciador de la derecha mide lo mismo que
          el boton, asi el logo queda centrado en la pantalla y no en el hueco
          que sobra. */}
      <View style={estilos.header}>
        <Pressable
          onPress={volver}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Volver"
          style={({ pressed }) => [estilos.botonVolver, pressed && estilos.presionado]}
        >
          <Ionicons name="chevron-back" size={sizes.iconSmall} color={colors.textPrimary} />
        </Pressable>

        <Text style={estilos.marca}>Avanza</Text>

        <View style={estilos.espaciador} />
      </View>

      {/* --- Bloque central ---------------------------------------------- */}
      <View style={estilos.centro}>
        <View style={estilos.badge}>
          <Text style={estilos.badgeTexto}>FUERA DE JUEGO</Text>
        </View>

        <View style={estilos.composicion}>
          {/* Detalles deportivos de fondo. Decorativos: van tenues y fuera del
              arbol de accesibilidad para que el lector de pantalla no los lea. */}
          <Ionicons
            name="barbell-outline"
            size={64}
            color={colors.borderStrong}
            style={estilos.pesaFondo}
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
          <Ionicons
            name="triangle"
            size={30}
            color={colors.borderStrong}
            style={estilos.conoFondo}
            accessibilityElementsHidden
            importantForAccessibility="no"
          />

          <Text style={estilos.digito}>4</Text>

          {/* El cero es el aro, y adentro va el leon asomandose. */}
          <View style={estilos.aro}>
            <Image
              source={require('@/assets/images/leon-avatar.png')}
              style={estilos.leon}
              resizeMode="cover"
              accessibilityIgnoresInvertColors
            />
            {/* El destello dorado: el guiño que saca al error de lo grave. */}
            <View style={estilos.destello}>
              <Ionicons name="help" size={14} color={colors.textOnAccentSoft} />
            </View>
          </View>

          <Text style={estilos.digito}>4</Text>
        </View>

        <Text style={estilos.titulo}>Esta página se tomó el día de descanso</Text>

        <Text style={estilos.subtitulo}>
          El contenido que buscás no existe o lo movimos de lugar. Pero tu
          constancia no se detiene acá: volvamos al entrenamiento.
        </Text>
      </View>

      {/* --- Salida ------------------------------------------------------- */}
      <Boton
        titulo="Volver a Mi Día"
        icono="home"
        ancho
        onPress={() => router.replace('/(tabs)')}
      />

      <View style={estilos.rescates}>
        {RESCATES.map((r) => (
          <Pressable
            key={r.ruta}
            onPress={() => router.replace(r.ruta)}
            accessibilityRole="button"
            style={({ pressed }) => [estilos.rescate, pressed && estilos.rescatePresionado]}
          >
            <Ionicons name={r.icono} size={sizes.icon} color={colors.action} />
            <Text style={estilos.rescateTexto} numberOfLines={1}>{r.texto}</Text>
          </Pressable>
        ))}
      </View>
    </Pantalla>
  );
}

const estilos = StyleSheet.create({
  // Pantalla trae paddingBottom xxxl, pensado para listas que scrollean.
  // Aca no scrollea nada y ese aire de mas empuja los accesos contra el borde.
  pantalla: {
    paddingBottom: spacing.lg,
    gap: spacing.lg,
  },

  // --- header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  botonVolver: {
    width: sizes.controlSmall,
    height: sizes.controlSmall,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.card,
  },
  presionado: {
    backgroundColor: colors.surfaceAlt,
  },
  marca: {
    fontSize: fontSize.subtitle,
    lineHeight: lineHeight.subtitle,
    fontWeight: fontWeight.bold,
    color: colors.action,
    letterSpacing: 0.5,
  },
  espaciador: {
    width: sizes.controlSmall,
  },

  // --- centro
  // flex:1 se come lo que sobra entre el header y la salida, y centra el
  // bloque ahi adentro. Asi la composicion se acomoda sola en pantallas mas
  // altas o mas bajas que las 844px de referencia.
  centro: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  badge: {
    backgroundColor: colors.accentSoft,
    borderRadius: radius.pill,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  badgeTexto: {
    fontSize: fontSize.caption,
    fontWeight: fontWeight.bold,
    color: colors.textOnAccentSoft,
    letterSpacing: 1,
  },
  composicion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  digito: {
    fontSize: DIGITO,
    // lineHeight pegado al tamaño: por defecto el numero arrastra un colchon
    // arriba y abajo que lo desalinea del aro, que no lo tiene.
    lineHeight: DIGITO,
    fontWeight: '800',
    color: colors.action,
    letterSpacing: -4,
  },
  aro: {
    width: ARO,
    height: ARO,
    borderRadius: ARO / 2,
    // El grosor sale de la vertical del "4" a este tamaño: si el aro es mas
    // fino que los digitos, deja de leerse como el cero de la misma palabra.
    borderWidth: 12,
    borderColor: colors.action,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  leon: {
    width: ARO - 24,
    height: ARO - 24,
    borderRadius: (ARO - 24) / 2,
  },
  destello: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 26,
    height: 26,
    borderRadius: radius.pill,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pesaFondo: {
    position: 'absolute',
    left: -8,
    bottom: -18,
    opacity: 0.7,
    transform: [{ rotate: '-20deg' }],
  },
  conoFondo: {
    position: 'absolute',
    right: -6,
    top: -14,
    opacity: 0.7,
  },
  titulo: {
    fontSize: fontSize.title,
    lineHeight: lineHeight.title,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  subtitulo: {
    fontSize: fontSize.small,
    lineHeight: lineHeight.small,
    color: colors.textSecondary,
    textAlign: 'center',
    // Sin tope el renglon cruza los 358px del contenido y quedan lineas largas
    // e incomodas de barrer para un parrafo centrado.
    maxWidth: 300,
  },

  // --- rescates
  rescates: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  rescate: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xs,
    alignItems: 'center',
    gap: spacing.xs,
    ...shadow.card,
  },
  rescatePresionado: {
    backgroundColor: colors.surfaceAlt,
  },
  rescateTexto: {
    fontSize: fontSize.caption,
    fontWeight: fontWeight.medium,
    color: colors.textPrimary,
  },
});
