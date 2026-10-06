// src/features/foto/archivo.ts
//
// La foto de cada comida registrada con foto. Se guarda SOLO en el celular:
// la version achicada (1024 px) que se mando a analizar, en
// Paths.document/fotos-comida/{comidaId}.jpg. comida.foto_url guarda esa ruta.
//
// Documentos y no cache: la cache la puede vaciar el sistema. Igual, un
// archivo puede faltar (restaurar el celular, borrar datos): por eso todo lo
// que muestra una foto pasa por fotoDisponible() y la imagen tiene onError.

import { Directory, File, Paths } from 'expo-file-system';

const CARPETA = 'fotos-comida';

function carpeta(): Directory {
  const dir = new Directory(Paths.document, CARPETA);
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

/** Copia la foto achicada y devuelve la ruta guardada. */
export async function guardarFotoComida(comidaId: string, uriOrigen: string): Promise<string> {
  const destino = new File(carpeta(), `${comidaId}.jpg`);
  if (destino.exists) destino.delete();
  await new File(uriOrigen).copy(destino);
  return destino.uri;
}

/** Borra la foto de una comida. Solo toca esta carpeta; si no esta, sigue. */
export function borrarFotoComida(uri: string | null | undefined): void {
  if (!uri || !uri.includes(`/${CARPETA}/`)) return;
  try {
    const f = new File(uri);
    if (f.exists) f.delete();
  } catch (e) {
    // Un archivo que no se pudo borrar ocupa lugar, pero no rompe nada.
    console.warn('No se pudo borrar la foto de la comida:', e);
  }
}

/** La ruta si el archivo esta, null si no. Nunca tira. */
export function fotoDisponible(uri: string | null | undefined): string | null {
  if (!uri) return null;
  try {
    return new File(uri).exists ? uri : null;
  } catch {
    return null;
  }
}
