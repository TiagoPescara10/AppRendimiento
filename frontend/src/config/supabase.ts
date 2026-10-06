// src/config/supabase.ts
//
// Donde esta el backend. Sale de frontend/.env (ignorado por git):
//
//   EXPO_PUBLIC_SUPABASE_URL=https://<proyecto>.supabase.co
//   EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
//
// La clave publicable NO es secreta: va dentro de la app y cualquiera puede
// sacarla. Lo que protege al backend es que las tablas tienen RLS sin
// politicas para anon y que analizar-foto tiene sus propios limites. La clave
// de Anthropic nunca pasa por aca: vive en los secrets de la Edge Function.
//
// Acceso directo a process.env.EXPO_PUBLIC_...: Expo solo reemplaza las
// variables escritas asi, sin desestructurar.

export const SUPABASE_URL = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').replace(/\/+$/, '');
export const SUPABASE_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';

/** Si el build trae backend. Sin .env, la foto avisa que no esta disponible. */
export function supabaseConfigurado(): boolean {
  return SUPABASE_URL.startsWith('https://') && SUPABASE_PUBLISHABLE_KEY.length > 0;
}

export function urlFuncion(nombre: string): string {
  return `${SUPABASE_URL}/functions/v1/${nombre}`;
}
