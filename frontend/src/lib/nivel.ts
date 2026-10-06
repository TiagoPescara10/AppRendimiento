// src/lib/nivel.ts
//
// Niveles y XP. La XP NO SE GUARDA: se calcula cada vez a partir de los
// eventos que ya existen. Asi no se puede desincronizar, el historial previo
// cuenta desde el primer dia, y si el usuario borra un entrenamiento su XP
// desaparece sola.
//
// La XP sale de COMPLETAR, nunca de rendimiento. Correr 2 km o 10, levantar
// 40 kg u 80: misma XP. Premiar volumen o carga empuja a forzar de mas.
//
// Una sola fuente: el evento. Toda sesion de entrenamiento cuelga de un evento
// completado (sesion_entrenamiento.evento_id es NOT NULL y cae en cascada), asi
// que contar eventos completados ya cubre el temporizador y la rutina de gym.
// Leer sesiones aparte seria una segunda fuente que se puede contradecir.
//
// Imports relativos y no con '@/': este archivo entra al build de
// scripts/probar-nivel.mjs, que no reescribe los alias.

import { desdeFechaLocal, aFechaLocal } from './fechas';
import { resumenAsistencia, separarPorOrigen } from './progreso';
import type { EventoResumen, ResumenAsistencia } from './progreso';

/** XP por cada evento completado, de cualquier tipo. */
export const XP_POR_SESION = 15;

/** XP por cada mes cerrado con buena asistencia a la rutina. */
export const XP_BONO_MENSUAL = 50;

/** Proporcion de asistencia minima para que un mes cobre el bono. */
export const UMBRAL_BONO = 0.75;

/**
 * Minimo de eventos de rutina RESPONDIDOS en el mes. Sin esto, alguien con 1
 * de 1 tiene 100% y cobra el bono sin esfuerzo real. Va sobre los respondidos
 * porque son el denominador del porcentaje, igual que en Progreso.
 */
export const MINIMO_RESPONDIDOS_BONO = 4;

/**
 * Hasta que dia del mes se muestra el aviso del mes anterior. Un "agosto
 * cerrado" leido el 29 de septiembre ya no es noticia. Pasada la ventana no
 * hay aviso, pero la XP del bono cuenta igual: esto solo decide el cartel.
 */
export const DIAS_VENTANA_BONO = 7;

/** Editable: agregar o mover niveles no rompe nada. Tienen que ir en orden. */
export const NIVELES = [
  { nivel: 1, nombre: 'Arrancando', xpDesde: 0 },
  { nivel: 2, nombre: 'En marcha', xpDesde: 500 },
  { nivel: 3, nombre: 'Constante', xpDesde: 1000 },
  { nivel: 4, nombre: 'Firme', xpDesde: 1500 },
  { nivel: 5, nombre: 'Referente', xpDesde: 2000 },
];

/** Lo que las cuentas de nivel necesitan de un evento. Una EventoRow encaja. */
export type EventoNivel = EventoResumen;

export interface ResumenMes extends ResumenAsistencia {
  /** 'YYYY-MM'. */
  mes: string;
  /** Si el mes cobra el bono: cerrado, con minimo de respondidos y >= 75%. */
  cobraBono: boolean;
}

export interface Nivel {
  nivel: number;
  nombre: string;
  /** La XP total, no la del tramo. */
  xpActual: number;
  /** XP donde arranca el proximo nivel. null en el ultimo. */
  xpSiguiente: number | null;
  /** 0 a 1 dentro del tramo actual. 1 en el ultimo nivel. */
  progreso: number;
}

/** 'YYYY-MM' del instante dado, en hora local. */
export function mesDe(ahora: Date): string {
  return aFechaLocal(ahora).slice(0, 7);
}

/** Cuantos eventos se completaron, de cualquier tipo y origen. */
export function sesionesCompletadas(eventos: EventoNivel[]): number {
  return eventos.filter((e) => e.completado === 1).length;
}

/**
 * La asistencia de rutina de cada mes YA CERRADO, del mas viejo al mas nuevo.
 *
 * Misma cuenta que la Constancia de Progreso: solo eventos de rutina, y el
 * denominador son los respondidos. El mes en curso queda afuera: todavia se
 * puede mover, y un bono que aparece y desaparece no es un bono.
 */
export function resumenMensual(eventos: EventoNivel[], ahora: Date): ResumenMes[] {
  const mesActual = mesDe(ahora);
  const { deRutina } = separarPorOrigen(eventos, ahora);

  const porMes = new Map<string, EventoNivel[]>();
  for (const e of deRutina) {
    const mes = e.fecha.slice(0, 7);
    if (mes >= mesActual) continue;
    const lista = porMes.get(mes);
    if (lista) lista.push(e);
    else porMes.set(mes, [e]);
  }

  return [...porMes.keys()].sort().map((mes) => {
    const resumen = resumenAsistencia(porMes.get(mes)!);
    return {
      mes,
      ...resumen,
      cobraBono:
        resumen.respondidos >= MINIMO_RESPONDIDOS_BONO && resumen.proporcion >= UMBRAL_BONO,
    };
  });
}

/** El resumen de un mes puntual, o null si ese mes no tuvo eventos de rutina. */
export function resumenDelMes(
  eventos: EventoNivel[],
  mes: string,
  ahora: Date,
): ResumenMes | null {
  return resumenMensual(eventos, ahora).find((r) => r.mes === mes) ?? null;
}

/** La XP total: sesiones completadas mas bonos mensuales. */
export function calcularXP(eventos: EventoNivel[], ahora: Date): number {
  const bonos = resumenMensual(eventos, ahora).filter((r) => r.cobraBono).length;
  return sesionesCompletadas(eventos) * XP_POR_SESION + bonos * XP_BONO_MENSUAL;
}

/**
 * El nivel que corresponde a una XP. El nivel solo depende de la XP, y la XP
 * solo sube con lo que se hace: no hay nada que se pierda por inactividad.
 *
 * Pasado el ultimo nivel la XP sigue sumando; solo no hay proximo.
 */
export function nivelDesdeXP(xp: number): Nivel {
  let i = 0;
  while (i + 1 < NIVELES.length && xp >= NIVELES[i + 1].xpDesde) i++;

  const actual = NIVELES[i];
  const siguiente = NIVELES[i + 1] ?? null;

  if (!siguiente) {
    return { nivel: actual.nivel, nombre: actual.nombre, xpActual: xp, xpSiguiente: null, progreso: 1 };
  }

  const tramo = siguiente.xpDesde - actual.xpDesde;
  const progreso = Math.min(1, Math.max(0, (xp - actual.xpDesde) / tramo));
  return {
    nivel: actual.nivel,
    nombre: actual.nombre,
    xpActual: xp,
    xpSiguiente: siguiente.xpDesde,
    progreso,
  };
}

/** Lunes de la semana de una fecha 'YYYY-MM-DD', como Date local. */
function lunesDe(fecha: string): Date {
  const d = desdeFechaLocal(fecha);
  // getDay: 0 domingo. Se lleva a 0 lunes.
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

/**
 * La racha mas larga de semanas seguidas (lunes a domingo) con al menos un
 * evento completado. Es la MEJOR historica y no la actual: la actual vuelve a
 * cero por inactividad, y este dato esta para no bajar nunca. La racha actual
 * ya se muestra en Constancia.
 */
export function mejorRachaSemanas(eventos: EventoNivel[]): number {
  const semanas = new Set<number>();
  for (const e of eventos) {
    if (e.completado !== 1) continue;
    semanas.add(lunesDe(e.fecha).getTime());
  }

  const ordenadas = [...semanas].sort((a, b) => a - b);
  let mejor = 0;
  let actual = 0;
  let anterior: number | null = null;

  for (const t of ordenadas) {
    // Se redondea en dias por si algun dia vuelve el horario de verano y una
    // semana dura una hora de mas o de menos.
    const seguida = anterior !== null && Math.round((t - anterior) / 86_400_000) === 7;
    actual = seguida ? actual + 1 : 1;
    mejor = Math.max(mejor, actual);
    anterior = t;
  }
  return mejor;
}

/** "1.000": separador de miles con punto, sin depender del Intl del motor. */
export function textoXP(xp: number): string {
  return String(Math.round(xp)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

const NOMBRES_MES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

/** Si todavia se esta a tiempo de avisar el bono del mes anterior. */
export function enVentanaDeBono(ahora: Date): boolean {
  return ahora.getDate() <= DIAS_VENTANA_BONO;
}

/** El mes anterior al dado, en 'YYYY-MM'. */
export function mesAnterior(ahora: Date): string {
  return mesDe(new Date(ahora.getFullYear(), ahora.getMonth() - 1, 1));
}

/**
 * "Septiembre cerrado. Fuiste a 7 de 9 entrenamientos planificados, 78% de
 * cumplimiento. +50 XP." Informa, no festeja.
 */
export function textoBonoMensual(r: ResumenMes): string {
  const nombre = NOMBRES_MES[Number(r.mes.slice(5, 7)) - 1];
  const pct = Math.round(r.proporcion * 100);
  return (
    `${nombre} cerrado. Fuiste a ${r.fue} de ${r.respondidos} entrenamientos ` +
    `planificados, ${pct}% de cumplimiento. +${XP_BONO_MENSUAL} XP.`
  );
}

export interface TextosComoSumas {
  titulo: string;
  reglas: string[];
  niveles: { nivel: number; nombre: string; desde: string }[];
  cierre: string;
}

/**
 * Lo que dice el sheet de "Como sumas puntos". Todos los numeros salen de las
 * constantes de arriba: si cambia una, el texto cambia solo y no queda una
 * explicacion que dice una cosa mientras la cuenta hace otra.
 *
 * Informa, no califica: sin signos de exclamacion ni festejo.
 */
export function textosComoSumas(): TextosComoSumas {
  const pct = Math.round(UMBRAL_BONO * 100);
  return {
    titulo: 'Cómo sumás puntos',
    reglas: [
      `+${XP_POR_SESION} por cada entrenamiento que completás, de cualquier tipo: ` +
        'gimnasio, cancha, pasadas o cronómetro.',
      `+${XP_BONO_MENSUAL} al cerrar un mes en el que fuiste al ${pct}% o más de tus ` +
        `rutinas agendadas. Cuenta desde ${MINIMO_RESPONDIDOS_BONO} rutinas respondidas en el mes.`,
    ],
    niveles: NIVELES.map((n) => ({
      nivel: n.nivel,
      nombre: n.nombre,
      desde: `desde ${textoXP(n.xpDesde)} XP`,
    })),
    cierre:
      'El nivel no baja nunca. Suma por ir, no por cuánto levantás ni qué tan rápido corrés.',
  };
}

/**
 * Lo que dice la card de nivel debajo de la barra:
 *   "faltan 280 XP para Constante"
 *   "falta 1 XP para Constante"
 *   "Nivel maximo · 2.340 XP"
 * Dice cuanto falta y para que, en vez de "720 / 1.000 XP", que obliga a
 * restar. Los nombres y umbrales salen de NIVELES.
 */
export function textoProgresoNivel(xp: number): string {
  const n = nivelDesdeXP(xp);
  if (n.xpSiguiente === null) return `Nivel máximo · ${textoXP(xp)} XP`;

  const siguiente = NIVELES.find((x) => x.nivel === n.nivel + 1);
  const falta = n.xpSiguiente - xp;
  return `${falta === 1 ? 'falta' : 'faltan'} ${textoXP(falta)} XP para ${siguiente?.nombre ?? ''}`;
}
