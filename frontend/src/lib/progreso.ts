// src/lib/progreso.ts
//
// Las cuentas de la pantalla de Progreso que no son de peso ni de nutricion:
// asistencia, racha y volumen propio. La tendencia de peso y los promedios de
// comida estan en lib/nutricion.ts, con el resto de su dominio.
//
// LA DISTINCION QUE ORGANIZA TODO ESTE ARCHIVO es rutina_id:
//
//   rutina_id NOT NULL -> el club, el gimnasio. Un compromiso que YA EXISTIA y
//   que se cumplio o no. Ahi un porcentaje significa algo, porque hay un
//   denominador que no lo puso el usuario.
//
//   rutina_id IS NULL  -> lo que arranco el usuario por su cuenta. NO lleva
//   porcentaje: nadie se lo agendo, asi que no hay contra que comparar. Es
//   volumen, no cumplimiento. Un porcentaje aca seria inventarle una meta a
//   alguien que hizo de mas.
//
// Los tipos de entrada son estructurales a proposito: piden lo minimo que
// necesitan y no importan db/schema. Una EventoRow y una SesionEntrenamientoRow
// encajan sin conversion, y el archivo queda puro y compilable en cualquier
// lado. Es el mismo criterio de IntensidadSesion en features/entrenamiento/
// temporizador.ts.

/** Lo que estas cuentas necesitan de un evento. Una EventoRow encaja. */
export interface EventoResumen {
  id: string;
  tipo: string;
  /** ISO 8601 con offset local. */
  fecha_hora_inicio: string;
  /** 'YYYY-MM-DD', la columna generada. */
  fecha: string;
  duracion_estimada_min: number | null;
  /** SQLite no tiene booleano: 0 o 1. */
  completado: number;
  respondido: number;
  rutina_id: string | null;
  modo_entrenamiento?: 'pasadas' | 'cronometro' | 'rutina' | null;
}

/** Lo que estas cuentas necesitan de una sesion. Una SesionEntrenamientoRow encaja. */
export interface SesionResumen {
  modo?: 'pasadas' | 'cronometro' | 'rutina';
  bloques?: number | null;
  pasadas?: number | null;
  trabajo_seg?: number | null;
  descanso_seg?: number | null;
  descanso_bloque_seg?: number | null;
  bloques_completados: number | null;
  pasadas_completadas: number | null;
  duracion_real_seg: number | null;
  distancia_km: number | null;
  ejercicios_count?: number;
  series_count?: number;
  series_con_peso_count?: number;
  volumen_kg?: number;
}

/** Un entrenamiento propio con su detalle, si es que se corrio con temporizador. */
export interface EntrenamientoPropio {
  evento: EventoResumen;
  /** null si el evento se cargo a mano y nunca paso por el temporizador. */
  sesion: SesionResumen | null;
}

/**
 * Un evento ya ocurrio si su hora de inicio ya paso.
 *
 * Se compara con Date y no con los strings crudos: `fecha_hora_inicio` lleva
 * offset local, y dos eventos con offsets distintos —alguien que viajo— no se
 * ordenan bien como texto.
 */
function yaPaso(e: EventoResumen, ahora: Date): boolean {
  return new Date(e.fecha_hora_inicio).getTime() <= ahora.getTime();
}

/**
 * Parte los eventos en los dos grupos que la pantalla trata distinto, y deja
 * afuera lo que todavia no ocurrio: un entrenamiento agendado para el jueves
 * no es todavia ni una asistencia ni una falta.
 *
 * Sale del mas viejo al mas nuevo.
 */
export function separarPorOrigen(
  eventos: EventoResumen[],
  ahora: Date = new Date(),
): { deRutina: EventoResumen[]; propios: EventoResumen[] } {
  const pasados = eventos
    .filter((e) => yaPaso(e, ahora))
    .sort((a, b) => new Date(a.fecha_hora_inicio).getTime() - new Date(b.fecha_hora_inicio).getTime());

  return {
    deRutina: pasados.filter((e) => e.rutina_id !== null),
    // Propios y CUMPLIDOS: un evento suelto que el usuario cargo y no hizo no
    // suma volumen. Del lado de la rutina, en cambio, el no-cumplido es medio
    // dato, por eso alla no se filtra.
    propios: pasados.filter((e) => e.rutina_id === null && e.completado === 1),
  };
}

export interface ResumenAsistencia {
  /** Eventos de rutina que se cumplieron. */
  fue: number;
  /** Los que el usuario ya contesto, de un lado o del otro. Es el denominador. */
  respondidos: number;
  /**
   * Los que ya pasaron y siguen mudos. NO entran en el porcentaje: un evento
   * sin responder no es una falta. Se muestra aparte y en chico, porque
   * explica por que la cuenta no da con lo que hay en el calendario.
   */
  sinResponder: number;
  /** 0 a 1. Cero cuando no hay nada respondido, para no dividir por cero. */
  proporcion: number;
}

/**
 * "Fuiste a 9 de 11".
 *
 * El denominador son los RESPONDIDOS y no todos los eventos pasados. La base
 * separa "no fui" de "todavia no conteste" con la columna `respondido`, y esa
 * distincion existe justamente para esto: contar un evento mudo como falta es
 * castigar el silencio, y sacarlo sin decirlo infla el porcentaje.
 */
export function resumenAsistencia(deRutina: EventoResumen[]): ResumenAsistencia {
  const respondidos = deRutina.filter((e) => e.respondido === 1);
  const fue = respondidos.filter((e) => e.completado === 1).length;

  return {
    fue,
    respondidos: respondidos.length,
    sinResponder: deRutina.length - respondidos.length,
    proporcion: respondidos.length === 0 ? 0 : fue / respondidos.length,
  };
}

export interface DesgloseAsistencia {
  entrenamiento: ResumenAsistencia | null;
  gimnasio: ResumenAsistencia | null;
}

/**
 * Desglosa la asistencia de rutina en deporte (tipo 'entrenamiento') y 'gimnasio'.
 *
 * Devuelve null para el tipo que no tenga eventos de rutina en el conjunto,
 * para no dibujar barras vacias si el usuario solo tiene rutinas de uno de los dos.
 *
 * 'partido' y 'competencia' se excluyen: son eventos puntuales, no rutina.
 */
export function desgloseAsistencia(deRutina: EventoResumen[]): DesgloseAsistencia {
  const entrenamientos = deRutina.filter((e) => e.tipo === 'entrenamiento');
  const gimnasios = deRutina.filter((e) => e.tipo === 'gimnasio');

  return {
    entrenamiento: entrenamientos.length > 0 ? resumenAsistencia(entrenamientos) : null,
    gimnasio: gimnasios.length > 0 ? resumenAsistencia(gimnasios) : null,
  };
}

/**
 * Asistencias seguidas hasta hoy, contando para atras desde la ultima.
 *
 * OJO: esta es la unica cuenta de la pantalla que NO se recorta por el periodo
 * elegido, y es a proposito. Una racha es un hecho corriente, no una medicion
 * de una ventana: con "Semana" seleccionado, una racha real de doce se
 * mostraria como tres, y eso es peor que la inconsistencia. Pasarle solo los
 * eventos del periodo devuelve un numero mas chico y equivocado.
 *
 * Los eventos sin responder cortan la cuenta igual que una falta: no se puede
 * afirmar que la racha sigue viva sobre un evento del que no se sabe nada.
 * Entra `deRutina` del mas viejo al mas nuevo, como lo devuelve
 * separarPorOrigen().
 */
export function rachaAsistencias(deRutina: EventoResumen[]): number {
  let racha = 0;
  for (let i = deRutina.length - 1; i >= 0; i--) {
    const e = deRutina[i];
    if (e.respondido !== 1 || e.completado !== 1) break;
    racha++;
  }
  return racha;
}

export interface VolumenPropio {
  sesiones: number;
  /** Segundos de entrenamiento. Se formatea al mostrar, no aca. */
  segundos: number;
  /** Kilometros sumados. Solo los aportan las sesiones que tienen distancia. */
  km: number;
  /** Cuantas sesiones aportaron km. Sin esto, un 0 no se distingue de "nadie cargo distancia". */
  sesionesConKm: number;
}

/**
 * "3 sesiones · 2,5 horas · 8,4 km". Un contador, no un cumplimiento.
 *
 * La duracion sale de la sesion real cuando existe, y recien si no hay sesion
 * se cae a la estimada del evento: lo que duro de verdad le gana siempre a lo
 * que se habia planeado. Un evento propio cargado a mano y sin temporizador no
 * tiene mas que la estimacion, y sigue siendo mejor que contarlo como cero.
 */
export function volumenPropio(items: EntrenamientoPropio[]): VolumenPropio {
  let segundos = 0;
  let km = 0;
  let sesionesConKm = 0;

  for (const { evento, sesion } of items) {
    if (sesion && sesion.duracion_real_seg && sesion.duracion_real_seg > 0) {
      segundos += sesion.duracion_real_seg;
    } else {
      segundos += (evento.duracion_estimada_min ?? 0) * 60;
    }

    if (sesion?.distancia_km) {
      km += sesion.distancia_km;
      sesionesConKm++;
    }
  }

  return { sesiones: items.length, segundos, km, sesionesConKm };
}

// ---------------------------------------------------------------------------
// Geometria del grafico
//
// Va aca y no en el componente por lo mismo que todo lo demas: es una cuenta,
// se puede equivocar en silencio y se puede probar.
// ---------------------------------------------------------------------------

export interface Dominio {
  min: number;
  max: number;
}

/**
 * El rango vertical del grafico de peso.
 *
 * Dos reglas:
 *
 * 1. La linea del objetivo entra en el dominio si esta cerca. Si esta a veinte
 *    kilos, NO: meterla aplastaria la serie contra un borde y la variacion
 *    real —que es de uno o dos kilos— se veria como una linea recta. Cuando no
 *    entra, la pantalla no dibuja la linea punteada.
 * 2. Un margen minimo alrededor de la serie. Sin el, alguien con tres pesadas
 *    casi iguales veria un dientes de sierra dramatico de 200 gramos.
 */
export function dominioPeso(
  valores: number[],
  objetivoKg: number | null,
  margenMinimoKg: number = 1,
): Dominio {
  if (valores.length === 0) return { min: 0, max: 1 };

  let min = Math.min(...valores);
  let max = Math.max(...valores);

  // El objetivo entra solo si no mas que duplica el alto del grafico.
  if (objetivoKg !== null) {
    const alto = Math.max(max - min, margenMinimoKg);
    if (objetivoKg >= min - alto && objetivoKg <= max + alto) {
      min = Math.min(min, objetivoKg);
      max = Math.max(max, objetivoKg);
    }
  }

  const margen = Math.max((max - min) * 0.15, margenMinimoKg / 2);
  return { min: min - margen, max: max + margen };
}

/** Si el objetivo quedo dentro del dominio, o sea si se puede dibujar. */
export function objetivoVisible(dominio: Dominio, objetivoKg: number | null): boolean {
  return objetivoKg !== null && objetivoKg >= dominio.min && objetivoKg <= dominio.max;
}
