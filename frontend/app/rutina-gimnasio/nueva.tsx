// app/rutina-gimnasio/nueva.tsx
//
// Pantalla para definir una nueva rutina de gimnasio (catalogo de ejercicios).
// Solo pide nombre y seleccion ordenada de ejercicios. La programacion de dias
// y horarios se hace exclusivamente desde Nuevo evento.

import { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Alert,
  Platform,
  Modal,
  ScrollView,
  KeyboardAvoidingView,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Pantalla } from '@/ui/Pantalla';
import { Boton } from '@/ui/Boton';
import { colors, spacing, radius, fontSize, lineHeight, shadow, sizes } from '@/ui/theme';

import { obtenerPerfilLocal } from '@/db/queries/perfil';
import {
  crearRutinaGimnasio,
  obtenerRutinaGimnasio,
  actualizarRutinaGimnasio,
} from '@/db/queries/rutinasGimnasio';
import {
  listarEjercicios,
  buscarEjercicios,
  crearEjercicio,
} from '@/db/queries/ejercicios';
import { randomUUID } from '@/db/sync/uuid';
import type { EjercicioRow, GrupoMuscular } from '@/db/schema';

// ---------------------------------------------------------------------------
// Constantes y helpers
// ---------------------------------------------------------------------------

const GRUPOS: { valor: GrupoMuscular | 'todos'; label: string }[] = [
  { valor: 'todos', label: 'Todos' },
  { valor: 'pecho', label: 'Pecho' },
  { valor: 'espalda', label: 'Espalda' },
  { valor: 'piernas', label: 'Piernas' },
  { valor: 'hombros', label: 'Hombros' },
  { valor: 'brazos', label: 'Brazos' },
  { valor: 'core', label: 'Core' },
];

export default function NuevaRutinaGimnasio() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id?: string }>();
  const rutinaId = params.id;
  const esEdicion = Boolean(rutinaId);

  const [nombre, setNombre] = useState('');

  // Ejercicios elegidos en orden
  const [ejercicios, setEjercicios] = useState<EjercicioRow[]>([]);

  // Buscador de ejercicios modal
  const [modalBuscador, setModalBuscador] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [grupoFiltro, setGrupoFiltro] = useState<GrupoMuscular | 'todos'>('todos');
  const [catalogo, setCatalogo] = useState<EjercicioRow[]>([]);
  const [creandoEjercicio, setCreandoEjercicio] = useState(false);
  const [nuevoNombre, setNuevoNombre] = useState('');
  const [nuevoGrupo, setNuevoGrupo] = useState<GrupoMuscular>('pecho');

  const [guardando, setGuardando] = useState(false);
  // Candado sincrono: el estado llega tarde y un doble toque creaba la rutina dos veces.
  const guardandoRef = useRef(false);

  // Precargar datos si se trata de edicion
  useEffect(() => {
    if (!rutinaId) return;
    obtenerRutinaGimnasio(rutinaId)
      .then((rg) => {
        if (!rg) return;
        setNombre(rg.nombre);
        setEjercicios(rg.ejercicios);
      })
      .catch((e) => console.error('Error al cargar rutina para edicion:', e));
  }, [rutinaId]);

  // Cargar catalogo
  useEffect(() => {
    if (!modalBuscador) return;
    (async () => {
      if (busqueda.trim()) {
        const res = await buscarEjercicios(busqueda);
        setCatalogo(
          grupoFiltro === 'todos' ? res : res.filter((e) => e.grupo === grupoFiltro),
        );
      } else {
        const res = await listarEjercicios(
          grupoFiltro === 'todos' ? undefined : grupoFiltro,
        );
        setCatalogo(res);
      }
    })().catch(console.error);
  }, [modalBuscador, busqueda, grupoFiltro]);

  const seleccionarEjercicio = (ej: EjercicioRow) => {
    setModalBuscador(false);
    setBusqueda('');
    if (ejercicios.some((e) => e.id === ej.id)) {
      Alert.alert('Ejercicio ya agregado', 'Ese ejercicio ya forma parte de esta rutina.');
      return;
    }
    setEjercicios((prev) => [...prev, ej]);
  };

  const moverEjercicio = (index: number, direccion: 'arriba' | 'abajo') => {
    const nuevoIndex = direccion === 'arriba' ? index - 1 : index + 1;
    if (nuevoIndex < 0 || nuevoIndex >= ejercicios.length) return;

    const copia = [...ejercicios];
    const item = copia[index];
    copia[index] = copia[nuevoIndex];
    copia[nuevoIndex] = item;
    setEjercicios(copia);
  };

  const quitarEjercicio = (index: number) => {
    setEjercicios((prev) => prev.filter((_, i) => i !== index));
  };

  const guardarNuevoEjercicio = async () => {
    const n = nuevoNombre.trim();
    if (!n) {
      Alert.alert('Nombre requerido', 'Ingresa el nombre del ejercicio.');
      return;
    }

    try {
      const creado = await crearEjercicio({
        id: randomUUID(),
        nombre: n,
        grupo: nuevoGrupo,
      });
      setCreandoEjercicio(false);
      setNuevoNombre('');
      seleccionarEjercicio(creado);
    } catch (e) {
      console.error('Error al crear ejercicio:', e);
      Alert.alert('Error', 'No se pudo crear el ejercicio.');
    }
  };

  const guardar = async () => {
    if (guardandoRef.current) return;

    const nomLimpio = nombre.trim();
    if (!nomLimpio) {
      Alert.alert('Falta nombre', 'Ingresa un nombre para la rutina (ej: Pecho y triceps).');
      return;
    }

    if (ejercicios.length === 0) {
      Alert.alert('Faltan ejercicios', 'Agrega al menos un ejercicio a la rutina.');
      return;
    }

    guardandoRef.current = true;
    setGuardando(true);
    try {
      const perfil = await obtenerPerfilLocal();
      if (!perfil) {
        Alert.alert('Error', 'No se encontro el perfil del usuario.');
        return;
      }

      if (esEdicion && rutinaId) {
        await actualizarRutinaGimnasio({
          id: rutinaId,
          nombre: nomLimpio,
          ejercicio_ids: ejercicios.map((e) => e.id),
        });
        router.back();
      } else {
        await crearRutinaGimnasio({
          id: randomUUID(),
          usuario_id: perfil.id,
          nombre: nomLimpio,
          activa: true,
          ejercicio_ids: ejercicios.map((e) => e.id),
        });
        router.back();
      }
    } catch (e) {
      console.error('Error al guardar rutina de gimnasio:', e);
      Alert.alert('Error', 'No se pudo guardar la rutina. Intenta de nuevo.');
    } finally {
      guardandoRef.current = false;
      setGuardando(false);
    }
  };

  // La biblioteca copia y abre la edicion de la copia. Con el formulario vacio
  // se reemplaza esta pantalla, asi al volver de la copia no aparece una
  // rutina en blanco detras. Si ya hay algo cargado se apila, para no perderlo.
  const abrirPredefinidas = () => {
    const vacio = nombre.trim() === '' && ejercicios.length === 0;
    if (vacio) router.replace('/rutina-gimnasio/predefinidas');
    else router.push('/rutina-gimnasio/predefinidas');
  };

  const margenSuperiorModal = Platform.OS === 'ios' ? insets.top : insets.top + spacing.xl;

  return (
    <Pantalla>
      {/* Header */}
      <View style={estilos.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={estilos.flecha}>‹</Text>
        </Pressable>
        <Text style={estilos.titulo}>{esEdicion ? 'Editar rutina' : 'Nueva rutina'}</Text>
      </View>

      {/* Atajo a la biblioteca: solo al crear, editar una rutina no la reemplaza */}
      {!esEdicion && (
        <Pressable
          style={({ pressed }) => [
            estilos.botonPredefinida,
            pressed && estilos.botonPredefinidaPresionado,
          ]}
          onPress={abrirPredefinidas}
        >
          <Ionicons name="library-outline" size={sizes.iconSmall} color={colors.action} />
          <View style={estilos.flex}>
            <Text style={estilos.botonPredefinidaTitulo}>Agregar predefinida</Text>
            <Text style={estilos.ayuda}>Partí de una rutina armada y ajustala a tu gusto.</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </Pressable>
      )}

      {/* Nombre */}
      <View style={estilos.campo}>
        <Text style={estilos.label}>Nombre de la rutina</Text>
        <TextInput
          style={estilos.inputTexto}
          placeholder="Ej: Pecho y tríceps"
          placeholderTextColor={colors.textMuted}
          value={nombre}
          onChangeText={setNombre}
          autoFocus
        />
        <Text style={estilos.ayuda}>
          Los días y la hora se asignan después, desde Nuevo evento.
        </Text>
      </View>

      {/* Lista de ejercicios */}
      <View style={estilos.campo}>
        <View style={estilos.ejerciciosHeader}>
          <Text style={estilos.label}>Ejercicios en orden</Text>
          <Text style={estilos.ejerciciosContador}>
            {ejercicios.length} {ejercicios.length === 1 ? 'ejercicio' : 'ejercicios'}
          </Text>
        </View>

        {ejercicios.length === 0 ? (
          <View style={estilos.vacioEjercicios}>
            <Ionicons name="barbell-outline" size={32} color={colors.textMuted} />
            <Text style={estilos.vacioEjerciciosTexto}>
              Agrega los ejercicios que vas a hacer en este orden.
            </Text>
          </View>
        ) : (
          <View style={estilos.listaEjercicios}>
            {ejercicios.map((ej, idx) => (
              <View key={ej.id} style={estilos.itemEjercicio}>
                <Text style={estilos.itemNumero}>{idx + 1}</Text>
                <View style={estilos.itemInfo}>
                  <Text style={estilos.itemNombre}>{ej.nombre}</Text>
                  <Text style={estilos.itemGrupo}>{ej.grupo}</Text>
                </View>

                {/* Ordenar arriba / abajo */}
                <View style={estilos.itemBotonesOrden}>
                  <Pressable
                    disabled={idx === 0}
                    style={[estilos.botonFlecha, idx === 0 && estilos.botonFlechaDeshabilitado]}
                    onPress={() => moverEjercicio(idx, 'arriba')}
                    hitSlop={6}
                  >
                    <Ionicons
                      name="chevron-up"
                      size={18}
                      color={idx === 0 ? colors.textMuted : colors.textPrimary}
                    />
                  </Pressable>
                  <Pressable
                    disabled={idx === ejercicios.length - 1}
                    style={[
                      estilos.botonFlecha,
                      idx === ejercicios.length - 1 && estilos.botonFlechaDeshabilitado,
                    ]}
                    onPress={() => moverEjercicio(idx, 'abajo')}
                    hitSlop={6}
                  >
                    <Ionicons
                      name="chevron-down"
                      size={18}
                      color={idx === ejercicios.length - 1 ? colors.textMuted : colors.textPrimary}
                    />
                  </Pressable>
                </View>

                {/* Eliminar de la rutina */}
                <Pressable
                  style={estilos.botonEliminar}
                  onPress={() => quitarEjercicio(idx)}
                  hitSlop={8}
                >
                  <Ionicons name="trash-outline" size={18} color={colors.textMuted} />
                </Pressable>
              </View>
            ))}
          </View>
        )}

        <Pressable
          style={estilos.botonAgregarEjercicio}
          onPress={() => setModalBuscador(true)}
        >
          <Ionicons name="add" size={sizes.iconSmall} color={colors.action} />
          <Text style={estilos.botonAgregarEjercicioTexto}>Agregar ejercicio</Text>
        </Pressable>
      </View>

      {/* Boton Guardar */}
      <View style={estilos.pie}>
        <Boton
          titulo={esEdicion ? 'Guardar cambios' : 'Guardar rutina'}
          onPress={guardar}
          cargando={guardando}
          variante="primario"
        />
      </View>

      {/* Modal Buscador de ejercicios */}
      <Modal
        visible={modalBuscador}
        animationType="slide"
        onRequestClose={() => setModalBuscador(false)}
        statusBarTranslucent
      >
        <View style={estilos.modalSafe}>
          <KeyboardAvoidingView
            style={[
              estilos.modalContenedor,
              {
                paddingTop: margenSuperiorModal,
                paddingBottom: Math.max(insets.bottom, spacing.lg),
              },
            ]}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <View style={estilos.modalHeader}>
              <View style={estilos.modalHeaderIzquierda}>
                <Pressable onPress={() => setModalBuscador(false)} hitSlop={12}>
                  <Text style={estilos.flechaModal}>‹</Text>
                </Pressable>
                <Text style={estilos.modalTitulo}>Elegir ejercicio</Text>
              </View>
              <Pressable onPress={() => setCreandoEjercicio(true)} hitSlop={8}>
                <Text style={estilos.enlaceCrear}>Crear nuevo</Text>
              </Pressable>
            </View>

            {/* Buscador texto */}
            <View style={estilos.buscadorCaja}>
              <Ionicons name="search" size={20} color={colors.textMuted} />
              <TextInput
                style={estilos.buscadorInput}
                placeholder="Buscar ejercicio..."
                placeholderTextColor={colors.textMuted}
                value={busqueda}
                onChangeText={setBusqueda}
                autoCorrect={false}
              />
              {busqueda.length > 0 && (
                <Pressable onPress={() => setBusqueda('')} hitSlop={8}>
                  <Ionicons name="close-circle" size={20} color={colors.textMuted} />
                </Pressable>
              )}
            </View>

            {/* Chips de grupo muscular */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={estilos.chipsScroll}
              contentContainerStyle={estilos.chipsLista}
            >
              {GRUPOS.map((g) => {
                const activo = grupoFiltro === g.valor;
                return (
                  <Pressable
                    key={g.valor}
                    style={[estilos.chip, activo && estilos.chipActivo]}
                    onPress={() => setGrupoFiltro(g.valor)}
                  >
                    <Text style={[estilos.chipTexto, activo && estilos.chipTextoActivo]}>
                      {g.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            {/* Formulario crear nuevo ejercicio */}
            {creandoEjercicio && (
              <View style={estilos.cajaNuevoEjercicio}>
                <Text style={estilos.cajaNuevoTitulo}>Crear ejercicio personalizado</Text>
                <TextInput
                  style={estilos.nuevoInput}
                  placeholder="Nombre del ejercicio"
                  placeholderTextColor={colors.textMuted}
                  value={nuevoNombre}
                  onChangeText={setNuevoNombre}
                  autoFocus
                />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={estilos.miniChips}>
                  {GRUPOS.filter((g) => g.valor !== 'todos').map((g) => (
                    <Pressable
                      key={g.valor}
                      style={[
                        estilos.miniChip,
                        nuevoGrupo === g.valor && estilos.miniChipActivo,
                      ]}
                      onPress={() => setNuevoGrupo(g.valor as GrupoMuscular)}
                    >
                      <Text
                        style={[
                          estilos.miniChipTexto,
                          nuevoGrupo === g.valor && estilos.miniChipTextoActivo,
                        ]}
                      >
                        {g.label}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
                <View style={estilos.nuevoBotones}>
                  <Pressable
                    style={estilos.nuevoBotonCancelar}
                    onPress={() => setCreandoEjercicio(false)}
                  >
                    <Text style={estilos.nuevoBotonCancelarTexto}>Cancelar</Text>
                  </Pressable>
                  <Pressable
                    style={estilos.nuevoBotonGuardar}
                    onPress={guardarNuevoEjercicio}
                  >
                    <Text style={estilos.nuevoBotonGuardarTexto}>Guardar y agregar</Text>
                  </Pressable>
                </View>
              </View>
            )}

            {/* Lista de resultados */}
            <ScrollView contentContainerStyle={estilos.resultadosLista}>
              {catalogo.length === 0 ? (
                <View style={estilos.vacioResultados}>
                  <Text style={estilos.detalle}>No se encontraron ejercicios.</Text>
                  <Pressable
                    style={estilos.botonCrearDesdeVacio}
                    onPress={() => setCreandoEjercicio(true)}
                  >
                    <Text style={estilos.botonCrearDesdeVacioTexto}>
                      Crear &quot;{busqueda.trim()}&quot;
                    </Text>
                  </Pressable>
                </View>
              ) : (
                catalogo.map((e) => (
                  <Pressable
                    key={e.id}
                    style={({ pressed }) => [
                      estilos.itemResultado,
                      pressed && estilos.itemResultadoPresionado,
                    ]}
                    onPress={() => seleccionarEjercicio(e)}
                  >
                    <View style={estilos.flex}>
                      <Text style={estilos.itemResultadoNombre}>{e.nombre}</Text>
                      <Text style={estilos.itemResultadoGrupo}>{e.grupo}</Text>
                    </View>
                    <Ionicons name="add-circle-outline" size={sizes.icon} color={colors.action} />
                  </Pressable>
                ))
              )}
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </Pantalla>
  );
}

const estilos = StyleSheet.create({
  flex: { flex: 1 },

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

  botonPredefinida: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.sm,
    ...shadow.card,
  },
  botonPredefinidaPresionado: {
    opacity: 0.8,
  },
  botonPredefinidaTitulo: {
    fontSize: fontSize.body,
    fontWeight: '600',
    color: colors.action,
  },

  campo: {
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  label: {
    fontSize: fontSize.small,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  ayuda: {
    fontSize: fontSize.caption,
    color: colors.textMuted,
  },
  inputTexto: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSize.body,
    lineHeight: lineHeight.body,
    color: colors.textPrimary,
    ...shadow.card,
  },

  // Lista de ejercicios
  ejerciciosHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  ejerciciosContador: {
    fontSize: fontSize.caption,
    color: colors.textMuted,
  },
  vacioEjercicios: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    alignItems: 'center',
    gap: spacing.xs,
    ...shadow.card,
  },
  vacioEjerciciosTexto: {
    fontSize: fontSize.small,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  listaEjercicios: {
    gap: spacing.xs,
  },
  itemEjercicio: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
    ...shadow.card,
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
    fontSize: fontSize.body,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  itemGrupo: {
    fontSize: fontSize.caption,
    color: colors.textSecondary,
    textTransform: 'capitalize',
  },
  itemBotonesOrden: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  botonFlecha: {
    padding: 4,
    borderRadius: radius.sm,
  },
  botonFlechaDeshabilitado: {
    opacity: 0.3,
  },
  botonEliminar: {
    padding: spacing.xs,
  },

  botonAgregarEjercicio: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    gap: spacing.xs,
    marginTop: spacing.xs,
    ...shadow.card,
  },
  botonAgregarEjercicioTexto: {
    fontSize: fontSize.body,
    fontWeight: '600',
    color: colors.action,
  },

  pie: {
    marginTop: spacing.lg,
    marginBottom: spacing.xxl,
  },

  // Modal buscador
  modalSafe: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  modalContenedor: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    marginBottom: spacing.xs,
  },
  modalHeaderIzquierda: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  flechaModal: {
    fontSize: fontSize.title,
    lineHeight: lineHeight.title,
    color: colors.textSecondary,
    paddingRight: spacing.xs,
  },
  modalTitulo: {
    fontSize: fontSize.title,
    lineHeight: lineHeight.title,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  enlaceCrear: {
    fontSize: fontSize.small,
    fontWeight: '600',
    color: colors.action,
  },
  buscadorCaja: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    minHeight: 52,
    gap: spacing.sm,
    ...shadow.card,
  },
  buscadorInput: {
    flex: 1,
    fontSize: fontSize.body,
    lineHeight: lineHeight.body,
    color: colors.textPrimary,
    padding: 0,
  },
  chipsScroll: {
    flexGrow: 0,
    flexShrink: 0,
    marginVertical: spacing.xs,
  },
  chipsLista: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
    paddingHorizontal: 2,
  },
  chip: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    minHeight: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chipActivo: {
    backgroundColor: colors.action,
  },
  chipTexto: {
    fontSize: fontSize.small,
    lineHeight: lineHeight.small,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  chipTextoActivo: {
    color: colors.textOnAction,
    fontWeight: '600',
  },

  cajaNuevoEjercicio: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
    ...shadow.card,
  },
  cajaNuevoTitulo: {
    fontSize: fontSize.small,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  nuevoInput: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    fontSize: fontSize.body,
    color: colors.textPrimary,
  },
  miniChips: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  miniChip: {
    paddingVertical: 2,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    marginRight: spacing.xs,
  },
  miniChipActivo: {
    backgroundColor: colors.action,
  },
  miniChipTexto: {
    fontSize: fontSize.caption,
    color: colors.textSecondary,
  },
  miniChipTextoActivo: {
    color: colors.textOnAction,
    fontWeight: '600',
  },
  nuevoBotones: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  nuevoBotonCancelar: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  nuevoBotonCancelarTexto: {
    fontSize: fontSize.small,
    color: colors.textSecondary,
  },
  nuevoBotonGuardar: {
    backgroundColor: colors.action,
    borderRadius: radius.sm,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  nuevoBotonGuardarTexto: {
    fontSize: fontSize.small,
    fontWeight: '600',
    color: colors.textOnAction,
  },

  resultadosLista: {
    paddingBottom: spacing.xxl,
    gap: spacing.xs,
  },
  itemResultado: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    ...shadow.card,
  },
  itemResultadoPresionado: {
    opacity: 0.8,
  },
  itemResultadoNombre: {
    fontSize: fontSize.body,
    fontWeight: '500',
    color: colors.textPrimary,
  },
  itemResultadoGrupo: {
    fontSize: fontSize.caption,
    color: colors.textSecondary,
    textTransform: 'capitalize',
  },
  vacioResultados: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    gap: spacing.sm,
  },
  detalle: {
    fontSize: fontSize.small,
    color: colors.textSecondary,
  },
  botonCrearDesdeVacio: {
    backgroundColor: colors.accentSoft,
    borderRadius: radius.pill,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  botonCrearDesdeVacioTexto: {
    fontSize: fontSize.small,
    fontWeight: '600',
    color: colors.textOnAccentSoft,
  },
});
