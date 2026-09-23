// src/features/progreso/api.ts
//
// Todo lo que la pantalla de Progreso necesita, ya calculado. La pantalla
// dibuja; aca se lee la base y se llama a las funciones puras de src/lib/.
//
// El corte esta puesto asi para que ninguna cuenta viva en un componente: si
// algo de esto se equivoca, se equivoca en un lugar que tiene pruebas.

import { obtenerPerfilLocal } from '@/db/queries/perfil';
import { listarPesos, ultimoPeso } from '@/db/queries/peso';
import { listarEventosPorRangoFecha } from '@/db/queries/eventos';
import { obtenerSesionPorEvento, obtenerResumenRutina } from '@/db/queries/sesiones';
import { listarItemsConAlimentoPorRango } from '@/db/queries/comidas';
import type { PerfilRow } from '@/db/schema';

import { aFechaLocal, diasEntre, sumarDias, calcularEdad } from '@/lib/fechas';
import {
  calcularTodo,
  pesosPorDia,
  promedioDiario,
  proyectarPeso,
  tendenciaPeso,
  VENTANA_TENDENCIA_DIAS,
} from '@/lib/nutricion';
import type { ResultadoNutricional, PromedioDiario, Proyeccion, PuntoPeso } from '@/lib/nutricion';
import {
  desgloseAsistencia,
  rachaAsistencias,
  resumenAsistencia,
  separarPorOrigen,
  volumenPropio,
} from '@/lib/progreso';
import type {
  DesgloseAsistencia,
  EntrenamientoPropio,
  ResumenAsistencia,
  VolumenPropio,
} from '@/lib/progreso';
import { DIAS_PERIODO, direccionDeseada } from './formato';
import type { Periodo } from './formato';

/**
 * El "desde" de las consultas cuando el periodo es 'todo'. Es una fecha
 * imposible y no un null para no duplicar cada query en dos versiones.
 */
const INICIO_DE_LOS_TIEMPOS = '0001-01-01';

export interface DatosPeso {
  /** El ultimo registro de verdad, sin suavizar: es lo que dijo la balanza. */
  actualKg: number | null;
  objetivoKg: number | null;
  /** Para donde es "bien" segun el perfil. Ver direccionDeseada(). */
  direccion: -1 | 0 | 1;
  /**
   * Cuanto se movio en el periodo. Sale de la TENDENCIA cuando hay, y recien
   * si no hay se cae a los puntos crudos: comparar el primer crudo con el
   * ultimo es comparar dos dias de retencion de liquidos, que es justo lo que
   * esta pantalla trata de no hacer.
   */
  deltaKg: number | null;
  /** Un punto por dia del periodo. La linea fina gris. */
  crudos: PuntoPeso[];
  /** La linea marino. Vacia si no hay dias suficientes. */
  tendencia: PuntoPeso[];
  proyeccion: Proyeccion;
}

export interface DatosAsistencia extends ResumenAsistencia {
  /** Sobre TODO el historial, no sobre el periodo. Ver rachaAsistencias(). */
  racha: number;
  /** Desglose entre deporte y gimnasio. */
  desglose: DesgloseAsistencia;
}

export interface DatosProgreso {
  periodo: Periodo;
  /** 'YYYY-MM-DD' local del dia en que se cargo. */
  hoy: string;
  /** Deporte principal del perfil, para rotular los entrenamientos deportivos. */
  deportePrincipal: string | null;
  /**
   * Dias que abarca el periodo. Es el denominador de "22 de 30 días", el dato
   * sin el cual un promedio de cuatro dias registrados se lee como un mes.
   */
  diasDelPeriodo: number;
  peso: DatosPeso;
  asistencia: DatosAsistencia;
  propios: { volumen: VolumenPropio; items: EntrenamientoPropio[] };
  nutricion: { promedio: PromedioDiario; objetivo: ResultadoNutricional | null };
}

/** El objetivo nutricional del dia, o null si el onboarding quedo a medias. */
function objetivoDe(perfil: PerfilRow, pesoKg: number | null): ResultadoNutricional | null {
  const edad = perfil.fecha_nacimiento ? calcularEdad(perfil.fecha_nacimiento) : null;
  if (
    !pesoKg ||
    !perfil.altura_cm ||
    !edad ||
    !perfil.sexo_biologico ||
    !perfil.nivel_actividad ||
    !perfil.objetivo
  ) {
    return null;
  }

  return calcularTodo({
    peso_kg: pesoKg,
    altura_cm: perfil.altura_cm,
    edad,
    sexo: perfil.sexo_biologico,
    nivel_actividad: perfil.nivel_actividad,
    objetivo: perfil.objetivo,
  });
}

export async function cargarProgreso(periodo: Periodo): Promise<DatosProgreso | null> {
  const perfil = await obtenerPerfilLocal();
  if (!perfil) return null;

  const hoy = aFechaLocal(new Date());
  const dias = DIAS_PERIODO[periodo];
  const desde = dias === null ? INICIO_DE_LOS_TIEMPOS : sumarDias(hoy, -(dias - 1));

  // La ventana de suavizado necesita los dias ANTERIORES al periodo, si no el
  // primer punto de la tendencia sale sin suavizar y la linea arranca con un
  // pico que no existe. Se piden esos dias de mas y despues se recortan: el
  // periodo decide que se mide, el arranque en frio es solo un artefacto.
  const desdeConCalentamiento =
    dias === null ? INICIO_DE_LOS_TIEMPOS : sumarDias(desde, -(VENTANA_TENDENCIA_DIAS - 1));

  const [pesosCrudos, ultimo, eventos, items] = await Promise.all([
    listarPesos(perfil.id, desdeConCalentamiento, hoy),
    ultimoPeso(perfil.id),
    // Todos los eventos hasta hoy y no solo los del periodo: la racha mira el
    // historial completo. El recorte por periodo se hace abajo, en memoria.
    listarEventosPorRangoFecha(perfil.id, INICIO_DE_LOS_TIEMPOS, hoy),
    listarItemsConAlimentoPorRango(perfil.id, desde, hoy),
  ]);

  // --- peso ---------------------------------------------------------------

  const dentroDelPeriodo = (p: PuntoPeso) => p.fecha >= desde;

  const crudos = pesosPorDia(pesosCrudos).filter(dentroDelPeriodo);
  // La tendencia se suaviza con el calentamiento incluido y recien despues se
  // recorta al periodo; los crudos que dan la pendiente son solo los del
  // periodo. Ver pendienteDiaria() para por que van las dos series.
  const tendencia = tendenciaPeso(pesosCrudos).filter(dentroDelPeriodo);
  const proyeccion = proyectarPeso(tendencia, crudos, perfil.peso_objetivo_kg);

  const serieParaDelta = tendencia.length >= 2 ? tendencia : crudos;
  const deltaKg =
    serieParaDelta.length >= 2
      ? serieParaDelta[serieParaDelta.length - 1].peso_kg - serieParaDelta[0].peso_kg
      : null;

  // --- eventos ------------------------------------------------------------

  const todosPasados = separarPorOrigen(eventos);
  const delPeriodo = separarPorOrigen(eventos.filter((e) => e.fecha >= desde));

  const asistencia: DatosAsistencia = {
    ...resumenAsistencia(delPeriodo.deRutina),
    racha: rachaAsistencias(todosPasados.deRutina),
    desglose: desgloseAsistencia(delPeriodo.deRutina),
  };

  // Una query de sesion por entrenamiento propio. Son unos pocos por mes, y es
  // el unico camino: la sesion cuelga del evento, no al reves.
  const propiosConSesion: EntrenamientoPropio[] = await Promise.all(
    delPeriodo.propios.map(async (evento) => {
      const sesion = await obtenerSesionPorEvento(evento.id);
      if (!sesion) return { evento, sesion: null };
      if (sesion.modo === 'rutina') {
        const resumen = await obtenerResumenRutina(sesion.id);
        return {
          evento,
          sesion: {
            ...sesion,
            ...resumen,
          },
        };
      }
      return { evento, sesion };
    }),
  );
  // Del mas nuevo al mas viejo: la lista se lee de arriba hacia abajo y lo de
  // recien es lo que importa.
  const propiosOrdenados = [...propiosConSesion].reverse();

  // --- cuantos dias abarca el periodo -------------------------------------

  let diasDelPeriodo: number;
  if (dias !== null) {
    diasDelPeriodo = dias;
  } else {
    // 'todo' arranca en el primer rastro que haya: el mas viejo entre una
    // pesada, un evento y una comida. Sin nada cargado, cero.
    const primeros = [
      pesosCrudos.at(-1)?.fecha,
      eventos[0]?.fecha,
      items[0]?.fecha,
    ].filter((f): f is string => !!f);
    diasDelPeriodo = primeros.length === 0 ? 0 : diasEntre(primeros.sort()[0], hoy) + 1;
  }

  return {
    periodo,
    hoy,
    deportePrincipal: perfil.deporte_principal,
    diasDelPeriodo,
    peso: {
      actualKg: ultimo?.peso_kg ?? null,
      objetivoKg: perfil.peso_objetivo_kg,
      direccion: direccionDeseada(perfil.objetivo),
      deltaKg,
      crudos,
      tendencia,
      proyeccion,
    },
    asistencia,
    propios: { volumen: volumenPropio(propiosOrdenados), items: propiosOrdenados },
    nutricion: {
      promedio: promedioDiario(items),
      objetivo: objetivoDe(perfil, ultimo?.peso_kg ?? null),
    },
  };
}
