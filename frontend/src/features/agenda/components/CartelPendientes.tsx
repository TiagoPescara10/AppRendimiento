// Cartel de eventos sin responder. Al abrir la app pregunta por los eventos
// cuyo fin previsto ya paso hace rato y que siguen mudos.
//
// Por que vive en el dashboard y no en el layout raiz: es lo primero que se ve
// al entrar, pero el layout raiz tambien monta el onboarding y el muro de
// registro, y ahi este cartel no tiene nada que hacer. Colgado del dashboard
// queda automaticamente detras del guard.
//
// La consulta y la escritura ya estan en db/queries/eventos.ts. Aca solo esta
// cuando preguntar y como se ve.

import { useState, useEffect } from 'react';
import { View, Text, Pressable, StyleSheet, Modal, ScrollView, Alert } from 'react-native';

import { Boton } from '@/ui/Boton';
import { colors, spacing, radius, fontSize, lineHeight, shadow } from '@/ui/theme';

import { listarEventosSinResponder, responderEvento } from '@/db/queries/eventos';
import { ETIQUETA_TIPO, horaDe, partesFecha } from '@/features/agenda/formato';
import type { EventoRow } from '@/db/schema';

/** Cuanto tiene que hacer que termino un evento para que valga preguntar. */
const HORAS_SIN_RESPONDER = 2;

/**
 * Si ya se pregunto en esta sesion de app.
 *
 * Vive a nivel de modulo y no en un ref o un estado del componente porque ese
 * es exactamente el tiempo de vida que hace falta: el modulo se evalua una vez
 * por contexto JS, y el contexto JS nace en el arranque en frio y muere cuando
 * se mata la app. Eso ES una sesion de app. Un ref se resetearia cada vez que
 * el dashboard se desmonta (cambio de tab, o el `router.replace` del guard del
 * layout raiz) y el cartel volveria a aparecer a mitad de sesion.
 *
 * Lo contrario tampoco sirve: guardarlo en AsyncStorage o en la base lo haria
 * sobrevivir al reinicio, y entonces "Despues" seria "nunca mas".
 *
 * Se prende al ARRANCAR la consulta, no al mostrar el cartel. Una revision por
 * sesion, punto: si se prendiera recien al mostrar, una sesion que no encontro
 * nada quedaria habilitada a volver a consultar mas tarde.
 */
let yaSeReviso = false;

export function CartelPendientes({ usuarioId }: { usuarioId: string }) {
  const [pendientes, setPendientes] = useState<EventoRow[]>([]);
  const [visible, setVisible] = useState(false);

  // useEffect y no useFocusEffect: esto pregunta al abrir la app, no cada vez
  // que el dashboard toma foco. El flag de arriba ya lo garantiza, pero la
  // intencion tiene que estar en el codigo.
  useEffect(() => {
    if (yaSeReviso) return;
    yaSeReviso = true;

    let vivo = true;

    (async () => {
      const filas = await listarEventosSinResponder(usuarioId, HORAS_SIN_RESPONDER);
      if (!vivo || filas.length === 0) return;
      setPendientes(filas);
      setVisible(true);
    })().catch((e) => console.error('Error al buscar eventos sin responder:', e));

    return () => { vivo = false; };
  }, [usuarioId]);

  /** Si o No. Las dos dejan el evento respondido; solo cambia `completado`. */
  const responder = async (id: string, completado: boolean) => {
    try {
      await responderEvento(id, completado);
    } catch (e) {
      console.error('Error al responder el evento:', e);
      Alert.alert('Error', 'No se pudo guardar la respuesta.');
      return;
    }

    // La fila contestada sale de la lista. Cuando no queda ninguna, el cartel
    // se cierra solo: no hace falta un boton mas para confirmar lo obvio.
    const resto = pendientes.filter((p) => p.id !== id);
    setPendientes(resto);
    if (resto.length === 0) setVisible(false);
  };

  /** "Despues" no escribe nada: los eventos siguen pendientes para manana. */
  const despues = () => setVisible(false);

  if (!visible) return null;

  const varios = pendientes.length > 1;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={despues}>
      {/* El fondo NO es tocable. El cartel hace una pregunta, y la salida
          tiene que ser deliberada y no un toque al costado. */}
      <View style={estilos.fondo}>
        <View style={estilos.cartel}>
          <Text style={estilos.titulo}>{varios ? '¿Los hiciste?' : '¿Lo hiciste?'}</Text>
          <Text style={estilos.detalle}>
            {varios
              ? 'Estos eventos ya pasaron y quedaron sin responder.'
              : 'Este evento ya pasó y quedó sin responder.'}
          </Text>

          <ScrollView style={estilos.lista} showsVerticalScrollIndicator={false}>
            {pendientes.map((e) => {
              const { dia, mes } = partesFecha(e.fecha);

              return (
                <View key={e.id} style={estilos.fila}>
                  <View style={estilos.flex}>
                    <Text style={estilos.nombre}>{ETIQUETA_TIPO[e.tipo]}</Text>
                    <Text style={estilos.detalle}>
                      {dia} de {mes} · {horaDe(e.fecha_hora_inicio)}
                    </Text>
                  </View>

                  <Pressable style={estilos.si} onPress={() => responder(e.id, true)}>
                    <Text style={estilos.siTexto}>Sí</Text>
                  </Pressable>
                  <Pressable style={estilos.no} onPress={() => responder(e.id, false)}>
                    <Text style={estilos.noTexto}>No</Text>
                  </Pressable>
                </View>
              );
            })}
          </ScrollView>

          <Boton titulo="Después" variante="secundario" onPress={despues} />
        </View>
      </View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------

const estilos = StyleSheet.create({
  flex: { flex: 1 },

  fondo: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
    backgroundColor: colors.overlay,
  },
  cartel: {
    // Blanco y no bg: esto es un dialogo centrado con margen a los cuatro
    // lados, o sea una card. El crema es fondo de pantalla, no de un bloque.
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
    ...shadow.sheet,
  },
  titulo: {
    fontSize: fontSize.subtitle,
    lineHeight: lineHeight.subtitle,
    fontWeight: '500',
    color: colors.textPrimary,
  },

  // flexShrink y no una altura fija: con dos eventos el cartel es chico, y con
  // quince la lista scrollea sin empujar el boton "Despues" fuera de pantalla.
  lista: { flexShrink: 1, marginVertical: spacing.sm },

  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
  },
  nombre: { fontSize: fontSize.body, lineHeight: lineHeight.body, color: colors.textPrimary },
  detalle: { fontSize: fontSize.small, lineHeight: lineHeight.small, color: colors.textSecondary },

  si: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.action,
  },
  siTexto: { fontSize: fontSize.small, color: colors.textOnAction },
  no: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 0.5,
    borderColor: colors.border,
  },
  noTexto: { fontSize: fontSize.small, color: colors.textPrimary },
});
