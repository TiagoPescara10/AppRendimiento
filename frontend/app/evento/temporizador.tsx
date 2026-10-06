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
//
// El cronometro libre es otro flujo arriba de lo mismo: la actividad se elige
// antes de empezar, los km salen del GPS (features/entrenamiento/useGps.ts),
// la pantalla en vivo es VistaCronometroLibre y al terminar va directo a la
// tarjeta para compartir, sin pasar por "Listo".

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, Alert, AppState, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';

import { Pantalla } from '@/ui/Pantalla';
import { Boton } from '@/ui/Boton';
import { Card } from '@/ui/Card';
import { colors, spacing, radius, fontSize, lineHeight, fontWeight, sizes } from '@/ui/theme';

import { obtenerPerfilLocal } from '@/db/queries/perfil';
import { ultimaActividadCronometro } from '@/db/queries/sesiones';
import { ultimoPeso } from '@/db/queries/peso';
import { ACTIVIDADES, estimarKcal } from '@/lib/gasto';
import type { Actividad } from '@/lib/gasto';
import { guardarSesionTerminada } from '@/features/entrenamiento/guardarSesion';
import { useGps } from '@/features/entrenamiento/useGps';
import { gpsParcial, minutoInicioGps, senalGps } from '@/features/entrenamiento/gps';
import { FilaNumero } from '@/features/entrenamiento/components/FilaNumero';
import { Anillo } from '@/features/entrenamiento/components/Anillo';
import { VistaPrevia } from '@/features/entrenamiento/components/VistaPrevia';
import { VistaCronometroLibre } from '@/features/entrenamiento/components/VistaCronometroLibre';
import { cargarNivel } from '@/features/nivel/api';
import type { DatosNivel } from '@/features/nivel/api';
import { GananciaXP } from '@/features/nivel/components/GananciaXP';
import {
  CONFIG_CRONOMETRO,
  CONFIG_POR_DEFECTO,
  ETIQUETA_FASE,
  PRESETS,
  presetActivo,
  ajustarConfig,
  construirPlan,
  duracionTotalMs,
  esCronometro,
  estaPausado,
  formatearSegundos,
  iniciarReloj,
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

const ETIQUETA_ACTIVIDAD: Record<Actividad, string> = {
  correr: 'Correr',
  caminar: 'Caminar',
  bici: 'Bici',
};

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
  const params = useLocalSearchParams<{ modo?: string }>();

  const [config, setConfig] = useState<ConfigTemporizador>(() => {
    if (params.modo === 'cronometro') {
      return CONFIG_CRONOMETRO;
    }
    return CONFIG_POR_DEFECTO;
  });
  const [plan, setPlan] = useState<Fase[]>([]);
  // null = todavia esta configurando. Es el unico interruptor entre los dos
  // estados de la pantalla.
  const [reloj, setReloj] = useState<Reloj | null>(null);
  const [ahora, setAhora] = useState(() => Date.now());
  const [finalizada, setFinalizada] = useState(false);
  const [totalFinalMs, setTotalFinalMs] = useState(0);

  // Cronometro: que se hace y con que peso se estima el gasto. La actividad
  // arranca en la de la ultima sesion que tenga una, o en correr: siempre hay
  // una elegida. El peso es el del momento y queda guardado con las kcal.
  const [actividad, setActividad] = useState<Actividad>('correr');
  const [pesoKg, setPesoKg] = useState<number | null>(null);
  // Si el usuario ya toco un chip, la ultima actividad que llega tarde de la
  // base no se lo pisa.
  const eligioActividad = useRef(false);
  // El nivel ya con esta sesion sumada. null hasta que se guarda y se relee.
  // Solo pasadas: el cronometro lo muestra en la pantalla de compartir.
  const [nivel, setNivel] = useState<DatosNivel | null>(null);
  // El cronometro no tiene "Listo": si guardar falla, queda en esa pantalla
  // con el error en vez de ir a una tarjeta que no existe.
  const [falloGuardar, setFalloGuardar] = useState(false);

  const cronometro = esCronometro(config);
  // Se recalcula en cada render en vez de guardarse: asi tocar un +/- desmarca
  // el chip solo, sin que nadie tenga que acordarse de limpiarlo.
  const activoId = presetActivo(config);
  const pausado = !!reloj && estaPausado(reloj);
  const corriendo = !!reloj && !finalizada;

  const gps = useGps({
    activo: corriendo && cronometro,
    actividad,
    sesionMs: () => (reloj ? transcurridoMs(reloj, Date.now()) : 0),
  });

  // --- lo que se precarga -------------------------------------------------

  useEffect(() => {
    let vivo = true;
    (async () => {
      const perfil = await obtenerPerfilLocal();
      if (!perfil) return;
      const [ultima, peso] = await Promise.all([
        ultimaActividadCronometro(perfil.id).catch(() => null),
        ultimoPeso(perfil.id).catch(() => null),
      ]);
      if (!vivo) return;
      if (ultima && !eligioActividad.current) setActividad(ultima);
      setPesoKg(peso?.peso_kg ?? null);
    })().catch((e) => console.error('Error al precargar el cronometro:', e));
    return () => {
      vivo = false;
    };
  }, []);

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

        if (!esCronometro(config)) {
          await guardarSesionTerminada({
            usuarioId: perfil.id,
            config,
            plan,
            inicio: new Date(reloj.inicioMs),
            duracionRealMs,
          });
          // Se relee DESPUES de guardar: la XP se calcula de los eventos, y el
          // de esta sesion recien ahora existe. Si falla, no se muestra y listo.
          cargarNivel()
            .then(setNivel)
            .catch((e) => console.error('Error al cargar el nivel:', e));
          return;
        }

        // Cronometro libre. Los km son los del GPS si llego a medir algo; si
        // no, null, y la tarjeta los pide abierta. Las kcal se calculan aca
        // con los valores finales, no con la ultima muestra de la pantalla.
        // Se mira DESPUES de redondear: 4 m de GPS redondean a 0, y la base
        // rechaza una distancia de 0 (CHECK), lo que tiraria la sesion entera.
        const redondeado = Math.round(gps.estado.km * 100) / 100;
        const distanciaKm = gps.estado.primerPuntoSesionMs !== null && redondeado > 0 ? redondeado : null;
        const duracionSeg = Math.round(duracionRealMs / 1000);

        const r = await guardarSesionTerminada({
          usuarioId: perfil.id,
          config,
          plan,
          inicio: new Date(reloj.inicioMs),
          duracionRealMs,
          cronometro: {
            actividad,
            distanciaKm,
            kcal: estimarKcal({ actividad, duracionSeg, distanciaKm, pesoKg }),
          },
        });

        // replace y no push: volver atras desde la tarjeta no tiene que caer
        // en un cronometro ya terminado.
        const minuto = gpsParcial(gps.estado) ? minutoInicioGps(gps.estado) : null;
        router.replace({
          pathname: '/evento/compartir',
          params: {
            id: r.eventoId,
            desde: 'temporizador',
            ...(minuto !== null && { gpsMinuto: String(minuto) }),
          },
        });
      } catch (e) {
        console.error('Error al guardar la sesion:', e);
        setFalloGuardar(true);
        Alert.alert('Error', 'El entrenamiento terminó, pero no se pudo guardar.');
      }
    },
    [config, plan, reloj, gps.estado, actividad, pesoKg, router],
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
  // el pitido del final todavia tiene que sonar. Y un rato despues de salir,
  // no en el acto: el cronometro sale a la tarjeta apenas guarda, que es antes
  // de que termine el pitido.
  useEffect(() => () => void setTimeout(liberarSonidos, 2000), []);

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
    // El permiso de ubicacion se pide aca y no antes. El reloj arranca
    // despues de la respuesta: el tiempo frente al cartel no es entrenamiento.
    if (cronometro) await gps.iniciar();

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
    if (cronometro) gps.marcarPausa(!pausado);
  };

  const elegirActividad = (a: Actividad) => {
    eligioActividad.current = true;
    setActividad(a);
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

  // -------------------------------------------------------------------------
  // Terminado
  // -------------------------------------------------------------------------

  // El cronometro libre no tiene "Listo": mientras guarda, el mismo fondo y una
  // ruedita, y enseguida la tarjeta. Si falla, cae al "Listo" de abajo.
  if (finalizada && cronometro && !falloGuardar) {
    return (
      <Pantalla scroll={false} fondo={colors.faseTrabajo} style={estilos.centrada}>
        <ActivityIndicator color={colors.textOnFase} />
      </Pantalla>
    );
  }

  if (finalizada) {
    const minutos = Math.max(1, Math.round(totalFinalMs / 60000));

    return (
      <Pantalla style={estilos.centrada}>
        <Text style={estilos.tituloFinal}>Listo</Text>
        <Text style={estilos.detalle}>
          {minutos} {minutos === 1 ? 'minuto' : 'minutos'} de entrenamiento
        </Text>

        {!falloGuardar && <Text style={estilos.detalle}>Lo guardamos en tu agenda.</Text>}

        {nivel && <GananciaXP nivel={nivel} />}

        <Boton titulo="Volver" onPress={() => router.back()} ancho />
      </Pantalla>
    );
  }

  // -------------------------------------------------------------------------
  // Corriendo
  // -------------------------------------------------------------------------

  if (corriendo && cronometro) {
    return (
      <VistaCronometroLibre
        actividad={actividad}
        km={gps.estado.km}
        senal={senalGps(gps.estado, transcurrido, gps.permiso === 'concedido')}
        transcurridoMs={transcurrido}
        pausado={pausado}
        pesoKg={pesoKg}
        huboCorte={gps.huboCorte}
        onCerrarAviso={gps.cerrarAviso}
        onAlternarPausa={alternarPausa}
        onTerminar={terminarAMano}
      />
    );
  }

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
          {!cronometro && (config.bloques > 1 || restanteTotal !== null) && (
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

          {!cronometro && tramos.length > 1 && (
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

          {!cronometro && config.pasadas > 1 && (
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
                  : CONFIG_CRONOMETRO,
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

      {/* La actividad se elige antes: el GPS necesita saberla para filtrar
          saltos (a pie no se va a 60 km/h), y la pantalla en vivo la muestra.
          Las pasadas no tienen actividad. */}
      {cronometro && (
        <View style={estilos.chipsActividad}>
          {ACTIVIDADES.map((a) => {
            const activo = a === actividad;
            return (
              <Pressable
                key={a}
                style={[estilos.chipActividad, activo && estilos.chipActividadActivo]}
                onPress={() => elegirActividad(a)}
                accessibilityRole="button"
                accessibilityState={{ selected: activo }}
              >
                <Text style={[estilos.chipActividadTexto, activo && estilos.chipActividadTextoActivo]}>
                  {ETIQUETA_ACTIVIDAD[a]}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}

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

  chipsActividad: { flexDirection: 'row', gap: spacing.sm },
  chipActividad: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActividadActivo: { backgroundColor: colors.action, borderColor: colors.action },
  chipActividadTexto: { fontSize: fontSize.small, lineHeight: lineHeight.small, color: colors.textPrimary },
  chipActividadTextoActivo: { color: colors.textOnAction, fontWeight: fontWeight.medium },
});
