// Detalle de un evento suelto. Se llega desde "Esta semana" en la agenda,
// donde cada fila apunta a un evento concreto y no a un dia entero.
//
// Es el hermano chico de /evento/dia/[fecha]: mismos helpers de formato,
// mismas acciones, una sola fila. La diferencia real es que aca el borrado
// deja la pantalla sin nada que mostrar, asi que vuelve atras en vez de
// recargar.
//
// Si el entrenamiento se corrio con el temporizador, ademas del evento hay una
// sesion con el detalle de lo que se hizo. Es el unico lugar que la lee. Los
// eventos agendados a mano y los marcados desde el cartel de pendientes no
// tienen sesion, y entonces esa card no se dibuja: una card vacia o un "sin
// datos" ocuparia lugar para no decir nada.

import { useState, useCallback, useEffect, useMemo } from 'react';
import { View, Text, Pressable, StyleSheet, Alert, ActivityIndicator, Share, Image } from 'react-native';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { Pantalla } from '@/ui/Pantalla';
import { Boton } from '@/ui/Boton';
import { colors, spacing, radius, fontSize, lineHeight, shadow } from '@/ui/theme';

import { obtenerEvento, marcarCompletado, eliminarEvento } from '@/db/queries/eventos';
import {
  obtenerSesionPorEvento,
  listarSeriesConEjercicio,
  obtenerSeriesPreviasPorEjercicio,
  type SerieConEjercicio,
  type SeriePreviaEjercicio,
} from '@/db/queries/sesiones';
import {
  obtenerRutinaGimnasio,
  type RutinaGimnasioConDetalle,
} from '@/db/queries/rutinasGimnasio';
import { obtenerPerfilLocal } from '@/db/queries/perfil';
import { etiquetaTipo, ETIQUETA_INTENSIDAD, horaDe, partesFecha, capitalizarDeporte } from '@/features/agenda/formato';
import {
  calcularRitmo,
  esCronometro,
  formatearDecimal,
  formatearSegundos,
} from '@/features/entrenamiento/temporizador';
import { volumenTotal } from '@/lib/fuerza';
import type { ConfigTemporizador } from '@/features/entrenamiento/temporizador';
import type { EventoRow, SesionEntrenamientoRow } from '@/db/schema';

// ---------------------------------------------------------------------------
// Pantalla
// ---------------------------------------------------------------------------

export default function DetalleEvento() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [evento, setEvento] = useState<EventoRow | null>(null);
  // null tambien cuando el evento existe pero nunca se corrio con temporizador.
  const [sesion, setSesion] = useState<SesionEntrenamientoRow | null>(null);
  const [usuarioId, setUsuarioId] = useState<string | null>(null);
  const [deporte, setDeporte] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    if (!id) return;
    try {
      // Evento, sesion y perfil corren en paralelo: perfil da el deporte para
      // rotular el tipo si es entrenamiento.
      const [e, s, perfil] = await Promise.all([
        obtenerEvento(id),
        obtenerSesionPorEvento(id),
        obtenerPerfilLocal(),
      ]);
      setEvento(e);
      setSesion(s);
      setUsuarioId(perfil?.id ?? null);
      setDeporte(perfil?.deporte_principal ?? null);
    } catch (e) {
      console.error('Error al cargar el evento:', e);
      Alert.alert('Error', 'No se pudo cargar el evento.');
    } finally {
      setCargando(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      cargar();
    }, [cargar]),
  );

  /**
   * Marcar hecho a mano. marcarCompletado delega en responderEvento, asi que
   * el evento tambien queda respondido y no vuelve a aparecer en el cartel de
   * pendientes.
   */
  const marcar = async (completado: boolean) => {
    if (!evento) return;
    try {
      await marcarCompletado(evento.id, completado);
      await cargar();
    } catch (e) {
      console.error('Error al marcar el evento:', e);
      Alert.alert('Error', 'No se pudo actualizar el evento.');
    }
  };

  const borrar = () => {
    if (!evento) return;
    Alert.alert('Borrar evento', '¿Seguro que querés borrarlo?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Borrar',
        style: 'destructive',
        onPress: async () => {
          try {
            await eliminarEvento(evento.id);
            // No recarga: el evento ya no existe y esta pantalla es solo sobre
            // el. Volver deja al usuario en la agenda, que si se recarga sola
            // al tomar foco.
            router.back();
          } catch (e) {
            console.error('Error al borrar el evento:', e);
            Alert.alert('Error', 'No se pudo borrar el evento.');
          }
        },
      },
    ]);
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

  // El id puede venir de un link viejo o de un evento que se borro desde otra
  // pantalla. Sin esto, la pantalla queda en blanco sin explicar por que.
  if (!evento) {
    return (
      <Pantalla>
        <View style={estilos.header}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Text style={estilos.flecha}>‹</Text>
          </Pressable>
          <Text style={estilos.titulo}>Evento</Text>
        </View>
        <View style={estilos.vacio}>
          <Text style={estilos.detalle}>Este evento ya no existe.</Text>
        </View>
      </Pantalla>
    );
  }

  const { dia, mes } = partesFecha(evento.fecha);
  const hecho = evento.completado === 1;
  const esGimnasio = evento.tipo === 'gimnasio';
  const esPartido = evento.tipo === 'partido';
  const notasLower = (evento.notas || '').toLowerCase();
  const esEntrenamientoPropio =
    evento.tipo === 'entrenamiento' &&
    (!evento.rutina_id ||
      evento.modo_entrenamiento === 'cronometro' ||
      evento.modo_entrenamiento === 'pasadas' ||
      notasLower.includes('propio') ||
      notasLower.includes('cronometro') ||
      notasLower.includes('pasadas') ||
      notasLower.includes('intervalo'));
  const esDeporteElegido = evento.tipo === 'entrenamiento' && !esEntrenamientoPropio;

  const deporteCap = capitalizarDeporte(evento.deporte || deporte);
  const tituloHeader = esGimnasio
    ? 'Gimnasio'
    : esPartido
    ? 'Partido'
    : esDeporteElegido
    ? (evento.deporte ? capitalizarDeporte(evento.deporte) : (deporteCap || 'Entrenamiento'))
    : etiquetaTipo(evento.tipo, deporte, {
        rutinaId: evento.rutina_id,
        modoEntrenamiento: evento.modo_entrenamiento,
        deporte: evento.deporte,
      });

  return (
    <Pantalla>
      {/* 1. Header */}
      <View style={estilos.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={estilos.flecha}>‹</Text>
        </Pressable>
        <View style={estilos.flex}>
          <Text style={estilos.titulo}>
            {tituloHeader}
          </Text>
          <Text style={estilos.detalle}>
            {dia} de {mes}
          </Text>
        </View>
        {hecho && (
          <View style={[estilos.tag, esGimnasio && estilos.tagCompletado]}>
            <Text style={[estilos.tagTexto, esGimnasio && estilos.tagCompletadoTexto]}>
              Completado
            </Text>
          </View>
        )}
      </View>

      {/* 2. Ficha de la sesion */}
      <View style={estilos.card}>
        <Dato etiqueta="Hora de inicio" valor={horaDe(evento.fecha_hora_inicio)} />
        {!esGimnasio && (
          <Dato
            etiqueta="Duración"
            valor={
              evento.duracion_estimada_min ? `${evento.duracion_estimada_min} min` : 'Sin estimar'
            }
          />
        )}
        {evento.intensidad && ETIQUETA_INTENSIDAD[evento.intensidad] ? (
          <Dato etiqueta="Intensidad" valor={ETIQUETA_INTENSIDAD[evento.intensidad]} />
        ) : null}
        <Dato etiqueta="Estado" valor={hecho ? 'Completada' : 'Pendiente'} />
      </View>

      {/* Gimnasio sin sesion todavia: lo que hay que hacer, no lo que se hizo */}
      {esGimnasio && !sesion && (
        <PlanRutina
          rutinaGimnasioId={evento.rutina_gimnasio_id}
          usuarioId={usuarioId}
          duracionMin={evento.duracion_estimada_min}
        />
      )}

      {/* 3, 4, 5. Detalle de la sesion */}
      {sesion && (
        <DetalleSesion
          sesion={sesion}
          usuarioId={usuarioId}
          eventoFecha={evento.fecha}
        />
      )}

      {evento.tipo === 'gimnasio' && !hecho && (
        <Boton
          titulo="Iniciar rutina"
          variante="primario"
          onPress={() =>
            router.push(
              `/evento/rutina?eventoId=${evento.id}${
                evento.rutina_gimnasio_id ? `&rutinaGimnasioId=${evento.rutina_gimnasio_id}` : ''
              }`,
            )
          }
        />
      )}

      {/* Iniciar con temporizador solo aparece si es entrenamiento propio */}
      {esEntrenamientoPropio && !hecho && (
        <Boton
          titulo="Iniciar con temporizador"
          variante="primario"
          onPress={() => router.push(`/evento/temporizador?eventoId=${evento.id}`)}
        />
      )}

      <Boton
        titulo={hecho ? 'Deshacer' : 'Marcar como hecho'}
        variante={hecho ? 'secundario' : (esEntrenamientoPropio ? 'secundario' : 'primario')}
        onPress={() => marcar(!hecho)}
      />

      <Pressable style={estilos.borrar} onPress={borrar}>
        <Text style={estilos.borrarTexto}>Borrar evento</Text>
      </Pressable>
    </Pantalla>
  );
}

/**
 * "3 x 10 · 40 kg" si todas las series fueron iguales; si no,
 * "3 series · máx. 42,5 kg". Es una referencia para arrancar, no el detalle.
 */
function resumenPrevias(previas: SeriePreviaEjercicio[]): string {
  const reps = new Set(previas.map((p) => p.repeticiones));
  const pesos = previas.map((p) => p.peso_kg ?? 0);
  const maxPeso = Math.max(...pesos);
  const carga = maxPeso > 0 ? `${formatearDecimal(maxPeso, 1)} kg` : 'peso corporal';

  if (reps.size === 1 && new Set(pesos).size === 1) {
    return `${previas.length} x ${previas[0].repeticiones} · ${carga}`;
  }
  return `${previas.length} series · ${maxPeso > 0 ? `máx. ${carga}` : carga}`;
}

/**
 * La rutina planificada de un evento de gimnasio que todavia no se corrio:
 * nombre, ejercicios en orden y lo que se hizo la ultima vez con cada uno.
 * Una vez guardada la sesion, la reemplaza DetalleSesionRutina.
 */
function PlanRutina({
  rutinaGimnasioId,
  usuarioId,
  duracionMin,
}: {
  rutinaGimnasioId: string | null;
  usuarioId: string | null;
  duracionMin: number | null;
}) {
  const router = useRouter();
  const [rutina, setRutina] = useState<RutinaGimnasioConDetalle | null>(null);
  const [previas, setPrevias] = useState<Record<string, SeriePreviaEjercicio[]>>({});
  const [cargando, setCargando] = useState(Boolean(rutinaGimnasioId));

  useFocusEffect(
    useCallback(() => {
      if (!rutinaGimnasioId) return;
      let vivo = true;
      (async () => {
        try {
          const rg = await obtenerRutinaGimnasio(rutinaGimnasioId);
          if (!vivo) return;
          setRutina(rg);
          if (!rg || !usuarioId) return;

          const pares = await Promise.all(
            rg.ejercicios.map(
              async (ej) => [ej.id, await obtenerSeriesPreviasPorEjercicio(usuarioId, ej.id)] as const,
            ),
          );
          if (vivo) setPrevias(Object.fromEntries(pares));
        } catch (e) {
          console.error('Error al cargar la rutina del evento:', e);
        } finally {
          if (vivo) setCargando(false);
        }
      })();
      return () => {
        vivo = false;
      };
    }, [rutinaGimnasioId, usuarioId]),
  );

  const duracion = duracionMin ? `${duracionMin} min` : null;

  if (!rutinaGimnasioId) {
    return (
      <View style={estilos.card}>
        <Text style={estilos.planTitulo}>Sesión libre</Text>
        <Text style={estilos.detalle}>
          {[duracion, 'Sin ejercicios predefinidos: elegís qué hacer al iniciar.']
            .filter(Boolean)
            .join(' · ')}
        </Text>
      </View>
    );
  }

  if (cargando) {
    return (
      <View style={[estilos.card, estilos.vacio]}>
        <ActivityIndicator color={colors.action} />
      </View>
    );
  }

  if (!rutina) {
    return (
      <View style={estilos.card}>
        <Text style={estilos.detalle}>La rutina asignada a este evento ya no existe.</Text>
      </View>
    );
  }

  const n = rutina.ejercicios.length;

  return (
    <View style={estilos.rutinaContenedor}>
      <View style={estilos.card}>
        <View style={estilos.ejercicioHeaderFila}>
          <View style={estilos.ejercicioInfoCol}>
            <Text style={estilos.planTitulo}>{rutina.nombre}</Text>
            <Text style={estilos.detalle}>
              {[`${n} ${n === 1 ? 'ejercicio' : 'ejercicios'}`, duracion].filter(Boolean).join(' · ')}
            </Text>
          </View>
          <Pressable
            hitSlop={8}
            style={estilos.botonProgresion}
            onPress={() => router.push(`/rutina-gimnasio/nueva?id=${rutina.id}`)}
          >
            <Text style={estilos.enlaceProgresion}>Editar ›</Text>
          </Pressable>
        </View>
      </View>

      <View style={estilos.desgloseContenedor}>
        <Text style={estilos.seccionTitulo}>Ejercicios</Text>
        {n === 0 ? (
          <View style={estilos.card}>
            <Text style={estilos.detalle}>Esta rutina todavía no tiene ejercicios.</Text>
          </View>
        ) : (
          rutina.ejercicios.map((ej, idx) => {
            const ultimas = previas[ej.id] ?? [];
            return (
              <View key={ej.relacion_id} style={estilos.cardEjercicio}>
                <View style={estilos.ejercicioHeaderFila}>
                  <Text style={estilos.planNumero}>{idx + 1}</Text>
                  <View style={estilos.ejercicioInfoCol}>
                    <Text style={estilos.ejercicioTitulo}>{ej.nombre}</Text>
                    <Text style={estilos.ejercicioGrupo}>{ej.grupo}</Text>
                  </View>
                  {ultimas.length > 0 ? (
                    <Pressable
                      hitSlop={8}
                      style={estilos.botonProgresion}
                      onPress={() => router.push(`/entrenamiento/fuerza/${ej.id}`)}
                    >
                      <Text style={estilos.enlaceProgresion}>Progresión ›</Text>
                    </Pressable>
                  ) : null}
                </View>
                <Text style={estilos.planUltima}>
                  {ultimas.length > 0
                    ? `Última vez: ${resumenPrevias(ultimas)}`
                    : 'Primera vez con este ejercicio'}
                </Text>
              </View>
            );
          })
        )}
      </View>
    </View>
  );
}

/** Una fila etiqueta/valor de la card. */
function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <View style={estilos.fila}>
      <Text style={estilos.detalle}>{etiqueta}</Text>
      <Text style={estilos.valor}>{valor}</Text>
    </View>
  );
}

/**
 * "6 bloques", o "4 de 6 bloques" si quedo a medias.
 *
 * El "de" aparece solo cuando hay diferencia: en una sesion completa repetir
 * el mismo numero dos veces es ruido. El plural sigue al numero mas grande,
 * que es el que manda en "1 de 6 bloques".
 */
function conteo(hecho: number, planeado: number, singular: string, plural: string): string {
  if (hecho === planeado) return `${hecho} ${hecho === 1 ? singular : plural}`;
  return `${hecho} de ${planeado} ${planeado === 1 ? singular : plural}`;
}

/**
 * Que se hizo de la estructura planeada.
 *
 * OJO con las unidades: `pasadas` es por bloque y `pasadas_completadas` es el
 * total de la sesion, asi que lo planeado para comparar son bloques x pasadas.
 * Ver el comentario de la columna en SesionEntrenamientoRow.
 */
function textoHecho(s: SesionEntrenamientoRow): string {
  const bloques = s.bloques ?? 1;
  const pasadas = s.pasadas ?? 1;
  const blqComp = s.bloques_completados ?? 0;
  const pasComp = s.pasadas_completadas ?? 0;

  return [
    conteo(blqComp, bloques, 'bloque', 'bloques'),
    conteo(pasComp, bloques * pasadas, 'pasada', 'pasadas'),
  ].join(' · ');
}

/** "20 s de trabajo · 20 s de descanso · 90 s entre bloques". */
function textoConfig(s: SesionEntrenamientoRow): string {
  const trabajo = s.trabajo_seg ?? 0;
  const descanso = s.descanso_seg ?? 0;
  const bloques = s.bloques ?? 1;
  const descansoBloque = s.descanso_bloque_seg ?? 0;

  const partes = [
    `${trabajo} s de trabajo`,
    // Un 0 se dice con palabras: "0 s de descanso" se lee como un dato roto.
    descanso > 0 ? `${descanso} s de descanso` : 'sin descanso',
  ];
  // El descanso de bloque solo existe si hay mas de un bloque: con uno solo
  // nunca llega a usarse. Misma condicion que en presetActivo().
  if (bloques > 1 && descansoBloque > 0) {
    partes.push(`${descansoBloque} s entre bloques`);
  }
  return partes.join(' · ');
}

interface PropsDetalleRutina {
  sesion: SesionEntrenamientoRow;
  usuarioId: string | null;
  eventoFecha: string;
}

/**
 * Resumen de sesion de gimnasio guardada:
 * - Card destacada de rendimiento con volumenTotal, series y cantidad de ejercicios.
 * - Desglose por ejercicio en cards con cabecera flex resistente a titulos largos.
 * - Card del coach informativa y sobria.
 * - Boton principal "Compartir resumen" con Share.share nativo.
 */
function DetalleSesionRutina({ sesion, usuarioId, eventoFecha }: PropsDetalleRutina) {
  const router = useRouter();
  const [series, setSeries] = useState<SerieConEjercicio[]>([]);
  const [mensajeCoach, setMensajeCoach] = useState<string>('');

  useEffect(() => {
    listarSeriesConEjercicio(sesion.id).then(setSeries).catch(console.error);
  }, [sesion.id]);

  const porEjercicio = useMemo(() => {
    const map = new Map<string, SerieConEjercicio[]>();
    for (const s of series) {
      const lista = map.get(s.ejercicio_nombre) ?? [];
      lista.push(s);
      map.set(s.ejercicio_nombre, lista);
    }
    return map;
  }, [series]);

  const totalSeries = series.length;
  const volumen = useMemo(() => {
    return volumenTotal(series.map((s) => ({ ...s, peso_kg: s.peso_kg ?? 0 })));
  }, [series]);

  const ejerciciosUnicos = Array.from(porEjercicio.keys());

  // Generar nota informativa del coach comparando con sesion previa
  useEffect(() => {
    if (!usuarioId || series.length === 0) return;
    let vivo = true;

    (async () => {
      try {
        let detalleComparacion: string | null = null;

        for (const [nombre, seriesEj] of porEjercicio.entries()) {
          const ejId = seriesEj[0]?.ejercicio_id;
          if (!ejId) continue;

          const previas = await obtenerSeriesPreviasPorEjercicio(usuarioId, ejId, sesion.id);
          if (previas.length === 0) continue;

          const ultActual = seriesEj[seriesEj.length - 1];
          const ultPrevia = previas[previas.length - 1];

          const pesoActual = ultActual?.peso_kg ?? 0;
          const pesoPrevio = ultPrevia?.peso_kg ?? 0;

          if (pesoActual > pesoPrevio && pesoActual > 0) {
            detalleComparacion = `En ${nombre.toLowerCase()}, tu carga en la última serie subió respecto de la sesión anterior.`;
            break;
          } else if (pesoActual < pesoPrevio && pesoPrevio > 0) {
            detalleComparacion = `En ${nombre.toLowerCase()}, tu carga en la última serie bajó respecto de la sesión anterior.`;
            break;
          } else if (pesoActual === pesoPrevio && pesoActual > 0) {
            detalleComparacion = `En ${nombre.toLowerCase()}, mantuviste las cargas respecto de la sesión anterior.`;
          }
        }

        if (!vivo) return;
        if (detalleComparacion) {
          setMensajeCoach(`Completaste las ${totalSeries} series programadas. ${detalleComparacion}`);
        } else {
          setMensajeCoach(`Completaste las ${totalSeries} series de la sesión.`);
        }
      } catch (e) {
        console.error('Error al generar mensaje de coach:', e);
        if (vivo) setMensajeCoach(`Completaste las ${totalSeries} series de la sesión.`);
      }
    })();

    return () => {
      vivo = false;
    };
  }, [usuarioId, series, sesion.id, porEjercicio, totalSeries]);

  const compartirResumen = async () => {
    try {
      const lineasEjercicios = Array.from(porEjercicio.entries()).map(([nombre, seriesEj]) => {
        const conPeso = seriesEj.filter((s) => s.peso_kg !== null && s.peso_kg > 0);
        let detalle = `${seriesEj.length} series`;
        if (conPeso.length > 0) {
          const maxPeso = Math.max(...conPeso.map((s) => s.peso_kg!));
          detalle += ` (máx. ${maxPeso} kg)`;
        } else {
          detalle += ` (peso corporal)`;
        }
        return `• ${nombre}: ${detalle}`;
      });

      const { dia, mes } = partesFecha(eventoFecha);
      const texto = [
        `Gimnasio · ${dia} de ${mes}`,
        `Volumen total: ${formatearDecimal(volumen, 0)} kg · ${totalSeries} series · ${ejerciciosUnicos.length} ejercicios`,
        '',
        ...lineasEjercicios,
      ].join('\n');

      await Share.share({
        message: texto,
      });
    } catch (error) {
      console.error('Error al compartir resumen:', error);
    }
  };

  return (
    <View style={estilos.rutinaContenedor}>
      {/* 3. Card destacada de rendimiento */}
      <View style={estilos.cardRendimiento}>
        <Text style={estilos.rendimientoSubtitulo}>Rendimiento de la sesión</Text>
        <View style={estilos.gridMetricas}>
          <View style={estilos.metricaCol}>
            <Text style={estilos.metricaValor}>
              {volumen > 0 ? `${formatearDecimal(volumen, 0)} kg` : 'Corporal'}
            </Text>
            <Text style={estilos.metricaEtiqueta}>Volumen total</Text>
          </View>
          <View style={estilos.metricaSeparador} />
          <View style={estilos.metricaCol}>
            <Text style={estilos.metricaValor}>{totalSeries}</Text>
            <Text style={estilos.metricaEtiqueta}>Series hechas</Text>
          </View>
          <View style={estilos.metricaSeparador} />
          <View style={estilos.metricaCol}>
            <Text style={estilos.metricaValor}>{ejerciciosUnicos.length}</Text>
            <Text style={estilos.metricaEtiqueta}>Ejercicios</Text>
          </View>
        </View>
      </View>

      {/* 4. Desglose por ejercicio */}
      <View style={estilos.desgloseContenedor}>
        <Text style={estilos.seccionTitulo}>Desglose por ejercicio</Text>
        {Array.from(porEjercicio.entries()).map(([nombre, seriesEj]) => {
          const primerEj = seriesEj[0];
          const primerEjId = primerEj?.ejercicio_id;
          const grupo = primerEj?.ejercicio_grupo;

          return (
            <View key={nombre} style={estilos.cardEjercicio}>
              <View style={estilos.ejercicioHeaderFila}>
                <View style={estilos.ejercicioInfoCol}>
                  <Text style={estilos.ejercicioTitulo}>{nombre}</Text>
                  {grupo ? <Text style={estilos.ejercicioGrupo}>{grupo}</Text> : null}
                </View>
                {primerEjId ? (
                  <Pressable
                    hitSlop={8}
                    style={estilos.botonProgresion}
                    onPress={() => router.push(`/entrenamiento/fuerza/${primerEjId}`)}
                  >
                    <Text style={estilos.enlaceProgresion}>Ver progresión ›</Text>
                  </Pressable>
                ) : null}
              </View>

              <View style={estilos.tablaSeries}>
                {seriesEj.map((s, idx) => {
                  const esCorporal = s.peso_kg === null || s.peso_kg === 0;
                  return (
                    <View key={s.id} style={estilos.filaSerie}>
                      <Text style={estilos.serieTag}>S{idx + 1}</Text>
                      <Text style={estilos.serieReps}>{s.repeticiones} reps</Text>
                      <Text
                        style={[
                          estilos.serieCarga,
                          esCorporal && estilos.serieCargaCorporal,
                        ]}
                      >
                        {esCorporal ? 'peso corporal' : `${s.peso_kg} kg`}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </View>
          );
        })}
      </View>

      {/* 5. Card del coach con mascota León */}
      {mensajeCoach ? (
        <View style={estilos.cardCoach}>
          <View style={estilos.coachAvatarWrapper}>
            <Image
              source={require('@/assets/images/leon-avatar.png')}
              style={estilos.coachAvatarImg}
              resizeMode="cover"
            />
          </View>
          <View style={{ flex: 1 }}>
            <View style={estilos.coachHeaderFila}>
              <Text style={estilos.coachTitulo}>Coach León • Nota del coach</Text>
            </View>
            <Text style={estilos.coachTexto}>{mensajeCoach}</Text>
          </View>
        </View>
      ) : null}

      {/* 6. Accion principal: Compartir resumen */}
      <Boton
        titulo="Compartir resumen"
        variante="primario"
        onPress={compartirResumen}
      />
    </View>
  );
}

/**
 * El detalle de lo que paso, en su propia card. Va aparte de la del evento a
 * proposito: el evento es lo que se planeo, la sesion es lo que ocurrio.
 */
function DetalleSesion({
  sesion,
  usuarioId,
  eventoFecha,
}: {
  sesion: SesionEntrenamientoRow;
  usuarioId: string | null;
  eventoFecha: string;
}) {
  if (sesion.modo === 'rutina') {
    return (
      <DetalleSesionRutina
        sesion={sesion}
        usuarioId={usuarioId}
        eventoFecha={eventoFecha}
      />
    );
  }

  // Se reconstruye la config para poder usar los helpers puros del
  // temporizador en vez de repetir sus reglas aca.
  const config: ConfigTemporizador = {
    bloques: sesion.bloques ?? 1,
    pasadas: sesion.pasadas ?? 1,
    trabajoSeg: sesion.trabajo_seg ?? 0,
    descansoSeg: sesion.descanso_seg ?? 0,
    descansoBloqueSeg: sesion.descanso_bloque_seg ?? 0,
  };
  const cronometro = sesion.modo === 'cronometro' || esCronometro(config);

  // null si no hay distancia cargada, que es lo normal fuera del cronometro.
  const ritmo =
    sesion.duracion_real_seg != null
      ? calcularRitmo(sesion.distancia_km, sesion.duracion_real_seg)
      : null;

  return (
    <View style={estilos.card}>
      <Text style={estilos.seccion}>La sesión</Text>

      {/* Que se hizo y como estaba armado. El cronometro no dibuja ninguna de
          las dos: es una sola fase abierta, asi que bloques, pasadas y
          descansos son siempre 1, 1 y 0. Misma regla que etiquetaProgreso(). */}
      {!cronometro && (
        <>
          <Text style={estilos.linea}>{textoHecho(sesion)}</Text>
          <Text style={estilos.detalle}>{textoConfig(sesion)}</Text>
        </>
      )}

      {/* Lo medido. Va en filas etiqueta/valor, como la card del evento. */}
      {sesion.duracion_real_seg != null && (
        <Dato etiqueta="Duración real" valor={formatearSegundos(sesion.duracion_real_seg)} />
      )}

      {sesion.distancia_km !== null && (
        <Dato etiqueta="Distancia" valor={`${formatearDecimal(sesion.distancia_km)} km`} />
      )}
      {ritmo && <Dato etiqueta="Ritmo" valor={`${ritmo.ritmoTexto} min/km`} />}
    </View>
  );
}

// ---------------------------------------------------------------------------

const estilos = StyleSheet.create({
  flex: { flex: 1 },
  centrado: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  flecha: { fontSize: fontSize.title, color: colors.textSecondary },
  titulo: {
    fontSize: fontSize.body,
    lineHeight: lineHeight.body,
    fontWeight: '500',
    color: colors.textPrimary,
  },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
    ...shadow.card,
  },
  fila: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  valor: { fontSize: fontSize.body, lineHeight: lineHeight.body, color: colors.textPrimary },

  seccion: {
    fontSize: fontSize.small,
    lineHeight: lineHeight.small,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  // Linea de ancho completo, no una fila etiqueta/valor: el texto es largo y
  // alineado a la derecha se cortaria.
  linea: { fontSize: fontSize.body, lineHeight: lineHeight.body, color: colors.textPrimary },

  tag: {
    paddingVertical: 3,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
  },
  tagTexto: { fontSize: fontSize.small, color: colors.textSecondary },
  tagCompletado: {
    backgroundColor: colors.accentSoft,
  },
  tagCompletadoTexto: {
    color: colors.textOnAccentSoft,
    fontWeight: '600',
  },

  borrar: { paddingVertical: spacing.md, alignItems: 'center' },
  borrarTexto: { fontSize: fontSize.body, color: colors.danger },

  detalle: { fontSize: fontSize.small, lineHeight: lineHeight.small, color: colors.textSecondary },
  vacio: { paddingVertical: spacing.xl, alignItems: 'center' },

  // Rutina planificada (evento de gimnasio sin sesion)
  planTitulo: {
    fontSize: fontSize.body,
    lineHeight: lineHeight.body,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  planNumero: {
    width: 20,
    fontSize: fontSize.small,
    fontWeight: '700',
    color: colors.textMuted,
    paddingTop: 2,
  },
  planUltima: {
    fontSize: fontSize.caption,
    color: colors.textSecondary,
    marginLeft: 20 + spacing.sm,
  },

  // Resumen de rutina de gimnasio
  rutinaContenedor: {
    gap: spacing.md,
  },
  cardRendimiento: {
    backgroundColor: colors.action,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
    ...shadow.card,
  },
  rendimientoSubtitulo: {
    fontSize: fontSize.caption,
    fontWeight: '600',
    color: colors.textOnAction,
    opacity: 0.85,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  gridMetricas: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingVertical: spacing.xs,
  },
  metricaCol: {
    flex: 1,
    alignItems: 'center',
  },
  metricaValor: {
    fontSize: fontSize.title,
    fontWeight: '700',
    color: colors.textOnAction,
  },
  metricaEtiqueta: {
    fontSize: fontSize.caption,
    color: colors.textOnAction,
    opacity: 0.9,
    marginTop: 2,
  },
  metricaSeparador: {
    width: 1,
    height: 28,
    backgroundColor: colors.textOnAction,
    opacity: 0.25,
  },

  desgloseContenedor: {
    gap: spacing.sm,
  },
  seccionTitulo: {
    fontSize: fontSize.small,
    fontWeight: '600',
    color: colors.textSecondary,
    marginLeft: 2,
  },
  cardEjercicio: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
    ...shadow.card,
  },
  ejercicioHeaderFila: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  ejercicioInfoCol: {
    flex: 1,
    gap: 2,
  },
  ejercicioTitulo: {
    fontSize: fontSize.body,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  ejercicioGrupo: {
    fontSize: fontSize.caption,
    color: colors.textSecondary,
    textTransform: 'capitalize',
  },
  botonProgresion: {
    paddingVertical: 2,
    paddingHorizontal: spacing.xs,
    flexShrink: 0,
  },
  enlaceProgresion: {
    fontSize: fontSize.caption,
    fontWeight: '600',
    color: colors.action,
  },
  tablaSeries: {
    gap: spacing.xs,
    paddingTop: spacing.xs,
  },
  filaSerie: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: 3,
  },
  serieTag: {
    fontSize: fontSize.caption,
    fontWeight: '700',
    color: colors.action,
    width: 28,
  },
  serieReps: {
    fontSize: fontSize.small,
    fontWeight: '500',
    color: colors.textPrimary,
    width: 70,
  },
  serieCarga: {
    fontSize: fontSize.small,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  serieCargaCorporal: {
    fontWeight: '400',
    color: colors.textSecondary,
  },

  cardCoach: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    borderLeftWidth: 3.5,
    borderLeftColor: colors.action,
    ...shadow.card,
  },
  coachAvatarWrapper: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.avatarFondo,
    borderWidth: 2,
    borderColor: colors.avatarBorde,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginTop: 2,
  },
  coachAvatarImg: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  coachHeaderFila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: 2,
  },
  coachTitulo: {
    fontSize: fontSize.caption,
    fontWeight: '700',
    color: colors.action,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  coachTexto: {
    fontSize: fontSize.small,
    lineHeight: lineHeight.body,
    color: colors.textPrimary,
  },
});
