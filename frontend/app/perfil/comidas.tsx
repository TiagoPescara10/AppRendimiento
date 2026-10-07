// app/perfil/comidas.tsx
//
// Mis comidas, desde Perfil como Mis rutinas: el historial de lo registrado
// por semana o por mes. Repetir una comida la copia a hoy y avisa con un toast.

import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';

import { Pantalla } from '@/ui/Pantalla';
import { Toast } from '@/ui/Toast';
import { colors, fontSize, fontWeight, lineHeight, spacing } from '@/ui/theme';
import { obtenerPerfilLocal } from '@/db/queries/perfil';
import { HistorialComidas } from '@/features/comidas/components/HistorialComidas';

export default function MisComidas() {
  const router = useRouter();
  const [usuarioId, setUsuarioId] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ texto: string; clave: number } | null>(null);

  useFocusEffect(
    useCallback(() => {
      obtenerPerfilLocal()
        .then((p) => setUsuarioId(p?.id ?? null))
        .catch((e) => console.error('Error al cargar el perfil:', e));
    }, []),
  );

  const avisar = (texto: string) => setAviso({ texto, clave: Date.now() });

  return (
    <View style={estilos.flex}>
      <Pantalla>
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
          <Text style={estilos.tituloPantalla}>Mis comidas</Text>
        </View>

        {usuarioId ? (
          <HistorialComidas usuarioId={usuarioId} onAviso={avisar} />
        ) : (
          <ActivityIndicator color={colors.action} />
        )}
      </Pantalla>

      <Toast mensaje={aviso?.texto ?? null} clave={aviso?.clave} onOculto={() => setAviso(null)} />
    </View>
  );
}

const estilos = StyleSheet.create({
  flex: { flex: 1 },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  botonVolver: { paddingRight: spacing.xs },
  flechaVolver: { fontSize: 28, color: colors.textSecondary, marginTop: -2 },
  tituloPantalla: {
    fontSize: fontSize.title,
    lineHeight: lineHeight.title,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
});
