// Pruebas de las cuentas de la pantalla de Progreso, contra los modulos REALES
// de src/lib/ y src/features/progreso/formato.ts.
//
//   node scripts/probar-progreso.mjs
//
// Van aparte de probar-db.mjs por lo mismo que las del temporizador: no tocan
// la base. Son funciones puras, y que lo sean es justamente el motivo de que
// la tendencia, la proyeccion, la racha y los promedios no vivan adentro de la
// pantalla.

// Zona horaria fija antes de cualquier Date, igual que en probar-db.mjs: casi
// todo lo de aca es aritmetica de dias LOCALES, y en una maquina en UTC los
// errores de corrimiento de un dia pasan desapercibidos.
process.env.TZ = 'America/Argentina/Buenos_Aires';

import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, '..');

// --- compilar a CommonJS en un temporal ------------------------------------

const tmp = mkdtempSync(join(tmpdir(), 'probar-progreso-'));
const build = join(tmp, 'build');

const tsconfig = join(tmp, 'tsconfig.json');
writeFileSync(
  tsconfig,
  JSON.stringify({
    compilerOptions: {
      target: 'ES2022',
      module: 'commonjs',
      moduleResolution: 'node',
      // Mismo motivo que en los otros dos scripts: TS 6 convirtio en error el
      // deprecado de node10 y la resolucion se mantiene a proposito.
      ignoreDeprecations: '6.0',
      esModuleInterop: true,
      skipLibCheck: true,
      strict: true,
      outDir: build,
      rootDir: join(RAIZ, 'src'),
      types: [],
      // Los OTROS dos scripts no necesitan esto y este si: nutricion.ts y
      // formato.ts importan TIPOS de '@/db/...', y aunque esos imports se
      // borran al emitir, tsc igual tiene que resolverlos para chequear.
      //
      // OJO: los imports de VALOR de los archivos que se prueban tienen que
      // ser relativos igualmente. tsc no reescribe los alias en el JS que
      // emite, asi que un `from '@/lib/fechas'` de valor saldria como
      // require("@/lib/fechas") y reventaria al cargar.
      baseUrl: RAIZ,
      paths: { '@/*': ['src/*'] },
    },
    include: [
      join(RAIZ, 'src/lib/fechas.ts'),
      join(RAIZ, 'src/lib/salud.ts'),
      join(RAIZ, 'src/lib/nutricion.ts'),
      join(RAIZ, 'src/lib/progreso.ts'),
      // Los textos tambien se prueban: son texto que depende de un calculo, o
      // sea que se pueden equivocar en silencio. Archivo suelto y no el glob
      // de features/progreso/, que arrastraria componentes con React adentro.
      join(RAIZ, 'src/features/progreso/formato.ts'),
    ],
  }),
);

try {
  execFileSync('npx', ['tsc', '-p', tsconfig], { cwd: RAIZ, stdio: 'pipe' });
} catch (e) {
  console.error('tsc fallo al compilar:\n' + (e.stdout?.toString() ?? e.message));
  process.exit(1);
}

const req = createRequire(join(build, 'x.cjs'));
const F = req('./lib/fechas.js');
const N = req('./lib/nutricion.js');
const P = req('./lib/progreso.js');
const X = req('./features/progreso/formato.js');

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

/** Para los flotantes: comparar 76.39999999999999 con 76.4 no sirve. */
function cerca(actual, esperado, tolerancia, que) {
  if (!(Math.abs(actual - esperado) <= tolerancia)) {
    throw new Error(`${que}: esperaba ${esperado} +-${tolerancia}, dio ${actual}`);
  }
}

function cierto(valor, que) {
  if (!valor) throw new Error(`${que}: esperaba algo verdadero, dio ${JSON.stringify(valor)}`);
}

/** Serie de pesos a partir de una fecha, un dia por elemento. */
const serie = (desde, pesos) =>
  pesos.map((peso_kg, i) => ({ fecha: F.sumarDias(desde, i), peso_kg }));

/** Lo que hace la pantalla: la tendencia dibuja, los crudos dan la pendiente. */
const proyectar = (registros, objetivo) =>
  N.proyectarPeso(N.tendenciaPeso(registros), N.pesosPorDia(registros), objetivo);

// --- fechas ----------------------------------------------------------------

console.log('\naritmetica de dias:');

prueba('diasEntre cuenta dias enteros y cruza el mes', () => {
  igual(F.diasEntre('2026-09-01', '2026-09-08'), 7, 'una semana');
  igual(F.diasEntre('2026-08-28', '2026-09-02'), 5, 'cruzando agosto');
  igual(F.diasEntre('2026-09-08', '2026-09-01'), -7, 'al reves da negativo');
  igual(F.diasEntre('2026-09-08', '2026-09-08'), 0, 'el mismo dia');
});

prueba('sumarDias normaliza mes y anio', () => {
  igual(F.sumarDias('2026-09-08', 30), '2026-10-08', 'un mes');
  igual(F.sumarDias('2026-12-28', 10), '2027-01-07', 'cruzando el anio');
  igual(F.sumarDias('2026-03-01', -1), '2026-02-28', 'para atras');
  igual(F.sumarDias('2024-02-28', 1), '2024-02-29', 'anio bisiesto');
});

// --- tendencia -------------------------------------------------------------

console.log('\ntendencia de peso:');

prueba('dos pesadas del mismo dia se promedian en un punto', () => {
  const r = N.pesosPorDia([
    { fecha: '2026-09-02', peso_kg: 80 },
    { fecha: '2026-09-01', peso_kg: 75 },
    { fecha: '2026-09-02', peso_kg: 78 },
  ]);
  igual(r.length, 2, 'un punto por dia');
  igual(r[0], { fecha: '2026-09-01', peso_kg: 75 }, 'sale ordenado por fecha');
  igual(r[1].peso_kg, 79, 'promedio del dia con dos pesadas');
});

prueba('con menos de tres dias no hay tendencia', () => {
  igual(N.tendenciaPeso(serie('2026-09-01', [80, 79])), [], 'dos dias');
  igual(N.tendenciaPeso([]), [], 'ninguno');
  // Tres pesadas el MISMO dia son un solo dia: no alcanzan.
  igual(
    N.tendenciaPeso([
      { fecha: '2026-09-01', peso_kg: 80 },
      { fecha: '2026-09-01', peso_kg: 81 },
      { fecha: '2026-09-01', peso_kg: 79 },
    ]),
    [],
    'tres pesadas de un mismo dia',
  );
});

prueba('el primer punto es el crudo y la ventana se va llenando', () => {
  const t = N.tendenciaPeso(serie('2026-09-01', [80, 82, 78]));
  igual(t.length, 3, 'un punto por dia');
  cerca(t[0].peso_kg, 80, 0.001, 'el primero es el crudo');
  cerca(t[1].peso_kg, 81, 0.001, 'promedio de dos');
  cerca(t[2].peso_kg, 80, 0.001, 'promedio de tres');
});

prueba('la ventana es de 7 dias CALENDARIO y suelta lo viejo', () => {
  // Ocho dias seguidos: el octavo punto ya no puede contener al primero.
  const t = N.tendenciaPeso(serie('2026-09-01', [70, 80, 80, 80, 80, 80, 80, 80]));
  cerca(t[6].peso_kg, (70 + 80 * 6) / 7, 0.001, 'el septimo todavia lo tiene');
  cerca(t[7].peso_kg, 80, 0.001, 'el octavo ya lo solto');
});

prueba('un hueco largo entre pesadas no arrastra el valor viejo', () => {
  // Esta es la diferencia con una media de "las ultimas 7 muestras": con un
  // mes de por medio, esa arrastraria el peso de agosto hasta septiembre.
  const t = N.tendenciaPeso([
    { fecha: '2026-08-01', peso_kg: 90 },
    { fecha: '2026-08-02', peso_kg: 90 },
    { fecha: '2026-09-10', peso_kg: 80 },
    { fecha: '2026-09-11', peso_kg: 80 },
  ]);
  cerca(t[2].peso_kg, 80, 0.001, 'el punto de septiembre no ve agosto');
  cerca(t[3].peso_kg, 80, 0.001, 'ni el siguiente');
});

prueba('la tendencia aplasta un pico de retencion de liquidos', () => {
  // Un dia con dos kilos de mas, que es exactamente el caso que el grafico no
  // tiene que mostrar como si fuera un dato.
  const crudos = serie('2026-09-01', [80, 80, 80, 82, 80, 80, 80]);
  const t = N.tendenciaPeso(crudos);
  const pico = t[3].peso_kg;
  cierto(pico < 80.6, `el pico de 2 kg queda en ${pico}, deberia estar bien abajo de 80,6`);
  cierto(pico > 80, 'pero algo sube: no se borra el dato');
});

prueba('la pendiente sale de la recta de minimos cuadrados', () => {
  const dias = N.pesosPorDia(serie('2026-09-01', [80, 79.9, 79.8, 79.7, 79.6, 79.5]));
  cerca(N.pendienteDiaria(dias), -0.1, 0.001, 'kg por dia');
  igual(N.pendienteDiaria([{ fecha: '2026-09-01', peso_kg: 80 }]), null, 'con un punto, null');
});

prueba('la pendiente NO se mide sobre la tendencia: arranca en frio', () => {
  // El motivo de que proyectarPeso() reciba las dos series.
  //
  // Se mide en 14 dias, que es el minimo con el que la app se anima a dar una
  // fecha: ahi es donde el sesgo mas pega, porque la media movil todavia esta
  // llenando la ventana en la mitad de la serie.
  const registros = serie('2026-09-01', Array.from({ length: 14 }, (_, i) => 80 - 0.1 * i));
  const real = N.pendienteDiaria(N.pesosPorDia(registros));
  const sesgada = N.pendienteDiaria(N.tendenciaPeso(registros));

  cerca(real, -0.1, 0.001, 'sobre los crudos da la pendiente de verdad');
  cerca(sesgada, -0.078, 0.005, 'la de la tendencia sale mucho mas plana');
  cierto(sesgada / real < 0.85, `el sesgo es de mas del 15%: ${sesgada} contra ${real}`);
});

// --- proyeccion ------------------------------------------------------------

console.log('\nproyeccion:');

/** 40 dias bajando `porDia` kg desde `desde`. Rango de sobra para proyectar. */
const bajando = (porDia, inicial = 80) =>
  serie(
    '2026-08-01',
    Array.from({ length: 40 }, (_, i) => inicial + porDia * i),
  );

prueba('el caso feliz da fecha y dias', () => {
  // 100 g por dia desde 80 kg. La tendencia lagea unos dias respecto del crudo,
  // asi que la fecha sale un poco conservadora, que es el lado bueno.
  const p = proyectar(bajando(-0.1), 72);
  igual(p.clase, 'fecha', 'clase');
  cerca(p.kgPorSemana, -0.7, 0.05, 'kg por semana');
  cerca(p.diasEstimados, 45, 3, 'dias hasta el objetivo');
  cierto(p.fechaEstimada > '2026-10-01', `la fecha cae en octubre y no en ${p.fechaEstimada}`);
});

prueba('con menos de tres dias no hay ni proyeccion', () => {
  igual(proyectar([], 72).clase, 'sin_datos', 'sin tendencia');
  igual(proyectar(serie('2026-09-01', [80, 79]), 72).clase,
    'sin_datos', 'dos dias');
});

prueba('con pocos dias de rango hay tendencia pero no fecha', () => {
  // Seis dias de registros. La cuenta cerraria igual; el numero seria
  // inventado, asi que no se da.
  const p = proyectar(serie('2026-09-01', [80, 79.8, 79.6, 79.4, 79.2, 79]), 72);
  igual(p.clase, 'poco_rango', 'clase');
  igual(p.fechaEstimada, null, 'sin fecha');
  igual(p.diasDeRango, 5, 'pero dice cuantos dias lleva');
  cierto(p.kgPorSemana !== null, 'y el ritmo igual se calcula, para el texto');
});

prueba('sin peso objetivo no hay a donde proyectar', () => {
  const p = proyectar(bajando(-0.1), null);
  igual(p.clase, 'sin_objetivo', 'clase');
  igual(p.faltaKg, null, 'no hay falta que calcular');
  cierto(p.kgPorSemana !== null, 'el ritmo si se sabe');
});

prueba('una tendencia plana no da fecha aunque el signo diga algo', () => {
  // 5 gramos por dia: el signo existe pero no significa nada.
  const p = proyectar(bajando(-0.005), 72);
  igual(p.clase, 'plana', 'clase');
});

prueba('si va para el otro lado se dice, sin fecha', () => {
  const p = proyectar(bajando(0.05, 76), 72);
  igual(p.clase, 'al_reves', 'clase');
  igual(p.fechaEstimada, null, 'sin fecha');
  cierto(p.faltaKg < 0, 'el objetivo queda abajo');
});

prueba('una fecha a mas de dos anios no se muestra', () => {
  // 60 g por semana bajando, con 8 kg por delante: son mas de dos anios.
  const p = proyectar(bajando(-0.0086, 80), 72);
  igual(p.clase, 'lejos', 'clase');
  igual(p.fechaEstimada, null, 'sin fecha');
});

prueba('estar en el objetivo es haber llegado, no estar estancado', () => {
  const p = proyectar(bajando(-0.001, 72), 72);
  igual(p.clase, 'ya_llegaste', 'clase');
});

// --- promedios de nutricion ------------------------------------------------

console.log('\npromedio diario:');

const item = (fecha, kcal, cantidad_g = 100) => ({
  fecha,
  cantidad_g,
  kcal_por_100g: kcal,
  proteina_g: 10,
  carbohidratos_g: 20,
  grasa_g: 5,
  fibra_g: 0,
});

prueba('divide por dias REGISTRADOS, no por dias del periodo', () => {
  // Dos dias cargados dentro de un mes. Si dividiera por 30, el promedio
  // diario daria 133 kcal y no le paso a nadie.
  const p = N.promedioDiario([item('2026-09-01', 2000), item('2026-09-15', 2000)]);
  igual(p.diasConRegistro, 2, 'dias con registro');
  igual(p.kcal, 2000, 'promedio');
});

prueba('suma los items del mismo dia antes de promediar', () => {
  const p = N.promedioDiario([
    item('2026-09-01', 1000),
    item('2026-09-01', 1000),
    item('2026-09-02', 2000),
  ]);
  igual(p.diasConRegistro, 2, 'dias');
  igual(p.kcal, 2000, 'promedio');
  igual(p.proteina_g, 15, 'los macros siguen la misma cuenta');
});

prueba('sin nada cargado no divide por cero', () => {
  igual(N.promedioDiario([]), {
    diasConRegistro: 0, kcal: 0, proteina_g: 0, carbohidratos_g: 0, grasa_g: 0,
  }, 'todo en cero');
});

// --- asistencia y volumen --------------------------------------------------

console.log('\nasistencia y entrenamientos propios:');

const AHORA = new Date('2026-09-08T12:00:00-03:00');

let n = 0;
const evento = (fecha, extra = {}) => ({
  id: `e${++n}`,
  tipo: 'entrenamiento',
  fecha_hora_inicio: `${fecha}T09:00:00-03:00`,
  fecha,
  duracion_estimada_min: 60,
  completado: 0,
  respondido: 0,
  rutina_id: null,
  ...extra,
});

const deRutina = (fecha, completado, respondido = 1) =>
  evento(fecha, { rutina_id: 'r1', completado, respondido });

prueba('lo que todavia no paso no es ni asistencia ni falta', () => {
  const s = P.separarPorOrigen(
    [deRutina('2026-09-01', 1), deRutina('2026-09-20', 0, 0)],
    AHORA,
  );
  igual(s.deRutina.length, 1, 'solo el que ya paso');
});

prueba('separa por rutina_id, que es toda la distincion', () => {
  const s = P.separarPorOrigen(
    [deRutina('2026-09-01', 1), evento('2026-09-02', { completado: 1, respondido: 1 })],
    AHORA,
  );
  igual(s.deRutina.length, 1, 'el del club');
  igual(s.propios.length, 1, 'el propio');
});

prueba('un evento propio que no se hizo no suma volumen', () => {
  const s = P.separarPorOrigen([evento('2026-09-02', { completado: 0, respondido: 1 })], AHORA);
  igual(s.propios.length, 0, 'no cuenta');
});

prueba('el denominador son los RESPONDIDOS, no todos los pasados', () => {
  const r = P.resumenAsistencia([
    deRutina('2026-09-01', 1),
    deRutina('2026-09-02', 1),
    deRutina('2026-09-03', 0),
    deRutina('2026-09-04', 0, 0), // pasado y mudo: no es una falta
  ]);
  igual(r.fue, 2, 'fue');
  igual(r.respondidos, 3, 'respondidos');
  igual(r.sinResponder, 1, 'el mudo se cuenta aparte');
  cerca(r.proporcion, 2 / 3, 0.0001, 'proporcion');
});

prueba('sin nada respondido la proporcion es 0 y no NaN', () => {
  igual(P.resumenAsistencia([]).proporcion, 0, 'vacio');
  igual(P.resumenAsistencia([deRutina('2026-09-01', 0, 0)]).proporcion, 0, 'todo mudo');
});

prueba('desglose separa deporte y gimnasio con sus cuentas propias', () => {
  const eventos = [
    deRutina('2026-09-01', 1),
    deRutina('2026-09-02', 0),
    evento('2026-09-03', { rutina_id: 'r2', tipo: 'gimnasio', completado: 1, respondido: 1 }),
    evento('2026-09-04', { rutina_id: 'r2', tipo: 'gimnasio', completado: 1, respondido: 1 }),
  ];
  const d = P.desgloseAsistencia(eventos);
  cierto(d.entrenamiento !== null, 'hay entrenamiento');
  cierto(d.gimnasio !== null, 'hay gimnasio');
  igual(d.entrenamiento.fue, 1, 'entrenamiento fue');
  igual(d.entrenamiento.respondidos, 2, 'entrenamiento respondidos');
  igual(d.gimnasio.fue, 2, 'gimnasio fue');
  igual(d.gimnasio.respondidos, 2, 'gimnasio respondidos');
});

prueba('usuario con solo un tipo de rutina da null en el otro para no mostrar barra vacia', () => {
  const soloGym = [
    evento('2026-09-01', { rutina_id: 'r2', tipo: 'gimnasio', completado: 1, respondido: 1 }),
  ];
  const dGym = P.desgloseAsistencia(soloGym);
  igual(dGym.entrenamiento, null, 'sin deporte');
  cierto(dGym.gimnasio !== null, 'con gym');

  const soloDeporte = [deRutina('2026-09-01', 1)];
  const dDep = P.desgloseAsistencia(soloDeporte);
  cierto(dDep.entrenamiento !== null, 'con deporte');
  igual(dDep.gimnasio, null, 'sin gym');
});

prueba('partido y competencia con rutina_id no entran en el desglose', () => {
  const eventos = [
    evento('2026-09-01', { rutina_id: 'r3', tipo: 'partido', completado: 1, respondido: 1 }),
    evento('2026-09-02', { rutina_id: 'r4', tipo: 'competencia', completado: 1, respondido: 1 }),
  ];
  const d = P.desgloseAsistencia(eventos);
  igual(d.entrenamiento, null, 'no entran como entrenamiento');
  igual(d.gimnasio, null, 'no entran como gimnasio');
});

prueba('la racha cuenta desde la ultima hacia atras y una falta la corta', () => {
  const eventos = [
    deRutina('2026-09-01', 1),
    deRutina('2026-09-02', 0),
    deRutina('2026-09-03', 1),
    deRutina('2026-09-04', 1),
    deRutina('2026-09-05', 1),
  ];
  igual(P.rachaAsistencias(eventos), 3, 'las tres del final');
});

prueba('un evento sin responder tambien corta la racha', () => {
  igual(
    P.rachaAsistencias([deRutina('2026-09-01', 1), deRutina('2026-09-02', 1, 0)]),
    0,
    'no se puede afirmar que sigue viva',
  );
});

const sesion = (extra = {}) => ({
  modo: 'pasadas',
  bloques: 6, pasadas: 8, trabajo_seg: 20, descanso_seg: 20, descanso_bloque_seg: 90,
  bloques_completados: 6, pasadas_completadas: 48, duracion_real_seg: 1800,
  distancia_km: null, ...extra,
});

prueba('el volumen usa la duracion REAL y cae a la estimada sin sesion', () => {
  const v = P.volumenPropio([
    { evento: evento('2026-09-01'), sesion: sesion({ duracion_real_seg: 1800 }) },
    { evento: evento('2026-09-02', { duracion_estimada_min: 45 }), sesion: null },
  ]);
  igual(v.sesiones, 2, 'sesiones');
  igual(v.segundos, 1800 + 45 * 60, 'la real de una y la estimada de la otra');
});

prueba('los km suman solo de las sesiones que los tienen', () => {
  const v = P.volumenPropio([
    { evento: evento('2026-09-01'), sesion: sesion() },
    { evento: evento('2026-09-02'), sesion: sesion({ distancia_km: 6.2 }) },
    { evento: evento('2026-09-03'), sesion: sesion({ distancia_km: 2.2 }) },
  ]);
  cerca(v.km, 8.4, 0.0001, 'km');
  igual(v.sesionesConKm, 2, 'cuantas aportaron');
});

// --- dominio del grafico ---------------------------------------------------

console.log('\ngeometria del grafico:');

prueba('tres pesos casi iguales no dibujan un dientes de sierra', () => {
  const d = P.dominioPeso([80, 80.1, 80.2], null);
  cierto(d.max - d.min >= 0.5, `el rango es ${d.max - d.min}, deberia tener un piso`);
});

prueba('el objetivo cercano entra en el dominio, el lejano no', () => {
  const cercano = P.dominioPeso([80, 79, 78], 76);
  cierto(P.objetivoVisible(cercano, 76), 'a 2 kg entra');

  const lejano = P.dominioPeso([80, 79, 78], 50);
  cierto(!P.objetivoVisible(lejano, 50), 'a 28 kg no: aplastaria la serie');
  cierto(lejano.min > 70, 'y el dominio se queda con la serie');
});

// --- textos ----------------------------------------------------------------

console.log('\ntextos:');

prueba('la fecha es difusa: franja del mes, no el dia exacto', () => {
  igual(X.fechaDifusa('2026-11-05', '2026-09-08'), 'a principios de noviembre', 'dia 5');
  igual(X.fechaDifusa('2026-11-15', '2026-09-08'), 'a mediados de noviembre', 'dia 15');
  igual(X.fechaDifusa('2026-11-24', '2026-09-08'), 'a fines de noviembre', 'dia 24');
  igual(X.fechaDifusa('2027-03-24', '2026-09-08'), 'a fines de marzo de 2027', 'otro anio');
});

prueba('el delta lleva flecha y no depende del color', () => {
  igual(X.textoDelta(-1.24), '↓ 1,2 kg', 'bajo');
  igual(X.textoDelta(0.4), '↑ 0,4 kg', 'subio');
  igual(X.textoDelta(0.01), 'sin cambios', 'nada');
});

prueba('la direccion deseada sale del objetivo, y mantener no tiene una', () => {
  igual(X.direccionDeseada('bajar'), -1, 'bajar');
  igual(X.direccionDeseada('subir'), 1, 'subir');
  igual(X.direccionDeseada('mantener'), 0, 'mantener');
  igual(X.direccionDeseada('rendimiento'), 0, 'rendimiento');
  igual(X.direccionDeseada(null), 0, 'sin objetivo cargado');
});

prueba('el caso feliz nombra el objetivo y la fecha', () => {
  const p = proyectar(bajando(-0.1), 72);
  const t = X.textoProyeccion(p, 72, '2026-09-08');
  cierto(t.titulo.includes('72 kg'), `deberia nombrar el objetivo: ${t.titulo}`);
  cierto(t.titulo.includes('A este ritmo'), `deberia ser la proyeccion: ${t.titulo}`);
});

prueba('NINGUNA clase deja la card vacia', () => {
  // La regla: cuando no hay fecha que dar, la card no se queda con una sola
  // frase seca. La ausencia de la proyeccion no puede leerse como un reproche.
  const casos = [
    ['fecha', proyectar(bajando(-0.1), 72), 72],
    ['al_reves', proyectar(bajando(0.05, 76), 72), 72],
    ['plana', proyectar(bajando(-0.005), 72), 72],
    ['lejos', proyectar(bajando(-0.0086, 80), 72), 72],
    ['ya_llegaste', proyectar(bajando(-0.001, 72), 72), 72],
    ['sin_objetivo', proyectar(bajando(-0.1), null), null],
    ['poco_rango', proyectar(serie('2026-09-01', [80, 79.8, 79.6]), 72), 72],
  ];

  for (const [esperada, p, objetivo] of casos) {
    igual(p.clase, esperada, `la clase de ${esperada}`);
    const t = X.textoProyeccion(p, objetivo, '2026-09-08');
    cierto(t.titulo.length > 10, `${esperada}: titulo flaco -> "${t.titulo}"`);
    cierto(t.detalle.length > 10, `${esperada}: detalle flaco -> "${t.detalle}"`);
    // El detalle no puede quedar en un " · ." con los huecos sin llenar.
    cierto(!/^\s*·|·\s*\.$/.test(t.detalle), `${esperada}: detalle a medio armar -> "${t.detalle}"`);
  }
});

prueba('ningun texto de la pantalla reta ni felicita', () => {
  const prohibidas = /(dale|vamos|excelente|felicit|genial|esfuerz|fracas|mal|deberías)/i;
  const casos = [
    proyectar(bajando(-0.1), 72),
    proyectar(bajando(0.05, 76), 72),
    proyectar(bajando(-0.005), 72),
  ];
  for (const p of casos) {
    const t = X.textoProyeccion(p, 72, '2026-09-08');
    cierto(!prohibidas.test(t.titulo), `titulo con tono: ${t.titulo}`);
    cierto(!prohibidas.test(t.detalle), `detalle con tono: ${t.detalle}`);
  }
});

prueba('el aviso de ritmo avisa si la bajada supera 750 g por semana', () => {
  const pRapida = proyectar(bajando(-0.2), 72);
  cierto(pRapida.kgPorSemana < -0.75, 'el ritmo excede los 750 g semanales');
  igual(
    X.avisoRitmo(pRapida),
    'Bajar más de 750g por semana no es sostenible ni saludable a largo plazo. Te sugerimos un ritmo más gradual.',
    'muestra el aviso del coach',
  );

  const pModerada = proyectar(bajando(-0.07), 72);
  cierto(pModerada.kgPorSemana > -0.75, 'el ritmo es gradual');
  igual(X.avisoRitmo(pModerada), null, 'no muestra aviso si es menor a 750g/semana');
});

prueba('el volumen no muestra km si nadie cargo distancia', () => {
  igual(
    X.textoVolumen({ sesiones: 3, segundos: 9000, km: 0, sesionesConKm: 0 }),
    '3 sesiones · 2,5 h',
    'sin km',
  );
  igual(
    X.textoVolumen({ sesiones: 3, segundos: 9000, km: 8.4, sesionesConKm: 2 }),
    '3 sesiones · 2,5 h · 8,4 km',
    'con km',
  );
  igual(
    X.textoVolumen({ sesiones: 1, segundos: 2700, km: 0, sesionesConKm: 0 }),
    '1 sesión · 45 min',
    'singular y minutos',
  );
});

// El modo manda: desde la 006 hay tres, y cada uno llena columnas distintas.
// Una sola linea por sesion tiene que servir para los tres sin decir "null".
const describir = (extra) => X.textoSesion({ evento: evento('2026-09-01'), sesion: sesion(extra) });

prueba('una sesion de pasadas cuenta bloques y pasadas', () => {
  igual(describir({}), '6 bloques · 48 pasadas', 'con estructura');
});

prueba('una sesion con distancia dice km, tiempo y ritmo', () => {
  igual(
    describir({ distancia_km: 6.2, duracion_real_seg: 2700 }),
    '6,2 km en 45 min · 7:15 min/km',
    'con distancia',
  );
});

prueba('el cronometro no tiene estructura que contar', () => {
  // bloques, pasadas y descansos son 1, 1 y 0 o directamente null: contarlos
  // daria "1 bloque · 1 pasada", que no es informacion.
  igual(
    describir({ modo: 'cronometro', trabajo_seg: 0, bloques: 1, duracion_real_seg: 2700 }),
    '45 min',
    'solo la duracion',
  );
  igual(
    describir({ modo: 'cronometro', trabajo_seg: 0, bloques: 1, duracion_real_seg: 2700, distancia_km: 6.2 }),
    '6,2 km en 45 min',
    'con distancia, sin ritmo',
  );
});

prueba('una rutina de gimnasio se describe por ejercicios, series y volumen', () => {
  // Las columnas de pasadas vienen en null: si esta rama se cayera al camino
  // de las pasadas, la lista mostraria "0 bloques · 0 pasadas".
  const rutina = (extra) =>
    describir({
      modo: 'rutina',
      bloques: null, pasadas: null, trabajo_seg: null, descanso_seg: null,
      descanso_bloque_seg: null, bloques_completados: null, pasadas_completadas: null,
      duracion_real_seg: 3600, ...extra,
    });

  igual(
    rutina({ ejercicios_count: 5, series_count: 18, series_con_peso_count: 18, volumen_kg: 2400 }),
    '5 ejercicios · 18 series · 2400 kg',
    'todo con carga: se dice el volumen',
  );
  igual(
    rutina({ ejercicios_count: 3, series_count: 9, series_con_peso_count: 0, volumen_kg: 0 }),
    '3 ejercicios · 9 series · peso corporal',
    'sin carga: un 0 kg se leeria como un dato roto',
  );
  igual(
    rutina({ ejercicios_count: 4, series_count: 12, series_con_peso_count: 8, volumen_kg: 1500 }),
    '4 ejercicios · 12 series (8 con carga) · 1500 kg',
    'mezcla',
  );
  igual(
    rutina({ ejercicios_count: 1, series_count: 0, series_con_peso_count: 0, volumen_kg: 0 }),
    '1 ejercicio · sin series',
    'abierta y sin cargar nada, en singular',
  );
});

prueba('un entrenamiento propio sin sesion cae a la duracion estimada', () => {
  igual(
    X.textoSesion({ evento: evento('2026-09-01', { duracion_estimada_min: 45 }), sesion: null }),
    '45 min',
    'sin sesion',
  );
  igual(
    X.textoSesion({ evento: evento('2026-09-01', { duracion_estimada_min: null }), sesion: null }),
    'Sin detalle',
    'ni siquiera estimada',
  );
});

prueba('el periodo se nombra como ventana movil, no como mes calendario', () => {
  igual(X.textoPeriodo('semana'), 'en los últimos 7 días', 'semana');
  igual(X.textoPeriodo('mes'), 'en los últimos 30 días', 'mes');
  igual(X.textoPeriodo('todo'), 'desde que arrancaste', 'todo');
});

prueba('calcularMetaAgua calcula 35 ml/kg + 10 ml/min y redondea a 50 ml', () => {
  // 70 kg, 0 min: 70 * 35 = 2450
  igual(N.calcularMetaAgua(70, 0), 2450, '70kg sin entreno');
  // 70 kg, 60 min: 2450 + 600 = 3050
  igual(N.calcularMetaAgua(70, 60), 3050, '70kg con 60 min');
  // 80 kg, 30 min: 80 * 35 + 300 = 2800 + 300 = 3100
  igual(N.calcularMetaAgua(80, 30), 3100, '80kg con 30 min');
  // 72.3 kg, 45 min: 72.3 * 35 + 450 = 2530.5 + 450 = 2980.5 -> 3000
  igual(N.calcularMetaAgua(72.3, 45), 3000, 'redondeo a 50 ml superior');
  // 72 kg, 40 min: 72 * 35 + 400 = 2520 + 400 = 2920 -> 2900
  igual(N.calcularMetaAgua(72, 40), 2900, 'redondeo a 50 ml inferior');
  // caso borde: 0 kg, 0 min
  igual(N.calcularMetaAgua(0, 0), 0, 'cero peso y entreno');
});

// --- salida ----------------------------------------------------------------

rmSync(tmp, { recursive: true, force: true });

console.log(`\n${ok} pasan, ${fallos.length} fallan`);
if (fallos.length) {
  for (const f of fallos) console.log('  -', f);
  process.exit(1);
}
