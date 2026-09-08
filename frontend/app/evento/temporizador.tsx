// Temporizador de intervalos. Se llega desde "Entrenar" en el dashboard, sin
// evento previo: es para el entrenamiento propio, el que armas vos. A un
// entrenamiento de club o gimnasio la app no lo cronometra, solo pregunta si
// fuiste, asi que desde la agenda ya no se entra aca.
//
// La pantalla no calcula nada: todo lo que es estructura, fases y cuentas vive
// en features/entrenamiento/temporizador.ts, que son funciones puras. Aca solo
// quedan el estado de React, los efectos y el dibujo.
//
// El reloj del sistema es la fuente de verdad. El intervalo de abajo NO cuenta
// el tiempo: solo empuja un re-render con el Date.now() de ese momento, y la
// fase sale de comparar ese instante contra el plan. Por eso da igual que el
// sistema congele los timers un rato: al volver, la cuenta ya esta donde
// corresponde en vez de haber quedado atrasada.

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, Alert, AppState } from 'react-native';
import { useRouter } from 'expo-router';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';

import { Pantalla } from '@/ui/Pantalla';
import { Boton } from '@/ui/Boton';
import { Card } from '@/ui/Card';
import { Input } from '@/ui/Input';
import { colors, spacing, radius, fontSize, lineHeight, fontWeight, sizes } from '@/ui/theme';

import { obtenerPerfilLocal } from '@/db/queries/perfil';
import { actualizarDistancia } from '@/db/queries/sesiones';
import { guardarSesionTerminada } from '@/features/entrenamiento/guardarSesion';
import { FilaNumero } from '@/features/entrenamiento/components/FilaNumero';
import { Anillo } from '@/features/entrenamiento/components/Anillo';
import { VistaPrevia } from '@/features/entrenamiento/components/VistaPrevia';
import {
  CONFIG_POR_DEFECTO,
  ETIQUETA_FASE,
  PRESETS,
  presetActivo,
  ajustarConfig,
  calcularRitmo,
  construirPlan,
  duracionTotalMs,
  esCronometro,
  estaPausado,
  formatearDecimal,
  formatearSegundos,
  iniciarReloj,
  parsearDistancia,
  pausarReloj,
  posicionEn,
  reanudarReloj,
  resumenPlan,
  segundosRestantes,
  segundosTranscurridos,
  transcurridoMs,
} from '@/features/entrenamiento/temporizador';
import type {
  CampoConfig,
  ConfigTemporizador,
  Fase,
  Reloj,
  TipoFase,
} from '@/features/entrenamiento/temporizador';
import {
  liberarSonidos,
  pitidoDeFase,
  prepararSonidos,
  reproducir,
} from '@/features/entrenamiento/sonidos';

// ---------------------------------------------------------------------------

/** Cada cuanto se repinta. No es la precision del temporizador, es la del ojo. */
const TICK_MS = 200;

const TAG_DESPIERTO = 'temporizador';

/**
 * Cuanta demora se tolera para piteear un cambio de fase.
 *
 * Si la app estuvo congelada y al volver descubrimos que cruzamos tres fases,
 * no tiene sentido soltar los tres pitidos atrasados: el usuario ya se los
 * perdio y lo unico que lograriamos es confundirlo sobre en que fase esta.
 * Pasado este margen se resincroniza en silencio.
 */
const GRACIA_PITIDO_MS = 1500;

const PASO_SEG = 5;

const FONDO_FASE: Record<TipoFase, string> = {
  trabajo: colors.faseTrabajo,
  descanso: colors.faseDescanso,
  descansoBloque: colors.faseDescansoBloque,
};

// ---------------------------------------------------------------------------
// Pantalla
// ---------------------------------------------------------------------------

export default function Temporizador() {
  const router = useRouter();

  const [config, setConfig] = useState<ConfigTemporizador>(CONFIG_POR_DEFECTO);
  const [plan, setPlan] = useState<Fase[]>([]);
  // null = todavia esta configurando. Es el unico interruptor entre los dos
  // estados de la pantalla.
  const [reloj, setReloj] = useState<Reloj | null>(null);
  const [ahora, setAhora] = useState(() => Date.now());
  const [finalizada, setFinalizada] = useState(false);
  const [totalFinalMs, setTotalFinalMs] = useState(0);

  // Lo que queda de la sesion ya guardada. `sesionId` es null hasta que la
  // escritura vuelve; la distancia se carga contra el despues.
  const [sesionId, setSesionId] = useState<string | null>(null);
  const [distanciaTexto, setDistanciaTexto] = useState('');

  const cronometro = esCronometro(config);
  // Se recalcula en cada render en vez de guardarse: asi tocar un +/- desmarca
  // el chip solo, sin que nadie tenga que acordarse de limpiarlo.
  const activoId = presetActivo(config);
  const pausado = !!reloj && estaPausado(reloj);
  const corriendo = !!reloj && !finalizada;

  // --- el latido ----------------------------------------------------------

  useEffect(() => {
    if (!corriendo || pausado) return;
    const t = setInterval(() => setAhora(Date.now()), TICK_MS);
    return () => clearInterval(t);
  }, [corriendo, pausado]);

  // Volver de segundo plano no espera al proximo tick: recalcula ya, para que
  // el primer frame al reaparecer no sea el viejo.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (estado) => {
      if (estado === 'active') setAhora(Date.now());
    });
    return () => sub.remove();
  }, []);

  // --- donde estamos ------------------------------------------------------

  const transcurrido = reloj ? transcurridoMs(reloj, ahora) : 0;
  const pos = useMemo(() => posicionEn(plan, transcurrido), [plan, transcurrido]);

  /**
   * De cuando a cuando va cada bloque. Se deriva del plan, que ya trae los
   * offsets: es lo que permite llenar el segmento del bloque actual en
   * proporcion en vez de dejarlo a medias siempre.
   *
   * Depende solo del plan y no del tiempo, asi que se calcula una vez por
   * sesion y no en cada tick.
   */
  const tramos = useMemo(() => {
    const porBloque = new Map<number, { desde: number; hasta: number }>();
    for (const f of plan) {
      const fin = f.hastaMs ?? f.desdeMs;
      const actual = porBloque.get(f.bloque);
      if (!actual) porBloque.set(f.bloque, { desde: f.desdeMs, hasta: fin });
      else actual.hasta = Math.max(actual.hasta, fin);
    }
    return [...porBloque.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([numero, r]) => ({ numero, ...r }));
  }, [plan]);

  // --- sonido -------------------------------------------------------------

  // El indice de la ultima fase que ya anunciamos. En un ref y no en estado:
  // cambiarlo no tiene que provocar un render.
  const ultimoIndice = useRef<number | null>(null);

  useEffect(() => {
    if (!corriendo) return;

    if (pos.terminado) {
      setFinalizada(true);
      return;
    }
    if (!pos.fase || pos.indice === ultimoIndice.current) return;

    ultimoIndice.current = pos.indice;
    if (pos.llevaMs <= GRACIA_PITIDO_MS) reproducir(pitidoDeFase(pos.fase.tipo));
  }, [pos, corriendo]);

  /**
   * Deja el entrenamiento registrado: el evento y el detalle de la sesion.
   *
   * El evento se crea retroactivo, siempre: aca nunca hay uno agendado del que
   * venir. Toda esa politica esta en features/entrenamiento/guardarSesion.ts;
   * aca solo se la llama.
   */
  const guardar = useCallback(
    async (duracionRealMs: number) => {
      if (!reloj) return;
      try {
        const perfil = await obtenerPerfilLocal();
        if (!perfil) {
          console.warn('Sin perfil local: la sesion no se guarda.');
          return;
        }

        const r = await guardarSesionTerminada({
          usuarioId: perfil.id,
          config,
          plan,
          inicio: new Date(reloj.inicioMs),
          duracionRealMs,
        });

        setSesionId(r.sesion.id);
      } catch (e) {
        console.error('Error al guardar la sesion:', e);
        Alert.alert('Error', 'El entrenamiento terminó, pero no se pudo guardar.');
      }
    },
    [config, plan, reloj],
  );

  // Una sola escritura por sesion. En un ref y no en estado porque tiene que
  // valer YA, en la misma pasada del efecto: el efecto de abajo depende de
  // `guardar`, que cambia de identidad, y sin esto una segunda corrida crearia
  // un evento y una sesion duplicados.
  const yaGuardo = useRef(false);

  // El unico lugar que da la sesion por completada. Todo lo que termina bien
  // pasa por setFinalizada(true) y cae aca: el plan que se acaba solo y el
  // cronometro que el usuario para a mano.
  useEffect(() => {
    if (!finalizada || !reloj || yaGuardo.current) return;
    yaGuardo.current = true;

    reproducir('fin');
    const total = duracionTotalMs(plan) ?? transcurridoMs(reloj, Date.now());
    setTotalFinalMs(total);
    void guardar(total);
  }, [finalizada, reloj, plan, guardar]);

  // --- pantalla despierta -------------------------------------------------

  useEffect(() => {
    if (!corriendo) return;
    activateKeepAwakeAsync(TAG_DESPIERTO).catch(() => {});
    return () => {
      try {
        deactivateKeepAwake(TAG_DESPIERTO);
      } catch {
        // Nunca llego a activarse. No hay nada que soltar.
      }
    };
  }, [corriendo]);

  // Los players se liberan al salir de la pantalla, no al terminar la sesion:
  // el pitido del final todavia tiene que sonar.
  useEffect(() => () => liberarSonidos(), []);

  // --- acciones -----------------------------------------------------------

  const cambiar = (campo: CampoConfig, delta: number) => {
    setConfig((c) => ajustarConfig(c, campo, c[campo] + delta));
  };

  // Lo escrito a mano entra por el mismo lugar que los +/-: ajustarConfig ya
  // acota contra LIMITES, asi que un 9999 queda en el maximo y no hay nada
  // que validar aca.
  const escribir = (campo: CampoConfig, n: number) => {
    setConfig((c) => ajustarConfig(c, campo, n));
  };

  const empezar = async () => {
    const nuevo = construirPlan(config);
    if (nuevo.length === 0) {
      Alert.alert('Nada que hacer', 'Poné al menos unos segundos de trabajo.');
      return;
    }

    await prepararSonidos();

    ultimoIndice.current = null;
    const t = Date.now();
    setPlan(nuevo);
    setFinalizada(false);
    setAhora(t);
    setReloj(iniciarReloj(t));
  };

  const alternarPausa = () => {
    if (!reloj) return;
    const t = Date.now();
    setAhora(t);
    setReloj(pausado ? reanudarReloj(reloj, t) : pausarReloj(reloj, t));
  };

  /**
   * El boton de la derecha mientras corre. Hace dos cosas distintas y por eso
   * se llama distinto en cada caso:
   *
   * - Cronometro: no tiene final propio, asi que pararlo ES terminar. Cuenta
   *   como hecho y marca el evento.
   * - Estructurado: quedarse a mitad del plan es abandonar, y abandonar no
   *   marca nada. Se avisa antes, que perder un entrenamiento por un toque
   *   de mas seria feo.
   */
  const terminarAMano = () => {
    if (cronometro) {
      Alert.alert('Terminar', '¿Damos por terminado el entrenamiento?', [
        { text: 'Seguir', style: 'cancel' },
        { text: 'Terminar', onPress: () => setFinalizada(true) },
      ]);
      return;
    }

    Alert.alert(
      'Abandonar',
      'Todavía no terminaste. Si salís ahora, el entrenamiento no se marca como hecho.',
      [
        { text: 'Seguir', style: 'cancel' },
        { text: 'Abandonar', style: 'destructive', onPress: () => router.back() },
      ],
    );
  };

  /**
   * Salir de la pantalla de "Listo". Antes de irse guarda la distancia, que es
   * lo unico que todavia puede estar sin escribir.
   *
   * Va al salir y no en cada tecla: son los km de una sesion que ya esta
   * guardada, no hay nada que perder si el usuario no llega a tocar el boton.
   */
  const volver = async () => {
    const km = parsearDistancia(distanciaTexto);
    if (sesionId && km !== null) {
      try {
        await actualizarDistancia(sesionId, km);
      } catch (e) {
        // No frena la vuelta: la sesion ya quedo guardada, esto era el extra.
        console.error('Error al guardar la distancia:', e);
      }
    }
    router.back();
  };

  // -------------------------------------------------------------------------
  // Terminado
  // -------------------------------------------------------------------------

  if (finalizada) {
    const minutos = Math.max(1, Math.round(totalFinalMs / 60000));

    // null mientras el campo este vacio o tenga cualquier cosa. Es opcional de
    // verdad: no bloquea nada, solo deja de mostrar el ritmo.
    const distanciaKm = parsearDistancia(distanciaTexto);
    const ritmo = calcularRitmo(distanciaKm, Math.round(totalFinalMs / 1000));

    return (
      <Pantalla scroll={false} style={estilos.centrada}>
        <Text style={estilos.tituloFinal}>Listo</Text>
        <Text style={estilos.detalle}>
          {minutos} {minutos === 1 ? 'minuto' : 'minutos'} de entrenamiento
        </Text>

        {/* La distancia se pregunta SOLO en el cronometro: una sesion de
            pasadas no tiene kilometros. */}
        {cronometro && (
          <View style={estilos.distancia}>
            <Input
              label="Distancia (opcional)"
              value={distanciaTexto}
              onChangeText={setDistanciaTexto}
              placeholder="Ej: 6,2"
              keyboardType="decimal-pad"
            />

            {ritmo && distanciaKm !== null && (
              <View style={estilos.ritmo}>
                <Text style={estilos.detalle}>
                  {formatearDecimal(distanciaKm)} km en {minutos} min
                </Text>
                {/* El min/km va grande y el km/h chico: el ritmo es el numero
                    que mira la gente que corre. */}
                <Text style={estilos.ritmoPrincipal}>Ritmo {ritmo.ritmoTexto} min/km</Text>
                <Text style={estilos.ritmoSecundario}>{ritmo.velocidadTexto} km/h</Text>
              </View>
            )}
          </View>
        )}

        <Text style={estilos.detalle}>Lo guardamos en tu agenda.</Text>

        <Boton titulo="Volver" onPress={volver} ancho />
      </Pantalla>
    );
  }

  // -------------------------------------------------------------------------
  // Corriendo
  // -------------------------------------------------------------------------

  if (corriendo && pos.fase) {
    const { fase } = pos;
    // La cuenta va para abajo salvo en el cronometro, donde la fase es abierta
    // y lo unico que hay para mostrar es cuanto lleva.
    const numero =
      pos.restanteMs === null
        ? formatearSegundos(segundosTranscurridos(pos.llevaMs))
        : formatearSegundos(segundosRestantes(pos.restanteMs));

    // Cuanto queda de la fase, de 1 a 0. En el cronometro no hay proporcion
    // que mostrar —la fase es abierta— y el anillo no se dibuja.
    const fraccion =
      pos.restanteMs !== null && fase.duracionMs
        ? Math.min(1, Math.max(0, pos.restanteMs / fase.duracionMs))
        : null;

    // Lo que falta de la sesion entera. null en el cronometro, que no tiene
    // final propio.
    const totalMs = duracionTotalMs(plan);
    const restanteTotal = totalMs === null ? null : Math.max(0, totalMs - transcurrido);

    return (
      <Pantalla scroll={false} fondo={FONDO_FASE[fase.tipo]} style={estilos.corriendo}>
        {/* Contexto: en que bloque estoy y cuanto falta para terminar todo.
            El cronometro no tiene ni bloques ni final, asi que no dibuja nada
            en vez de dejar una fila vacia ocupando alto. */}
        <View style={estilos.contexto}>
          {(config.bloques > 1 || restanteTotal !== null) && (
            <View style={estilos.contextoFila}>
              {config.bloques > 1 && (
                <Text style={estilos.contextoTexto}>
                  Bloque {fase.bloque} de {config.bloques}
                </Text>
              )}
              {restanteTotal !== null && (
                <Text
                  style={[estilos.contextoTexto, estilos.contextoDerecha]}
                  allowFontScaling={false}
                >
                  {formatearSegundos(segundosRestantes(restanteTotal))} restantes
                </Text>
              )}
            </View>
          )}

          {tramos.length > 1 && (
            <View style={estilos.segmentos}>
              {tramos.map((t) => {
                // Llenado real y no "medio lleno": el segmento del bloque en
                // curso avanza con el, asi que la barra tambien dice cuanto
                // falta DENTRO del bloque, no solo cuantos van.
                const largo = t.hasta - t.desde;
                const llenado =
                  largo <= 0 ? 0 : Math.min(1, Math.max(0, (transcurrido - t.desde) / largo));

                return (
                  <View key={t.numero} style={estilos.segmento}>
                    {llenado > 0 && (
                      <View style={[estilos.segmentoLleno, { flex: llenado }]} />
                    )}
                    {llenado < 1 && <View style={{ flex: 1 - llenado }} />}
                  </View>
                );
              })}
            </View>
          )}
        </View>

        <View style={estilos.centro}>
          <Text style={estilos.fase}>{pausado ? 'En pausa' : ETIQUETA_FASE[fase.tipo]}</Text>

          <Anillo numero={numero} fraccion={fraccion} />

          {config.pasadas > 1 && (
            <>
              <Text style={estilos.progreso}>
                Pasada {fase.pasada} de {config.pasadas}
              </Text>
              {/* Los puntitos son la misma idea que la barra de bloques a otra
                  escala: cuantas van y cual es la de ahora. */}
              <View style={estilos.puntos}>
                {Array.from({ length: config.pasadas }, (_, i) => {
                  const n = i + 1;
                  return (
                    <View
                      key={n}
                      style={[
                        estilos.punto,
                        n < fase.pasada && estilos.puntoHecho,
                        n === fase.pasada && estilos.puntoActual,
                      ]}
                    />
                  );
                })}
              </View>
            </>
          )}
        </View>

        <View style={estilos.acciones}>
          <View style={estilos.flex}>
            <Boton
              titulo={pausado ? 'Reanudar' : 'Pausar'}
              variante="secundario"
              onPress={alternarPausa}
              ancho
            />
          </View>
          <View style={estilos.flex}>
            <Boton
              titulo={cronometro ? 'Terminar' : 'Abandonar'}
              variante="secundario"
              onPress={terminarAMano}
              ancho
            />
          </View>
        </View>
      </Pantalla>
    );
  }

  // -------------------------------------------------------------------------
  // Configuracion
  //
  // Las filas van de adentro hacia afuera, que es como se arma la estructura:
  // primero el esfuerzo, despues lo que lo separa, despues cuantas veces.
  // -------------------------------------------------------------------------

  return (
    <Pantalla>
      <View style={estilos.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={estilos.flecha}>‹</Text>
        </Pressable>
        <Text style={estilos.titulo}>Temporizador</Text>
      </View>

      {/* Los presets primero: casi siempre uno de estos es lo que se busca, y
          los +/- de abajo quedan para ajustar sobre esa base. */}
      <View style={estilos.presets}>
        {PRESETS.map((preset) => {
          const activo = preset.id === activoId;
          return (
            <Pressable
              key={preset.id}
              onPress={() => setConfig(preset.config)}
              accessibilityRole="button"
              accessibilityState={{ selected: activo }}
              style={({ pressed }) => [
                estilos.chip,
                activo && estilos.chipActivo,
                pressed && !activo && estilos.chipPresionado,
              ]}
            >
              <Text style={[estilos.chipTexto, activo && estilos.chipTextoActivo]}>
                {preset.nombre}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Card style={estilos.tarjeta}>
        <FilaNumero
          etiqueta="Trabajo"
          valor={config.trabajoSeg}
          sufijo="s"
          textoFijo={cronometro ? 'Libre' : undefined}
          ayuda="Segundos de esfuerzo"
          onBajar={() => cambiar('trabajoSeg', -PASO_SEG)}
          onSubir={() => cambiar('trabajoSeg', PASO_SEG)}
          onEscribir={(n) => escribir('trabajoSeg', n)}
          puedeBajar={!cronometro}
          atajo={{
            titulo: 'Sin límite (cronómetro)',
            activo: cronometro,
            onPress: () =>
              setConfig((c) =>
                esCronometro(c)
                  ? { ...c, trabajoSeg: CONFIG_POR_DEFECTO.trabajoSeg }
                  : { ...c, trabajoSeg: 0 },
              ),
          }}
        />

        {/* Con el cronometro no hay nada mas que configurar: una sola fase
            abierta no tiene con que alternar ni cuantas veces repetirse. */}
        {!cronometro && (
          <>
            <FilaNumero
              etiqueta="Descanso"
              valor={config.descansoSeg}
              sufijo="s"
              ayuda="Entre pasadas"
              onBajar={() => cambiar('descansoSeg', -PASO_SEG)}
              onSubir={() => cambiar('descansoSeg', PASO_SEG)}
              onEscribir={(n) => escribir('descansoSeg', n)}
              puedeBajar={config.descansoSeg > 0}
            />
            <FilaNumero
              etiqueta="Pasadas"
              valor={config.pasadas}
              ayuda="Repeticiones por bloque"
              onBajar={() => cambiar('pasadas', -1)}
              onSubir={() => cambiar('pasadas', 1)}
              onEscribir={(n) => escribir('pasadas', n)}
              puedeBajar={config.pasadas > 1}
            />
            <FilaNumero
              etiqueta="Bloques"
              valor={config.bloques}
              ayuda="Veces que se repite la serie entera"
              onBajar={() => cambiar('bloques', -1)}
              onSubir={() => cambiar('bloques', 1)}
              onEscribir={(n) => escribir('bloques', n)}
              puedeBajar={config.bloques > 1}
            />
            {config.bloques > 1 && (
              <FilaNumero
                etiqueta="Descanso de bloque"
                valor={config.descansoBloqueSeg}
                sufijo="s"
                ayuda="Entre un bloque y el siguiente"
                onBajar={() => cambiar('descansoBloqueSeg', -PASO_SEG)}
                onSubir={() => cambiar('descansoBloqueSeg', PASO_SEG)}
                onEscribir={(n) => escribir('descansoBloqueSeg', n)}
                puedeBajar={config.descansoBloqueSeg > 0}
              />
            )}
          </>
        )}
      </Card>

      <VistaPrevia config={config} resumen={resumenPlan(config)} />

      <Boton titulo="Empezar" onPress={empezar} ancho />
    </Pantalla>
  );
}

// ---------------------------------------------------------------------------

const estilos = StyleSheet.create({
  flex: { flex: 1 },

  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  flecha: { fontSize: fontSize.title, color: colors.textSecondary },
  titulo: {
    fontSize: fontSize.body,
    lineHeight: lineHeight.body,
    fontWeight: fontWeight.medium,
    color: colors.textPrimary,
  },

  tarjeta: { gap: spacing.xs },

  // --- presets ---
  presets: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: sizes.hairline,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipActivo: { backgroundColor: colors.action, borderColor: colors.action },
  chipPresionado: { backgroundColor: colors.surfaceAlt },
  chipTexto: { fontSize: fontSize.small, color: colors.textPrimary },
  chipTextoActivo: { color: colors.textOnAction },

  // --- corriendo ---
  corriendo: { justifyContent: 'space-between' },

  contexto: { gap: spacing.sm },
  contextoFila: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  // Blanco pleno y no translucido: es texto. Sobre la fase de descanso el
  // blanco puro ya es el techo de contraste con 5.02:1.
  contextoTexto: {
    fontSize: fontSize.small,
    lineHeight: lineHeight.small,
    color: colors.textOnFase,
    fontVariant: ['tabular-nums'],
  },

  // marginLeft auto y no solo space-between: con un unico bloque la etiqueta
  // de la izquierda no se dibuja, y space-between con un solo hijo lo manda al
  // principio. El tiempo tiene que quedar siempre a la derecha.
  contextoDerecha: { marginLeft: 'auto' },

  segmentos: { flexDirection: 'row', gap: spacing.xs, height: 4 },
  // Cada bloque ocupa lo mismo aunque dure distinto: la barra cuenta bloques,
  // no tiempo. Para el tiempo esta el numero de arriba.
  segmento: {
    flex: 1,
    flexDirection: 'row',
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
    backgroundColor: colors.onFaseTenue,
  },
  segmentoLleno: { backgroundColor: colors.textOnFase },

  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  fase: {
    fontSize: fontSize.title,
    lineHeight: lineHeight.title,
    fontWeight: fontWeight.medium,
    color: colors.textOnFase,
  },
  progreso: {
    fontSize: fontSize.subtitle,
    lineHeight: lineHeight.subtitle,
    color: colors.textOnFase,
  },

  puntos: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  punto: {
    width: 6,
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.onFaseTenue,
  },
  puntoHecho: { backgroundColor: colors.onFaseMedio },
  // El actual mas grande, no solo mas claro: se encuentra de reojo sin tener
  // que comparar tonos.
  puntoActual: {
    width: 10,
    height: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.textOnFase,
  },

  acciones: { flexDirection: 'row', gap: spacing.md },

  // --- terminado ---
  centrada: { justifyContent: 'center', alignItems: 'center', gap: spacing.md },
  tituloFinal: {
    fontSize: fontSize.display,
    lineHeight: lineHeight.display,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  detalle: {
    fontSize: fontSize.body,
    lineHeight: lineHeight.body,
    color: colors.textSecondary,
  },

  // alignSelf stretch porque la pantalla de "Listo" centra a sus hijos: sin
  // esto el Input se encoge al ancho de su texto.
  distancia: { alignSelf: 'stretch', gap: spacing.md },
  ritmo: { alignItems: 'center', gap: spacing.xs },
  ritmoPrincipal: {
    fontSize: fontSize.title,
    lineHeight: lineHeight.title,
    fontWeight: fontWeight.medium,
    color: colors.textPrimary,
  },
  ritmoSecundario: {
    fontSize: fontSize.small,
    lineHeight: lineHeight.small,
    color: colors.textSecondary,
  },
});
