// src/features/entrenamiento/components/SheetModoEntrenamiento.tsx
//
// Modal bottom sheet para elegir el modo de entrenamiento al tocar "Entrenar":
//   - Rutina programada de hoy (destacada si existe)
//   - Otras rutinas de gimnasio definidas
//   - Rutina de gimnasio libre
//   - Pasadas (temporizador de intervalos estructurado)
//   - Cronometro (tiempo libre sin limite)

import { useState, useEffect } from 'react';
import { View, Text, Pressable, StyleSheet, Modal, ScrollView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { colors, spacing, radius, fontSize, lineHeight, sizes, shadow } from '@/ui/theme';
import { obtenerPerfilLocal } from '@/db/queries/perfil';
import {
  obtenerRutinasGimnasioDelDia,
  listarRutinasGimnasio,
  type RutinaGimnasioConDetalle,
} from '@/db/queries/rutinasGimnasio';

interface Props {
  visible: boolean;
  onCerrar: () => void;
}

export function SheetModoEntrenamiento({ visible, onCerrar }: Props) {
  const router = useRouter();

  const [cargando, setCargando] = useState(true);
  const [rutinasHoy, setRutinasHoy] = useState<RutinaGimnasioConDetalle[]>([]);
  const [otrasRutinas, setOtrasRutinas] = useState<RutinaGimnasioConDetalle[]>([]);
  const [mostrarOtras, setMostrarOtras] = useState(false);

  useEffect(() => {
    if (!visible) return;
    let vivo = true;
    setCargando(true);
    setMostrarOtras(false);

    (async () => {
      try {
        const perfil = await obtenerPerfilLocal();
        if (!perfil || !vivo) return;

        const diaSemana = new Date().getDay();
        const hoy = await obtenerRutinasGimnasioDelDia(perfil.id, diaSemana);
        const todas = await listarRutinasGimnasio(perfil.id, true);

        const idsHoy = new Set(hoy.map((r) => r.id));
        const otras = todas.filter((r) => !idsHoy.has(r.id));

        if (!vivo) return;
        setRutinasHoy(hoy);
        setOtrasRutinas(otras);
      } catch (err) {
        console.error('Error al cargar rutinas en sheet:', err);
      } finally {
        if (vivo) setCargando(false);
      }
    })();

    return () => {
      vivo = false;
    };
  }, [visible]);

  if (!visible) return null;

  const elegirModo = (ruta: string) => {
    onCerrar();
    router.push(ruta as any);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCerrar}>
      <View style={estilos.overlay}>
        <Pressable style={estilos.fondo} onPress={onCerrar} />

        <View style={estilos.sheet}>
          <View style={estilos.manija} />

          <Text style={estilos.titulo}>Elegir entrenamiento</Text>
          <Text style={estilos.subtitulo}>¿Qué vas a entrenar hoy?</Text>

          {cargando ? (
            <View style={estilos.centrado}>
              <ActivityIndicator color={colors.action} />
            </View>
          ) : (
            <ScrollView
              contentContainerStyle={estilos.opciones}
              showsVerticalScrollIndicator={false}
            >
              {/* 1. Rutina de gimnasio del dia */}
              {rutinasHoy.map((r) => (
                <Pressable
                  key={r.id}
                  style={({ pressed }) => [
                    estilos.opcion,
                    estilos.opcionDestacada,
                    pressed && estilos.opcionPresionada,
                  ]}
                  onPress={() =>
                    elegirModo(
                      `/evento/rutina?rutinaGimnasioId=${r.id}&nombreRutina=${encodeURIComponent(
                        r.nombre,
                      )}`,
                    )
                  }
                >
                  <View style={[estilos.iconoContenedor, estilos.iconoDestacado]}>
                    <Ionicons name="barbell-outline" size={sizes.icon} color={colors.textOnAction} />
                  </View>
                  <View style={estilos.opcionInfo}>
                    <Text style={estilos.badgeHoy}>HOY TOCA</Text>
                    <Text style={estilos.opcionTitulo}>{r.nombre}</Text>
                    <Text style={estilos.opcionDetalle}>
                      {r.ejercicios.length}{' '}
                      {r.ejercicios.length === 1 ? 'ejercicio' : 'ejercicios'} · {r.hora}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                </Pressable>
              ))}

              {/* 2. Otras rutinas o Rutina de gimnasio si hoy no hay programada */}
              {otrasRutinas.length > 0 && (
                <View style={estilos.bloqueOtras}>
                  <Pressable
                    style={estilos.cabeceraOtras}
                    onPress={() => setMostrarOtras((prev) => !prev)}
                  >
                    <Text style={estilos.cabeceraOtrasTexto}>
                      {rutinasHoy.length > 0 ? 'Otras rutinas de gimnasio' : 'Rutinas de gimnasio'}
                    </Text>
                    <Ionicons
                      name={mostrarOtras ? 'chevron-up' : 'chevron-down'}
                      size={18}
                      color={colors.textSecondary}
                    />
                  </Pressable>

                  {mostrarOtras && (
                    <View style={estilos.listaOtras}>
                      {otrasRutinas.map((r) => (
                        <Pressable
                          key={r.id}
                          style={({ pressed }) => [
                            estilos.itemOtra,
                            pressed && estilos.opcionPresionada,
                          ]}
                          onPress={() =>
                            elegirModo(
                              `/evento/rutina?rutinaGimnasioId=${r.id}&nombreRutina=${encodeURIComponent(
                                r.nombre,
                              )}`,
                            )
                          }
                        >
                          <Ionicons name="barbell-outline" size={18} color={colors.action} />
                          <View style={estilos.opcionInfo}>
                            <Text style={estilos.otraTitulo}>{r.nombre}</Text>
                            <Text style={estilos.opcionDetalle}>
                              {r.ejercicios.length}{' '}
                              {r.ejercicios.length === 1 ? 'ejercicio' : 'ejercicios'}
                            </Text>
                          </View>
                          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                        </Pressable>
                      ))}
                    </View>
                  )}
                </View>
              )}

              {/* Si no hay rutinas programadas hoy y tampoco hay otras definidas */}
              {rutinasHoy.length === 0 && otrasRutinas.length === 0 && (
                <Pressable
                  style={({ pressed }) => [estilos.opcion, pressed && estilos.opcionPresionada]}
                  onPress={() => elegirModo('/evento/rutina')}
                >
                  <View style={estilos.iconoContenedor}>
                    <Ionicons name="barbell-outline" size={sizes.icon} color={colors.action} />
                  </View>
                  <View style={estilos.opcionInfo}>
                    <Text style={estilos.opcionTitulo}>Rutina de gimnasio</Text>
                    <Text style={estilos.opcionDetalle}>
                      Anotá ejercicios con sus series, repeticiones y peso
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                </Pressable>
              )}

              {/* Acceso rapido a rutina libre si ya hay rutinas configuradas */}
              {(rutinasHoy.length > 0 || otrasRutinas.length > 0) && (
                <Pressable
                  style={({ pressed }) => [estilos.opcionSimple, pressed && estilos.opcionPresionada]}
                  onPress={() => elegirModo('/evento/rutina')}
                >
                  <Ionicons name="fitness-outline" size={20} color={colors.textSecondary} />
                  <Text style={estilos.opcionSimpleTexto}>Rutina de gimnasio libre (sin estructura)</Text>
                </Pressable>
              )}

              {/* 3. Pasadas (intervalos) */}
              <Pressable
                style={({ pressed }) => [estilos.opcion, pressed && estilos.opcionPresionada]}
                onPress={() => elegirModo('/evento/temporizador')}
              >
                <View style={estilos.iconoContenedor}>
                  <Ionicons name="timer-outline" size={sizes.icon} color={colors.action} />
                </View>
                <View style={estilos.opcionInfo}>
                  <Text style={estilos.opcionTitulo}>Pasadas por intervalos</Text>
                  <Text style={estilos.opcionDetalle}>
                    Temporizador estructurado con bloques y descanso
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </Pressable>

              {/* 4. Cronometro libre */}
              <Pressable
                style={({ pressed }) => [estilos.opcion, pressed && estilos.opcionPresionada]}
                onPress={() => elegirModo('/evento/temporizador?modo=cronometro')}
              >
                <View style={estilos.iconoContenedor}>
                  <Ionicons name="stopwatch-outline" size={sizes.icon} color={colors.action} />
                </View>
                <View style={estilos.opcionInfo}>
                  <Text style={estilos.opcionTitulo}>Cronómetro libre</Text>
                  <Text style={estilos.opcionDetalle}>
                    Medición de tiempo abierto sin estructura fija
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </Pressable>

              {/* Enlace para definir una nueva rutina */}
              <Pressable
                style={estilos.botonDefinirRutina}
                onPress={() => elegirModo('/rutina-gimnasio/nueva')}
              >
                <Ionicons name="add-circle-outline" size={18} color={colors.action} />
                <Text style={estilos.botonDefinirRutinaTexto}>Definir nueva rutina de gimnasio</Text>
              </Pressable>
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const estilos = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  fondo: {
    ...StyleSheet.absoluteFill,
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
    maxHeight: '85%',
    gap: spacing.sm,
    ...shadow.card,
  },
  manija: {
    width: 36,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: spacing.xs,
  },
  centrado: {
    paddingVertical: spacing.xxl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titulo: {
    fontSize: fontSize.title,
    lineHeight: lineHeight.title,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  subtitulo: {
    fontSize: fontSize.small,
    lineHeight: lineHeight.small,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  opciones: {
    gap: spacing.sm,
    paddingBottom: spacing.md,
  },
  opcion: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.md,
  },
  opcionDestacada: {
    borderWidth: 1.5,
    borderColor: colors.action,
    backgroundColor: colors.surface,
    ...shadow.card,
  },
  opcionPresionada: {
    opacity: 0.8,
  },
  iconoContenedor: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconoDestacado: {
    backgroundColor: colors.action,
  },
  badgeHoy: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.action,
    letterSpacing: 0.5,
  },
  opcionInfo: {
    flex: 1,
    gap: 2,
  },
  opcionTitulo: {
    fontSize: fontSize.body,
    lineHeight: lineHeight.body,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  opcionDetalle: {
    fontSize: fontSize.caption,
    lineHeight: lineHeight.caption,
    color: colors.textSecondary,
  },

  bloqueOtras: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  cabeceraOtras: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
  },
  cabeceraOtrasTexto: {
    fontSize: fontSize.body,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  listaOtras: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.xs,
  },
  itemOtra: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    padding: spacing.sm,
    gap: spacing.sm,
  },
  otraTitulo: {
    fontSize: fontSize.small,
    fontWeight: '600',
    color: colors.textPrimary,
  },

  opcionSimple: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    gap: spacing.sm,
  },
  opcionSimpleTexto: {
    fontSize: fontSize.small,
    color: colors.textSecondary,
  },

  botonDefinirRutina: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  botonDefinirRutinaTexto: {
    fontSize: fontSize.small,
    fontWeight: '600',
    color: colors.action,
  },
});
