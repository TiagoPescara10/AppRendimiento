// app/perfil/comidas.tsx
//
// Mis comidas, desde Perfil como Mis rutinas. Dos pestañas: Historial (lo
// registrado por semana o por mes) y Guardadas (las recetas). Repetir una
// comida o agregar una receta avisa con un toast.

import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';

import { Pantalla } from '@/ui/Pantalla';
import { Toast } from '@/ui/Toast';
import { colors, fontSize, fontWeight, lineHeight, sizes, spacing } from '@/ui/theme';
import { obtenerPerfilLocal } from '@/db/queries/perfil';
import { HistorialComidas } from '@/features/comidas/components/HistorialComidas';
import { RecetasGuardadas } from '@/features/comidas/components/RecetasGuardadas';
import { SheetGuardarReceta } from '@/features/comidas/components/SheetGuardarReceta';
import { guardarComidaComoReceta } from '@/db/queries/recetas';
import type { ComidaHistorial } from '@/db/queries/comidas';

type Pestana = 'historial' | 'guardadas';
const PESTANAS: { valor: Pestana; label: string }[] = [
  { valor: 'historial', label: 'Historial' },
  { valor: 'guardadas', label: 'Guardadas' },
];

export default function MisComidas() {
  const router = useRouter();
  const [usuarioId, setUsuarioId] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ texto: string; clave: number } | null>(null);
  const [pestana, setPestana] = useState<Pestana>('historial');
  // Comida del historial que se esta guardando como receta
  const [aReceta, setAReceta] = useState<ComidaHistorial | null>(null);
  // Sube al guardar una receta: el historial recarga y el menu ya no la ofrece
  const [version, setVersion] = useState(0);

  useFocusEffect(
    useCallback(() => {
      obtenerPerfilLocal()
        .then((p) => setUsuarioId(p?.id ?? null))
        .catch((e) => console.error('Error al cargar el perfil:', e));
    }, []),
  );

  const avisar = (texto: string) => setAviso({ texto, clave: Date.now() });

  const guardarComoReceta = async (nombre: string) => {
    const comida = aReceta;
    setAReceta(null);
    if (!comida || !usuarioId) return;
    try {
      await guardarComidaComoReceta({ comidaId: comida.id, usuarioId, nombre });
      avisar('Receta guardada');
      setVersion((v) => v + 1);
    } catch (e) {
      console.error('Error al guardar la receta:', e);
      avisar('No se pudo guardar');
    }
  };

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

        <View style={estilos.pestanas}>
          {PESTANAS.map((p) => {
            const activa = p.valor === pestana;
            return (
              <Pressable
                key={p.valor}
                style={[estilos.pestana, activa && estilos.pestanaActiva]}
                onPress={() => setPestana(p.valor)}
                accessibilityRole="tab"
                accessibilityState={{ selected: activa }}
              >
                <Text style={[estilos.pestanaTexto, activa && estilos.pestanaTextoActiva]}>
                  {p.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {usuarioId ? (
          pestana === 'historial' ? (
            <HistorialComidas
              usuarioId={usuarioId}
              onAviso={avisar}
              version={version}
              accionesExtra={(c) =>
                // Ya guardada: no se ofrece de nuevo
                c.receta_guardada_id
                  ? []
                  : [{ texto: 'Guardar como receta', icono: 'bookmark-outline', onPress: () => setAReceta(c) }]
              }
            />
          ) : (
            <RecetasGuardadas usuarioId={usuarioId} onAviso={avisar} />
          )
        ) : (
          <ActivityIndicator color={colors.action} />
        )}
      </Pantalla>

      <SheetGuardarReceta
        visible={aReceta !== null}
        onCerrar={() => setAReceta(null)}
        onGuardar={(nombre) => void guardarComoReceta(nombre)}
      />

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
  pestanas: {
    flexDirection: 'row',
    borderBottomWidth: sizes.hairline,
    borderBottomColor: colors.border,
  },
  pestana: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    marginBottom: -sizes.hairline,
  },
  pestanaActiva: { borderBottomColor: colors.action },
  pestanaTexto: {
    fontSize: fontSize.body,
    lineHeight: lineHeight.body,
    fontWeight: fontWeight.medium,
    color: colors.textSecondary,
  },
  pestanaTextoActiva: { color: colors.action, fontWeight: fontWeight.bold },
  tituloPantalla: {
    fontSize: fontSize.title,
    lineHeight: lineHeight.title,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
});
