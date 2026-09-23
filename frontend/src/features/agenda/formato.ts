// src/features/agenda/formato.ts
//
// Como se le muestra un evento al usuario. Vive aca y no en cada pantalla
// porque el calendario, el detalle del dia y el detalle de un evento suelto
// tienen que decir lo mismo: si "gimnasio" se lee "Gimnasio" en un lado y
// "Gym" en otro, parecen dos cosas distintas.
//
// Solo formato. El criterio de agenda esta en materializar.ts y el SQL en
// db/queries/eventos.ts.

import type { TipoEvento, Intensidad, ModoEntrenamiento } from '../../db/schema';

/**
 * Capitaliza el nombre de un deporte y aplica tildes o mayúsculas
 * (ej: "futbol" -> "Fútbol", "basquet" -> "Básquet", "tenis" -> "Tenis").
 */
export function capitalizarDeporte(deporte?: string | null): string {
  if (!deporte) return '';
  const trimmed = deporte.trim();
  if (!trimmed) return '';

  const lower = trimmed.toLowerCase();
  if (lower === 'futbol' || lower === 'fútbol') return 'Fútbol';
  if (lower === 'futbol 11' || lower === 'fútbol 11') return 'Fútbol 11';
  if (lower === 'futbol 5' || lower === 'fútbol 5') return 'Fútbol 5';
  if (lower === 'futbol 7' || lower === 'fútbol 7') return 'Fútbol 7';
  if (lower === 'futbol 8' || lower === 'fútbol 8') return 'Fútbol 8';
  if (lower === 'basquet' || lower === 'básquet' || lower === 'baloncesto' || lower === 'basquetbol') return 'Básquet';
  if (lower === 'natacion' || lower === 'natación') return 'Natación';
  if (lower === 'padel' || lower === 'pádel') return 'Pádel';
  if (lower === 'voley' || lower === 'voleibol') return 'Vóley';

  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

export interface OpcionesEtiqueta {
  rutinaId?: string | null;
  modoEntrenamiento?: ModoEntrenamiento | null;
  deporte?: string | null;
}

/**
 * Etiqueta legible para el tipo de evento.
 *
 * - Evento con rutina_id: muestra el deporte del evento o deporte principal (ej: "Futbol").
 * - Evento sin rutina_id con sesion de cronometro: "Cronometro libre".
 * - Evento sin rutina_id con sesion de pasadas: "Pasadas".
 * - Evento sin rutina_id con sesion de rutina de gimnasio: "Gimnasio".
 * - Evento sin rutina_id puntual: deporte propio del evento si tiene, fallback a deporte_principal del perfil, o "Entrenamiento".
 * - Llamadas sin opciones: deporte propio/principal o "Entrenamiento".
 */
export function etiquetaTipo(
  tipo: TipoEvento | string,
  deportePrincipal?: string | null,
  opciones?: OpcionesEtiqueta,
): string {
  if (tipo === 'entrenamiento') {
    if (!opciones?.rutinaId) {
      if (opciones?.modoEntrenamiento === 'cronometro') {
        return 'Cronómetro libre';
      }
      if (opciones?.modoEntrenamiento === 'pasadas') {
        return 'Pasadas';
      }
      if (opciones?.modoEntrenamiento === 'rutina') {
        return 'Gimnasio';
      }
    }

    const deporteEfectivo = opciones?.deporte?.trim() || deportePrincipal;
    const deporteCap = capitalizarDeporte(deporteEfectivo);
    return deporteCap || 'Entrenamiento';
  }
  if (tipo === 'gimnasio') return 'Gimnasio';
  if (tipo === 'partido') return 'Partido';
  if (tipo === 'competencia') return 'Competencia';
  return tipo;
}

/** Alias para compatibilidad hacia atras. */
export const ETIQUETA_TIPO = etiquetaTipo;

export const ETIQUETA_INTENSIDAD: Record<Intensidad, string> = {
  baja: 'Intensidad baja',
  media: 'Intensidad media',
  alta: 'Intensidad alta',
};

/**
 * "8:30" a partir del ISO con offset local.
 *
 * Es un slice y no un Date a proposito: `fecha_hora_inicio` ya se guarda en
 * hora local, asi que los caracteres 11 a 16 SON la hora que hay que mostrar.
 * Pasarlo por Date solo abre la puerta a una conversion a UTC.
 */
export function horaDe(fechaHora: string): string {
  return fechaHora.slice(11, 16);
}

/**
 * "Miércoles 4" y "Septiembre" a partir de "YYYY-MM-DD".
 *
 * El T00:00:00 sin offset hace que el Date se interprete en hora local. Con
 * new Date("2026-09-04") a secas, JS lo lee como UTC y en Argentina muestra
 * el dia anterior.
 */
export function partesFecha(clave: string): { dia: string; mes: string } {
  const d = new Date(`${clave}T00:00:00`);
  const dia = d.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric' });
  const mes = d.toLocaleDateString('es-AR', { month: 'long' });
  return {
    dia: dia.charAt(0).toUpperCase() + dia.slice(1),
    mes: mes.charAt(0).toUpperCase() + mes.slice(1),
  };
}
