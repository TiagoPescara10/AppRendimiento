// Pruebas de niveles y XP, contra el modulo REAL src/lib/nivel.ts.
//
//   node scripts/probar-nivel.mjs
//
// Mismo molde que probar-progreso.mjs: no toca la base. La XP se calcula de
// los eventos con funciones puras, y que lo sean es justamente lo que permite
// probar que borrar un entrenamiento resta su XP sin armar una base.

// Zona horaria fija antes de cualquier Date: los meses y las semanas son
// LOCALES, y en una maquina en UTC un corrimiento de un dia pasa desapercibido.
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

const tmp = mkdtempSync(join(tmpdir(), 'probar-nivel-'));
const build = join(tmp, 'build');

const tsconfig = join(tmp, 'tsconfig.json');
writeFileSync(
  tsconfig,
  JSON.stringify({
    compilerOptions: {
      target: 'ES2022',
      module: 'commonjs',
      moduleResolution: 'node',
      ignoreDeprecations: '6.0',
      esModuleInterop: true,
      skipLibCheck: true,
      strict: true,
      outDir: build,
      rootDir: join(RAIZ, 'src'),
      types: [],
    },
    include: [
      join(RAIZ, 'src/lib/fechas.ts'),
      join(RAIZ, 'src/lib/progreso.ts'),
      join(RAIZ, 'src/lib/nivel.ts'),
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
const L = req('./lib/nivel.js');

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

function cierto(valor, que) {
  if (!valor) throw new Error(`${que}: esperaba algo verdadero, dio ${JSON.stringify(valor)}`);
}

function cerca(actual, esperado, tolerancia, que) {
  if (!(Math.abs(actual - esperado) <= tolerancia)) {
    throw new Error(`${que}: esperaba ${esperado} +-${tolerancia}, dio ${actual}`);
  }
}

// --- fabricas --------------------------------------------------------------

let siguienteId = 1;

/** Un evento con lo minimo. Por defecto: suelto, completado y respondido. */
function ev(fecha, extra = {}) {
  return {
    id: `e${siguienteId++}`,
    tipo: 'entrenamiento',
    fecha,
    fecha_hora_inicio: `${fecha}T19:00:00-03:00`,
    duracion_estimada_min: 60,
    completado: 1,
    respondido: 1,
    rutina_id: null,
    modo_entrenamiento: null,
    ...extra,
  };
}

/** Un evento de rutina: fue (1), no fue (0) o sin responder (null). */
function deRutina(fecha, fue, extra = {}) {
  return ev(fecha, {
    rutina_id: 'r1',
    completado: fue === 1 ? 1 : 0,
    respondido: fue === null ? 0 : 1,
    ...extra,
  });
}

/** Un mes de rutina con `fue` asistencias y `falto` faltas. */
function mesDeRutina(mes, fue, falto, sinResponder = 0) {
  const lista = [];
  let dia = 1;
  const d = () => `${mes}-${String(dia++).padStart(2, '0')}`;
  for (let i = 0; i < fue; i++) lista.push(deRutina(d(), 1));
  for (let i = 0; i < falto; i++) lista.push(deRutina(d(), 0));
  for (let i = 0; i < sinResponder; i++) lista.push(deRutina(d(), null));
  return lista;
}

const SEP_29 = new Date(2026, 8, 29, 12, 0);

// --- XP por sesion ----------------------------------------------------------

console.log('\nXP por sesion:');

prueba('cada tipo de sesion completada vale lo mismo', () => {
  const tipos = [
    ev('2026-09-01', { tipo: 'entrenamiento', rutina_id: 'club' }),
    ev('2026-09-02', { tipo: 'gimnasio', rutina_id: 'gym' }),
    ev('2026-09-03', { tipo: 'partido' }),
    ev('2026-09-04', { modo_entrenamiento: 'cronometro' }),
    ev('2026-09-05', { modo_entrenamiento: 'pasadas' }),
    ev('2026-09-06', { tipo: 'gimnasio', modo_entrenamiento: 'rutina' }),
  ];
  for (const e of tipos) {
    igual(L.calcularXP([e], SEP_29), L.XP_POR_SESION, `${e.tipo}/${e.modo_entrenamiento}`);
  }
  igual(L.calcularXP(tipos, SEP_29), 6 * L.XP_POR_SESION, 'las seis juntas');
});

prueba('la duracion no cambia la XP: se premia completar, no rendir', () => {
  const corta = ev('2026-09-10', { duracion_estimada_min: 10 });
  const larga = ev('2026-09-10', { duracion_estimada_min: 180 });
  igual(L.calcularXP([corta], SEP_29), L.calcularXP([larga], SEP_29), 'misma XP');
});

prueba('lo no completado no suma', () => {
  igual(L.calcularXP([ev('2026-09-10', { completado: 0 })], SEP_29), 0, 'no hecho');
  igual(L.calcularXP([deRutina('2026-09-10', null)], SEP_29), 0, 'sin responder');
  igual(L.calcularXP([], SEP_29), 0, 'nada');
});

prueba('borrar una sesion resta su XP', () => {
  const eventos = [ev('2026-09-01'), ev('2026-09-02'), ev('2026-09-03')];
  const antes = L.calcularXP(eventos, SEP_29);
  const despues = L.calcularXP(eventos.filter((e) => e.fecha !== '2026-09-02'), SEP_29);
  igual(antes - despues, L.XP_POR_SESION, 'resta 15');
});

// --- bono mensual -----------------------------------------------------------

console.log('\nbono mensual:');

/** La XP que viene solo del bono: la total menos la de las sesiones. */
const soloBono = (eventos, ahora) =>
  L.calcularXP(eventos, ahora) - L.sesionesCompletadas(eventos) * L.XP_POR_SESION;

prueba('mes cerrado con >= 75% cobra el bono', () => {
  const agosto = mesDeRutina('2026-08', 3, 1); // 3 de 4 = 75% justo
  igual(soloBono(agosto, SEP_29), L.XP_BONO_MENSUAL, '75% justo cobra');
  igual(soloBono(mesDeRutina('2026-08', 7, 2), SEP_29), L.XP_BONO_MENSUAL, '7 de 9');
});

prueba('mes cerrado con < 75% no cobra', () => {
  igual(soloBono(mesDeRutina('2026-08', 2, 2), SEP_29), 0, '2 de 4');
  igual(soloBono(mesDeRutina('2026-08', 5, 2), SEP_29), 0, '5 de 7 = 71%');
});

prueba('mes con menos de 4 respondidos no cobra aunque sea 100%', () => {
  igual(soloBono(mesDeRutina('2026-08', 1, 0), SEP_29), 0, '1 de 1');
  igual(soloBono(mesDeRutina('2026-08', 3, 0), SEP_29), 0, '3 de 3');
  // Los mudos no cuentan para el minimo: son el denominador de nada.
  igual(soloBono(mesDeRutina('2026-08', 3, 0, 5), SEP_29), 0, '3 de 3 con 5 mudos');
});

prueba('los sin responder no bajan el porcentaje del mes', () => {
  igual(soloBono(mesDeRutina('2026-08', 4, 0, 6), SEP_29), L.XP_BONO_MENSUAL, '4 de 4 con 6 mudos');
});

prueba('el mes en curso queda afuera', () => {
  const septiembre = mesDeRutina('2026-09', 8, 0);
  igual(soloBono(septiembre, SEP_29), 0, 'septiembre todavia abierto');
  igual(soloBono(septiembre, new Date(2026, 9, 1, 8, 0)), L.XP_BONO_MENSUAL, 'el 1 de octubre ya cuenta');
});

prueba('los eventos propios no cuentan para el bono', () => {
  const propios = [1, 2, 3, 4, 5].map((d) => ev(`2026-08-0${d}`));
  igual(soloBono(propios, SEP_29), 0, 'cinco propios');
});

prueba('cada mes cerrado cobra por separado', () => {
  const eventos = [
    ...mesDeRutina('2026-06', 4, 0),
    ...mesDeRutina('2026-07', 1, 3),
    ...mesDeRutina('2026-08', 6, 1),
  ];
  igual(soloBono(eventos, SEP_29), 2 * L.XP_BONO_MENSUAL, 'junio y agosto');
  igual(
    L.resumenMensual(eventos, SEP_29).map((r) => [r.mes, r.cobraBono]),
    [['2026-06', true], ['2026-07', false], ['2026-08', true]],
    'detalle por mes',
  );
});

prueba('borrar una sesion puede sacar el bono del mes', () => {
  const agosto = mesDeRutina('2026-08', 3, 1); // 75% justo
  const sinUna = agosto.filter((e) => e.fecha !== '2026-08-01'); // 2 de 3
  const diferencia = L.calcularXP(agosto, SEP_29) - L.calcularXP(sinUna, SEP_29);
  igual(diferencia, L.XP_POR_SESION + L.XP_BONO_MENSUAL, 'resta la sesion y el bono');
});

prueba('el texto del bono informa sin festejar', () => {
  const r = L.resumenDelMes(mesDeRutina('2026-09', 7, 2), '2026-09', new Date(2026, 9, 2));
  igual(
    L.textoBonoMensual(r),
    'Septiembre cerrado. Fuiste a 7 de 9 entrenamientos planificados, 78% de cumplimiento. +50 XP.',
    'texto',
  );
  igual(L.resumenDelMes([], '2026-09', new Date(2026, 9, 2)), null, 'mes sin rutina');
});

prueba('el aviso del bono solo sale en los primeros 7 dias del mes', () => {
  igual(L.enVentanaDeBono(new Date(2026, 9, 1, 0, 5)), true, 'el 1');
  igual(L.enVentanaDeBono(new Date(2026, 9, 7, 23, 59)), true, 'el 7 a la noche');
  igual(L.enVentanaDeBono(new Date(2026, 9, 8, 0, 0)), false, 'el 8');
  igual(L.enVentanaDeBono(SEP_29), false, 'el 29');
});

prueba('fuera de la ventana el bono igual suma XP', () => {
  // La ventana decide el cartel, no la cuenta.
  igual(soloBono(mesDeRutina('2026-08', 4, 0), SEP_29), L.XP_BONO_MENSUAL, 'agosto el 29/9');
});

prueba('mesAnterior cruza el anio', () => {
  igual(L.mesAnterior(new Date(2026, 0, 3)), '2025-12', 'enero');
  igual(L.mesAnterior(new Date(2026, 9, 1)), '2026-09', 'octubre');
});

// --- niveles ----------------------------------------------------------------

console.log('\nniveles:');

prueba('los bordes de cada nivel', () => {
  igual(L.nivelDesdeXP(0).nivel, 1, '0');
  igual(L.nivelDesdeXP(499).nivel, 1, '499');
  igual(L.nivelDesdeXP(500).nivel, 2, '500');
  igual(L.nivelDesdeXP(1000).nombre, 'Constante', '1000');
  igual(L.nivelDesdeXP(1999).nivel, 4, '1999');
});

prueba('el progreso es dentro del tramo, no sobre el total', () => {
  const n = L.nivelDesdeXP(720);
  igual(n.nivel, 2, 'nivel');
  igual(n.xpSiguiente, 1000, 'siguiente');
  cerca(n.progreso, 220 / 500, 1e-9, 'progreso');
  igual(L.nivelDesdeXP(500).progreso, 0, 'recien llegado');
});

prueba('pasado el nivel 5 la XP sigue sumando y no hay siguiente', () => {
  for (const xp of [2000, 2015, 9999]) {
    const n = L.nivelDesdeXP(xp);
    igual(n.nivel, 5, `nivel con ${xp}`);
    igual(n.nombre, 'Referente', `nombre con ${xp}`);
    igual(n.xpSiguiente, null, `sin siguiente con ${xp}`);
    igual(n.progreso, 1, `barra llena con ${xp}`);
    igual(n.xpActual, xp, `la XP no se recorta con ${xp}`);
  }
});

prueba('textoXP separa miles con punto', () => {
  igual(L.textoXP(720), '720', 'sin miles');
  igual(L.textoXP(1000), '1.000', 'mil');
  igual(L.textoXP(1234567), '1.234.567', 'millon');
});

// --- texto de progreso de la card -------------------------------------------

console.log('\ntexto de progreso:');

prueba('justo al empezar un nivel', () => {
  igual(L.textoProgresoNivel(500), 'faltan 500 XP para Constante', '500');
  igual(L.textoProgresoNivel(0), 'faltan 500 XP para En marcha', '0');
});

prueba('a mitad de nivel', () => {
  igual(L.textoProgresoNivel(720), 'faltan 280 XP para Constante', '720');
  igual(L.textoProgresoNivel(1250), 'faltan 250 XP para Firme', '1250');
});

prueba('a 1 XP del siguiente', () => {
  igual(L.textoProgresoNivel(999), 'falta 1 XP para Constante', '999');
  igual(L.textoProgresoNivel(1999), 'falta 1 XP para Referente', '1999');
});

prueba('en el nivel 5 y pasado el 5', () => {
  igual(L.textoProgresoNivel(2000), 'Nivel máximo · 2.000 XP', 'justo en el 5');
  igual(L.textoProgresoNivel(2340), 'Nivel máximo · 2.340 XP', 'pasado el 5');
  igual(L.textoProgresoNivel(12500), 'Nivel máximo · 12.500 XP', 'con miles');
  igual(L.nivelDesdeXP(2340).progreso, 1, 'la barra va llena');
});

prueba('el progreso de la barra es dentro del nivel actual', () => {
  igual(L.nivelDesdeXP(500).progreso, 0, 'al empezar');
  cerca(L.nivelDesdeXP(720).progreso, (720 - 500) / (1000 - 500), 1e-9, 'a mitad');
  cerca(L.nivelDesdeXP(999).progreso, 499 / 500, 1e-9, 'a 1 XP');
});

// --- texto de "Como sumas puntos" ------------------------------------------

console.log('\ncomo sumas puntos:');

prueba('el texto dice los valores de hoy', () => {
  const t = L.textosComoSumas();
  igual(t.titulo, 'Cómo sumás puntos', 'titulo');
  igual(
    t.reglas[0],
    '+15 por cada entrenamiento que completás, de cualquier tipo: gimnasio, cancha, pasadas o cronómetro.',
    'regla de sesion',
  );
  igual(
    t.reglas[1],
    '+50 al cerrar un mes en el que fuiste al 75% o más de tus rutinas agendadas. ' +
      'Cuenta desde 4 rutinas respondidas en el mes.',
    'regla del bono',
  );
  igual(t.niveles.map((n) => n.desde),
    ['desde 0 XP', 'desde 500 XP', 'desde 1.000 XP', 'desde 1.500 XP', 'desde 2.000 XP'], 'umbrales');
});

prueba('los numeros del texto salen de las constantes, no escritos a mano', () => {
  const t = L.textosComoSumas();
  const pct = Math.round(L.UMBRAL_BONO * 100);
  cierto(t.reglas[0].startsWith(`+${L.XP_POR_SESION} `), 'XP_POR_SESION');
  cierto(t.reglas[1].startsWith(`+${L.XP_BONO_MENSUAL} `), 'XP_BONO_MENSUAL');
  cierto(t.reglas[1].includes(`${pct}%`), 'UMBRAL_BONO');
  cierto(t.reglas[1].includes(`desde ${L.MINIMO_RESPONDIDOS_BONO} rutinas`), 'MINIMO_RESPONDIDOS_BONO');
  igual(t.niveles.length, L.NIVELES.length, 'una fila por nivel');
  L.NIVELES.forEach((n, i) => {
    igual(t.niveles[i].nombre, n.nombre, `nombre ${n.nivel}`);
    igual(t.niveles[i].desde, `desde ${L.textoXP(n.xpDesde)} XP`, `umbral ${n.nivel}`);
  });
});

prueba('informa sin festejar', () => {
  const t = L.textosComoSumas();
  const todo = [t.titulo, ...t.reglas, t.cierre, ...t.niveles.map((n) => n.desde)].join(' ');
  igual(/[!¡]/.test(todo), false, 'sin signos de exclamacion');
});

// --- datos historicos del perfil --------------------------------------------

console.log('\nhistoricos:');

prueba('mejor racha de semanas: la mas larga, no la actual', () => {
  const eventos = [
    // tres semanas seguidas (lunes 7, 14 y 21 de septiembre de 2026)
    ev('2026-09-07'), ev('2026-09-16'), ev('2026-09-27'), // el 27 es domingo: semana del 21
    // hueco, y despues una sola semana
    ev('2026-10-12'),
  ];
  igual(L.mejorRachaSemanas(eventos), 3, 'tres');
});

prueba('varias sesiones en una semana cuentan una sola semana', () => {
  igual(L.mejorRachaSemanas([ev('2026-09-07'), ev('2026-09-08'), ev('2026-09-13')]), 1, 'una');
});

prueba('la racha cruza el anio', () => {
  igual(L.mejorRachaSemanas([ev('2026-12-28'), ev('2027-01-04')]), 2, 'dos');
});

prueba('lo no completado no arma racha', () => {
  igual(L.mejorRachaSemanas([ev('2026-09-07'), ev('2026-09-14', { completado: 0 })]), 1, 'una');
  igual(L.mejorRachaSemanas([]), 0, 'nada');
});

// --- salida ----------------------------------------------------------------

rmSync(tmp, { recursive: true, force: true });

console.log(`\n${ok} pasan, ${fallos.length} fallan`);
if (fallos.length) {
  for (const f of fallos) console.log('  -', f);
  process.exit(1);
}
