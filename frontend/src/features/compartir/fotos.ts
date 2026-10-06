// src/features/compartir/fotos.ts
//
// La foto de la tarjeta vive en los documentos de la app, no en la cache del
// selector: la cache la puede borrar el sistema, y la tarjeta se tiene que
// poder volver a generar desde el detalle de la sesion.
//
// Un archivo por sesion y por eleccion: el nombre lleva la hora para que la
// imagen nueva no quede escondida detras de la cache de la vieja.

import { Directory, File, Paths } from 'expo-file-system';

const CARPETA = 'fotos-sesion';

function carpeta(): Directory {
  const dir = new Directory(Paths.document, CARPETA);
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

/** Borra una foto guardada por esta app. Cualquier otra ruta se ignora. */
export function borrarFotoSesion(uri: string | null): void {
  if (!uri || !uri.includes(`/${CARPETA}/`)) return;
  try {
    const f = new File(uri);
    if (f.exists) f.delete();
  } catch (e) {
    // Una foto que no se pudo borrar ocupa lugar, pero no rompe nada.
    console.warn('No se pudo borrar la foto anterior:', e);
  }
}

/**
 * Copia la foto elegida a los documentos de la app y devuelve la ruta nueva.
 * Si la sesion ya tenia una foto, la borra despues de copiar la nueva.
 */
export async function guardarFotoSesion(
  sesionId: string,
  uriOrigen: string,
  uriAnterior: string | null,
): Promise<string> {
  const extension = uriOrigen.toLowerCase().endsWith('.png') ? 'png' : 'jpg';
  const destino = new File(carpeta(), `${sesionId}-${Date.now()}.${extension}`);
  await new File(uriOrigen).copy(destino);
  borrarFotoSesion(uriAnterior);
  return destino.uri;
}
