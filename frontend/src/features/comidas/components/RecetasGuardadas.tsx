// src/features/comidas/components/RecetasGuardadas.tsx
//
// Pestaña Guardadas de Mis comidas: las recetas, primero las usadas mas
// recientemente. Cada una muestra kcal y macros por porcion (calculados en
// SQL, ver listarRecetas) y cuantos ingredientes tiene. Tocarla la edita;
// "Agregar" la registra hoy.

import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';

import { Boton } from '@/ui/Boton';
import { colors, fontSize, fontWeight, lineHeight, radius, shadow, sizes, spacing } from '@/ui/theme';
import { listarRecetas, registrarReceta } from '@/db/queries/recetas';
import type { RecetaConResumen } from '@/db/queries/recetas';
import { aISOLocal } from '@/lib/fechas';
import { miles } from '@/lib/historial';
import { SheetAgregarReceta } from './SheetAgregarReceta';

export function RecetasGuardadas({
  usuarioId,
  onAviso,
}: {
  usuarioId: string;
  onAviso: (mensaje: string) => void;
}) {
  const router = useRouter();
  const [recetas, setRecetas] = useState<RecetaConResumen[] | null>(null);
  const [agregando, setAgregando] = useState<RecetaConResumen | null>(null);

  const cargar = useCallback(async () => {
    setRecetas(await listarRecetas(usuarioId));
  }, [usuarioId]);

  useFocusEffect(
    useCallback(() => {
      cargar().catch((e) => console.error('Error al cargar las recetas:', e));
    }, [cargar]),
  );

  const agregar = async (porciones: number, tipo: Parameters<typeof registrarReceta>[0]['tipo']) => {
    if (!agregando) return;
    const receta = agregando;
    setAgregando(null);
    try {
      await registrarReceta({
        recetaId: receta.id,
        usuarioId,
        tipo,
        fechaHora: aISOLocal(new Date()),
        porciones,
      });
      onAviso('Agregado a hoy');
      await cargar();
    } catch (e) {
      console.error('Error al registrar la receta:', e);
      onAviso('No se pudo agregar');
    }
  };

  return (
    <View style={estilos.contenedor}>
      <Boton
        titulo="Nueva receta"
        icono="add"
        variante="secundario"
        onPress={() => router.push('/perfil/receta')}
      />

      {recetas !== null && recetas.length === 0 && (
        <Text style={estilos.vacio}>
          Todavía no guardaste recetas. Armá una con lo que comés seguido y registrala en dos toques.
        </Text>
      )}

      {(recetas ?? []).map((r) => (
        <Pressable
          key={r.id}
          style={({ pressed }) => [estilos.card, pressed && estilos.presionada]}
          onPress={() => router.push({ pathname: '/perfil/receta', params: { id: r.id } })}
        >
          <View style={estilos.flex}>
            <Text style={estilos.nombre}>{r.nombre}</Text>
            <Text style={estilos.detalle}>
              {miles(r.kcal_porcion)} kcal por porción · {r.ingredientes}{' '}
              {r.ingredientes === 1 ? 'ingrediente' : 'ingredientes'}
            </Text>
            <View style={estilos.macros}>
              {(
                [
                  ['P', r.proteina_porcion, colors.protein],
                  ['C', r.carbohidratos_porcion, colors.carbs],
                  ['G', r.grasa_porcion, colors.fat],
                ] as const
              ).map(([letra, valor, color]) => (
                <View key={letra} style={estilos.macro}>
                  <View style={[estilos.punto, { backgroundColor: color }]} />
                  <Text style={estilos.macroTexto}>
                    {letra} {Math.round(valor)} g
                  </Text>
                </View>
              ))}
            </View>
          </View>
          <Pressable
            style={estilos.botonAgregar}
            onPress={() => setAgregando(r)}
            hitSlop={8}
            accessibilityLabel={`Agregar ${r.nombre} a hoy`}
          >
            <Text style={estilos.botonAgregarTexto}>Agregar</Text>
          </Pressable>
        </Pressable>
      ))}

      <SheetAgregarReceta
        receta={agregando}
        onCerrar={() => setAgregando(null)}
        onConfirmar={(porciones, tipo) => void agregar(porciones, tipo)}
      />
    </View>
  );
}

const estilos = StyleSheet.create({
  contenedor: { gap: spacing.sm },
  flex: { flex: 1, gap: 2 },
  vacio: {
    fontSize: fontSize.small,
    lineHeight: lineHeight.small,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingVertical: spacing.xl,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    ...shadow.card,
  },
  presionada: { opacity: 0.7 },
  nombre: {
    fontSize: fontSize.body,
    lineHeight: lineHeight.body,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  detalle: { fontSize: fontSize.small, lineHeight: lineHeight.small, color: colors.textSecondary },
  macros: { flexDirection: 'row', gap: spacing.md, marginTop: 2 },
  macro: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  punto: { width: 7, height: 7, borderRadius: radius.pill },
  macroTexto: { fontSize: fontSize.caption, lineHeight: lineHeight.caption, color: colors.textSecondary },
  botonAgregar: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: sizes.hairline,
    borderColor: colors.action,
  },
  botonAgregarTexto: { fontSize: fontSize.small, fontWeight: '600', color: colors.action },
});
