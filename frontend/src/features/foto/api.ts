// src/features/foto/api.ts
//
// La parte de la foto que toca el dispositivo y la red: achicar la imagen,
// el id de instalacion y la llamada a la Edge Function analizar-foto.
// Lo que se puede probar sin red esta en respuesta.ts y emparejar.ts.
//
// Fetch y no @supabase/supabase-js: es un solo POST. supabase-js trae auth,
// sesion, realtime y storage que no se usan, y en React Native pide polyfills.

import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { getDb } from '@/db/schema';
import { leerMeta, escribirMeta } from '@/db/meta';
import { randomUUID } from '@/db/sync/uuid';
import { SUPABASE_PUBLISHABLE_KEY, supabaseConfigurado, urlFuncion } from '@/config/supabase';
import { errorDeCodigo, validarRespuestaFoto } from './respuesta';
import type { ErrorFoto, RespuestaFoto } from './respuesta';

/** Lado mayor de la foto que se manda. Alcanza para reconocer un plato. */
const LADO_MAYOR_PX = 1024;
const CALIDAD_JPEG = 0.7;

/** Lo que espera la app. La funcion corta al modelo a los 25 s. */
export const TIMEOUT_FOTO_MS = 30_000;

/** El id de instalacion es estado del motor: va en meta. */
const CLAVE_INSTALL_ID = 'install_id';

export type ResultadoFoto =
  | { ok: true; respuesta: RespuestaFoto }
  | { ok: false; error: ErrorFoto };

/**
 * JPEG en base64, con el lado mayor en 1024 px como mucho. Una foto de la
 * camara (12 MP, varios MB) queda en ~150-300 KB.
 */
export async function prepararFoto(uri: string, ancho: number, alto: number): Promise<string> {
  const ctx = ImageManipulator.manipulate(uri);
  if (Math.max(ancho, alto) > LADO_MAYOR_PX) {
    ctx.resize(ancho >= alto ? { width: LADO_MAYOR_PX } : { height: LADO_MAYOR_PX });
  }
  const imagen = await ctx.renderAsync();
  const guardada = await imagen.saveAsync({
    format: SaveFormat.JPEG,
    compress: CALIDAD_JPEG,
    base64: true,
  });
  if (!guardada.base64) throw new Error('No se pudo leer la foto achicada.');
  return guardada.base64;
}

/** UUID que la app genera la primera vez y reusa siempre. */
export async function obtenerInstallId(): Promise<string> {
  const db = getDb();
  const guardado = await leerMeta(db, CLAVE_INSTALL_ID);
  if (guardado) return guardado;
  const nuevo = randomUUID();
  await escribirMeta(db, CLAVE_INSTALL_ID, nuevo);
  return nuevo;
}

/** Nunca tira: todo error vuelve como { ok: false } para que la pantalla lo muestre. */
export async function analizarFoto(base64: string): Promise<ResultadoFoto> {
  if (!supabaseConfigurado()) return { ok: false, error: 'no_configurado' };

  const installId = await obtenerInstallId();
  const control = new AbortController();
  const corte = setTimeout(() => control.abort(), TIMEOUT_FOTO_MS);

  let res: Response;
  try {
    res = await fetch(urlFuncion('analizar-foto'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
      },
      body: JSON.stringify({ imagen: base64, install_id: installId }),
      signal: control.signal,
    });
  } catch {
    // fetch solo tira por red o por el abort: un 4xx/5xx vuelve como res.
    return { ok: false, error: control.signal.aborted ? 'timeout' : 'sin_conexion' };
  } finally {
    clearTimeout(corte);
  }

  let cuerpo: unknown = null;
  try {
    cuerpo = await res.json();
  } catch {
    return { ok: false, error: 'fallo' };
  }

  if (!res.ok) {
    const codigo = (cuerpo as { error?: { codigo?: unknown } } | null)?.error?.codigo;
    return { ok: false, error: errorDeCodigo(codigo) };
  }

  const respuesta = validarRespuestaFoto(cuerpo);
  return respuesta ? { ok: true, respuesta } : { ok: false, error: 'fallo' };
}
