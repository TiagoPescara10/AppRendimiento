// src/features/progreso/formato.ts
//
// Como se dicen los numeros de la pantalla de Progreso.
//
// Vive aparte de la pantalla por dos motivos. Uno: el tono de esta pantalla es
// una decision, no una casualidad —es donde mas facil se lee un fracaso— y una
// decision conviene tenerla en un solo archivo donde se pueda revisar entera.
// Dos: es texto que depende de un calculo, o sea que se puede equivocar en
// silencio, asi que se prueba (scripts/probar-progreso.mjs).
//
// LA REGLA DE TONO: los numeros hablan solos. Nada de retos, nada de
// felicitaciones. Ninguna frase de aca dice ni "¡Excelente!" ni "te falta
// esfuerzo": dicen cuanto, desde cuando y hasta donde.

import type { Objetivo } from '@/db/schema';
import type { Proyeccion } from '@/lib/nutricion';
import type { VolumenPropio, EntrenamientoPropio } from '@/lib/progreso';
// Los imports de VALOR van relativos y no con el alias '@/': tsc no reescribe
// los alias al emitir, y este archivo lo compila scripts/probar-progreso.mjs
// con resolucion de node. Los de tipo, arriba, se borran al emitir y no
// necesitan el mismo cuidado.
import { desdeFechaLocal } from '../../lib/fechas';
import { BAJADA_SEMANAL_MAXIMA_KG } from '../../lib/salud';
import {
  calcularRitmo,
  esCronometro,
  formatearDecimal,
  formatearSegundos,
} from '../entrenamiento/temporizador';

// A mano y no con toLocaleDateString: estas funciones se prueban en node, y no
// todo node trae el ICU completo. Mismo criterio que formatearDecimal().
const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

// ---------------------------------------------------------------------------
// Periodo
// ---------------------------------------------------------------------------

export type Periodo = 'semana' | 'mes' | 'todo';

/** Cuantos dias hacia atras mira cada periodo. 'todo' no tiene tope. */
export const DIAS_PERIODO: Record<Periodo, number | null> = {
  semana: 7,
  mes: 30,
  todo: null,
};

export const ETIQUETA_PERIODO: Record<Periodo, string> = {
  semana: 'Semana',
  mes: 'Mes',
  todo: 'Todo',
};

/**
 * "en los últimos 30 días". Es la coletilla que hace legible cualquier numero
 * de esta pantalla: sin ella, "fuiste a 9 de 11" no se sabe de cuando es.
 *
 * Dice "últimos 30 días" y no "este mes" porque la ventana es movil: el dia 3
 * de cada mes, un mes calendario tiene dos dias de datos.
 */
export function textoPeriodo(periodo: Periodo): string {
  const dias = DIAS_PERIODO[periodo];
  return dias === null ? 'desde que arrancaste' : `en los últimos ${dias} días`;
}

// ---------------------------------------------------------------------------
// Peso
// ---------------------------------------------------------------------------

/** "76,4". Un decimal: la balanza de casa no mide mas fino que eso. */
export function kg(valor: number): string {
  return formatearDecimal(valor, 1);
}

/**
 * Para donde es "bien" segun el objetivo del perfil.
 *
 * -1 bajar, +1 subir, 0 ninguna. Mantener y rendimiento dan 0 a proposito: no
 * hay una direccion buena, asi que pintar de verde cualquiera de las dos seria
 * afirmar algo que el usuario no pidio.
 */
export function direccionDeseada(objetivo: Objetivo | null): -1 | 0 | 1 {
  if (objetivo === 'bajar') return -1;
  if (objetivo === 'subir') return 1;
  return 0;
}

/** "↓ 1,2 kg", "↑ 0,4 kg" o "sin cambios". La flecha, para que el color no sea el unico dato. */
export function textoDelta(deltaKg: number): string {
  if (Math.abs(deltaKg) < 0.05) return 'sin cambios';
  const flecha = deltaKg < 0 ? '↓' : '↑';
  return `${flecha} ${formatearDecimal(Math.abs(deltaKg), 1)} kg`;
}

/** "a fines de noviembre", "a mediados de marzo de 2027". */
export function fechaDifusa(fecha: string, hoy: string): string {
  const d = desdeFechaLocal(fecha);
  const dia = d.getDate();

  // Tres franjas y no el dia exacto: la proyeccion no tiene esa precision, y
  // decir "el 24 de noviembre" seria inventarsela.
  const franja = dia <= 10 ? 'a principios de' : dia <= 20 ? 'a mediados de' : 'a fines de';
  const mismoAnio = d.getFullYear() === desdeFechaLocal(hoy).getFullYear();

  return `${franja} ${MESES[d.getMonth()]}${mismoAnio ? '' : ` de ${d.getFullYear()}`}`;
}

/** "Bajás 0,33 kg por semana" / "Subís 0,3 kg por semana". */
function textoRitmo(kgPorSemana: number): string {
  const verbo = kgPorSemana < 0 ? 'Bajás' : 'Subís';
  return `${verbo} ${formatearDecimal(Math.abs(kgPorSemana), 2)} kg por semana`;
}

/** "te faltan 3,2 kg" mirando el signo: hacia abajo o hacia arriba. */
function textoFalta(faltaKg: number): string {
  const lado = faltaKg < 0 ? 'abajo' : 'arriba';
  return `tu objetivo está ${formatearDecimal(Math.abs(faltaKg), 1)} kg ${lado}`;
}

export interface TextoProyeccion {
  /** La linea grande. Siempre hay una. */
  titulo: string;
  /**
   * La linea de apoyo. SIEMPRE tiene contenido, incluso cuando no hay fecha
   * que dar: si la card se vaciara justo en el caso malo, la ausencia de la
   * frase seria en si misma el reproche que esta pantalla no quiere hacer.
   */
  detalle: string;
}

/**
 * Que dice la card de proyeccion en cada uno de los casos de ClaseProyeccion.
 *
 * Los cuatro casos sin fecha —plana, al reves, lejos y poco rango— dicen el
 * hecho seco y nada mas: ni "dale que se puede" ni "estas estancado". El
 * usuario ya sabe leer un numero que sube.
 */
export function textoProyeccion(
  p: Proyeccion,
  pesoObjetivoKg: number | null,
  hoy: string,
): TextoProyeccion {
  const ritmo = p.kgPorSemana === null ? '' : textoRitmo(p.kgPorSemana);
  const falta = p.faltaKg === null ? '' : textoFalta(p.faltaKg);

  // El recorrido de la tendencia, de punta a punta. Es el relleno honesto de
  // los casos sin fecha: dice lo mismo que el grafico, con numeros.
  const recorrido =
    p.pesoInicial === null || p.pesoActual === null
      ? ''
      : `De ${kg(p.pesoInicial)} a ${kg(p.pesoActual)} kg en ${p.diasDeRango} días`;

  switch (p.clase) {
    case 'fecha':
      return {
        titulo: `A este ritmo llegás a ${kg(pesoObjetivoKg ?? 0)} kg ${fechaDifusa(
          p.fechaEstimada!,
          hoy,
        )}.`,
        detalle: `${ritmo} · ${falta}.`,
      };

    case 'lejos':
      return {
        titulo: 'A este ritmo la fecha cae a más de dos años.',
        detalle: `${ritmo} · ${falta}.`,
      };

    case 'al_reves':
      return {
        // El ritmo ES el titular aca: la tendencia va para el otro lado y eso
        // es el dato. Se dice y se sigue.
        titulo: `${ritmo}.`,
        detalle: `${recorrido} · ${falta}.`,
      };

    case 'plana':
      return {
        titulo: 'La tendencia está plana.',
        detalle: `${recorrido} · ${falta}.`,
      };

    case 'ya_llegaste':
      return {
        titulo: 'Estás en tu peso objetivo.',
        detalle: `La tendencia está en ${kg(p.pesoActual ?? 0)} kg y el objetivo es ${kg(
          pesoObjetivoKg ?? 0,
        )} kg.`,
      };

    case 'sin_objetivo':
      return {
        titulo: `${ritmo}.`,
        detalle: recorrido ? `${recorrido}.` : 'Evolución de tu peso en el período.',
      };

    case 'poco_rango':
    default:
      return {
        titulo: 'Todavía es poco tiempo para proyectar.',
        detalle: `Con unas dos semanas de registros ya se puede; llevás ${p.diasDeRango} ${
          p.diasDeRango === 1 ? 'día' : 'días'
        }.`,
      };
  }
}

/**
 * HUECO PREVISTO — el aviso de ritmo. Hoy devuelve null SIEMPRE.
 *
 * Falta la regla: si la tendencia baja mas de BAJADA_SEMANAL_MAXIMA_KG (750 g
 * por semana), eso es demasiado rapido y la app tiene que decirlo en vez de
 * celebrarlo —a ese ritmo lo que se pierde deja de ser solo grasa—. Cuando se
 * implemente, el texto se devuelve desde aca y aparece solo, sin tocar la
 * pantalla: el lugar donde se dibuja ya esta puesto en la card de proyeccion
 * de app/(tabs)/progreso.tsx.
 *
 * Todo lo que necesita ya esta en `p`: kgPorSemana trae el ritmo con signo.
 */
export function avisoRitmo(p: Proyeccion): string | null {
  if (p.kgPorSemana !== null && p.kgPorSemana < -0.75) {
    return 'Bajar más de 750g por semana no es sostenible ni saludable a largo plazo. Te sugerimos un ritmo más gradual.';
  }
  return null;
}

// ---------------------------------------------------------------------------
// Entrenamientos propios
// ---------------------------------------------------------------------------

function plural(n: number, singular: string, plural_: string): string {
  return `${n} ${n === 1 ? singular : plural_}`;
}

/** "45 min" abajo de la hora, "2,5 h" arriba. */
export function textoDuracion(segundos: number): string {
  const minutos = Math.round(segundos / 60);
  if (minutos < 60) return `${minutos} min`;
  return `${formatearDecimal(segundos / 3600, 1)} h`;
}

/** "3 sesiones · 2,5 h · 8,4 km". Sin porcentaje: es volumen, no cumplimiento. */
export function textoVolumen(v: VolumenPropio): string {
  const partes = [plural(v.sesiones, 'sesión', 'sesiones'), textoDuracion(v.segundos)];
  // Los km solo aparecen si alguien cargo distancia. Un "0 km" fijo haria
  // parecer que las sesiones de pasadas fallaron en algo.
  if (v.sesionesConKm > 0) partes.push(`${formatearDecimal(v.km, 1)} km`);
  return partes.join(' · ');
}

/**
 * El detalle de una sesion, en una linea.
 *
 * Tres formas segun lo que haya:
 *   con distancia   -> "6,2 km en 45 min · 7:15 min/km"
 *   con estructura  -> "6 bloques · 48 pasadas · 20/20"
 *   cronometro pelado o sin sesion -> la duracion sola.
 *
 * El "20/20" son los segundos de trabajo y de descanso. Se escribe asi y no
 * "20 s de trabajo · 20 s de descanso" porque aca es una linea de lista, no
 * una ficha: el que programo la sesion reconoce el par de un vistazo.
 */
export function textoSesion(item: EntrenamientoPropio): string {
  const { evento, sesion } = item;

  if (!sesion) {
    const min = evento.duracion_estimada_min;
    return min ? `${min} min` : 'Sin detalle';
  }

  // Rutina de gimnasio
  if (sesion.modo === 'rutina') {
    const ejercicios = sesion.ejercicios_count ?? 0;
    const series = sesion.series_count ?? 0;
    const conPeso = sesion.series_con_peso_count ?? 0;
    const vol = sesion.volumen_kg ?? 0;

    const textoEjercicios = plural(ejercicios, 'ejercicio', 'ejercicios');
    if (series === 0) return `${textoEjercicios} · sin series`;

    if (conPeso === series && vol > 0) {
      return `${textoEjercicios} · ${series} series · ${formatearDecimal(vol, 0)} kg`;
    }
    if (conPeso === 0) {
      return `${textoEjercicios} · ${series} series · peso corporal`;
    }
    return `${textoEjercicios} · ${series} series (${conPeso} con carga) · ${formatearDecimal(vol, 0)} kg`;
  }

  // Cronometro
  const esCrono =
    sesion.modo === 'cronometro' ||
    (sesion.trabajo_seg === 0 && (sesion.bloques === 1 || sesion.bloques === null));

  if (esCrono) {
    if (sesion.distancia_km !== null) {
      return `${formatearDecimal(sesion.distancia_km, 1)} km en ${textoDuracion(sesion.duracion_real_seg ?? 0)}`;
    }
    return textoDuracion(sesion.duracion_real_seg ?? 0);
  }

  // Pasadas
  const ritmo = calcularRitmo(sesion.distancia_km, sesion.duracion_real_seg ?? 0);
  if (sesion.distancia_km !== null && ritmo) {
    return [
      `${formatearDecimal(sesion.distancia_km, 1)} km en ${textoDuracion(sesion.duracion_real_seg ?? 0)}`,
      `${ritmo.ritmoTexto} min/km`,
    ].join(' · ');
  }

  const bloquesComp = sesion.bloques_completados ?? 0;
  const pasadasComp = sesion.pasadas_completadas ?? 0;
  return `${plural(bloquesComp, 'bloque', 'bloques')} · ${plural(pasadasComp, 'pasada', 'pasadas')}`;
}

/** "Vie 5 sep". La fecha corta que va a la derecha de cada sesion. */
export function fechaCorta(fecha: string): string {
  const d = desdeFechaLocal(fecha);
  const dias = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  return `${dias[d.getDay()]} ${d.getDate()} ${MESES[d.getMonth()].slice(0, 3)}`;
}
