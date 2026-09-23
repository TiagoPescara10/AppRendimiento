// app/evento/rutina.tsx
//
// Pantalla de carga y ejecucion de sesion de gimnasio.
// Disenada para operar con una sola mano y minima friccion durante el entrenamiento:
// - Header con barra de progreso y boton "Finalizar".
// - Lista de ejercicios en acordeon con separacion clara entre tarjetas.
// - Tabla de series con columnas: Serie | Anterior | Kg | Reps | Estado.
// - Series confirmadas protegidas como solo lectura (toque simple no las reabre;
//   requiere onLongPress o tocar el icono de check para corregir).
// - Fila en edicion con alto contraste (borde 2px action, fondo acentuado).
// - Scroll suave automatico al saltar al siguiente ejercicio.
// - Keypad numerico tactil integrado al pie con shadow.sheet y atajos rapidos (+1.25, +2.5, +5, Corporal).
// - Sin cronometro, sin timers de descanso, sin minutos en pantalla.

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Alert,
  Modal,
  TextInput,
  ScrollView,
  Platform,
  StatusBar,
  KeyboardAvoidingView,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, spacing, radius, fontSize, fontWeight, lineHeight, shadow, sizes } from '@/ui/theme';

import { obtenerPerfilLocal } from '@/db/queries/perfil';
import {
  listarEjercicios,
  buscarEjercicios,
  crearEjercicio,
} from '@/db/queries/ejercicios';
import {
  obtenerRutinaGimnasio,
} from '@/db/queries/rutinasGimnasio';
import {
  obtenerSeriesPreviasPorEjercicio,
  type SeriePreviaEjercicio,
} from '@/db/queries/sesiones';
import { guardarRutinaTerminada } from '@/features/entrenamiento/guardarRutina';
import { randomUUID } from '@/db/sync/uuid';
import type { EjercicioRow, GrupoMuscular } from '@/db/schema';

// ---------------------------------------------------------------------------
// Modelos locales
// ---------------------------------------------------------------------------

interface SerieBorrador {
  id: string;
  repeticiones: number;
  pesoKg: number | null;
  confirmada: boolean;
  textoRepes: string;
  textoPeso: string;
}

function crearSerieBorrador(
  repeticiones = 10,
  pesoKg: number | null = null,
  confirmada = false,
): SerieBorrador {
  return {
    id: randomUUID(),
    repeticiones,
    pesoKg,
    confirmada,
    textoRepes: String(repeticiones),
    textoPeso: pesoKg !== null && pesoKg > 0 ? String(pesoKg) : '',
  };
}

interface EjercicioEnSesion {
  ejercicio: EjercicioRow;
  series: SerieBorrador[];
}

interface SeleccionSerie {
  ejercicioId: string;
  serieId: string;
}

const GRUPOS: { valor: GrupoMuscular | 'todos'; label: string }[] = [
  { valor: 'todos', label: 'Todos' },
  { valor: 'pecho', label: 'Pecho' },
  { valor: 'espalda', label: 'Espalda' },
  { valor: 'piernas', label: 'Piernas' },
  { valor: 'hombros', label: 'Hombros' },
  { valor: 'brazos', label: 'Brazos' },
  { valor: 'core', label: 'Core' },
];

function esEjercicioCorporal(ejercicio: EjercicioRow, previas?: SeriePreviaEjercicio[]): boolean {
  if (previas && previas.length > 0) {
    return previas.every((p) => p.peso_kg === null || p.peso_kg === 0);
  }
  const n = ejercicio.nombre.toLowerCase();
  return (
    n.includes('dominada') ||
    n.includes('flexion') ||
    n.includes('fondo') ||
    n.includes('plancha') ||
    n.includes('abdominal') ||
    n.includes('hiperextension')
  );
}

// ---------------------------------------------------------------------------
// Componente Principal
// ---------------------------------------------------------------------------

export default function SesionRutina() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const posicionesY = useRef<Record<string, number>>({});

  const params = useLocalSearchParams<{
    rutinaGimnasioId?: string;
    eventoId?: string;
    nombreRutina?: string;
  }>();
  const rutinaGimnasioId = params.rutinaGimnasioId;
  const eventoId = params.eventoId;

  const [usuarioId, setUsuarioId] = useState<string | null>(null);
  const [inicioMs] = useState(() => Date.now());
  const [nombreRutina, setNombreRutina] = useState<string | null>(params.nombreRutina ?? null);

  const [ejerciciosSesion, setEjerciciosSesion] = useState<EjercicioEnSesion[]>([]);
  const [referenciasPrevias, setReferenciasPrevias] = useState<Map<string, SeriePreviaEjercicio[]>>(
    new Map(),
  );

  // Acordeon y seleccion de serie activa para el keypad
  const [ejercicioExpandidoId, setEjercicioExpandidoId] = useState<string | null>(null);
  const [serieActiva, setSerieActiva] = useState<SeleccionSerie | null>(null);
  const [campoActivo, setCampoActivo] = useState<'kg' | 'reps'>('kg');

  // Modal buscador de ejercicios del catalogo
  const [modalBuscador, setModalBuscador] = useState(false);
  const [catalogo, setCatalogo] = useState<EjercicioRow[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [grupoFiltro, setGrupoFiltro] = useState<GrupoMuscular | 'todos'>('todos');

  // Modal alta de nuevo ejercicio
  const [nuevoNombre, setNuevoNombre] = useState('');
  const [nuevoGrupo, setNuevoGrupo] = useState<GrupoMuscular>('pecho');
  const [creandoEjercicio, setCreandoEjercicio] = useState(false);

  const [guardando, setGuardando] = useState(false);

  // Margen superior para el modal de ejercicios
  const margenSuperiorModal =
    Math.max(insets.top, Platform.OS === 'android' ? (StatusBar.currentHeight ?? 44) : 52) +
    spacing.md;

  // Carga inicial: perfil, rutina y precarga de anteriores con Promise.all
  useEffect(() => {
    (async () => {
      const p = await obtenerPerfilLocal();
      if (!p) return;
      setUsuarioId(p.id);

      if (rutinaGimnasioId) {
        const rg = await obtenerRutinaGimnasio(rutinaGimnasioId);
        if (rg) {
          setNombreRutina(rg.nombre);

          // Precarga en paralelo de todas las series anteriores para cero latencia
          const mapa = new Map<string, SeriePreviaEjercicio[]>();
          await Promise.all(
            rg.ejercicios.map(async (ej) => {
              try {
                const prev = await obtenerSeriesPreviasPorEjercicio(p.id, ej.id);
                if (prev.length > 0) mapa.set(ej.id, prev);
              } catch (err) {
                console.error('Error al precargar series previas de', ej.nombre, err);
              }
            }),
          );
          setReferenciasPrevias(mapa);

          const inicial: EjercicioEnSesion[] = rg.ejercicios.map((ej) => {
            const previas = mapa.get(ej.id) ?? [];
            const cantSeries = Math.max(3, previas.length);
            const series: SerieBorrador[] = [];

            for (let i = 0; i < cantSeries; i++) {
              const pSerie = previas[i];
              if (pSerie) {
                series.push(crearSerieBorrador(pSerie.repeticiones, pSerie.peso_kg, false));
              } else {
                series.push(crearSerieBorrador(10, null, false));
              }
            }

            return { ejercicio: ej, series };
          });

          setEjerciciosSesion(inicial);

          // Desplegar el primer ejercicio y enfocar su primera serie
          if (inicial.length > 0) {
            const primerEj = inicial[0];
            setEjercicioExpandidoId(primerEj.ejercicio.id);
            if (primerEj.series.length > 0) {
              setSerieActiva({
                ejercicioId: primerEj.ejercicio.id,
                serieId: primerEj.series[0].id,
              });
              const esCorp = esEjercicioCorporal(primerEj.ejercicio, mapa.get(primerEj.ejercicio.id));
              setCampoActivo(esCorp ? 'reps' : 'kg');
            }
          }
        }
      }
    })().catch(console.error);
  }, [rutinaGimnasioId]);

  // Cargar catalogo al abrir el buscador
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

  // Metricas de avance
  const totalEjercicios = ejerciciosSesion.length;
  const ejerciciosCompletados = useMemo(() => {
    return ejerciciosSesion.filter(
      (item) => item.series.length > 0 && item.series.every((s) => s.confirmada),
    ).length;
  }, [ejerciciosSesion]);

  const progresoRatio = totalEjercicios > 0 ? ejerciciosCompletados / totalEjercicios : 0;

  // Agregar ejercicio desde catalogo
  const seleccionarEjercicio = async (ej: EjercicioRow) => {
    setModalBuscador(false);
    setBusqueda('');
    setCreandoEjercicio(false);
    setNuevoNombre('');

    let previas: SeriePreviaEjercicio[] = referenciasPrevias.get(ej.id) ?? [];
    if (usuarioId && !referenciasPrevias.has(ej.id)) {
      try {
        previas = await obtenerSeriesPreviasPorEjercicio(usuarioId, ej.id);
        if (previas.length > 0) {
          setReferenciasPrevias((m) => new Map(m).set(ej.id, previas));
        }
      } catch (e) {
        console.error('Error al cargar referencia previa:', e);
      }
    }

    const cantSeries = Math.max(3, previas.length);
    const nuevasSeries: SerieBorrador[] = [];
    for (let i = 0; i < cantSeries; i++) {
      const p = previas[i];
      if (p) {
        nuevasSeries.push(crearSerieBorrador(p.repeticiones, p.peso_kg, false));
      } else {
        nuevasSeries.push(crearSerieBorrador(10, null, false));
      }
    }

    const nuevoItem: EjercicioEnSesion = {
      ejercicio: ej,
      series: nuevasSeries,
    };

    setEjerciciosSesion((prev) => [...prev, nuevoItem]);
    setEjercicioExpandidoId(ej.id);
    if (nuevasSeries.length > 0) {
      setSerieActiva({ ejercicioId: ej.id, serieId: nuevasSeries[0].id });
      setCampoActivo(esEjercicioCorporal(ej, previas) ? 'reps' : 'kg');
    }
  };

  // Guardar nuevo ejercicio en catalogo
  const guardarNuevoEjercicio = async () => {
    const nombre = nuevoNombre.trim();
    if (!nombre) {
      Alert.alert('Nombre requerido', 'Ingresa el nombre del ejercicio.');
      return;
    }

    try {
      const creado = await crearEjercicio({
        id: randomUUID(),
        nombre,
        grupo: nuevoGrupo,
      });
      setNuevoNombre('');
      setCreandoEjercicio(false);
      await seleccionarEjercicio(creado);
    } catch (e) {
      console.error('Error al crear ejercicio:', e);
      Alert.alert('Error', 'No se pudo crear el ejercicio.');
    }
  };

  // Alternar acordeon de ejercicio
  const toggleAcordeon = (ejercicioId: string) => {
    if (ejercicioExpandidoId === ejercicioId) {
      setEjercicioExpandidoId(null);
      setSerieActiva(null);
    } else {
      setEjercicioExpandidoId(ejercicioId);
      const item = ejerciciosSesion.find((e) => e.ejercicio.id === ejercicioId);
      if (item && item.series.length > 0) {
        // Al abrir un ejercicio, enfocar la primera serie pendiente si existe
        const pendiente = item.series.find((s) => !s.confirmada) ?? null;
        if (pendiente) {
          setSerieActiva({ ejercicioId, serieId: pendiente.id });
          const esCorp = esEjercicioCorporal(item.ejercicio, referenciasPrevias.get(ejercicioId));
          setCampoActivo(esCorp ? 'reps' : 'kg');
        } else {
          // Si todas estan confirmadas, no abrir el keypad hasta que toque explicitamente
          setSerieActiva(null);
        }
      }
    }
  };

  // Agregar serie al ejercicio
  const agregarSerie = (ejercicioId: string) => {
    let nuevaId = '';
    setEjerciciosSesion((prev) =>
      prev.map((item) => {
        if (item.ejercicio.id !== ejercicioId) return item;
        const ultima = item.series[item.series.length - 1];
        const nueva = crearSerieBorrador(
          ultima ? ultima.repeticiones : 10,
          ultima ? ultima.pesoKg : null,
          false,
        );
        nuevaId = nueva.id;
        return { ...item, series: [...item.series, nueva] };
      }),
    );
    if (nuevaId) {
      setSerieActiva({ ejercicioId, serieId: nuevaId });
      const item = ejerciciosSesion.find((e) => e.ejercicio.id === ejercicioId);
      if (item) {
        const esCorp = esEjercicioCorporal(item.ejercicio, referenciasPrevias.get(ejercicioId));
        setCampoActivo(esCorp ? 'reps' : 'kg');
      }
    }
  };

  // Quitar ejercicio
  const quitarEjercicio = (ejercicioId: string) => {
    setEjerciciosSesion((prev) => prev.filter((item) => item.ejercicio.id !== ejercicioId));
    if (ejercicioExpandidoId === ejercicioId) {
      setEjercicioExpandidoId(null);
      setSerieActiva(null);
    }
  };

  // ---------------------------------------------------------------------------
  // Logica de Keypad y Edicion
  // ---------------------------------------------------------------------------

  const itemActivo = useMemo(
    () => ejerciciosSesion.find((item) => item.ejercicio.id === serieActiva?.ejercicioId),
    [ejerciciosSesion, serieActiva],
  );

  const serieActivaObj = useMemo(
    () => itemActivo?.series.find((s) => s.id === serieActiva?.serieId),
    [itemActivo, serieActiva],
  );

  const serieActivaNumero = useMemo(() => {
    if (!itemActivo || !serieActiva) return 1;
    const idx = itemActivo.series.findIndex((s) => s.id === serieActiva.serieId);
    return idx >= 0 ? idx + 1 : 1;
  }, [itemActivo, serieActiva]);

  // Si la serie en edicion ya estaba confirmada (modo correccion)
  const esModoCorreccion = !!serieActivaObj?.confirmada;

  // Modificar valores de la serie activa
  const actualizarSerieActiva = (
    updater: (s: SerieBorrador) => Partial<SerieBorrador>,
  ) => {
    if (!serieActiva) return;
    setEjerciciosSesion((prev) =>
      prev.map((item) => {
        if (item.ejercicio.id !== serieActiva.ejercicioId) return item;
        return {
          ...item,
          series: item.series.map((s) => {
            if (s.id !== serieActiva.serieId) return s;
            const cambios = updater(s);
            return { ...s, ...cambios };
          }),
        };
      }),
    );
  };

  // Digitar en el keypad
  const handleDigito = (digito: string) => {
    if (!serieActivaObj) return;

    if (campoActivo === 'kg') {
      let nuevoTexto = (serieActivaObj.textoPeso || '') + digito;
      if (nuevoTexto.startsWith('.')) nuevoTexto = '0' + nuevoTexto;
      if ((nuevoTexto.match(/\./g) || []).length > 1) return;
      const parsed = parseFloat(nuevoTexto);
      if (!isNaN(parsed) && parsed > 999) return;

      actualizarSerieActiva(() => ({
        textoPeso: nuevoTexto,
        pesoKg: isNaN(parsed) ? null : parsed,
      }));
    } else {
      if (digito === '.') return;
      const nuevoTexto = (serieActivaObj.textoRepes || '') + digito;
      const parsed = parseInt(nuevoTexto, 10);
      if (!isNaN(parsed) && parsed > 999) return;

      actualizarSerieActiva(() => ({
        textoRepes: nuevoTexto,
        repeticiones: isNaN(parsed) || parsed <= 0 ? 1 : parsed,
      }));
    }
  };

  // Borrar ultimo digito
  const handleBorrar = () => {
    if (!serieActivaObj) return;

    if (campoActivo === 'kg') {
      const actual = serieActivaObj.textoPeso || '';
      const nuevoTexto = actual.slice(0, -1);
      const parsed = parseFloat(nuevoTexto);
      actualizarSerieActiva(() => ({
        textoPeso: nuevoTexto,
        pesoKg: nuevoTexto.trim() === '' || isNaN(parsed) ? null : parsed,
      }));
    } else {
      const actual = serieActivaObj.textoRepes || '';
      const nuevoTexto = actual.slice(0, -1);
      const parsed = parseInt(nuevoTexto, 10);
      actualizarSerieActiva(() => ({
        textoRepes: nuevoTexto,
        repeticiones: isNaN(parsed) || parsed <= 0 ? 0 : parsed,
      }));
    }
  };

  // Atajos de incremento de disco (+1.25, +2.5, +5)
  const handleIncremento = (deltaKg: number) => {
    if (!serieActivaObj) return;
    const actual = serieActivaObj.pesoKg ?? 0;
    const nuevo = Math.round((actual + deltaKg) * 100) / 100;
    setCampoActivo('kg');
    actualizarSerieActiva(() => ({
      pesoKg: nuevo,
      textoPeso: String(nuevo),
    }));
  };

  // Atajo para peso corporal
  const handleCorporal = () => {
    if (!serieActivaObj) return;
    actualizarSerieActiva(() => ({
      pesoKg: null,
      textoPeso: '',
    }));
    setCampoActivo('reps');
  };

  // Confirmar serie activa con auto-avance o guardar correccion
  const handleConfirmarSerie = () => {
    if (!serieActiva || !itemActivo || !serieActivaObj) return;

    const estabaConfirmada = serieActivaObj.confirmada;

    // Actualizar y confirmar la serie
    actualizarSerieActiva((s) => ({
      confirmada: true,
      repeticiones: s.repeticiones > 0 ? s.repeticiones : 10,
    }));

    // CASO CORRECCION: Si se estaba corrigiendo una serie ya completada,
    // no avanzar ciegamente: buscar si queda alguna serie pendiente real
    if (estabaConfirmada) {
      // Buscar siguiente serie pendiente en este u otro ejercicio
      let siguientePendiente: { ejId: string; serieId: string; esCorp: boolean } | null = null;
      for (const ejItem of ejerciciosSesion) {
        const pendiente = ejItem.series.find((s) => !s.confirmada && s.id !== serieActiva.serieId);
        if (pendiente) {
          siguientePendiente = {
            ejId: ejItem.ejercicio.id,
            serieId: pendiente.id,
            esCorp: esEjercicioCorporal(ejItem.ejercicio, referenciasPrevias.get(ejItem.ejercicio.id)),
          };
          break;
        }
      }

      if (siguientePendiente) {
        setEjercicioExpandidoId(siguientePendiente.ejId);
        setSerieActiva({ ejercicioId: siguientePendiente.ejId, serieId: siguientePendiente.serieId });
        setCampoActivo(siguientePendiente.esCorp ? 'reps' : 'kg');
      } else {
        // No hay pendientes: cerrar keypad limpiamente
        setSerieActiva(null);
      }
      return;
    }

    // CASO SERIE PENDIENTE NUEVA: Auto-avance progresivo
    const ejIdx = ejerciciosSesion.findIndex((e) => e.ejercicio.id === serieActiva.ejercicioId);
    if (ejIdx < 0) return;

    const seriesDelEj = ejerciciosSesion[ejIdx].series;
    const serieIdx = seriesDelEj.findIndex((s) => s.id === serieActiva.serieId);

    // 1. Hay siguiente serie en este mismo ejercicio?
    if (serieIdx >= 0 && serieIdx < seriesDelEj.length - 1) {
      const prox = seriesDelEj[serieIdx + 1];
      setSerieActiva({
        ejercicioId: serieActiva.ejercicioId,
        serieId: prox.id,
      });
      const esCorp = esEjercicioCorporal(
        itemActivo.ejercicio,
        referenciasPrevias.get(itemActivo.ejercicio.id),
      );
      setCampoActivo(esCorp ? 'reps' : 'kg');
      return;
    }

    // 2. Era la ultima serie de este ejercicio. Buscar siguiente ejercicio con series incompletas:
    let proxEjercicio: EjercicioEnSesion | null = null;
    for (let i = ejIdx + 1; i < ejerciciosSesion.length; i++) {
      if (ejerciciosSesion[i].series.some((s) => !s.confirmada)) {
        proxEjercicio = ejerciciosSesion[i];
        break;
      }
    }
    if (!proxEjercicio) {
      for (let i = 0; i < ejIdx; i++) {
        if (ejerciciosSesion[i].series.some((s) => !s.confirmada)) {
          proxEjercicio = ejerciciosSesion[i];
          break;
        }
      }
    }

    if (proxEjercicio) {
      const proxEjId = proxEjercicio.ejercicio.id;
      setEjercicioExpandidoId(proxEjId);
      const primeraPendiente =
        proxEjercicio.series.find((s) => !s.confirmada) ?? proxEjercicio.series[0];
      setSerieActiva({
        ejercicioId: proxEjId,
        serieId: primeraPendiente.id,
      });
      const esCorp = esEjercicioCorporal(
        proxEjercicio.ejercicio,
        referenciasPrevias.get(proxEjId),
      );
      setCampoActivo(esCorp ? 'reps' : 'kg');

      // Scroll suave hacia el nuevo ejercicio recien desplegado
      setTimeout(() => {
        const posY = posicionesY.current[proxEjId];
        if (posY !== undefined && scrollRef.current) {
          scrollRef.current.scrollTo({ y: Math.max(0, posY - spacing.sm), animated: true });
        }
      }, 70);
    } else {
      // Caso limite: completada la ultima serie del ultimo ejercicio.
      // Colapsar todo, cerrar keypad y dejar visible "Finalizar".
      setEjercicioExpandidoId(null);
      setSerieActiva(null);
    }
  };

  // ---------------------------------------------------------------------------
  // Guardar y Salir
  // ---------------------------------------------------------------------------

  const finalizarSesion = async () => {
    if (guardando) return;

    const listaSeriesPlana = ejerciciosSesion.flatMap((item) =>
      item.series
        .filter((s) => s.repeticiones > 0)
        .map((s) => ({
          ejercicioId: item.ejercicio.id,
          repeticiones: s.repeticiones,
          pesoKg: s.pesoKg,
        })),
    );

    if (listaSeriesPlana.length === 0) {
      Alert.alert('Sesión vacía', 'Completá al menos una serie antes de finalizar.');
      return;
    }

    if (!usuarioId) {
      Alert.alert('Error', 'No se encontró el perfil.');
      return;
    }

    const seriesIncompletas = ejerciciosSesion.some((e) => e.series.some((s) => !s.confirmada));

    const procederGuardar = async () => {
      setGuardando(true);
      try {
        const duracionRealSeg = Math.max(1, Math.floor((Date.now() - inicioMs) / 1000));
        await guardarRutinaTerminada({
          usuarioId,
          inicio: new Date(inicioMs),
          duracionRealSeg,
          series: listaSeriesPlana,
          rutinaGimnasioId: rutinaGimnasioId ?? null,
          eventoIdExistente: eventoId ?? null,
          nombreRutina,
        });

        router.back();
      } catch (e) {
        console.error('Error al guardar rutina:', e);
        Alert.alert('Error', 'No se pudo guardar la rutina.');
      } finally {
        setGuardando(false);
      }
    };

    if (seriesIncompletas) {
      Alert.alert(
        'Finalizar entrenamiento',
        'Tenés series pendientes de confirmar. ¿Deseás guardar el entrenamiento con las series realizadas?',
        [
          { text: 'Seguir entrenando', style: 'cancel' },
          { text: 'Finalizar', onPress: procederGuardar },
        ],
      );
    } else {
      await procederGuardar();
    }
  };

  const salir = () => {
    const hayDatos = ejerciciosSesion.some((e) => e.series.some((s) => s.confirmada));
    if (hayDatos) {
      Alert.alert('Descartar sesión', '¿Seguro que querés salir sin guardar?', [
        { text: 'Continuar entrenando', style: 'cancel' },
        { text: 'Descartar', style: 'destructive', onPress: () => router.back() },
      ]);
    } else {
      router.back();
    }
  };

  return (
    <View style={estilos.contenedorPrincipal}>
      {/* 1. Header fijo */}
      <View style={[estilos.headerFijo, { paddingTop: insets.top + spacing.xs }]}>
        <View style={estilos.headerTopFila}>
          <Pressable onPress={salir} hitSlop={12} style={estilos.botonVolver}>
            <Ionicons name="arrow-back" size={20} color={colors.textPrimary} />
          </Pressable>

          <View style={estilos.headerTituloContenedor}>
            <Text style={estilos.headerTitulo} numberOfLines={1}>
              {nombreRutina ?? 'Rutina libre'}
            </Text>
            <Text style={estilos.headerSubtitulo}>
              {ejerciciosCompletados} de {totalEjercicios} ejercicios completados
            </Text>
          </View>

          <Pressable
            style={[estilos.botonFinalizar, guardando && estilos.botonFinalizarDeshabilitado]}
            onPress={finalizarSesion}
            disabled={guardando}
          >
            <Text style={estilos.botonFinalizarTexto}>
              {guardando ? 'Guardando...' : 'Finalizar'}
            </Text>
          </Pressable>
        </View>

        {/* Barra horizontal de progreso */}
        <View style={estilos.barraFondo}>
          <View style={[estilos.barraRelleno, { width: `${Math.round(progresoRatio * 100)}%` }]} />
        </View>
      </View>

      {/* 2. Scroll de lista de ejercicios */}
      <ScrollView
        ref={scrollRef}
        style={estilos.scrollArea}
        contentContainerStyle={[
          estilos.scrollContenido,
          { paddingBottom: serieActiva ? 380 : spacing.xxxl },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {ejerciciosSesion.length === 0 ? (
          <View style={estilos.cardVacia}>
            <Ionicons name="barbell-outline" size={36} color={colors.textMuted} />
            <Text style={estilos.cardVaciaTitulo}>Rutina sin ejercicios</Text>
            <Text style={estilos.cardVaciaTexto}>
              Tocá "+ Agregar ejercicio" para comenzar a armar tu sesión.
            </Text>
          </View>
        ) : (
          ejerciciosSesion.map((item) => {
            const ejId = item.ejercicio.id;
            const expandido = ejercicioExpandidoId === ejId;
            const previas = referenciasPrevias.get(ejId) ?? [];
            const pendientes = item.series.filter((s) => !s.confirmada).length;
            const completado = item.series.length > 0 && pendientes === 0;

            return (
              <View
                key={ejId}
                style={[
                  estilos.acordeonCard,
                  expandido && estilos.acordeonCardExpandido,
                ]}
                onLayout={(e) => {
                  posicionesY.current[ejId] = e.nativeEvent.layout.y;
                }}
              >
                {/* Cabecera del acordeon */}
                <Pressable
                  style={estilos.acordeonCabecera}
                  onPress={() => toggleAcordeon(ejId)}
                >
                  <View style={estilos.acordeonInfo}>
                    <Text style={estilos.acordeonTitulo}>{item.ejercicio.nombre}</Text>
                    {completado ? (
                      <View style={estilos.chipCompletado}>
                        <Ionicons name="checkmark-circle" size={14} color={colors.action} />
                        <Text style={estilos.chipCompletadoTexto}>Completado</Text>
                      </View>
                    ) : (
                      <View style={estilos.chipPendiente}>
                        <Text style={estilos.chipPendienteTexto}>
                          {pendientes} {pendientes === 1 ? 'serie pendiente' : 'series pendientes'}
                        </Text>
                      </View>
                    )}
                  </View>

                  <Ionicons
                    name={expandido ? 'chevron-up' : 'chevron-down'}
                    size={20}
                    color={colors.textSecondary}
                  />
                </Pressable>

                {/* Contenido desplegado: tabla de series */}
                {expandido && (
                  <View style={estilos.acordeonCuerpo}>
                    {/* Encabezado de la tabla */}
                    <View style={estilos.tablaEncabezado}>
                      <Text style={[estilos.tablaTh, estilos.colSerie]}>SERIE</Text>
                      <Text style={[estilos.tablaTh, estilos.colAnterior]}>ANTERIOR</Text>
                      <Text style={[estilos.tablaTh, estilos.colKg]}>KG</Text>
                      <Text style={[estilos.tablaTh, estilos.colReps]}>REPS</Text>
                      <Text style={[estilos.tablaTh, estilos.colEstado]}>ESTADO</Text>
                    </View>

                    {/* Filas de series */}
                    <View style={estilos.filasContenedor}>
                      {item.series.map((s, sIdx) => {
                        const esActiva =
                          serieActiva?.ejercicioId === ejId && serieActiva?.serieId === s.id;
                        const prev = previas[sIdx];

                        let textoAnterior = '—';
                        if (prev) {
                          if (prev.peso_kg !== null && prev.peso_kg > 0) {
                            textoAnterior = `${prev.peso_kg} × ${prev.repeticiones}`;
                          } else {
                            textoAnterior = `Corp × ${prev.repeticiones}`;
                          }
                        }

                        // Toque en fila: si esta confirmada, es solo lectura
                        const handlePressFila = (campoObjetivo?: 'kg' | 'reps') => {
                          if (s.confirmada) {
                            // Serie confirmada: no hace nada en toque simple para evitar ediciones accidentales
                            return;
                          }
                          setSerieActiva({ ejercicioId: ejId, serieId: s.id });
                          if (campoObjetivo) {
                            setCampoActivo(campoObjetivo);
                          } else if (esEjercicioCorporal(item.ejercicio, previas)) {
                            setCampoActivo('reps');
                          } else {
                            setCampoActivo('kg');
                          }
                        };

                        // Toque largo en serie confirmada: permite corregir
                        const handleLongPressConfirmada = () => {
                          setSerieActiva({ ejercicioId: ejId, serieId: s.id });
                          if (esEjercicioCorporal(item.ejercicio, previas)) {
                            setCampoActivo('reps');
                          } else {
                            setCampoActivo('kg');
                          }
                        };

                        // Toque en icono de estado
                        const handlePressEstado = () => {
                          if (s.confirmada) {
                            // Reabrir serie para corregir
                            setSerieActiva({ ejercicioId: ejId, serieId: s.id });
                            setEjerciciosSesion((prevArr) =>
                              prevArr.map((eIt) => {
                                if (eIt.ejercicio.id !== ejId) return eIt;
                                return {
                                  ...eIt,
                                  series: eIt.series.map((ser) =>
                                    ser.id === s.id ? { ...ser, confirmada: false } : ser,
                                  ),
                                };
                              }),
                            );
                            if (esEjercicioCorporal(item.ejercicio, previas)) {
                              setCampoActivo('reps');
                            } else {
                              setCampoActivo('kg');
                            }
                          } else {
                            // Confirmar de inmediato con los valores actuales
                            setEjerciciosSesion((prevArr) =>
                              prevArr.map((eIt) => {
                                if (eIt.ejercicio.id !== ejId) return eIt;
                                return {
                                  ...eIt,
                                  series: eIt.series.map((ser) =>
                                    ser.id === s.id ? { ...ser, confirmada: true } : ser,
                                  ),
                                };
                              }),
                            );
                          }
                        };

                        return (
                          <Pressable
                            key={s.id}
                            style={[
                              estilos.tablaFila,
                              s.confirmada && estilos.tablaFilaConfirmada,
                              esActiva && estilos.tablaFilaActiva,
                            ]}
                            onPress={() => handlePressFila()}
                            onLongPress={s.confirmada ? handleLongPressConfirmada : undefined}
                            delayLongPress={400}
                          >
                            {/* Columna Serie */}
                            <View style={estilos.colSerie}>
                              <Text
                                style={[
                                  estilos.serieTagTexto,
                                  esActiva && estilos.serieTagTextoActivo,
                                ]}
                              >
                                S{sIdx + 1}
                              </Text>
                            </View>

                            {/* Columna Anterior */}
                            <View style={estilos.colAnterior}>
                              <Text style={estilos.anteriorTexto} numberOfLines={1}>
                                {textoAnterior}
                              </Text>
                            </View>

                            {/* Columna Kg */}
                            <Pressable
                              style={[
                                estilos.colKg,
                                estilos.celdaInput,
                                s.confirmada && estilos.celdaInputConfirmada,
                                esActiva && campoActivo === 'kg' && estilos.celdaInputEnfocada,
                              ]}
                              onPress={() => handlePressFila('kg')}
                              onLongPress={s.confirmada ? handleLongPressConfirmada : undefined}
                            >
                              <Text
                                style={[
                                  estilos.valorTexto,
                                  esActiva && estilos.valorTextoActivo,
                                  s.pesoKg === null && estilos.valorTextoCorporal,
                                ]}
                                numberOfLines={1}
                              >
                                {s.pesoKg !== null && s.pesoKg > 0 ? `${s.pesoKg}` : 'Corporal'}
                              </Text>
                            </Pressable>

                            {/* Columna Reps */}
                            <Pressable
                              style={[
                                estilos.colReps,
                                estilos.celdaInput,
                                s.confirmada && estilos.celdaInputConfirmada,
                                esActiva && campoActivo === 'reps' && estilos.celdaInputEnfocada,
                              ]}
                              onPress={() => handlePressFila('reps')}
                              onLongPress={s.confirmada ? handleLongPressConfirmada : undefined}
                            >
                              <Text
                                style={[
                                  estilos.valorTexto,
                                  esActiva && estilos.valorTextoActivo,
                                ]}
                              >
                                {s.repeticiones}
                              </Text>
                            </Pressable>

                            {/* Columna Estado */}
                            <Pressable
                              style={estilos.colEstado}
                              onPress={handlePressEstado}
                              hitSlop={10}
                            >
                              {s.confirmada ? (
                                <Ionicons name="checkmark-circle" size={24} color={colors.action} />
                              ) : (
                                <View style={estilos.indicadorPendiente} />
                              )}
                            </Pressable>
                          </Pressable>
                        );
                      })}
                    </View>

                    {/* Acciones al pie del ejercicio */}
                    <View style={estilos.accionesPieEjercicio}>
                      <Pressable
                        style={estilos.botonAgregarSerie}
                        onPress={() => agregarSerie(ejId)}
                        hitSlop={8}
                      >
                        <Ionicons name="add" size={16} color={colors.action} />
                        <Text style={estilos.botonAgregarSerieTexto}>Agregar serie</Text>
                      </Pressable>

                      <Pressable
                        onPress={() => quitarEjercicio(ejId)}
                        hitSlop={8}
                        style={estilos.botonEliminarEjercicio}
                      >
                        <Text style={estilos.botonEliminarEjercicioTexto}>Quitar ejercicio</Text>
                      </Pressable>
                    </View>
                  </View>
                )}
              </View>
            );
          })
        )}

        {/* Boton Agregar ejercicio al pie */}
        <Pressable
          style={estilos.botonAgregarEjercicio}
          onPress={() => setModalBuscador(true)}
        >
          <Ionicons name="add-circle-outline" size={20} color={colors.action} />
          <Text style={estilos.botonAgregarEjercicioTexto}>Agregar ejercicio</Text>
        </Pressable>
      </ScrollView>

      {/* 3. Keypad numerico integrado al pie */}
      {serieActiva && (
        <View style={[estilos.keypadContenedor, { paddingBottom: Math.max(insets.bottom, 14) }]}>
          {/* Fila de contexto y selector de campo */}
          <View style={estilos.keypadFilaContexto}>
            <View style={estilos.keypadContextoInfo}>
              <Text style={estilos.keypadContextoTitulo}>
                {esModoCorreccion
                  ? `Corrigiendo: S${serieActivaNumero} · ${itemActivo?.ejercicio.nombre}`
                  : `Serie ${serieActivaNumero} · ${itemActivo?.ejercicio.nombre}`}
              </Text>
              <Text style={estilos.keypadContextoSub}>
                {esModoCorreccion
                  ? 'Modificando serie completada'
                  : campoActivo === 'kg'
                  ? 'Editando peso en kg'
                  : 'Editando repeticiones'}
              </Text>
            </View>

            {/* Switch Kg / Reps */}
            <View style={estilos.switchPill}>
              <Pressable
                style={[
                  estilos.switchBoton,
                  campoActivo === 'kg' && estilos.switchBotonActivo,
                ]}
                onPress={() => setCampoActivo('kg')}
              >
                <Text
                  style={[
                    estilos.switchBotonTexto,
                    campoActivo === 'kg' && estilos.switchBotonTextoActivo,
                  ]}
                >
                  Kg
                </Text>
              </Pressable>
              <Pressable
                style={[
                  estilos.switchBoton,
                  campoActivo === 'reps' && estilos.switchBotonActivo,
                ]}
                onPress={() => setCampoActivo('reps')}
              >
                <Text
                  style={[
                    estilos.switchBotonTexto,
                    campoActivo === 'reps' && estilos.switchBotonTextoActivo,
                  ]}
                >
                  Reps
                </Text>
              </Pressable>
            </View>
          </View>

          {/* Atajos rapidos de peso (+1.25, +2.5, +5, Corporal) */}
          <View style={estilos.keypadFilaAtajos}>
            <Pressable
              style={estilos.atajoBoton}
              onPress={() => handleIncremento(1.25)}
            >
              <Text style={estilos.atajoTexto}>+1.25</Text>
            </Pressable>
            <Pressable
              style={estilos.atajoBoton}
              onPress={() => handleIncremento(2.5)}
            >
              <Text style={estilos.atajoTexto}>+2.5</Text>
            </Pressable>
            <Pressable
              style={estilos.atajoBoton}
              onPress={() => handleIncremento(5)}
            >
              <Text style={estilos.atajoTexto}>+5</Text>
            </Pressable>
            <Pressable
              style={[
                estilos.atajoBoton,
                serieActivaObj?.pesoKg === null && estilos.atajoBotonCorporalActivo,
              ]}
              onPress={handleCorporal}
            >
              <Text
                style={[
                  estilos.atajoTexto,
                  serieActivaObj?.pesoKg === null && estilos.atajoTextoCorporalActivo,
                ]}
              >
                Corporal
              </Text>
            </Pressable>
          </View>

          {/* Grilla 3x4 del teclado numerico */}
          <View style={estilos.tecladoGrilla}>
            <View style={estilos.tecladoFila}>
              {['1', '2', '3'].map((d) => (
                <Pressable
                  key={d}
                  style={({ pressed }) => [estilos.tecla, pressed && estilos.teclaPresionada]}
                  onPress={() => handleDigito(d)}
                >
                  <Text style={estilos.teclaTexto}>{d}</Text>
                </Pressable>
              ))}
            </View>
            <View style={estilos.tecladoFila}>
              {['4', '5', '6'].map((d) => (
                <Pressable
                  key={d}
                  style={({ pressed }) => [estilos.tecla, pressed && estilos.teclaPresionada]}
                  onPress={() => handleDigito(d)}
                >
                  <Text style={estilos.teclaTexto}>{d}</Text>
                </Pressable>
              ))}
            </View>
            <View style={estilos.tecladoFila}>
              {['7', '8', '9'].map((d) => (
                <Pressable
                  key={d}
                  style={({ pressed }) => [estilos.tecla, pressed && estilos.teclaPresionada]}
                  onPress={() => handleDigito(d)}
                >
                  <Text style={estilos.teclaTexto}>{d}</Text>
                </Pressable>
              ))}
            </View>
            <View style={estilos.tecladoFila}>
              <Pressable
                style={({ pressed }) => [estilos.tecla, pressed && estilos.teclaPresionada]}
                onPress={() => handleDigito('.')}
              >
                <Text style={estilos.teclaTexto}>.</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [estilos.tecla, pressed && estilos.teclaPresionada]}
                onPress={() => handleDigito('0')}
              >
                <Text style={estilos.teclaTexto}>0</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  estilos.tecla,
                  estilos.teclaBorrar,
                  pressed && estilos.teclaPresionada,
                ]}
                onPress={handleBorrar}
              >
                <Ionicons name="backspace-outline" size={22} color={colors.textPrimary} />
              </Pressable>
            </View>
          </View>

          {/* Boton Confirmar serie / Guardar correccion */}
          <Pressable
            style={({ pressed }) => [
              estilos.botonConfirmar,
              pressed && estilos.botonConfirmarPresionado,
            ]}
            onPress={handleConfirmarSerie}
          >
            <Text style={estilos.botonConfirmarTexto}>
              {esModoCorreccion ? 'Guardar corrección' : 'Confirmar serie'}
            </Text>
            <Ionicons
              name={esModoCorreccion ? 'checkmark' : 'arrow-forward'}
              size={18}
              color={colors.textOnAction}
            />
          </Pressable>
        </View>
      )}

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
              <Pressable
                onPress={() => {
                  setNuevoNombre(busqueda);
                  setCreandoEjercicio(true);
                }}
                hitSlop={8}
              >
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
            <ScrollView
              contentContainerStyle={estilos.resultadosLista}
              keyboardShouldPersistTaps="handled"
            >
              {catalogo.length === 0 ? (
                <View style={estilos.vacioResultados}>
                  <Text style={estilos.detalle}>No se encontraron ejercicios.</Text>
                  <Pressable
                    style={estilos.botonCrearDesdeVacio}
                    onPress={() => {
                      setNuevoNombre(busqueda.trim());
                      setCreandoEjercicio(true);
                    }}
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
    </View>
  );
}

// ---------------------------------------------------------------------------
// Estilos
// ---------------------------------------------------------------------------

const estilos = StyleSheet.create({
  contenedorPrincipal: {
    flex: 1,
    backgroundColor: colors.bg,
  },

  // 1. Header fijo
  headerFijo: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    ...shadow.card,
    zIndex: 10,
  },
  headerTopFila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  botonVolver: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTituloContenedor: {
    flex: 1,
  },
  headerTitulo: {
    fontSize: fontSize.body,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  headerSubtitulo: {
    fontSize: fontSize.caption,
    color: colors.textSecondary,
    marginTop: 1,
  },
  botonFinalizar: {
    backgroundColor: colors.action,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
  },
  botonFinalizarDeshabilitado: {
    opacity: 0.6,
  },
  botonFinalizarTexto: {
    fontSize: fontSize.small,
    fontWeight: '600',
    color: colors.textOnAction,
  },
  barraFondo: {
    height: 4,
    backgroundColor: colors.surfaceAlt,
    borderRadius: 2,
    overflow: 'hidden',
    marginTop: spacing.xs,
  },
  barraRelleno: {
    height: '100%',
    backgroundColor: colors.action,
  },

  // 2. Scroll de ejercicios
  scrollArea: {
    flex: 1,
  },
  scrollContenido: {
    padding: spacing.md,
    gap: spacing.md,
  },
  acordeonCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    ...shadow.card,
  },
  acordeonCardExpandido: {
    borderColor: colors.borderStrong,
    borderWidth: 1.5,
  },
  acordeonCabecera: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    backgroundColor: colors.surface,
  },
  acordeonInfo: {
    flex: 1,
    gap: 4,
  },
  acordeonTitulo: {
    fontSize: fontSize.body,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  chipPendiente: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  chipPendienteTexto: {
    fontSize: fontSize.caption,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  chipCompletado: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  chipCompletadoTexto: {
    fontSize: fontSize.caption,
    color: colors.action,
    fontWeight: '600',
  },
  acordeonCuerpo: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    padding: spacing.md,
    backgroundColor: colors.surface,
  },

  // Tabla de series
  tablaEncabezado: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    marginBottom: spacing.xs,
  },
  tablaTh: {
    fontSize: fontSize.caption,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  colSerie: {
    width: 40,
    alignItems: 'center',
  },
  colAnterior: {
    width: 95,
    paddingRight: spacing.sm,
    marginRight: spacing.xs,
  },
  colKg: {
    flex: 1,
    minWidth: 72,
    marginRight: spacing.xs,
  },
  colReps: {
    width: 60,
    marginRight: spacing.xs,
  },
  colEstado: {
    width: 38,
    alignItems: 'center',
  },

  filasContenedor: {
    gap: 6,
    paddingVertical: 4,
  },
  tablaFila: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  tablaFilaConfirmada: {
    backgroundColor: colors.surfaceAlt,
    opacity: 0.88,
  },
  tablaFilaActiva: {
    backgroundColor: colors.accentSoft,
    borderWidth: 2,
    borderColor: colors.action,
    paddingVertical: 7,
  },
  serieTagTexto: {
    fontSize: fontSize.caption,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  serieTagTextoActivo: {
    color: colors.action,
  },
  anteriorTexto: {
    fontSize: fontSize.caption,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  celdaInput: {
    height: 40,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.sm,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  celdaInputConfirmada: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
  },
  celdaInputEnfocada: {
    borderColor: colors.action,
    borderWidth: 1.5,
    backgroundColor: colors.surface,
  },
  valorTexto: {
    fontSize: fontSize.body,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  valorTextoActivo: {
    fontWeight: '700',
    color: colors.textPrimary,
  },
  valorTextoCorporal: {
    fontSize: fontSize.caption,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  indicadorPendiente: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
  },
  accionesPieEjercicio: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.md,
    paddingTop: spacing.xs,
  },
  botonAgregarSerie: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: spacing.xs,
  },
  botonAgregarSerieTexto: {
    fontSize: fontSize.small,
    fontWeight: '600',
    color: colors.action,
  },
  botonEliminarEjercicio: {
    paddingVertical: 6,
    paddingHorizontal: spacing.xs,
  },
  botonEliminarEjercicioTexto: {
    fontSize: fontSize.caption,
    color: colors.danger,
  },

  botonAgregarEjercicio: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    borderStyle: 'dashed',
    marginTop: spacing.xs,
  },
  botonAgregarEjercicioTexto: {
    fontSize: fontSize.body,
    fontWeight: '600',
    color: colors.action,
  },

  cardVacia: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    ...shadow.card,
  },
  cardVaciaTitulo: {
    fontSize: fontSize.body,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  cardVaciaTexto: {
    fontSize: fontSize.small,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: lineHeight.small,
  },

  // 3. Keypad integrado al pie
  keypadContenedor: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderTopWidth: 2,
    borderTopColor: colors.borderStrong,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    ...shadow.sheet,
    zIndex: 100,
  },
  keypadFilaContexto: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  keypadContextoInfo: {
    flex: 1,
    paddingRight: spacing.sm,
  },
  keypadContextoTitulo: {
    fontSize: fontSize.small,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  keypadContextoSub: {
    fontSize: fontSize.caption,
    color: colors.textSecondary,
  },
  switchPill: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.pill,
    padding: 2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  switchBoton: {
    paddingVertical: 5,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
  },
  switchBotonActivo: {
    backgroundColor: colors.action,
  },
  switchBotonTexto: {
    fontSize: fontSize.small,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  switchBotonTextoActivo: {
    color: colors.textOnAction,
  },

  keypadFilaAtajos: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  atajoBoton: {
    flex: 1,
    height: 36,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.sm,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  atajoTexto: {
    fontSize: fontSize.small,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  atajoBotonCorporalActivo: {
    backgroundColor: colors.action,
    borderColor: colors.action,
  },
  atajoTextoCorporalActivo: {
    color: colors.textOnAction,
  },

  tecladoGrilla: {
    gap: 6,
    marginBottom: spacing.sm,
  },
  tecladoFila: {
    flexDirection: 'row',
    gap: 6,
  },
  tecla: {
    flex: 1,
    height: 50,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  teclaPresionada: {
    opacity: 0.6,
  },
  teclaTexto: {
    fontSize: 22,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  teclaBorrar: {
    backgroundColor: colors.border,
  },

  botonConfirmar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    height: 50,
    backgroundColor: colors.action,
    borderRadius: radius.md,
  },
  botonConfirmarPresionado: {
    opacity: 0.85,
  },
  botonConfirmarTexto: {
    fontSize: fontSize.body,
    fontWeight: '700',
    color: colors.textOnAction,
  },

  flex: {
    flex: 1,
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
