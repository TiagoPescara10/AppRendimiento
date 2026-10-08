// app/entrenamiento/mi-semana.tsx
//
// Asistente "Arma tu semana de gimnasio": dias, que rutina cada dia y a que
// hora, en un solo recorrido. Sirve para armar la semana por primera vez y
// para editarla (abre con todo precargado).
//
// No tiene modelo propio: guarda filas de `rutina` (tipo gimnasio) que
// apuntan a rutinas de Mis rutinas. La logica de que escribir vive en
// features/entrenamiento/miSemana.ts y el guardado en
// guardarMiSemana() (features/agenda/materializar.ts).
//
// Pasos: 0 dias, 1 rutina por dia, 2 hora y duracion, 3 resumen.

import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';

import { Pantalla } from '@/ui/Pantalla';
import { Progreso } from '@/ui/Progreso';
import { Boton } from '@/ui/Boton';
import { Chip } from '@/ui/Chip';
import { Toast } from '@/ui/Toast';
import { colors, fontSize, fontWeight, lineHeight, radius, shadow, sizes, spacing } from '@/ui/theme';

import { obtenerPerfilLocal } from '@/db/queries/perfil';
import { listarRutinas } from '@/db/queries/rutinas';
import {
  listarRutinasGimnasio,
  listarRutinasPredefinidas,
  type RutinaGimnasioConDetalle,
  type RutinaPredefinidaConEjercicios,
} from '@/db/queries/rutinasGimnasio';
import type { RutinaRow } from '@/db/schema';
import { guardarMiSemana } from '@/features/agenda/materializar';
import { pedirPermisoAvisosSiCorresponde } from '@/features/avisos/permiso';
import { SheetElegirRutina } from '@/features/entrenamiento/components/SheetElegirRutina';
import { BotonGuia } from '@/features/guias/components/BotonGuia';
import {
  DURACIONES_SEMANA,
  LETRA_DIA,
  NOMBRE_DIA,
  ORDEN_SEMANA,
  avisosDelPlan,
  diasSinRutina,
  estadoDesdeRutinas,
  estadoVacio,
  horaConPadding,
  horaCorta,
  horaDelDia,
  ordenarDias,
  planDesdeAsistente,
  sugerirRutinas,
  type EstadoAsistente,
  type RefRutina,
} from '@/features/entrenamiento/miSemana';

const TITULOS = [
  '¿Qué días vas al gimnasio?',
  '¿Qué hacés cada día?',
  '¿A qué hora?',
  'Tu semana',
];
const TOTAL_PASOS = TITULOS.length;

/** A quien le cambia la hora el picker abierto: a todos o a un dia. */
type ObjetivoHora = 'todos' | number;

function aDate(hora: string): Date {
  const [h, m] = hora.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
}

export default function MiSemana() {
  const router = useRouter();

  const [cargando, setCargando] = useState(true);
  const [paso, setPaso] = useState(0);
  const [estado, setEstado] = useState<EstadoAsistente>(estadoVacio);
  const [filas, setFilas] = useState<RutinaRow[]>([]);
  const [propias, setPropias] = useState<RutinaGimnasioConDetalle[]>([]);
  const [predefinidas, setPredefinidas] = useState<RutinaPredefinidaConEjercicios[]>([]);
  const [motivo, setMotivo] = useState<string | null>(null);
  const [sheetDia, setSheetDia] = useState<number | null>(null);
  const [picker, setPicker] = useState<ObjetivoHora | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [claveToast, setClaveToast] = useState(0);

  const usuarioIdRef = useRef<string | null>(null);
  const inicializadoRef = useRef(false);
  // El dia que espera la rutina que se esta creando en el editor, y que
  // rutinas habia antes: al volver, la que no estaba es la nueva.
  const pendienteRef = useRef<{ dia: number; idsAntes: Set<string> } | null>(null);
  // Candado sincrono: el estado llega tarde y un doble toque guardaba dos veces.
  const guardandoRef = useRef(false);

  // Corre al abrir y cada vez que se vuelve del editor de rutina.
  const cargar = useCallback(async () => {
    try {
      const perfil = await obtenerPerfilLocal();
      if (!perfil) return;
      usuarioIdRef.current = perfil.id;

      const mias = await listarRutinasGimnasio(perfil.id, true);
      setPropias(mias);

      if (!inicializadoRef.current) {
        const [actuales, biblioteca] = await Promise.all([
          listarRutinas(perfil.id, true),
          listarRutinasPredefinidas(),
        ]);
        const inicial = estadoDesdeRutinas(actuales);
        // Un dia que apunta a una rutina que ya no esta en Mis rutinas queda
        // sin elegir, igual que el gimnasio libre.
        const activas = new Set(mias.map((r) => r.id));
        for (const dia of inicial.dias) {
          const ref = inicial.rutinaPorDia[dia];
          if (ref && !activas.has(ref.id)) delete inicial.rutinaPorDia[dia];
        }
        setFilas(actuales);
        setPredefinidas(biblioteca);
        setEstado(inicial);
        inicializadoRef.current = true;
      }

      const pendiente = pendienteRef.current;
      if (pendiente) {
        pendienteRef.current = null;
        const nueva = mias
          .filter((r) => !pendiente.idsAntes.has(r.id))
          .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
        if (nueva) {
          setEstado((e) => ({
            ...e,
            rutinaPorDia: { ...e.rutinaPorDia, [pendiente.dia]: { origen: 'propia', id: nueva.id } },
          }));
          setToast('Rutina creada');
          setClaveToast((k) => k + 1);
        }
      }
    } catch (e) {
      console.error('Error al cargar Mi semana:', e);
      Alert.alert('Error', 'No se pudo cargar tu semana. Intentá de nuevo.');
    } finally {
      setCargando(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      cargar();
    }, [cargar]),
  );

  // El "atras" de Android vuelve un paso antes de salir del asistente.
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        if (paso === 0) return false;
        setPaso((p) => p - 1);
        return true;
      });
      return () => sub.remove();
    }, [paso]),
  );

  const nombreDe = useCallback(
    (ref: RefRutina | undefined): string | null => {
      if (!ref) return null;
      const lista = ref.origen === 'propia' ? propias : predefinidas;
      return lista.find((r) => r.id === ref.id)?.nombre ?? null;
    },
    [propias, predefinidas],
  );

  const faltan = diasSinRutina(estado);

  const resumen = useMemo(() => {
    if (paso !== TOTAL_PASOS - 1) return null;
    return avisosDelPlan(estado, filas);
  }, [paso, estado, filas]);

  // --- acciones ------------------------------------------------------------

  const alternarDia = (dia: number) => {
    setEstado((e) => {
      const esta = e.dias.includes(dia);
      return { ...e, dias: ordenarDias(esta ? e.dias.filter((d) => d !== dia) : [...e.dias, dia]) };
    });
    setMotivo(null);
  };

  const completarConSugerencia = () => {
    const s = sugerirRutinas(estado.dias);
    setEstado((e) => {
      const rutinaPorDia = { ...e.rutinaPorDia };
      for (const [dia, id] of Object.entries(s.porDia)) {
        rutinaPorDia[Number(dia)] = { origen: 'predefinida', id };
      }
      return { ...e, rutinaPorDia };
    });
    setMotivo(s.motivo);
  };

  const elegirRutina = (dia: number, ref: RefRutina) => {
    setEstado((e) => ({ ...e, rutinaPorDia: { ...e.rutinaPorDia, [dia]: ref } }));
  };

  const crearRutina = (dia: number) => {
    pendienteRef.current = { dia, idsAntes: new Set(propias.map((r) => r.id)) };
    router.push('/rutina-gimnasio/nueva');
  };

  const cambiarDistintaPorDia = (distinta: boolean) => {
    setEstado((e) => {
      if (!distinta) return { ...e, distintaPorDia: false };
      // Al prender, cada dia arranca con la hora que ya tenia todo.
      const horaPorDia = { ...e.horaPorDia };
      for (const d of e.dias) horaPorDia[d] = horaPorDia[d] ?? e.horaUnica;
      return { ...e, distintaPorDia: true, horaPorDia };
    });
  };

  const cambiarHora = (objetivo: ObjetivoHora, fecha: Date) => {
    const hora = horaConPadding(fecha.getHours(), fecha.getMinutes());
    setEstado((e) =>
      objetivo === 'todos'
        ? { ...e, horaUnica: hora }
        : { ...e, horaPorDia: { ...e.horaPorDia, [objetivo]: hora } },
    );
  };

  const atras = () => {
    setPicker(null);
    if (paso === 0) router.back();
    else setPaso((p) => p - 1);
  };

  const siguiente = () => {
    setPicker(null);
    setPaso((p) => Math.min(p + 1, TOTAL_PASOS - 1));
  };

  const guardar = async () => {
    const usuarioId = usuarioIdRef.current;
    if (guardandoRef.current || !usuarioId) return;
    guardandoRef.current = true;
    setGuardando(true);
    try {
      const plan = planDesdeAsistente(estado, filas, {
        propias: propias.map((r) => ({ id: r.id, nombre: r.nombre })),
        predefinidas: predefinidas.map((r) => ({ id: r.id, nombre: r.nombre })),
      });
      if (!plan.sinCambios) {
        await guardarMiSemana(usuarioId, plan);
        // La primera vez explica los avisos y pide el permiso. No tira.
        await pedirPermisoAvisosSiCorresponde(usuarioId);
      }
      router.back();
    } catch (e) {
      console.error('Error al guardar Mi semana:', e);
      Alert.alert('Error', 'No se pudo guardar tu semana. Intentá de nuevo.');
    } finally {
      guardandoRef.current = false;
      setGuardando(false);
    }
  };

  // --- render --------------------------------------------------------------

  if (cargando) {
    return (
      <Pantalla scroll={false}>
        <View style={estilos.centrado}>
          <ActivityIndicator color={colors.action} />
        </View>
      </Pantalla>
    );
  }

  const puedeSeguir = paso === 0 ? estado.dias.length > 0 : paso === 1 ? faltan.length === 0 : true;
  const textoSiguiente = paso === 2 ? 'Ver resumen' : 'Siguiente';

  return (
    <View style={estilos.flex}>
      <Pantalla>
        <View style={estilos.header}>
          <View style={estilos.barra}>
            <Text style={estilos.etiquetaPaso}>
              {paso < TOTAL_PASOS - 1 ? `PASO ${paso + 1} DE ${TOTAL_PASOS - 1}` : 'RESUMEN'}
            </Text>
            <BotonGuia id="mi-semana" style={estilos.botonAyuda} />
          </View>
          <Progreso actual={paso + 1} total={TOTAL_PASOS} />
        </View>

        <Text style={estilos.titulo}>{TITULOS[paso]}</Text>

        {paso === 0 && (
          <>
            <View style={estilos.diasFila}>
              {ORDEN_SEMANA.map((dia) => {
                const activo = estado.dias.includes(dia);
                return (
                  <Pressable
                    key={dia}
                    style={({ pressed }) => [
                      estilos.diaChip,
                      activo && estilos.diaChipActivo,
                      pressed && !activo && estilos.presionado,
                    ]}
                    onPress={() => alternarDia(dia)}
                    accessibilityRole="button"
                    accessibilityLabel={NOMBRE_DIA[dia]}
                    accessibilityState={{ selected: activo }}
                  >
                    <Text style={[estilos.diaChipTexto, activo && estilos.diaChipTextoActivo]}>
                      {LETRA_DIA[dia]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={estilos.ayuda}>
              Elegí los días que solés ir. Después lo cambiás cuando quieras.
            </Text>
          </>
        )}

        {paso === 1 && (
          <>
            <Boton
              titulo="Completar con una sugerencia"
              variante="secundario"
              icono="sparkles-outline"
              onPress={completarConSugerencia}
            />
            {motivo ? <Text style={estilos.motivo}>{motivo}</Text> : null}
            <Text style={estilos.ayuda}>
              Podés usar una rutina lista, armar la tuya desde cero o partir de una lista y
              cambiarla después en Mis rutinas.
            </Text>

            <View style={estilos.lista}>
              {estado.dias.map((dia) => {
                const nombre = nombreDe(estado.rutinaPorDia[dia]);
                return (
                  <View key={dia} style={estilos.filaDia}>
                    <Text style={estilos.filaDiaNombre}>{NOMBRE_DIA[dia]}</Text>
                    <Pressable
                      style={({ pressed }) => [
                        estilos.selector,
                        !nombre && estilos.selectorVacio,
                        pressed && estilos.presionado,
                      ]}
                      onPress={() => setSheetDia(dia)}
                      accessibilityRole="button"
                      accessibilityLabel={`${NOMBRE_DIA[dia]}: ${nombre ?? 'sin rutina'}. Cambiar`}
                    >
                      <Text
                        style={[estilos.selectorTexto, !nombre && estilos.selectorTextoVacio]}
                        numberOfLines={1}
                      >
                        {nombre ?? 'Elegí una rutina'}
                      </Text>
                      <Ionicons name="chevron-down" size={sizes.iconSmall} color={colors.textSecondary} />
                    </Pressable>
                  </View>
                );
              })}
            </View>
            {faltan.length > 0 && (
              <Text style={estilos.ayuda}>Elegí una rutina para cada día para seguir.</Text>
            )}
          </>
        )}

        {paso === 2 && (
          <>
            {!estado.distintaPorDia ? (
              <Pressable
                style={({ pressed }) => [estilos.filaHora, pressed && estilos.presionado]}
                onPress={() => setPicker('todos')}
                accessibilityRole="button"
              >
                <Text style={estilos.filaHoraTexto}>Todos los días a las</Text>
                <Text style={estilos.hora}>{horaCorta(estado.horaUnica)}</Text>
              </Pressable>
            ) : (
              <View style={estilos.lista}>
                {estado.dias.map((dia) => (
                  <Pressable
                    key={dia}
                    style={({ pressed }) => [estilos.filaHora, pressed && estilos.presionado]}
                    onPress={() => setPicker(dia)}
                    accessibilityRole="button"
                  >
                    <Text style={estilos.filaHoraTexto}>{NOMBRE_DIA[dia]}</Text>
                    <Text style={estilos.hora}>{horaCorta(horaDelDia(estado, dia))}</Text>
                  </Pressable>
                ))}
              </View>
            )}

            <View style={estilos.filaToggle}>
              <Text style={estilos.filaHoraTexto}>Distinta por día</Text>
              <Switch
                value={estado.distintaPorDia}
                onValueChange={cambiarDistintaPorDia}
                trackColor={{ true: colors.action, false: colors.borderStrong }}
                thumbColor={colors.surface}
              />
            </View>

            {picker !== null && (
              <DateTimePicker
                value={aDate(picker === 'todos' ? estado.horaUnica : horaDelDia(estado, picker))}
                mode="time"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                // Android: dialogo modal, dispara una sola vez, al confirmar.
                // iOS: inline, dispara en cada giro; lo cierra el boton "Listo".
                onValueChange={(_, nueva) => {
                  if (Platform.OS === 'android') setPicker(null);
                  cambiarHora(picker, nueva);
                }}
                onDismiss={() => setPicker(null)}
              />
            )}
            {picker !== null && Platform.OS === 'ios' && (
              <Boton titulo="Listo" variante="secundario" onPress={() => setPicker(null)} />
            )}

            <Text style={estilos.label}>Duración</Text>
            <View style={estilos.chips}>
              {DURACIONES_SEMANA.map((d) => (
                <Chip
                  key={d}
                  texto={`${d} min`}
                  activo={estado.duracionMin === d}
                  onPress={() => setEstado((e) => ({ ...e, duracionMin: d }))}
                />
              ))}
              {/* Una duracion guardada que no es de las cuatro se muestra tal
                  cual, para no cambiarla sin que el usuario la vea. */}
              {!(DURACIONES_SEMANA as readonly number[]).includes(estado.duracionMin) && (
                <Chip texto={`${estado.duracionMin} min`} activo onPress={() => {}} />
              )}
            </View>
          </>
        )}

        {paso === 3 && (
          <>
            <View style={estilos.card}>
              <Text style={estilos.cardTitulo}>Tu semana</Text>
              {estado.dias.map((dia) => (
                <Text key={dia} style={estilos.cardFila}>
                  {NOMBRE_DIA[dia]} · {nombreDe(estado.rutinaPorDia[dia])} ·{' '}
                  {horaCorta(horaDelDia(estado, dia))} · {estado.duracionMin} min
                </Text>
              ))}
            </View>
            {resumen && resumen.diasSacados.length > 0 && (
              <Text style={estilos.ayuda}>
                Dejás de ir el {resumen.diasSacados.map((d) => NOMBRE_DIA[d].toLowerCase()).join(', el ')}.
                Lo que ya hiciste queda en tu historial.
              </Text>
            )}
            {resumen?.diasConVarias.map((dia) => (
              <Text key={dia} style={estilos.ayuda}>
                El {NOMBRE_DIA[dia].toLowerCase()} tenía más de una rutina. Queda solo{' '}
                {nombreDe(estado.rutinaPorDia[dia])}.
              </Text>
            ))}
          </>
        )}

        <View style={estilos.pie}>
          <View style={estilos.flex}>
            <Boton titulo="Atrás" variante="secundario" onPress={atras} disabled={guardando} />
          </View>
          <View style={estilos.flex}>
            {paso < TOTAL_PASOS - 1 ? (
              <Boton titulo={textoSiguiente} onPress={siguiente} disabled={!puedeSeguir} />
            ) : (
              <Boton titulo="Guardar mi semana" onPress={guardar} cargando={guardando} />
            )}
          </View>
        </View>
      </Pantalla>

      <SheetElegirRutina
        visible={sheetDia !== null}
        titulo={sheetDia !== null ? NOMBRE_DIA[sheetDia] : ''}
        elegida={sheetDia !== null ? estado.rutinaPorDia[sheetDia] : undefined}
        predefinidas={predefinidas.map((p) => ({
          id: p.id,
          nombre: p.nombre,
          descripcion: p.descripcion,
          categoria: p.categoria,
        }))}
        propias={propias.map((p) => ({
          id: p.id,
          nombre: p.nombre,
          cantidadEjercicios: p.ejercicios.length,
        }))}
        onElegir={(ref) => {
          if (sheetDia !== null) elegirRutina(sheetDia, ref);
        }}
        onCrear={() => {
          if (sheetDia !== null) crearRutina(sheetDia);
        }}
        onCerrar={() => setSheetDia(null)}
      />

      <Toast mensaje={toast} clave={claveToast} onOculto={() => setToast(null)} />
    </View>
  );
}

const estilos = StyleSheet.create({
  flex: { flex: 1 },
  centrado: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { gap: spacing.sm },
  barra: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: sizes.controlSmall,
  },
  etiquetaPaso: {
    fontSize: fontSize.caption,
    fontWeight: fontWeight.bold,
    color: colors.textSecondary,
    letterSpacing: 1.2,
  },
  botonAyuda: {
    position: 'absolute',
    right: 0,
  },
  presionado: { backgroundColor: colors.surfaceAlt },
  titulo: {
    fontSize: fontSize.title,
    lineHeight: lineHeight.title,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    marginTop: spacing.sm,
  },
  ayuda: {
    fontSize: fontSize.small,
    lineHeight: lineHeight.small,
    color: colors.textSecondary,
  },
  motivo: {
    fontSize: fontSize.small,
    lineHeight: lineHeight.small,
    color: colors.textPrimary,
    backgroundColor: colors.accentSoft,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  label: {
    fontSize: fontSize.small,
    fontWeight: fontWeight.bold,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },

  // paso 1: dias
  diasFila: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.xs,
  },
  diaChip: {
    flex: 1,
    aspectRatio: 1,
    maxWidth: sizes.control,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  diaChipActivo: { backgroundColor: colors.action, borderColor: colors.action },
  diaChipTexto: {
    fontSize: fontSize.body,
    fontWeight: fontWeight.bold,
    color: colors.textSecondary,
  },
  diaChipTextoActivo: { color: colors.textOnAction },

  // paso 2: rutina por dia
  lista: { gap: spacing.sm },
  filaDia: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  filaDiaNombre: {
    width: 88,
    fontSize: fontSize.body,
    fontWeight: fontWeight.medium,
    color: colors.textPrimary,
  },
  selector: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: sizes.control,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  selectorVacio: { borderColor: colors.borderStrong, borderStyle: 'dashed' },
  selectorTexto: {
    flex: 1,
    fontSize: fontSize.body,
    color: colors.textPrimary,
  },
  selectorTextoVacio: { color: colors.textSecondary },

  // paso 3: hora y duracion
  filaHora: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: sizes.control,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    ...shadow.card,
  },
  filaHoraTexto: {
    fontSize: fontSize.body,
    color: colors.textPrimary,
  },
  hora: {
    fontSize: fontSize.subtitle,
    fontWeight: fontWeight.bold,
    color: colors.action,
  },
  filaToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },

  // resumen
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
    ...shadow.card,
  },
  cardTitulo: {
    fontSize: fontSize.subtitle,
    lineHeight: lineHeight.subtitle,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  cardFila: {
    fontSize: fontSize.body,
    lineHeight: lineHeight.body,
    color: colors.textPrimary,
  },

  pie: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
});
