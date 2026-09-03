import { useState, useEffect } from 'react';
import { View, Text, Pressable, StyleSheet, Alert, FlatList, Modal } from 'react-native';
import { useRouter } from 'expo-router';

import { Pantalla } from '@/ui/Pantalla';
import { Input } from '@/ui/Input';
import { Boton } from '@/ui/Boton';
import { colors, spacing, radius, fontSize, lineHeight } from '@/ui/theme';

import { buscarAlimentosPorNombre } from '@/db/queries/alimentos';
import type { Alimento } from '@/db/queries/alimentos';
import { crearComida, agregarItem } from '@/db/queries/comidas';
import { obtenerPerfilLocal } from '@/db/queries/perfil';
import type { TipoComida } from '@/db/schema';
import { randomUUID } from '@/db/sync/uuid';

type ItemPendiente = {
  alimento: Alimento;
  cantidad_g: number;
  porcion: string;
};

const TIPOS: TipoComida[] = ['desayuno', 'almuerzo', 'merienda', 'cena', 'snack'];

/** El tipo mas probable segun la hora. El usuario lo puede cambiar. */
function tipoPorHora(): TipoComida {
  const h = new Date().getHours();
  if (h < 11) return 'desayuno';
  if (h < 15) return 'almuerzo';
  if (h < 19) return 'merienda';
  return 'cena';
}

export default function NuevaComida() {
  const router = useRouter();
  const [tipo, setTipo] = useState<TipoComida>(tipoPorHora);
  const [busqueda, setBusqueda] = useState('');
  const [resultados, setResultados] = useState<Alimento[]>([]);
  const [items, setItems] = useState<ItemPendiente[]>([]);
  const [elegido, setElegido] = useState<Alimento | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!busqueda.trim()) {
      setResultados([]);
      return;
    }
    let vivo = true;
    buscarAlimentosPorNombre(busqueda)
      .then((r) => { if (vivo) setResultados(r); })
      .catch(console.error);
    return () => { vivo = false; };
  }, [busqueda]);

  const agregar = (alimento: Alimento, cantidad_g: number, porcion: string) => {
    setItems((prev) => [...prev, { alimento, cantidad_g, porcion }]);
    setElegido(null);
    setBusqueda('');
  };

  const sacar = (indice: number) => {
    setItems((prev) => prev.filter((_, i) => i !== indice));
  };

  const totalKcal = Math.round(
    items.reduce((s, i) => s + (i.alimento.kcal_por_100g * i.cantidad_g) / 100, 0),
  );

  const guardar = async () => {
    if (guardando || items.length === 0) return;
    setGuardando(true);

    try {
      const perfil = await obtenerPerfilLocal();
      if (!perfil) {
        Alert.alert('Error', 'No se encontró el perfil.');
        return;
      }

      const comidaId = randomUUID();
      await crearComida({
        id: comidaId,
        usuario_id: perfil.id,
        tipo,
        fecha_hora: new Date().toISOString(),
      });

      for (const item of items) {
        await agregarItem({
          id: randomUUID(),
          comida_id: comidaId,
          alimento_id: item.alimento.id,
          cantidad_g: item.cantidad_g,
          editado_por_usuario: false,
        });
      }

      router.back();
    } catch (e) {
      console.error('Error al guardar la comida:', e);
      Alert.alert('Error', 'No se pudo guardar la comida.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Pantalla>
      <View style={estilos.tipos}>
        {TIPOS.map((t) => (
          <Pressable
            key={t}
            style={[estilos.chip, tipo === t && estilos.chipActivo]}
            onPress={() => setTipo(t)}
          >
            <Text style={[estilos.chipTexto, tipo === t && estilos.chipTextoActivo]}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </Text>
          </Pressable>
        ))}
      </View>

      <Input
        value={busqueda}
        onChangeText={setBusqueda}
        placeholder="Buscar alimento"
        autoCorrect={false}
      />

      {busqueda.trim() ? (
        <FlatList
          data={resultados}
          keyExtractor={(a) => a.id}
          scrollEnabled={false}
          renderItem={({ item }) => (
            <Pressable style={estilos.resultado} onPress={() => setElegido(item)}>
              <Text style={estilos.nombre}>{item.nombre}</Text>
              <Text style={estilos.detalle}>{item.kcal_por_100g} kcal / 100 g</Text>
            </Pressable>
          )}
          ListEmptyComponent={
            <Text style={estilos.detalle}>No encontramos nada con ese nombre.</Text>
          }
        />
      ) : items.length === 0 ? (
        <Text style={estilos.detalle}>Buscá lo que comiste para empezar.</Text>
      ) : (
        <View>
          {items.map((item, i) => (
            <Pressable key={i} style={estilos.item} onPress={() => sacar(i)}>
              <View style={estilos.itemTexto}>
                <Text style={estilos.nombre}>{item.alimento.nombre}</Text>
                <Text style={estilos.porcion}>
                  {item.porcion} · {item.cantidad_g} g
                </Text>
              </View>
              <Text style={estilos.nombre}>
                {Math.round((item.alimento.kcal_por_100g * item.cantidad_g) / 100)}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      {items.length > 0 && (
        <View style={estilos.pie}>
          <View style={estilos.totalFila}>
            <Text style={estilos.nombre}>Total</Text>
            <Text style={estilos.total}>{totalKcal} kcal</Text>
          </View>
          <Boton titulo="Guardar comida" onPress={guardar} cargando={guardando} />
        </View>
      )}

      <SheetPorciones
        alimento={elegido}
        onCerrar={() => setElegido(null)}
        onElegir={agregar}
      />
    </Pantalla>
  );
}

function SheetPorciones({
  alimento,
  onCerrar,
  onElegir,
}: {
  alimento: Alimento | null;
  onCerrar: () => void;
  onElegir: (a: Alimento, gramos: number, porcion: string) => void;
}) {
  if (!alimento) return null;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onCerrar}>
      <Pressable style={estilos.fondo} onPress={onCerrar}>
        <Pressable style={estilos.sheet} onPress={(e) => e.stopPropagation()}>
          <Text style={estilos.nombre}>{alimento.nombre}</Text>
          <Text style={estilos.detalle}>¿Cuánto comiste?</Text>

          {alimento.porciones.map((p) => (
            <Pressable
              key={p.nombre}
              style={estilos.opcion}
              onPress={() => onElegir(alimento, p.gramos, p.nombre)}
            >
              <Text style={estilos.nombre}>{p.nombre}</Text>
              <Text style={estilos.detalle}>
                {p.gramos} g · {Math.round((alimento.kcal_por_100g * p.gramos) / 100)} kcal
              </Text>
            </Pressable>
          ))}

          {alimento.porciones.length === 0 && (
            <Pressable
              style={estilos.opcion}
              onPress={() => onElegir(alimento, 100, '100 g')}
            >
              <Text style={estilos.nombre}>100 g</Text>
            </Pressable>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const estilos = StyleSheet.create({
  tipos: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
  },
  chipActivo: { backgroundColor: colors.action },
  chipTexto: { fontSize: fontSize.small, color: colors.textSecondary },
  chipTextoActivo: { color: colors.textOnAction },

  resultado: { paddingVertical: spacing.sm, borderBottomWidth: 0.5, borderBottomColor: colors.border },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    marginBottom: spacing.xs,
  },
  itemTexto: { flex: 1 },

  nombre: { fontSize: fontSize.body, lineHeight: lineHeight.body, color: colors.textPrimary },
  detalle: { fontSize: fontSize.small, lineHeight: lineHeight.small, color: colors.textSecondary },
  porcion: { fontSize: fontSize.small, color: colors.action, marginTop: 2 },

  pie: { borderTopWidth: 0.5, borderTopColor: colors.border, paddingTop: spacing.md, gap: spacing.sm },
  totalFila: { flexDirection: 'row', justifyContent: 'space-between' },
  total: { fontSize: fontSize.body, fontWeight: '500', color: colors.textPrimary },

  fondo: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  opcion: {
    paddingVertical: spacing.md,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
  },
});