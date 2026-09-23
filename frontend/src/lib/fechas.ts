/**
 * YYYY-MM-DD del dia LOCAL.
 *
 * No usar `fecha.toISOString().slice(0, 10)`: eso convierte a UTC primero. En
 * Argentina (-03:00) coincide, pero en cualquier huso positivo la medianoche
 * local ya cayo el dia anterior en UTC y la fecha sale corrida un dia.
 */
export function aFechaLocal(fecha: Date): string {
    const anio = fecha.getFullYear();
    const mes = String(fecha.getMonth() + 1).padStart(2, '0');
    const dia = String(fecha.getDate()).padStart(2, '0');
    return `${anio}-${mes}-${dia}`;
}

/**
 * ISO 8601 CON offset local: "2026-09-04T22:00:00-03:00".
 *
 * Es el formato en que se guardan `comida.fecha_hora` y
 * `evento.fecha_hora_inicio`, y no es cosmetico: las dos tablas tienen una
 * columna generada `fecha` que sale de los primeros 10 caracteres del string.
 * Vale la misma advertencia que arriba, y con mas consecuencias: guardar UTC
 * manda una cena o un entrenamiento de las 22:00 en Buenos Aires al dia
 * siguiente, y ahi no hay forma de notarlo mirando la hora, que se ve bien.
 *
 * El offset se calcula del Date recibido y no de una constante: en una zona
 * con horario de verano no es el mismo todo el ano, y el que hay que estampar
 * es el del instante que se esta formateando.
 *
 * Los segundos salen del Date tal como vienen. El que no los quiera, que los
 * ponga en cero antes de llamar.
 */
export function aISOLocal(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  const offsetMin = -d.getTimezoneOffset();
  const signo = offsetMin >= 0 ? '+' : '-';
  const offH = p(Math.floor(Math.abs(offsetMin) / 60));
  const offM = p(Math.abs(offsetMin) % 60);

  return (
    `${aFechaLocal(d)}` +
    `T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}` +
    `${signo}${offH}:${offM}`
  );
}

export function calcularEdad(nacimiento: Date | string): number {
  const fecha = typeof nacimiento === 'string' ? desdeFechaLocal(nacimiento) : nacimiento;

  const hoy = new Date();
  let edad = hoy.getFullYear() - fecha.getFullYear();
  const mes = hoy.getMonth() - fecha.getMonth();
  if (mes < 0 || (mes === 0 && hoy.getDate() < fecha.getDate())) {
    edad--;
  }
  return edad;
}

/** 'YYYY-MM-DD' a Date en hora local. new Date(str) lo lee como UTC. */
export function desdeFechaLocal(iso: string): Date {
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(a, m - 1, d);
}

/**
 * Dias enteros de `desde` a `hasta`, las dos en 'YYYY-MM-DD'. Negativo si
 * `hasta` es anterior.
 *
 * Va por medianoche LOCAL y redondea, no trunca: si algun dia el pais vuelve
 * a tener horario de verano, una de las dos medianoches se corre una hora y
 * la division daria 6,96 dias donde hay 7.
 */
export function diasEntre(desde: string, hasta: string): number {
  const ms = desdeFechaLocal(hasta).getTime() - desdeFechaLocal(desde).getTime();
  return Math.round(ms / 86_400_000);
}

/**
 * 'YYYY-MM-DD' mas N dias, otra vez en 'YYYY-MM-DD'. N puede ser negativo.
 *
 * Pasa por setDate() y no por sumar milisegundos: el constructor normaliza el
 * desborde de mes y de anio solo, y no lo afecta ningun cambio de huso.
 */
export function sumarDias(fecha: string, dias: number): string {
  const d = desdeFechaLocal(fecha);
  d.setDate(d.getDate() + dias);
  return aFechaLocal(d);
}