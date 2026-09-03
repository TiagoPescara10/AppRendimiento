import * as Crypto from 'expo-crypto';

/**
 * UUID v4 generado en el cliente. Todo registro nace con uno, y el servidor lo
 * respeta como clave de idempotencia para descartar duplicados del reintento.
 */
export function randomUUID(): string {
  return Crypto.randomUUID();
}
