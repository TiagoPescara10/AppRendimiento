// Detalle de un evento suelto. Se llega desde "Esta semana" en la agenda,
// donde cada fila apunta a un evento concreto y no a un dia entero.
//
// Es el hermano chico de /evento/dia/[fecha]: mismos helpers de formato,
// mismas acciones, una sola fila. La diferencia real es que aca el borrado
// deja la pantalla sin nada que mostrar, asi que vuelve atras en vez de
// recargar.

import { useState, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';

import { Pantalla } from '@/ui/Pantalla';
import { Boton } from '@/ui/Boton';
import { colors, spacing, radius, fontSize, lineHeight } from '@/ui/theme';

import { obtenerEvento, marcarCompletado, eliminarEvento } from '@/db/queries/eventos';
import { ETIQUETA_TIPO, ETIQUETA_INTENSIDAD, horaDe, partesFecha } from '@/features/agenda/formato';
import type { EventoRow } from '@/db/schema';

// ---------------------------------------------------------------------------
// Pantalla
// ---------------------------------------------------------------------------

export default function DetalleEvento() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [evento, setEvento] = useState<EventoRow | null>(null);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    if (!id) return;
    try {
      setEvento(await obtenerEvento(id));
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
  },
  fila: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  valor: { fontSize: fontSize.body, lineHeight: lineHeight.body, color: colors.textPrimary },

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
