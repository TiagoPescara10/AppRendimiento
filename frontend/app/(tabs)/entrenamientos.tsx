// app/(tabs)/entrenamientos.tsx
//
// Hub principal de Entrenamientos y Fuerza.
// Reemplaza a la antigua agenda en los tabs inferiores:
// - Header con acceso al calendario histórico y botón directo "+ Rutina"
// - Hero card "Hoy Toca" para arrancar la sesión del día en un toque
// - "Mis Rutinas" fijas organizadas por días de la semana
// - "Sesiones recientes" (feed de entrenamientos completados con métricas)

import { useState, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { Pantalla } from '@/ui/Pantalla';
import {
  colors,
  spacing,
  radius,
  fontSize,
  lineHeight,
  shadow,
  sizes,
  fontWeight,
} from '@/ui/theme';

import { obtenerPerfilLocal } from '@/db/queries/perfil';
import {
  obtenerRutinasGimnasioDelDia,
  listarRutinasGimnasio,
  type RutinaGimnasioConDetalle,
} from '@/db/queries/rutinasGimnasio';
import {
  listarEntrenamientosCompletados,
  obtenerSesionPorEvento,
  obtenerResumenRutina,
  type SesionReciente,
} from '@/db/queries/sesiones';
import { listarEventosPorFecha } from '@/db/queries/eventos';
import { SheetModoEntrenamiento } from '@/features/entrenamiento/components/SheetModoEntrenamiento';
import { etiquetaTipo, ETIQUETA_INTENSIDAD, capitalizarDeporte } from '@/features/agenda/formato';
import { aFechaLocal, diasEntre } from '@/lib/fechas';
import type { EventoRow, TipoEvento, Intensidad } from '@/db/schema';

const LETRAS_DIAS = ['D', 'L', 'M', 'Mi', 'J', 'V', 'S'];
const ORDEN_DOMINGO_PRIMERO = [0, 1, 2, 3, 4, 5, 6];

type FiltroSesiones = 'hoy' | 'semana' | 'mes';

const FILTROS_SESION: { id: FiltroSesiones; label: string }[] = [
  { id: 'hoy', label: 'Hoy' },
  { id: 'semana', label: 'Semana' },
  { id: 'mes', label: 'Mes' },
];

function formatearFechaCorta(fechaStr: string, hoyStr: string): string {
  if (fechaStr === hoyStr) return 'Hoy';
  const ayer = new Date();
  ayer.setDate(ayer.getDate() - 1);
  if (fechaStr === aFechaLocal(ayer)) return 'Ayer';

  const [anio, mes, dia] = fechaStr.split('-').map(Number);
  const d = new Date(anio, mes - 1, dia);
  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
}

function formatearDuracionMin(segundos: number | null, minutosEstimados: number | null): string {
  if (segundos != null && segundos > 0) {
    const mins = Math.round(segundos / 60);
    return `${mins} min`;
  }
  if (minutosEstimados != null && minutosEstimados > 0) {
    return `${minutosEstimados} min`;
  }
  return '--';
}

export default function EntrenamientosHub() {
  const router = useRouter();

  const [cargando, setCargando] = useState(true);
  const [rutinaHoy, setRutinaHoy] = useState<RutinaGimnasioConDetalle | null>(null);
  const [eventoRutinaHoy, setEventoRutinaHoy] = useState<EventoRow | null>(null);
  const [sesionRutinaHoy, setSesionRutinaHoy] = useState<SesionReciente | null>(null);
  const [eventoHoy, setEventoHoy] = useState<EventoRow | null>(null);
  const [misRutinas, setMisRutinas] = useState<RutinaGimnasioConDetalle[]>([]);
  const [sesionesRecientes, setSesionesRecientes] = useState<SesionReciente[]>([]);
  const [filtroSesion, setFiltroSesion] = useState<FiltroSesiones>('hoy');
  const [sheetEntrenarVisible, setSheetEntrenarVisible] = useState(false);
  const [deporte, setDeporte] = useState<string | null>(null);

  const hoyFecha = aFechaLocal(new Date());

  const cargar = useCallback(async () => {
    try {
      const perfil = await obtenerPerfilLocal();
      if (!perfil) return;
      setDeporte(perfil.deporte_principal);

      const diaSemana = new Date().getDay();

      const [rutinasDia, todasRutinas, eventosDelDia, recientes] = await Promise.all([
        obtenerRutinasGimnasioDelDia(perfil.id, diaSemana),
        listarRutinasGimnasio(perfil.id, true),
        listarEventosPorFecha(perfil.id, hoyFecha),
        listarEntrenamientosCompletados(perfil.id, 50),
      ]);

      const rHoy = rutinasDia[0] ?? null;
      setRutinaHoy(rHoy);

      // Buscar si la rutina de gimnasio programada para hoy ya fue completada
      let sesionHoy: SesionReciente | null = null;
      let eventoRutinaComp: EventoRow | null = null;

      if (rHoy) {
        eventoRutinaComp =
          eventosDelDia.find(
            (e) => e.rutina_gimnasio_id === rHoy.id && e.completado === 1,
          ) ?? null;

        if (eventoRutinaComp) {
          const enRecientes = recientes.find(
            (s) => s.evento_id === eventoRutinaComp!.id,
          );
          if (enRecientes) {
            sesionHoy = enRecientes;
          } else {
            const sesionDb = await obtenerSesionPorEvento(eventoRutinaComp.id);
            if (sesionDb) {
              const resumen = await obtenerResumenRutina(sesionDb.id);
              sesionHoy = {
                evento_id: eventoRutinaComp.id,
                tipo: 'gimnasio',
                fecha: hoyFecha,
                fecha_hora_inicio: eventoRutinaComp.fecha_hora_inicio,
                duracion_estimada_min: eventoRutinaComp.duracion_estimada_min,
                intensidad: eventoRutinaComp.intensidad,
                sesion_id: sesionDb.id,
                modo: sesionDb.modo,
                duracion_real_seg: sesionDb.duracion_real_seg,
                distancia_km: sesionDb.distancia_km,
                bloques_completados: null,
                pasadas_completadas: null,
                rutina_nombre: rHoy.nombre,
                series_count: resumen.series_count,
                ejercicios_count: resumen.ejercicios_count,
                volumen_kg: resumen.volumen_kg,
              };
            }
          }
        }
      }

      setSesionRutinaHoy(sesionHoy);
      setEventoRutinaHoy(eventoRutinaComp);

      // Si no hay rutina de gym hoy, buscar si hay algun evento deportivo agendado hoy
      const otroEvento =
        eventosDelDia.find((e) => e.completado === 0 && e.id !== eventoRutinaComp?.id) ??
        eventosDelDia.find((e) => e.id !== eventoRutinaComp?.id) ??
        null;
      setEventoHoy(otroEvento);
      setMisRutinas(todasRutinas);
      setSesionesRecientes(recientes);
    } catch (err) {
      console.error('Error al cargar pantalla de entrenamientos:', err);
    } finally {
      setCargando(false);
    }
  }, [hoyFecha]);

  useFocusEffect(
    useCallback(() => {
      let vivo = true;
      cargar().finally(() => {
        if (!vivo) return;
      });
      return () => {
        vivo = false;
      };
    }, [cargar]),
  );

  if (cargando) {
    return (
      <Pantalla scroll={false}>
        <View style={estilos.centrado}>
          <ActivityIndicator color={colors.action} />
        </View>
      </Pantalla>
    );
  }

  const sesionesFiltradas = sesionesRecientes.filter((s) => {
    if (filtroSesion === 'hoy') {
      return s.fecha === hoyFecha;
    }
    const dif = diasEntre(s.fecha, hoyFecha);
    if (filtroSesion === 'semana') {
      return dif >= 0 && dif <= 7;
    }
    if (filtroSesion === 'mes') {
      return dif >= 0 && dif <= 30;
    }
    return true;
  });

  const textoVacio =
    filtroSesion === 'hoy'
      ? 'Todavía no registraste entrenamientos completados hoy.'
      : filtroSesion === 'semana'
      ? 'Todavía no registraste entrenamientos completados esta semana.'
      : 'Todavía no registraste entrenamientos completados este mes.';

  return (
    <Pantalla>
      {/* Header Principal */}
      <View style={estilos.header}>
        <Text style={estilos.titulo}>Entrenamientos</Text>

        <View style={estilos.headerAcciones}>
          <Pressable
            style={estilos.botonAccionHeader}
            onPress={() => router.push('/entrenamiento/fuerza')}
            hitSlop={8}
            accessibilityLabel="Ver fuerza y progresión de cargas"
          >
            <Ionicons name="trending-up-outline" size={sizes.icon} color={colors.action} />
          </Pressable>

          <Pressable
            style={estilos.botonAccionHeader}
            onPress={() => router.push('/agenda')}
            hitSlop={8}
            accessibilityLabel="Ver agenda y calendario"
          >
            <Ionicons name="calendar-outline" size={sizes.icon} color={colors.action} />
          </Pressable>

          <Pressable
            style={estilos.botonNuevaRutina}
            onPress={() => router.push('/rutina-gimnasio/nueva')}
            hitSlop={8}
          >
            <Ionicons name="add" size={16} color={colors.textOnAction} />
            <Text style={estilos.botonNuevaRutinaTexto}>Rutina</Text>
          </Pressable>
        </View>
      </View>

      {/* Hero Card: Hoy Toca o Rutina Completada */}
      {rutinaHoy && eventoRutinaHoy && eventoRutinaHoy.completado === 1 ? (
        <View style={estilos.heroCard}>
          <View style={estilos.heroTopFila}>
            <View style={estilos.badgeHoyCompletado}>
              <Ionicons name="checkmark-circle" size={13} color={colors.textOnAccentSoft} />
              <Text style={estilos.badgeHoyTexto}>HOY COMPLETADO</Text>
            </View>
            <Ionicons name="barbell" size={sizes.icon} color={colors.accentSoft} />
          </View>

          <Text style={estilos.heroTitulo}>{rutinaHoy.nombre}</Text>
          <Text style={estilos.heroSubtitulo}>
            Rutina completada hoy
            {sesionRutinaHoy?.duracion_real_seg
              ? ` · ${formatearDuracionMin(sesionRutinaHoy.duracion_real_seg, null)}`
              : ''}
          </Text>

          {/* Resumen metrico: ejercicios, series, volumen */}
          <View style={estilos.heroResumenFila}>
            <View style={estilos.heroResumenItem}>
              <Text style={estilos.heroResumenValor}>
                {sesionRutinaHoy?.ejercicios_count ?? rutinaHoy.ejercicios.length}
              </Text>
              <Text style={estilos.heroResumenEtiqueta}>ejercicios</Text>
            </View>

            <View style={estilos.heroResumenSeparador} />

            <View style={estilos.heroResumenItem}>
              <Text style={estilos.heroResumenValor}>
                {sesionRutinaHoy?.series_count ?? 0}
              </Text>
              <Text style={estilos.heroResumenEtiqueta}>series</Text>
            </View>

            <View style={estilos.heroResumenSeparador} />

            <View style={estilos.heroResumenItem}>
              <Text style={estilos.heroResumenValor}>
                {sesionRutinaHoy && sesionRutinaHoy.volumen_kg > 0
                  ? `${Math.round(sesionRutinaHoy.volumen_kg)} kg`
                  : 'Corporal'}
              </Text>
              <Text style={estilos.heroResumenEtiqueta}>volumen</Text>
            </View>
          </View>

          <Pressable
            style={({ pressed }) => [
              estilos.heroBotonDetalle,
              pressed && estilos.heroBotonPresionado,
            ]}
            onPress={() => router.push(`/evento/${eventoRutinaHoy.id}`)}
          >
            <Ionicons name="eye-outline" size={16} color={colors.textOnAction} />
            <Text style={estilos.heroBotonTexto}>Ver detalle de la sesión</Text>
          </Pressable>
        </View>
      ) : rutinaHoy ? (
        <View style={estilos.heroCard}>
          <View style={estilos.heroTopFila}>
            <View style={estilos.badgeHoy}>
              <Text style={estilos.badgeHoyTexto}>HOY TOCA</Text>
            </View>
            <Ionicons name="barbell" size={sizes.icon} color={colors.accentSoft} />
          </View>

          <Text style={estilos.heroTitulo}>{rutinaHoy.nombre}</Text>
          <Text style={estilos.heroSubtitulo}>
            {rutinaHoy.ejercicios.length}{' '}
            {rutinaHoy.ejercicios.length === 1 ? 'ejercicio' : 'ejercicios'}
            {rutinaHoy.hora ? ` · ${rutinaHoy.hora.replace(/^0/, '')} hs` : ''}
            {rutinaHoy.duracion_estimada_min ? ` · ${rutinaHoy.duracion_estimada_min} min` : ''}
          </Text>

          <Pressable
            style={({ pressed }) => [
              estilos.heroBoton,
              pressed && estilos.heroBotonPresionado,
            ]}
            onPress={() =>
              router.push(
                `/evento/rutina?rutinaGimnasioId=${rutinaHoy.id}&nombreRutina=${encodeURIComponent(
                  rutinaHoy.nombre,
                )}`,
              )
            }
          >
            <Ionicons name="play" size={16} color={colors.textOnAction} />
            <Text style={estilos.heroBotonTexto}>Iniciar sesión</Text>
          </Pressable>
        </View>
      ) : eventoHoy && eventoHoy.completado === 0 ? (
        (() => {
          const esGimnasio = eventoHoy.tipo === 'gimnasio';
          const esPartido = eventoHoy.tipo === 'partido';
          const notasLower = (eventoHoy.notas || '').toLowerCase();
          const esPropio =
            eventoHoy.tipo === 'entrenamiento' &&
            (!eventoHoy.rutina_id ||
              eventoHoy.modo_entrenamiento === 'cronometro' ||
              eventoHoy.modo_entrenamiento === 'pasadas' ||
              notasLower.includes('propio') ||
              notasLower.includes('cronometro') ||
              notasLower.includes('pasadas') ||
              notasLower.includes('intervalo'));
          const esDeporteElegido = eventoHoy.tipo === 'entrenamiento' && !esPropio;

          const nombreDeporte = capitalizarDeporte(deporte) || 'Fútbol';
          const titulo = esPartido
            ? 'Partido Oficial'
            : esGimnasio
            ? 'Gimnasio'
            : esDeporteElegido
            ? (eventoHoy.deporte ? `Entrenamiento ${capitalizarDeporte(eventoHoy.deporte)}` : `Entrenamiento ${nombreDeporte}`)
            : etiquetaTipo(eventoHoy.tipo, nombreDeporte, {
                rutinaId: eventoHoy.rutina_id,
                modoEntrenamiento: eventoHoy.modo_entrenamiento,
                deporte: eventoHoy.deporte,
              });

          const icono = esGimnasio ? 'barbell' : esPartido ? 'trophy' : esPropio ? 'timer' : 'football';

          return (
            <Pressable
              style={estilos.heroCard}
              onPress={() => {
                if (esGimnasio) {
                  router.push(`/evento/rutina?eventoId=${eventoHoy.id}`);
                } else if (esPropio) {
                  router.push(`/evento/temporizador?eventoId=${eventoHoy.id}`);
                } else {
                  router.push(`/evento/${eventoHoy.id}`);
                }
              }}
            >
              <View style={estilos.heroTopFila}>
                <View style={estilos.badgeHoy}>
                  <Text style={estilos.badgeHoyTexto}>HOY PROGRAMADO</Text>
                </View>
                <Ionicons name={icono} size={sizes.icon} color={colors.accentSoft} />
              </View>

              <Text style={estilos.heroTitulo}>{titulo}</Text>
              <Text style={estilos.heroSubtitulo}>
                {eventoHoy.fecha_hora_inicio.slice(11, 16)} hs
                {eventoHoy.duracion_estimada_min ? ` · ${eventoHoy.duracion_estimada_min} min` : ''} ·{' '}
                {ETIQUETA_INTENSIDAD[eventoHoy.intensidad]}
              </Text>

              {/* Si es gimnasio o propio lleva boton; si es deporte elegido NO lleva boton de temporizador */}
              {esGimnasio && (
                <Pressable
                  style={({ pressed }) => [
                    estilos.heroBoton,
                    pressed && estilos.heroBotonPresionado,
                  ]}
                  onPress={() => router.push(`/evento/rutina?eventoId=${eventoHoy.id}`)}
                >
                  <Ionicons name="play" size={16} color={colors.textOnAction} />
                  <Text style={estilos.heroBotonTexto}>Empezar entrenamiento</Text>
                </Pressable>
              )}

              {esPropio && (
                <Pressable
                  style={({ pressed }) => [
                    estilos.heroBoton,
                    pressed && estilos.heroBotonPresionado,
                  ]}
                  onPress={() => router.push(`/evento/temporizador?eventoId=${eventoHoy.id}`)}
                >
                  <Ionicons name="play" size={16} color={colors.textOnAction} />
                  <Text style={estilos.heroBotonTexto}>Iniciar con temporizador</Text>
                </Pressable>
              )}
            </Pressable>
          );
        })()
      ) : (
        <View style={estilos.heroVacioCard}>
          <View style={estilos.heroVacioInfo}>
            <Text style={estilos.heroVacioTitulo}>Sin entrenamiento para hoy</Text>
            <Text style={estilos.heroVacioSubtitulo}>
              Podés descansar o arrancar una rutina libre o de intervalos.
            </Text>
          </View>
          <Pressable
            style={estilos.heroVacioBoton}
            onPress={() => setSheetEntrenarVisible(true)}
          >
            <Ionicons name="barbell-outline" size={16} color={colors.action} />
            <Text style={estilos.heroVacioBotonTexto}>Entrenar</Text>
          </Pressable>
        </View>
      )}

      {/* Sección: Mis Rutinas */}
      <View style={estilos.seccionFila}>
        <Text style={estilos.seccionTitulo}>Mis Rutinas</Text>
        <View style={estilos.seccionAcciones}>
          <Pressable
            onPress={() => router.push('/rutina-gimnasio/predefinidas')}
            hitSlop={8}
          >
            <Text style={estilos.seccionAccionTexto}>Explorar predefinidas</Text>
          </Pressable>
          <Pressable
            onPress={() => router.push('/rutina-gimnasio/nueva')}
            hitSlop={8}
          >
            <Text style={estilos.seccionAccionTexto}>+ Nueva</Text>
          </Pressable>
        </View>
      </View>

      {misRutinas.length === 0 ? (
        <View style={estilos.cardVacia}>
          <Ionicons name="barbell-outline" size={28} color={colors.textMuted} />
          <Text style={estilos.cardVaciaTexto}>No tenés rutinas definidas todavía.</Text>
          <Pressable
            style={estilos.cardVaciaBoton}
            onPress={() => router.push('/rutina-gimnasio/nueva')}
          >
            <Text style={estilos.cardVaciaBotonTexto}>Crear mi primera rutina</Text>
          </Pressable>
          <Pressable
            style={estilos.cardVaciaEnlace}
            onPress={() => router.push('/rutina-gimnasio/predefinidas')}
            hitSlop={8}
          >
            <Text style={estilos.seccionAccionTexto}>Ver rutinas predefinidas</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={estilos.scrollRutinasContenedor}
          contentContainerStyle={estilos.scrollRutinas}
        >
          {misRutinas.map((r) => {
            const diasOrd = [...(r.dias ?? [])].sort(
              (a, b) => ORDEN_DOMINGO_PRIMERO.indexOf(a) - ORDEN_DOMINGO_PRIMERO.indexOf(b),
            );

            return (
              <Pressable
                key={r.id}
                style={({ pressed }) => [
                  estilos.rutinaCard,
                  pressed && estilos.cardPresionada,
                ]}
                onPress={() =>
                  router.push(
                    `/evento/rutina?rutinaGimnasioId=${r.id}&nombreRutina=${encodeURIComponent(
                      r.nombre,
                    )}`,
                  )
                }
              >
                {/* Badges de días */}
                {diasOrd.length > 0 && (
                  <View style={estilos.diasFila}>
                    {diasOrd.map((diaNum) => (
                      <View key={diaNum} style={estilos.diaBadge}>
                        <Text style={estilos.diaBadgeTexto}>{LETRAS_DIAS[diaNum]}</Text>
                      </View>
                    ))}
                  </View>
                )}

                <Text style={estilos.rutinaCardTitulo} numberOfLines={1}>
                  {r.nombre}
                </Text>

                <Text style={estilos.rutinaCardDetalle}>
                  {r.ejercicios.length} {r.ejercicios.length === 1 ? 'ejercicio' : 'ejercicios'}
                  {r.hora ? ` · ${r.hora.replace(/^0/, '')}` : ''}
                </Text>

                <View style={estilos.rutinaCardFooter}>
                  <Text style={estilos.rutinaCardIniciar}>Iniciar ›</Text>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      {/* Sección: Sesiones Recientes */}
      <View style={estilos.seccionFila}>
        <Text style={estilos.seccionTitulo}>Sesiones recientes</Text>
      </View>

      {/* Tabs de filtro: Hoy, Semana, Mes */}
      <View style={estilos.tabsFiltro}>
        {FILTROS_SESION.map((f) => {
          const activo = filtroSesion === f.id;
          return (
            <Pressable
              key={f.id}
              accessibilityRole="button"
              accessibilityState={{ selected: activo }}
              style={({ pressed }) => [
                estilos.tabChip,
                activo && estilos.tabChipActivo,
                pressed && !activo && estilos.tabChipPresionado,
              ]}
              onPress={() => setFiltroSesion(f.id)}
            >
              <Text style={[estilos.tabChipTexto, activo && estilos.tabChipTextoActivo]}>
                {f.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={estilos.cardFeed}>
        {sesionesFiltradas.length === 0 ? (
          <View style={estilos.feedVacio}>
            <Text style={estilos.feedVacioTexto}>{textoVacio}</Text>
          </View>
        ) : (
          sesionesFiltradas.map((s, idx) => {
            const esGym = s.tipo === 'gimnasio' || s.modo === 'rutina' || s.series_count > 0;
            const esIntervalos = s.modo === 'pasadas';
            const esCronometro = s.modo === 'cronometro';
            const fechaTxt = formatearFechaCorta(s.fecha, hoyFecha);
            const duracionTxt = formatearDuracionMin(s.duracion_real_seg, s.duracion_estimada_min);

            const deporteCap = capitalizarDeporte(deporte);
            const nombreEntrenamiento = deporteCap
              ? (deporteCap.toLowerCase().startsWith('entrenamiento') ? deporteCap : `Entrenamiento ${deporteCap}`)
              : 'Entrenamiento';

            const nombreSesion =
              esIntervalos
                ? 'Pasadas por intervalos'
                : esGym
                ? (s.rutina_nombre ?? 'Gimnasio')
                : s.tipo === 'partido'
                ? 'Partido'
                : esCronometro
                ? 'Carrera / Tiempo libre'
                : nombreEntrenamiento;

            const iconoNombre =
              esGym
                ? 'barbell-outline'
                : esIntervalos
                ? 'timer-outline'
                : esCronometro
                ? 'stopwatch-outline'
                : s.tipo === 'partido'
                ? 'football-outline'
                : 'fitness-outline';

            return (
              <Pressable
                key={s.evento_id}
                style={({ pressed }) => [
                  estilos.feedItem,
                  idx < sesionesFiltradas.length - 1 && estilos.feedSeparador,
                  pressed && estilos.feedItemPresionado,
                ]}
                onPress={() => router.push(`/evento/${s.evento_id}`)}
              >
                <View style={estilos.feedIcono}>
                  <Ionicons name={iconoNombre} size={sizes.iconSmall} color={colors.action} />
                </View>

                <View style={estilos.feedInfo}>
                  <View style={estilos.feedTopFila}>
                    <Text style={estilos.feedItemTitulo} numberOfLines={1}>
                      {nombreSesion}
                    </Text>
                    <Text style={estilos.feedItemFecha}>{fechaTxt}</Text>
                  </View>

                  {/* Métricas destacadas según el tipo */}
                  <View style={estilos.feedMetricasFila}>
                    {esGym ? (
                      <>
                        <Text style={estilos.feedMetrica}>
                          {s.volumen_kg > 0 ? `${Math.round(s.volumen_kg)} kg` : 'Peso corporal'}
                        </Text>
                        <Text style={estilos.feedMetricaSeparador}>·</Text>
                        <Text style={estilos.feedMetrica}>
                          {s.series_count} {s.series_count === 1 ? 'serie' : 'series'}
                        </Text>
                        <Text style={estilos.feedMetricaSeparador}>·</Text>
                        <Text style={estilos.feedMetrica}>{duracionTxt}</Text>
                      </>
                    ) : esIntervalos ? (
                      <>
                        <Text style={estilos.feedMetrica}>
                          {s.bloques_completados ?? 1} {(s.bloques_completados ?? 1) === 1 ? 'bloque' : 'bloques'}
                        </Text>
                        <Text style={estilos.feedMetricaSeparador}>·</Text>
                        <Text style={estilos.feedMetrica}>{duracionTxt}</Text>
                      </>
                    ) : esCronometro && s.distancia_km ? (
                      <>
                        <Text style={estilos.feedMetrica}>{s.distancia_km} km</Text>
                        <Text style={estilos.feedMetricaSeparador}>·</Text>
                        <Text style={estilos.feedMetrica}>{duracionTxt}</Text>
                      </>
                    ) : (
                      <>
                        <Text style={estilos.feedMetrica}>{duracionTxt}</Text>
                        <Text style={estilos.feedMetricaSeparador}>·</Text>
                        <Text style={estilos.feedMetrica}>
                          {ETIQUETA_INTENSIDAD[s.intensidad as Intensidad] ?? ''}
                        </Text>
                      </>
                    )}
                  </View>
                </View>

                <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
              </Pressable>
            );
          })
        )}
      </View>

      {/* Modal para elegir modo de entrenamiento libre */}
      <SheetModoEntrenamiento
        visible={sheetEntrenarVisible}
        onCerrar={() => setSheetEntrenarVisible(false)}
      />
    </Pantalla>
  );
}

const estilos = StyleSheet.create({
  centrado: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: spacing.xs,
  },
  titulo: {
    fontSize: fontSize.title,
    lineHeight: lineHeight.title,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  headerAcciones: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  botonAccionHeader: {
    padding: spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  botonNuevaRutina: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.action,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    gap: 2,
  },
  botonNuevaRutinaTexto: {
    fontSize: fontSize.caption,
    fontWeight: fontWeight.bold,
    color: colors.textOnAction,
  },

  // Hero Card: fondo azul marino con acento crema
  heroCard: {
    backgroundColor: colors.action,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.xs,
    marginTop: spacing.xs,
    ...shadow.card,
  },
  heroTopFila: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  badgeHoy: {
    backgroundColor: colors.accentSoft,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  badgeHoyTexto: {
    fontSize: 10,
    fontWeight: fontWeight.bold,
    color: colors.textOnAccentSoft,
    letterSpacing: 0.5,
  },
  badgeHoyCompletado: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.accentSoft,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
    gap: 4,
  },
  heroResumenFila: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginTop: spacing.xs,
    marginBottom: spacing.xs,
  },
  heroResumenItem: {
    alignItems: 'center',
    flex: 1,
  },
  heroResumenValor: {
    fontSize: fontSize.subtitle,
    fontWeight: fontWeight.bold,
    color: colors.textOnAction,
  },
  heroResumenEtiqueta: {
    fontSize: fontSize.caption,
    color: colors.surfaceAlt,
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  heroResumenSeparador: {
    width: 1,
    height: 24,
    backgroundColor: colors.accentSoft,
    opacity: 0.3,
  },
  heroBotonDetalle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  heroTitulo: {
    fontSize: fontSize.subtitle,
    lineHeight: lineHeight.subtitle,
    fontWeight: fontWeight.bold,
    color: colors.textOnAction,
    marginTop: spacing.xs,
  },
  heroSubtitulo: {
    fontSize: fontSize.small,
    lineHeight: lineHeight.small,
    color: colors.surfaceAlt,
    marginBottom: spacing.sm,
  },
  heroBoton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  heroBotonPresionado: {
    backgroundColor: colors.actionPressed,
  },
  heroBotonTexto: {
    fontSize: fontSize.body,
    fontWeight: fontWeight.bold,
    color: colors.textOnAction,
  },

  // Hero vacio (cuando hoy no toca nada)
  heroVacioCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.xs,
    ...shadow.card,
  },
  heroVacioInfo: {
    flex: 1,
    gap: 2,
    marginRight: spacing.sm,
  },
  heroVacioTitulo: {
    fontSize: fontSize.body,
    fontWeight: fontWeight.medium,
    color: colors.textPrimary,
  },
  heroVacioSubtitulo: {
    fontSize: fontSize.caption,
    lineHeight: lineHeight.caption,
    color: colors.textSecondary,
  },
  heroVacioBoton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    gap: spacing.xs,
  },
  heroVacioBotonTexto: {
    fontSize: fontSize.small,
    fontWeight: fontWeight.medium,
    color: colors.action,
  },

  // Secciones
  seccionFila: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  seccionTitulo: {
    fontSize: fontSize.caption,
    fontWeight: fontWeight.bold,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  seccionAcciones: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  seccionAccionTexto: {
    fontSize: fontSize.caption,
    fontWeight: fontWeight.medium,
    color: colors.action,
  },

  // Scroll horizontal de Mis Rutinas
  scrollRutinasContenedor: {
    flexGrow: 0,
  },
  scrollRutinas: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  rutinaCard: {
    width: 144,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.sm + 2,
    gap: spacing.xs,
    alignSelf: 'flex-start',
    flexShrink: 0,
    ...shadow.card,
  },
  cardPresionada: {
    opacity: 0.85,
  },
  diasFila: {
    flexDirection: 'row',
    gap: 3,
    marginBottom: 2,
  },
  diaBadge: {
    backgroundColor: colors.accentSoft,
    width: 18,
    height: 18,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  diaBadgeTexto: {
    fontSize: 9,
    fontWeight: fontWeight.bold,
    color: colors.textOnAccentSoft,
  },
  rutinaCardTitulo: {
    fontSize: fontSize.small,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  rutinaCardDetalle: {
    fontSize: fontSize.caption,
    lineHeight: lineHeight.caption,
    color: colors.textSecondary,
  },
  rutinaCardFooter: {
    marginTop: spacing.xs,
  },
  rutinaCardIniciar: {
    fontSize: fontSize.caption,
    fontWeight: fontWeight.bold,
    color: colors.action,
  },

  cardVacia: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    ...shadow.card,
  },
  cardVaciaTexto: {
    fontSize: fontSize.small,
    color: colors.textSecondary,
  },
  cardVaciaBoton: {
    marginTop: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
  },
  cardVaciaEnlace: {
    paddingVertical: spacing.xs,
  },
  cardVaciaBotonTexto: {
    fontSize: fontSize.small,
    fontWeight: fontWeight.medium,
    color: colors.action,
  },

  // Tabs de filtro de sesiones recientes
  tabsFiltro: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  tabChip: {
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: sizes.hairline,
    borderColor: colors.borderStrong,
  },
  tabChipActivo: {
    backgroundColor: colors.action,
    borderColor: colors.action,
  },
  tabChipPresionado: {
    backgroundColor: colors.surfaceAlt,
  },
  tabChipTexto: {
    fontSize: fontSize.small,
    lineHeight: lineHeight.small,
    fontWeight: fontWeight.medium,
    color: colors.textSecondary,
  },
  tabChipTextoActivo: {
    color: colors.textOnAction,
  },

  // Feed de sesiones recientes
  cardFeed: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    ...shadow.card,
  },
  feedVacio: {
    paddingVertical: spacing.xl,
    alignItems: 'center',
  },
  feedVacioTexto: {
    fontSize: fontSize.small,
    color: colors.textMuted,
  },
  feedItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  feedSeparador: {
    borderBottomWidth: sizes.hairline,
    borderBottomColor: colors.border,
  },
  feedItemPresionado: {
    opacity: 0.6,
  },
  feedIcono: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  feedInfo: {
    flex: 1,
    gap: 2,
  },
  feedTopFila: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  feedItemTitulo: {
    fontSize: fontSize.body,
    fontWeight: fontWeight.medium,
    color: colors.textPrimary,
    flex: 1,
    marginRight: spacing.xs,
  },
  feedItemFecha: {
    fontSize: fontSize.caption,
    color: colors.textSecondary,
  },
  feedMetricasFila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  feedMetrica: {
    fontSize: fontSize.caption,
    color: colors.textSecondary,
  },
  feedMetricaSeparador: {
    fontSize: fontSize.caption,
    color: colors.textMuted,
  },
});
