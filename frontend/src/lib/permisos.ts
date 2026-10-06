// src/lib/permisos.ts
//
// Que hacer con un permiso del sistema (camara, fotos) segun su estado. Puro:
// lo usa features/permisos/asegurarPermiso.ts, que es el que muestra los
// dialogos, y lo prueba scripts/probar-foto.mjs.
//
//   concedido                          -> listo
//   sin decidir ("undetermined")       -> pedir el permiso del sistema
//   rechazado pero se puede preguntar  -> pedirlo de nuevo
//   rechazado y el sistema ya no deja  -> mandar a Ajustes
//
// "Ya no deja" es canAskAgain = false: en iOS pasa despues del primer no; en
// Android, despues de rechazarlo dos veces.

export interface EstadoPermisoSistema {
  granted: boolean;
  status: 'granted' | 'denied' | 'undetermined';
  canAskAgain: boolean;
}

export type DecisionPermiso = 'listo' | 'pedir' | 'ajustes';

export function decidirPermiso(estado: EstadoPermisoSistema): DecisionPermiso {
  if (estado.granted) return 'listo';
  if (estado.status === 'undetermined' || estado.canAskAgain) return 'pedir';
  return 'ajustes';
}
