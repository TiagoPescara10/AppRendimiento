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

export function calcularEdad(nacimiento: Date | string): number {
  const fecha = typeof nacimiento === 'string' ? aFecha(nacimiento) : nacimiento;

  const hoy = new Date();
  let edad = hoy.getFullYear() - fecha.getFullYear();
  const mes = hoy.getMonth() - fecha.getMonth();
  if (mes < 0 || (mes === 0 && hoy.getDate() < fecha.getDate())) {
    edad--;
  }
  return edad;
}

/** 'YYYY-MM-DD' a Date en hora local. new Date(str) lo lee como UTC. */
function aFecha(iso: string): Date {
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(a, m - 1, d);
}