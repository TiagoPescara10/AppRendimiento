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
//
// '+not-found' esta en los tres: una ruta inexistente hay que MOSTRARLA como
// tal, sin importar en que estado este el usuario. Si el guard la corrige
// sola, la pantalla de 404 parpadea y el link roto nunca se reporta.
const PERMITIDO: Record<Destino, string[]> = {
  onboarding: ['onboarding', '+not-found'],
  muro: ['onboarding', '(auth)', '+not-found'],
  app: ['(tabs)', 'playground', 'comida', 'evento', 'perfil', 'rutina-gimnasio', 'agenda', 'entrenamiento', '+not-found'],
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
    // el calculo segun el modo de nutricion elegido.
    const perfilCompleto =
      perfil?.modo_nutricion === 'recuento'
        ? !!perfil?.nombre && !!perfil?.altura_cm
        : !!perfil?.altura_cm &&
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

      if (nuevo === 'onboarding') router.replace('/onboarding/modo');
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