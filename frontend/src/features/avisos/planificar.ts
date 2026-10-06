// src/features/avisos/planificar.ts
//
// Que avisos locales corresponden a los eventos de los proximos dias: cuando
// salen y que dicen. Puro a proposito: no importa expo ni la base, recibe todo
// por parametro y devuelve una lista. Programarlos es de sincronizar.ts.
//
// El id de cada aviso es deterministico (`aviso-{eventoId}-{momento}`): volver
// a planificar con los mismos datos da los mismos ids, asi que reprogramar es
// idempotente y cancelar "los nuestros" es filtrar por el prefijo.
//
// Un aviso se escribe cuando se programa, no cuando suena. Por eso no dice
// nada de lo que el usuario comio ese dia: eso lo resuelve la card del coach
// del dashboard, que se calcula al abrir la app.

import type { EventoRow, ModoNutricion } from '../../db/schema';
import { etiquetaTipo } from '../agenda/formato';

export const PREFIJO_AVISO = 'aviso-';

/** Solo se planifica esta ventana: iOS no deja mas de 64 pendientes. */
export const VENTANA_DIAS = 7;

/** Margen bajo el tope de 64 de iOS. */
export const MAX_AVISOS = 60;

/** Cuando el evento no tiene duracion cargada, el post sale a los 90 min. */
const DURACION_POR_DEFECTO_MIN = 90;

/** Horario de silencio: de 23:00 a 7:00. */
const SILENCIO_DESDE = 23;
const SILENCIO_HASTA = 7;

/** Hora del aviso de la noche anterior. */
const HORA_NOCHE_ANTERIOR = 21;

/** Los eventos que empiezan antes de esta hora tienen aviso la noche anterior. */
const HORA_LIMITE_NOCHE_ANTERIOR = 11;

/** Un aviso movido a las 7:00 solo vale si todavia falta mas que esto. */
const MARGEN_MINIMO_MIN = 30;

const MIN = 60_000;
const HORA = 60 * MIN;

export type MomentoAviso = 'pre3h' | 'pre2h' | 'pre1h' | 'post' | 'noche';

export interface Aviso {
  id: string;
  fecha: Date;
  titulo: string;
  cuerpo: string;
  eventoId: string;
  momento: MomentoAviso;
}

export interface PreferenciasAvisos {
  /** Interruptor general. */
  activos: boolean;
  antes: boolean;
  despues: boolean;
  /** Si los eventos de gimnasio tambien tienen avisos. */
  gimnasio: boolean;
}

export const PREFERENCIAS_POR_DEFECTO: PreferenciasAvisos = {
  activos: true,
  antes: true,
  despues: true,
  gimnasio: true,
};

/** Lo unico del evento que hace falta para planificar. */
export type EventoParaAvisos = Pick<
  EventoRow,
  | 'id'
  | 'tipo'
  | 'fecha_hora_inicio'
  | 'duracion_estimada_min'
  | 'completado'
  | 'respondido'
  | 'rutina_id'
  | 'rutina_gimnasio_id'
  | 'modo_entrenamiento'
  | 'deporte'
>;

export interface EntradaPlan {
  eventos: EventoParaAvisos[];
  /** null si nunca registro peso: los textos van sin gramos. */
  pesoKg: number | null;
  modoNutricion: ModoNutricion;
  /** Para que etiquetaTipo diga "Futbol" y no "Entrenamiento". */
  deportePrincipal?: string | null;
  preferencias: PreferenciasAvisos;
  ahora: Date;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function redondear(valor: number, paso: number): number {
  return Math.max(paso, Math.round(valor / paso) * paso);
}

function enSilencio(d: Date): boolean {
  const h = d.getHours();
  return h >= SILENCIO_DESDE || h < SILENCIO_HASTA;
}

/** Las 7:00 que cierran el silencio en el que cae `d`. */
function finDelSilencio(d: Date): Date {
  const siete = new Date(d.getFullYear(), d.getMonth(), d.getDate(), SILENCIO_HASTA, 0, 0, 0);
  // De 23:00 a 23:59 el silencio termina a las 7:00 del dia siguiente.
  if (d.getHours() >= SILENCIO_DESDE) siete.setDate(siete.getDate() + 1);
  return siete;
}

/** "9:00", "18:30": sin el cero adelante, como se dice. */
function horaCorta(d: Date): string {
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function esGimnasio(e: EventoParaAvisos): boolean {
  return e.tipo === 'gimnasio' || e.rutina_gimnasio_id != null || e.modo_entrenamiento === 'rutina';
}

function esPartido(e: EventoParaAvisos): boolean {
  return e.tipo === 'partido' || e.tipo === 'competencia';
}

// ---------------------------------------------------------------------------
// Textos
// ---------------------------------------------------------------------------

interface Gramos {
  /** Carbohidratos antes de un partido. null = sin numero. */
  carbos: number | null;
  /** Proteina despues de cualquier evento. null = sin numero. */
  proteina: number | null;
}

function gramosPara(pesoKg: number | null, modo: ModoNutricion): Gramos {
  // En recuento no se muestran gramos; las horas si quedan.
  if (modo === 'recuento' || pesoKg == null || !(pesoKg > 0)) {
    return { carbos: null, proteina: null };
  }
  return { carbos: redondear(pesoKg * 1, 10), proteina: redondear(pesoKg * 0.3, 5) };
}

function textoPre3h(etiqueta: string, g: Gramos): Pick<Aviso, 'titulo' | 'cuerpo'> {
  const cantidad = g.carbos != null ? `: unos ${g.carbos} g, por ejemplo` : ', por ejemplo';
  return {
    titulo: `${etiqueta} en 3 horas`,
    cuerpo: `Comé algo con carbohidratos${cantidad} un plato de fideos o arroz. Liviano en grasas.`,
  };
}

function textoPre1h(): Pick<Aviso, 'titulo' | 'cuerpo'> {
  return {
    titulo: 'Falta una hora',
    cuerpo: 'Tomá agua y no comas nada pesado hasta después.',
  };
}

function textoPre2h(etiqueta: string): Pick<Aviso, 'titulo' | 'cuerpo'> {
  return {
    titulo: `${etiqueta} en 2 horas`,
    cuerpo: 'Comé algo liviano con carbohidratos, como una banana o unas tostadas.',
  };
}

function textoPost(g: Gramos): Pick<Aviso, 'titulo' | 'cuerpo'> {
  return {
    titulo: '¿Cómo salió?',
    cuerpo:
      g.proteina != null
        ? `En la próxima hora sumá proteína: unos ${g.proteina} g.`
        : 'En la próxima hora sumá proteína.',
  };
}

function textoNoche(etiqueta: string, inicio: Date): Pick<Aviso, 'titulo' | 'cuerpo'> {
  const hora = horaCorta(inicio);
  return {
    titulo: `${etiqueta} mañana`,
    cuerpo: `Mañana a las ${hora} tenés ${etiqueta.toLowerCase()}. Cená con carbohidratos.`,
  };
}

// ---------------------------------------------------------------------------
// Plan
// ---------------------------------------------------------------------------

/**
 * Ubica un aviso "antes" respetando el silencio. Devuelve la fecha y el
 * momento final (puede pasar a 'noche'), o null si se descarta.
 */
function ubicarPre(
  momento: 'pre3h' | 'pre2h' | 'pre1h',
  inicio: Date,
  ahora: Date,
): { fecha: Date; momento: MomentoAviso } | null {
  const fecha = new Date(inicio.getTime() - (momento === 'pre3h' ? 3 : momento === 'pre2h' ? 2 : 1) * HORA);
  if (!enSilencio(fecha)) return { fecha, momento };

  // La comida grande antes de un evento de manana temprano es la cena. Solo
  // para eventos de 7:00 a 11:00: uno de madrugada no tiene "noche anterior"
  // que se pueda decir con "manana a las...".
  const h = inicio.getHours();
  if (momento !== 'pre1h' && h >= SILENCIO_HASTA && h < HORA_LIMITE_NOCHE_ANTERIOR) {
    const noche = new Date(
      inicio.getFullYear(),
      inicio.getMonth(),
      inicio.getDate() - 1,
      HORA_NOCHE_ANTERIOR,
      0,
      0,
      0,
    );
    // Si las 21:00 ya pasaron, cae a la regla de las 7:00.
    if (noche.getTime() > ahora.getTime()) return { fecha: noche, momento: 'noche' };
  }

  const siete = finDelSilencio(fecha);
  if (inicio.getTime() - siete.getTime() > MARGEN_MINIMO_MIN * MIN) {
    return { fecha: siete, momento };
  }
  return null;
}

export function planificarAvisos(entrada: EntradaPlan): Aviso[] {
  const { eventos, pesoKg, modoNutricion, deportePrincipal, preferencias, ahora } = entrada;
  if (!preferencias.activos) return [];

  const g = gramosPara(pesoKg, modoNutricion);
  const limite = ahora.getTime() + VENTANA_DIAS * 24 * HORA;
  const avisos: Aviso[] = [];

  for (const e of eventos) {
    // "No fui": ya contesto que no, no hay nada que avisar.
    if (e.respondido === 1 && e.completado === 0) continue;
    if (esGimnasio(e) && !preferencias.gimnasio) continue;

    const inicio = new Date(e.fecha_hora_inicio);
    if (Number.isNaN(inicio.getTime())) continue;
    if (inicio.getTime() > limite) continue;

    const fin = new Date(inicio.getTime() + (e.duracion_estimada_min ?? DURACION_POR_DEFECTO_MIN) * MIN);
    if (fin.getTime() <= ahora.getTime()) continue;

    const etiqueta = etiquetaTipo(e.tipo, deportePrincipal, {
      rutinaId: e.rutina_id,
      modoEntrenamiento: e.modo_entrenamiento,
      deporte: e.deporte,
    });

    const agregar = (momento: MomentoAviso, fecha: Date, t: Pick<Aviso, 'titulo' | 'cuerpo'>) => {
      // Nunca en el pasado. Cubre tambien al evento ya empezado: sus "antes"
      // quedaron atras y solo sobrevive el post.
      if (fecha.getTime() <= ahora.getTime()) return;
      avisos.push({ id: `${PREFIJO_AVISO}${e.id}-${momento}`, fecha, eventoId: e.id, momento, ...t });
    };

    if (preferencias.antes) {
      const pres: ('pre3h' | 'pre2h' | 'pre1h')[] = esPartido(e) ? ['pre3h', 'pre1h'] : ['pre2h'];
      for (const pre of pres) {
        const ubicado = ubicarPre(pre, inicio, ahora);
        if (!ubicado) continue;
        const texto =
          ubicado.momento === 'noche'
            ? textoNoche(etiqueta, inicio)
            : pre === 'pre3h'
              ? textoPre3h(etiqueta, g)
              : pre === 'pre2h'
                ? textoPre2h(etiqueta)
                : textoPre1h();
        agregar(ubicado.momento, ubicado.fecha, texto);
      }
    }

    // El post que cae en silencio se descarta: a las 7 ya no sirve.
    if (preferencias.despues && !enSilencio(fin)) {
      agregar('post', fin, textoPost(g));
    }
  }

  avisos.sort((a, b) => a.fecha.getTime() - b.fecha.getTime());
  return avisos.slice(0, MAX_AVISOS);
}
