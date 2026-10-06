import { useCallback, useEffect, useRef, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { View, ActivityIndicator, AppState } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import * as Notifications from 'expo-notifications';
import { initDb } from '@/db/schema';
import { obtenerPerfilLocal } from '@/db/queries/perfil';
import { obtenerSesion } from '@/features/auth/session';
import { colors } from '@/ui/theme';
import { calcularDestino, type Destino } from '@/lib/destino';
import { iniciarAvisos, sincronizarAvisos } from '@/features/avisos/sincronizar';
import { configurarHandlerAvisos, crearCanalAvisos } from '@/features/avisos/configurar';
import { PREFIJO_AVISO } from '@/features/avisos/planificar';

SplashScreen.preventAutoHideAsync();
configurarHandlerAvisos();


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
    // La regla vive en src/lib/destino.ts, que tiene pruebas.
    return calcularDestino(perfil, sesion);
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

  // Avisos antes y despues de los eventos. Solo con la app en uso: en el
  // onboarding no hay eventos. Se reprograman con cada cambio de la base
  // (iniciarAvisos escucha db/cambios.ts) y al volver a primer plano, que es
  // cuando pudo haber pasado el tiempo o cambiado el permiso desde Ajustes.
  useEffect(() => {
    if (destino !== 'app') return;
    let vivo = true;
    let dejar: (() => void) | null = null;
    let sub: { remove: () => void } | null = null;

    (async () => {
      try {
        await crearCanalAvisos();
        const perfil = await obtenerPerfilLocal();
        if (!vivo || !perfil) return;
        dejar = iniciarAvisos(perfil.id);
        sub = AppState.addEventListener('change', (s) => {
          if (s === 'active') sincronizarAvisos(perfil.id);
        });
      } catch (e) {
        console.error('Error al iniciar avisos:', e);
      }
    })();

    return () => {
      vivo = false;
      dejar?.();
      sub?.remove();
    };
  }, [destino]);

  // Tocar un aviso abre el evento. El hook cubre tambien el arranque en frio
  // (la app estaba cerrada y la abrio el aviso). Se espera a estar en 'app'
  // para que el guard no lo pise con una redireccion.
  const respuesta = Notifications.useLastNotificationResponse();
  const respuestaAtendida = useRef<string | null>(null);
  useEffect(() => {
    if (destino !== 'app' || !respuesta) return;
    if (respuesta.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;

    const req = respuesta.notification.request;
    if (!req.identifier.startsWith(PREFIJO_AVISO)) return;
    const clave = `${req.identifier}@${respuesta.notification.date}`;
    if (respuestaAtendida.current === clave) return;
    respuestaAtendida.current = clave;

    const eventoId = req.content.data?.eventoId;
    if (typeof eventoId === 'string' && eventoId) {
      router.push({ pathname: '/evento/[id]', params: { id: eventoId } });
    }
    Notifications.clearLastNotificationResponseAsync().catch(() => {});
  }, [destino, respuesta, router]);

  if (!destino) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', backgroundColor: colors.bg }}>
        <ActivityIndicator color={colors.action} />
      </View>
    );
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}