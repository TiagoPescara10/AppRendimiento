// app/evento/rutina.tsx
//
// Pantalla de carga y ejecucion de sesion de gimnasio.
// Disenada para operar con una sola mano y minima friccion durante el entrenamiento:
// - Header con barra de progreso y boton "Finalizar".
// - Lista de ejercicios en acordeon con separacion clara entre tarjetas.
// - Tabla de series con columnas: Serie | Anterior | Kg | Reps | Estado. Los
//   ejercicios por tiempo cambian Kg y Reps por una sola columna Tiempo (m:ss),
//   con peso opcional detras de "+ peso".
// - Series confirmadas protegidas como solo lectura (toque simple no las reabre;
//   requiere onLongPress o tocar el icono de check para corregir).
// - Fila en edicion con alto contraste (borde 2px action, fondo acentuado).
// - Scroll suave automatico al saltar al siguiente ejercicio.
// - Keypad numerico tactil integrado al pie con shadow.sheet y atajos rapidos (+1.25, +2.5, +5, Corporal).
// - Sin timers de descanso. El unico cronometro es el de las series por tiempo
//   (plancha, cardio): cuenta hacia arriba mientras se hace el ejercicio y al
//   parar carga el tiempo en la serie. Ver useCronometroSerie.ts.

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
import { cargarNivel } from '@/features/nivel/api';
import type { DatosNivel } from '@/features/nivel/api';
import { GananciaXP } from '@/features/nivel/components/GananciaXP';
import { textoSeriesEjercicio } from '@/lib/fuerza';
import {
  digitosDeDuracion,
  leerDigitosTiempo,
  MAX_DIGITOS_TIEMPO,
  textoDuracion,
} from '@/lib/duracion';
import { useCronometroSerie } from '@/features/entrenamiento/useCronometroSerie';
import { Pantalla } from '@/ui/Pantalla';
import { Boton } from '@/ui/Boton';
import { randomUUID } from '@/db/sync/uuid';
import type { BloqueRutina, EjercicioRow, GrupoMuscular, MedidaEjercicio } from '@/db/schema';

// ---------------------------------------------------------------------------
// Modelos locales
// ---------------------------------------------------------------------------

interface SerieBorrador {
  id: string;
  repeticiones: number;
  pesoKg: number | null;
  /** Solo en ejercicios por tiempo. null mientras no haya un tiempo valido. */
  duracionSeg: number | null;
  confirmada: boolean;
  textoRepes: string;
  textoPeso: string;
  /** Digitos crudos del campo Tiempo: "130" se lee 1:30. */
  textoTiempo: string;
  /** En una serie por tiempo, si se toco "+ peso". En las de reps no se usa. */
  conPeso: boolean;
}

function crearSerieBorrador(
  repeticiones = 10,
  pesoKg: number | null = null,
  confirmada = false,
  duracionSeg: number | null = null,
): SerieBorrador {
  return {
    id: randomUUID(),
    repeticiones,
    pesoKg,
    duracionSeg,
    confirmada,
    textoRepes: String(repeticiones),
    textoPeso: pesoKg !== null && pesoKg > 0 ? String(pesoKg) : '',
    textoTiempo: duracionSeg ? digitosDeDuracion(duracionSeg) : '',
    conPeso: pesoKg !== null && pesoKg > 0,
  };
}

/** La serie i de la sesion arranca con lo que se hizo la vez anterior. */
function serieDesdePrevia(previa: SeriePreviaEjercicio | undefined): SerieBorrador {
  if (!previa) return crearSerieBorrador(10, null, false);
  return crearSerieBorrador(previa.repeticiones ?? 10, previa.peso_kg, false, previa.duracion_seg);
}

/** La nueva serie copia a la ultima del ejercicio. */
function serieComoLaUltima(ultima: SerieBorrador | undefined): SerieBorrador {
  if (!ultima) return crearSerieBorrador(10, null, false);
  const nueva = crearSerieBorrador(ultima.repeticiones, ultima.pesoKg, false, ultima.duracionSeg);
  return { ...nueva, conPeso: ultima.conPeso };
}

function esPorTiempo(ejercicio: EjercicioRow): boolean {
  return ejercicio.medida === 'tiempo';
}

/** Una serie por tiempo sin tiempo valido no se puede confirmar ni guardar. */
function tiempoListo(s: SerieBorrador): boolean {
  return s.duracionSeg !== null && s.duracionSeg > 0 && leerDigitosTiempo(s.textoTiempo).valido;
}

/**
 * Las series que se guardan al finalizar: las de reps con repeticiones y las
 * por tiempo con un tiempo valido. Igual que antes, entran tambien las que
 * quedaron sin confirmar si tienen un valor (el aviso de pendientes lo dice).
 */
function seriesParaGuardar(item: EjercicioEnSesion): SerieBorrador[] {
  return esPorTiempo(item.ejercicio)
    ? item.series.filter(tiempoListo)
    : item.series.filter((s) => s.repeticiones > 0);
}

type Campo = 'kg' | 'reps' | 'tiempo';

interface EjercicioEnSesion {
  /**
   * Identifica la tarjeta: bloque + ejercicio. Con calentamiento el mismo
   * ejercicio puede estar en los dos bloques, asi que el id no alcanza.
   */
  clave: string;
  bloque: BloqueRutina;
  ejercicio: EjercicioRow;
  series: SerieBorrador[];
}

interface SeleccionSerie {
  /** EjercicioEnSesion.clave */
  clave: string;
  serieId: string;
}

function claveDe(bloque: BloqueRutina, ejercicioId: string): string {
  return `${bloque}:${ejercicioId}`;
}

const GRUPOS: { valor: GrupoMuscular | 'todos'; label: string }[] = [
  { valor: 'todos', label: 'Todos' },
  { valor: 'pecho', label: 'Pecho' },
  { valor: 'espalda', label: 'Espalda' },
  { valor: 'piernas', label: 'Piernas' },
  { valor: 'hombros', label: 'Hombros' },
  { valor: 'brazos', label: 'Brazos' },
  { valor: 'core', label: 'Core' },
  { valor: 'cardio', label: 'Cardio' },
];

const MEDIDAS: { valor: MedidaEjercicio; label: string }[] = [
  { valor: 'repeticiones', label: 'Repeticiones' },
  { valor: 'tiempo', label: 'Tiempo' },
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

/** En que campo arranca el teclado al abrir una serie de este ejercicio. */
function campoInicial(ejercicio: EjercicioRow, previas?: SeriePreviaEjercicio[]): Campo {
  if (esPorTiempo(ejercicio)) return 'tiempo';
  return esEjercicioCorporal(ejercicio, previas) ? 'reps' : 'kg';
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
  const [campoActivo, setCampoActivo] = useState<Campo>('kg');
  const cronometro = useCronometroSerie();

  // Modal buscador de ejercicios del catalogo
  const [modalBuscador, setModalBuscador] = useState(false);
  const [catalogo, setCatalogo] = useState<EjercicioRow[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [grupoFiltro, setGrupoFiltro] = useState<GrupoMuscular | 'todos'>('todos');

  // Modal alta de nuevo ejercicio
  const [nuevoNombre, setNuevoNombre] = useState('');
  const [nuevoGrupo, setNuevoGrupo] = useState<GrupoMuscular>('pecho');
  const [nuevaMedida, setNuevaMedida] = useState<MedidaEjercicio>('repeticiones');
  const [creandoEjercicio, setCreandoEjercicio] = useState(false);

  const [guardando, setGuardando] = useState(false);
  // Cierre de la sesion: se llena al guardar bien y cambia la pantalla. Es la
  // rutina tal como quedo guardada, ejercicio por ejercicio. El nivel llega
  // despues, releido con la sesion ya sumada.
  const [terminado, setTerminado] = useState<{ id: string; nombre: string; detalle: string }[] | null>(
    null,
  );
  const [nivel, setNivel] = useState<DatosNivel | null>(null);

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
                const prev = await obtenerSeriesPreviasPorEjercicio(
                  p.id,
                  ej.id,
                  undefined,
                  ej.bloque === 'calentamiento',
                );
                if (prev.length > 0) mapa.set(claveDe(ej.bloque, ej.id), prev);
              } catch (err) {
                console.error('Error al precargar series previas de', ej.nombre, err);
              }
            }),
          );
          setReferenciasPrevias(mapa);

          const inicial: EjercicioEnSesion[] = rg.ejercicios.map((ej) => {
            const clave = claveDe(ej.bloque, ej.id);
            const previas = mapa.get(clave) ?? [];
            const cantSeries = Math.max(3, previas.length);
            const series: SerieBorrador[] = [];

            for (let i = 0; i < cantSeries; i++) {
              series.push(serieDesdePrevia(previas[i]));
            }

            return { clave, bloque: ej.bloque, ejercicio: ej, series };
          });

          setEjerciciosSesion(inicial);

          // Desplegar el primer ejercicio y enfocar su primera serie
          if (inicial.length > 0) {
            const primerEj = inicial[0];
            setEjercicioExpandidoId(primerEj.clave);
            if (primerEj.series.length > 0) {
              setSerieActiva({
                clave: primerEj.clave,
                serieId: primerEj.series[0].id,
              });
              setCampoActivo(campoInicial(primerEj.ejercicio, mapa.get(primerEj.clave)));
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
  const hayCalentamiento = ejerciciosSesion.some((e) => e.bloque === 'calentamiento');

  // Agregar ejercicio desde catalogo
  const seleccionarEjercicio = async (ej: EjercicioRow) => {
    setModalBuscador(false);
    setBusqueda('');
    setCreandoEjercicio(false);
    setNuevoNombre('');

    // Lo que se suma durante la sesion va al bloque principal
    const clave = claveDe('principal', ej.id);
    let previas: SeriePreviaEjercicio[] = referenciasPrevias.get(clave) ?? [];
    if (usuarioId && !referenciasPrevias.has(clave)) {
      try {
        previas = await obtenerSeriesPreviasPorEjercicio(usuarioId, ej.id, undefined, false);
        if (previas.length > 0) {
          setReferenciasPrevias((m) => new Map(m).set(clave, previas));
        }
      } catch (e) {
        console.error('Error al cargar referencia previa:', e);
      }
    }

    const cantSeries = Math.max(3, previas.length);
    const nuevasSeries: SerieBorrador[] = [];
    for (let i = 0; i < cantSeries; i++) {
      nuevasSeries.push(serieDesdePrevia(previas[i]));
    }

    const nuevoItem: EjercicioEnSesion = {
      clave,
      bloque: 'principal',
      ejercicio: ej,
      series: nuevasSeries,
    };

    setEjerciciosSesion((prev) => [...prev, nuevoItem]);
    setEjercicioExpandidoId(clave);
    if (nuevasSeries.length > 0) {
      setSerieActiva({ clave, serieId: nuevasSeries[0].id });
      setCampoActivo(campoInicial(ej, previas));
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
        medida: nuevaMedida,
      });
      setNuevoNombre('');
      setNuevaMedida('repeticiones');
      setCreandoEjercicio(false);
      await seleccionarEjercicio(creado);
    } catch (e) {
      console.error('Error al crear ejercicio:', e);
      Alert.alert('Error', 'No se pudo crear el ejercicio.');
    }
  };

  // Alternar acordeon de ejercicio
  const toggleAcordeon = (clave: string) => {
    if (ejercicioExpandidoId === clave) {
      setEjercicioExpandidoId(null);
      setSerieActiva(null);
    } else {
      setEjercicioExpandidoId(clave);
      const item = ejerciciosSesion.find((e) => e.clave === clave);
      if (item && item.series.length > 0) {
        // Al abrir un ejercicio, enfocar la primera serie pendiente si existe
        const pendiente = item.series.find((s) => !s.confirmada) ?? null;
        if (pendiente) {
          setSerieActiva({ clave, serieId: pendiente.id });
          setCampoActivo(campoInicial(item.ejercicio, referenciasPrevias.get(clave)));
        } else {
          // Si todas estan confirmadas, no abrir el keypad hasta que toque explicitamente
          setSerieActiva(null);
        }
      }
    }
  };

  // Agregar serie al ejercicio
  const agregarSerie = (clave: string) => {
    let nuevaId = '';
    setEjerciciosSesion((prev) =>
      prev.map((item) => {
        if (item.clave !== clave) return item;
        const nueva = serieComoLaUltima(item.series[item.series.length - 1]);
        nuevaId = nueva.id;
        return { ...item, series: [...item.series, nueva] };
      }),
    );
    if (nuevaId) {
      setSerieActiva({ clave, serieId: nuevaId });
      const item = ejerciciosSesion.find((e) => e.clave === clave);
      if (item) {
        setCampoActivo(campoInicial(item.ejercicio, referenciasPrevias.get(clave)));
      }
    }
  };

  // Quitar ejercicio
  const quitarEjercicio = (clave: string) => {
    setEjerciciosSesion((prev) => prev.filter((item) => item.clave !== clave));
    if (ejercicioExpandidoId === clave) {
      setEjercicioExpandidoId(null);
      setSerieActiva(null);
    }
  };

  // ---------------------------------------------------------------------------
  // Logica de Keypad y Edicion
  // ---------------------------------------------------------------------------

  const itemActivo = useMemo(
    () => ejerciciosSesion.find((item) => item.clave === serieActiva?.clave),
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

  const activoPorTiempo = !!itemActivo && esPorTiempo(itemActivo.ejercicio);
  const tiempoInvalido =
    activoPorTiempo && !!serieActivaObj && !leerDigitosTiempo(serieActivaObj.textoTiempo).valido;
  // Por tiempo: sin un tiempo valido no hay serie, y con el cronometro andando
  // se confirma con Parar
  const puedeConfirmar =
    !activoPorTiempo || (!!serieActivaObj && tiempoListo(serieActivaObj) && !cronometro.corriendo);
  // El tiempo de la misma serie la vez anterior, para mostrarlo como objetivo
  const objetivoSeg = activoPorTiempo
    ? referenciasPrevias.get(itemActivo.clave)?.[serieActivaNumero - 1]?.duracion_seg ?? null
    : null;

  // Modificar valores de la serie activa
  const actualizarSerieActiva = (
    updater: (s: SerieBorrador) => Partial<SerieBorrador>,
  ) => {
    if (!serieActiva) return;
    setEjerciciosSesion((prev) =>
      prev.map((item) => {
        if (item.clave !== serieActiva.clave) return item;
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
    if (!serieActivaObj || cronometro.corriendo) return;

    if (campoActivo === 'tiempo') {
      if (digito === '.') return;
      // Sin ceros a la izquierda: "0" solo no es nada y "0130" es "130"
      const nuevoTexto = (serieActivaObj.textoTiempo + digito).replace(/^0+/, '');
      if (nuevoTexto.length > MAX_DIGITOS_TIEMPO) return;
      actualizarSerieActiva(() => ({
        textoTiempo: nuevoTexto,
        duracionSeg: leerDigitosTiempo(nuevoTexto).seg,
      }));
    } else if (campoActivo === 'kg') {
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
    if (!serieActivaObj || cronometro.corriendo) return;

    if (campoActivo === 'tiempo') {
      const nuevoTexto = serieActivaObj.textoTiempo.slice(0, -1);
      actualizarSerieActiva(() => ({
        textoTiempo: nuevoTexto,
        duracionSeg: leerDigitosTiempo(nuevoTexto).seg,
      }));
    } else if (campoActivo === 'kg') {
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

  // Atajo para peso corporal. En una serie por tiempo es "Sin peso": saca el
  // campo de kg y vuelve al tiempo.
  const handleCorporal = () => {
    if (!serieActivaObj) return;
    const porTiempo = !!itemActivo && esPorTiempo(itemActivo.ejercicio);
    actualizarSerieActiva(() => ({
      pesoKg: null,
      textoPeso: '',
      conPeso: false,
    }));
    setCampoActivo(porTiempo ? 'tiempo' : 'reps');
  };

  // "+ peso" en una serie por tiempo: aparece el campo de kg
  const handleAgregarPeso = () => {
    if (!serieActivaObj || cronometro.corriendo) return;
    actualizarSerieActiva(() => ({ conPeso: true }));
    setCampoActivo('kg');
  };

  // Si cambia la serie activa con el cronometro andando (se toco otra fila o
  // se cerro el ejercicio), la medicion se abandona: no hay a que serie cargarla.
  const { corriendo: cronoCorriendo, cancelar: cancelarCrono } = cronometro;
  useEffect(() => {
    if (cronoCorriendo) cancelarCrono();
    // Solo al cambiar de serie, no cuando arranca el cronometro
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serieActiva?.serieId]);

  // Parar el cronometro carga el tiempo en la serie y la confirma
  const handleIniciarParar = () => {
    if (!serieActivaObj) return;
    if (!cronometro.corriendo) {
      setCampoActivo('tiempo');
      cronometro.iniciar();
      return;
    }
    const seg = Math.min(cronometro.parar(), 99 * 60 + 59);
    handleConfirmarSerie({ duracionSeg: seg, textoTiempo: digitosDeDuracion(seg) });
  };

  // Confirmar serie activa con auto-avance o guardar correccion. `valores`
  // trae lo que cargo el cronometro, que todavia no esta en el estado.
  const handleConfirmarSerie = (valores?: Partial<SerieBorrador>) => {
    if (!serieActiva || !itemActivo || !serieActivaObj) return;
    const porTiempo = esPorTiempo(itemActivo.ejercicio);
    if (porTiempo && !tiempoListo({ ...serieActivaObj, ...valores })) return;

    const estabaConfirmada = serieActivaObj.confirmada;

    // Actualizar y confirmar la serie
    actualizarSerieActiva((s) => ({
      ...valores,
      confirmada: true,
      repeticiones: s.repeticiones > 0 ? s.repeticiones : 10,
    }));

    // CASO CORRECCION: Si se estaba corrigiendo una serie ya completada,
    // no avanzar ciegamente: buscar si queda alguna serie pendiente real
    if (estabaConfirmada) {
      // Buscar siguiente serie pendiente en este u otro ejercicio
      let siguientePendiente: { claveEj: string; serieId: string; campo: Campo } | null = null;
      for (const ejItem of ejerciciosSesion) {
        const pendiente = ejItem.series.find((s) => !s.confirmada && s.id !== serieActiva.serieId);
        if (pendiente) {
          siguientePendiente = {
            claveEj: ejItem.clave,
            serieId: pendiente.id,
            campo: campoInicial(ejItem.ejercicio, referenciasPrevias.get(ejItem.clave)),
          };
          break;
        }
      }

      if (siguientePendiente) {
        setEjercicioExpandidoId(siguientePendiente.claveEj);
        setSerieActiva({ clave: siguientePendiente.claveEj, serieId: siguientePendiente.serieId });
        setCampoActivo(siguientePendiente.campo);
      } else {
        // No hay pendientes: cerrar keypad limpiamente
        setSerieActiva(null);
      }
      return;
    }

    // CASO SERIE PENDIENTE NUEVA: Auto-avance progresivo
    const ejIdx = ejerciciosSesion.findIndex((e) => e.clave === serieActiva.clave);
    if (ejIdx < 0) return;

    const seriesDelEj = ejerciciosSesion[ejIdx].series;
    const serieIdx = seriesDelEj.findIndex((s) => s.id === serieActiva.serieId);

    // 1. Hay siguiente serie en este mismo ejercicio?
    if (serieIdx >= 0 && serieIdx < seriesDelEj.length - 1) {
      const prox = seriesDelEj[serieIdx + 1];
      setSerieActiva({
        clave: serieActiva.clave,
        serieId: prox.id,
      });
      setCampoActivo(campoInicial(itemActivo.ejercicio, referenciasPrevias.get(itemActivo.clave)));
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
      const proxEjId = proxEjercicio.clave;
      setEjercicioExpandidoId(proxEjId);
      const primeraPendiente =
        proxEjercicio.series.find((s) => !s.confirmada) ?? proxEjercicio.series[0];
      setSerieActiva({
        clave: proxEjId,
        serieId: primeraPendiente.id,
      });
      setCampoActivo(campoInicial(proxEjercicio.ejercicio, referenciasPrevias.get(proxEjId)));

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
      seriesParaGuardar(item).map((s) =>
        esPorTiempo(item.ejercicio)
          ? {
              ejercicioId: item.ejercicio.id,
              repeticiones: null,
              duracionSeg: s.duracionSeg,
              pesoKg: s.conPeso ? s.pesoKg : null,
              esCalentamiento: item.bloque === 'calentamiento',
            }
          : {
              ejercicioId: item.ejercicio.id,
              repeticiones: s.repeticiones,
              pesoKg: s.pesoKg,
              esCalentamiento: item.bloque === 'calentamiento',
            },
      ),
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

        // Mismo filtro que listaSeriesPlana: se muestra lo que se guardo, y un
        // ejercicio sin ninguna serie guardada no aparece. El calentamiento no
        // es parte del resumen.
        setTerminado(
          ejerciciosSesion
            .filter((item) => item.bloque === 'principal')
            .map((item) => ({
              id: item.clave,
              nombre: item.ejercicio.nombre,
              detalle: textoSeriesEjercicio(
                seriesParaGuardar(item).map((s) =>
                  esPorTiempo(item.ejercicio)
                    ? { repeticiones: null, duracionSeg: s.duracionSeg, pesoKg: s.conPeso ? s.pesoKg : null }
                    : { repeticiones: s.repeticiones, pesoKg: s.pesoKg },
                ),
              ),
            }))
            .filter((e) => e.detalle !== ''),
        );
        // Despues de guardar: la XP sale de los eventos y el de esta sesion
        // recien ahora existe. Si falla, el cierre se muestra sin el nivel.
        cargarNivel()
          .then(setNivel)
          .catch((e) => console.error('Error al cargar el nivel:', e));
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

  if (terminado) {
    return (
      <Pantalla style={estilos.cierre}>
        <Text style={estilos.cierreTitulo}>Listo</Text>
        <Text style={estilos.cierreDetalle}>{nombreRutina ?? 'Rutina libre'}</Text>

        <View style={estilos.cierreCard}>
          {terminado.map((e, i) => (
            <View key={e.id}>
              {i > 0 && <View style={estilos.cierreSeparador} />}
              <View style={estilos.cierreFila}>
                <Text style={estilos.cierreEjercicio}>{e.nombre}</Text>
                <Text style={estilos.cierreSeries}>{e.detalle}</Text>
              </View>
            </View>
          ))}
        </View>

        <Text style={estilos.cierreDetalle}>Lo guardamos en tu agenda.</Text>

        {nivel && <GananciaXP nivel={nivel} />}

        <Boton titulo="Volver" onPress={() => router.back()} ancho />
      </Pantalla>
    );
  }

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
          ejerciciosSesion.map((item, idx) => {
            const claveEj = item.clave;
            // Con calentamiento, cada bloque lleva su titulo. Sin el, la lista
            // queda como siempre.
            const tituloBloque =
              hayCalentamiento && (idx === 0 || ejerciciosSesion[idx - 1].bloque !== item.bloque)
                ? item.bloque === 'calentamiento'
                  ? 'Calentamiento'
                  : 'Principal'
                : null;
            const expandido = ejercicioExpandidoId === claveEj;
            const previas = referenciasPrevias.get(claveEj) ?? [];
            const pendientes = item.series.filter((s) => !s.confirmada).length;
            const completado = item.series.length > 0 && pendientes === 0;
            const porTiempo = esPorTiempo(item.ejercicio);

            return (
              <View
                key={claveEj}
                onLayout={(e) => {
                  posicionesY.current[claveEj] = e.nativeEvent.layout.y;
                }}
              >
              {tituloBloque && <Text style={estilos.tituloBloque}>{tituloBloque}</Text>}
              <View
                style={[
                  estilos.acordeonCard,
                  expandido && estilos.acordeonCardExpandido,
                ]}
              >
                {/* Cabecera del acordeon */}
                <Pressable
                  style={estilos.acordeonCabecera}
                  onPress={() => toggleAcordeon(claveEj)}
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
                      {porTiempo ? (
                        <Text style={[estilos.tablaTh, estilos.colTiempo]}>TIEMPO</Text>
                      ) : (
                        <>
                          <Text style={[estilos.tablaTh, estilos.colKg]}>KG</Text>
                          <Text style={[estilos.tablaTh, estilos.colReps]}>REPS</Text>
                        </>
                      )}
                      <Text style={[estilos.tablaTh, estilos.colEstado]}>ESTADO</Text>
                    </View>

                    {/* Filas de series */}
                    <View style={estilos.filasContenedor}>
                      {item.series.map((s, sIdx) => {
                        const esActiva =
                          serieActiva?.clave === claveEj && serieActiva?.serieId === s.id;
                        const prev = previas[sIdx];

                        let textoAnterior = '—';
                        if (prev?.duracion_seg != null) {
                          textoAnterior =
                            prev.peso_kg !== null && prev.peso_kg > 0
                              ? `${textoDuracion(prev.duracion_seg)} · ${prev.peso_kg}`
                              : textoDuracion(prev.duracion_seg);
                        } else if (prev) {
                          if (prev.peso_kg !== null && prev.peso_kg > 0) {
                            textoAnterior = `${prev.peso_kg} × ${prev.repeticiones}`;
                          } else {
                            textoAnterior = `Corp × ${prev.repeticiones}`;
                          }
                        }

                        // Toque en fila: si esta confirmada, es solo lectura
                        const handlePressFila = (campoObjetivo?: Campo) => {
                          if (s.confirmada) {
                            // Serie confirmada: no hace nada en toque simple para evitar ediciones accidentales
                            return;
                          }
                          setSerieActiva({ clave: claveEj, serieId: s.id });
                          setCampoActivo(campoObjetivo ?? campoInicial(item.ejercicio, previas));
                        };

                        // Toque largo en serie confirmada: permite corregir
                        const handleLongPressConfirmada = () => {
                          setSerieActiva({ clave: claveEj, serieId: s.id });
                          setCampoActivo(campoInicial(item.ejercicio, previas));
                        };

                        // Toque en icono de estado
                        const handlePressEstado = () => {
                          if (s.confirmada) {
                            // Reabrir serie para corregir
                            setSerieActiva({ clave: claveEj, serieId: s.id });
                            setEjerciciosSesion((prevArr) =>
                              prevArr.map((eIt) => {
                                if (eIt.clave !== claveEj) return eIt;
                                return {
                                  ...eIt,
                                  series: eIt.series.map((ser) =>
                                    ser.id === s.id ? { ...ser, confirmada: false } : ser,
                                  ),
                                };
                              }),
                            );
                            setCampoActivo(campoInicial(item.ejercicio, previas));
                          } else if (porTiempo && !tiempoListo(s)) {
                            // Por tiempo y sin tiempo: no hay nada que confirmar, se abre para cargarlo
                            setSerieActiva({ clave: claveEj, serieId: s.id });
                            setCampoActivo('tiempo');
                          } else {
                            // Confirmar de inmediato con los valores actuales
                            setEjerciciosSesion((prevArr) =>
                              prevArr.map((eIt) => {
                                if (eIt.clave !== claveEj) return eIt;
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

                            {porTiempo ? (
                              <Pressable
                                style={[
                                  estilos.colTiempo,
                                  estilos.celdaInput,
                                  s.confirmada && estilos.celdaInputConfirmada,
                                  esActiva && estilos.celdaInputEnfocada,
                                ]}
                                onPress={() => handlePressFila('tiempo')}
                                onLongPress={s.confirmada ? handleLongPressConfirmada : undefined}
                              >
                                <Text
                                  style={[
                                    estilos.valorTexto,
                                    esActiva && estilos.valorTextoActivo,
                                    !leerDigitosTiempo(s.textoTiempo).valido && estilos.valorTextoInvalido,
                                    s.textoTiempo === '' && estilos.valorTextoCorporal,
                                  ]}
                                  numberOfLines={1}
                                >
                                  {s.textoTiempo === '' ? '—' : leerDigitosTiempo(s.textoTiempo).texto}
                                  {s.conPeso && s.pesoKg !== null && s.pesoKg > 0 ? ` · ${s.pesoKg} kg` : ''}
                                </Text>
                              </Pressable>
                            ) : (
                            <>
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
                            </>
                            )}

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
                        onPress={() => agregarSerie(claveEj)}
                        hitSlop={8}
                      >
                        <Ionicons name="add" size={16} color={colors.action} />
                        <Text style={estilos.botonAgregarSerieTexto}>Agregar serie</Text>
                      </Pressable>

                      <Pressable
                        onPress={() => quitarEjercicio(claveEj)}
                        hitSlop={8}
                        style={estilos.botonEliminarEjercicio}
                      >
                        <Text style={estilos.botonEliminarEjercicioTexto}>Quitar ejercicio</Text>
                      </Pressable>
                    </View>
                  </View>
                )}
              </View>
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
              <Text
                style={[estilos.keypadContextoSub, tiempoInvalido && estilos.keypadContextoInvalido]}
              >
                {esModoCorreccion
                  ? 'Modificando serie completada'
                  : tiempoInvalido
                  ? 'Los segundos van hasta 59'
                  : campoActivo === 'tiempo'
                  ? 'Editando tiempo (m:ss)'
                  : campoActivo === 'kg'
                  ? 'Editando peso en kg'
                  : 'Editando repeticiones'}
              </Text>
            </View>

            {activoPorTiempo && !serieActivaObj?.conPeso ? (
              // Por tiempo y sin peso: el kg no aparece hasta que se pide
              <Pressable
                style={[estilos.botonMasPeso, cronometro.corriendo && estilos.deshabilitado]}
                onPress={handleAgregarPeso}
                disabled={cronometro.corriendo}
                hitSlop={8}
              >
                <Text style={estilos.botonMasPesoTexto}>+ peso</Text>
              </Pressable>
            ) : (
              /* Switch Kg / Reps, o Tiempo / Kg en una serie por tiempo con peso */
              <View style={estilos.switchPill}>
                {(activoPorTiempo ? (['tiempo', 'kg'] as const) : (['kg', 'reps'] as const)).map(
                  (campo) => (
                    <Pressable
                      key={campo}
                      style={[
                        estilos.switchBoton,
                        campoActivo === campo && estilos.switchBotonActivo,
                      ]}
                      onPress={() => setCampoActivo(campo)}
                      disabled={cronometro.corriendo}
                    >
                      <Text
                        style={[
                          estilos.switchBotonTexto,
                          campoActivo === campo && estilos.switchBotonTextoActivo,
                        ]}
                      >
                        {campo === 'kg' ? 'Kg' : campo === 'reps' ? 'Reps' : 'Tiempo'}
                      </Text>
                    </Pressable>
                  ),
                )}
              </View>
            )}
          </View>

          {campoActivo === 'tiempo' ? (
            /* Cronometro de la serie: cuenta hacia arriba y no corta solo */
            <View style={estilos.keypadFilaCronometro}>
              <Pressable
                style={({ pressed }) => [
                  estilos.botonCronometro,
                  cronometro.corriendo && estilos.botonCronometroParar,
                  pressed && estilos.botonConfirmarPresionado,
                ]}
                onPress={handleIniciarParar}
              >
                <Ionicons
                  name={cronometro.corriendo ? 'stop' : 'play'}
                  size={16}
                  color={colors.textOnAction}
                />
                <Text style={estilos.botonCronometroTexto}>
                  {cronometro.corriendo ? 'Parar' : 'Iniciar'}
                </Text>
              </Pressable>
              <Text
                style={[
                  estilos.cronometroValor,
                  !cronometro.corriendo && estilos.cronometroValorQuieto,
                ]}
              >
                {cronometro.corriendo
                  ? textoDuracion(cronometro.segundos)
                  : leerDigitosTiempo(serieActivaObj?.textoTiempo ?? '').texto}
              </Text>
              {objetivoSeg !== null && (
                <Text style={estilos.cronometroObjetivo}>Ant. {textoDuracion(objetivoSeg)}</Text>
              )}
            </View>
          ) : (
          /* Atajos rapidos de peso (+1.25, +2.5, +5, Corporal / Sin peso) */
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
                !activoPorTiempo && serieActivaObj?.pesoKg === null && estilos.atajoBotonCorporalActivo,
              ]}
              onPress={handleCorporal}
            >
              <Text
                style={[
                  estilos.atajoTexto,
                  !activoPorTiempo && serieActivaObj?.pesoKg === null && estilos.atajoTextoCorporalActivo,
                ]}
              >
                {activoPorTiempo ? 'Sin peso' : 'Corporal'}
              </Text>
            </Pressable>
          </View>
          )}

          {/* Grilla 3x4 del teclado numerico */}
          <View style={[estilos.tecladoGrilla, cronometro.corriendo && estilos.deshabilitado]}>
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
                style={({ pressed }) => [
                  estilos.tecla,
                  pressed && estilos.teclaPresionada,
                  (campoActivo === 'tiempo' || cronometro.corriendo) && estilos.deshabilitado,
                ]}
                onPress={() => handleDigito('.')}
                disabled={campoActivo === 'tiempo' || cronometro.corriendo}
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
              !puedeConfirmar && estilos.botonConfirmarDeshabilitado,
            ]}
            onPress={() => handleConfirmarSerie()}
            disabled={!puedeConfirmar}
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
                <View style={estilos.medidaFila}>
                  {MEDIDAS.map((m) => (
                    <Pressable
                      key={m.valor}
                      style={[
                        estilos.miniChip,
                        estilos.medidaChip,
                        nuevaMedida === m.valor && estilos.miniChipActivo,
                      ]}
                      onPress={() => setNuevaMedida(m.valor)}
                    >
                      <Text
                        style={[
                          estilos.miniChipTexto,
                          nuevaMedida === m.valor && estilos.miniChipTextoActivo,
                        ]}
                      >
                        {m.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
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

  // Cierre, mismo molde que el "Listo" del temporizador
  // Centrado vertical mientras entre; con muchos ejercicios scrollea.
  cierre: { justifyContent: 'center', alignItems: 'center', gap: spacing.md },
  cierreCard: {
    alignSelf: 'stretch',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    ...shadow.card,
  },
  cierreFila: { paddingVertical: spacing.sm, gap: 2 },
  cierreSeparador: { height: sizes.hairline, backgroundColor: colors.border },
  cierreEjercicio: {
    fontSize: fontSize.body,
    lineHeight: lineHeight.body,
    fontWeight: fontWeight.medium,
    color: colors.textPrimary,
  },
  cierreSeries: {
    fontSize: fontSize.small,
    lineHeight: lineHeight.small,
    color: colors.textSecondary,
  },
  cierreTitulo: {
    fontSize: fontSize.display,
    lineHeight: lineHeight.display,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  cierreDetalle: {
    fontSize: fontSize.body,
    lineHeight: lineHeight.body,
    color: colors.textSecondary,
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

  // Titulo de bloque (Calentamiento / Principal) sobre las tarjetas
  tituloBloque: {
    fontSize: fontSize.caption,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
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
  // Ocupa el lugar de Kg + Reps en los ejercicios por tiempo
  colTiempo: {
    flex: 1,
    minWidth: 72 + 60 + spacing.xs,
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
  valorTextoInvalido: {
    color: colors.danger,
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
  keypadContextoInvalido: {
    color: colors.danger,
    fontWeight: '600',
  },
  botonMasPeso: {
    paddingVertical: 5,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  botonMasPesoTexto: {
    fontSize: fontSize.small,
    fontWeight: '600',
    color: colors.action,
  },
  deshabilitado: {
    opacity: 0.4,
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

  // Fila del cronometro de una serie por tiempo, en lugar de los atajos de peso
  keypadFilaCronometro: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    height: 44,
    marginBottom: spacing.xs,
  },
  botonCronometro: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    height: 40,
    minWidth: 104,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    backgroundColor: colors.action,
  },
  botonCronometroParar: {
    backgroundColor: colors.danger,
  },
  botonCronometroTexto: {
    fontSize: fontSize.body,
    fontWeight: '700',
    color: colors.textOnAction,
  },
  cronometroValor: {
    flex: 1,
    fontSize: 28,
    fontWeight: '700',
    color: colors.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  cronometroValorQuieto: {
    color: colors.textSecondary,
  },
  cronometroObjetivo: {
    fontSize: fontSize.small,
    fontWeight: '600',
    color: colors.textSecondary,
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
  botonConfirmarDeshabilitado: {
    backgroundColor: colors.actionDisabled,
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
  medidaFila: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  medidaChip: {
    flex: 1,
    alignItems: 'center',
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
