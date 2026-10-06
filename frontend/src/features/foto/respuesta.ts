// src/features/foto/respuesta.ts
//
// Contrato con la Edge Function analizar-foto (supabase/functions/). La
// funcion ya valida lo que devuelve el modelo; esto lo vuelve a validar del
// lado de la app porque lo que llega por la red no es de confianza, y traduce
// los errores a algo que la pantalla sabe mostrar.
//
// Puro: sin expo ni red. Lo prueba scripts/probar-foto.mjs.

export type EstadoItemFoto = 'crudo' | 'cocido' | null;
export type ConfianzaFoto = 'alta' | 'media' | 'baja';

/** Un alimento que el modelo vio en la foto. Sin kcal ni macros. */
export interface ItemFoto {
  nombre: string;
  gramos: number;
  estado: EstadoItemFoto;
  confianza: ConfianzaFoto;
}

export interface RespuestaFoto {
  items: ItemFoto[];
  /** Fotos que le quedan a la instalacion esta semana. */
  restantes: number;
}

/** Los mismos topes que la funcion. */
export const MAX_ITEMS_FOTO = 15;
export const MAX_GRAMOS_FOTO = 3000;

export type ErrorFoto =
  | 'sin_conexion'
  | 'timeout'
  | 'limite_semanal'
  | 'limite_global'
  | 'imagen_grande'
  | 'no_configurado'
  | 'cancelado'
  | 'fallo';

/** null si no cumple el contrato. */
export function validarRespuestaFoto(crudo: unknown): RespuestaFoto | null {
  if (typeof crudo !== 'object' || crudo === null) return null;
  const { items, restantes } = crudo as { items?: unknown; restantes?: unknown };
  if (!Array.isArray(items) || items.length > MAX_ITEMS_FOTO) return null;
  if (typeof restantes !== 'number' || !Number.isFinite(restantes) || restantes < 0) return null;

  const salida: ItemFoto[] = [];
  for (const it of items) {
    if (typeof it !== 'object' || it === null) return null;
    const { nombre, gramos, estado, confianza } = it as Record<string, unknown>;
    if (typeof nombre !== 'string' || !nombre.trim()) return null;
    if (typeof gramos !== 'number' || !Number.isFinite(gramos)) return null;
    if (gramos < 1 || gramos > MAX_GRAMOS_FOTO) return null;
    if (estado !== null && estado !== 'crudo' && estado !== 'cocido') return null;
    if (confianza !== 'alta' && confianza !== 'media' && confianza !== 'baja') return null;
    // Explicito y no `estado` a secas: sin strictNullChecks (los scripts de
    // prueba compilan asi) TS no angosta el unknown por el !== null.
    const estadoValido: EstadoItemFoto = estado === 'crudo' || estado === 'cocido' ? estado : null;
    salida.push({ nombre: nombre.trim(), gramos: Math.round(gramos), estado: estadoValido, confianza });
  }
  return { items: salida, restantes: Math.floor(restantes) };
}

/** Codigo de error de la funcion -> error de la app. */
export function errorDeCodigo(codigo: unknown): ErrorFoto {
  switch (codigo) {
    case 'LIMITE_SEMANAL':
      return 'limite_semanal';
    case 'LIMITE_GLOBAL':
      return 'limite_global';
    case 'IMAGEN_GRANDE':
      return 'imagen_grande';
    default:
      return 'fallo';
  }
}

/** Lo que ve el usuario. Sin exclamaciones, voseo. */
export const MENSAJE_ERROR_FOTO: Record<ErrorFoto, string> = {
  sin_conexion: 'No hay conexión. Podés buscar los alimentos a mano.',
  timeout: 'El análisis tardó demasiado. Probá de nuevo o cargalo a mano.',
  limite_semanal: 'Llegaste al límite de fotos de esta semana.',
  limite_global: 'Las fotos están en pausa por hoy. Podés cargarlo a mano.',
  imagen_grande: 'La foto es demasiado pesada. Probá con otra.',
  no_configurado: 'Registrar con foto no está disponible en esta versión.',
  // No se muestra: cancelar vuelve atras. Esta por si algun dia se muestra.
  cancelado: 'Cancelaste el análisis.',
  fallo: 'No pudimos analizar la foto. Probá de nuevo o cargalo a mano.',
};
