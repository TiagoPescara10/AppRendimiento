import { useCallback, useEffect, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { initDb } from '@/db/schema';
import { obtenerPerfilLocal } from '@/db/queries/perfil';
import { obtenerSesion } from '@/features/auth/session';
import { colors } from '@/ui/theme';

SplashScreen.preventAutoHideAsync();

type Destino = 'onboarding' | 'muro' | 'app';

// Rutas donde el usuario puede estar legitimamente en cada estado.
// El guard solo redirige si esta FUERA de estas.
const PERMITIDO: Record<Destino, string[]> = {
  onboarding: ['onboarding'],
  muro: ['onboarding', '(auth)'],
  app: ['(tabs)', 'playground', 'comida', 'evento'],
};

export default function RootLayout() {
  const router = useRouter();
  const segments = useSegments();
  const [destino, setDestino] = useState<Destino | null>(null);

  // Recalcula a donde corresponde ir. Se llama al arrancar y cada vez
  // que cambia la navegacion, porque completar el onboarding o crear
  // la sesion cambia la respuesta.
  const calcular = useCallback(async () => {
    const perfil = await obtenerPerfilLocal();
    const sesion = await obtenerSesion();

    // El onboarding esta completo cuando estan los campos que necesita
    // el calculo. Son nullables en el schema justamente porque se van
    // guardando de a un paso.
    const perfilCompleto =
      !!perfil?.altura_cm &&
      !!perfil?.fecha_nacimiento &&
      !!perfil?.sexo_biologico &&
      !!perfil?.nivel_actividad &&
      !!perfil?.objetivo;

    if (!perfilCompleto) return 'onboarding' as const;
    if (!sesion) return 'muro' as const;
    return 'app' as const;
  }, []);

  // Arranque: abrir la base antes de nada.
  useEffect(() => {
    let vivo = true;

    (async () => {
      try {
        await initDb();
        const d = await calcular();
        if (vivo) setDestino(d);
      } catch (e) {
        console.error('Error al iniciar:', e);
        if (vivo) setDestino('onboarding');
      } finally {
        SplashScreen.hideAsync();
      }
    })();

    return () => { vivo = false; };
  }, [calcular]);

  // Cada cambio de ruta revalida. Asi, cuando el registro guarda la
  // sesion y navega, el destino se actualiza en vez de quedar pegado.
  useEffect(() => {
    if (!destino) return;
    let vivo = true;

    (async () => {
      const nuevo = await calcular();
      if (!vivo) return;

      if (nuevo !== destino) {
        setDestino(nuevo);
        return; // el proximo render redirige con el destino correcto
      }

      const grupo = segments[0];
      if (PERMITIDO[nuevo].includes(grupo)) return;

      if (nuevo === 'onboarding') router.replace('/onboarding/datos');
      else if (nuevo === 'muro') router.replace('/onboarding/resumen');
      else router.replace('/(tabs)');
    })();

    return () => { vivo = false; };
  }, [destino, segments, calcular, router]);

  if (!destino) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', backgroundColor: colors.bg }}>
        <ActivityIndicator color={colors.action} />
      </View>
    );
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}