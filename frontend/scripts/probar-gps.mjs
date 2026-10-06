// Pruebas de los km por GPS del cronometro libre, contra el modulo REAL
// src/features/entrenamiento/gps.ts.
//
//   node scripts/probar-gps.mjs
//
// Mismo molde que probar-gasto.mjs: compila el archivo solo, sin shims de
// expo, y no toca la base.
//
// EL RUIDO. Las rutas simuladas usan ruido CORRELACIONADO (Gauss-Markov de
// primer orden, tau 20 s): asi se comporta el error de un GPS, que deriva de
// a poco y no salta a un lugar nuevo cada segundo. Con ruido independiente
// punto a punto de +-8 m, ningun umbral de este tipo alcanza: quieto se
// acumularian decenas de metros. Si en la calle aparece eso, el arreglo no es
// subir umbrales sino usar coords.speed (Doppler) como filtro de quieto.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, '..');

// --- compilar a CommonJS en un temporal ------------------------------------

const tmp = mkdtempSync(join(tmpdir(), 'probar-gps-'));
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
    include: [join(RAIZ, 'src/features/entrenamiento/gps.ts')],
  }),
);

try {
  execFileSync('npx', ['tsc', '-p', tsconfig], { cwd: RAIZ, stdio: 'pipe' });
} catch (e) {
  console.error('tsc fallo al compilar:\n' + (e.stdout?.toString() ?? e.message));
  process.exit(1);
}

const req = createRequire(join(build, 'x.cjs'));
const G = req('./features/entrenamiento/gps.js');

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

function cerca(actual, esperado, tolerancia, que) {
  if (!(Math.abs(actual - esperado) <= tolerancia)) {
    throw new Error(`${que}: esperaba ${esperado} +-${tolerancia}, dio ${actual}`);
  }
}

function menor(actual, tope, que) {
  if (!(actual < tope)) throw new Error(`${que}: esperaba menos de ${tope}, dio ${actual}`);
}

// --- fabricas ------------------------------------------------------------------

// Plano local alrededor de Palermo: x hacia el este, y hacia el norte, en m.
const LAT0 = -34.58;
const LON0 = -58.42;
const M_LAT = 1 / 111195;
const M_LON = 1 / (111195 * Math.cos((LAT0 * Math.PI) / 180));

/** Un punto a (x, y) metros del origen, con precision p, en el segundo s. */
const pt = (x, y, s, p = 5) => ({ lat: LAT0 + y * M_LAT, lon: LON0 + x * M_LON, precisionM: p, t: s * 1000 });

/** PRNG con semilla (mulberry32): las simulaciones dan siempre lo mismo. */
function rng(semilla) {
  let s = semilla;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const gauss = (r) => Math.sqrt(-2 * Math.log(r() || 1e-12)) * Math.cos(2 * Math.PI * r());

/** Ruido Gauss-Markov: cada llamada avanza un segundo. */
function ruidoCorrelacionado(r, sigma, tope = Infinity, tauSeg = 20) {
  const a = Math.exp(-1 / tauSeg);
  const b = Math.sqrt(1 - a * a) * sigma;
  let x = 0;
  let y = 0;
  return () => {
    x = Math.max(-tope, Math.min(tope, a * x + b * gauss(r)));
    y = Math.max(-tope, Math.min(tope, a * y + b * gauss(r)));
    return [x, y];
  };
}

const sumar = (puntos, actividad = 'correr') => G.acumularDistancia(puntos, actividad);

// --- haversine --------------------------------------------------------------

console.log('\nhaversine:');

prueba('un grado de latitud son ~111,19 km', () => {
  cerca(G.haversineKm({ lat: 0, lon: 0 }, { lat: 1, lon: 0 }), 111.195, 0.01, 'ecuador');
  cerca(G.haversineKm({ lat: -35, lon: -58 }, { lat: -34, lon: -58 }), 111.195, 0.01, 'en Buenos Aires');
});

prueba('un grado de longitud a 60° son la mitad', () => {
  cerca(G.haversineKm({ lat: 60, lon: 0 }, { lat: 60, lon: 1 }), 55.6, 0.05, 'a 60°');
});

prueba('París - Londres ~343,5 km', () => {
  cerca(G.haversineKm({ lat: 48.8566, lon: 2.3522 }, { lat: 51.5074, lon: -0.1278 }), 343.5, 1, 'París-Londres');
});

prueba('el mismo punto da 0 y es simetrica', () => {
  const a = { lat: -34.6037, lon: -58.3816 };
  const b = { lat: -34.6083, lon: -58.3712 };
  igual(G.haversineKm(a, a), 0, 'mismo punto');
  cerca(G.haversineKm(a, b), G.haversineKm(b, a), 1e-12, 'simetria');
});

// --- filtros ------------------------------------------------------------------

console.log('\nfiltros:');

prueba('100 m en linea recta con buena precision dan 100 m', () => {
  const puntos = Array.from({ length: 11 }, (_, i) => pt(i * 10, 0, i * 4, 4));
  cerca(sumar(puntos) * 1000, 100, 0.5, '100 m');
});

prueba('precision peor que 25 m: el punto no cuenta', () => {
  const puntos = [pt(0, 0, 0), pt(50, 0, 20, 30), pt(100, 0, 40)];
  // El de 30 m se ignora: del primero al tercero son 100 m igual.
  cerca(sumar(puntos) * 1000, 100, 0.5, 'saltea el malo');
  igual(sumar([pt(0, 0, 0), pt(50, 0, 20, 26)]), 0, 'solo malo, nada');
});

prueba('el primer punto espera precision de 15 m o mejor', () => {
  // 20 m de precision: sirve para sumar, no para anclar.
  const e1 = G.agregarPunto(G.ESTADO_GPS_INICIAL, pt(0, 0, 0, 20), 'correr', 0);
  igual(e1.ultimo, null, 'no ancla con 20 m');
  const e2 = G.agregarPunto(e1, pt(0, 0, 1, 15), 'correr', 1000);
  igual(e2.ultimo !== null, true, 'ancla con 15 m');
  // Y ya anclado, uno de 20 m suma.
  const e3 = G.agregarPunto(e2, pt(60, 0, 20, 20), 'correr', 20000);
  cerca(e3.km * 1000, 60, 0.5, 'suma con 20 m despues de anclar');
});

prueba('sin puntos de 15 m, a los 10 s ancla en el mejor de hasta 25 m', () => {
  let e = G.ESTADO_GPS_INICIAL;
  // Cada 4 s, 4 m mas adelante. El de 18 m (s = 4) es el mejor.
  e = G.agregarPunto(e, pt(0, 0, 0, 22), 'caminar', 0);
  e = G.agregarPunto(e, pt(4, 0, 4, 18), 'caminar', 4000);
  e = G.agregarPunto(e, pt(8, 0, 8, 24), 'caminar', 8000);
  igual(e.ultimo, null, 'antes de los 10 s no ancla');
  igual(e.candidata.precisionM, 18, 'guarda la mejor');

  // A los 12 s ancla en la de 18 m y mide este punto contra ella: 60 - 4.
  e = G.agregarPunto(e, pt(60, 0, 12, 22), 'caminar', 12000);
  igual(e.ultimo.precisionM, 22, 'el punto actual sumo y es el ancla nueva');
  cerca(e.km * 1000, 56, 0.5, 'lo caminado durante la espera cuenta');
  igual(e.primerPuntoSesionMs, 12000, 'empezo a medir al anclar');
});

prueba('si llega uno de 15 m durante la espera, ancla en ese', () => {
  let e = G.agregarPunto(G.ESTADO_GPS_INICIAL, pt(0, 0, 0, 22), 'caminar', 0);
  e = G.agregarPunto(e, pt(4, 0, 4, 12), 'caminar', 4000);
  igual(e.ultimo.precisionM, 12, 'ancla enseguida');
  igual(e.candidata, null, 'sin candidata');
});

prueba('cortar el tramo descarta la candidata', () => {
  let e = G.agregarPunto(G.ESTADO_GPS_INICIAL, pt(0, 0, 0, 22), 'caminar', 0);
  e = G.cortarTramo(e);
  igual(e.candidata, null, 'sin candidata');
  // Y la espera arranca de nuevo: a los 12 s del corte todavia no alcanza.
  e = G.agregarPunto(e, pt(10, 0, 100, 22), 'caminar', 100000);
  e = G.agregarPunto(e, pt(14, 0, 105, 22), 'caminar', 105000);
  igual(e.ultimo, null, 'la espera es por tramo');
});

prueba('salto de mas de 45 km/h a pie se descarta', () => {
  // 100 m en 5 s = 72 km/h.
  igual(sumar([pt(0, 0, 0), pt(100, 0, 5)], 'correr'), 0, 'correr');
  igual(sumar([pt(0, 0, 0), pt(100, 0, 5)], 'caminar'), 0, 'caminar');
  // 100 m en 10 s = 36 km/h: pasa.
  cerca(sumar([pt(0, 0, 0), pt(100, 0, 10)], 'correr') * 1000, 100, 0.5, '36 km/h');
});

prueba('en bici el tope es 80 km/h', () => {
  // 100 m en 5 s = 72 km/h: en bici pasa.
  cerca(sumar([pt(0, 0, 0), pt(100, 0, 5)], 'bici') * 1000, 100, 0.5, '72 km/h');
  // 100 m en 4 s = 90 km/h: no.
  igual(sumar([pt(0, 0, 0), pt(100, 0, 4)], 'bici'), 0, '90 km/h');
});

prueba('un rebote suelto no mueve el ancla ni suma', () => {
  const puntos = [pt(0, 0, 0), pt(20, 0, 5), pt(220, 0, 6), pt(40, 0, 10), pt(60, 0, 15)];
  cerca(sumar(puntos) * 1000, 60, 0.5, 'el rebote no cuenta');
});

prueba('si el ancla es el rebote, a los 3 saltos se reancla sin sumarlo', () => {
  // El primer punto esta 150 m corrido. Despues se corre normal a 3,3 m/s.
  const puntos = [pt(150, 0, 0)];
  for (let s = 1; s <= 60; s++) puntos.push(pt(s * 3.33, 0, s));
  const km = sumar(puntos);
  // Sin reanclar, cuando la velocidad "alcanza" se sumarian ~150 m falsos.
  // Reanclando, se pierden los primeros segundos: menos de 200 m reales.
  menor(km * 1000, 200, 'no suma el salto');
  cerca(km * 1000, 190, 15, 'el resto si');
});

prueba('movimiento menor a la suma de precisiones no suma, y el ancla queda', () => {
  // 8 + 8 = 16 m de umbral: 12 m no alcanzan.
  igual(sumar([pt(0, 0, 0, 8), pt(12, 0, 10, 8)]), 0, '12 m con 8+8');
  // Pero caminando despacio, con puntos cada 5 m, el ancla fija junta la
  // distancia hasta superar el umbral y entra entera.
  const puntos = Array.from({ length: 41 }, (_, i) => pt(i * 5, 0, i * 4, 8));
  const m = sumar(puntos, 'caminar') * 1000;
  // Pierde como mucho el ultimo pedazo sin cerrar (< 16 m).
  menor(200 - m, 16.01, 'caminata de 200 m');
});

prueba('el piso de 3 m vale con precision casi perfecta', () => {
  igual(sumar([pt(0, 0, 0, 1), pt(2.5, 0, 5, 1)]), 0, '2,5 m con 1+1');
  cerca(sumar([pt(0, 0, 0, 1), pt(4, 0, 5, 1)]) * 1000, 4, 0.01, '4 m con 1+1');
});

prueba('un punto que no cambia nada devuelve el mismo estado', () => {
  const e = G.agregarPunto(G.ESTADO_GPS_INICIAL, pt(0, 0, 0), 'correr', 0);
  igual(G.agregarPunto(e, pt(1, 0, 1), 'correr', 1000) === e, true, 'ruido');
  igual(G.agregarPunto(e, pt(0, 0, 1, 40), 'correr', 1000) === e, true, 'precision mala');
  igual(G.cortarTramo(G.ESTADO_GPS_INICIAL) === G.ESTADO_GPS_INICIAL, true, 'cortar sin ancla');
});

prueba('puntos fuera de orden o con NaN se ignoran', () => {
  igual(sumar([pt(0, 0, 10), pt(100, 0, 5)]), 0, 'tiempo para atras');
  igual(sumar([pt(0, 0, 0), { lat: NaN, lon: 0, precisionM: 5, t: 5000 }]), 0, 'NaN');
});

// --- pausa -------------------------------------------------------------------

console.log('\npausa y segundo plano:');

prueba('la pausa no une tramos', () => {
  let e = G.ESTADO_GPS_INICIAL;
  for (let s = 0; s <= 30; s++) e = G.agregarPunto(e, pt(s * 3.33, 0, s), 'correr', s * 1000);
  const antes = e.km;
  // Hasta 10 m menos (5 + 5 de umbral): el ultimo pedazo sin cerrar.
  cerca(antes * 1000, 95, 5.1, 'primer tramo');

  e = G.cortarTramo(e);
  igual(e.ultimo, null, 'sin ancla');

  // Durante la pausa camino 500 m sin que lleguen puntos. Al reanudar, el
  // primer punto ancla y NO se une al ultimo de antes.
  let km2 = e.km;
  for (let s = 0; s <= 30; s++) {
    e = G.agregarPunto(e, pt(600 + s * 3.33, 0, 400 + s), 'correr', (31 + s) * 1000);
    if (s === 0) km2 = e.km;
  }
  igual(km2, antes, 'el primer punto despues de la pausa no suma');
  cerca(e.km * 1000, 190, 10.1, 'dos tramos de 100 m, no 700');
});

prueba('cortar dos veces seguidas es lo mismo que una', () => {
  const e = G.agregarPunto(G.ESTADO_GPS_INICIAL, pt(0, 0, 0), 'correr', 0);
  const c = G.cortarTramo(e);
  igual(G.cortarTramo(c) === c, true, 'idempotente');
});

// --- señal -------------------------------------------------------------------

console.log('\nseñal:');

prueba('sin permiso, siempre sinGps', () => {
  igual(G.senalGps(G.ESTADO_GPS_INICIAL, 0, false), 'sinGps', 'al arrancar');
});

prueba('buscando hasta los 30 s, sinGps despues', () => {
  igual(G.senalGps(G.ESTADO_GPS_INICIAL, 29_999, true), 'buscando', '29,9 s');
  igual(G.senalGps(G.ESTADO_GPS_INICIAL, 30_000, true), 'sinGps', '30 s');
});

prueba('con señal desde el principio no es parcial', () => {
  const e = G.agregarPunto(G.ESTADO_GPS_INICIAL, pt(0, 0, 5), 'correr', 5000);
  igual(G.senalGps(e, 5000, true), 'ok', 'ok');
  igual(G.gpsParcial(e), false, 'no parcial');
});

prueba('sesion que arranca sin puntos y los recibe desde el minuto 2', () => {
  let e = G.ESTADO_GPS_INICIAL;

  // Adentro: llegan puntos, pero con precision de 40 a 60 m. No anclan.
  for (let s = 0; s < 120; s += 5) {
    e = G.agregarPunto(e, pt(s * 0.2, 0, s, 40 + (s % 20)), 'correr', s * 1000);
  }
  igual(G.senalGps(e, 10_000, true), 'buscando', 'a los 10 s');
  igual(G.senalGps(e, 31_000, true), 'sinGps', 'a los 31 s');
  igual(G.senalGps(e, 119_000, true), 'sinGps', 'a los 119 s');
  igual(e.km, 0, 'nada sumado adentro');

  // Sale a la calle en el minuto 2 y corre 5 min a 12 km/h.
  for (let s = 120; s <= 420; s++) {
    e = G.agregarPunto(e, pt(1000 + (s - 120) * 3.33, 0, s, 5), 'correr', s * 1000);
  }
  igual(G.senalGps(e, 420_000, true), 'ok', 'vuelve a ok');
  igual(G.gpsParcial(e), true, 'parcial');
  igual(G.minutoInicioGps(e), 2, 'minuto 2');
  // Cuenta desde ahi: 300 s a 3,33 m/s, menos el ultimo pedazo sin cerrar.
  cerca(e.km * 1000, 1000, 12, 'solo lo de afuera');
});

prueba('el minuto del aviso nunca es 0', () => {
  const e = G.agregarPunto(G.ESTADO_GPS_INICIAL, pt(0, 0, 40), 'correr', 40_000);
  igual(G.gpsParcial(e), true, 'a los 40 s ya es parcial');
  igual(G.minutoInicioGps(e), 1, 'minuto 1');
});

// --- simulaciones -----------------------------------------------------------

console.log('\nsimulaciones:');

prueba('parado 60 s con ruido de ±8 m: menos de 20 m acumulados', () => {
  let peor = 0;
  for (let semilla = 1; semilla <= 200; semilla++) {
    const r = rng(semilla);
    const ruido = ruidoCorrelacionado(r, 4, 8);
    const puntos = [];
    for (let s = 0; s < 60; s++) {
      const [nx, ny] = ruido();
      // La precision que reporta el iPhone quieto: entre 5 y 10 m.
      puntos.push(pt(nx, ny, s, 5 + r() * 5));
    }
    peor = Math.max(peor, sumar(puntos) * 1000);
  }
  console.log(`      peor de 200 semillas: ${peor.toFixed(1)} m`);
  menor(peor, 20, 'metros acumulados quieto');
});

prueba('ruta de 5 km con ruido y saltos falsos: error menor a 3%', () => {
  let peor = 0;
  for (let semilla = 1; semilla <= 50; semilla++) {
    const r = rng(semilla);
    const ruido = ruidoCorrelacionado(r, 3);
    let x = 0;
    let y = 0;
    let rumbo = r() * 2 * Math.PI;
    let real = 0;
    let s = 0;
    let anterior = null;
    let e = G.ESTADO_GPS_INICIAL;

    // 12 km/h con curvas suaves, un punto por segundo.
    while (real < 5000) {
      rumbo += (r() - 0.5) * 0.1;
      const paso = 12 / 3.6;
      x += paso * Math.cos(rumbo);
      y += paso * Math.sin(rumbo);
      real += paso;
      s++;

      const [nx, ny] = ruido();
      let px = x + nx;
      let py = y + ny;
      // 1 de cada 100 puntos es un rebote de 80 a 200 m.
      if (r() < 0.01) {
        const m = 80 + r() * 120;
        const a = r() * 2 * Math.PI;
        px += m * Math.cos(a);
        py += m * Math.sin(a);
      }
      // distanceInterval de 5 m, como en watchPositionAsync.
      if (anterior && Math.hypot(px - anterior[0], py - anterior[1]) < 5) continue;
      anterior = [px, py];

      e = G.agregarPunto(e, pt(px, py, s, 5 + r() * 3), 'correr', s * 1000);
    }
    peor = Math.max(peor, Math.abs(e.km * 1000 - real) / real);
  }
  console.log(`      peor de 50 semillas: ${(peor * 100).toFixed(2)}%`);
  menor(peor, 0.03, 'error relativo');
});

/**
 * Caminata en linea recta de `metros` a `kmh`, con un punto cada 5 m
 * (distanceInterval) y la precision que devuelve `precision(r)`. El ruido es
 * correlacionado, con sigma de un tercio de la precision: el radio que
 * reporta el iPhone cubre la gran mayoria de los puntos.
 */
function caminata(semilla, { metros, kmh, precision }) {
  const r = rng(semilla);
  const mps = kmh / 3.6;
  let e = G.ESTADO_GPS_INICIAL;
  let ruido = null;
  for (let d = 0; d <= metros; d += 5) {
    const p = precision(r);
    ruido ??= ruidoCorrelacionado(r, p / 3);
    // El ruido avanza un paso por segundo, y entre punto y punto pasan 5/mps.
    let n;
    for (let k = 0; k < Math.round(5 / mps); k++) n = ruido();
    const s = d / mps;
    e = G.agregarPunto(e, pt(d + n[0], n[1], s, p), 'caminar', s * 1000);
  }
  return e.km;
}

prueba('caminata a 4 km/h, 1 km, precision 10-15 m: 1 km ±5%', () => {
  let peor = 0;
  for (let semilla = 1; semilla <= 50; semilla++) {
    const km = caminata(semilla, { metros: 1000, kmh: 4, precision: (r) => 10 + r() * 5 });
    peor = Math.max(peor, Math.abs(km - 1));
  }
  console.log(`      peor de 50 semillas: ${(peor * 100).toFixed(2)}%`);
  menor(peor, 0.05, 'error relativo');
});

prueba('caminata a 3 km/h, 1 km, precision 20 m: 1 km ±5%', () => {
  let peor = 0;
  for (let semilla = 1; semilla <= 50; semilla++) {
    const km = caminata(semilla, { metros: 1000, kmh: 3, precision: () => 20 });
    peor = Math.max(peor, Math.abs(km - 1));
  }
  console.log(`      peor de 50 semillas: ${(peor * 100).toFixed(2)}%`);
  menor(peor, 0.05, 'error relativo');
});

// --- salida ----------------------------------------------------------------

rmSync(tmp, { recursive: true, force: true });

console.log(`\n${ok} pasan, ${fallos.length} fallan`);
if (fallos.length) {
  for (const f of fallos) console.log('  -', f);
  process.exit(1);
}
