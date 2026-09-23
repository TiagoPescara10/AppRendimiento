// Logica de deteccion de porciones y bebidas.
// Centraliza el parseo de envases, la generacion automatica de porciones
// para productos escaneados y el fallback al vuelo para bebidas sin porcion.

import type { PorcionTipica } from '../../db/schema';

export const TOPE_GRAMOS_MAX = 3000;

export interface CantidadParseada {
  gramos: number;
  textoOriginal: string;
}

// Parsea expresiones como '2.5 L', '500 ml', '1.5 kg', '200 g'
export function parsearCantidadTexto(texto?: string | null): CantidadParseada | null {
  if (!texto || typeof texto !== 'string') return null;
  const limpio = texto.trim();
  if (!limpio) return null;

  const regex = /(\d+(?:[.,]\d+)?)\s*(kg|kilos?|l|lt|lts|litros?|g|gr|grs|gramos?|ml|cc)\b/i;
  const match = limpio.match(regex);
  if (!match) return null;

  const num = parseFloat(match[1].replace(',', '.'));
  if (!Number.isFinite(num) || num <= 0) return null;

  const unidad = match[2].toLowerCase();
  let gramos = num;

  if (unidad.startsWith('k')) {
    gramos = num * 1000;
  } else if (['l', 'lt', 'lts', 'litro', 'litros'].includes(unidad)) {
    // 1 L de liquido equivale aproximadamente a 1000 g
    gramos = num * 1000;
  } else {
    gramos = num;
  }

  const gramosEnteros = Math.round(gramos);
  if (gramosEnteros <= 0 || gramosEnteros > TOPE_GRAMOS_MAX) return null;

  return { gramos: gramosEnteros, textoOriginal: limpio };
}

// Determina si por nombre o texto de envase parece una bebida
export function esProbableBebida(
  nombre: string,
  quantityText?: string | null,
  servingText?: string | null,
): boolean {
  const t = `${nombre} ${quantityText ?? ''} ${servingText ?? ''}`.toLowerCase();
  return (
    t.includes('ml') ||
    t.includes('cc') ||
    /\b(l|lt|lts|litro|litros)\b/.test(t) ||
    t.includes('bebida') ||
    t.includes('gaseosa') ||
    t.includes('agua') ||
    t.includes('jugo') ||
    t.includes('leche') ||
    t.includes('cerveza') ||
    t.includes('vino') ||
    t.includes('coca') ||
    t.includes('sprite') ||
    t.includes('pepsi') ||
    t.includes('fernet') ||
    t.includes('aperitivo') ||
    t.includes('licuado') ||
    t.includes('limonada') ||
    t.includes('pomelo') ||
    t.includes('isotonica') ||
    t.includes('energizante')
  );
}

// Porciones estandar para bebidas sin porciones cargadas
export function obtenerPorcionesBebidaEstandar(): PorcionTipica[] {
  return [
    { nombre: '1 vaso (250 g)', gramos: 250, predeterminada: true },
    { nombre: 'Medio litro (500 g)', gramos: 500, predeterminada: false },
  ];
}

// Genera fracciones utiles segun el envase y la porcion sugerida
export function generarPorcionesAutomaticas(
  nombre: string,
  servingSizeStr?: string | null,
  quantityStr?: string | null,
): PorcionTipica[] {
  const serving = parsearCantidadTexto(servingSizeStr);
  const envase = parsearCantidadTexto(quantityStr);
  const esBebida = esProbableBebida(nombre, quantityStr, servingSizeStr);

  const porciones: PorcionTipica[] = [];
  const gramosVistos = new Set<number>();

  const agregar = (nombreP: string, g: number, pred: boolean) => {
    if (g <= 0 || g > TOPE_GRAMOS_MAX) return;
    if (gramosVistos.has(g)) return;
    gramosVistos.add(g);
    porciones.push({ nombre: nombreP, gramos: g, predeterminada: pred });
  };

  // 1. Si hay serving_size parseable, esa es la predeterminada
  if (serving) {
    const etiquetaServing =
      serving.textoOriginal.length <= 25 && !/^\d+/.test(serving.textoOriginal)
        ? serving.textoOriginal
        : `1 porcion (${serving.gramos} g)`;
    agregar(etiquetaServing, serving.gramos, true);
  }

  // 2. Si hay quantity y es bebida o el envase supera los 500 g:
  // Ofrecer fracciones utiles: 1 vaso (250 g), medio litro (500 g) y envase entero
  if (envase && (esBebida || envase.gramos > 500)) {
    const vasoPred = !serving && envase.gramos >= 250;
    agregar('1 vaso (250 g)', 250, vasoPred);

    if (envase.gramos >= 500) {
      const medioPred = !serving && !vasoPred;
      agregar('Medio litro (500 g)', 500, medioPred);
    }

    const envasePred = !serving && !vasoPred && envase.gramos < 500;
    const etiquetaEnvase =
      envase.gramos >= 1000
        ? `Botella entera (${(envase.gramos / 1000).toFixed(1).replace('.0', '')} L)`
        : `Envase entero (${envase.gramos} g)`;
    agregar(etiquetaEnvase, envase.gramos, envasePred);
  } else if (envase && envase.gramos <= 500) {
    // 3. Si el envase es chico (<= 500 g), ofrecer el envase entero
    const envasePred = !serving;
    agregar(`Envase entero (${envase.gramos} g)`, envase.gramos, envasePred);
  }

  // 4. Si es bebida y no se agrego nada util todavia, agregar el estandar de bebidas
  if (porciones.length === 0 && esBebida) {
    return obtenerPorcionesBebidaEstandar();
  }

  // 5. Si no hay nada parseable, cae en 100 g como predeterminada
  if (porciones.length === 0) {
    porciones.push({ nombre: '100 g', gramos: 100, predeterminada: true });
  } else {
    const tienePred = porciones.some((p) => p.predeterminada);
    if (!tienePred) {
      porciones[0].predeterminada = true;
    }
  }

  return porciones;
}

// Devuelve las porciones del alimento o el fallback de bebida si no tiene porciones
export function resolverPorcionesAlimento(alimento: {
  nombre: string;
  categoria?: string | null;
  porciones?: PorcionTipica[] | null;
}): PorcionTipica[] {
  if (alimento.porciones && alimento.porciones.length > 0) {
    return alimento.porciones;
  }

  const esBebida =
    alimento.categoria === 'bebidas' || esProbableBebida(alimento.nombre);

  if (esBebida) {
    return obtenerPorcionesBebidaEstandar();
  }

  return [];
}
