// app/rutina-gimnasio/predefinidas.tsx
//
// Biblioteca de rutinas de gimnasio predefinidas, agrupadas por categoria.
// Es de solo lectura: tocar una card la despliega con sus ejercicios y
// la unica accion posible es copiarla a las rutinas del usuario. Tras copiar se
// reemplaza esta pantalla por la edicion de la copia, asi el usuario la
// renombra o ajusta, y al volver cae donde estaba antes de abrir la biblioteca.

import { useState, useEffect, useRef } from 'react';
import { View, Text, Pressable, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { Pantalla } from '@/ui/Pantalla';
import { Boton } from '@/ui/Boton';
import { colors, spacing, radius, fontSize, lineHeight, shadow, sizes } from '@/ui/theme';

import { obtenerPerfilLocal } from '@/db/queries/perfil';
import {
  listarRutinasPredefinidas,
  copiarRutinaPredefinida,
} from '@/db/queries/rutinasGimnasio';
import type { RutinaPredefinidaConEjercicios } from '@/db/queries/rutinasGimnasio';
import type { CategoriaRutinaPredefinida } from '@/db/schema';

const CATEGORIAS: { valor: CategoriaRutinaPredefinida; titulo: string; detalle: string }[] = [
  { valor: 'principiante', titulo: 'Principiante', detalle: 'Para empezar o volver a entrenar' },
  { valor: 'split', titulo: 'Split intermedio', detalle: 'Un grupo de músculos por día' },
  { valor: 'especifica', titulo: 'Específicas', detalle: 'Sesiones enfocadas en dos grupos' },
];

export default function RutinasPredefinidas() {
  const router = useRouter();

  const [rutinas, setRutinas] = useState<RutinaPredefinidaConEjercicios[] | null>(null);
  const [abierta, setAbierta] = useState<string | null>(null);
  const [copiando, setCopiando] = useState<string | null>(null);
  // Candado sincrono: el estado llega tarde y un doble toque copiaba dos veces.
  const copiandoRef = useRef(false);

  useEffect(() => {
    listarRutinasPredefinidas()
      .then(setRutinas)
      .catch((e) => {
        console.error('Error al cargar rutinas predefinidas:', e);
        setRutinas([]);
      });
  }, []);

  const copiar = async (rutina: RutinaPredefinidaConEjercicios) => {
    if (copiandoRef.current) return;
    copiandoRef.current = true;
    setCopiando(rutina.id);
    try {
      const perfil = await obtenerPerfilLocal();
      if (!perfil) {
        Alert.alert('Error', 'No se encontro el perfil del usuario.');
        return;
      }
      const copia = await copiarRutinaPredefinida(rutina.id, perfil.id);
      router.replace({ pathname: '/rutina-gimnasio/nueva', params: { id: copia.id } });
    } catch (e) {
      console.error('Error al copiar rutina predefinida:', e);
      Alert.alert('Error', 'No se pudo copiar la rutina. Intenta de nuevo.');
    } finally {
      copiandoRef.current = false;
      setCopiando(null);
    }
  };

  return (
    <Pantalla>
      <View style={estilos.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={estilos.flecha}>‹</Text>
        </Pressable>
        <Text style={estilos.titulo}>Rutinas predefinidas</Text>
      </View>
      <Text style={estilos.intro}>
        Copiá una a tus rutinas y editala como quieras. La original no cambia.
      </Text>

      {rutinas === null ? (
        <ActivityIndicator style={estilos.cargando} color={colors.action} />
      ) : (
        CATEGORIAS.map((cat) => {
          const deCategoria = rutinas.filter((r) => r.categoria === cat.valor);
          if (deCategoria.length === 0) return null;
          return (
            <View key={cat.valor} style={estilos.seccion}>
              <Text style={estilos.seccionTitulo}>{cat.titulo}</Text>
              <Text style={estilos.seccionDetalle}>{cat.detalle}</Text>

              <View style={estilos.lista}>
                {deCategoria.map((r) => {
                  const expandida = abierta === r.id;
                  return (
                    <View key={r.id} style={estilos.card}>
                      <Pressable
                        style={({ pressed }) => [estilos.cardCabecera, pressed && estilos.presionado]}
                        onPress={() => setAbierta(expandida ? null : r.id)}
                        accessibilityRole="button"
                        accessibilityState={{ expanded: expandida }}
                      >
                        <View style={estilos.cardInfo}>
                          <Text style={estilos.cardNombre}>{r.nombre}</Text>
                          {r.descripcion ? (
                            <Text style={estilos.cardDescripcion}>{r.descripcion}</Text>
                          ) : null}
                          <Text style={estilos.cardContador}>
                            {r.ejercicios.length}{' '}
                            {r.ejercicios.length === 1 ? 'ejercicio' : 'ejercicios'}
                          </Text>
                        </View>
                        <Ionicons
                          name={expandida ? 'chevron-up' : 'chevron-down'}
                          size={sizes.iconSmall}
                          color={colors.textMuted}
                        />
                      </Pressable>

                      {expandida && (
                        <View style={estilos.detalle}>
                          {r.ejercicios.map((ej, idx) => (
                            <View key={ej.id} style={estilos.itemEjercicio}>
                              <Text style={estilos.itemNumero}>{idx + 1}</Text>
                              <View style={estilos.itemInfo}>
                                <Text style={estilos.itemNombre}>{ej.nombre}</Text>
                                <Text style={estilos.itemGrupo}>{ej.grupo}</Text>
                              </View>
                            </View>
                          ))}
                          <View style={estilos.pieCard}>
                            <Boton
                              titulo="Copiar a mis rutinas"
                              onPress={() => copiar(r)}
                              cargando={copiando === r.id}
                              variante="primario"
                            />
                          </View>
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            </View>
          );
        })
      )}
    </Pantalla>
  );
}

const estilos = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  flecha: {
    fontSize: fontSize.title,
    color: colors.textSecondary,
  },
  titulo: {
    fontSize: fontSize.title,
    lineHeight: lineHeight.title,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  intro: {
    fontSize: fontSize.small,
    lineHeight: lineHeight.small,
    color: colors.textSecondary,
  },
  cargando: {
    marginTop: spacing.xxl,
  },

  seccion: {
    marginTop: spacing.lg,
  },
  seccionTitulo: {
    fontSize: fontSize.subtitle,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  seccionDetalle: {
    fontSize: fontSize.caption,
    color: colors.textMuted,
    marginBottom: spacing.sm,
  },
  lista: {
    gap: spacing.sm,
  },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    overflow: 'hidden',
    ...shadow.card,
  },
  cardCabecera: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    gap: spacing.sm,
  },
  presionado: {
    opacity: 0.8,
  },
  cardInfo: {
    flex: 1,
    gap: 2,
  },
  cardNombre: {
    fontSize: fontSize.body,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  cardDescripcion: {
    fontSize: fontSize.small,
    lineHeight: lineHeight.small,
    color: colors.textSecondary,
  },
  cardContador: {
    fontSize: fontSize.caption,
    color: colors.textMuted,
    marginTop: 2,
  },

  detalle: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    gap: spacing.xs,
  },
  itemEjercicio: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 2,
  },
  itemNumero: {
    width: 24,
    fontSize: fontSize.small,
    fontWeight: '700',
    color: colors.textMuted,
    textAlign: 'center',
  },
  itemInfo: {
    flex: 1,
  },
  itemNombre: {
    fontSize: fontSize.small,
    fontWeight: '500',
    color: colors.textPrimary,
  },
  itemGrupo: {
    fontSize: fontSize.caption,
    color: colors.textSecondary,
    textTransform: 'capitalize',
  },
  pieCard: {
    marginTop: spacing.sm,
  },
});
