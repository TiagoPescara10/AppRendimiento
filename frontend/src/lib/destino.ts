// src/lib/destino.ts
//
// A donde corresponde mandar al usuario al abrir la app o al navegar. Lo usa
// el guard de app/_layout.tsx; vive aca, puro, para poder probarlo en node
// (scripts/probar-validacion.mjs).
//
//   onboarding  el perfil no tiene lo que necesita el calculo
//   muro        perfil completo pero sin sesion: resumen, beneficios y planes
//               (o "Empezar" en beta). Permite onboarding/ a proposito: ahi
//               estan esas pantallas.
//   app         perfil completo y con sesion
//
// "Con sesion" es que haya un objeto guardado, nada mas. No se mira el email:
// en beta la sesion se guarda con email '' y tiene que contar igual.

import type { PerfilRow } from '../db/schema';

export type Destino = 'onboarding' | 'muro' | 'app';

type PerfilParaDestino = Pick<
  PerfilRow,
  | 'modo_nutricion'
  | 'nombre'
  | 'altura_cm'
  | 'fecha_nacimiento'
  | 'sexo_biologico'
  | 'nivel_actividad'
  | 'objetivo'
>;

/**
 * El onboarding esta completo cuando estan los campos que necesita el
 * calculo segun el modo de nutricion elegido.
 */
export function perfilCompleto(perfil: PerfilParaDestino | null): boolean {
  if (!perfil) return false;
  if (perfil.modo_nutricion === 'recuento') {
    return !!perfil.nombre && !!perfil.altura_cm;
  }
  return (
    !!perfil.altura_cm &&
    !!perfil.fecha_nacimiento &&
    !!perfil.sexo_biologico &&
    !!perfil.nivel_actividad &&
    !!perfil.objetivo
  );
}

export function calcularDestino(
  perfil: PerfilParaDestino | null,
  sesion: { email: string } | null,
): Destino {
  if (!perfilCompleto(perfil)) return 'onboarding';
  if (sesion == null) return 'muro';
  return 'app';
}
