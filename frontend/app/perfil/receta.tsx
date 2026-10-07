// app/perfil/receta.tsx
//
// Crear o editar una receta (?id= para editar). Nombre, ingredientes con el
// mismo buscador y el mismo SheetPorciones de Registrar comida (crudo y
// cocido incluidos) y "Rinde N porciones". Abajo, kcal y macros por porcion
// en vivo.
//
// Los ingredientes son para la receta entera. Las comidas ya registradas con
// ella no cambian al editarla ni al borrarla: tienen sus propios items.

import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { Pantalla } from '@/ui/Pantalla';
import { Boton } from '@/ui/Boton';
import { colors, fontSize, fontWeight, lineHeight, radius, shadow, sizes, spacing } from '@/ui/theme';
import { BuscadorAlimentos } from '@/features/comidas/components/BuscadorAlimentos';
import { SheetPorciones } from '@/features/comidas/components/SheetPorciones';
import type { DatosSheet } from '@/features/comidas/components/SheetPorciones';
import { TarjetaTotales } from '@/features/comidas/components/TarjetaTotales';
import { obtenerAlimento } from '@/db/queries/alimentos';
import type { Alimento } from '@/db/queries/alimentos';
import type { CargaCoccion } from '@/db/queries/comidas';
import { actualizarReceta, borrarReceta, crearReceta, obtenerReceta } from '@/db/queries/recetas';
import { obtenerPerfilLocal } from '@/db/queries/perfil';
import { randomUUID } from '@/db/sync/uuid';
import { textoCantidadIngresada } from '@/lib/coccion';
import { porPorcion } from '@/lib/recetas';

const PORCIONES_MAX = 50;

/** Un ingrediente cargado y todavia no guardado. Igual que un item de Registrar comida. */
type Ingrediente = {
  alimento: Alimento;
  /** En el estado base del alimento, para la receta entera. */
  cantidad_g: number;
  /** Solo para mostrar. */
  porcion: string;
  carga: CargaCoccion | null;
};

export default function EditarReceta() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const esEdicion = Boolean(id);

  const [cargando, setCargando] = useState(esEdicion);
  const [nombre, setNombre] = useState('');
  const [porciones, setPorciones] = useState(1);
  const [ingredientes, setIngredientes] = useState<Ingrediente[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [sheet, setSheet] = useState<{ alimento: Alimento; indice: number | null } | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const receta = await obtenerReceta(id);
      if (!receta) return;
      setNombre(receta.nombre);
      setPorciones(receta.porciones);
      const cargados: Ingrediente[] = [];
      for (const it of receta.items) {
        const alimento = await obtenerAlimento(it.alimento_id);
        if (!alimento) continue;
        const carga =
          it.estado_carga !== null && it.cantidad_ingresada_g !== null
            ? { estado_carga: it.estado_carga, cantidad_ingresada_g: it.cantidad_ingresada_g }
            : null;
        cargados.push({
          alimento,
          cantidad_g: it.cantidad_g,
          porcion: carga
            ? textoCantidadIngresada(carga.cantidad_ingresada_g, carga.estado_carga, alimento.estado_base)
            : `${it.cantidad_g} g`,
          carga,
        });
      }
      setIngredientes(cargados);
    })()
      .catch((e) => console.error('Error al cargar la receta:', e))
      .finally(() => setCargando(false));
  }, [id]);

  const confirmarPorcion = (cantidad_g: number, porcion: string, carga: CargaCoccion | null) => {
    if (!sheet) return;
    const nuevo: Ingrediente = { alimento: sheet.alimento, cantidad_g, porcion, carga };
    setIngredientes((prev) =>
      sheet.indice === null ? [...prev, nuevo] : prev.map((it, i) => (i === sheet.indice ? nuevo : it)),
    );
    setSheet(null);
    setBusqueda('');
  };

  const quitarIngrediente = () => {
    if (!sheet || sheet.indice === null) return;
    const i = sheet.indice;
    setIngredientes((prev) => prev.filter((_, idx) => idx !== i));
    setSheet(null);
  };

  const guardar = async () => {
    if (guardando) return;
    if (!nombre.trim()) {
      Alert.alert('Falta el nombre', 'Poné un nombre para encontrarla después.');
      return;
    }
    if (ingredientes.length === 0) {
      Alert.alert('Faltan ingredientes', 'Agregá al menos un ingrediente.');
      return;
    }
    setGuardando(true);
    try {
      const datos = {
        nombre,
        porciones,
        ingredientes: ingredientes.map((it) => ({
          alimento_id: it.alimento.id,
          cantidad_g: it.cantidad_g,
          estado_carga: it.carga?.estado_carga ?? null,
          cantidad_ingresada_g: it.carga?.cantidad_ingresada_g ?? null,
        })),
      };
      if (id) {
        await actualizarReceta({ id, ...datos });
      } else {
        const perfil = await obtenerPerfilLocal();
        if (!perfil) throw new Error('Sin perfil');
        await crearReceta({ id: randomUUID(), usuario_id: perfil.id, ...datos });
      }
      router.back();
    } catch (e) {
      console.error('Error al guardar la receta:', e);
      Alert.alert('Error', 'No se pudo guardar la receta.');
    } finally {
      setGuardando(false);
    }
  };

  const borrar = () => {
    if (!id) return;
    Alert.alert(
      'Borrar receta',
      'Las comidas que ya registraste con ella no cambian.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Borrar',
          style: 'destructive',
          onPress: async () => {
            try {
              await borrarReceta(id);
              router.back();
            } catch (e) {
              console.error('Error al borrar la receta:', e);
              Alert.alert('Error', 'No se pudo borrar la receta.');
            }
          },
        },
      ],
    );
  };

  const buscando = busqueda.trim().length > 0;
  const porcion = porPorcion(
    ingredientes.map((it) => ({
      cantidad_g: it.cantidad_g,
      kcal_por_100g: it.alimento.kcal_por_100g,
      proteina_g: it.alimento.proteina_g,
      carbohidratos_g: it.alimento.carbohidratos_g,
      grasa_g: it.alimento.grasa_g,
    })),
    porciones,
  );

  const datosSheet: DatosSheet | null = sheet && {
    nombre: sheet.alimento.nombre,
    kcal_por_100g: sheet.alimento.kcal_por_100g,
    porciones: sheet.alimento.porciones,
    categoria: sheet.alimento.categoria,
    estado_base: sheet.alimento.estado_base,
    factor_coccion: sheet.alimento.factor_coccion,
    cantidadActual: sheet.indice != null ? ingredientes[sheet.indice]?.cantidad_g : undefined,
    cargaActual: sheet.indice != null ? ingredientes[sheet.indice]?.carga : null,
    onQuitar: sheet.indice != null ? quitarIngrediente : undefined,
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

  return (
    <Pantalla>
      <View style={estilos.headerBar}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityLabel="Volver">
          <Text style={estilos.flechaVolver}>‹</Text>
        </Pressable>
        <Text style={estilos.tituloPantalla}>{esEdicion ? 'Editar receta' : 'Nueva receta'}</Text>
      </View>

      <TextInput
        style={estilos.inputNombre}
        value={nombre}
        onChangeText={setNombre}
        placeholder="Nombre (ej: Tarta de jamón y queso)"
        placeholderTextColor={colors.textMuted}
      />

      <BuscadorAlimentos
        busqueda={busqueda}
        onCambiarBusqueda={setBusqueda}
        onElegir={(a) => setSheet({ alimento: a, indice: null })}
      />

      {!buscando && (
        <>
          {ingredientes.length === 0 ? (
            <Text style={estilos.vacio}>Buscá los ingredientes de la receta entera.</Text>
          ) : (
            <View style={estilos.lista}>
              {ingredientes.map((it, i) => (
                <Pressable
                  key={`${it.alimento.id}-${i}`}
                  style={estilos.item}
                  onPress={() => setSheet({ alimento: it.alimento, indice: i })}
                >
                  <View style={estilos.flex}>
                    <Text style={estilos.nombre}>{it.alimento.nombre}</Text>
                    <Text style={estilos.porcion}>
                      {it.carga ? it.porcion : `${it.porcion} · ${it.cantidad_g} g`}
                    </Text>
                  </View>
                  <Text style={estilos.nombre}>
                    {Math.round((it.alimento.kcal_por_100g * it.cantidad_g) / 100)} kcal
                  </Text>
                </Pressable>
              ))}
            </View>
          )}

          {/* Rinde N porciones */}
          <View style={estilos.rinde}>
            <Text style={estilos.rindeTexto}>Rinde</Text>
            <View style={estilos.stepper}>
              <Pressable
                onPress={() => setPorciones((n) => Math.max(1, n - 1))}
                disabled={porciones <= 1}
                hitSlop={8}
                accessibilityLabel="Una porción menos"
              >
                <Ionicons
                  name="remove-circle-outline"
                  size={sizes.icon}
                  color={porciones <= 1 ? colors.actionDisabled : colors.action}
                />
              </Pressable>
              <Text style={estilos.rindeNumero}>{porciones}</Text>
              <Pressable
                onPress={() => setPorciones((n) => Math.min(PORCIONES_MAX, n + 1))}
                hitSlop={8}
                accessibilityLabel="Una porción más"
              >
                <Ionicons name="add-circle-outline" size={sizes.icon} color={colors.action} />
              </Pressable>
            </View>
            <Text style={estilos.rindeTexto}>{porciones === 1 ? 'porción' : 'porciones'}</Text>
          </View>

          <TarjetaTotales
            titulo="Por porción"
            kcal={porcion.kcal}
            proteina={porcion.proteina}
            carbohidratos={porcion.carbohidratos}
            grasa={porcion.grasa}
          />

          <Boton
            titulo={esEdicion ? 'Guardar cambios' : 'Guardar receta'}
            onPress={guardar}
            cargando={guardando}
          />

          {esEdicion && (
            <Pressable style={estilos.borrar} onPress={borrar}>
              <Text style={estilos.borrarTexto}>Borrar receta</Text>
            </Pressable>
          )}
        </>
      )}

      <SheetPorciones datos={datosSheet} onCerrar={() => setSheet(null)} onConfirmar={confirmarPorcion} />
    </Pantalla>
  );
}

const estilos = StyleSheet.create({
  flex: { flex: 1 },
  centrado: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  headerBar: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs },
  flechaVolver: { fontSize: 28, color: colors.textSecondary, marginTop: -2 },
  tituloPantalla: {
    fontSize: fontSize.title,
    lineHeight: lineHeight.title,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  inputNombre: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: fontSize.body,
    color: colors.textPrimary,
  },
  vacio: {
    fontSize: fontSize.small,
    lineHeight: lineHeight.small,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingVertical: spacing.lg,
  },
  lista: { gap: spacing.xs },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    ...shadow.card,
  },
  nombre: { fontSize: fontSize.body, lineHeight: lineHeight.body, color: colors.textPrimary },
  porcion: { fontSize: fontSize.small, color: colors.action, marginTop: 2 },
  rinde: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  rindeTexto: { fontSize: fontSize.body, color: colors.textSecondary },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rindeNumero: {
    fontSize: fontSize.title,
    lineHeight: lineHeight.title,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    minWidth: 28,
    textAlign: 'center',
  },
  borrar: { alignSelf: 'center', paddingVertical: spacing.sm },
  borrarTexto: { fontSize: fontSize.small, fontWeight: '600', color: colors.danger },
});
