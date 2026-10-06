// src/db/cambios.ts
//
// Aviso de "cambio algo" para quien tenga que reaccionar a escrituras de la
// base. Lo llaman las queries de eventos, peso y perfil al escribir; hoy lo
// escucha la sincronizacion de avisos (features/avisos/sincronizar.ts).
//
// Vive en db/ y no en features/ para que las queries no tengan que importar
// nada de expo: este modulo no importa nada. Con eso los probar-* siguen
// cargando la capa de datos en node, y una pantalla nueva que escribe un
// evento no se puede olvidar de reprogramar los avisos.
//
// Un oyente que falla NUNCA corta la escritura que lo disparo: el error se
// loguea y sigue. Guardar un peso no puede fallar por un aviso.

export type TemaCambio = 'eventos' | 'peso' | 'perfil';

type Oyente = (tema: TemaCambio) => void;

const oyentes = new Set<Oyente>();

/** Devuelve la funcion para dejar de escuchar. */
export function escucharCambios(oyente: Oyente): () => void {
  oyentes.add(oyente);
  return () => {
    oyentes.delete(oyente);
  };
}

export function avisarCambio(tema: TemaCambio): void {
  for (const oyente of oyentes) {
    try {
      oyente(tema);
    } catch (e) {
      console.error(`Error en un oyente de cambios (${tema}):`, e);
    }
  }
}
