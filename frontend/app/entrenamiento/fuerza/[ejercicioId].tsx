// app/entrenamiento/fuerza/[ejercicioId].tsx
//
// Fuerza y Progresion, pantalla 2: el detalle de UN ejercicio. Se llega desde
// la lista por rutina (fuerza/index.tsx) o directo desde el detalle de un
// evento de gimnasio ("Progresion ›").
// - Card de 1RM estimado (formula de Epley) con la palabra 'estimado'.
// - Metric card con mejor serie, volumen semanal y frecuencia.
// - Grafico de evolucion reutilizando el SVG de GraficoPeso.
// - Card informativa del coach (sobria, sin gamificacion ni trofeos).
// - Desglose cronologico de series por sesion.

import { useState, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { Pantalla } from '@/ui/Pantalla';
import {
  colors,
  spacing,
  radius,
  fontSize,
  fontWeight,
  lineHeight,
  shadow,
  sizes,
} from '@/ui/theme';

import { obtenerPerfilLocal } from '@/db/queries/perfil';
import { listarSeriesPorEjercicio, type SerieConSesion } from '@/db/queries/sesiones';
import { obtenerEjercicio } from '@/db/queries/ejercicios';
import type { EjercicioRow } from '@/db/schema';
import {
  estimarUnaRM,
  mejorSerieDe,
  volumenTotal,
  evolucion1RM,
  textoCoachFuerza,
  type PuntoEvolucion1RM,
} from '@/lib/fuerza';
import { GraficoPeso } from '@/features/progreso/components/GraficoPeso';
import { aFechaLocal, diasEntre } from '@/lib/fechas';
import { partesFecha } from '@/features/agenda/formato';

interface SesionAgrupada {
  fecha: string;
  sesionId: string;
  series: SerieConSesion[];
  mejor1RM: number | null;
}

export default function DetalleFuerzaEjercicio() {
  const router = useRouter();
  const { ejercicioId } = useLocalSearchParams<{ ejercicioId: string }>();

  const [cargando, setCargando] = useState(true);
  const [ejercicio, setEjercicio] = useState<EjercicioRow | null>(null);
  const [series, setSeries] = useState<SerieConSesion[]>([]);
  const [evolucion, setEvolucion] = useState<PuntoEvolucion1RM[]>([]);

  const hoyStr = aFechaLocal(new Date());

  useFocusEffect(
    useCallback(() => {
      if (!ejercicioId) return;
      let vivo = true;
      (async () => {
        try {
          const [perfil, ej] = await Promise.all([
            obtenerPerfilLocal(),
            obtenerEjercicio(ejercicioId),
          ]);
          if (!vivo) return;
          setEjercicio(ej);
          if (!perfil || !ej) return;

          const dataSeries = await listarSeriesPorEjercicio(perfil.id, ej.id);
          if (!vivo) return;
          setSeries(dataSeries);
          setEvolucion(evolucion1RM(dataSeries));
        } catch (e) {
          console.error('Error al cargar la progresion del ejercicio:', e);
        } finally {
          if (vivo) setCargando(false);
        }
      })();
      return () => {
        vivo = false;
      };
    }, [ejercicioId]),
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

  if (!ejercicio || series.length === 0) {
    return (
      <Pantalla>
        <View style={estilos.header}>
          <Pressable onPress={() => router.back()} hitSlop={12} style={estilos.botonVolver}>
            <Ionicons name="arrow-back" size={20} color={colors.textPrimary} />
          </Pressable>
          <Text style={estilos.titulo}>{ejercicio?.nombre ?? 'Ejercicio'}</Text>
        </View>
        <View style={estilos.cardVacia}>
          <Ionicons name="barbell-outline" size={36} color={colors.textMuted} />
          <Text style={estilos.cardVaciaTitulo}>
            {ejercicio ? 'Sin registros todavía' : 'Este ejercicio ya no existe'}
          </Text>
          {ejercicio ? (
            <Text style={estilos.cardVaciaTexto}>
              Hacelo en una rutina de gimnasio para empezar a ver la evolución de tus cargas y el 1RM estimado.
            </Text>
          ) : null}
        </View>
      </Pantalla>
    );
  }

  // Calculos para el ejercicio seleccionado
  const ultimoPunto = evolucion.length > 0 ? evolucion[evolucion.length - 1] : null;
  const unRMEstimado = ultimoPunto ? ultimoPunto.estimado : null;
  const mejorSerie = mejorSerieDe(series);

  // Volumen de los ultimos 7 dias
  const seriesSemana = series.filter((s) => Math.abs(diasEntre(s.fecha, hoyStr)) <= 7);
  const volumenSemana = volumenTotal(seriesSemana);

  // Frecuencia semanal en los ultimos 28 dias
  const diasUltimas4Semanas = new Set(
    series.filter((s) => Math.abs(diasEntre(s.fecha, hoyStr)) <= 28).map((s) => s.fecha),
  ).size;
  const frecuenciaSemanalPromedio = Math.round((diasUltimas4Semanas / 4) * 10) / 10;

  // Texto sobrio del coach
  const coachTexto = textoCoachFuerza(evolucion, ejercicio.nombre);

  // Puntos para GraficoPeso
  const puntosGrafico = evolucion.map((p) => ({
    fecha: p.fecha,
    peso_kg: p.estimado,
  }));

  // Agrupacion de series por sesion para el historial
  const mapaSesiones = new Map<string, SesionAgrupada>();
  for (const s of series) {
    const clave = s.sesion_id || s.fecha;
    const actual = mapaSesiones.get(clave);
    const est = estimarUnaRM(s.peso_kg, s.repeticiones);

    if (!actual) {
      mapaSesiones.set(clave, {
        fecha: s.fecha,
        sesionId: s.sesion_id,
        series: [s],
        mejor1RM: est,
      });
    } else {
      actual.series.push(s);
      if (est !== null && (actual.mejor1RM === null || est > actual.mejor1RM)) {
        actual.mejor1RM = est;
      }
    }
  }

  // Ordenar sesiones de mas reciente a mas antigua
  const historialSesiones = Array.from(mapaSesiones.values()).sort(
    (a, b) => b.fecha.localeCompare(a.fecha),
  );

  return (
    <Pantalla>
      {/* Header */}
      <View style={estilos.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={estilos.botonVolver}>
          <Ionicons name="arrow-back" size={20} color={colors.textPrimary} />
        </Pressable>
        <View style={estilos.flex}>
          <Text style={estilos.titulo} numberOfLines={1}>{ejercicio.nombre}</Text>
          <Text style={estilos.subtitulo}>{ejercicio.grupo}</Text>
        </View>
      </View>

      {/* Card principal: 1RM Estimado y metricas */}
      <View style={estilos.card}>
        <Text style={estilos.seccionSubtitulo}>1RM Estimado</Text>

        <View style={estilos.filaPrincipal}>
          {unRMEstimado !== null ? (
            <View style={estilos.filaNumero1RM}>
              <Text style={estilos.numeroGrande}>{unRMEstimado}</Text>
              <View style={estilos.columnaUnidad}>
                <Text style={estilos.unidadKg}>kg</Text>
                <Text style={estilos.etiquetaEstimado}>estimado</Text>
              </View>
            </View>
          ) : (
            <View style={estilos.avisoSin1RM}>
              <Ionicons name="information-circle-outline" size={18} color={colors.textSecondary} />
              <Text style={estilos.textoAvisoSin1RM}>
                Hacé pocas series de baja repetición para estimar
              </Text>
            </View>
          )}
        </View>

        <View style={estilos.separador} />

        {/* Metricas secundarias que no dependen de 1RM */}
        <View style={estilos.metricasFila}>
          <View style={estilos.metricaColumna}>
            <Text style={estilos.metricaNumero}>
              {mejorSerie && mejorSerie.peso_kg !== null && mejorSerie.peso_kg > 0
                ? `${mejorSerie.peso_kg} kg × ${mejorSerie.repeticiones}`
                : '—'}
            </Text>
            <Text style={estilos.metricaLabel}>Mejor serie</Text>
          </View>

          <View style={estilos.metricaSeparador} />

          <View style={estilos.metricaColumna}>
            <Text style={estilos.metricaNumero}>{Math.round(volumenSemana)} kg</Text>
            <Text style={estilos.metricaLabel}>Volumen semana</Text>
          </View>

          <View style={estilos.metricaSeparador} />

          <View style={estilos.metricaColumna}>
            <Text style={estilos.metricaNumero}>
              {frecuenciaSemanalPromedio > 0
                ? `${frecuenciaSemanalPromedio} / sem`
                : '0 / sem'}
            </Text>
            <Text style={estilos.metricaLabel}>Frecuencia</Text>
          </View>
        </View>
      </View>

      {/* Grafico de evolucion */}
      <View style={estilos.card}>
        <Text style={estilos.seccionSubtitulo}>Evolución de 1RM</Text>
        {puntosGrafico.length > 0 ? (
          <GraficoPeso
            crudos={puntosGrafico}
            tendencia={puntosGrafico.length > 1 ? puntosGrafico : []}
            objetivoKg={null}
          />
        ) : (
          <Text style={estilos.textoVacioGrafico}>
            Todavía no hay suficientes series con carga y hasta 12 repeticiones para trazar la curva de este ejercicio.
          </Text>
        )}
      </View>

      {/* Card del Coach informativa */}
      <View style={estilos.cardCoach}>
        <View style={estilos.coachHeader}>
          <Ionicons name="sparkles-outline" size={16} color={colors.action} />
          <Text style={estilos.coachTitulo}>Análisis de carga</Text>
        </View>
        <Text style={estilos.coachTexto}>
          {coachTexto ??
            'Registrá más sesiones con este ejercicio para ver la tendencia de cargas a lo largo de las semanas.'}
        </Text>
      </View>

      {/* Historial de sesiones */}
      <View style={estilos.card}>
        <Text style={estilos.seccionSubtitulo}>Historial de sesiones</Text>

        {historialSesiones.length === 0 ? (
          <Text style={estilos.textoVacioGrafico}>No hay series registradas.</Text>
        ) : (
          historialSesiones.map((ses, idx) => {
            const { dia, mes } = partesFecha(ses.fecha);
            return (
              <View
                key={ses.sesionId || ses.fecha}
                style={[
                  estilos.sesionHistorialItem,
                  idx < historialSesiones.length - 1 && estilos.bordeInferior,
                ]}
              >
                <View style={estilos.sesionHistorialHeader}>
                  <Text style={estilos.sesionFechaTexto}>
                    {dia} de {mes}
                  </Text>
                  {ses.mejor1RM !== null && (
                    <Text style={estilos.sesion1RMTag}>
                      1RM est: {ses.mejor1RM} kg
                    </Text>
                  )}
                </View>

                <View style={estilos.seriesGrid}>
                  {ses.series.map((s, sIdx) => (
                    <View key={s.id || sIdx} style={estilos.seriePill}>
                      <Text style={estilos.seriePillNum}>S{sIdx + 1}</Text>
                      <Text style={estilos.seriePillValor}>
                        {s.peso_kg !== null && s.peso_kg > 0
                          ? `${s.peso_kg} kg × ${s.repeticiones}`
                          : `Corporal × ${s.repeticiones}`}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            );
          })
        )}
      </View>
    </Pantalla>
  );
}

const estilos = StyleSheet.create({
  flex: { flex: 1 },
  centrado: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  botonVolver: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    ...shadow.card,
  },
  titulo: {
    fontSize: fontSize.title,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  subtitulo: {
    fontSize: fontSize.small,
    color: colors.textSecondary,
    textTransform: 'capitalize',
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    ...shadow.card,
    gap: spacing.sm,
  },
  seccionSubtitulo: {
    fontSize: fontSize.small,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  filaPrincipal: {
    flexDirection: 'row',
    alignItems: 'baseline',
    paddingVertical: spacing.xs,
  },
  filaNumero1RM: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.xs,
  },
  numeroGrande: {
    fontSize: fontSize.display,
    fontWeight: '800',
    color: colors.action,
    lineHeight: lineHeight.display,
  },
  columnaUnidad: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  unidadKg: {
    fontSize: fontSize.body,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  etiquetaEstimado: {
    fontSize: fontSize.caption,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  avisoSin1RM: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
  },
  textoAvisoSin1RM: {
    fontSize: fontSize.small,
    color: colors.textSecondary,
    lineHeight: lineHeight.small,
    flex: 1,
  },
  separador: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.xs,
  },
  metricasFila: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  metricaColumna: {
    flex: 1,
    alignItems: 'center',
  },
  metricaNumero: {
    fontSize: fontSize.body,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  metricaLabel: {
    fontSize: fontSize.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  metricaSeparador: {
    width: 1,
    height: 24,
    backgroundColor: colors.border,
  },
  textoVacioGrafico: {
    fontSize: fontSize.small,
    color: colors.textSecondary,
    lineHeight: lineHeight.small,
    paddingVertical: spacing.sm,
  },
  cardCoach: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  coachHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  coachTitulo: {
    fontSize: fontSize.caption,
    fontWeight: '600',
    color: colors.action,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  coachTexto: {
    fontSize: fontSize.small,
    lineHeight: lineHeight.small,
    color: colors.textPrimary,
  },
  sesionHistorialItem: {
    paddingVertical: spacing.sm,
    gap: spacing.xs,
  },
  bordeInferior: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sesionHistorialHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sesionFechaTexto: {
    fontSize: fontSize.body,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  sesion1RMTag: {
    fontSize: fontSize.caption,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  seriesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    paddingTop: 2,
  },
  seriePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.sm,
    paddingVertical: 2,
    paddingHorizontal: spacing.xs,
  },
  seriePillNum: {
    fontSize: fontSize.caption,
    fontWeight: '700',
    color: colors.action,
  },
  seriePillValor: {
    fontSize: fontSize.caption,
    color: colors.textSecondary,
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
});
