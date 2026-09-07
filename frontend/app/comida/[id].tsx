// Detalle de una comida ya guardada. A diferencia de nueva.tsx, aca todo se
// escribe en la base al toque: no hay boton de guardar.
//
// Sobre las porciones: item_comida solo guarda cantidad_g, no el nombre de la
// porcion. Se reconstruye comparando los gramos contra las porciones del
// alimento; cuando no coincide ninguna, cae en mostrar los gramos pelados.

import { useState, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';

import { Pantalla } from '@/ui/Pantalla';
import { SheetPorciones } from '@/features/comidas/components/SheetPorciones';
import type { DatosSheet } from '@/features/comidas/components/SheetPorciones';
import { colors, spacing, radius, fontSize, lineHeight, shadow } from '@/ui/theme';

import {
  obtenerComida,
  listarItemsConAlimento,
  actualizarItem,
  eliminarItem as eliminarItemDb,
  eliminarComida,
} from '@/db/queries/comidas';
import type { ItemComidaConAlimento } from '@/db/queries/comidas';
import type { ComidaRow, PorcionTipica } from '@/db/schema';
import { obtenerAlimento } from '@/db/queries/alimentos';

function capitalizar(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function kcalDeItem(item: ItemComidaConAlimento): number {
  return Math.round((item.kcal_por_100g * item.cantidad_g) / 100);
}

/**
 * Reconstruye el nombre de la porcion a partir de los gramos.
 *
 * Ademas de la coincidencia exacta, prueba multiplos: si el usuario eligio
 * "2 × 1 milanesa" se guardaron 260 g, y 260 / 130 da 2. Asi el detalle
 * muestra lo mismo que se eligio al cargar.
 */
function etiquetaCantidad(porciones: PorcionTipica[], gramos: number): string {
  const exacta = porciones.find((p) => p.gramos === gramos);
  if (exacta) return `${exacta.nombre} · ${gramos} g`;

  for (const p of porciones) {
    if (p.gramos > 0 && gramos % p.gramos === 0) {
      const veces = gramos / p.gramos;
      if (veces > 1 && veces <= 20) return `${veces} × ${p.nombre} · ${gramos} g`;
    }
  }

  return `${gramos} g`;
}

/** "13:45" a partir del ISO con offset local que guarda la comida. */
function horaDe(fechaHora: string): string {
  return fechaHora.slice(11, 16);
}

/** Item con las porciones de su alimento, que el JOIN no trae. */
type ItemConPorciones = ItemComidaConAlimento & { porciones: PorcionTipica[] };

export default function DetalleComida() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [comida, setComida] = useState<ComidaRow | null>(null);
  const [items, setItems] = useState<ItemConPorciones[]>([]);
  const [cargando, setCargando] = useState(true);
  const [editando, setEditando] = useState<ItemConPorciones | null>(null);

  /**
   * Recarga todo desde la base.
   *
   * listarItemsConAlimento trae los macros por el JOIN pero no las porciones,
   * asi que hay una lectura extra por alimento. Con 3-5 items es despreciable.
   */
  const cargar = useCallback(async () => {
    if (!id) return;
    try {
      const [c, filas] = await Promise.all([obtenerComida(id), listarItemsConAlimento(id)]);
      setComida(c);

      const conPorciones = await Promise.all(
        filas.map(async (f) => {
          const alimento = await obtenerAlimento(f.alimento_id);
          return { ...f, porciones: alimento?.porciones ?? [] };
        }),
      );
      setItems(conPorciones);
    } catch (e) {
      console.error('Error al cargar la comida:', e);
      Alert.alert('Error', 'No se pudo cargar la comida.');
    } finally {
      setCargando(false);
    }
  }, [id]);

  // useFocusEffect y no useEffect: al volver desde otra pantalla, los datos
  // pueden haber cambiado.
  useFocusEffect(
    useCallback(() => {
      cargar();
    }, [cargar]),
  );

  /**
   * Cambiar la cantidad de un item. Escribe y recarga.
   *
   * editado_por_usuario queda en true: es la senal de que la cantidad original
   * no servia. Cuando exista el registro por foto, esa marca dice que tan
   * seguido se equivoca el modelo.
   */
  const cambiarCantidad = async (cantidad_g: number) => {
    if (!editando) return;
    try {
      await actualizarItem(editando.id, { cantidad_g, editado_por_usuario: true });
      setEditando(null);
      await cargar();
    } catch (e) {
      console.error('Error al actualizar el item:', e);
      Alert.alert('Error', 'No se pudo actualizar la cantidad.');
    }
  };

  const quitarItem = async () => {
    if (!editando) return;
    try {
      await eliminarItemDb(editando.id);
      setEditando(null);
      await cargar();
    } catch (e) {
      console.error('Error al eliminar el item:', e);
      Alert.alert('Error', 'No se pudo quitar el alimento.');
    }
  };

  const borrarComida = () => {
    Alert.alert('Borrar comida', '¿Seguro que querés borrar esta comida entera?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Borrar',
        style: 'destructive',
        onPress: async () => {
          try {
            // Los items caen solos por ON DELETE CASCADE.
            await eliminarComida(id);
            router.back();
          } catch (e) {
            console.error('Error al borrar la comida:', e);
            Alert.alert('Error', 'No se pudo borrar la comida.');
          }
        },
      },
    ]);
  };

  const totales = items.reduce(
    (acc, it) => {
      const f = it.cantidad_g / 100;
      return {
        kcal: acc.kcal + it.kcal_por_100g * f,
        prot: acc.prot + it.proteina_g * f,
        carb: acc.carb + it.carbohidratos_g * f,
        grasa: acc.grasa + it.grasa_g * f,
      };
    },
    { kcal: 0, prot: 0, carb: 0, grasa: 0 },
  );

  const datosSheet: DatosSheet | null = editando && {
    nombre: editando.alimento_nombre,
    kcal_por_100g: editando.kcal_por_100g,
    porciones: editando.porciones,
    cantidadActual: editando.cantidad_g,
    onQuitar: quitarItem,
  };

  if (cargando) {
    return (
      <Pantalla scroll={false}>
        <View style={estilos.centrado}>
          <ActivityIndicator color={colors.action} />
        </View>
      </Pantalla>
    );
  }

  if (!comida) {
    return (
      <Pantalla>
        <Text style={estilos.detalle}>No encontramos esta comida.</Text>
      </Pantalla>
    );
  }

  return (
    <Pantalla>
      <View style={estilos.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={estilos.cerrar}>✕</Text>
        </Pressable>
        <View style={estilos.flex}>
          <Text style={estilos.titulo}>{capitalizar(comida.tipo)}</Text>
          <Text style={estilos.detalle}>{horaDe(comida.fecha_hora)}</Text>
        </View>
      </View>

      {items.length === 0 ? (
        <View style={estilos.vacio}>
          <Text style={estilos.detalle}>Esta comida no tiene alimentos.</Text>
        </View>
      ) : (
        <View style={estilos.lista}>
          {items.map((item) => (
            <Pressable key={item.id} style={estilos.item} onPress={() => setEditando(item)}>
              <View style={estilos.flex}>
                <Text style={estilos.nombre}>{item.alimento_nombre}</Text>
                <Text style={estilos.porcion}>
                  {etiquetaCantidad(item.porciones, item.cantidad_g)}
                </Text>
              </View>
              <View style={estilos.derecha}>
                <Text style={estilos.nombre}>{kcalDeItem(item)}</Text>
                <Text style={estilos.unidad}>kcal</Text>
              </View>
            </Pressable>
          ))}
        </View>
      )}

      {items.length > 0 && (
        <View style={estilos.pie}>
          <View style={estilos.totalFila}>
            <Text style={estilos.nombre}>Total</Text>
            <Text style={estilos.total}>{Math.round(totales.kcal)} kcal</Text>
          </View>
          <View style={estilos.macros}>
            <Text style={estilos.detalle}>P {Math.round(totales.prot)} g</Text>
            <Text style={estilos.detalle}>C {Math.round(totales.carb)} g</Text>
            <Text style={estilos.detalle}>G {Math.round(totales.grasa)} g</Text>
          </View>
        </View>
      )}

      <Pressable style={estilos.borrar} onPress={borrarComida}>
        <Text style={estilos.borrarTexto}>Borrar esta comida</Text>
      </Pressable>

      <SheetPorciones
        datos={datosSheet}
        onCerrar={() => setEditando(null)}
        onConfirmar={cambiarCantidad}
      />
    </Pantalla>
  );
}

const estilos = StyleSheet.create({
  flex: { flex: 1 },
  centrado: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  cerrar: { fontSize: fontSize.body, color: colors.textSecondary },
  titulo: {
    fontSize: fontSize.body,
    lineHeight: lineHeight.body,
    fontWeight: '500',
    color: colors.textPrimary,
  },

  vacio: { paddingVertical: spacing.xl, alignItems: 'center' },

  lista: { gap: spacing.xs },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    ...shadow.card,
  },
  derecha: { alignItems: 'flex-end' },
  unidad: { fontSize: fontSize.small, color: colors.textSecondary },

  nombre: { fontSize: fontSize.body, lineHeight: lineHeight.body, color: colors.textPrimary },
  detalle: { fontSize: fontSize.small, lineHeight: lineHeight.small, color: colors.textSecondary },
  porcion: { fontSize: fontSize.small, color: colors.action, marginTop: 2 },

  pie: {
    borderTopWidth: 0.5,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
    gap: spacing.sm,
  },
  totalFila: { flexDirection: 'row', justifyContent: 'space-between' },
  total: { fontSize: fontSize.body, fontWeight: '500', color: colors.textPrimary },
  macros: { flexDirection: 'row', gap: spacing.md },

  borrar: { paddingVertical: spacing.md, alignItems: 'center' },
  borrarTexto: { fontSize: fontSize.body, color: colors.danger },
});