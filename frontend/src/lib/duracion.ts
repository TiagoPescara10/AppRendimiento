// src/lib/duracion.ts
//
// Tiempo de las series por tiempo (plancha, cardio): como se escribe en el
// teclado y como se lee. Puro, para probarlo en Node.
//
// En el teclado los digitos entran de derecha a izquierda, como en un
// microondas: los dos ultimos son los segundos y el resto los minutos.
// "1" es 0:01, "130" es 1:30 y "3000" es 30:00. Hasta 4 digitos (99:59).

/** Cuantos digitos acepta el campo Tiempo. */
export const MAX_DIGITOS_TIEMPO = 4;

/** "1:30", "30:00". Sin horas: una serie no llega a 100 minutos. */
export function textoDuracion(seg: number): string {
  const total = Math.max(0, Math.round(seg));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export interface LecturaDigitos {
  /** Segundos, o null si no hay digitos o el valor no es valido. */
  seg: number | null;
  /** "1:30" para mostrar en la celda, aunque no sea valido. */
  texto: string;
  /** false si los segundos pasan de 59 ("190"). No se normaliza a 2:30. */
  valido: boolean;
}

/** Lee lo escrito en el teclado. Sin digitos da 0:00, que no es una serie. */
export function leerDigitosTiempo(digitos: string): LecturaDigitos {
  const limpio = digitos.replace(/\D/g, '').slice(-MAX_DIGITOS_TIEMPO);
  const n = limpio === '' ? 0 : parseInt(limpio, 10);
  const m = Math.floor(n / 100);
  const s = n % 100;
  const texto = `${m}:${String(s).padStart(2, '0')}`;
  if (s > 59) return { seg: null, texto, valido: false };
  const seg = m * 60 + s;
  return { seg: seg > 0 ? seg : null, texto, valido: true };
}

/** Al reves: 90 seg da "130", para seguir editando lo que dejo el cronometro. */
export function digitosDeDuracion(seg: number): string {
  const total = Math.min(Math.max(0, Math.round(seg)), 99 * 60 + 59);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}${String(s).padStart(2, '0')}` : String(s);
}

/** Cada cuanto pita el cronometro de una serie por tiempo. */
export const PITIDO_CADA_SEG = 15;

/**
 * Si entre dos lecturas del cronometro se paso una marca de 15 s. Una sola
 * respuesta aunque se hayan pasado varias (al volver de segundo plano): una
 * rafaga de pitidos atrasados no le dice nada a nadie.
 */
export function cruzoMarca(segAntes: number, segAhora: number, cada = PITIDO_CADA_SEG): boolean {
  if (segAhora <= segAntes) return false;
  return Math.floor(segAhora / cada) > Math.floor(segAntes / cada);
}
