// src/features/compartir/tarjeta.ts
//
// Que dice la tarjeta para compartir. El componente dibuja; lo que se muestra
// y lo que no se decide aca, que es lo que se puede equivocar en silencio.
//
// La regla que manda: nunca "0", "—" ni "NaN" en la imagen. Un dato que falta
// no aparece.
//
//   con km   numero grande = km;  columnas = Tiempo · ritmo · kcal
//   sin km   numero grande = tiempo;  columnas = kcal, o ninguna
//
// El ritmo es min/km a pie y km/h en bici, que es como se mide cada una.
//
// Imports relativos y sin '@/': entra al build de scripts/probar-gasto.mjs.

import { calcularRitmo, formatearDecimal } from '../entrenamiento/temporizador';
import type { Actividad } from '../../lib/gasto';

export interface DatosTarjeta {
  actividad: Actividad | null;
  /** 'YYYY-MM-DD' local de la sesion. */
  fecha: string;
  duracionSeg: number;
  distanciaKm: number | null;
  kcal: number | null;
}

export interface Columna {
  valor: string;
  etiqueta: string;
}

export interface ContenidoTarjeta {
  /** "CORRER". null si la sesion no tiene actividad. */
  actividad: string | null;
  /** "Mar 29 sep". */
  fecha: string;
  principal: { valor: string; unidad: string };
  /** 0 a 3 columnas, todas del mismo ancho. */
  columnas: Columna[];
}

const ETIQUETA_ACTIVIDAD: Record<Actividad, string> = {
  correr: 'CORRER',
  caminar: 'CAMINAR',
  bici: 'BICI',
};

const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** "Mar 29 sep", a partir de 'YYYY-MM-DD' en hora local. */
export function fechaTarjeta(fecha: string): string {
  const [a, m, d] = fecha.split('-').map(Number);
  const dia = new Date(a, m - 1, d);
  return `${DIAS[dia.getDay()]} ${dia.getDate()} ${MESES[dia.getMonth()]}`;
}

/** "45:12", "0:45", "1:05:12". Siempre con minutos: "45" solo no se lee como tiempo. */
export function tiempoTarjeta(segundos: number): string {
  const s = Math.max(0, Math.round(segundos));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const seg = s % 60;
  const dos = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${dos(m)}:${dos(seg)}` : `${m}:${dos(seg)}`;
}

const hayNumero = (n: number | null): n is number => n !== null && Number.isFinite(n) && n > 0;

export function contenidoTarjeta(d: DatosTarjeta): ContenidoTarjeta {
  const tiempo = tiempoTarjeta(d.duracionSeg);
  const kcal: Columna | null = hayNumero(d.kcal) ? { valor: `≈ ${Math.round(d.kcal)}`, etiqueta: 'kcal' } : null;
  const base = {
    actividad: d.actividad ? ETIQUETA_ACTIVIDAD[d.actividad] : null,
    fecha: fechaTarjeta(d.fecha),
  };

  if (!hayNumero(d.distanciaKm)) {
    return {
      ...base,
      principal: { valor: tiempo, unidad: d.duracionSeg >= 3600 ? 'h' : 'min' },
      columnas: kcal ? [kcal] : [],
    };
  }

  const columnas: Columna[] = [{ valor: tiempo, etiqueta: 'Tiempo' }];
  const ritmo = calcularRitmo(d.distanciaKm, d.duracionSeg);
  if (ritmo) {
    columnas.push(
      d.actividad === 'bici'
        ? { valor: ritmo.velocidadTexto, etiqueta: 'km/h' }
        : { valor: ritmo.ritmoTexto, etiqueta: 'min/km' },
    );
  }
  if (kcal) columnas.push(kcal);

  return {
    ...base,
    principal: { valor: formatearDecimal(d.distanciaKm, 2), unidad: 'km' },
    columnas,
  };
}
