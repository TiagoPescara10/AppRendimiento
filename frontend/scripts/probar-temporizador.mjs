// Pruebas de la logica del temporizador de intervalos, contra el modulo REAL
// de src/features/entrenamiento/.
//
//   node scripts/probar-temporizador.mjs
//
// Va aparte de probar-db.mjs porque no toca la base: no necesita shims ni
// sqlite, solo compilar un archivo y llamar funciones puras. Ese es justamente
// el motivo de que el calculo de fases no viva en la pantalla.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, '..');

// --- compilar a CommonJS en un temporal ------------------------------------

const tmp = mkdtempSync(join(tmpdir(), 'probar-temporizador-'));
const build = join(tmp, 'build');

const tsconfig = join(tmp, 'tsconfig.json');
writeFileSync(
  tsconfig,
  JSON.stringify({
    compilerOptions: {
      target: 'ES2022',
      module: 'commonjs',
      moduleResolution: 'node',
      // Mismo motivo que en probar-db.mjs: TS 6 convirtio en error el
      // deprecado de node10 y la resolucion se mantiene a proposito.
      ignoreDeprecations: '6.0',
      esModuleInterop: true,
      skipLibCheck: true,
      strict: true,
      outDir: build,
      rootDir: join(RAIZ, 'src'),
      types: [],
    },
    // Solo temporizador.ts. sonidos.ts y los componentes quedan afuera porque
    // importan expo-audio y React, que no se pueden cargar en node.
    include: [join(RAIZ, 'src/features/entrenamiento/temporizador.ts')],
  }),
);

try {
  execFileSync('npx', ['tsc', '-p', tsconfig], { cwd: RAIZ, stdio: 'pipe' });
} catch (e) {
  console.error('tsc fallo al compilar el temporizador:\n' + (e.stdout?.toString() ?? e.message));
  process.exit(1);
}

const req = createRequire(join(build, 'x.cjs'));
const T = req('./features/entrenamiento/temporizador.js');

// --- corredor --------------------------------------------------------------

let ok = 0;
const fallos = [];

function prueba(nombre, fn) {
  try {
    fn();
    ok++;
    console.log('  +', nombre);
  } catch (e) {
    fallos.push(`${nombre}: ${e.message}`);
    console.log('  -', nombre);
  }
}

function igual(actual, esperado, que) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(esperado);
  if (a !== b) throw new Error(`${que}: esperaba ${b}, dio ${a}`);
}

const config = (extra) => ({
  bloques: 1,
  pasadas: 1,
  trabajoSeg: 20,
  descansoSeg: 20,
  descansoBloqueSeg: 90,
  ...extra,
});

// --- construccion del plan -------------------------------------------------

console.log('\nel plan:');

prueba('una sola pasada es un solo trabajo, sin descanso colgando al final', () => {
  const plan = T.construirPlan(config());
  igual(plan.length, 1, 'cantidad de fases');
  igual(plan[0].tipo, 'trabajo', 'tipo');
  igual(plan[0].desdeMs, 0, 'arranca en cero');
  igual(plan[0].hastaMs, 20000, 'termina a los 20 s');
});

prueba('entre pasadas hay descanso, pero no despues de la ultima', () => {
  const plan = T.construirPlan(config({ pasadas: 3 }));
  igual(
    plan.map((f) => f.tipo),
    ['trabajo', 'descanso', 'trabajo', 'descanso', 'trabajo'],
    'secuencia',
  );
});

prueba('entre bloques va el descanso largo, no el corto', () => {
  const plan = T.construirPlan(config({ bloques: 2, pasadas: 2 }));
  igual(
    plan.map((f) => f.tipo),
    [
      'trabajo',
      'descanso',
      'trabajo',
      'descansoBloque',
      'trabajo',
      'descanso',
      'trabajo',
    ],
    'secuencia',
  );
  // La diferencia entre los dos descansos es todo el concepto de "bloque":
  // si fueran iguales, los bloques no significarian nada.
  igual(plan[1].duracionMs, 20000, 'el descanso entre pasadas');
  igual(plan[3].duracionMs, 90000, 'el descanso entre bloques');
});

prueba('la sesion siempre termina en trabajo', () => {
  for (const c of [
    config({ bloques: 3, pasadas: 4 }),
    config({ bloques: 1, pasadas: 8 }),
    config({ bloques: 6, pasadas: 1 }),
  ]) {
    const plan = T.construirPlan(c);
    igual(plan[plan.length - 1].tipo, 'trabajo', `ultimo de ${c.bloques}x${c.pasadas}`);
  }
});

prueba('un descanso en cero no genera fase', () => {
  const plan = T.construirPlan(config({ pasadas: 3, descansoSeg: 0 }));
  igual(
    plan.map((f) => f.tipo),
    ['trabajo', 'trabajo', 'trabajo'],
    'secuencia sin descansos',
  );
  igual(plan[1].desdeMs, 20000, 'el segundo trabajo arranca pegado al primero');
});

prueba('con un solo bloque no hay descanso de bloque aunque este configurado', () => {
  const plan = T.construirPlan(config({ bloques: 1, pasadas: 2, descansoBloqueSeg: 90 }));
  igual(
    plan.some((f) => f.tipo === 'descansoBloque'),
    false,
    'no aparece descansoBloque',
  );
});

prueba('los offsets son continuos: cada fase arranca donde termino la anterior', () => {
  const plan = T.construirPlan(config({ bloques: 3, pasadas: 4 }));
  for (let i = 1; i < plan.length; i++) {
    igual(plan[i].desdeMs, plan[i - 1].hastaMs, `continuidad en la fase ${i}`);
  }
});

prueba('bloques y pasadas quedan numerados de 1 a N', () => {
  const plan = T.construirPlan(config({ bloques: 2, pasadas: 3 }));
  const trabajos = plan.filter((f) => f.tipo === 'trabajo');
  igual(
    trabajos.map((f) => `${f.bloque}.${f.pasada}`),
    ['1.1', '1.2', '1.3', '2.1', '2.2', '2.3'],
    'numeracion',
  );
});

prueba('el ejemplo de 6 bloques x 8 pasadas da 2250 s', () => {
  // 8 trabajos + 7 descansos = 300 s por bloque; x6 = 1800; + 5 descansos de
  // bloque de 90 = 450. Total 2250 s, o sea 38 min.
  const c = { bloques: 6, pasadas: 8, trabajoSeg: 20, descansoSeg: 20, descansoBloqueSeg: 90 };
  igual(T.duracionTotalMs(T.construirPlan(c)), 2250000, 'duracion total');
  igual(T.resumenPlan(c), '38 min en total', 'resumen');
});

// --- cronometro ------------------------------------------------------------

console.log('\nel cronometro:');

prueba('trabajo en cero es una unica fase abierta', () => {
  const plan = T.construirPlan(config({ trabajoSeg: 0, bloques: 6, pasadas: 8 }));
  igual(plan.length, 1, 'una sola fase');
  igual(plan[0].tipo, 'trabajo', 'tipo');
  igual(plan[0].hastaMs, null, 'sin final');
  igual(T.duracionTotalMs(plan), null, 'duracion total desconocida');
});

prueba('la fase abierta nunca termina, por lejos que se mire', () => {
  const plan = T.construirPlan(T.CONFIG_CRONOMETRO);
  const pos = T.posicionEn(plan, 5 * 60 * 60 * 1000);
  igual(pos.terminado, false, 'no termino');
  igual(pos.restanteMs, null, 'no hay restante');
  igual(pos.llevaMs, 18000000, 'lleva las 5 horas');
});

prueba('el cronometro no muestra linea de bloque ni de pasada', () => {
  const plan = T.construirPlan(T.CONFIG_CRONOMETRO);
  igual(T.etiquetaProgreso(plan[0], T.CONFIG_CRONOMETRO), '', 'etiqueta vacia');
});

// --- posicion --------------------------------------------------------------

console.log('\ndonde estamos:');

const planChico = T.construirPlan({
  bloques: 2,
  pasadas: 2,
  trabajoSeg: 10,
  descansoSeg: 5,
  descansoBloqueSeg: 30,
});
// trabajo 0-10 | descanso 10-15 | trabajo 15-25 | bloque 25-55 | trabajo 55-65
// | descanso 65-70 | trabajo 70-80

prueba('el instante cero cae en la primera fase', () => {
  const pos = T.posicionEn(planChico, 0);
  igual(pos.indice, 0, 'indice');
  igual(pos.restanteMs, 10000, 'restante');
  igual(pos.llevaMs, 0, 'lleva');
});

prueba('el borde exacto entra en la fase que empieza, no en la que termina', () => {
  igual(T.posicionEn(planChico, 10000).indice, 1, 'a los 10 s justos ya es descanso');
  igual(T.posicionEn(planChico, 9999).indice, 0, 'un ms antes sigue siendo trabajo');
});

prueba('a mitad del descanso de bloque contesta bien', () => {
  const pos = T.posicionEn(planChico, 40000);
  igual(pos.fase.tipo, 'descansoBloque', 'tipo');
  igual(pos.fase.bloque, 1, 'cierra el bloque 1');
  igual(pos.restanteMs, 15000, 'restante');
});

prueba('pasado el final, terminado', () => {
  igual(T.posicionEn(planChico, 80000).terminado, true, 'justo al final');
  igual(T.posicionEn(planChico, 999999).terminado, true, 'mucho despues');
  igual(T.posicionEn(planChico, 79999).terminado, false, 'un ms antes, no');
});

prueba('un salto largo cae donde corresponde, no una fase por vez', () => {
  // Es el caso del sistema congelando los timers: se pasa de 2 s a 61 s de un
  // tiron y la respuesta tiene que ser la fase real, no la siguiente.
  const pos = T.posicionEn(planChico, 61000);
  igual(pos.indice, 4, 'indice');
  igual(pos.fase.tipo, 'trabajo', 'tipo');
  igual(pos.fase.bloque, 2, 'bloque');
  igual(pos.fase.pasada, 1, 'pasada');
});

prueba('un plan vacio esta terminado y no rompe', () => {
  igual(T.posicionEn([], 0).terminado, true, 'terminado');
  igual(T.posicionEn([], 0).fase, null, 'sin fase');
});

prueba('un transcurrido negativo se trata como cero', () => {
  igual(T.posicionEn(planChico, -5000).indice, 0, 'indice');
});

// --- reloj -----------------------------------------------------------------

console.log('\nel reloj:');

prueba('sin pausas, transcurrido es la resta contra el inicio', () => {
  const r = T.iniciarReloj(1000);
  igual(T.transcurridoMs(r, 1000), 0, 'al arrancar');
  igual(T.transcurridoMs(r, 31000), 30000, 'a los 30 s');
});

prueba('la pausa congela el transcurrido mientras dura', () => {
  const r = T.pausarReloj(T.iniciarReloj(0), 10000);
  igual(T.transcurridoMs(r, 10000), 10000, 'al pausar');
  igual(T.transcurridoMs(r, 60000), 10000, 'medio minuto despues, igual');
});

prueba('al reanudar, la pausa se descuenta para siempre', () => {
  let r = T.iniciarReloj(0);
  r = T.pausarReloj(r, 10000);
  r = T.reanudarReloj(r, 40000); // 30 s en pausa
  igual(T.transcurridoMs(r, 40000), 10000, 'justo al reanudar');
  igual(T.transcurridoMs(r, 50000), 20000, '10 s despues');
  igual(r.pausaAcumuladaMs, 30000, 'pausa acumulada');
});

prueba('varias pausas se suman', () => {
  let r = T.iniciarReloj(0);
  r = T.reanudarReloj(T.pausarReloj(r, 5000), 15000); // 10 s
  r = T.reanudarReloj(T.pausarReloj(r, 20000), 25000); // 5 s mas
  igual(r.pausaAcumuladaMs, 15000, 'acumulado');
  igual(T.transcurridoMs(r, 30000), 15000, 'transcurrido real');
});

prueba('pausar dos veces seguidas no adelanta el reloj', () => {
  const r = T.pausarReloj(T.iniciarReloj(0), 10000);
  igual(T.pausarReloj(r, 20000).pausadoDesdeMs, 10000, 'sigue la primera pausa');
});

prueba('reanudar sin estar pausado no hace nada', () => {
  const r = T.iniciarReloj(0);
  igual(T.reanudarReloj(r, 10000).pausaAcumuladaMs, 0, 'sin acumular');
});

prueba('un reloj adelantado hacia atras no da transcurrido negativo', () => {
  igual(T.transcurridoMs(T.iniciarReloj(10000), 5000), 0, 'acotado en cero');
});

// --- limites ---------------------------------------------------------------

console.log('\nlos limites:');

prueba('no se puede bajar de un bloque ni de una pasada', () => {
  igual(T.ajustarConfig(config(), 'bloques', 0).bloques, 1, 'bloques');
  igual(T.ajustarConfig(config(), 'pasadas', -3).pasadas, 1, 'pasadas');
});

prueba('los segundos no bajan de cero ni pasan del tope', () => {
  igual(T.ajustarConfig(config(), 'trabajoSeg', -5).trabajoSeg, 0, 'trabajo al piso');
  igual(T.ajustarConfig(config(), 'descansoSeg', 99999).descansoSeg, 3600, 'descanso al techo');
});

prueba('normalizarConfig redondea y descarta basura', () => {
  const c = T.normalizarConfig({
    bloques: 2.7,
    pasadas: NaN,
    trabajoSeg: 20.2,
    descansoSeg: 20,
    descansoBloqueSeg: 90,
  });
  igual(c.bloques, 3, 'redondeo');
  igual(c.pasadas, 1, 'NaN al minimo');
  igual(c.trabajoSeg, 20, 'redondeo de segundos');
});

// --- texto -----------------------------------------------------------------

console.log('\nel texto:');

prueba('el formato de reloj no pone minutos de relleno abajo del minuto', () => {
  igual(T.formatearSegundos(0), '0', 'cero');
  igual(T.formatearSegundos(45), '45', '45 s');
  igual(T.formatearSegundos(60), '1:00', 'un minuto');
  igual(T.formatearSegundos(65), '1:05', 'con segundos');
  igual(T.formatearSegundos(3725), '1:02:05', 'con horas');
});

prueba('la cuenta regresiva redondea hacia arriba y la de subida hacia abajo', () => {
  // Con 19,2 s restantes todavia se lee 20: el 0 aparece recien al terminar.
  igual(T.segundosRestantes(19200), 20, 'restante');
  igual(T.segundosRestantes(1), 1, 'el ultimo ms todavia muestra 1');
  igual(T.segundosRestantes(0), 0, 'cero');
  igual(T.segundosRestantes(-50), 0, 'nunca negativo');
  // Y la de subida arranca en 0, no en 1.
  igual(T.segundosTranscurridos(999), 0, 'transcurrido');
  igual(T.segundosTranscurridos(1000), 1, 'al segundo');
});

prueba('la linea de progreso omite lo que tiene un solo valor', () => {
  const plan = T.construirPlan(config({ bloques: 2, pasadas: 3 }));
  const c2 = config({ bloques: 2, pasadas: 3 });
  igual(T.etiquetaProgreso(plan[0], c2), 'Bloque 1 de 2 · Pasada 1 de 3', 'los dos');

  const c1 = config({ bloques: 1, pasadas: 3 });
  igual(T.etiquetaProgreso(T.construirPlan(c1)[0], c1), 'Pasada 1 de 3', 'sin bloques');
});

prueba('el resumen se adapta a la escala', () => {
  igual(T.resumenPlan(config({ trabajoSeg: 45 })), '45 s en total', 'segundos');
  // 10 trabajos de 30 + 9 descansos de 20 = 480 s.
  igual(T.resumenPlan(config({ pasadas: 10, trabajoSeg: 30 })), '8 min en total', 'minutos');
  // 10 bloques de (10x40 + 9x20) = 5800, mas 9 descansos de bloque = 6610 s.
  igual(
    T.resumenPlan(config({ bloques: 10, pasadas: 10, trabajoSeg: 40, descansoSeg: 20 })),
    '1 h 50 min en total',
    'horas',
  );
  igual(T.resumenPlan(T.CONFIG_CRONOMETRO), 'Sin límite, hasta que lo pares', 'cronometro');
});

// --- intensidad ------------------------------------------------------------

console.log('\nla intensidad deducida:');

prueba('sale del ratio trabajo/descanso', () => {
  // Menos descanso que trabajo no te deja recuperar.
  igual(T.intensidadDe(config({ trabajoSeg: 40, descansoSeg: 20 })), 'alta', 'descanso < trabajo');
  igual(T.intensidadDe(config({ trabajoSeg: 30, descansoSeg: 30 })), 'media', 'descanso = trabajo');
  igual(T.intensidadDe(config({ trabajoSeg: 20, descansoSeg: 60 })), 'baja', 'descanso > trabajo');
});

prueba('el cronometro es media y no baja', () => {
  // Sin el corte por esCronometro, trabajo = 0 haria "descanso >= trabajo" y
  // caeria en baja. No hay estructura de la cual deducir nada: media.
  igual(T.intensidadDe(T.CONFIG_CRONOMETRO), 'media', 'cronometro puro');
  igual(
    T.intensidadDe(config({ trabajoSeg: 0, descansoSeg: 30 })),
    'media',
    'cronometro con descanso cargado igual da media',
  );
});

prueba('los presets dan lo que se espera', () => {
  const de = (id) => T.intensidadDe(T.PRESETS.find((p) => p.id === id).config);
  igual(de('tabata'), 'alta', 'tabata: 20 de trabajo y 10 de descanso');
  igual(de('pasadas'), 'media', 'pasadas: 20 y 20');
  igual(de('series'), 'baja', 'series: 45 y 90');
  igual(de('cronometro'), 'media', 'cronometro');
});

// --- progreso --------------------------------------------------------------

console.log('\nlo que se completo:');

prueba('un plan corrido entero cuenta todas sus pasadas', () => {
  // 2 bloques x 3 pasadas de 20 s, descansos de 10, descanso de bloque de 60.
  const c = config({ bloques: 2, pasadas: 3, trabajoSeg: 20, descansoSeg: 10, descansoBloqueSeg: 60 });
  const plan = T.construirPlan(c);
  const total = T.duracionTotalMs(plan);

  const p = T.progresoEn(plan, total);
  igual(p.bloquesCompletados, 2, 'bloques');
  // TOTAL de la sesion, no del ultimo bloque: 2 x 3 = 6, no 3.
  igual(p.pasadasCompletadas, 6, 'pasadas totales');
});

prueba('a mitad de camino cuenta solo lo terminado', () => {
  const c = config({ bloques: 2, pasadas: 3, trabajoSeg: 20, descansoSeg: 10, descansoBloqueSeg: 60 });
  const plan = T.construirPlan(c);

  igual(T.progresoEn(plan, 0), { bloquesCompletados: 0, pasadasCompletadas: 0 }, 'sin empezar');

  // El primer trabajo termina a los 20 s justos.
  igual(T.progresoEn(plan, 19999).pasadasCompletadas, 0, 'un ms antes no cuenta');
  igual(T.progresoEn(plan, 20000).pasadasCompletadas, 1, 'al cerrar si');

  // Bloque 1 completo: 3x20 + 2x10 = 80 s. Mas el descanso de bloque, 140 s.
  const b1 = T.progresoEn(plan, 80000);
  igual(b1.bloquesCompletados, 1, 'un bloque cerrado');
  igual(b1.pasadasCompletadas, 3, 'tres pasadas');

  // Primera pasada del bloque 2: 140 + 20 = 160 s.
  const b2 = T.progresoEn(plan, 160000);
  igual(b2.bloquesCompletados, 2, 'el segundo bloque ya cuenta con una pasada');
  igual(b2.pasadasCompletadas, 4, 'cuatro pasadas en total');
});

prueba('el cronometro cuenta su fase abierta como hecha', () => {
  // No tiene final propio: pararlo ES terminarlo. Si se exigiera hastaMs, una
  // sesion de cronometro se guardaria siempre con 0 pasadas.
  const plan = T.construirPlan(T.CONFIG_CRONOMETRO);
  igual(T.progresoEn(plan, 600000), { bloquesCompletados: 1, pasadasCompletadas: 1 }, '10 min');
  igual(T.progresoEn(plan, 0), { bloquesCompletados: 1, pasadasCompletadas: 1 }, 'parado al toque');
});

prueba('los descansos no cuentan como pasadas', () => {
  const c = config({ pasadas: 2, trabajoSeg: 20, descansoSeg: 3600 });
  const plan = T.construirPlan(c);
  // A los 30 s: primer trabajo cerrado y adentro del descanso largo.
  igual(T.progresoEn(plan, 30000).pasadasCompletadas, 1, 'solo el trabajo');
});

// --- distancia -------------------------------------------------------------

console.log('\nla distancia escrita a mano:');

prueba('la coma y el punto valen lo mismo', () => {
  igual(T.parsearDistancia('6,2'), 6.2, 'con coma');
  igual(T.parsearDistancia('6.2'), 6.2, 'con punto');
  igual(T.parsearDistancia('  6,2  '), 6.2, 'con espacios alrededor');
  igual(T.parsearDistancia('10'), 10, 'entero');
  igual(T.parsearDistancia('0,5'), 0.5, 'menos de un km');
});

prueba('lo que no sirve sale por null y no por excepcion', () => {
  igual(T.parsearDistancia(''), null, 'vacio');
  igual(T.parsearDistancia('   '), null, 'solo espacios');
  igual(T.parsearDistancia('abc'), null, 'texto');
  igual(T.parsearDistancia('0'), null, 'cero');
  igual(T.parsearDistancia('0,0'), null, 'cero con decimales');
  igual(T.parsearDistancia('-3'), null, 'negativo');
  igual(T.parsearDistancia('1,2,3'), null, 'dos separadores');
});

// --- ritmo -----------------------------------------------------------------

console.log('\nel ritmo:');

prueba('min/km es el numero principal', () => {
  // 6,2 km en 45 min = 2700 s. 2700 / 6,2 = 435,48 s/km -> 7:15.
  const r = T.calcularRitmo(6.2, 2700);
  igual(r.ritmoTexto, '7:15', 'ritmo');
  igual(r.velocidadTexto, '8,3', 'velocidad');
});

prueba('el redondeo no puede producir un :60', () => {
  // 7 min 59,6 s por km. Redondear los segundos sueltos daria "7:60".
  const r = T.calcularRitmo(1, 479.6);
  igual(r.ritmoTexto, '8:00', 'rueda al minuto siguiente');
});

prueba('ritmos redondos y de mas de una hora por km', () => {
  igual(T.calcularRitmo(10, 3000).ritmoTexto, '5:00', '10 km en 50 min');
  igual(T.calcularRitmo(1, 60).ritmoTexto, '1:00', 'un km en un minuto');
  // No se corta en 59: un ritmo de caminata muy lenta sigue siendo legible.
  igual(T.calcularRitmo(1, 3900).ritmoTexto, '65:00', 'mas de una hora por km');
});

prueba('sin datos utiles devuelve null, nunca Infinity', () => {
  igual(T.calcularRitmo(null, 2700), null, 'sin distancia');
  igual(T.calcularRitmo(0, 2700), null, 'distancia cero');
  igual(T.calcularRitmo(-5, 2700), null, 'distancia negativa');
  igual(T.calcularRitmo(Infinity, 2700), null, 'distancia infinita');
  igual(T.calcularRitmo(NaN, 2700), null, 'distancia NaN');
  igual(T.calcularRitmo(6.2, 0), null, 'duracion cero');
  igual(T.calcularRitmo(6.2, -10), null, 'duracion negativa');
});

prueba('el formato decimal usa coma y no deja ceros de relleno', () => {
  igual(T.formatearDecimal(6.2), '6,2', 'un decimal');
  igual(T.formatearDecimal(6), '6', 'entero sin ",00"');
  igual(T.formatearDecimal(6.25), '6,25', 'dos decimales');
  igual(T.formatearDecimal(6.254), '6,25', 'redondea al segundo');
  igual(T.formatearDecimal(8.266, 1), '8,3', 'un decimal pedido');
  igual(T.formatearDecimal(10, 1), '10', 'entero con un decimal pedido');
  igual(T.formatearDecimal(0.5), '0,5', 'menos de uno');
});

// --- salida ----------------------------------------------------------------

rmSync(tmp, { recursive: true, force: true });

console.log(`\n${ok} pasan, ${fallos.length} fallan`);
if (fallos.length) {
  for (const f of fallos) console.log('  -', f);
  process.exit(1);
}
