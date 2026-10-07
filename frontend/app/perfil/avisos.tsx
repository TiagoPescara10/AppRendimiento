// app/perfil/avisos.tsx
//
// Perfil > Avisos. Los cuatro interruptores de los avisos antes y despues de
// los eventos, y el acceso para activar el permiso si el usuario lo rechazo.
//
// Cada cambio se guarda en el perfil al toque. No hace falta llamar a la
// sincronizacion: actualizarPerfil avisa el cambio y los avisos se
// reprograman solos (ver src/db/cambios.ts).

import { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Switch, AppState, Alert } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { Pantalla } from '@/ui/Pantalla';
import { Boton } from '@/ui/Boton';
import { colors, spacing, radius, fontSize, fontWeight, lineHeight, shadow, sizes } from '@/ui/theme';
import { obtenerPerfilLocal, actualizarPerfil } from '@/db/queries/perfil';
import type { PerfilRow } from '@/db/schema';
import { activarPermisoAvisos, estadoPermisoAvisos, type EstadoPermiso } from '@/features/avisos/permiso';

type CampoAviso = 'avisos_activos' | 'avisos_antes' | 'avisos_despues' | 'avisos_gimnasio';

const OPCIONES: { campo: Exclude<CampoAviso, 'avisos_activos'>; titulo: string; bajada: string }[] = [
  {
    campo: 'avisos_antes',
    titulo: 'Antes de entrenar o jugar',
    bajada: 'Qué comer unas horas antes, o la noche anterior si jugás temprano.',
  },
  {
    campo: 'avisos_despues',
    titulo: 'Después de entrenar o jugar',
    bajada: 'Cuánta proteína sumar al terminar.',
  },
  {
    campo: 'avisos_gimnasio',
    titulo: 'Para el gimnasio también',
    bajada: 'Los mismos avisos para tus días de gimnasio.',
  },
];

export default function AvisosScreen() {
  const router = useRouter();
  const [perfil, setPerfil] = useState<PerfilRow | null>(null);
  const [permiso, setPermiso] = useState<EstadoPermiso | null>(null);

  const cargar = useCallback(async () => {
    try {
      const [p, estado] = await Promise.all([obtenerPerfilLocal(), estadoPermisoAvisos()]);
      setPerfil(p);
      setPermiso(estado);
    } catch (e) {
      console.error('Error al cargar los avisos:', e);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      cargar();
    }, [cargar]),
  );

  // Al volver de Ajustes la pantalla no pierde el foco: hay que releer el
  // permiso cuando la app vuelve a primer plano.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') cargar();
    });
    return () => sub.remove();
  }, [cargar]);

  const cambiar = async (campo: CampoAviso, valor: boolean) => {
    if (!perfil) return;
    const anterior = perfil;
    setPerfil({ ...perfil, [campo]: valor ? 1 : 0 });
    try {
      await actualizarPerfil(perfil.id, { [campo]: valor ? 1 : 0 });
    } catch (e) {
      console.error('Error al guardar preferencia de avisos:', e);
      setPerfil(anterior);
      Alert.alert('Error', 'No se pudo guardar. Intentá de nuevo.');
    }
  };

  const activar = async () => {
    if (!perfil) return;
    try {
      setPermiso(await activarPermisoAvisos(perfil.id));
    } catch (e) {
      console.error('Error al activar avisos:', e);
    }
  };

  const generalActivo = perfil?.avisos_activos !== 0;

  return (
    <Pantalla>
      <View style={estilos.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={estilos.volverBoton}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={estilos.headerTitulo}>Avisos</Text>
      </View>

      <View style={estilos.contenido}>
        <Text style={estilos.descripcion}>
          Te avisamos qué comer antes y después de jugar o entrenar. Salen de tu peso y de cuándo
          jugás.
        </Text>

        {permiso && permiso !== 'activado' && (
          <View style={estilos.cartel}>
            <Text style={estilos.cartelTitulo}>Las notificaciones están desactivadas</Text>
            <Text style={estilos.cartelTexto}>
              {permiso === 'denegado'
                ? 'Para recibir los avisos, activalas en Ajustes.'
                : 'Para recibir los avisos, dale permiso a la app.'}
            </Text>
            <Boton
              titulo={permiso === 'denegado' ? 'Abrir Ajustes' : 'Activar notificaciones'}
              onPress={activar}
            />
          </View>
        )}

        {perfil && (
          <View style={estilos.card}>
            <View style={estilos.fila}>
              <View style={estilos.flex}>
                <Text style={estilos.filaTitulo}>Avisos de entrenamientos</Text>
              </View>
              <Switch
                value={generalActivo}
                onValueChange={(v) => cambiar('avisos_activos', v)}
                trackColor={{ true: colors.action }}
                accessibilityLabel="Avisos de entrenamientos"
              />
            </View>

            {OPCIONES.map((o) => (
              <View key={o.campo}>
                <View style={estilos.separador} />
                <View style={[estilos.fila, !generalActivo && estilos.filaApagada]}>
                  <View style={estilos.flex}>
                    <Text style={estilos.filaTitulo}>{o.titulo}</Text>
                    <Text style={estilos.filaBajada}>{o.bajada}</Text>
                  </View>
                  <Switch
                    value={perfil[o.campo] !== 0}
                    onValueChange={(v) => cambiar(o.campo, v)}
                    disabled={!generalActivo}
                    trackColor={{ true: colors.action }}
                    accessibilityLabel={o.titulo}
                  />
                </View>
              </View>
            ))}
          </View>
        )}
      </View>
    </Pantalla>
  );
}

const estilos = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  volverBoton: {
    padding: spacing.xs,
  },
  headerTitulo: {
    fontSize: fontSize.title,
    lineHeight: lineHeight.title,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  contenido: {
    gap: spacing.lg,
    marginTop: spacing.sm,
  },
  descripcion: {
    fontSize: fontSize.body,
    lineHeight: lineHeight.body,
    color: colors.textSecondary,
  },
  cartel: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
    ...shadow.card,
  },
  cartelTitulo: {
    fontSize: fontSize.body,
    lineHeight: lineHeight.body,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  cartelTexto: {
    fontSize: fontSize.small,
    lineHeight: lineHeight.small,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    ...shadow.card,
  },
  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    minHeight: 56,
  },
  filaApagada: {
    opacity: 0.45,
  },
  filaTitulo: {
    fontSize: fontSize.body,
    lineHeight: lineHeight.body,
    fontWeight: fontWeight.medium,
    color: colors.textPrimary,
  },
  filaBajada: {
    fontSize: fontSize.small,
    lineHeight: lineHeight.small,
    color: colors.textSecondary,
  },
  separador: {
    height: sizes.hairline,
    backgroundColor: colors.border,
  },
  flex: {
    flex: 1,
  },
});
