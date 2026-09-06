// Detalle de un dia de la agenda. Muestra los eventos de esa fecha con sus
// acciones: arrancar el temporizador, marcarlo hecho a mano, o borrarlo.
//
// La fecha llega por la ruta como "YYYY-MM-DD" local, que es exactamente el
// formato de la columna generada `fecha` de evento. Compara directo, sin
// convertir nada.

import { useState, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';

import { Pantalla } from '@/ui/Pantalla';
import { Boton } from '@/ui/Boton';
import { colors, spacing, radius, fontSize, lineHeight } from '@/ui/theme';

import { listarEventosPorFecha, marcarCompletado, eliminarEvento } from '@/db/queries/eventos';
import { obtenerPerfilLocal } from '@/db/queries/perfil';
import { ETIQUETA_TIPO, ETIQUETA_INTENSIDAD, horaDe, partesFecha } from '@/features/agenda/formato';
import { aFechaLocal } from '@/lib/fechas';
import type { EventoRow } from '@/db/schema';

// ---------------------------------------------------------------------------
// Pantalla
// ---------------------------------------------------------------------------

export default function DiaAgenda() {
  const router = useRouter();
  const { fecha } = useLocalSearchParams<{ fecha: string }>();

  const [eventos, setEventos] = useState<EventoRow[]>([]);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    if (!fecha) return;
    try {
      const perfil = await obtenerPerfilLocal();
      if (!perfil) return;
      setEventos(await listarEventosPorFecha(perfil.id, fecha));
    } catch (e) {
      console.error('Error al cargar el día:', e);
      Alert.alert('Error', 'No se pudieron cargar los eventos.');
    } finally {
      setCargando(false);
    }

  }, [fecha]);


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
  const marcar = async (id: string, completado: boolean) => {
    try {
      await marcarCompletado(id, completado);
      await cargar();
    } catch (e) {
      console.error('Error al marcar el evento:', e);
      Alert.alert('Error', 'No se pudo actualizar el evento.');
    }
  };

  const borrar = (id: string) => {
    Alert.alert('Borrar evento', '¿Seguro que querés borrarlo?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Borrar',
        style: 'destructive',
        onPress: async () => {
          try {
            await eliminarEvento(id);
            await cargar();
          } catch (e) {
            console.error('Error al borrar el evento:', e);
            Alert.alert('Error', 'No se pudo borrar el evento.');
          }
        },
      },
    ]);
  };

  const empezar = (id: string) => {
    // TODO: cuando exista el temporizador, esto navega ahi y el evento se
    // marca al terminar la sesion, no al arrancarla.
    Alert.alert('Próximamente', 'El temporizador todavía no está listo.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Marcar como hecho', onPress: () => marcar(id, true) },
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

  const { dia, mes } = partesFecha(fecha);
  const esPasado = fecha < aFechaLocal(new Date());

  return (
    <Pantalla>
      <View style={estilos.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={estilos.flecha}>‹</Text>
        </Pressable>
        <View>
          <Text style={estilos.titulo}>{dia}</Text>
          <Text style={estilos.detalle}>{mes}</Text>
        </View>
      </View>

      {eventos.length === 0 ? (
        <View style={estilos.vacio}>
          <Text style={estilos.detalle}>No tenés nada agendado este día.</Text>
        </View>
      ) : (
        eventos.map((e) => (
          <View key={e.id} style={estilos.card}>
            <View style={estilos.cardHeader}>
              <View style={estilos.flex}>
                <Text style={estilos.nombre}>{ETIQUETA_TIPO[e.tipo]}</Text>
                <Text style={estilos.detalle}>
                  {horaDe(e.fecha_hora_inicio)}
                  {e.duracion_estimada_min ? ` · ${e.duracion_estimada_min} min` : ''}
                  {' · '}
                  {ETIQUETA_INTENSIDAD[e.intensidad]}
                </Text>
              </View>
              {e.completado === 1 && (
                <View style={estilos.tag}>
                  <Text style={estilos.tagTexto}>Hecho</Text>
                </View>
              )}
            </View>

            {/* Las acciones cambian segun el estado. Un evento ya hecho solo
                se puede deshacer o borrar. */}
            <View style={estilos.acciones}>
              {e.completado === 1 ? (
                <Pressable style={estilos.accionSecundaria} onPress={() => marcar(e.id, false)}>
                  <Text style={estilos.accionSecundariaTexto}>Deshacer</Text>
                </Pressable>
              ) : (
                <>
                  {!esPasado && (
                    <Pressable style={estilos.accionPrimaria} onPress={() => empezar(e.id)}>
                      <Text style={estilos.accionPrimariaTexto}>Empezar</Text>
                    </Pressable>
                  )}
                  <Pressable
                    style={[estilos.accionSecundaria, esPasado && estilos.flex]}
                    onPress={() => marcar(e.id, true)}
                  >
                    <Text style={estilos.accionSecundariaTexto}>
                      {esPasado ? 'Marcar como hecho' : '✓'}
                    </Text>
                  </Pressable>
                </>
              )}

              <Pressable style={estilos.accionSecundaria} onPress={() => borrar(e.id)}>
                <Text style={estilos.borrarTexto}>Borrar</Text>
              </Pressable>
            </View>
          </View>
        ))
      )}

      <Boton titulo="Agregar a este día" onPress={() => router.push('/evento/nuevo')} />
    </Pantalla>
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
    gap: spacing.md,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },

  tag: {
    paddingVertical: 3,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.accentSoft,
  },
  tagTexto: { fontSize: fontSize.small, color: colors.textOnAccentSoft },

  acciones: { flexDirection: 'row', gap: spacing.xs },
  accionPrimaria: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.action,
    alignItems: 'center',
  },
  accionPrimariaTexto: { fontSize: fontSize.small, color: colors.textOnAction },
  accionSecundaria: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 0.5,
    borderColor: colors.border,
    alignItems: 'center',
  },
  accionSecundariaTexto: { fontSize: fontSize.small, color: colors.textPrimary },
  borrarTexto: { fontSize: fontSize.small, color: colors.danger },

  nombre: { fontSize: fontSize.body, lineHeight: lineHeight.body, color: colors.textPrimary },
  detalle: { fontSize: fontSize.small, lineHeight: lineHeight.small, color: colors.textSecondary },

  vacio: { paddingVertical: spacing.xl, alignItems: 'center' },
});