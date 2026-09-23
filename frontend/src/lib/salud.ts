// src/lib/salud.ts
//
// Funciones puras de validacion y salvaguardas de salud comunicadas por el coach.
// Devuelven el texto y la decision (bloquear / avisar / ajustar) separadas de la UI.
//
// Reglas:
// 1. Piso de calorias: 1500 kcal hombres, 1200 kcal mujeres.
// 2. Limite de velocidad de bajada: maximo 750 g / semana (~825 kcal deficit/dia).
// 3. Rango de IMC saludable: minimo 18.5 para el peso objetivo.
// 4. Aviso de pesaje frecuente: aviso suave solo en el segundo pesaje del mismo dia.

import type { SexoBiologico, Objetivo } from '../db/schema';

// ---------------------------------------------------------------------------
// Constantes de salud
// ---------------------------------------------------------------------------

export const PISO_KCAL: Record<SexoBiologico, number> = {
  masculino: 1500,
  femenino: 1200,
};

export const BAJADA_SEMANAL_MAXIMA_KG = 0.75;

// 1 kg de grasa corporal son ~7700 kcal. 750 g / semana equivale a:
// (0.75 * 7700) / 7 = 825 kcal de deficit por dia.
export const DEFICIT_MAXIMO_DIARIO_KCAL = 825;

export const IMC_MINIMO_SALUDABLE = 18.5;

// ---------------------------------------------------------------------------
// 1. Piso de calorias
// ---------------------------------------------------------------------------

export interface ResultadoPisoCalorias {
  decision: 'ok' | 'ajustar';
  ajustado: boolean;
  kcalFinal: number;
  kcalPedidas: number;
  pisoMinimo: number;
  mensajeCoach: string | null;
}

/**
 * Evalua si el objetivo calorico calculado cae por debajo del piso de seguridad
 * biologica (1500 kcal hombre / 1200 kcal mujer).
 * Si cae por debajo, se ajusta al piso y se genera el mensaje del coach.
 */
export function evaluarPisoCalorias(
  kcalTeoricas: number,
  sexo: SexoBiologico,
): ResultadoPisoCalorias {
  const piso = PISO_KCAL[sexo];
  const pedidasRedondeadas = Math.round(kcalTeoricas);

  if (pedidasRedondeadas < piso) {
    return {
      decision: 'ajustar',
      ajustado: true,
      kcalFinal: piso,
      kcalPedidas: pedidasRedondeadas,
      pisoMinimo: piso,
      mensajeCoach: `Ajustamos tu objetivo a ${piso} kcal, el minimo saludable, aunque tu meta pedia menos.`,
    };
  }

  return {
    decision: 'ok',
    ajustado: false,
    kcalFinal: pedidasRedondeadas,
    kcalPedidas: pedidasRedondeadas,
    pisoMinimo: piso,
    mensajeCoach: null,
  };
}

// ---------------------------------------------------------------------------
// 2. Limite de velocidad de perdida de peso
// ---------------------------------------------------------------------------

export interface ParametrosVelocidadPerdida {
  pesoActualKg?: number | null;
  pesoObjetivoKg?: number | null;
  semanas?: number | null;
  deficitDiarioKcal?: number | null;
}

export interface ResultadoVelocidadPerdida {
  decision: 'ok' | 'avisar';
  excedeVelocidad: boolean;
  ritmoSemanalKg: number | null;
  ritmoMaximoSugeridoKg: number;
  deficitSugeridoKcal: number | null;
  semanasMinimasSugeridas: number | null;
  mensajeCoach: string | null;
}

/**
 * Evalua la velocidad de perdida de peso.
 * Si la meta o el deficit implica bajar mas de 750 g por semana, devuelve
 * un aviso (sin bloquear) sugiriendo un ritmo mas gradual y el ajuste de deficit.
 */
export function evaluarVelocidadPerdida({
  pesoActualKg,
  pesoObjetivoKg,
  semanas,
  deficitDiarioKcal,
}: ParametrosVelocidadPerdida): ResultadoVelocidadPerdida {
  const ritmoMaximoSugeridoKg = BAJADA_SEMANAL_MAXIMA_KG;

  // Caso A: Evaluacion por deficit calorico diario
  if (deficitDiarioKcal != null && Number.isFinite(deficitDiarioKcal)) {
    const ritmoSemanalKg = (deficitDiarioKcal * 7) / 7700;

    if (ritmoSemanalKg > ritmoMaximoSugeridoKg || deficitDiarioKcal > DEFICIT_MAXIMO_DIARIO_KCAL) {
      return {
        decision: 'avisar',
        excedeVelocidad: true,
        ritmoSemanalKg: Math.round(ritmoSemanalKg * 100) / 100,
        ritmoMaximoSugeridoKg,
        deficitSugeridoKcal: DEFICIT_MAXIMO_DIARIO_KCAL,
        semanasMinimasSugeridas: null,
        mensajeCoach:
          'Bajar mas de 750g por semana no es sostenible ni saludable a largo plazo. Te sugerimos un ritmo mas gradual.',
      };
    }
  }

  // Caso B: Evaluacion por plazo en semanas y kilos a bajar
  if (
    pesoActualKg != null &&
    pesoObjetivoKg != null &&
    semanas != null &&
    semanas > 0 &&
    pesoActualKg > pesoObjetivoKg
  ) {
    const kilosABajar = pesoActualKg - pesoObjetivoKg;
    const ritmoSemanalKg = kilosABajar / semanas;

    if (ritmoSemanalKg > ritmoMaximoSugeridoKg) {
      const semanasMinimasSugeridas = Math.ceil(kilosABajar / ritmoMaximoSugeridoKg);
      return {
        decision: 'avisar',
        excedeVelocidad: true,
        ritmoSemanalKg: Math.round(ritmoSemanalKg * 100) / 100,
        ritmoMaximoSugeridoKg,
        deficitSugeridoKcal: DEFICIT_MAXIMO_DIARIO_KCAL,
        semanasMinimasSugeridas,
        mensajeCoach:
          'Bajar mas de 750g por semana no es sostenible ni saludable a largo plazo. Te sugerimos un ritmo mas gradual.',
      };
    }
  }

  return {
    decision: 'ok',
    excedeVelocidad: false,
    ritmoSemanalKg: null,
    ritmoMaximoSugeridoKg,
    deficitSugeridoKcal: null,
    semanasMinimasSugeridas: null,
    mensajeCoach: null,
  };
}

// ---------------------------------------------------------------------------
// 3. Rango de IMC saludable
// ---------------------------------------------------------------------------

export interface ResultadoImcSaludable {
  decision: 'ok' | 'bloquear';
  imcCalculado: number | null;
  mensajeCoach: string | null;
}

/**
 * Evalua que el peso objetivo no lleve el IMC por debajo de 18.5.
 * Si es menor a 18.5, bloquea el objetivo sin reemplazo automatico para que
 * el usuario seleccione uno nuevo dentro del rango seguro.
 */
export function evaluarImcObjetivo(
  pesoObjetivoKg: number | null | undefined,
  alturaCm: number | null | undefined,
): ResultadoImcSaludable {
  if (
    pesoObjetivoKg == null ||
    alturaCm == null ||
    !Number.isFinite(pesoObjetivoKg) ||
    !Number.isFinite(alturaCm) ||
    alturaCm <= 0
  ) {
    return {
      decision: 'ok',
      imcCalculado: null,
      mensajeCoach: null,
    };
  }

  const alturaM = alturaCm / 100;
  const imc = pesoObjetivoKg / (alturaM * alturaM);

  if (imc < IMC_MINIMO_SALUDABLE) {
    return {
      decision: 'bloquear',
      imcCalculado: Math.round(imc * 10) / 10,
      mensajeCoach:
        'Ese peso queda por debajo del rango saludable para tu altura. Por favor, elegi un objetivo dentro de un rango seguro.',
    };
  }

  return {
    decision: 'ok',
    imcCalculado: Math.round(imc * 10) / 10,
    mensajeCoach: null,
  };
}

// ---------------------------------------------------------------------------
// 4. Aviso de pesaje frecuente
// ---------------------------------------------------------------------------

export interface ParametrosPesajeFrecuente {
  registrosHoy: number;
  yaAvisadoHoy: boolean;
}

export interface ResultadoPesajeFrecuente {
  decision: 'avisar' | 'ignorar';
  debeMostrarAviso: boolean;
  mensajeCoach: string | null;
}

/**
 * Si el usuario registra mas de un peso en el mismo dia, al confirmar el
 * segundo registro se muestra un mensaje suave y calido del coach.
 * No es bloqueo ni alarma.
 * Un solo aviso por dia: si se pesa una tercera vez, no se repite el mensaje.
 */
export function evaluarAvisoPesajeFrecuente({
  registrosHoy,
  yaAvisadoHoy,
}: ParametrosPesajeFrecuente): ResultadoPesajeFrecuente {
  // El aviso corresponde exactamente cuando se confirma el segundo registro
  // (es decir, ya habia 1 registro previo hoy) y aun no se le mostro el aviso hoy.
  if (registrosHoy === 1 && !yaAvisadoHoy) {
    return {
      decision: 'avisar',
      debeMostrarAviso: true,
      mensajeCoach:
        'Pesarte varias veces en el dia no te da mas informacion — el peso varia naturalmente por hidratacion y horario. Con una vez al dia alcanza.',
    };
  }

  return {
    decision: 'ignorar',
    debeMostrarAviso: false,
    mensajeCoach: null,
  };
}
