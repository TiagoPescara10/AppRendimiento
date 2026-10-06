// src/features/foto/guardar.ts
//
// El orden para guardar una comida con su foto. Un archivo no puede ir dentro
// de la transaccion de SQLite, asi que:
//
//   1. copiar la foto;
//   2. crear la comida y sus items en una transaccion, con foto_url;
//   3. si la transaccion falla, borrar la foto copiada y relanzar.
//
// Si la copia falla, la comida se guarda igual sin foto: perder la foto no
// justifica perder lo que el usuario ya confirmo.
//
// Puro: el archivo y la base llegan por parametro. Lo prueba
// scripts/probar-foto.mjs con dobles que fallan a proposito.

export interface DepsGuardarFoto {
  /** Copia la foto y devuelve la ruta guardada. */
  copiar: (comidaId: string, uriOrigen: string) => Promise<string>;
  borrar: (uri: string) => void;
  /** Crea la comida con sus items, con la foto o sin ella. */
  crear: (fotoUrl: string | null) => Promise<void>;
}

/** Devuelve la ruta de la foto guardada, o null si se guardo sin foto. */
export async function guardarComidaConFoto(
  comidaId: string,
  uriFoto: string | null,
  deps: DepsGuardarFoto,
): Promise<string | null> {
  let fotoUrl: string | null = null;
  if (uriFoto) {
    try {
      fotoUrl = await deps.copiar(comidaId, uriFoto);
    } catch (e) {
      console.warn('No se pudo guardar la foto; la comida va sin foto:', e);
    }
  }

  try {
    await deps.crear(fotoUrl);
  } catch (e) {
    if (fotoUrl) deps.borrar(fotoUrl);
    throw e;
  }
  return fotoUrl;
}
