// src/features/avisos/permiso.ts
//
// El permiso de notificaciones NO se pide al abrir la app. Se pide una sola
// vez, la primera vez que el usuario crea un evento o una rutina, y con una
// explicacion antes: a esa altura se entiende para que sirve.
//
// Si dice que no, la app funciona igual. En Perfil > Avisos queda el acceso
// para activarlo (o para ir a Ajustes si el sistema ya no deja preguntar).

import * as Notifications from 'expo-notifications';
import { Alert, Linking } from 'react-native';

import { getDb } from '@/db/schema';
import { leerMeta, escribirMeta } from '@/db/meta';
import { sincronizarAvisos } from './sincronizar';

/** Marca de que ya se mostro la explicacion. Estado del motor: va en meta. */
const CLAVE_EXPLICADO = 'avisos_permiso_explicado';

export type EstadoPermiso = 'activado' | 'se_puede_pedir' | 'denegado';

export async function estadoPermisoAvisos(): Promise<EstadoPermiso> {
  const p = await Notifications.getPermissionsAsync();
  if (p.granted) return 'activado';
  return p.canAskAgain ? 'se_puede_pedir' : 'denegado';
}

function preguntar(): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      'Avisos',
      'Te avisamos qué comer antes y después de jugar o entrenar.',
      [
        { text: 'Ahora no', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Activar', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}

/**
 * Despues de crear un evento o una rutina. La primera vez explica y pide; las
 * siguientes no hace nada. Nunca tira: guardar el evento ya salio bien.
 */
export async function pedirPermisoAvisosSiCorresponde(usuarioId: string): Promise<void> {
  try {
    const estado = await estadoPermisoAvisos();
    if (estado !== 'se_puede_pedir') return;

    const db = getDb();
    if (await leerMeta(db, CLAVE_EXPLICADO)) return;
    await escribirMeta(db, CLAVE_EXPLICADO, new Date().toISOString());

    if (!(await preguntar())) return;
    const r = await Notifications.requestPermissionsAsync();
    // El evento recien creado ya sincronizo sin permiso; ahora va de nuevo.
    if (r.granted) sincronizarAvisos(usuarioId);
  } catch (e) {
    console.error('Error al pedir permiso de avisos:', e);
  }
}

/**
 * Desde Perfil > Avisos. Si el sistema todavia deja preguntar, pregunta; si
 * no, abre los Ajustes de la app. Devuelve el estado despues de intentarlo.
 */
export async function activarPermisoAvisos(usuarioId: string): Promise<EstadoPermiso> {
  const estado = await estadoPermisoAvisos();
  if (estado === 'activado') return estado;
  if (estado === 'se_puede_pedir') {
    const r = await Notifications.requestPermissionsAsync();
    if (r.granted) {
      sincronizarAvisos(usuarioId);
      return 'activado';
    }
    return r.canAskAgain ? 'se_puede_pedir' : 'denegado';
  }
  await Linking.openSettings();
  return estado;
}
