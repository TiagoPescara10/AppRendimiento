// Temporizador de intervalos. Se llega desde "Empezar" en /evento/dia/[fecha]
// y recibe el id del evento por query param.
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
import { useRouter, useLocalSearchParams } from 'expo-router';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';

import { Pantalla } from '@/ui/Pantalla';
import { Boton } from '@/ui/Boton';
import { Card } from '@/ui/Card';
import { colors, spacing, fontSize, lineHeight, fontWeight } from '@/ui/theme';

import { responderEvento } from '@/db/queries/eventos';
import { FilaNumero } from '@/features/entrenamiento/components/FilaNumero';
import {
  CONFIG_POR_DEFECTO,
  ETIQUETA_FASE,
  ajustarConfig,
  construirPlan,
  duracionTotalMs,
  esCronometro,
  estaPausado,
  etiquetaProgreso,
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
  const { id } = useLocalSearchParams<{ id?: string }>();

  const [config, setConfig] = useState<ConfigTemporizador>(CONFIG_POR_DEFECTO);
  const [plan, setPlan] = useState<Fase[]>([]);
  // null = todavia esta configurando. Es el unico interruptor entre los dos
  // estados de la pantalla.
  const [reloj, setReloj] = useState<Reloj | null>(null);
  const [ahora, setAhora] = useState(() => Date.now());
  const [finalizada, setFinalizada] = useState(false);
  const [totalFinalMs, setTotalFinalMs] = useState(0);

  const cronometro = esCronometro(config);
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

  const marcarHecho = useCallback(async () => {
    // Sin id la pantalla igual funciona como temporizador suelto; simplemente
    // no hay evento que marcar.
    if (!id) return;
    try {
      await responderEvento(id, true);
    } catch (e) {
      console.error('Error al marcar el evento:', e);
      Alert.alert('Error', 'El entrenamiento terminó, pero no se pudo marcar el evento.');
    }
  }, [id]);

  // El unico lugar que da la sesion por completada. Todo lo que termina bien
  // pasa por setFinalizada(true) y cae aca: el plan que se acaba solo y el
  // cronometro que el usuario para a mano.
  useEffect(() => {
    if (!finalizada || !reloj) return;
    reproducir('fin');
    setTotalFinalMs(duracionTotalMs(plan) ?? transcurridoMs(reloj, Date.now()));
    void marcarHecho();
  }, [finalizada, reloj, plan, marcarHecho]);

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

  // -------------------------------------------------------------------------
  // Terminado
  // -------------------------------------------------------------------------

  if (finalizada) {
    const minutos = Math.max(1, Math.round(totalFinalMs / 60000));
    return (
      <Pantalla scroll={false} style={estilos.centrada}>
        <Text style={estilos.tituloFinal}>Listo</Text>
        <Text style={estilos.detalle}>
          {minutos} {minutos === 1 ? 'minuto' : 'minutos'} de entrenamiento
        </Text>
        {id ? <Text style={estilos.detalle}>Ya quedó marcado como hecho.</Text> : null}
        <Boton titulo="Volver" onPress={() => router.back()} ancho />
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

    const progreso = etiquetaProgreso(fase, config);

    return (
      <Pantalla scroll={false} fondo={FONDO_FASE[fase.tipo]} style={estilos.corriendo}>
        <View style={estilos.centro}>
          <Text style={estilos.fase}>{pausado ? 'En pausa' : ETIQUETA_FASE[fase.tipo]}</Text>
          <Text style={estilos.numero} allowFontScaling={false}>
            {numero}
          </Text>
          {progreso ? <Text style={estilos.progreso}>{progreso}</Text> : null}
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

      <Card style={estilos.tarjeta}>
        <FilaNumero
          etiqueta="Trabajo"
          valor={cronometro ? 'Libre' : `${config.trabajoSeg} s`}
          ayuda="Segundos de esfuerzo"
          onBajar={() => cambiar('trabajoSeg', -PASO_SEG)}
          onSubir={() => cambiar('trabajoSeg', PASO_SEG)}
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
              valor={`${config.descansoSeg} s`}
              ayuda="Entre pasadas"
              onBajar={() => cambiar('descansoSeg', -PASO_SEG)}
              onSubir={() => cambiar('descansoSeg', PASO_SEG)}
              puedeBajar={config.descansoSeg > 0}
            />
            <FilaNumero
              etiqueta="Pasadas"
              valor={String(config.pasadas)}
              ayuda="Repeticiones por bloque"
              onBajar={() => cambiar('pasadas', -1)}
              onSubir={() => cambiar('pasadas', 1)}
              puedeBajar={config.pasadas > 1}
            />
            <FilaNumero
              etiqueta="Bloques"
              valor={String(config.bloques)}
              ayuda="Veces que se repite la serie entera"
              onBajar={() => cambiar('bloques', -1)}
              onSubir={() => cambiar('bloques', 1)}
              puedeBajar={config.bloques > 1}
            />
            {config.bloques > 1 && (
              <FilaNumero
                etiqueta="Descanso de bloque"
                valor={`${config.descansoBloqueSeg} s`}
                ayuda="Entre un bloque y el siguiente"
                onBajar={() => cambiar('descansoBloqueSeg', -PASO_SEG)}
                onSubir={() => cambiar('descansoBloqueSeg', PASO_SEG)}
                puedeBajar={config.descansoBloqueSeg > 0}
              />
            )}
          </>
        )}
      </Card>

      <Text style={estilos.resumen}>{resumenPlan(config)}</Text>

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
  resumen: {
    textAlign: 'center',
    fontSize: fontSize.small,
    lineHeight: lineHeight.small,
    color: colors.textSecondary,
  },

  // --- corriendo ---
  corriendo: { justifyContent: 'space-between' },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  fase: {
    fontSize: fontSize.title,
    lineHeight: lineHeight.title,
    fontWeight: fontWeight.medium,
    color: colors.textOnFase,
  },
  numero: {
    fontSize: fontSize.timer,
    lineHeight: lineHeight.timer,
    fontWeight: fontWeight.bold,
    color: colors.textOnFase,
    // Los digitos no cambian de ancho al pasar de 9 a 8: sin esto el numero
    // se mueve solo en cada segundo.
    fontVariant: ['tabular-nums'],
  },
  progreso: {
    fontSize: fontSize.subtitle,
    lineHeight: lineHeight.subtitle,
    color: colors.textOnFase,
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
});
