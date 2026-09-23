// Alta de un evento suelto o de una rutina semanal. El switch cambia el
// formulario entero, no solo agrega campos: un evento tiene fecha y hora
// puntual, una rutina tiene dias de la semana y hora.

import { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, Pressable, StyleSheet, Alert, Switch, Platform, Modal, TextInput, ScrollView } from 'react-native';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';

import { Pantalla } from '@/ui/Pantalla';
import { Boton } from '@/ui/Boton';
import { colors, spacing, radius, fontSize, lineHeight, shadow, fontWeight } from '@/ui/theme';

import { crearEvento } from '@/db/queries/eventos';
import { obtenerRutina } from '@/db/queries/rutinas';
import { programarRutinaSemanal, desactivarRutina } from '@/features/agenda/materializar';
import { obtenerPerfilLocal } from '@/db/queries/perfil';
import { listarRutinasGimnasio, type RutinaGimnasioConDetalle } from '@/db/queries/rutinasGimnasio';
import { etiquetaTipo, capitalizarDeporte } from '@/features/agenda/formato';
import type { TipoEvento, Intensidad } from '@/db/schema';
import { randomUUID } from '@/db/sync/uuid';
import { aISOLocal } from '@/lib/fechas';

// ---------------------------------------------------------------------------
// Constantes y helpers
// ---------------------------------------------------------------------------

const TIPOS: { valor: TipoEvento; label: string }[] = [
  { valor: 'entrenamiento', label: 'Entrenamiento' },
  { valor: 'gimnasio', label: 'Gimnasio' },
  { valor: 'partido', label: 'Partido' },
];

const DEPORTES_COMUNES = [
  'Fútbol',
  'Pádel',
  'Tenis',
  'Básquet',
  'Running',
  'Natación',
  'Vóley',
];

const INTENSIDADES: { valor: Intensidad; label: string }[] = [
  { valor: 'baja', label: 'Baja' },
  { valor: 'media', label: 'Media' },
  { valor: 'alta', label: 'Alta' },
];

const DURACIONES = [30, 45, 60, 90];

/** Indice = Date.getDay(): 0 domingo, 6 sabado. */
const DIAS = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
const NOMBRES_DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

const p = (n: number) => String(n).padStart(2, '0');

/**
 * "08:30" en hora LOCAL. El CHECK del DDL rechaza "8:30", de ahi el padding.
 * Sobre por que se lee del Date local y no de toISOString(), ver lib/fechas.ts.
 */
function horaLocal(d: Date): string {
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * Copia de `d` con los segundos en cero.
 *
 * `cuando` arranca en new Date(), o sea con los segundos del instante en que
 * se abrio la pantalla, y el picker de fecha no los toca. Sin esto, un partido
 * puesto a las 14:23 se guardaria como 14:23:47: no rompe nada, pero es ruido
 * que el usuario no eligio. La version de aISOLocal que vivia en este archivo
 * fijaba los segundos en "00" por esto mismo.
 */
function sinSegundos(d: Date): Date {
  const copia = new Date(d.getTime());
  copia.setSeconds(0, 0);
  return copia;
}

function fechaLegible(d: Date): string {
  return d.toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' });
}

// ---------------------------------------------------------------------------
// Pantalla
// ---------------------------------------------------------------------------

export default function NuevoEvento() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    rutinaIds?: string;
    tipo?: TipoEvento;
    dias?: string;
    hora?: string;
    duracion?: string;
    intensidad?: Intensidad;
    deporte?: string;
  }>();
  const esEdicion = Boolean(params.rutinaIds);

  const [esRutina, setEsRutina] = useState(() => Boolean(params.rutinaIds));
  const [tipo, setTipo] = useState<TipoEvento>(() => params.tipo ?? 'entrenamiento');
  const [deportePrincipal, setDeportePrincipal] = useState<string | null>(null);
  const [deporteSeleccionado, setDeporteSeleccionado] = useState<string>(() => {
    if (params.deporte) return capitalizarDeporte(params.deporte);
    return 'Fútbol';
  });
  const [esOtroDeporte, setEsOtroDeporte] = useState(() => {
    if (params.deporte) {
      const cap = capitalizarDeporte(params.deporte);
      return !DEPORTES_COMUNES.some((d) => d.toLowerCase() === cap.toLowerCase());
    }
    return false;
  });
  const [deporteOtroTexto, setDeporteOtroTexto] = useState(() => {
    if (params.deporte) {
      const cap = capitalizarDeporte(params.deporte);
      if (!DEPORTES_COMUNES.some((d) => d.toLowerCase() === cap.toLowerCase())) {
        return cap;
      }
    }
    return '';
  });
  const [rutinasGimnasio, setRutinasGimnasio] = useState<RutinaGimnasioConDetalle[]>([]);
  const [rutinaGimnasioId, setRutinaGimnasioId] = useState<string | 'sin_rutina' | null>(null);
  const [rutinasPorDia, setRutinasPorDia] = useState<Record<number, string | 'sin_rutina'>>({});
  const [modalSelectorRutina, setModalSelectorRutina] = useState<{
    visible: boolean;
    diaTarget?: number;
  } | null>(null);
  const [intensidad, setIntensidad] = useState<Intensidad>(() => params.intensidad ?? 'media');
  const [duracion, setDuracion] = useState(() => (params.duracion ? parseInt(params.duracion, 10) : 60));
  const [otraDuracion, setOtraDuracion] = useState(false);
  const [duracionTexto, setDuracionTexto] = useState('');

  const cargarRutinasGim = useCallback(async () => {
    try {
      const p = await obtenerPerfilLocal();
      if (!p) return;
      const rgs = await listarRutinasGimnasio(p.id, true);
      setRutinasGimnasio(rgs);
    } catch (e) {
      console.error('Error al cargar rutinas de gimnasio:', e);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      cargarRutinasGim();
    }, [cargarRutinasGim]),
  );

  useEffect(() => {
    obtenerPerfilLocal()
      .then((p) => {
        if (p?.deporte_principal) {
          const cap = capitalizarDeporte(p.deporte_principal);
          setDeportePrincipal(cap);
          if (!params.deporte) {
            setDeporteSeleccionado(cap);
          }
        }
      })
      .catch(console.error);
  }, [params.deporte]);

  const listaDeportes = (() => {
    const list: string[] = [];
    if (deportePrincipal) {
      list.push(deportePrincipal);
    }
    for (const d of DEPORTES_COMUNES) {
      if (!list.some((existente) => existente.toLowerCase() === d.toLowerCase())) {
        list.push(d);
      }
    }
    return list;
  })();

  // Evento suelto: un Date completo. Rutina: solo se usa la hora.
  const [cuando, setCuando] = useState(() => {
    const d = new Date();
    if (params.hora) {
      const [hh, mm] = params.hora.split(':').map(Number);
      d.setHours(hh, mm, 0, 0);
    }
    return d;
  });
  const [picker, setPicker] = useState<'date' | 'time' | null>(null);

  // Rutina: dias de la semana elegidos, por indice de getDay().
  const [dias, setDias] = useState<number[]>(() => {
    if (params.dias) {
      return params.dias.split(',').map(Number).filter((n) => !isNaN(n));
    }
    return [];
  });

  const [guardando, setGuardando] = useState(false);
  // El estado `guardando` llega tarde: dos toques seguidos en Guardar leen los
  // dos el false del render anterior y guardaban la rutina dos veces. El ref
  // cambia en el acto.
  const guardandoRef = useRef(false);

  // Al editar, cada dia arranca con la rutina de gimnasio que ya tenia.
  useEffect(() => {
    if (!params.rutinaIds) return;
    Promise.all(params.rutinaIds.split(',').map((id) => obtenerRutina(id)))
      .then((filas) => {
        const previas: Record<number, string | 'sin_rutina'> = {};
        for (const f of filas) {
          if (f) previas[f.dia_semana] = f.rutina_gimnasio_id ?? 'sin_rutina';
        }
        setRutinasPorDia(previas);
      })
      .catch((e) => console.error('Error al cargar las rutinas a editar:', e));
  }, [params.rutinaIds]);

  const alternarDia = (i: number) => {
    setDias((prev) => (prev.includes(i) ? prev.filter((d) => d !== i) : [...prev, i]));
  };

  const confirmarOtraDuracion = () => {
    const n = parseInt(duracionTexto, 10);
    if (!Number.isFinite(n) || n < 5 || n > 480) {
      Alert.alert('Duración inválida', 'Ingresá un valor entre 5 y 480 minutos.');
      return;
    }
    setDuracion(n);
    setOtraDuracion(false);
    setDuracionTexto('');
  };

  const guardar = async () => {
    if (guardandoRef.current) return;

    if (esRutina && dias.length === 0) {
      Alert.alert('Faltan días', 'Elegí al menos un día de la semana.');
      return;
    }

    if (tipo === 'gimnasio') {
      if (!esRutina) {
        if (!rutinaGimnasioId) {
          Alert.alert('Falta elegir rutina', 'Elegí una rutina para esta sesión o seleccioná "Sin rutina fija".');
          return;
        }
      } else {
        for (const dia of dias) {
          if (!rutinasPorDia[dia]) {
            Alert.alert(
              'Falta elegir rutina',
              `Elegí una rutina para el ${NOMBRES_DIAS[dia]} o seleccioná "Sin rutina fija".`,
            );
            return;
          }
        }
      }
    }

    guardandoRef.current = true;
    setGuardando(true);
    try {
      const perfil = await obtenerPerfilLocal();
      if (!perfil) {
        Alert.alert('Error', 'No se encontró el perfil.');
        return;
      }

      const deporteFinal =
        tipo === 'entrenamiento'
          ? esOtroDeporte
            ? (deporteOtroTexto.trim() || null)
            : (deporteSeleccionado.trim() || null)
          : null;

      if (esRutina) {
        // Al editar, desactivar los registros anteriores para limpiar eventos futuros
        if (esEdicion && params.rutinaIds) {
          const viejos = params.rutinaIds.split(',');
          for (const vid of viejos) {
            await desactivarRutina(vid);
          }
        }

        // Una fila por dia elegido, reutilizando la que ya exista para ese dia
        // y esa rutina. Tambien materializa: sin eso la agenda sigue vacia.
        await programarRutinaSemanal({
          usuarioId: perfil.id,
          tipo,
          hora: horaLocal(cuando),
          duracion_estimada_min: duracion,
          intensidad,
          deporte: deporteFinal,
          dias: dias.map((dia) => ({
            dia_semana: dia,
            rutina_gimnasio_id:
              tipo === 'gimnasio' && rutinasPorDia[dia] !== 'sin_rutina'
                ? rutinasPorDia[dia] ?? null
                : null,
          })),
        });
      } else {
        const rgId =
          tipo === 'gimnasio'
            ? rutinaGimnasioId === 'sin_rutina'
              ? null
              : rutinaGimnasioId
            : null;

        await crearEvento({
          id: randomUUID(),
          usuario_id: perfil.id,
          tipo,
          fecha_hora_inicio: aISOLocal(sinSegundos(cuando)),
          duracion_estimada_min: duracion,
          intensidad,
          deporte: deporteFinal,
          rutina_gimnasio_id: rgId,
        });
      }

      router.back();
    } catch (e) {
      console.error('Error al guardar:', e);
      Alert.alert('Error', 'No se pudo guardar. Intentá de nuevo.');
    } finally {
      guardandoRef.current = false;
      setGuardando(false);
    }
  };

  return (
    <Pantalla>
      <View style={estilos.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={estilos.cerrar}>✕</Text>
        </Pressable>
        <Text style={estilos.headerTitulo}>
          {esEdicion ? 'Editar rutina' : esRutina ? 'Nueva rutina' : 'Nuevo evento'}
        </Text>
      </View>

      {/* Tipo */}
      <Text style={estilos.label}>Tipo</Text>
      <View style={estilos.chips}>
        {TIPOS.map((t) => (
          <Pressable
            key={t.valor}
            style={[estilos.chip, tipo === t.valor && estilos.chipActivo]}
            onPress={() => setTipo(t.valor)}
          >
            <Text style={[estilos.chipTexto, tipo === t.valor && estilos.chipTextoActivo]}>
              {t.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Selector de deporte si es entrenamiento */}
      {tipo === 'entrenamiento' && (
        <View style={estilos.seccionDeporte}>
          <Text style={estilos.label}>¿Qué deporte?</Text>
          <View style={estilos.chips}>
            {listaDeportes.map((dep) => {
              const activo =
                !esOtroDeporte &&
                deporteSeleccionado.toLowerCase() === dep.toLowerCase();
              return (
                <Pressable
                  key={dep}
                  style={[estilos.chip, activo && estilos.chipActivo]}
                  onPress={() => {
                    setEsOtroDeporte(false);
                    setDeporteSeleccionado(dep);
                  }}
                >
                  <Text
                    style={[
                      estilos.chipTexto,
                      activo && estilos.chipTextoActivo,
                    ]}
                  >
                    {dep}
                  </Text>
                </Pressable>
              );
            })}
            <Pressable
              style={[estilos.chip, esOtroDeporte && estilos.chipActivo]}
              onPress={() => setEsOtroDeporte(true)}
            >
              <Text
                style={[
                  estilos.chipTexto,
                  esOtroDeporte && estilos.chipTextoActivo,
                ]}
              >
                + Otro
              </Text>
            </Pressable>
          </View>

          {esOtroDeporte && (
            <View style={estilos.otroDeporteFila}>
              <TextInput
                style={estilos.inputOtroDeporte}
                placeholder="Nombre del deporte (ej: Escalada, Remo...)"
                placeholderTextColor={colors.textMuted}
                value={deporteOtroTexto}
                onChangeText={setDeporteOtroTexto}
                autoFocus
              />
            </View>
          )}
        </View>
      )}

      {/* Selector de rutina para gimnasio puntual */}
      {tipo === 'gimnasio' && !esRutina && (
        <View style={estilos.seccionGimnasio}>
          <Text style={estilos.label}>¿Qué rutina vas a hacer?</Text>
          <Pressable
            style={estilos.selectorRutinaBoton}
            onPress={() => setModalSelectorRutina({ visible: true })}
          >
            <Text
              style={[
                estilos.selectorRutinaTexto,
                !rutinaGimnasioId && estilos.selectorRutinaTextoPlaceholder,
              ]}
              numberOfLines={1}
            >
              {rutinaGimnasioId === 'sin_rutina'
                ? 'Sin rutina fija (Gimnasio libre)'
                : rutinaGimnasioId
                ? rutinasGimnasio.find((r) => r.id === rutinaGimnasioId)?.nombre ?? 'Rutina seleccionada'
                : 'Elegir rutina o sesión libre ▾'}
            </Text>
            <Text style={estilos.selectorRutinaFlecha}>▾</Text>
          </Pressable>
        </View>
      )}

      {/* Switch: solo visible al crear; al editar una rutina fija siempre se repite */}
      {!esEdicion && (
        <View style={[estilos.switchFila, esRutina && estilos.switchActivo]}>
          <View style={estilos.flex}>
            <Text style={estilos.nombre}>Se repite</Text>
            <Text style={estilos.detalle}>Todas las semanas</Text>
          </View>
          <Switch
            value={esRutina}
            onValueChange={setEsRutina}
            trackColor={{ true: colors.action }}
          />
        </View>
      )}

      {/* Cuando: cambia de forma segun el modo. */}
      {esRutina ? (
        <>
          <Text style={estilos.label}>Qué días</Text>
          <View style={estilos.dias}>
            {DIAS.map((d, i) => (
              <Pressable
                key={i}
                style={[estilos.dia, dias.includes(i) && estilos.diaActivo]}
                onPress={() => alternarDia(i)}
              >
                <Text style={[estilos.chipTexto, dias.includes(i) && estilos.chipTextoActivo]}>
                  {d}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Rutina por dia para gimnasio semanal repetido */}
          {tipo === 'gimnasio' && (
            <View style={estilos.seccionGimnasio}>
              <Text style={estilos.label}>Rutina por día</Text>
              {dias.length === 0 ? (
                <Text style={estilos.textoAyudaGimnasio}>
                  Elegí arriba los días de la semana para asignar su rutina.
                </Text>
              ) : (
                <View style={estilos.listaDiasGimnasio}>
                  {dias.map((dia) => {
                    const sel = rutinasPorDia[dia];
                    const nombreSel =
                      sel === 'sin_rutina'
                        ? 'Sin rutina fija'
                        : sel
                        ? rutinasGimnasio.find((r) => r.id === sel)?.nombre ?? 'Rutina elegida'
                        : 'Elegir rutina ▾';

                    return (
                      <View key={dia} style={estilos.filaDiaGimnasio}>
                        <Text style={estilos.nombreDiaGimnasio}>{NOMBRES_DIAS[dia]}</Text>
                        <Pressable
                          style={[
                            estilos.pillRutinaDia,
                            !sel && estilos.pillRutinaDiaIncompleto,
                          ]}
                          onPress={() => setModalSelectorRutina({ visible: true, diaTarget: dia })}
                        >
                          <Text
                            style={[
                              estilos.pillRutinaDiaTexto,
                              !sel && estilos.pillRutinaDiaTextoPlaceholder,
                            ]}
                            numberOfLines={1}
                          >
                            {nombreSel}
                          </Text>
                        </Pressable>
                      </View>
                    );
                  })}
                </View>
              )}
              <Pressable
                style={estilos.botonCrearRutinaInline}
                onPress={() => router.push('/rutina-gimnasio/nueva')}
              >
                <Text style={estilos.botonCrearRutinaInlineTexto}>+ Crear nueva rutina de gimnasio</Text>
              </Pressable>
            </View>
          )}

          <Text style={estilos.label}>A qué hora</Text>
          <Pressable style={estilos.campo} onPress={() => setPicker('time')}>
            <Text style={estilos.nombre}>{horaLocal(cuando)}</Text>
          </Pressable>
        </>
      ) : (
        <>
          <Text style={estilos.label}>Cuándo</Text>
          <View style={estilos.cuandoFila}>
            <Pressable style={[estilos.campo, estilos.flex2]} onPress={() => setPicker('date')}>
              <Text style={estilos.nombre}>{fechaLegible(cuando)}</Text>
            </Pressable>
            <Pressable style={[estilos.campo, estilos.flex]} onPress={() => setPicker('time')}>
              <Text style={estilos.nombre}>{horaLocal(cuando)}</Text>
            </Pressable>
          </View>
        </>
      )}

      {picker && (
        <DateTimePicker
          value={cuando}
          mode={picker}
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          // onValueChange solo llega cuando el usuario ELIGE algo; cancelar
          // sale por onDismiss. Antes las dos cosas venian juntas por onChange
          // y habia que separarlas mirando event.type.
          onValueChange={(_, nueva) => {
            // Android: dialogo modal, dispara una sola vez, al confirmar.
            // iOS: inline, dispara en cada giro; lo cierra el boton "Listo".
            if (Platform.OS === 'android') setPicker(null);
            setCuando(nueva);
          }}
          onDismiss={() => setPicker(null)}
        />
      )}
      {picker && Platform.OS === 'ios' && (
        <Boton titulo="Listo" variante="secundario" onPress={() => setPicker(null)} />
      )}

      {/* Duracion */}
      <Text style={estilos.label}>Duración</Text>
      <View style={estilos.chips}>
        {DURACIONES.map((d) => (
          <Pressable
            key={d}
            style={[estilos.chip, duracion === d && estilos.chipActivo]}
            onPress={() => setDuracion(d)}
          >
            <Text style={[estilos.chipTexto, duracion === d && estilos.chipTextoActivo]}>
              {d} min
            </Text>
          </Pressable>
        ))}
        <Pressable
          style={[estilos.chip, !DURACIONES.includes(duracion) && estilos.chipActivo]}
          onPress={() => setOtraDuracion(true)}
        >
          <Text
            style={[
              estilos.chipTexto,
              !DURACIONES.includes(duracion) && estilos.chipTextoActivo,
            ]}
          >
            {DURACIONES.includes(duracion) ? 'Otra' : `${duracion} min`}
          </Text>
        </Pressable>
      </View>

      {/* Intensidad */}
      <Text style={estilos.label}>Intensidad</Text>
      <View style={estilos.intensidades}>
        {INTENSIDADES.map((i) => (
          <Pressable
            key={i.valor}
            style={[estilos.chipAncho, intensidad === i.valor && estilos.chipActivo]}
            onPress={() => setIntensidad(i.valor)}
          >
            <Text
              style={[estilos.chipTexto, intensidad === i.valor && estilos.chipTextoActivo]}
            >
              {i.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Crear una rutina genera decenas de eventos sin que se vea nada.
          Decirlo antes evita la sorpresa. */}
      {esRutina && (
        <Text style={estilos.aviso}>
          Se van a crear los eventos de las próximas 8 semanas. Podés borrar o cambiar
          cualquiera por separado.
        </Text>
      )}

      <Boton
        titulo={esEdicion ? 'Guardar cambios' : esRutina ? 'Crear rutina' : 'Guardar'}
        onPress={guardar}
        cargando={guardando}
      />

      {/* Duracion a medida */}
      <Modal
        visible={otraDuracion}
        transparent
        animationType="slide"
        onRequestClose={() => setOtraDuracion(false)}
      >
        <View style={estilos.fondo}>
          <Pressable style={estilos.flex} onPress={() => setOtraDuracion(false)} />
          <View style={estilos.sheet}>
            <View style={estilos.agarre} />
            <Text style={estilos.nombre}>¿Cuántos minutos?</Text>
            <View style={estilos.cuandoFila}>
              <TextInput
                style={estilos.input}
                value={duracionTexto}
                onChangeText={setDuracionTexto}
                placeholder="Ej: 75"
                placeholderTextColor={colors.textSecondary}
                keyboardType="number-pad"
                returnKeyType="done"
                onSubmitEditing={confirmarOtraDuracion}
                autoFocus
              />
              <Pressable style={estilos.usarBoton} onPress={confirmarOtraDuracion}>
                <Text style={estilos.chipTextoActivo}>Usar</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal selector de rutina de gimnasio */}
      <Modal
        visible={Boolean(modalSelectorRutina?.visible)}
        transparent
        animationType="fade"
        onRequestClose={() => setModalSelectorRutina(null)}
      >
        <Pressable
          style={estilos.fondo}
          onPress={() => setModalSelectorRutina(null)}
        >
          <Pressable style={estilos.sheetModalRutina} onPress={(e) => e.stopPropagation()}>
            <View style={estilos.modalSheetHeader}>
              <Text style={estilos.modalSheetTitulo}>
                {modalSelectorRutina?.diaTarget !== undefined
                  ? `Rutina para ${NOMBRES_DIAS[modalSelectorRutina.diaTarget]}`
                  : 'Elegir rutina de gimnasio'}
              </Text>
              <Pressable
                onPress={() => setModalSelectorRutina(null)}
                hitSlop={12}
              >
                <Text style={estilos.cerrar}>✕</Text>
              </Pressable>
            </View>

            <ScrollView style={estilos.modalListaOpciones} bounces={false}>
              {rutinasGimnasio.length > 0 && (
                <View style={estilos.modalSeccion}>
                  <Text style={estilos.modalSeccionLabel}>Tus rutinas guardadas</Text>
                  {rutinasGimnasio.map((rg) => {
                    const esSeleccionada =
                      modalSelectorRutina?.diaTarget !== undefined
                        ? rutinasPorDia[modalSelectorRutina.diaTarget] === rg.id
                        : rutinaGimnasioId === rg.id;

                    return (
                      <Pressable
                        key={rg.id}
                        style={[
                          estilos.modalOpcionCard,
                          esSeleccionada && estilos.modalOpcionCardActiva,
                        ]}
                        onPress={() => {
                          if (modalSelectorRutina?.diaTarget !== undefined) {
                            setRutinasPorDia((prev) => ({
                              ...prev,
                              [modalSelectorRutina.diaTarget!]: rg.id,
                            }));
                          } else {
                            setRutinaGimnasioId(rg.id);
                          }
                          setModalSelectorRutina(null);
                        }}
                      >
                        <View style={estilos.flex}>
                          <Text
                            style={[
                              estilos.modalOpcionTitulo,
                              esSeleccionada && estilos.modalOpcionTituloActivo,
                            ]}
                          >
                            {rg.nombre}
                          </Text>
                          <Text style={estilos.modalOpcionSubtitulo}>
                            {rg.ejercicios.length} ejercicios
                          </Text>
                        </View>
                        {esSeleccionada && (
                          <Text style={estilos.modalCheck}>✓</Text>
                        )}
                      </Pressable>
                    );
                  })}
                </View>
              )}

              <View style={estilos.modalSeccion}>
                <Text style={estilos.modalSeccionLabel}>Sesión libre</Text>
                {(() => {
                  const esLibreSeleccionada =
                    modalSelectorRutina?.diaTarget !== undefined
                      ? rutinasPorDia[modalSelectorRutina.diaTarget] === 'sin_rutina'
                      : rutinaGimnasioId === 'sin_rutina';

                  return (
                    <Pressable
                      style={[
                        estilos.modalOpcionCard,
                        esLibreSeleccionada && estilos.modalOpcionCardActiva,
                      ]}
                      onPress={() => {
                        if (modalSelectorRutina?.diaTarget !== undefined) {
                          setRutinasPorDia((prev) => ({
                            ...prev,
                            [modalSelectorRutina.diaTarget!]: 'sin_rutina',
                          }));
                        } else {
                          setRutinaGimnasioId('sin_rutina');
                        }
                        setModalSelectorRutina(null);
                      }}
                    >
                      <View style={estilos.flex}>
                        <Text
                          style={[
                            estilos.modalOpcionTitulo,
                            esLibreSeleccionada && estilos.modalOpcionTituloActivo,
                          ]}
                        >
                          Sin rutina fija
                        </Text>
                        <Text style={estilos.modalOpcionSubtitulo}>
                          Gimnasio libre, sin ejercicios predefinidos
                        </Text>
                      </View>
                      {esLibreSeleccionada && (
                        <Text style={estilos.modalCheck}>✓</Text>
                      )}
                    </Pressable>
                  );
                })()}
              </View>
            </ScrollView>

            <View style={estilos.modalFooter}>
              <Pressable
                style={estilos.modalBotonCrear}
                onPress={() => {
                  setModalSelectorRutina(null);
                  router.push('/rutina-gimnasio/nueva');
                }}
              >
                <Text style={estilos.modalBotonCrearTexto}>+ Crear nueva rutina de gimnasio</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </Pantalla>
  );
}

// ---------------------------------------------------------------------------

const estilos = StyleSheet.create({
  flex: { flex: 1 },
  flex2: { flex: 2 },

  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  cerrar: { fontSize: fontSize.body, color: colors.textSecondary },
  headerTitulo: {
    fontSize: fontSize.body,
    lineHeight: lineHeight.body,
    fontWeight: '500',
    color: colors.textPrimary,
  },

  label: { fontSize: fontSize.small, color: colors.textSecondary, marginTop: spacing.sm },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
  },
  chipAncho: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    alignItems: 'center',
  },
  chipActivo: { backgroundColor: colors.action },
  chipTexto: { fontSize: fontSize.small, color: colors.textSecondary },
  chipTextoActivo: { fontSize: fontSize.small, color: colors.textOnAction },

  // Bloque de contenido, no un chip: lleva sombra. Sin ella el blanco quedaba
  // flotando sobre el crema en vez de despegarse.
  switchFila: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    marginTop: spacing.sm,
    ...shadow.card,
  },
  switchActivo: { backgroundColor: colors.accentSoft },

  dias: { flexDirection: 'row', gap: spacing.xs },
  dia: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  diaActivo: { backgroundColor: colors.action },

  cuandoFila: { flexDirection: 'row', gap: spacing.sm },
  campo: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 0.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
  },

  intensidades: { flexDirection: 'row', gap: spacing.xs },

  nombre: { fontSize: fontSize.body, lineHeight: lineHeight.body, color: colors.textPrimary },
  detalle: { fontSize: fontSize.small, color: colors.textSecondary },
  aviso: {
    fontSize: fontSize.small,
    lineHeight: lineHeight.small,
    color: colors.textSecondary,
  },

  fondo: { flex: 1, justifyContent: 'flex-end', backgroundColor: colors.overlay },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.lg,
    paddingBottom: spacing.xxxl,
    ...shadow.sheet,
    gap: spacing.md,
  },
  agarre: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center',
  },
  input: {
    flex: 1,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    fontSize: fontSize.body,
    color: colors.textPrimary,
  },
  usarBoton: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.action,
    justifyContent: 'center',
  },
  seccionDeporte: {
    gap: spacing.xs,
  },
  otroDeporteFila: {
    marginTop: spacing.xs,
  },
  inputOtroDeporte: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    fontSize: fontSize.body,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  seccionGimnasio: {
    gap: spacing.xs,
  },
  selectorRutinaBoton: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectorRutinaTexto: {
    fontSize: fontSize.body,
    color: colors.textPrimary,
    flex: 1,
  },
  selectorRutinaTextoPlaceholder: {
    color: colors.textMuted,
  },
  selectorRutinaFlecha: {
    fontSize: fontSize.body,
    color: colors.textSecondary,
    marginLeft: spacing.sm,
  },
  textoAyudaGimnasio: {
    fontSize: fontSize.small,
    color: colors.textSecondary,
    fontStyle: 'italic',
  },
  listaDiasGimnasio: {
    gap: spacing.xs,
  },
  filaDiaGimnasio: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  nombreDiaGimnasio: {
    fontSize: fontSize.body,
    color: colors.textPrimary,
    fontWeight: fontWeight.bold,
  },
  pillRutinaDia: {
    backgroundColor: colors.bg,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm + 2,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.action,
    maxWidth: '65%',
  },
  pillRutinaDiaIncompleto: {
    borderColor: colors.border,
  },
  pillRutinaDiaTexto: {
    fontSize: fontSize.small,
    color: colors.action,
    fontWeight: fontWeight.medium,
  },
  pillRutinaDiaTextoPlaceholder: {
    color: colors.textMuted,
    fontWeight: fontWeight.regular,
  },
  botonCrearRutinaInline: {
    paddingVertical: spacing.xs,
    alignItems: 'flex-start',
  },
  botonCrearRutinaInlineTexto: {
    fontSize: fontSize.small,
    color: colors.action,
    fontWeight: fontWeight.medium,
  },
  sheetModalRutina: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.lg,
    maxHeight: '80%',
    ...shadow.sheet,
  },
  modalSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  modalSheetTitulo: {
    fontSize: fontSize.title,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  modalListaOpciones: {
    marginBottom: spacing.md,
  },
  modalSeccion: {
    marginBottom: spacing.md,
  },
  modalSeccionLabel: {
    fontSize: fontSize.caption,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    marginBottom: spacing.xs,
  },
  modalOpcionCard: {
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
  },
  modalOpcionCardActiva: {
    borderColor: colors.action,
  },
  modalOpcionTitulo: {
    fontSize: fontSize.body,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  modalOpcionTituloActivo: {
    color: colors.action,
  },
  modalOpcionSubtitulo: {
    fontSize: fontSize.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  modalCheck: {
    fontSize: fontSize.body,
    color: colors.action,
    fontWeight: fontWeight.bold,
    marginLeft: spacing.sm,
  },
  modalFooter: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
  },
  modalBotonCrear: {
    backgroundColor: colors.surface,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.action,
  },
  modalBotonCrearTexto: {
    fontSize: fontSize.body,
    color: colors.action,
    fontWeight: fontWeight.medium,
  },
});