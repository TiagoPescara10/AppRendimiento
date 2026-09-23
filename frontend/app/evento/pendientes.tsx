// app/evento/pendientes.tsx
//
// Pantalla de prueba para previsualizar e interactuar con CartelPendientes
// usando datos mockeados (caso único y caso múltiple), sin requerir
// esperar eventos reales en SQLite.

import { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { CartelPendientes } from '@/features/agenda/components/CartelPendientes';
import { Boton } from '@/ui/Boton';
import { Card } from '@/ui/Card';
import { colors, spacing, fontSize, radius, shadow } from '@/ui/theme';
import type { EventoRow } from '@/db/schema';

const MOCK_EVENTO_UNICO: EventoRow[] = [
  {
    id: 'mock-evento-1',
    usuario_id: 'user-mock',
    tipo: 'entrenamiento',
    fecha_hora_inicio: '2026-09-17T18:00:00.000',
    fecha: '2026-09-17',
    duracion_estimada_min: 60,
    intensidad: 'media',
    completado: 0,
    respondido: 0,
    notas: null,
    rutina_id: null,
    rutina_gimnasio_id: null,
    modo_entrenamiento: null,
    deporte: null,
    created_at: '2026-09-17T18:00:00.000',
    updated_at: '2026-09-17T18:00:00.000',
  },
];

const MOCK_EVENTOS_MULTIPLES: EventoRow[] = [
  {
    id: 'mock-mult-1',
    usuario_id: 'user-mock',
    tipo: 'entrenamiento',
    fecha_hora_inicio: '2026-09-16T17:30:00.000',
    fecha: '2026-09-16',
    duracion_estimada_min: 75,
    intensidad: 'alta',
    completado: 0,
    respondido: 0,
    notas: null,
    rutina_id: null,
    rutina_gimnasio_id: null,
    modo_entrenamiento: null,
    deporte: null,
    created_at: '2026-09-16T17:30:00.000',
    updated_at: '2026-09-16T17:30:00.000',
  },
  {
    id: 'mock-mult-2',
    usuario_id: 'user-mock',
    tipo: 'gimnasio',
    fecha_hora_inicio: '2026-09-16T20:00:00.000',
    fecha: '2026-09-16',
    duracion_estimada_min: 50,
    intensidad: 'media',
    completado: 0,
    respondido: 0,
    notas: null,
    rutina_id: null,
    rutina_gimnasio_id: null,
    modo_entrenamiento: null,
    deporte: null,
    created_at: '2026-09-16T20:00:00.000',
    updated_at: '2026-09-16T20:00:00.000',
  },
];

export default function PaginaPruebaPendientes() {
  const [modo, setModo] = useState<'unico' | 'multiple'>('unico');
  const [eventos, setEventos] = useState<EventoRow[]>(MOCK_EVENTO_UNICO);
  const [visible, setVisible] = useState(true);
  const [historial, setHistorial] = useState<string[]>([]);

  const cambiarModo = (nuevoModo: 'unico' | 'multiple') => {
    setModo(nuevoModo);
    setEventos(nuevoModo === 'unico' ? [...MOCK_EVENTO_UNICO] : [...MOCK_EVENTOS_MULTIPLES]);
    setVisible(true);
  };

  const reiniciar = () => {
    setEventos(modo === 'unico' ? [...MOCK_EVENTO_UNICO] : [...MOCK_EVENTOS_MULTIPLES]);
    setVisible(true);
  };

  const handleResponderMock = (id: string, completado: boolean) => {
    const ev = eventos.find((e) => e.id === id);
    const mensaje = `Respuesta para "${ev?.tipo ?? id}": ${completado ? 'SÍ (completado)' : 'NO'}`;
    setHistorial((prev) => [mensaje, ...prev]);
  };

  const handleCerrarMock = () => {
    setVisible(false);
    setHistorial((prev) => ['El cartel fue cerrado (✕ o "Responder después").', ...prev]);
  };

  return (
    <SafeAreaView style={estilos.safe} edges={['top']}>
      <View style={estilos.header}>
        <Pressable
          style={({ pressed }) => [estilos.botonVolver, pressed && estilos.presionado]}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Volver"
        >
          <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
        </Pressable>
        <Text style={estilos.headerTitulo}>Prueba CartelPendientes</Text>
        <View style={estilos.headerEspacio} />
      </View>

      <ScrollView contentContainerStyle={estilos.contenido}>
        <Card style={estilos.card}>
          <Text style={estilos.seccionTitulo}>Configuración del Mock</Text>
          <Text style={estilos.descripcion}>
            Seleccioná el escenario para previsualizar cómo se comporta el cartel con la ilustración del León Coach.
          </Text>

          <View style={estilos.filaModos}>
            <Pressable
              style={[estilos.botonModo, modo === 'unico' && estilos.botonModoActivo]}
              onPress={() => cambiarModo('unico')}
            >
              <Text style={[estilos.textoModo, modo === 'unico' && estilos.textoModoActivo]}>
                1 Evento (Check-in)
              </Text>
            </Pressable>

            <Pressable
              style={[estilos.botonModo, modo === 'multiple' && estilos.botonModoActivo]}
              onPress={() => cambiarModo('multiple')}
            >
              <Text style={[estilos.textoModo, modo === 'multiple' && estilos.textoModoActivo]}>
                Múltiples Eventos (2)
              </Text>
            </Pressable>
          </View>

          <View style={{ height: spacing.md }} />

          <Boton
            titulo={visible ? 'Cartel Abierto' : 'Reabrir Cartel'}
            onPress={reiniciar}
            ancho
          />
        </Card>

        <Card style={[estilos.card, { marginTop: spacing.md }]}>
          <Text style={estilos.seccionTitulo}>Registro de Acciones</Text>
          {historial.length === 0 ? (
            <Text style={estilos.textoVacio}>Aún no interactuaste con el cartel.</Text>
          ) : (
            historial.map((log, index) => (
              <View key={index} style={estilos.filaLog}>
                <Ionicons name="checkmark-circle-outline" size={16} color={colors.action} />
                <Text style={estilos.textoLog}>{log}</Text>
              </View>
            ))
          )}
        </Card>
      </ScrollView>

      {/* Cartel con datos mockeados */}
      <CartelPendientes
        eventosMock={eventos}
        deporteMock="Fútbol"
        visible={visible}
        onResponderMock={handleResponderMock}
        onCerrarMock={handleCerrarMock}
      />
    </SafeAreaView>
  );
}

const estilos = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  botonVolver: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
  },
  presionado: {
    opacity: 0.6,
  },
  headerTitulo: {
    fontSize: fontSize.body,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  headerEspacio: {
    width: 40,
  },
  contenido: {
    padding: spacing.lg,
  },
  card: {
    padding: spacing.lg,
    borderRadius: radius.lg,
    ...shadow.card,
  },
  seccionTitulo: {
    fontSize: fontSize.subtitle,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  descripcion: {
    fontSize: fontSize.small,
    color: colors.textSecondary,
    marginBottom: spacing.md,
    lineHeight: 20,
  },
  filaModos: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  botonModo: {
    flex: 1,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  botonModoActivo: {
    backgroundColor: colors.action,
    borderColor: colors.action,
  },
  textoModo: {
    fontSize: fontSize.small,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  textoModoActivo: {
    color: colors.textOnAction,
  },
  filaLog: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
  },
  textoLog: {
    fontSize: fontSize.caption,
    color: colors.textPrimary,
    flex: 1,
  },
  textoVacio: {
    fontSize: fontSize.small,
    color: colors.textMuted,
    fontStyle: 'italic',
    marginTop: spacing.xs,
  },
});
