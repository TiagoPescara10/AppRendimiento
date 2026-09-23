// app/onboarding/modo.tsx
//
// Paso 1: Seleccion del modo de uso (con objetivo diario vs solo un recuento).
// Diseno compacto: leon y titulo en fila horizontal, preservando la proporcion
// original de las cards y con respiro inferior adecuado sobre el safe area.

import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, Image, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { sembrarDatosDesarrollo } from '@/db/seeds/devSeed';

import { Pantalla } from '@/ui/Pantalla';
import { Progreso } from '@/ui/Progreso';
import {
  colors,
  spacing,
  radius,
  fontSize,
  fontWeight,
  lineHeight,
  shadow,
  sizes,
} from '@/ui/theme';
import {
  obtenerPerfilLocal,
  crearPerfil,
  actualizarPerfil,
} from '@/db/queries/perfil';
import { randomUUID } from '@/db/sync/uuid';
import type { ModoNutricion } from '@/db/schema';

export default function ModoOnboarding() {
  const router = useRouter();
  const [modo, setModo] = useState<ModoNutricion | null>(null);
  const [guardando, setGuardando] = useState(false);

  // Al montar, si ya habia un perfil con modo cargado, lo preseleccionamos
  useEffect(() => {
    let vivo = true;
    obtenerPerfilLocal()
      .then((p) => {
        if (vivo && p?.modo_nutricion) {
          setModo(p.modo_nutricion);
        }
      })
      .catch(console.error);

    return () => {
      vivo = false;
    };
  }, []);

  // Guarda la seleccion de inmediato en la base local
  const seleccionarModo = async (nuevoModo: ModoNutricion) => {
    setModo(nuevoModo);
    setGuardando(true);
    try {
      const perfil = await obtenerPerfilLocal();
      if (perfil) {
        await actualizarPerfil(perfil.id, { modo_nutricion: nuevoModo });
      } else {
        await crearPerfil({
          id: randomUUID(),
          fecha_alta: new Date().toISOString(),
          modo_nutricion: nuevoModo,
        });
      }
    } catch (e) {
      console.error('Error al guardar modo de nutricion:', e);
    } finally {
      setGuardando(false);
    }
  };

  const continuar = () => {
    if (!modo) return;
    router.push('/onboarding/datos');
  };

  const cargarSeedDev = async () => {
    if (guardando) return;
    setGuardando(true);
    try {
      await sembrarDatosDesarrollo();
      router.replace('/(tabs)');
    } catch (e: any) {
      console.error('Error al sembrar seed:', e);
      Alert.alert('Error', e?.message ?? 'No se pudo cargar el seed.');
    } finally {
      setGuardando(false);
    }
  };

  const totalPasos = modo === 'recuento' ? 4 : 6;

  return (
    <Pantalla scroll={false} style={estilos.contenedor}>
      {/* Header: progreso del paso 1 */}
      <View style={estilos.header}>
        <View style={estilos.barraNavegacion}>
          {router.canGoBack() && (
            <Pressable
              onPress={() => router.back()}
              accessibilityRole="button"
              accessibilityLabel="Volver"
              hitSlop={8}
              style={({ pressed }) => [
                estilos.botonVolver,
                pressed && estilos.botonVolverPresionado,
              ]}
            >
              <Ionicons
                name="chevron-back"
                size={sizes.iconSmall}
                color={colors.textPrimary}
              />
            </Pressable>
          )}

          <Text style={estilos.etiquetaPaso}>
            PASO 1 DE {totalPasos}
          </Text>

          {router.canGoBack() && <View style={estilos.espaciadorHeader} />}
        </View>

        <Progreso actual={1} total={totalPasos} />
      </View>

      {/* Bloque en fila: Leon Coach (~76px) + Titulo y Bajada */}
      <View style={estilos.bloqueFila}>
        <Image
          source={require('@/assets/images/leon-coach-alt.png')}
          style={estilos.imagenLeon}
          resizeMode="contain"
          accessibilityIgnoresInvertColors
        />
        <View style={estilos.bloqueTexto}>
          <Text style={estilos.titulo}>¿Cómo querés usar la app?</Text>
          <Text style={estilos.subtitulo}>
            Podés cambiarlo después desde tu perfil.
          </Text>
        </View>
      </View>

      {/* Cards seleccionables con la proporcion y padding original */}
      <View style={estilos.grupoCards}>
        {/* CARD A - Con objetivo diario */}
        <Pressable
          accessibilityRole="radio"
          accessibilityState={{ checked: modo === 'objetivo' }}
          onPress={() => seleccionarModo('objetivo')}
          style={({ pressed }) => [
            estilos.card,
            modo === 'objetivo' ? estilos.cardSeleccionada : estilos.cardNoSeleccionada,
            pressed && estilos.cardPresionada,
          ]}
        >
          <View style={estilos.cardFilaSuperior}>
            <View style={estilos.tituloIconoFila}>
              <View style={estilos.iconoCirculo}>
                <Ionicons name="pie-chart-outline" size={18} color={colors.action} />
              </View>
              <Text style={estilos.cardTitulo}>Con objetivo diario</Text>
            </View>

            {/* Radio button */}
            <View
              style={[
                estilos.radioOuter,
                modo === 'objetivo' && estilos.radioOuterSeleccionado,
              ]}
            >
              {modo === 'objetivo' && <View style={estilos.radioInner} />}
            </View>
          </View>

          <Text style={estilos.cardDescripcion}>
            Te calculamos cuántas calorías y macros necesitás según tu peso,
            altura y objetivo. Vas a ver cuánto te falta cada día.
          </Text>

          <View style={estilos.separador} />

          <Text style={estilos.incluyeEtiqueta}>INCLUYE:</Text>

          <View style={estilos.listaItems}>
            <View style={estilos.itemFila}>
              <Ionicons name="checkmark" size={16} color={colors.action} />
              <Text style={estilos.itemTexto}>
                Cálculo personalizado de calorías y macros
              </Text>
            </View>
            <View style={estilos.itemFila}>
              <Ionicons name="checkmark" size={16} color={colors.action} />
              <Text style={estilos.itemTexto}>Barra de progreso diario</Text>
            </View>
            <View style={estilos.itemFila}>
              <Ionicons name="checkmark" size={16} color={colors.action} />
              <Text style={estilos.itemTexto}>
                Seguimiento de objetivo de peso
              </Text>
            </View>
          </View>
        </Pressable>

        {/* CARD B - Solo un recuento */}
        <Pressable
          accessibilityRole="radio"
          accessibilityState={{ checked: modo === 'recuento' }}
          onPress={() => seleccionarModo('recuento')}
          style={({ pressed }) => [
            estilos.card,
            modo === 'recuento' ? estilos.cardSeleccionada : estilos.cardNoSeleccionada,
            pressed && estilos.cardPresionada,
          ]}
        >
          <View style={estilos.cardFilaSuperior}>
            <View style={estilos.tituloIconoFila}>
              <View style={estilos.iconoCirculo}>
                <Ionicons name="clipboard-outline" size={18} color={colors.action} />
              </View>
              <Text style={estilos.cardTitulo}>Solo un recuento</Text>
            </View>

            {/* Radio button */}
            <View
              style={[
                estilos.radioOuter,
                modo === 'recuento' && estilos.radioOuterSeleccionado,
              ]}
            >
              {modo === 'recuento' && <View style={estilos.radioInner} />}
            </View>
          </View>

          <Text style={estilos.cardDescripcion}>
            Registrás lo que comés y entrenás, sin metas numéricas. Vas a ver un
            resumen de tus hábitos, sin objetivo que cumplir.
          </Text>

          <View style={estilos.separador} />

          <Text style={estilos.incluyeEtiqueta}>INCLUYE:</Text>

          <View style={estilos.listaItems}>
            <View style={estilos.itemFila}>
              <Ionicons name="checkmark" size={16} color={colors.action} />
              <Text style={estilos.itemTexto}>
                Registro libre de comidas y entrenamientos
              </Text>
            </View>
            <View style={estilos.itemFila}>
              <Ionicons name="checkmark" size={16} color={colors.action} />
              <Text style={estilos.itemTexto}>
                Resumen de hábitos, sin barras de cumplimiento
              </Text>
            </View>
            <View style={estilos.itemFila}>
              <Ionicons name="checkmark" size={16} color={colors.action} />
              <Text style={estilos.itemTexto}>Menos preguntas para empezar</Text>
            </View>
          </View>
        </Pressable>
      </View>

      {/* Boton Continuar (54px alto, con margen respecto al safe area) */}
      <View style={estilos.contenedorBoton}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: !modo || guardando }}
          disabled={!modo || guardando}
          onPress={continuar}
          style={({ pressed }) => [
            estilos.botonContinuar,
            !modo && estilos.botonDeshabilitado,
            pressed && modo && estilos.botonPresionado,
          ]}
        >
          <Text style={estilos.textoBotonContinuar}>Continuar</Text>
          <Ionicons name="arrow-forward" size={18} color={colors.textOnAction} />
        </Pressable>

        {__DEV__ && (
          <Pressable
            accessibilityRole="button"
            disabled={guardando}
            onPress={cargarSeedDev}
            style={({ pressed }) => [
              estilos.botonDev,
              pressed && { opacity: 0.6 },
            ]}
          >
            <Ionicons name="flash-outline" size={15} color={colors.textSecondary} />
            <Text style={estilos.textoBotonDev}>
              {guardando ? 'Cargando datos de prueba…' : '⚡ Cargar datos de prueba (Seed Dev)'}
            </Text>
          </Pressable>
        )}
      </View>
    </Pantalla>
  );
}

const estilos = StyleSheet.create({
  contenedor: {
    gap: spacing.md,
    paddingBottom: spacing.xxl,
  },
  header: {
    gap: spacing.sm,
  },
  barraNavegacion: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: sizes.controlSmall,
    position: 'relative',
  },
  botonVolver: {
    position: 'absolute',
    left: 0,
    width: sizes.controlSmall,
    height: sizes.controlSmall,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.card,
  },
  botonVolverPresionado: {
    backgroundColor: colors.surfaceAlt,
  },
  espaciadorHeader: {
    width: sizes.controlSmall,
  },
  etiquetaPaso: {
    fontSize: fontSize.caption,
    fontWeight: fontWeight.bold,
    color: colors.textSecondary,
    letterSpacing: 1.2,
  },
  bloqueFila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.xs,
  },
  imagenLeon: {
    width: 94,
    height: 94,
  },
  bloqueTexto: {
    flex: 1,
    justifyContent: 'center',
    gap: 2,
  },
  titulo: {
    fontSize: fontSize.title,
    lineHeight: lineHeight.title,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  subtitulo: {
    fontSize: fontSize.small,
    lineHeight: lineHeight.small,
    color: colors.textSecondary,
  },
  grupoCards: {
    gap: spacing.sm + 2,
  },
  card: {
    borderRadius: radius.lg,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    ...shadow.card,
  },
  cardSeleccionada: {
    backgroundColor: colors.accentSoft,
    borderWidth: 2,
    borderColor: colors.action,
  },
  cardNoSeleccionada: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardPresionada: {
    opacity: 0.95,
  },
  cardFilaSuperior: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  tituloIconoFila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  iconoCirculo: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitulo: {
    fontSize: fontSize.body - 1,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    flex: 1,
  },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOuterSeleccionado: {
    borderWidth: 2,
    borderColor: colors.action,
    backgroundColor: colors.action,
  },
  radioInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.surface,
  },
  cardDescripcion: {
    fontSize: fontSize.small - 1,
    lineHeight: lineHeight.small - 2,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  separador: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.sm,
  },
  incluyeEtiqueta: {
    fontSize: fontSize.caption - 1,
    fontWeight: fontWeight.bold,
    color: colors.textSecondary,
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  listaItems: {
    gap: 3,
  },
  itemFila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  itemTexto: {
    fontSize: fontSize.small - 1,
    lineHeight: lineHeight.caption + 1,
    color: colors.textPrimary,
    flex: 1,
  },
  contenedorBoton: {
    marginTop: spacing.xs,
  },
  botonContinuar: {
    height: 52,
    backgroundColor: colors.action,
    borderRadius: radius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    ...shadow.card,
  },
  botonDeshabilitado: {
    opacity: 0.4,
  },
  botonPresionado: {
    backgroundColor: colors.actionPressed,
  },
  textoBotonContinuar: {
    fontSize: fontSize.body,
    fontWeight: fontWeight.bold,
    color: colors.textOnAction,
  },
  botonDev: {
    marginTop: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
  },
  textoBotonDev: {
    fontSize: fontSize.caption,
    color: colors.textSecondary,
    fontWeight: fontWeight.medium,
  },
});
