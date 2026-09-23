// app/perfil/rutinas.tsx
//
// Administracion y baja de rutinas activas de entrenamiento y de gimnasio.
// Muestra las rutinas agrupadas por dia y permite desactivarlas limpiando
// los eventos futuros generados en la agenda, sin alterar el historial.

import { useState, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { Pantalla } from '@/ui/Pantalla';
import { Boton } from '@/ui/Boton';
import {
  colors,
  spacing,
  radius,
  fontSize,
  lineHeight,
  shadow,
  fontWeight,
  sizes,
} from '@/ui/theme';

import { obtenerPerfilLocal } from '@/db/queries/perfil';
import { listarRutinas } from '@/db/queries/rutinas';
import {
  listarRutinasGimnasio,
  type RutinaGimnasioConDetalle,
} from '@/db/queries/rutinasGimnasio';
import {
  desactivarRutina,
  desactivarRutinaGimnasioYLimpiar,
} from '@/features/agenda/materializar';
import {
  agruparRutinas,
  agruparRutinasGimnasio,
  formatearHoraCorta,
  DIAS_SEMANA,
  type RutinaAgrupada,
  type RutinaGimnasioAgrupada,
} from '@/features/agenda/rutinas';
import { etiquetaTipo, capitalizarDeporte } from '@/features/agenda/formato';

export default function MisRutinas() {
  const router = useRouter();

  const [cargando, setCargando] = useState(true);
  const [deporte, setDeporte] = useState<string | null>(null);
  const [entrenamientos, setEntrenamientos] = useState<RutinaAgrupada[]>([]);
  const [gimnasios, setGimnasios] = useState<RutinaGimnasioAgrupada[]>([]);

  const cargarDatos = useCallback(async () => {
    try {
      const perfil = await obtenerPerfilLocal();
      if (!perfil) return;
      setDeporte(perfil.deporte_principal);

      const [rutinasTodas, rutinasGim] = await Promise.all([
        listarRutinas(perfil.id, true),
        listarRutinasGimnasio(perfil.id, true),
      ]);

      const rutinasEntreno = rutinasTodas.filter((r) => r.tipo !== 'gimnasio');
      const rutinasGimnasioFilas = rutinasTodas.filter((r) => r.tipo === 'gimnasio');

      setEntrenamientos(agruparRutinas(rutinasEntreno));
      setGimnasios(agruparRutinasGimnasio(rutinasGimnasioFilas, rutinasGim));
    } catch (e) {
      console.error('Error al cargar rutinas:', e);
      Alert.alert('Error', 'No se pudieron cargar las rutinas.');
    } finally {
      setCargando(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      cargarDatos();
    }, [cargarDatos]),
  );

  const confirmarBorrarEntrenamiento = (rutina: RutinaAgrupada) => {
    Alert.alert(
      'Dar de baja rutina',
      'Se van a borrar los eventos futuros de esta rutina. Lo que ya hiciste queda en tu historial.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Dar de baja',
          style: 'destructive',
          onPress: async () => {
            try {
              for (const id of rutina.ids) {
                await desactivarRutina(id);
              }
              await cargarDatos();
            } catch (e) {
              console.error('Error al desactivar rutina de entrenamiento:', e);
              Alert.alert('Error', 'No se pudo dar de baja la rutina.');
            }
          },
        },
      ],
    );
  };

  const confirmarBorrarGimnasio = (rutina: RutinaGimnasioAgrupada) => {
    Alert.alert(
      'Dar de baja rutina',
      'Se van a borrar los eventos futuros de esta rutina. Lo que ya hiciste queda en tu historial.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Dar de baja',
          style: 'destructive',
          onPress: async () => {
            try {
              if (rutina.rutinaGimnasioId) {
                await desactivarRutinaGimnasioYLimpiar(rutina.rutinaGimnasioId);
              } else {
                for (const id of rutina.ids) {
                  await desactivarRutina(id);
                }
              }
              await cargarDatos();
            } catch (e) {
              console.error('Error al desactivar rutina de gimnasio:', e);
              Alert.alert('Error', 'No se pudo dar de baja la rutina.');
            }
          },
        },
      ],
    );
  };

  const editarEntrenamiento = (rutina: RutinaAgrupada) => {
    router.push({
      pathname: '/evento/nuevo',
      params: {
        rutinaIds: rutina.ids.join(','),
        tipo: rutina.tipo,
        dias: rutina.dias.join(','),
        hora: rutina.hora,
        duracion: String(rutina.duracion_estimada_min ?? 60),
        intensidad: rutina.intensidad,
        deporte: rutina.deporte ?? '',
      },
    });
  };

  // Dias y hora de una rutina de gimnasio ya asignada. El lapiz edita el
  // catalogo (nombre y ejercicios); la programacion se edita en Nuevo evento.
  const editarDiasGimnasio = (rutina: RutinaGimnasioAgrupada) => {
    router.push({
      pathname: '/evento/nuevo',
      params: {
        rutinaIds: rutina.ids.join(','),
        tipo: 'gimnasio',
        dias: rutina.dias.join(','),
        hora: rutina.hora,
        duracion: String(rutina.duracion_estimada_min ?? 60),
        intensidad: rutina.intensidad,
      },
    });
  };

  const editarGimnasio = (rutina: RutinaGimnasioAgrupada) => {
    if (rutina.rutinaGimnasioId) {
      router.push({
        pathname: '/rutina-gimnasio/nueva',
        params: {
          id: rutina.rutinaGimnasioId,
        },
      });
    } else {
      router.push({
        pathname: '/evento/nuevo',
        params: {
          rutinaIds: rutina.ids.join(','),
          tipo: 'gimnasio',
          dias: rutina.dias.join(','),
          hora: rutina.hora,
          duracion: String(rutina.duracion_estimada_min ?? 60),
          intensidad: rutina.intensidad,
        },
      });
    }
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

  const sinRutinas = entrenamientos.length === 0 && gimnasios.length === 0;

  return (
    <Pantalla>
      {/* Cabecera con boton para volver */}
      <View style={estilos.headerBar}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={estilos.botonVolver}
          accessibilityRole="button"
          accessibilityLabel="Volver"
        >
          <Text style={estilos.flechaVolver}>‹</Text>
        </Pressable>
        <Text style={estilos.tituloPantalla}>Mis rutinas</Text>
      </View>

      {sinRutinas ? (
        /* Estado vacio cuando no hay ninguna rutina activa */
        <View style={estilos.vacioContenedor}>
          <View style={estilos.vacioIconoFondo}>
            <Ionicons name="calendar-outline" size={36} color={colors.textSecondary} />
          </View>
          <Text style={estilos.vacioTitulo}>No tenes rutinas activas</Text>
          <Text style={estilos.vacioTexto}>
            Crea una rutina semanal para agendar tus entrenamientos o planificar tus sesiones de gimnasio.
          </Text>
          <View style={estilos.vacioAcciones}>
            <Boton
              titulo="Crear entrenamiento semanal"
              onPress={() => router.push('/evento/nuevo')}
            />
            <Boton
              titulo="Crear rutina de gimnasio"
              variante="secundario"
              onPress={() => router.push('/rutina-gimnasio/nueva')}
            />
            <Boton
              titulo="Ver rutinas predefinidas"
              variante="secundario"
              onPress={() => router.push('/rutina-gimnasio/predefinidas')}
            />
          </View>
        </View>
      ) : (
        <>
          {/* Seccion 1: Rutinas de entrenamiento */}
          <View style={estilos.seccionBloque}>
            <Text style={estilos.seccionTitulo}>Rutinas de entrenamiento</Text>
            {entrenamientos.length === 0 ? (
              <View style={estilos.cardVacia}>
                <Text style={estilos.textoVacio}>No tenes rutinas de entrenamiento activas.</Text>
              </View>
            ) : (
              <View style={estilos.lista}>
                {entrenamientos.map((item) => (
                  <View key={item.ids.join('-')} style={estilos.card}>
                    <View style={estilos.cardContenido}>
                      <View style={estilos.cardInfo}>
                        <Text style={estilos.tituloRutina}>
                          {/* El tipo sale de la rutina: esta seccion tambien lista partidos y competencias */}
                          {(item.tipo === 'entrenamiento' ? 'Entrenamiento' : etiquetaTipo(item.tipo)) +
                            (item.deporte || deporte
                              ? ` · ${capitalizarDeporte(item.deporte || deporte)}`
                              : '')}
                        </Text>
                        <View style={estilos.diasFila}>
                          {DIAS_SEMANA.map((dia, idx) => {
                            const activo = item.dias.includes(idx);
                            return (
                              <View
                                key={idx}
                                style={[estilos.diaCirculo, activo && estilos.diaCirculoActivo]}
                              >
                                <Text
                                  style={[estilos.diaTexto, activo && estilos.diaTextoActivo]}
                                >
                                  {dia}
                                </Text>
                              </View>
                            );
                          })}
                        </View>
                        <Text style={estilos.detalleRutina}>
                          {formatearHoraCorta(item.hora)}
                          {item.duracion_estimada_min ? ` · ${item.duracion_estimada_min} min` : ''}
                        </Text>
                      </View>
                      <View style={estilos.accionesFila}>
                        <Pressable
                          onPress={() => editarEntrenamiento(item)}
                          hitSlop={10}
                          style={estilos.botonAccion}
                          accessibilityRole="button"
                          accessibilityLabel="Editar rutina de entrenamiento"
                        >
                          <Ionicons name="pencil-outline" size={20} color={colors.textSecondary} />
                        </Pressable>
                        <Pressable
                          onPress={() => confirmarBorrarEntrenamiento(item)}
                          hitSlop={10}
                          style={estilos.botonAccion}
                          accessibilityRole="button"
                          accessibilityLabel="Eliminar rutina de entrenamiento"
                        >
                          <Ionicons name="trash-outline" size={20} color={colors.danger} />
                        </Pressable>
                      </View>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* Seccion 2: Rutinas de gimnasio */}
          <View style={estilos.seccionBloque}>
            <Text style={estilos.seccionTitulo}>Rutinas de gimnasio</Text>
            {gimnasios.length === 0 ? (
              <View style={estilos.cardVacia}>
                <Text style={estilos.textoVacio}>No tenes rutinas de gimnasio activas.</Text>
              </View>
            ) : (
              <View style={estilos.lista}>
                {gimnasios.map((item) => (
                  <View
                    key={item.rutinaGimnasioId ? `rg_${item.rutinaGimnasioId}_${item.hora}` : `libre_${item.ids.join('-')}`}
                    style={estilos.card}
                  >
                    <View style={estilos.cardContenido}>
                      <View style={estilos.cardInfo}>
                        <Text style={estilos.tituloRutina}>{item.nombre}</Text>
                        <View style={estilos.diasFila}>
                          {DIAS_SEMANA.map((dia, idx) => {
                            const activo = item.dias.includes(idx);
                            return (
                              <View
                                key={idx}
                                style={[estilos.diaCirculo, activo && estilos.diaCirculoActivo]}
                              >
                                <Text
                                  style={[estilos.diaTexto, activo && estilos.diaTextoActivo]}
                                >
                                  {dia}
                                </Text>
                              </View>
                            );
                          })}
                        </View>
                        <Text style={estilos.detalleRutina}>
                          {item.dias.length > 0 ? formatearHoraCorta(item.hora) : 'Sin dias asignados'}
                          {item.duracion_estimada_min ? ` · ${item.duracion_estimada_min} min` : ''}
                          {item.ejerciciosCount > 0 ? ` · ${item.ejerciciosCount} ejercicios` : ''}
                        </Text>
                      </View>
                      <View style={estilos.accionesFila}>
                        {item.rutinaGimnasioId && item.ids.length > 0 && (
                          <Pressable
                            onPress={() => editarDiasGimnasio(item)}
                            hitSlop={10}
                            style={estilos.botonAccion}
                            accessibilityRole="button"
                            accessibilityLabel="Editar dias y hora"
                          >
                            <Ionicons name="calendar-outline" size={20} color={colors.textSecondary} />
                          </Pressable>
                        )}
                        <Pressable
                          onPress={() => editarGimnasio(item)}
                          hitSlop={10}
                          style={estilos.botonAccion}
                          accessibilityRole="button"
                          accessibilityLabel="Editar rutina de gimnasio"
                        >
                          <Ionicons name="pencil-outline" size={20} color={colors.textSecondary} />
                        </Pressable>
                        <Pressable
                          onPress={() => confirmarBorrarGimnasio(item)}
                          hitSlop={10}
                          style={estilos.botonAccion}
                          accessibilityRole="button"
                          accessibilityLabel="Eliminar rutina de gimnasio"
                        >
                          <Ionicons name="trash-outline" size={20} color={colors.danger} />
                        </Pressable>
                      </View>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        </>
      )}
    </Pantalla>
  );
}

const estilos = StyleSheet.create({
  centrado: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  botonVolver: {
    paddingRight: spacing.xs,
  },
  flechaVolver: {
    fontSize: 28,
    color: colors.textSecondary,
    marginTop: -2,
  },
  tituloPantalla: {
    fontSize: fontSize.title,
    lineHeight: lineHeight.title,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },

  seccionBloque: {
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  seccionTitulo: {
    fontSize: fontSize.small,
    lineHeight: lineHeight.small,
    fontWeight: fontWeight.medium,
    color: colors.textSecondary,
  },

  lista: {
    gap: spacing.sm,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    ...shadow.card,
  },
  cardContenido: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  cardInfo: {
    flex: 1,
    gap: spacing.xs,
  },
  tituloRutina: {
    fontSize: fontSize.body,
    lineHeight: lineHeight.body,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  detalleRutina: {
    fontSize: fontSize.small,
    lineHeight: lineHeight.small,
    color: colors.textSecondary,
  },

  diasFila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginVertical: spacing.xs,
  },
  diaCirculo: {
    width: 26,
    height: 26,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  diaCirculoActivo: {
    backgroundColor: colors.action,
  },
  diaTexto: {
    fontSize: fontSize.caption,
    fontWeight: fontWeight.medium,
    color: colors.textSecondary,
  },
  diaTextoActivo: {
    color: colors.textOnAction,
  },

  accionesFila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  botonAccion: {
    padding: spacing.sm,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },

  cardVacia: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.card,
  },
  textoVacio: {
    fontSize: fontSize.small,
    lineHeight: lineHeight.small,
    color: colors.textSecondary,
    textAlign: 'center',
  },

  vacioContenedor: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  vacioIconoFondo: {
    width: 72,
    height: 72,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  vacioTitulo: {
    fontSize: fontSize.subtitle,
    lineHeight: lineHeight.subtitle,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  vacioTexto: {
    fontSize: fontSize.body,
    lineHeight: lineHeight.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  vacioAcciones: {
    width: '100%',
    gap: spacing.sm,
  },
});
