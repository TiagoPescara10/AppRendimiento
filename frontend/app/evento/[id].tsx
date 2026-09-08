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

import { useState, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';

import { Pantalla } from '@/ui/Pantalla';
import { Boton } from '@/ui/Boton';
import { colors, spacing, radius, fontSize, lineHeight, shadow } from '@/ui/theme';

import { obtenerEvento, marcarCompletado, eliminarEvento } from '@/db/queries/eventos';
import { obtenerSesionPorEvento } from '@/db/queries/sesiones';
import { ETIQUETA_TIPO, ETIQUETA_INTENSIDAD, horaDe, partesFecha } from '@/features/agenda/formato';
import {
  calcularRitmo,
  esCronometro,
  formatearDecimal,
  formatearSegundos,
} from '@/features/entrenamiento/temporizador';
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
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    if (!id) return;
    try {
      // Las dos juntas: la sesion se busca por evento_id, asi que no depende
      // de haber leido el evento primero.
      const [e, s] = await Promise.all([obtenerEvento(id), obtenerSesionPorEvento(id)]);
      setEvento(e);
      setSesion(s);
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

  return (
    <Pantalla>
      <View style={estilos.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={estilos.flecha}>‹</Text>
        </Pressable>
        <View style={estilos.flex}>
          <Text style={estilos.titulo}>{ETIQUETA_TIPO[evento.tipo]}</Text>
          <Text style={estilos.detalle}>
            {dia} de {mes}
          </Text>
        </View>
        {hecho && (
          <View style={estilos.tag}>
            <Text style={estilos.tagTexto}>Hecho</Text>
          </View>
        )}
      </View>

      <View style={estilos.card}>
        <Dato etiqueta="Hora" valor={horaDe(evento.fecha_hora_inicio)} />
        <Dato
          etiqueta="Duración"
          valor={
            evento.duracion_estimada_min ? `${evento.duracion_estimada_min} min` : 'Sin estimar'
          }
        />
        <Dato etiqueta="Intensidad" valor={ETIQUETA_INTENSIDAD[evento.intensidad]} />
        <Dato etiqueta="Estado" valor={hecho ? 'Completado' : 'Pendiente'} />
      </View>

      {/* Solo si el entrenamiento se corrio con el temporizador. */}
      {sesion && <DetalleSesion sesion={sesion} />}

      <Boton
        titulo={hecho ? 'Deshacer' : 'Marcar como hecho'}
        variante={hecho ? 'secundario' : 'primario'}
        onPress={() => marcar(!hecho)}
      />

      <Pressable style={estilos.borrar} onPress={borrar}>
        <Text style={estilos.borrarTexto}>Borrar evento</Text>
      </Pressable>
    </Pantalla>
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
  return [
    conteo(s.bloques_completados, s.bloques, 'bloque', 'bloques'),
    conteo(s.pasadas_completadas, s.bloques * s.pasadas, 'pasada', 'pasadas'),
  ].join(' · ');
}

/** "20 s de trabajo · 20 s de descanso · 90 s entre bloques". */
function textoConfig(s: SesionEntrenamientoRow): string {
  const partes = [
    `${s.trabajo_seg} s de trabajo`,
    // Un 0 se dice con palabras: "0 s de descanso" se lee como un dato roto.
    s.descanso_seg > 0 ? `${s.descanso_seg} s de descanso` : 'sin descanso',
  ];
  // El descanso de bloque solo existe si hay mas de un bloque: con uno solo
  // nunca llega a usarse. Misma condicion que en presetActivo().
  if (s.bloques > 1 && s.descanso_bloque_seg > 0) {
    partes.push(`${s.descanso_bloque_seg} s entre bloques`);
  }
  return partes.join(' · ');
}

/**
 * El detalle de lo que paso, en su propia card. Va aparte de la del evento a
 * proposito: el evento es lo que se planeo, la sesion es lo que ocurrio.
 */
function DetalleSesion({ sesion }: { sesion: SesionEntrenamientoRow }) {
  // Se reconstruye la config para poder usar los helpers puros del
  // temporizador en vez de repetir sus reglas aca.
  const config: ConfigTemporizador = {
    bloques: sesion.bloques,
    pasadas: sesion.pasadas,
    trabajoSeg: sesion.trabajo_seg,
    descansoSeg: sesion.descanso_seg,
    descansoBloqueSeg: sesion.descanso_bloque_seg,
  };
  const cronometro = esCronometro(config);

  // null si no hay distancia cargada, que es lo normal fuera del cronometro.
  const ritmo = calcularRitmo(sesion.distancia_km, sesion.duracion_real_seg);

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
      <Dato etiqueta="Duración real" valor={formatearSegundos(sesion.duracion_real_seg)} />

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
    backgroundColor: colors.accentSoft,
  },
  tagTexto: { fontSize: fontSize.small, color: colors.textOnAccentSoft },

  borrar: { paddingVertical: spacing.md, alignItems: 'center' },
  borrarTexto: { fontSize: fontSize.body, color: colors.danger },

  detalle: { fontSize: fontSize.small, lineHeight: lineHeight.small, color: colors.textSecondary },
  vacio: { paddingVertical: spacing.xl, alignItems: 'center' },
});
