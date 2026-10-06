// src/features/permisos/asegurarPermiso.ts
//
// Pide un permiso de camara o de fotos sin dejar al usuario trabado. La
// decision sale de src/lib/permisos.ts; aca van el pedido y el dialogo.
//
// Si el sistema ya no deja preguntar, se ofrece ir a Ajustes. Al volver de
// Ajustes no se reintenta solo: el usuario toca de nuevo el boton.
//
// En Expo Go, Ajustes abre la pagina de Expo Go (el permiso es de esa app);
// en el build propio abre la de la nuestra.
//
// Lo usan la foto de comida (app/comida/nueva.tsx) y la tarjeta para
// compartir (app/evento/compartir.tsx).

import * as ImagePicker from 'expo-image-picker';
import { Alert, Linking } from 'react-native';

import { decidirPermiso } from '@/lib/permisos';
import type { EstadoPermisoSistema } from '@/lib/permisos';

/**
 * concedido: se puede seguir.
 * rechazado: dijo que no, o "Ahora no" en el dialogo de Ajustes.
 * ajustes:   se fue a Ajustes; cuando vuelva, toca de nuevo.
 */
export type ResultadoPermiso = 'concedido' | 'rechazado' | 'ajustes';

interface PermisoSistema {
  consultar: () => Promise<EstadoPermisoSistema>;
  pedir: () => Promise<EstadoPermisoSistema>;
  titulo: string;
  mensajeAjustes: string;
}

function ofrecerAjustes(titulo: string, mensaje: string): Promise<ResultadoPermiso> {
  return new Promise((resolve) => {
    Alert.alert(
      titulo,
      mensaje,
      [
        { text: 'Ahora no', style: 'cancel', onPress: () => resolve('rechazado') },
        {
          text: 'Abrir Ajustes',
          onPress: () => {
            Linking.openSettings().catch((e) => console.error('No se pudo abrir Ajustes:', e));
            resolve('ajustes');
          },
        },
      ],
      { cancelable: true, onDismiss: () => resolve('rechazado') },
    );
  });
}

async function asegurar(p: PermisoSistema): Promise<ResultadoPermiso> {
  const decision = decidirPermiso(await p.consultar());
  if (decision === 'listo') return 'concedido';
  if (decision === 'ajustes') return ofrecerAjustes(p.titulo, p.mensajeAjustes);
  const r = await p.pedir();
  return r.granted ? 'concedido' : 'rechazado';
}

export function asegurarPermisoCamara(): Promise<ResultadoPermiso> {
  return asegurar({
    consultar: ImagePicker.getCameraPermissionsAsync,
    pedir: ImagePicker.requestCameraPermissionsAsync,
    titulo: 'Sin acceso a la cámara',
    mensajeAjustes: 'Para sacar la foto, permití el acceso a la cámara en Ajustes.',
  });
}

/**
 * Solo para cuando el selector de fotos falla por permiso (Android viejo).
 * El selector del sistema normalmente no lo necesita y no se pide antes.
 */
export function asegurarPermisoGaleria(): Promise<ResultadoPermiso> {
  return asegurar({
    consultar: () => ImagePicker.getMediaLibraryPermissionsAsync(),
    pedir: () => ImagePicker.requestMediaLibraryPermissionsAsync(),
    titulo: 'Sin acceso a tus fotos',
    mensajeAjustes: 'Para elegir una foto, permití el acceso a tus fotos en Ajustes.',
  });
}

/**
 * Abre el selector de fotos del sistema. Si falla por permiso, pide el de
 * fotos (con salida a Ajustes) y, si lo da, lo abre una vez mas.
 * null = cancelo o no hay permiso.
 */
export async function elegirFotoDeGaleria(
  opciones: ImagePicker.ImagePickerOptions,
): Promise<ImagePicker.ImagePickerAsset | null> {
  const abrir = async () => {
    const r = await ImagePicker.launchImageLibraryAsync(opciones);
    return !r.canceled && r.assets[0] ? r.assets[0] : null;
  };
  try {
    return await abrir();
  } catch (e) {
    console.warn('El selector de fotos fallo:', e);
    if ((await asegurarPermisoGaleria()) !== 'concedido') return null;
    return abrir();
  }
}

/** Saca una foto con la camara, asegurando el permiso antes. null = no hubo foto. */
export async function sacarFotoConCamara(
  opciones: ImagePicker.ImagePickerOptions,
): Promise<{ asset: ImagePicker.ImagePickerAsset | null; permiso: ResultadoPermiso }> {
  const permiso = await asegurarPermisoCamara();
  if (permiso !== 'concedido') return { asset: null, permiso };
  const r = await ImagePicker.launchCameraAsync(opciones);
  return { asset: !r.canceled && r.assets[0] ? r.assets[0] : null, permiso };
}
