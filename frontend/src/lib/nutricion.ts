//1. BMR (metabolismo basal). Las calorías que quemás estando en reposo, solo por existir. La fórmula estándar es Mifflin-St Jeor, que usa peso, altura, edad y sexo. Es la más precisa de las que no requieren medir grasa corporal.

//2. TDEE. El BMR multiplicado por un factor según cuánto te movés. Ese es el gasto total del día.

//3. El ajuste según objetivo. Al TDEE le restás para bajar o le sumás para subir. Un déficit de 500 kcal/día equivale a más o menos medio kilo por semana.


// src/lib/nutricion.ts

import type { SexoBiologico, NivelActividad, Objetivo } from '@/db/schema';
import type { ItemComidaConAlimento } from '@/db/queries/comidas';

const FACTOR_ACTIVIDAD: Record<NivelActividad, number> = {
  sedentario: 1.2,
  ligero: 1.375,
  moderado: 1.55,
  alto: 1.725,
  muy_alto: 1.9,
};

// Piso de seguridad: por debajo de esto no se recomienda bajar,
// aunque la cuenta del deficit de un numero menor.
const KCAL_MINIMAS: Record<SexoBiologico, number> = {
  masculino: 1500,
  femenino: 1200,
};

export interface DatosCalculo {
  peso_kg: number;
  altura_cm: number;
  edad: number;
  sexo: SexoBiologico;
  nivel_actividad: NivelActividad;
  objetivo: Objetivo;
}

export interface Macros {
  proteina_g: number;
  carbohidratos_g: number;
  grasa_g: number;
}

export interface ResultadoNutricional {
  bmr: number;
  tdee: number;
  kcal_objetivo: number;
  macros: Macros;
}

export interface TotalesComida {
  kcal: number;
  proteina_g: number;
  carbohidratos_g: number;
  grasa_g: number;
  fibra_g: number;
}


/** Mifflin-St Jeor. La constante final es lo unico que cambia por sexo. */
export function calcularBMR(
  peso_kg: number,
  altura_cm: number,
  edad: number,
  sexo: SexoBiologico,
): number {
  const base = 10 * peso_kg + 6.25 * altura_cm - 5 * edad;
  return sexo === 'masculino' ? base + 5 : base - 161;
}

export function calcularTDEE(bmr: number, nivel: NivelActividad): number {
  return bmr * FACTOR_ACTIVIDAD[nivel];
}

export function ajustarPorObjetivo(
  tdee: number,
  objetivo: Objetivo,
  sexo: SexoBiologico,
): number {
  let kcal: number;

  switch (objetivo) {
    case 'bajar':
      kcal = tdee - 500;
      break;
    case 'subir':
      kcal = tdee + 350;
      break;
    case 'rendimiento':
      kcal = tdee + 200;
      break;
    case 'mantener':
    default:
      kcal = tdee;
  }

  return Math.max(kcal, KCAL_MINIMAS[sexo]);
}

/**
 * Proteina y grasa se fijan por kilo de peso; los carbohidratos ocupan
 * lo que sobra. Es el reparto habitual en deporte: la proteina sostiene
 * la masa muscular y los carbos son el combustible.
 */
export function calcularMacros(
  kcal: number,
  peso_kg: number,
  objetivo: Objetivo,
): Macros {
  const gProteinaPorKg = objetivo === 'bajar' ? 2.0 : 1.8;
  const gGrasaPorKg = 0.8;

  const proteina_g = Math.round(peso_kg * gProteinaPorKg);
  const grasa_g = Math.round(peso_kg * gGrasaPorKg);

  // 4 kcal por gramo de proteina y de carbos, 9 por gramo de grasa.
  const kcalRestantes = kcal - proteina_g * 4 - grasa_g * 9;
  const carbohidratos_g = Math.max(0, Math.round(kcalRestantes / 4));

  return { proteina_g, carbohidratos_g, grasa_g };
}

export function calcularTodo(datos: DatosCalculo): ResultadoNutricional {
  const bmr = calcularBMR(datos.peso_kg, datos.altura_cm, datos.edad, datos.sexo);
  const tdee = calcularTDEE(bmr, datos.nivel_actividad);
  const kcal_objetivo = ajustarPorObjetivo(tdee, datos.objetivo, datos.sexo);
  const macros = calcularMacros(kcal_objetivo, datos.peso_kg, datos.objetivo);


  return {
    bmr: Math.round(bmr),
    tdee: Math.round(tdee),
    kcal_objetivo: Math.round(kcal_objetivo),
    macros,
  };
}

/**
 * Suma los items de una comida. Los valores del alimento son por 100 g,
 * asi que cada item aporta (cantidad_g / 100) * valor.
 *
 * Sirve igual para una comida sola o para el dia entero: pasale todos los
 * items de todas las comidas y devuelve el total.
 */
export function totalesDeComida(items: ItemComidaConAlimento[]): TotalesComida {
  const total: TotalesComida = {
    kcal: 0,
    proteina_g: 0,
    carbohidratos_g: 0,
    grasa_g: 0,
    fibra_g: 0,
  };

  for (const item of items) {
    const factor = item.cantidad_g / 100;
    total.kcal += item.kcal_por_100g * factor;
    total.proteina_g += item.proteina_g * factor;
    total.carbohidratos_g += item.carbohidratos_g * factor;
    total.grasa_g += item.grasa_g * factor;
    total.fibra_g += (item.fibra_g ?? 0) * factor;
  }

  return {
    kcal: Math.round(total.kcal),
    proteina_g: Math.round(total.proteina_g),
    carbohidratos_g: Math.round(total.carbohidratos_g),
    grasa_g: Math.round(total.grasa_g),
    fibra_g: Math.round(total.fibra_g),
  };
}