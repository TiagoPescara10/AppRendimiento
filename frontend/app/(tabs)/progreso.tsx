// Pantalla de Progreso. Contesta una pregunta distinta a la del dashboard: no
// "como voy hoy" sino "como vengo".
//
// EL ORDEN DE LAS CARDS ES UNA DECISION, no el orden en que se escribieron.
// Esta es la pantalla donde mas facil se lee un fracaso, asi que la constancia
// va JUSTO DEBAJO del peso: si el peso bajo poco, al lado esta lo que el
// usuario si controla. Y no hay ni un mensaje de reto ni una felicitacion en
// ningun lado; los numeros hablan solos.
//
// Aca no se calcula nada. Los datos llegan armados de features/progreso/api.ts
// y los textos de features/progreso/formato.ts, que son los dos archivos con
// pruebas. Esto dibuja.

import { useCallback, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { Pantalla } from '@/ui/Pantalla';
import { colors, spacing, radius, fontSize, fontWeight, lineHeight, shadow, sizes } from '@/ui/theme';

import { etiquetaTipo } from '@/features/agenda/formato';
import { cargarProgreso } from '@/features/progreso/api';
import type { DatosProgreso } from '@/features/progreso/api';
import type { EntrenamientoPropio } from '@/lib/progreso';
import { GraficoPeso } from '@/features/progreso/components/GraficoPeso';
import {
  ETIQUETA_PERIODO,
  avisoRitmo,
  fechaCorta,
  kg,
  textoDelta,
  textoDuracion,
  textoPeriodo,
  textoProyeccion,
  textoSesion,
} from '@/features/progreso/formato';
import type { Periodo } from '@/features/progreso/formato';

const PERIODOS: Periodo[] = ['semana', 'mes', 'todo'];

export default function Progreso() {
  // Mes por defecto: una semana de peso es ruido y "todo" no dice como venis
  // ahora. El mes es la ventana mas corta en la que una tendencia significa algo.
  const [periodo, setPeriodo] = useState<Periodo>('mes');
  const [datos, setDatos] = useState<DatosProgreso | null>(null);

  useFocusEffect(
    useCallback(() => {
      let vivo = true;
      cargarProgreso(periodo)
        .then((d) => {
          if (vivo) setDatos(d);
        })
        .catch((e) => console.error('Error al cargar el progreso:', e));
      return () => {
        vivo = false;
      };
    }, [periodo]),
  );

  return (
    <Pantalla style={estilos.pantalla}>
      <Text style={estilos.titulo}>Progreso</Text>

      <View style={estilos.chips}>
        {PERIODOS.map((p) => (
          <Chip
            key={p}
            texto={ETIQUETA_PERIODO[p]}
            activo={p === periodo}
            onPress={() => setPeriodo(p)}
          />
        ))}
      </View>

      {!datos ? (
        <Text style={estilos.detalle}>Cargando…</Text>
      ) : (
        <>
          <CardPeso datos={datos} />
          <CardConstancia datos={datos} />
          <CardPropios datos={datos} />
          <CardNutricion datos={datos} />
        </>
      )}
    </Pantalla>
  );
}

// ---------------------------------------------------------------------------
// Header de seccion con punto de color
// ---------------------------------------------------------------------------

function HeaderSeccion({ titulo, color }: { titulo: string; color: string }) {
  return (
    <View style={estilos.headerSeccion}>
      <View style={[estilos.puntoSeccion, { backgroundColor: color }]} />
      <Text style={estilos.seccion}>{titulo}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Peso
// ---------------------------------------------------------------------------

function CardPeso({ datos }: { datos: DatosProgreso }) {
  const { peso, hoy } = datos;
  const { proyeccion, deltaKg, direccion } = peso;

  // Verde si el peso se movio para donde el perfil quiere, ambar si fue para
  // el otro lado. Con objetivo mantener o rendimiento no hay lado bueno y
  // queda gris: pintar uno de los dos seria afirmar algo que nadie pidio.
  const sentido = deltaKg === null || Math.abs(deltaKg) < 0.05 ? 0 : Math.sign(deltaKg);
  const estiloDelta =
    direccion === 0 || sentido === 0
      ? estilos.deltaNeutro
      : sentido === direccion
      ? estilos.deltaBien
      : estilos.deltaMal;

  const hayTendencia = proyeccion.clase !== 'sin_datos';
  const texto = textoProyeccion(proyeccion, peso.objetivoKg, hoy);
  const aviso = avisoRitmo(proyeccion);

  return (
    <>
      <HeaderSeccion titulo="Peso" color={colors.seccionPeso} />
      <View style={estilos.card}>
        <View style={estilos.filaPeso}>
          <View>
            <Text style={estilos.numeroGrande}>
              {peso.actualKg === null ? '—' : kg(peso.actualKg)}
              <Text style={estilos.unidad}> kg</Text>
            </Text>
            {peso.actualKg !== null && (
              <Text style={estilos.detalle}>Último registro · {fechaCorta(hoy)}</Text>
            )}
          </View>

          {deltaKg !== null && (
            <View style={estilos.columnaDelta}>
              <Text style={[estilos.delta, estiloDelta]}>{textoDelta(deltaKg)}</Text>
              <Text style={estilos.deltaPeriodo}>{textoPeriodo(datos.periodo)}</Text>
            </View>
          )}
        </View>

        {peso.crudos.length === 0 ? (
          <Text style={estilos.vacio}>
            No hay pesadas {textoPeriodo(datos.periodo)}.
          </Text>
        ) : (
          <GraficoPeso
            crudos={peso.crudos}
            tendencia={peso.tendencia}
            objetivoKg={peso.objetivoKg}
          />
        )}

        {/* Con menos de tres dias no hay tendencia ni proyeccion: solo los
            puntos y una invitacion. Dibujar una linea suavizada sobre dos
            valores seria darle forma de conclusion a dos numeros sueltos. */}
        {peso.crudos.length > 0 && !hayTendencia && (
          <Text style={estilos.invitacion}>
            Con dos pesadas todavía no hay tendencia. Pesate dos o tres veces por semana,
            siempre a la misma hora, y acá se va a ver la línea.
          </Text>
        )}

        {hayTendencia && (
          <View style={estilos.proyeccion}>
            <Text style={estilos.proyeccionTitulo}>{texto.titulo}</Text>
            <Text style={estilos.proyeccionDetalle}>{texto.detalle}</Text>

            {/* HUECO PREVISTO: el aviso de ritmo demasiado rapido (bajar mas de
                750 g por semana). avisoRitmo() devuelve null hasta que la regla
                se implemente; cuando devuelva un texto, aparece solo. */}
            {aviso && <Text style={estilos.proyeccionAviso}>{aviso}</Text>}
          </View>
        )}
      </View>
    </>
  );
}

// ---------------------------------------------------------------------------
// Constancia — SOLO los eventos que vienen de una rutina
//
// El filtro es rutina_id NOT NULL: el club, el gimnasio. Un compromiso que ya
// existia y que se cumplio o no, que es lo unico sobre lo que un porcentaje
// significa algo.
// ---------------------------------------------------------------------------

function CardConstancia({ datos }: { datos: DatosProgreso }) {
  const { asistencia, deportePrincipal } = datos;
  const hay = asistencia.respondidos > 0;
  const porcentaje = Math.round(asistencia.proporcion * 100);

  const { entrenamiento, gimnasio } = asistencia.desglose;
  const mostrarEntrenamiento = entrenamiento !== null && entrenamiento.respondidos > 0;
  const mostrarGimnasio = gimnasio !== null && gimnasio.respondidos > 0;

  return (
    <>
      <HeaderSeccion titulo="Constancia" color={colors.seccionConstancia} />
      <View style={estilos.card}>
        {!hay ? (
          <Text style={estilos.vacio}>
            No tenés entrenamientos de rutina {textoPeriodo(datos.periodo)}.
          </Text>
        ) : (
          <>
            <View style={estilos.filaEncabezadoMetrica}>
              <View style={estilos.flex}>
                <Text style={estilos.linea}>
                  Fuiste a {asistencia.fue} de {asistencia.respondidos}
                </Text>
                <Text style={estilos.detalle}>{textoPeriodo(datos.periodo)}</Text>
              </View>
              <Text style={estilos.numeroGrande}>
                {porcentaje}
                <Text style={estilos.unidad}>%</Text>
              </Text>
            </View>

            <View style={estilos.barraFondo}>
              <View style={[estilos.barraRelleno, { width: `${porcentaje}%` }]} />
            </View>

            {/* Los que ya pasaron y siguen mudos no entran en el porcentaje:
                no contestar no es faltar. Se dicen aparte para que la cuenta
                cierre con lo que se ve en el calendario. */}
            {asistencia.sinResponder > 0 && (
              <Text style={estilos.detalle}>
                {asistencia.sinResponder} sin responder
              </Text>
            )}

            {/* Barras separadas para deporte y gimnasio debajo del general */}
            {(mostrarEntrenamiento || mostrarGimnasio) && (
              <View style={estilos.bloqueDesglose}>
                {mostrarEntrenamiento && (
                  <View style={estilos.itemDesglose}>
                    <View style={estilos.fila}>
                      <View style={estilos.flex}>
                        <Text style={estilos.tituloDesglose}>
                          {etiquetaTipo('entrenamiento', deportePrincipal)}
                        </Text>
                        <Text style={estilos.detalle}>
                          Fuiste a {entrenamiento.fue} de {entrenamiento.respondidos}
                        </Text>
                      </View>
                      <Text style={estilos.porcentajeDesglose}>
                        {Math.round(entrenamiento.proporcion * 100)}%
                      </Text>
                    </View>
                    <View style={estilos.barraFondo}>
                      <View
                        style={[
                          estilos.barraRelleno,
                          { width: `${Math.round(entrenamiento.proporcion * 100)}%` },
                        ]}
                      />
                    </View>
                  </View>
                )}

                {mostrarGimnasio && (
                  <View style={estilos.itemDesglose}>
                    <View style={estilos.fila}>
                      <View style={estilos.flex}>
                        <Text style={estilos.tituloDesglose}>
                          {etiquetaTipo('gimnasio')}
                        </Text>
                        <Text style={estilos.detalle}>
                          Fuiste a {gimnasio.fue} de {gimnasio.respondidos}
                        </Text>
                      </View>
                      <Text style={estilos.porcentajeDesglose}>
                        {Math.round(gimnasio.proporcion * 100)}%
                      </Text>
                    </View>
                    <View style={estilos.barraFondo}>
                      <View
                        style={[
                          estilos.barraRelleno,
                          { width: `${Math.round(gimnasio.proporcion * 100)}%` },
                        ]}
                      />
                    </View>
                  </View>
                )}
              </View>
            )}
          </>
        )}

        <View style={estilos.separador} />

        <View style={estilos.fila}>
          <Text style={estilos.detalle}>Racha actual</Text>
          <Text style={estilos.valor}>
            {asistencia.racha > 0
              ? `${asistencia.racha} ${asistencia.racha === 1 ? 'semana' : 'semanas'}`
              : '—'}
          </Text>
        </View>
      </View>
    </>
  );
}

// ---------------------------------------------------------------------------
// Entrenamientos propios — los que arranco el usuario
//
// El filtro es rutina_id IS NULL y NO llevan porcentaje: nadie se los agendo,
// asi que no hay contra que comparar. Es un contador de volumen.
// ---------------------------------------------------------------------------

// Icono segun el modo de la sesion
function obtenerIconoSesion(item: EntrenamientoPropio): keyof typeof Ionicons.glyphMap {
  const modo = item.sesion?.modo;
  const tipo = item.evento.tipo;

  if (tipo === 'gimnasio' || modo === 'rutina' || (item.sesion?.ejercicios_count ?? 0) > 0) {
    return 'barbell-outline';
  }
  if (modo === 'pasadas') {
    return 'flash-outline';
  }
  if (modo === 'cronometro') {
    return 'stopwatch-outline';
  }
  if (tipo === 'partido' || tipo === 'competencia') {
    return 'football-outline';
  }
  return 'fitness-outline';
}

function tituloSesion(item: EntrenamientoPropio, deportePrincipal: string | null): string {
  return etiquetaTipo(item.evento.tipo, deportePrincipal, {
    rutinaId: item.evento.rutina_id,
    modoEntrenamiento: item.evento.modo_entrenamiento ?? item.sesion?.modo ?? null,
  });
}

function CardPropios({ datos }: { datos: DatosProgreso }) {
  const router = useRouter();
  const { volumen, items } = datos.propios;

  const resumenCarga =
    volumen.sesionesConKm > 0
      ? `${textoDuracion(volumen.segundos)} · ${kg(volumen.km)} km`
      : textoDuracion(volumen.segundos);

  return (
    <>
      <HeaderSeccion titulo="Entrenamientos propios" color={colors.seccionEntrenamientos} />
      <View style={estilos.card}>
        {items.length === 0 ? (
          <Text style={estilos.vacio}>
            No arrancaste ninguna sesión por tu cuenta {textoPeriodo(datos.periodo)}.
          </Text>
        ) : (
          <>
            <View style={estilos.filaEncabezadoMetrica}>
              <View style={estilos.flex}>
                <Text style={estilos.numeroGrande}>
                  {volumen.sesiones}
                  <Text style={estilos.unidad}>
                    {volumen.sesiones === 1 ? ' sesión' : ' sesiones'}
                  </Text>
                </Text>
                <Text style={estilos.detalle}>{textoPeriodo(datos.periodo)}</Text>
              </View>

              <View style={estilos.badgeCarga}>
                <Ionicons name="bar-chart-outline" size={13} color={colors.textSecondary} />
                <Text style={estilos.badgeCargaTexto}>{resumenCarga}</Text>
              </View>
            </View>

            <View style={estilos.separador} />

            <Text style={estilos.subtituloLista}>Últimos entrenamientos</Text>

            <View style={estilos.listaSesiones}>
              {items.map((item, i) => {
                const icono = obtenerIconoSesion(item);
                const titulo = tituloSesion(item, datos.deportePrincipal);
                const resumen = textoSesion(item);

                return (
                  <Pressable
                    key={item.evento.id}
                    accessibilityRole="button"
                    accessibilityLabel={`${titulo}, ${resumen}, ${fechaCorta(item.evento.fecha)}`}
                    style={({ pressed }) => [
                      estilos.sesionFila,
                      i < items.length - 1 && estilos.sesionSeparador,
                      pressed && estilos.sesionPresionada,
                    ]}
                    onPress={() => router.push(`/evento/${item.evento.id}`)}
                  >
                    <View style={estilos.sesionIconoContenedor}>
                      <Ionicons name={icono} size={18} color={colors.action} />
                    </View>

                    <View style={estilos.sesionInfo}>
                      <Text style={estilos.sesionTitulo} numberOfLines={1}>
                        {titulo}
                      </Text>
                      <Text style={estilos.sesionResumen} numberOfLines={1}>
                        {resumen}
                      </Text>
                    </View>

                    <View style={estilos.sesionDerecha}>
                      <Text style={estilos.sesionFecha}>{fechaCorta(item.evento.fecha)}</Text>
                      <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </>
        )}
      </View>
    </>
  );
}

// ---------------------------------------------------------------------------
// Nutricion
// ---------------------------------------------------------------------------

function CardNutricion({ datos }: { datos: DatosProgreso }) {
  const { promedio, objetivo } = datos.nutricion;
  const hay = promedio.diasConRegistro > 0;

  return (
    <>
      <HeaderSeccion titulo="Nutrición" color={colors.seccionNutricion} />
      <View style={estilos.card}>
        <View style={estilos.filaNutricionHeader}>
          <Text style={estilos.subtituloNutricion}>Promedio diario</Text>
          {/* Destacado visualmente: le dice al usuario si el promedio es confiable */}
          <View style={estilos.badgeConfiabilidad}>
            <Ionicons name="calendar-outline" size={12} color={colors.textSecondary} />
            <Text style={estilos.badgeConfiabilidadTexto}>
              {promedio.diasConRegistro} de {datos.diasDelPeriodo} días
            </Text>
          </View>
        </View>

        {!hay ? (
          <Text style={estilos.vacio}>
            No registraste comidas {textoPeriodo(datos.periodo)}.
          </Text>
        ) : (
          <>
            <Text style={estilos.numeroGrande}>
              {promedio.kcal.toLocaleString('es-AR')}
              <Text style={estilos.unidad}>
                {objetivo ? ` / ${objetivo.kcal_objetivo.toLocaleString('es-AR')} kcal` : ' kcal'}
              </Text>
            </Text>

            <View style={estilos.macros}>
              <Macro
                label="Proteína"
                actual={promedio.proteina_g}
                meta={objetivo?.macros.proteina_g ?? null}
                estiloBarra={estilos.barraProteina}
              />
              <Macro
                label="Carbos"
                actual={promedio.carbohidratos_g}
                meta={objetivo?.macros.carbohidratos_g ?? null}
                estiloBarra={estilos.barraCarbos}
              />
              <Macro
                label="Grasas"
                actual={promedio.grasa_g}
                meta={objetivo?.macros.grasa_g ?? null}
                estiloBarra={estilos.barraGrasas}
              />
            </View>
          </>
        )}
      </View>
    </>
  );
}

/** Un macro con su barra (o contador si no hay meta). */
function Macro({
  label,
  actual,
  meta,
  estiloBarra,
}: {
  label: string;
  actual: number;
  meta: number | null;
  estiloBarra: object;
}) {
  const tieneMeta = meta != null && meta > 0;
  const proporcion = tieneMeta ? Math.min(1, actual / meta) : 0;

  return (
    <View style={estilos.macro}>
      <Text style={estilos.macroLabel}>{label}</Text>
      <Text style={estilos.macroValor}>
        {actual}
        <Text style={estilos.macroObjetivo}>{tieneMeta ? ` / ${meta} g` : ' g'}</Text>
      </Text>
      {tieneMeta && (
        <View style={estilos.macroBarraFondo}>
          <View style={[estiloBarra, { width: `${proporcion * 100}%` }]} />
        </View>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------

function Chip({
  texto,
  activo,
  onPress,
}: {
  texto: string;
  activo: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: activo }}
      onPress={onPress}
      style={({ pressed }) => [
        estilos.chip,
        activo && estilos.chipActivo,
        pressed && !activo && estilos.chipPresionado,
      ]}
    >
      <Text style={[estilos.chipTexto, activo && estilos.chipTextoActivo]}>{texto}</Text>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------

const estilos = StyleSheet.create({
  flex: { flex: 1 },

  pantalla: {
    gap: spacing.sm,
    paddingBottom: spacing.xxl,
  },

  titulo: {
    fontSize: fontSize.title,
    lineHeight: lineHeight.title,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },

  chips: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.xs },
  chip: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: sizes.hairline,
    borderColor: colors.borderStrong,
  },
  chipActivo: { backgroundColor: colors.action, borderColor: colors.action },
  chipPresionado: { backgroundColor: colors.surfaceAlt },
  chipTexto: {
    fontSize: fontSize.small,
    lineHeight: lineHeight.small,
    fontWeight: fontWeight.medium,
    color: colors.textSecondary,
  },
  chipTextoActivo: { color: colors.textOnAction },

  headerSeccion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  puntoSeccion: {
    width: 6,
    height: 6,
    borderRadius: radius.pill,
  },
  seccion: {
    fontSize: fontSize.caption,
    lineHeight: lineHeight.caption,
    fontWeight: fontWeight.bold,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.xl,
    gap: spacing.md,
    ...shadow.card,
  },

  filaPeso: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md },
  fila: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  filaEncabezadoMetrica: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },

  numeroGrande: {
    fontSize: fontSize.metric,
    lineHeight: lineHeight.metric,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    letterSpacing: -0.5,
  },
  unidad: {
    fontSize: fontSize.body,
    lineHeight: lineHeight.body,
    fontWeight: fontWeight.regular,
    color: colors.textSecondary,
  },

  columnaDelta: { alignItems: 'flex-end' },
  delta: {
    fontSize: fontSize.small,
    lineHeight: lineHeight.small,
    fontWeight: fontWeight.bold,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    overflow: 'hidden',
  },
  // El color acompaña a la flecha del texto, nunca la reemplaza: ↓ y ↑ ya
  // dicen para donde fue sin depender de ver la diferencia entre verde y ambar.
  deltaBien: { color: colors.success },
  deltaMal: { color: colors.warning },
  deltaNeutro: { color: colors.textSecondary },
  deltaPeriodo: {
    fontSize: fontSize.caption,
    lineHeight: lineHeight.caption,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },

  invitacion: {
    fontSize: fontSize.small,
    lineHeight: lineHeight.small,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },

  // La card de proyeccion, adentro de la del peso: es la lectura del grafico
  // que esta justo arriba, no un tema aparte.
  proyeccion: {
    backgroundColor: colors.accentSoft,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginTop: spacing.sm,
    gap: spacing.xs,
  },
  proyeccionTitulo: {
    fontSize: fontSize.body,
    lineHeight: lineHeight.body,
    fontWeight: fontWeight.medium,
    color: colors.textOnAccentSoft,
  },
  proyeccionDetalle: {
    fontSize: fontSize.caption,
    lineHeight: lineHeight.caption,
    color: colors.textOnAccentSoft,
  },
  proyeccionAviso: {
    fontSize: fontSize.caption,
    lineHeight: lineHeight.caption,
    fontWeight: fontWeight.medium,
    color: colors.danger,
    marginTop: spacing.xs,
  },

  barraFondo: {
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
    overflow: 'hidden',
    marginTop: spacing.xs,
  },
  barraRelleno: { height: '100%', borderRadius: radius.pill, backgroundColor: colors.action },

  bloqueDesglose: {
    marginTop: spacing.xs,
    gap: spacing.md,
  },
  itemDesglose: {
    gap: spacing.xs,
  },
  tituloDesglose: {
    fontSize: fontSize.body,
    lineHeight: lineHeight.body,
    fontWeight: fontWeight.medium,
    color: colors.textPrimary,
  },
  porcentajeDesglose: {
    fontSize: fontSize.body,
    lineHeight: lineHeight.body,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },

  separador: {
    height: sizes.hairline,
    backgroundColor: colors.border,
    marginVertical: spacing.xs,
  },

  // Entrenamientos propios
  badgeCarga: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm + 2,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    borderWidth: sizes.hairline,
    borderColor: colors.borderStrong,
  },
  badgeCargaTexto: {
    fontSize: fontSize.caption,
    lineHeight: lineHeight.caption,
    fontWeight: fontWeight.medium,
    color: colors.textPrimary,
  },
  subtituloLista: {
    fontSize: fontSize.small,
    lineHeight: lineHeight.small,
    fontWeight: fontWeight.bold,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  listaSesiones: {
    gap: spacing.xs,
  },
  sesionFila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.md,
  },
  sesionPresionada: {
    backgroundColor: colors.surfaceAlt,
  },
  sesionSeparador: {
    borderBottomWidth: sizes.hairline,
    borderBottomColor: colors.border,
  },
  sesionIconoContenedor: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sesionInfo: {
    flex: 1,
    gap: 2,
  },
  sesionTitulo: {
    fontSize: fontSize.body,
    lineHeight: lineHeight.body,
    fontWeight: fontWeight.medium,
    color: colors.textPrimary,
  },
  sesionResumen: {
    fontSize: fontSize.caption,
    lineHeight: lineHeight.caption,
    color: colors.textSecondary,
  },
  sesionDerecha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  sesionFecha: {
    fontSize: fontSize.caption,
    lineHeight: lineHeight.caption,
    color: colors.textMuted,
  },

  // Nutricion
  filaNutricionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  subtituloNutricion: {
    fontSize: fontSize.body,
    lineHeight: lineHeight.body,
    fontWeight: fontWeight.medium,
    color: colors.textSecondary,
  },
  badgeConfiabilidad: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm + 2,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    borderWidth: sizes.hairline,
    borderColor: colors.borderStrong,
  },
  badgeConfiabilidadTexto: {
    fontSize: fontSize.caption,
    lineHeight: lineHeight.caption,
    fontWeight: fontWeight.medium,
    color: colors.textPrimary,
  },

  macros: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
  macro: { flex: 1, gap: spacing.xs },
  macroLabel: {
    fontSize: fontSize.caption,
    lineHeight: lineHeight.caption,
    color: colors.textSecondary,
  },
  macroValor: {
    fontSize: fontSize.body,
    lineHeight: lineHeight.body,
    fontWeight: fontWeight.medium,
    color: colors.textPrimary,
  },
  macroObjetivo: { fontSize: fontSize.caption, color: colors.textSecondary },
  macroBarraFondo: {
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  barraProteina: { height: '100%', borderRadius: radius.pill, backgroundColor: colors.protein },
  barraCarbos: { height: '100%', borderRadius: radius.pill, backgroundColor: colors.carbs },
  barraGrasas: { height: '100%', borderRadius: radius.pill, backgroundColor: colors.fat },

  linea: {
    fontSize: fontSize.body,
    lineHeight: lineHeight.body,
    fontWeight: fontWeight.medium,
    color: colors.textPrimary,
  },
  valor: {
    fontSize: fontSize.body,
    lineHeight: lineHeight.body,
    fontWeight: fontWeight.medium,
    color: colors.textPrimary,
  },
  detalle: {
    fontSize: fontSize.caption,
    lineHeight: lineHeight.caption,
    color: colors.textSecondary,
  },
  vacio: {
    fontSize: fontSize.small,
    lineHeight: lineHeight.small,
    color: colors.textMuted,
    paddingVertical: spacing.sm,
  },
});
