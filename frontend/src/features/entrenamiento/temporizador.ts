// src/features/entrenamiento/temporizador.ts
//
// La logica del temporizador de intervalos, entera y sin pantalla.
//
// La idea central: la configuracion NO se ejecuta paso a paso. Se expande una
// sola vez a una lista plana de fases con offsets acumulados desde el arranque
// (`construirPlan`), y a partir de ahi "en que fase estoy" es una busqueda
// binaria contra el tiempo transcurrido, no un contador que avanza.
//
// Eso es lo que hace que el temporizador no se desfase. Un setInterval que
// resta 1 cada segundo acumula error y, peor, se congela cuando el sistema
// pausa los timers de JS: la pantalla vuelve del bloqueo tres fases atrasada
// y sin forma de saberlo. Aca el reloj del sistema es la unica fuente de
// verdad y el intervalo solo sirve para repintar.
//
// Nada de este archivo llama a Date.now(): el instante entra por parametro.
// Asi las pruebas de scripts/probar-temporizador.mjs corren con numeros fijos.

// ---------------------------------------------------------------------------
// Configuracion
// ---------------------------------------------------------------------------

export type TipoFase = 'trabajo' | 'descanso' | 'descansoBloque';

export interface ConfigTemporizador {
  /** Cuantas veces se repite la serie entera. */
  bloques: number;
  /** Cuantas repeticiones tiene cada bloque. */
  pasadas: number;
  /** Segundos de esfuerzo. 0 = sin limite, o sea cronometro. */
  trabajoSeg: number;
  /** Segundos entre pasadas. 0 = sin descanso. */
  descansoSeg: number;
  /** Segundos entre un bloque y el siguiente. 0 = sin descanso. */
  descansoBloqueSeg: number;
}

export const CONFIG_POR_DEFECTO: ConfigTemporizador = {
  bloques: 6,
  pasadas: 8,
  trabajoSeg: 20,
  descansoSeg: 20,
  descansoBloqueSeg: 90,
};

/**
 * Topes de cada campo. Existen para que los controles +/- no puedan dejar la
 * config en un estado imposible (0 bloques) ni en uno absurdo que genere miles
 * de fases. El maximo de bloques x pasadas acota el plan a ~2000 entradas.
 */
export const LIMITES = {
  bloques: { min: 1, max: 20 },
  pasadas: { min: 1, max: 50 },
  trabajoSeg: { min: 0, max: 3600 },
  descansoSeg: { min: 0, max: 3600 },
  descansoBloqueSeg: { min: 0, max: 3600 },
} as const;

export type CampoConfig = keyof typeof LIMITES;

const acotar = (valor: number, campo: CampoConfig): number => {
  const { min, max } = LIMITES[campo];
  if (!Number.isFinite(valor)) return min;
  return Math.min(max, Math.max(min, Math.round(valor)));
};

/** Deja la config dentro de los limites. Todo lo que la edite pasa por aca. */
export function normalizarConfig(c: ConfigTemporizador): ConfigTemporizador {
  return {
    bloques: acotar(c.bloques, 'bloques'),
    pasadas: acotar(c.pasadas, 'pasadas'),
    trabajoSeg: acotar(c.trabajoSeg, 'trabajoSeg'),
    descansoSeg: acotar(c.descansoSeg, 'descansoSeg'),
    descansoBloqueSeg: acotar(c.descansoBloqueSeg, 'descansoBloqueSeg'),
  };
}

/** Cambia un campo respetando los limites. Devuelve una config nueva. */
export function ajustarConfig(
  c: ConfigTemporizador,
  campo: CampoConfig,
  valor: number,
): ConfigTemporizador {
  return { ...c, [campo]: acotar(valor, campo) };
}

/**
 * Cronometro simple: una sola pasada de trabajo sin limite. No es otra
 * pantalla ni otro modo, es lo que sale de trabajoSeg = 0. El resto de la
 * config deja de importar porque nunca se llega a una segunda fase.
 */
export function esCronometro(c: ConfigTemporizador): boolean {
  return c.trabajoSeg === 0;
}

export const CONFIG_CRONOMETRO: ConfigTemporizador = {
  bloques: 1,
  pasadas: 1,
  trabajoSeg: 0,
  descansoSeg: 0,
  descansoBloqueSeg: 0,
};

// ---------------------------------------------------------------------------
// Presets
//
// Nadie arma 6 bloques x 8 pasadas a fuerza de toques cada vez que entrena.
// Viven aca y no en la pantalla porque son configuracion, no dibujo.
// ---------------------------------------------------------------------------

export interface Preset {
  id: string;
  nombre: string;
  config: ConfigTemporizador;
}

export const PRESETS: readonly Preset[] = [
  {
    id: 'tabata',
    nombre: 'Tabata',
    config: { bloques: 1, pasadas: 8, trabajoSeg: 20, descansoSeg: 10, descansoBloqueSeg: 0 },
  },
  {
    id: 'pasadas',
    nombre: 'Pasadas',
    config: { bloques: 6, pasadas: 8, trabajoSeg: 20, descansoSeg: 20, descansoBloqueSeg: 90 },
  },
  {
    id: 'series',
    nombre: 'Series',
    config: { bloques: 4, pasadas: 1, trabajoSeg: 45, descansoSeg: 90, descansoBloqueSeg: 0 },
  },
  {
    id: 'cronometro',
    nombre: 'Cronómetro',
    config: CONFIG_CRONOMETRO,
  },
] as const;

/**
 * Que preset representa esta config, o null si no coincide con ninguno.
 *
 * El cronometro se reconoce por trabajoSeg = 0 y no por igualdad de los cinco
 * campos, a diferencia del resto. Es la misma razon por la que existe
 * esCronometro(): con el trabajo sin limite nunca se llega a una segunda fase,
 * asi que bloques, pasadas y descansos no cambian en nada la sesion. Exigir
 * igualdad estricta dejaria el chip sin marcar al entrar al cronometro desde
 * una config de 6 bloques, aunque lo que va a correr sea identico.
 */
export function presetActivo(c: ConfigTemporizador): string | null {
  if (esCronometro(c)) return 'cronometro';

  const n = normalizarConfig(c);
  const igual = PRESETS.find(
    (p) =>
      !esCronometro(p.config) &&
      p.config.bloques === n.bloques &&
      p.config.pasadas === n.pasadas &&
      p.config.trabajoSeg === n.trabajoSeg &&
      p.config.descansoSeg === n.descansoSeg &&
      // El descanso de bloque no se compara cuando hay un solo bloque: nunca
      // llega a usarse, asi que su valor no distingue una sesion de otra.
      (n.bloques === 1 || p.config.descansoBloqueSeg === n.descansoBloqueSeg),
  );
  return igual ? igual.id : null;
}

// ---------------------------------------------------------------------------
// El plan
// ---------------------------------------------------------------------------

export interface Fase {
  tipo: TipoFase;
  /** 1..bloques */
  bloque: number;
  /** 1..pasadas. En descansoBloque es la ultima pasada del bloque que cierra. */
  pasada: number;
  /** Offset desde el arranque, en ms. */
  desdeMs: number;
  /** Offset del final. null = fase abierta (cronometro). */
  hastaMs: number | null;
  /** null = fase abierta. */
  duracionMs: number | null;
}

/**
 * Expande la config a la lista de fases.
 *
 * Las tres reglas de encadenado, que son lo unico con criterio de todo esto:
 *
 *   1. Un trabajo por pasada.
 *   2. Descanso corto despues de cada trabajo SALVO en la ultima pasada del
 *      bloque: ahi lo que sigue es el descanso largo, no los dos pegados.
 *   3. Descanso de bloque al cerrar cada bloque SALVO el ultimo. La sesion
 *      siempre termina en trabajo, nunca descansando.
 *
 * Un descanso de 0 segundos no genera fase. Una fase de duracion cero seria
 * una transicion instantanea, o sea un pitido de mas y un color que parpadea.
 */
export function construirPlan(config: ConfigTemporizador): Fase[] {
  const c = normalizarConfig(config);

  // El cronometro corta antes: una sola fase abierta. Se mira trabajoSeg y no
  // bloques/pasadas porque "sin limite" no puede repetirse; si hubiera una
  // segunda pasada, no habria forma de llegar a ella.
  if (esCronometro(c)) {
    return [
      { tipo: 'trabajo', bloque: 1, pasada: 1, desdeMs: 0, hastaMs: null, duracionMs: null },
    ];
  }

  const fases: Fase[] = [];
  let cursorMs = 0;

  const agregar = (tipo: TipoFase, bloque: number, pasada: number, segundos: number) => {
    if (segundos <= 0) return;
    const duracionMs = segundos * 1000;
    fases.push({
      tipo,
      bloque,
      pasada,
      desdeMs: cursorMs,
      hastaMs: cursorMs + duracionMs,
      duracionMs,
    });
    cursorMs += duracionMs;
  };

  for (let bloque = 1; bloque <= c.bloques; bloque++) {
    for (let pasada = 1; pasada <= c.pasadas; pasada++) {
      agregar('trabajo', bloque, pasada, c.trabajoSeg);
      if (pasada < c.pasadas) agregar('descanso', bloque, pasada, c.descansoSeg);
    }
    if (bloque < c.bloques) agregar('descansoBloque', bloque, c.pasadas, c.descansoBloqueSeg);
  }

  return fases;
}

/** Duracion del plan completo en ms. null si termina en una fase abierta. */
export function duracionTotalMs(plan: Fase[]): number | null {
  const ultima = plan[plan.length - 1];
  if (!ultima) return 0;
  return ultima.hastaMs;
}

// ---------------------------------------------------------------------------
// El reloj
//
// La pausa se modela como tiempo acumulado que se resta, no parando nada. El
// unico dato que se guarda es cuando arranco: todo lo demas se deriva.
// ---------------------------------------------------------------------------

export interface Reloj {
  inicioMs: number;
  /** Instante en que se pauso, o null si esta corriendo. */
  pausadoDesdeMs: number | null;
  /** Suma de todas las pausas ya cerradas. */
  pausaAcumuladaMs: number;
}

export function iniciarReloj(ahoraMs: number): Reloj {
  return { inicioMs: ahoraMs, pausadoDesdeMs: null, pausaAcumuladaMs: 0 };
}

export function estaPausado(r: Reloj): boolean {
  return r.pausadoDesdeMs !== null;
}

export function pausarReloj(r: Reloj, ahoraMs: number): Reloj {
  if (estaPausado(r)) return r;
  return { ...r, pausadoDesdeMs: ahoraMs };
}

export function reanudarReloj(r: Reloj, ahoraMs: number): Reloj {
  if (r.pausadoDesdeMs === null) return r;
  return {
    inicioMs: r.inicioMs,
    pausadoDesdeMs: null,
    pausaAcumuladaMs: r.pausaAcumuladaMs + (ahoraMs - r.pausadoDesdeMs),
  };
}

/** Tiempo real de sesion: el reloj de pared menos lo que estuvo en pausa. */
export function transcurridoMs(r: Reloj, ahoraMs: number): number {
  const enPausa = r.pausadoDesdeMs === null ? 0 : ahoraMs - r.pausadoDesdeMs;
  return Math.max(0, ahoraMs - r.inicioMs - r.pausaAcumuladaMs - enPausa);
}

// ---------------------------------------------------------------------------
// Donde estamos
// ---------------------------------------------------------------------------

export interface Posicion {
  /** Indice en el plan, o -1 si ya termino. */
  indice: number;
  fase: Fase | null;
  /** ms que faltan para el proximo cambio. null en una fase abierta. */
  restanteMs: number | null;
  /** ms que lleva corrida la fase actual. Es lo que muestra el cronometro. */
  llevaMs: number;
  terminado: boolean;
}

const TERMINADO: Posicion = {
  indice: -1,
  fase: null,
  restanteMs: null,
  llevaMs: 0,
  terminado: true,
};

/**
 * Que fase corresponde al tiempo transcurrido. Binaria y no lineal porque
 * corre en cada repintado y el plan puede tener ~2000 fases.
 *
 * Es total a proposito: contesta para 0, para un salto de tres fases despues
 * de que el sistema congelo la app, y para un transcurrido mayor que el plan.
 * Quien la llama nunca tiene que preguntarse si el valor es alcanzable.
 */
export function posicionEn(plan: Fase[], transcurrido: number): Posicion {
  if (plan.length === 0) return TERMINADO;

  const t = Math.max(0, transcurrido);
  const total = duracionTotalMs(plan);
  if (total !== null && t >= total) return TERMINADO;

  let bajo = 0;
  let alto = plan.length - 1;
  while (bajo < alto) {
    const medio = (bajo + alto + 1) >> 1;
    if (plan[medio].desdeMs <= t) bajo = medio;
    else alto = medio - 1;
  }

  const fase = plan[bajo];
  return {
    indice: bajo,
    fase,
    restanteMs: fase.hastaMs === null ? null : fase.hastaMs - t,
    llevaMs: t - fase.desdeMs,
    terminado: false,
  };
}

// ---------------------------------------------------------------------------
// Texto
// ---------------------------------------------------------------------------

export const ETIQUETA_FASE: Record<TipoFase, string> = {
  trabajo: 'Trabajo',
  descanso: 'Descanso',
  descansoBloque: 'Descanso de bloque',
};

/**
 * Segundos que se muestran de una cuenta regresiva. Hacia ARRIBA: con 19,2 s
 * restantes todavia se lee "20", y el 0 aparece recien cuando la fase termino.
 * Al reves, el numero arrancaria en 19 y la ultima cuenta duraria un parpadeo.
 */
export function segundosRestantes(ms: number): number {
  return Math.max(0, Math.ceil(ms / 1000));
}

/** Segundos de una cuenta hacia arriba. Hacia abajo, para que arranque en 0. */
export function segundosTranscurridos(ms: number): number {
  return Math.max(0, Math.floor(ms / 1000));
}

/** "45", "1:05" o "1:02:05". Sin minutos de relleno abajo del minuto. */
export function formatearSegundos(segundos: number): string {
  const s = Math.max(0, Math.floor(segundos));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const seg = s % 60;
  const dos = (n: number) => String(n).padStart(2, '0');

  if (h > 0) return `${h}:${dos(m)}:${dos(seg)}`;
  if (m > 0) return `${m}:${dos(seg)}`;
  return String(seg);
}

/**
 * "Bloque 2 de 6 · Pasada 3 de 8".
 *
 * Con un solo bloque el contador de bloques no dice nada y se omite; con una
 * sola pasada, tampoco. El cronometro se queda sin linea, que es lo correcto:
 * no hay estructura que contar.
 */
export function etiquetaProgreso(fase: Fase, config: ConfigTemporizador): string {
  const partes: string[] = [];
  if (config.bloques > 1) partes.push(`Bloque ${fase.bloque} de ${config.bloques}`);
  if (config.pasadas > 1) partes.push(`Pasada ${fase.pasada} de ${config.pasadas}`);
  return partes.join(' · ');
}

/** "38 min en total", "1 h 05 min en total" o "45 s en total". */
export function resumenPlan(config: ConfigTemporizador): string {
  if (esCronometro(config)) return 'Sin límite, hasta que lo pares';

  const total = duracionTotalMs(construirPlan(config));
  if (total === null || total === 0) return 'Sin nada que hacer';

  const seg = Math.round(total / 1000);
  if (seg < 60) return `${seg} s en total`;

  const min = Math.round(seg / 60);
  if (min < 60) return `${min} min en total`;

  return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min en total`;
}
