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
import { View, Text, Pressable, StyleSheet, Modal, ScrollView, Alert, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Boton } from '@/ui/Boton';
import { colors, spacing, radius, fontSize, fontWeight, lineHeight, shadow } from '@/ui/theme';

import { listarEventosSinResponder, responderEvento } from '@/db/queries/eventos';
import { obtenerPerfilLocal } from '@/db/queries/perfil';
import { etiquetaTipo, horaDe, partesFecha } from '@/features/agenda/formato';
import { aFechaLocal } from '@/lib/fechas';
import type { EventoRow } from '@/db/schema';

/** Cuanto tiene que hacer que termino un evento para que valga preguntar. */
const HORAS_SIN_RESPONDER = 2;

/**
 * Si ya se pregunto en esta sesion de app.
 */
let yaSeReviso = false;

export interface CartelPendientesProps {
  usuarioId?: string;
  eventosMock?: EventoRow[];
  deporteMock?: string;
  onResponderMock?: (id: string, completado: boolean) => void;
  onCerrarMock?: () => void;
  visible?: boolean;
}

export function CartelPendientes({
  usuarioId,
  eventosMock,
  deporteMock,
  onResponderMock,
  onCerrarMock,
  visible: visibleProp,
}: CartelPendientesProps) {
  const [pendientes, setPendientes] = useState<EventoRow[]>(eventosMock ?? []);
  const [deporte, setDeporte] = useState<string | null>(deporteMock ?? null);
  const [visible, setVisible] = useState(visibleProp ?? false);

  useEffect(() => {
    if (eventosMock !== undefined) {
      setPendientes(eventosMock);
      if (visibleProp !== undefined) {
        setVisible(visibleProp);
      } else {
        setVisible(eventosMock.length > 0);
      }
      if (deporteMock !== undefined) {
        setDeporte(deporteMock);
      }
      return;
    }

    if (!usuarioId) return;
    if (yaSeReviso) return;
    yaSeReviso = true;

    let vivo = true;

    (async () => {
      const [filas, perfil] = await Promise.all([
        listarEventosSinResponder(usuarioId, HORAS_SIN_RESPONDER),
        obtenerPerfilLocal(),
      ]);
      if (!vivo || filas.length === 0) return;
      setPendientes(filas);
      setDeporte(perfil?.deporte_principal ?? null);
      setVisible(true);
    })().catch((e) => console.error('Error al buscar eventos sin responder:', e));

    return () => { vivo = false; };
  }, [usuarioId, eventosMock, visibleProp, deporteMock]);

  /** Si o No. Las dos dejan el evento respondido; solo cambia `completado`. */
  const responder = async (id: string, completado: boolean) => {
    if (eventosMock !== undefined) {
      onResponderMock?.(id, completado);
      const resto = pendientes.filter((p) => p.id !== id);
      setPendientes(resto);
      if (resto.length === 0) {
        setVisible(false);
        onCerrarMock?.();
      }
      return;
    }

    try {
      await responderEvento(id, completado);
    } catch (e) {
      console.error('Error al responder el evento:', e);
      Alert.alert('Error', 'No se pudo guardar la respuesta.');
      return;
    }

    const resto = pendientes.filter((p) => p.id !== id);
    setPendientes(resto);
    if (resto.length === 0) setVisible(false);
  };

  /** "Despues" o cierre (✕) no escribe nada: los eventos siguen pendientes para manana. */
  const despues = () => {
    setVisible(false);
    onCerrarMock?.();
  };

  if (!visible || pendientes.length === 0) return null;

  const varios = pendientes.length > 1;
  const eventoUnico = pendientes[0];

  const nombreUnico = eventoUnico
    ? etiquetaTipo(eventoUnico.tipo, deporte, {
        rutinaId: eventoUnico.rutina_id,
        modoEntrenamiento: eventoUnico.modo_entrenamiento,
        deporte: eventoUnico.deporte,
      })
    : '';

  const fechaDetalleUnico = eventoUnico
    ? (() => {
        const hoyLocal = aFechaLocal(new Date());
        const ayer = new Date();
        ayer.setDate(ayer.getDate() - 1);
        const ayerLocal = aFechaLocal(ayer);
        const hora = horaDe(eventoUnico.fecha_hora_inicio);

        if (eventoUnico.fecha === hoyLocal) {
          return `Hoy · ${hora} hs`;
        }
        if (eventoUnico.fecha === ayerLocal) {
          return `Ayer · ${hora} hs`;
        }
        const { dia, mes } = partesFecha(eventoUnico.fecha);
        return `${dia} de ${mes} · ${hora} hs`;
      })()
    : '';

  const esHoyUnico = eventoUnico ? eventoUnico.fecha === aFechaLocal(new Date()) : true;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={despues}>
      <View style={estilos.fondo}>
        <View style={estilos.cartel}>
          {/* Boton circular de cierre (✕) */}
          <Pressable
            style={({ pressed }) => [
              estilos.botonCerrar,
              pressed && estilos.botonCerrarPresionado,
            ]}
            onPress={despues}
            accessibilityLabel="Cerrar"
            accessibilityRole="button"
          >
            <Ionicons name="close" size={18} color={colors.textSecondary} />
          </Pressable>

          {/* Ilustracion de la mascota del Leon Coach */}
          <Image
            source={require('@/assets/images/leon_coach.png')}
            style={varios ? estilos.mascotaVarios : estilos.mascota}
            resizeMode="contain"
          />

          {varios ? (
            // Caso multiple: lista de actividades pendientes
            <>
              <Text style={estilos.titulo}>¿Completaste tus entrenamientos?</Text>
              <Text style={estilos.detalle}>
                Tenés actividades que ya finalizaron y quedaron sin confirmar:
              </Text>

              <ScrollView style={estilos.lista} showsVerticalScrollIndicator={false}>
                {pendientes.map((e) => {
                  const { dia, mes } = partesFecha(e.fecha);

                  return (
                    <View key={e.id} style={estilos.filaVarios}>
                      <View style={estilos.flex}>
                        <Text style={estilos.nombreVarios}>
                          {etiquetaTipo(e.tipo, deporte, {
                            rutinaId: e.rutina_id,
                            modoEntrenamiento: e.modo_entrenamiento,
                            deporte: e.deporte,
                          })}
                        </Text>
                        <Text style={estilos.detalleVarios}>
                          {dia} de {mes} · {horaDe(e.fecha_hora_inicio)}
                        </Text>
                      </View>

                      <View style={estilos.accionesFila}>
                        <Pressable
                          style={({ pressed }) => [
                            estilos.botonNoItem,
                            pressed && estilos.botonNoPresionado,
                          ]}
                          onPress={() => responder(e.id, false)}
                        >
                          <Text style={estilos.textoNoItem}>No</Text>
                        </Pressable>
                        <Pressable
                          style={({ pressed }) => [
                            estilos.botonSiItem,
                            pressed && estilos.botonSiPresionado,
                          ]}
                          onPress={() => responder(e.id, true)}
                        >
                          <Text style={estilos.textoSiItem}>Sí</Text>
                        </Pressable>
                      </View>
                    </View>
                  );
                })}
              </ScrollView>

              <View style={estilos.footerDespues}>
                <Boton titulo="Responder después" variante="secundario" onPress={despues} />
              </View>
            </>
          ) : (
            // Caso unico ("Check-in diario"): confirmacion rapida de friccion cero
            <>
              <Text style={estilos.titulo}>
                {esHoyUnico ? '¿Fuiste a entrenamiento hoy?' : '¿Fuiste a tu entrenamiento?'}
              </Text>

              <View style={estilos.fichaEventoUnico}>
                <Text style={estilos.nombreEventoUnico}>{nombreUnico}</Text>
                <Text style={estilos.detalleEventoUnico}>{fechaDetalleUnico}</Text>
              </View>

              <View style={estilos.filaAcciones}>
                <Pressable
                  style={({ pressed }) => [
                    estilos.botonNo,
                    pressed && estilos.botonNoPresionado,
                  ]}
                  onPress={() => responder(eventoUnico.id, false)}
                  accessibilityRole="button"
                >
                  <Text style={estilos.textoNo}>No</Text>
                </Pressable>

                <Pressable
                  style={({ pressed }) => [
                    estilos.botonSi,
                    pressed && estilos.botonSiPresionado,
                  ]}
                  onPress={() => responder(eventoUnico.id, true)}
                  accessibilityRole="button"
                >
                  <Text style={estilos.textoSi}>Sí</Text>
                </Pressable>
              </View>
            </>
          )}
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
    alignItems: 'center',
    padding: spacing.lg,
    backgroundColor: 'rgba(21, 34, 81, 0.72)', // Overlay marino profundo institucional
  },
  cartel: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: colors.surface, // Blanco puro (#FFFFFF)
    borderRadius: 28, // Radio curvado 28px
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 24,
    alignItems: 'center',
    position: 'relative',
    ...shadow.sheet,
  },

  // Boton circular de cierre en esquina superior derecha
  botonCerrar: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  botonCerrarPresionado: {
    opacity: 0.7,
    backgroundColor: colors.border,
  },

  // Ilustracion central de la mascota
  mascota: {
    width: 144,
    height: 144,
    alignSelf: 'center',
    marginBottom: 16,
    marginTop: 6,
  },
  mascotaVarios: {
    width: 108,
    height: 108,
    alignSelf: 'center',
    marginBottom: 12,
  },

  // Titulo y detalles
  titulo: {
    fontSize: 21,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  detalle: {
    fontSize: fontSize.small,
    lineHeight: lineHeight.small,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 6,
  },

  // Ficha de detalle para caso unico
  fichaEventoUnico: {
    width: '100%',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    marginTop: 14,
  },
  nombreEventoUnico: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
  },
  detalleEventoUnico: {
    fontSize: fontSize.small,
    color: colors.textSecondary,
    marginTop: 3,
    textAlign: 'center',
  },

  // Fila de acciones para caso unico (Check-in rapido)
  filaAcciones: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 18,
    width: '100%',
  },
  botonNo: {
    flex: 1,
    height: 52,
    borderRadius: 16,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  botonNoPresionado: {
    backgroundColor: colors.border,
  },
  textoNo: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
  },

  botonSi: {
    flex: 1,
    height: 52,
    borderRadius: 16,
    backgroundColor: colors.action, // Marino institucional Avanza (#243B8F)
    alignItems: 'center',
    justifyContent: 'center',
  },
  botonSiPresionado: {
    backgroundColor: colors.actionPressed, // Marino hundido (#1B2C6A)
  },
  textoSi: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textOnAction,
  },

  // Caso multiple
  lista: {
    width: '100%',
    maxHeight: 220,
    marginTop: 12,
  },
  filaVarios: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  nombreVarios: {
    fontSize: fontSize.body,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  detalleVarios: {
    fontSize: fontSize.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  accionesFila: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  botonSiItem: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    backgroundColor: colors.action,
  },
  botonSiPresionadoItem: {
    backgroundColor: colors.actionPressed,
  },
  textoSiItem: {
    fontSize: fontSize.small,
    fontWeight: '700',
    color: colors.textOnAction,
  },
  botonNoItem: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  textoNoItem: {
    fontSize: fontSize.small,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  footerDespues: {
    width: '100%',
    marginTop: 12,
  },
});
