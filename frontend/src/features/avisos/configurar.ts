// src/features/avisos/configurar.ts
//
// Lo que el sistema necesita saber de los avisos antes de mostrar uno: como
// se muestran con la app abierta y el canal de Android. Separado de
// sincronizar.ts porque esto solo tiene sentido en el dispositivo.

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { CANAL_AVISOS } from './sincronizar';

/** Con la app abierta igual se ve el banner, pero sin sonido: informa. */
export function configurarHandlerAvisos(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

/**
 * Canal "avisos" con importancia por defecto (no alta): suena y aparece en la
 * lista, pero no se despliega encima de lo que el usuario esta haciendo.
 */
export async function crearCanalAvisos(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CANAL_AVISOS, {
    name: 'Avisos de eventos',
    description: 'Qué comer antes y después de jugar o entrenar.',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}
