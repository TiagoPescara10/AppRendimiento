//1. BMR (metabolismo basal). Las calorías que quemás estando en reposo, solo por existir. La fórmula estándar es Mifflin-St Jeor, que usa peso, altura, edad y sexo. Es la más precisa de las que no requieren medir grasa corporal.

//2. TDEE. El BMR multiplicado por un factor según cuánto te movés. Ese es el gasto total del día.

//3. El ajuste según objetivo. Al TDEE le restás para bajar o le sumás para subir. Un déficit de 500 kcal/día equivale a más o menos medio kilo por semana.


// src/lib/nutricion.ts

import type { SexoBiologico, NivelActividad, Objetivo } from '@/db/schema';
import type { ItemComidaConAlimento } from '@/db/queries/comidas';
// Relativo y no con el alias '@/': tsc NO reescribe los alias al emitir, y
// este archivo lo compila scripts/probar-progreso.mjs con resolucion de node.
// Los imports de TIPO pueden seguir con '@/' porque se borran al emitir.
import { diasEntre, sumarDias } from './fechas';
import { PISO_KCAL, evaluarPisoCalorias } from './salud';

const FACTOR_ACTIVIDAD: Record<NivelActividad, number> = {
  sedentario: 1.2,
  ligero: 1.375,
  moderado: 1.55,
  alto: 1.725,
  muy_alto: 1.9,
};

// Piso de seguridad: por debajo de esto no se recomienda bajar,
// aunque la cuenta del deficit de un numero menor.
export const KCAL_MINIMAS: Record<SexoBiologico, number> = PISO_KCAL;

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
  ajustadoPorPiso?: boolean;
  mensajePiso?: string | null;
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

  const evaluacion = evaluarPisoCalorias(kcal, sexo);
  return evaluacion.kcalFinal;
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

  let kcalSinPiso: number;
  switch (datos.objetivo) {
    case 'bajar':
      kcalSinPiso = tdee - 500;
      break;
    case 'subir':
      kcalSinPiso = tdee + 350;
      break;
    case 'rendimiento':
      kcalSinPiso = tdee + 200;
      break;
    case 'mantener':
    default:
      kcalSinPiso = tdee;
  }

  const evaluacionPiso = evaluarPisoCalorias(kcalSinPiso, datos.sexo);
  const kcal_objetivo = evaluacionPiso.kcalFinal;
  const macros = calcularMacros(kcal_objetivo, datos.peso_kg, datos.objetivo);

  return {
    bmr: Math.round(bmr),
    tdee: Math.round(tdee),
    kcal_objetivo,
    macros,
    ajustadoPorPiso: evaluacionPiso.ajustado,
    mensajePiso: evaluacionPiso.mensajeCoach,
  };
}

/**
 * Calcula la meta diaria de hidratacion en mililitros segun el peso corporal
 * y los minutos de entrenamiento previstos o realizados en el dia.
 *
 * Formula: 35 ml por kg de peso + 10 ml por cada minuto de entrenamiento
 * (equivalente a 600 ml por cada hora).
 * El resultado final se redondea a los 50 ml mas cercanos.
 */
export function calcularMetaAgua(
  pesoKg: number,
  minutosEntrenamientoHoy: number = 0,
): number {
  const p = Math.max(0, pesoKg);
  const m = Math.max(0, minutosEntrenamientoHoy);
  const mlExactos = 35 * p + 10 * m;
  return Math.round(mlExactos / 50) * 50;
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

// ---------------------------------------------------------------------------
// Tendencia de peso
//
// El peso de un dia no es un dato: oscila hasta dos kilos por retencion de
// liquidos, por lo que comiste ayer y por la hora a la que te pesaste. Lo que
// se puede leer es la tendencia. Por eso la pantalla de progreso dibuja los
// puntos crudos en gris fino y la tendencia gruesa: el crudo esta para que se
// vea que los datos son reales, no para sacar conclusiones de el.
//
// Todo esto es puro y sin dependencias de la base: recibe puntos, devuelve
// puntos. Las pruebas estan en scripts/probar-progreso.mjs.
// ---------------------------------------------------------------------------

/** Lo minimo para hablar de un peso en el tiempo. Un RegistroPesoRow encaja. */
export interface PuntoPeso {
  /** 'YYYY-MM-DD' local. */
  fecha: string;
  peso_kg: number;
}

/**
 * Ancho de la ventana de suavizado, en dias CALENDARIO.
 *
 * De calendario y no "las ultimas 7 pesadas": el que se pesa todos los dias
 * tendria una ventana de una semana y el que se pesa cada cinco, una de mas de
 * un mes, con el mismo codigo y sin enterarse. Lo que hay que promediar es el
 * ruido de los liquidos, que se mide en dias.
 */
export const VENTANA_TENDENCIA_DIAS = 7;

/**
 * Dias distintos que hacen falta para dibujar una tendencia.
 *
 * Con dos puntos cualquier par de valores parece una recta. El tercero es el
 * primero que puede desmentir a los otros dos.
 */
export const MINIMO_DIAS_TENDENCIA = 3;

/**
 * Un punto por dia: si hubo dos pesadas el mismo dia, se promedian.
 *
 * No hay UNIQUE sobre (usuario_id, fecha) en la base, asi que esto pasa. Dos
 * pesadas del mismo dia son el mismo dia de retencion de liquidos medido dos
 * veces, no dos datos.
 *
 * Sale ordenado por fecha ascendente, que es lo que asume todo lo de abajo.
 */
export function pesosPorDia(registros: PuntoPeso[]): PuntoPeso[] {
  const porFecha = new Map<string, { suma: number; n: number }>();

  for (const r of registros) {
    const acc = porFecha.get(r.fecha) ?? { suma: 0, n: 0 };
    acc.suma += r.peso_kg;
    acc.n += 1;
    porFecha.set(r.fecha, acc);
  }

  return [...porFecha.entries()]
    .map(([fecha, { suma, n }]) => ({ fecha, peso_kg: suma / n }))
    .sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0));
}

/**
 * Media movil de `ventanaDias` dias, ARRASTRADA: cada punto es el promedio de
 * los dias con registro en [d - ventana + 1, d].
 *
 * Arrastrada y no centrada aunque la centrada suavice mejor: la centrada no
 * puede calcular el ultimo punto, que es justo el que el usuario lee como
 * "donde estoy hoy". Preferimos un retraso de unos dias en la curva antes que
 * una curva que termina antes que los datos.
 *
 * Los primeros puntos de la serie tienen menos dias adentro de su ventana y
 * por lo tanto estan menos suavizados; el primero es igual al crudo. Es un
 * artefacto conocido de cualquier media movil y no se disimula.
 *
 * Devuelve [] si no hay al menos MINIMO_DIAS_TENDENCIA dias distintos: sin eso
 * no hay tendencia que mostrar, y la pantalla dibuja solo los puntos.
 */
export function tendenciaPeso(
  registros: PuntoPeso[],
  ventanaDias: number = VENTANA_TENDENCIA_DIAS,
): PuntoPeso[] {
  const dias = pesosPorDia(registros);
  if (dias.length < MINIMO_DIAS_TENDENCIA) return [];

  const salida: PuntoPeso[] = [];
  // `inicio` solo avanza: la serie esta ordenada, asi que el borde izquierdo
  // de la ventana nunca vuelve para atras. Evita el barrido cuadratico.
  let inicio = 0;
  let suma = 0;

  for (let i = 0; i < dias.length; i++) {
    suma += dias[i].peso_kg;
    while (diasEntre(dias[inicio].fecha, dias[i].fecha) >= ventanaDias) {
      suma -= dias[inicio].peso_kg;
      inicio++;
    }
    salida.push({ fecha: dias[i].fecha, peso_kg: suma / (i - inicio + 1) });
  }

  return salida;
}

/**
 * Pendiente en kg por dia de una serie, por minimos cuadrados.
 *
 * Por regresion y no por la recta que une el primer punto con el ultimo: esos
 * dos son justamente los que mas ruido tienen, y toda la pendiente terminaria
 * dependiendo de cuanta agua retuvo el usuario esos dos dias.
 *
 * OJO CON QUE SERIE SE LE PASA. Va la de los dias CRUDOS, no la suavizada, y
 * no es un detalle:
 *
 *   Una media movil arrastrada arranca en frio. Su punto i-esimo es el
 *   promedio de los i primeros dias, asi que sobre una serie que baja m kg por
 *   dia, los primeros puntos bajan m/2, no m. Con la ventana ya llena el sesgo
 *   se va —la tendencia pasa a ser la serie corrida unos dias— pero mientras
 *   dura arrastra la regresion hacia el cero.
 *
 *   Y el sesgo pega mas fuerte justo donde menos se lo puede pagar, porque es
 *   peor cuanto mas corta es la serie. Medido sobre una que baja 100 g por
 *   dia: a los 14 dias —el minimo para dar una fecha— regresar la tendencia da
 *   78 g en vez de 100, o sea un 22% de error que estira meses la proyeccion.
 *   Recien a los 60 dias baja del 2%.
 *
 * La linea que se DIBUJA sigue siendo la suavizada, y el punto del que arranca
 * la proyeccion tambien: lo unico que sale de los crudos es la inclinacion.
 *
 * null cuando no hay dos dias distintos: sin eje x no hay pendiente.
 */
export function pendienteDiaria(serie: PuntoPeso[]): number | null {
  if (serie.length < 2) return null;

  const origen = serie[0].fecha;
  const xs = serie.map((p) => diasEntre(origen, p.fecha));
  const ys = serie.map((p) => p.peso_kg);

  const n = xs.length;
  const mediaX = xs.reduce((s, x) => s + x, 0) / n;
  const mediaY = ys.reduce((s, y) => s + y, 0) / n;

  let numerador = 0;
  let denominador = 0;
  for (let i = 0; i < n; i++) {
    numerador += (xs[i] - mediaX) * (ys[i] - mediaY);
    denominador += (xs[i] - mediaX) ** 2;
  }

  // Todos los puntos en el mismo dia: la recta seria vertical.
  if (denominador === 0) return null;
  return numerador / denominador;
}

// --- Proyeccion ------------------------------------------------------------

/**
 * Por que la proyeccion puede no existir. La pantalla decide que decir en cada
 * caso, pero el motivo se decide aca: es una regla, no una redaccion.
 */
export type ClaseProyeccion =
  /** Menos de MINIMO_DIAS_TENDENCIA dias con registro. Ni tendencia hay. */
  | 'sin_datos'
  /** Hay tendencia, pero abarca muy pocos dias como para extrapolar meses. */
  | 'poco_rango'
  /** El perfil no tiene peso objetivo: no hay a donde proyectar. */
  | 'sin_objetivo'
  /** Ya esta en el objetivo, dentro de la tolerancia. */
  | 'ya_llegaste'
  /** La pendiente es tan chica que cualquier fecha seria inventada. */
  | 'plana'
  /** Se mueve, pero para el lado contrario al objetivo. */
  | 'al_reves'
  /** Va para el lado bueno, pero la fecha cae mas alla del horizonte util. */
  | 'lejos'
  /** El caso feliz: hay fecha. */
  | 'fecha';

export interface Proyeccion {
  clase: ClaseProyeccion;
  /** kg por semana de la tendencia. Negativo = baja. null si no se pudo. */
  kgPorSemana: number | null;
  /** Primer y ultimo punto de la tendencia. Para el texto de contexto. */
  pesoInicial: number | null;
  pesoActual: number | null;
  /** Dias que abarca la tendencia, de la primera fecha a la ultima. */
  diasDeRango: number;
  /**
   * Cuanto falta hasta el objetivo, CON SIGNO: negativo = hay que bajar.
   * null si no hay peso objetivo.
   */
  faltaKg: number | null;
  /** Solo en 'fecha'. 'YYYY-MM-DD'. */
  fechaEstimada: string | null;
  diasEstimados: number | null;
}

/** Dias de registro que hacen falta para animarse a extrapolar meses. */
export const MINIMO_RANGO_PROYECCION_DIAS = 14;

/** Por debajo de esto la tendencia se llama plana. */
export const PENDIENTE_MINIMA_SEMANAL_KG = 0.05;

/** Mas lejos que esto, la fecha no le sirve a nadie. Dos anios. */
export const HORIZONTE_MAXIMO_DIAS = 730;

/** Diferencia con el objetivo que ya cuenta como haber llegado. */
export const TOLERANCIA_OBJETIVO_KG = 0.3;

/**
 * Ritmo de bajada semanal a partir del cual el descenso es demasiado rapido y
 * conviene avisarlo en vez de celebrarlo: por arriba de esto lo que se pierde
 * deja de ser solo grasa.
 *
 * TODAVIA NO SE USA. El aviso esta pendiente y su lugar en la pantalla ya esta
 * reservado: la funcion es avisoRitmo() en features/progreso/formato.ts y el
 * hueco donde se dibuja esta en la card de proyeccion de app/(tabs)/progreso.tsx.
 * La constante vive aca, con el resto de los umbrales, para que el dia que se
 * implemente no haya que decidir de nuevo el numero.
 */
export const BAJADA_SEMANAL_MAXIMA_KG = 0.75;

/**
 * A donde lleva la tendencia, o por que no se puede decir.
 *
 * La cuenta es la pendiente real de la tendencia, no el deficit teorico del
 * plan: lo que importa es lo que esta pasando, no lo que deberia pasar.
 *
 * El punto de partida es el ULTIMO valor de la tendencia y no el intercepto de
 * la recta de regresion. Son parecidos pero no iguales, y el que el usuario ve
 * en el grafico es el ultimo punto de la linea marino.
 *
 * Recibe las dos series a proposito: `tendencia` es la que se dibuja y de la
 * que sale el punto de partida, y `diasCrudos` —la salida de pesosPorDia()—
 * es de la que sale la inclinacion. Ver pendienteDiaria() para el por que.
 *
 * Como la tendencia lagea unos dias respecto de los crudos, la fecha que sale
 * de aca es un poco conservadora. Es el lado bueno para equivocarse.
 */
export function proyectarPeso(
  tendencia: PuntoPeso[],
  diasCrudos: PuntoPeso[],
  pesoObjetivoKg: number | null,
): Proyeccion {
  const vacia: Proyeccion = {
    clase: 'sin_datos',
    kgPorSemana: null,
    pesoInicial: null,
    pesoActual: null,
    diasDeRango: 0,
    fechaEstimada: null,
    diasEstimados: null,
    faltaKg: null,
  };

  if (tendencia.length < MINIMO_DIAS_TENDENCIA || diasCrudos.length < MINIMO_DIAS_TENDENCIA) {
    return vacia;
  }

  const primero = tendencia[0];
  const ultimo = tendencia[tendencia.length - 1];
  const diasDeRango = diasEntre(primero.fecha, ultimo.fecha);
  // La inclinacion sale de los crudos y el punto de partida de la tendencia.
  // El por que esta en pendienteDiaria().
  const pendiente = pendienteDiaria(diasCrudos);

  const base: Proyeccion = {
    ...vacia,
    clase: 'poco_rango',
    kgPorSemana: pendiente === null ? null : pendiente * 7,
    pesoInicial: primero.peso_kg,
    pesoActual: ultimo.peso_kg,
    diasDeRango,
    faltaKg: pesoObjetivoKg === null ? null : pesoObjetivoKg - ultimo.peso_kg,
  };

  // Orden de los cortes, y el orden importa:
  //
  // 1. El rango va primero. Extrapolar cuatro meses desde seis dias de
  //    registros da un numero inventado con cara de dato, aunque la cuenta
  //    cierre.
  // 2. Sin objetivo no hay proyeccion, pero el ritmo igual se muestra.
  // 3. "Ya llegaste" antes que "plana": estar en el objetivo y no moverse es
  //    haber llegado, no estar estancado.
  // 4. "Plana" antes que "al reves": con la pendiente casi en cero el signo es
  //    ruido, y decirle a alguien que viene subiendo por 20 gramos semanales
  //    es afirmar mas de lo que el dato aguanta.
  if (pendiente === null || diasDeRango < MINIMO_RANGO_PROYECCION_DIAS) return base;
  if (pesoObjetivoKg === null) return { ...base, clase: 'sin_objetivo' };

  const falta = pesoObjetivoKg - ultimo.peso_kg;
  if (Math.abs(falta) <= TOLERANCIA_OBJETIVO_KG) return { ...base, clase: 'ya_llegaste' };
  if (Math.abs(pendiente * 7) < PENDIENTE_MINIMA_SEMANAL_KG) return { ...base, clase: 'plana' };
  if (Math.sign(pendiente) !== Math.sign(falta)) return { ...base, clase: 'al_reves' };

  const dias = Math.ceil(falta / pendiente);
  if (dias > HORIZONTE_MAXIMO_DIAS) return { ...base, clase: 'lejos' };

  return {
    ...base,
    clase: 'fecha',
    diasEstimados: dias,
    fechaEstimada: sumarDias(ultimo.fecha, dias),
  };
}

// ---------------------------------------------------------------------------
// Promedio diario de un periodo
// ---------------------------------------------------------------------------

/** Un item de comida con la fecha de la comida a la que pertenece. */
export interface ItemConFecha extends ItemComidaConAlimento {
  /** 'YYYY-MM-DD' local, la columna generada de `comida`. */
  fecha: string;
}

export interface PromedioDiario {
  /**
   * Dias con al menos un item cargado. NO son los dias del periodo: sin este
   * numero al lado, el promedio de cuatro dias registrados se lee como si
   * fuera el mes entero.
   */
  diasConRegistro: number;
  kcal: number;
  proteina_g: number;
  carbohidratos_g: number;
  grasa_g: number;
}

/**
 * Promedio por DIA REGISTRADO, no por dia del calendario.
 *
 * Dividir por los dias del periodo mezclaria dos cosas distintas: cuanto comio
 * y cuanto anoto. Un dia sin registrar no es un dia sin comer, asi que meterlo
 * en el denominador da un promedio bajo que no le paso a nadie.
 *
 * Se suma crudo y se redondea una sola vez al final, igual que en el
 * dashboard: redondear cada item hace que las partes no sumen el total.
 */
export function promedioDiario(items: ItemConFecha[]): PromedioDiario {
  const dias = new Set<string>();
  const total = { kcal: 0, proteina_g: 0, carbohidratos_g: 0, grasa_g: 0 };

  for (const it of items) {
    dias.add(it.fecha);
    const f = it.cantidad_g / 100;
    total.kcal += it.kcal_por_100g * f;
    total.proteina_g += it.proteina_g * f;
    total.carbohidratos_g += it.carbohidratos_g * f;
    total.grasa_g += it.grasa_g * f;
  }

  const n = dias.size;
  if (n === 0) {
    return { diasConRegistro: 0, kcal: 0, proteina_g: 0, carbohidratos_g: 0, grasa_g: 0 };
  }

  return {
    diasConRegistro: n,
    kcal: Math.round(total.kcal / n),
    proteina_g: Math.round(total.proteina_g / n),
    carbohidratos_g: Math.round(total.carbohidratos_g / n),
    grasa_g: Math.round(total.grasa_g / n),
  };
}
