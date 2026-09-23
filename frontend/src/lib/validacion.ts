// src/lib/validacion.ts
//
// Validaciones puras de datos del perfil y objetivos nutricionales.
// Son salvaguardas de salud compartidas entre onboarding y edicion de perfil.

import type { Objetivo, ModoNutricion, SexoBiologico } from '../db/schema';

export const ALTURA_MIN_CM = 100;
export const ALTURA_MAX_CM = 250;
export const IMC_MINIMO_SALUDABLE = 18.5;

export type ResultadoValidacion =
  | { ok: true }
  | { ok: false; titulo: string; mensaje: string };

/**
 * Valida que la altura este dentro del rango admisible (100 a 250 cm).
 */
export function validarAltura(alturaCm: number): ResultadoValidacion {
  if (!Number.isFinite(alturaCm) || alturaCm < ALTURA_MIN_CM || alturaCm > ALTURA_MAX_CM) {
    return {
      ok: false,
      titulo: 'Altura invalida',
      mensaje: `Ingresa una altura entre ${ALTURA_MIN_CM} y ${ALTURA_MAX_CM} cm.`,
    };
  }
  return { ok: true };
}

export interface ParametrosValidarDatosPerfil {
  nombre?: string | null;
  alturaCm?: number | null;
  fechaNacimiento?: Date | string | null;
  sexoBiologico?: SexoBiologico | null;
  modoNutricion?: ModoNutricion | null;
}

/**
 * Valida los datos personales segun el modo de nutricion elegido.
 * En modo recuento solo exige nombre y altura.
 * En modo objetivo exige ademas fecha de nacimiento (mayor de edad) y sexo biologico.
 */
export function validarDatosPerfil({
  nombre,
  alturaCm,
  fechaNacimiento,
  sexoBiologico,
  modoNutricion = 'objetivo',
}: ParametrosValidarDatosPerfil): ResultadoValidacion {
  if (!nombre || !nombre.trim()) {
    return {
      ok: false,
      titulo: 'Falta el nombre',
      mensaje: 'Por favor, ingresa tu nombre.',
    };
  }

  if (alturaCm == null || !Number.isFinite(alturaCm)) {
    return {
      ok: false,
      titulo: 'Falta la altura',
      mensaje: 'Por favor, ingresa tu altura.',
    };
  }

  const valAltura = validarAltura(alturaCm);
  if (!valAltura.ok) return valAltura;

  // En modo recuento no se requieren fecha de nacimiento ni sexo biologico
  if (modoNutricion === 'recuento') {
    return { ok: true };
  }

  if (!fechaNacimiento) {
    return {
      ok: false,
      titulo: 'Falta la fecha de nacimiento',
      mensaje: 'Por favor, selecciona tu fecha de nacimiento.',
    };
  }

  const fecha = typeof fechaNacimiento === 'string' ? new Date(fechaNacimiento) : fechaNacimiento;
  const hoy = new Date();
  const hace18 = new Date(hoy.getFullYear() - 18, hoy.getMonth(), hoy.getDate());
  if (fecha > hace18) {
    return {
      ok: false,
      titulo: 'Edad minima',
      mensaje: 'Tenes que ser mayor de 18 años para usar la app.',
    };
  }

  if (!sexoBiologico) {
    return {
      ok: false,
      titulo: 'Falta el sexo biologico',
      mensaje: 'Por favor, selecciona tu sexo biologico.',
    };
  }

  return { ok: true };
}

export interface ParametrosValidarObjetivo {
  objetivo: Objetivo;
  pesoObjetivoKg?: number | null;
  alturaCm?: number | null;
  pesoActualKg?: number | null;
}

/**
 * Valida las cuatro salvaguardas del objetivo:
 * 1. Que exista la altura del usuario.
 * 2. Que el IMC resultante del peso objetivo sea al menos 18.5.
 * 3. Que al elegir "bajar", el peso objetivo sea estrictamente menor al peso actual.
 * 4. Que al elegir "subir", el peso objetivo sea estrictamente mayor al peso actual.
 */
export function validarObjetivo({
  objetivo,
  pesoObjetivoKg,
  alturaCm,
  pesoActualKg,
}: ParametrosValidarObjetivo): ResultadoValidacion {
  // Mantener y rendimiento no requieren peso objetivo
  if (objetivo === 'mantener' || objetivo === 'rendimiento') {
    return { ok: true };
  }

  if (pesoObjetivoKg == null || !Number.isFinite(pesoObjetivoKg)) {
    return {
      ok: false,
      titulo: 'Falta el peso objetivo',
      mensaje: 'Ingresa el peso al que queres llegar.',
    };
  }

  // 1. Que exista altura
  if (!alturaCm || alturaCm <= 0) {
    return {
      ok: false,
      titulo: 'Falta la altura',
      mensaje: 'Completa tu altura para calcular el rango de peso saludable.',
    };
  }

  // 2. Que el IMC no baje de 18.5
  const alturaM = alturaCm / 100;
  const imc = pesoObjetivoKg / (alturaM * alturaM);
  if (imc < IMC_MINIMO_SALUDABLE) {
    return {
      ok: false,
      titulo: 'Objetivo no saludable',
      mensaje: 'Ese peso queda por debajo del rango saludable para tu altura.',
    };
  }

  // 3. Que bajar no tenga objetivo mayor o igual al peso actual
  if (pesoActualKg != null && objetivo === 'bajar' && pesoObjetivoKg >= pesoActualKg) {
    return {
      ok: false,
      titulo: 'Revisa el objetivo',
      mensaje: `Elegiste bajar de peso, pero el objetivo es mayor o igual a tu peso actual (${pesoActualKg} kg).`,
    };
  }

  // 4. Que subir no tenga objetivo menor o igual al peso actual
  if (pesoActualKg != null && objetivo === 'subir' && pesoObjetivoKg <= pesoActualKg) {
    return {
      ok: false,
      titulo: 'Revisa el objetivo',
      mensaje: `Elegiste subir de peso, pero el objetivo es menor o igual a tu peso actual (${pesoActualKg} kg).`,
    };
  }

  return { ok: true };
}

export interface ResultadoCoherenciaMacros {
  esCoherente: boolean;
  kcalCalculadas: number;
  kcalDeclaradas: number;
  diferenciaPorcentual: number;
}

/**
 * Chequeo de coherencia entre los macros y las calorias declaradas.
 * Formula estandar Atwater: proteina*4 + carbos*4 + grasa*9 vs kcal declaradas.
 * Criterio de la semilla: debe estar dentro del 25% de tolerancia (tolerancia = 0.25).
 */
export function verificarCoherenciaMacros(
  kcalDeclaradas: number,
  proteinaG: number,
  carbosG: number,
  grasaG: number,
  tolerancia = 0.25,
): ResultadoCoherenciaMacros {
  const kcalCalculadas = Math.round(proteinaG * 4 + carbosG * 4 + grasaG * 9);
  if (kcalDeclaradas < 20) {
    return {
      esCoherente: true,
      kcalCalculadas,
      kcalDeclaradas,
      diferenciaPorcentual: 0,
    };
  }

  const diffAbs = Math.abs(kcalCalculadas - kcalDeclaradas);
  if (diffAbs <= 10) {
    return {
      esCoherente: true,
      kcalCalculadas,
      kcalDeclaradas,
      diferenciaPorcentual: diffAbs / kcalDeclaradas,
    };
  }

  const diffPorcentual = diffAbs / kcalDeclaradas;
  return {
    esCoherente: diffPorcentual <= tolerancia,
    kcalCalculadas,
    kcalDeclaradas,
    diferenciaPorcentual: diffPorcentual,
  };
}

