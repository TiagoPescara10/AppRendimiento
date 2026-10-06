// Pruebas de los avisos antes y despues de los eventos, contra los modulos
// REALES de src/features/avisos/.
//
//   node scripts/probar-avisos.mjs
//
// Dos partes:
//   1. planificar.ts, que es puro: que avisos salen, cuando y que dicen.
//   2. sincronizar.ts contra la base real (shim de expo-sqlite) y un shim de
//      expo-notifications que cuenta las corridas: que materializar una rutina
//      termine en UNA sincronizacion y que un error de los avisos no corte la
//      escritura que lo disparo.

// Zona horaria fija antes de cualquier Date: el silencio de 23 a 7 y "la
// noche anterior" son horas LOCALES.
process.env.TZ = 'America/Argentina/Buenos_Aires';

import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, '..');

// --- compilar a CommonJS en un temporal ------------------------------------

const tmp = mkdtempSync(join(tmpdir(), 'probar-avisos-'));
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
      strict: false,
      outDir: build,
      rootDir: join(RAIZ, 'src'),
      types: [],
    },
    // Archivos sueltos de avisos y no el glob: configurar.ts y permiso.ts
    // importan react-native, que no se puede cargar en node.
    include: [
      join(RAIZ, 'src/db/**/*.ts'),
      join(RAIZ, 'src/features/agenda/**/*.ts'),
      join(RAIZ, 'src/features/avisos/planificar.ts'),
      join(RAIZ, 'src/features/avisos/sincronizar.ts'),
    ],
  }),
);

try {
  execFileSync('npx', ['tsc', '-p', tsconfig], { cwd: RAIZ, stdio: 'pipe' });
} catch (e) {
  console.error('tsc fallo al compilar:\n' + (e.stdout?.toString() ?? e.message));
  process.exit(1);
}

const instalarShim = (paquete, archivo) => {
  const dir = join(tmp, 'node_modules', paquete);
  mkdirSync(dir, { recursive: true });
  copyFileSync(join(AQUI, archivo), join(dir, 'index.js'));
  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify({ name: paquete, version: '0.0.0-shim', main: 'index.js' }),
  );
};

instalarShim('expo-sqlite', 'shim-expo-sqlite.cjs');
instalarShim('expo-crypto', 'shim-expo-crypto.cjs');
instalarShim('expo-notifications', 'shim-expo-notifications.cjs');

const req = createRequire(join(build, 'x.cjs'));
const P = req('./features/avisos/planificar.js');

// --- corredor --------------------------------------------------------------

let ok = 0;
const fallos = [];

async function prueba(nombre, fn) {
  try {
    await fn();
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

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

// --- fabricas --------------------------------------------------------------

let siguienteId = 1;

/** Evento futuro sin responder. `cuando` es 'YYYY-MM-DDTHH:MM', hora local. */
function ev(cuando, extra = {}) {
  return {
    id: `e${siguienteId++}`,
    tipo: 'partido',
    fecha_hora_inicio: `${cuando}:00-03:00`,
    duracion_estimada_min: 90,
    completado: 0,
    respondido: 0,
    rutina_id: null,
    rutina_gimnasio_id: null,
    modo_entrenamiento: null,
    deporte: null,
    ...extra,
  };
}

const AHORA = new Date('2026-10-06T10:00:00-03:00');

function plan(eventos, extra = {}) {
  return P.planificarAvisos({
    eventos,
    pesoKg: 70,
    modoNutricion: 'objetivo',
    deportePrincipal: null,
    preferencias: P.PREFERENCIAS_POR_DEFECTO,
    ahora: AHORA,
    ...extra,
  });
}

/** "06/10 15:00": dia y hora local, para comparar sin pelear con offsets. */
function cuando(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

const resumen = (avisos) => avisos.map((a) => `${a.momento} ${cuando(a.fecha)}`);

// ---------------------------------------------------------------------------
// 1. Planificacion
// ---------------------------------------------------------------------------

console.log('\nplanificar');

await prueba('partido: 3 h antes, 1 h antes y al terminar, con gramos', () => {
  const e = ev('2026-10-06T18:00');
  const a = plan([e]);
  igual(resumen(a), ['pre3h 06/10 15:00', 'pre1h 06/10 17:00', 'post 06/10 19:30'], 'momentos');
  igual(a[0].titulo, 'Partido en 3 horas', 'titulo pre3h');
  igual(
    a[0].cuerpo,
    'Comé algo con carbohidratos: unos 70 g, por ejemplo un plato de fideos o arroz. Liviano en grasas.',
    'cuerpo pre3h',
  );
  igual(a[1].titulo, 'Falta una hora', 'titulo pre1h');
  igual(a[1].cuerpo, 'Tomá agua y no comas nada pesado hasta después.', 'cuerpo pre1h');
  igual(a[2].titulo, '¿Cómo salió?', 'titulo post');
  // 70 x 0,3 = 21 -> 20
  igual(a[2].cuerpo, 'En la próxima hora sumá proteína: unos 20 g.', 'cuerpo post');
  igual(a.map((x) => x.id), [`aviso-${e.id}-pre3h`, `aviso-${e.id}-pre1h`, `aviso-${e.id}-post`], 'ids');
  cierto(a.every((x) => x.eventoId === e.id), 'eventoId');
});

await prueba('competencia: mismos momentos que el partido', () => {
  const a = plan([ev('2026-10-06T18:00', { tipo: 'competencia' })]);
  igual(resumen(a), ['pre3h 06/10 15:00', 'pre1h 06/10 17:00', 'post 06/10 19:30'], 'momentos');
  igual(a[0].titulo, 'Competencia en 3 horas', 'titulo');
});

await prueba('entrenamiento: 2 h antes y al terminar, con el deporte en el titulo', () => {
  const a = plan([ev('2026-10-06T19:00', { tipo: 'entrenamiento', deporte: 'futbol' })]);
  igual(resumen(a), ['pre2h 06/10 17:00', 'post 06/10 20:30'], 'momentos');
  igual(a[0].titulo, 'Fútbol en 2 horas', 'titulo');
  igual(a[0].cuerpo, 'Comé algo liviano con carbohidratos, como una banana o unas tostadas.', 'cuerpo');
  igual(a[1].cuerpo, 'En la próxima hora sumá proteína: unos 20 g.', 'post');
});

await prueba('entrenamiento sin deporte propio usa el deporte principal', () => {
  const a = plan([ev('2026-10-06T19:00', { tipo: 'entrenamiento' })], { deportePrincipal: 'basquet' });
  igual(a[0].titulo, 'Básquet en 2 horas', 'titulo');
  const b = plan([ev('2026-10-06T19:00', { tipo: 'entrenamiento' })]);
  igual(b[0].titulo, 'Entrenamiento en 2 horas', 'sin deporte');
});

await prueba('entrenamiento sin duracion: el post sale a los 90 min', () => {
  const a = plan([ev('2026-10-06T19:00', { tipo: 'entrenamiento', duracion_estimada_min: null })]);
  igual(resumen(a), ['pre2h 06/10 17:00', 'post 06/10 20:30'], 'momentos');
});

await prueba('gimnasio: 2 h antes y al terminar', () => {
  const a = plan([ev('2026-10-06T19:00', { tipo: 'gimnasio', duracion_estimada_min: 60 })]);
  igual(resumen(a), ['pre2h 06/10 17:00', 'post 06/10 20:00'], 'momentos');
  igual(a[0].titulo, 'Gimnasio en 2 horas', 'titulo');
});

await prueba('"Para el gimnasio tambien" apagado: el gimnasio no avisa, el resto si', () => {
  const pref = { ...P.PREFERENCIAS_POR_DEFECTO, gimnasio: false };
  const a = plan(
    [
      ev('2026-10-06T19:00', { tipo: 'gimnasio' }),
      ev('2026-10-06T19:00', { tipo: 'entrenamiento', rutina_gimnasio_id: 'rg1' }),
      ev('2026-10-06T18:00'),
    ],
    { preferencias: pref },
  );
  igual(resumen(a), ['pre3h 06/10 15:00', 'pre1h 06/10 17:00', 'post 06/10 19:30'], 'solo el partido');
});

await prueba('sin peso: los mismos textos sin gramos', () => {
  const a = plan([ev('2026-10-06T18:00')], { pesoKg: null });
  igual(resumen(a), ['pre3h 06/10 15:00', 'pre1h 06/10 17:00', 'post 06/10 19:30'], 'momentos');
  igual(
    a[0].cuerpo,
    'Comé algo con carbohidratos, por ejemplo un plato de fideos o arroz. Liviano en grasas.',
    'pre3h',
  );
  igual(a[2].cuerpo, 'En la próxima hora sumá proteína.', 'post');
});

await prueba('recuento: sin gramos aunque haya peso; las horas quedan', () => {
  const a = plan([ev('2026-10-06T18:00'), ev('2026-10-06T19:00', { tipo: 'gimnasio' })], {
    modoNutricion: 'recuento',
  });
  for (const x of a) cierto(!/\d/.test(x.cuerpo), `sin numeros en el cuerpo de ${x.momento}: ${x.cuerpo}`);
  cierto(!a.some((x) => / g\b/.test(x.cuerpo)), 'sin gramos');
  igual(a[0].titulo, 'Partido en 3 horas', 'la hora del titulo queda');
});

await prueba('redondeo: carbos a 10 y proteina a 5', () => {
  const a = plan([ev('2026-10-06T18:00')], { pesoKg: 76 });
  cierto(a[0].cuerpo.includes('unos 80 g'), `76 -> 80: ${a[0].cuerpo}`);
  cierto(a[2].cuerpo.includes('unos 25 g'), `22,8 -> 25: ${a[2].cuerpo}`);
  const b = plan([ev('2026-10-06T18:00')], { pesoKg: 73 });
  cierto(b[0].cuerpo.includes('unos 70 g'), `73 -> 70: ${b[0].cuerpo}`);
  cierto(b[2].cuerpo.includes('unos 20 g'), `21,9 -> 20: ${b[2].cuerpo}`);
});

await prueba('partido a las 9: el de 3 h antes va la noche anterior a las 21', () => {
  const e = ev('2026-10-07T09:00');
  const a = plan([e]);
  igual(resumen(a), ['noche 06/10 21:00', 'pre1h 07/10 08:00', 'post 07/10 10:30'], 'momentos');
  igual(a[0].id, `aviso-${e.id}-noche`, 'id');
  igual(a[0].titulo, 'Partido mañana', 'titulo');
  igual(a[0].cuerpo, 'Mañana a las 9:00 tenés partido. Cená con carbohidratos.', 'cuerpo');
});

await prueba('entrenamiento a las 8: el de 2 h antes va la noche anterior', () => {
  const a = plan([ev('2026-10-07T08:00', { tipo: 'entrenamiento', deporte: 'futbol' })]);
  igual(resumen(a), ['noche 06/10 21:00', 'post 07/10 09:30'], 'momentos');
  igual(a[0].cuerpo, 'Mañana a las 8:00 tenés fútbol. Cená con carbohidratos.', 'cuerpo');
});

await prueba('partido a las 7:30: noche anterior y el de 1 h antes (6:30) se descarta', () => {
  const a = plan([ev('2026-10-07T07:30')]);
  igual(resumen(a), ['noche 06/10 21:00', 'post 07/10 09:00'], 'momentos');
});

await prueba('las 21 de la noche anterior ya pasaron: se mueve a las 7', () => {
  const a = plan([ev('2026-10-07T09:00')], { ahora: new Date('2026-10-06T22:00:00-03:00') });
  igual(resumen(a), ['pre3h 07/10 07:00', 'pre1h 07/10 08:00', 'post 07/10 10:30'], 'momentos');
  igual(a[0].titulo, 'Partido en 3 horas', 'texto normal');
});

await prueba('partido de madrugada: nada cae fuera del silencio, no avisa', () => {
  igual(resumen(plan([ev('2026-10-07T02:00')])), [], 'nada');
});

await prueba('el post que cae en silencio se descarta', () => {
  const a = plan([ev('2026-10-06T22:00')]);
  igual(resumen(a), ['pre3h 06/10 19:00', 'pre1h 06/10 21:00'], 'sin post a las 23:30');
});

await prueba('evento ya empezado: solo el post', () => {
  const a = plan([ev('2026-10-06T09:30')]);
  igual(resumen(a), ['post 06/10 11:00'], 'momentos');
});

await prueba('evento ya terminado: nada', () => {
  igual(resumen(plan([ev('2026-10-06T07:30')])), [], 'nada');
});

await prueba('nunca en el pasado: un pre que ya paso no se programa', () => {
  // 3 h antes de las 12 son las 9, ya pasaron; 1 h antes (11) no.
  const a = plan([ev('2026-10-06T12:00')]);
  igual(resumen(a), ['pre1h 06/10 11:00', 'post 06/10 13:30'], 'momentos');
  cierto(a.every((x) => x.fecha.getTime() > AHORA.getTime()), 'todo a futuro');
});

await prueba('eventos a mas de 7 dias no avisan', () => {
  const a = plan([ev('2026-10-12T18:00'), ev('2026-10-14T18:00'), ev('2026-11-01T18:00')]);
  igual(new Set(a.map((x) => x.eventoId)).size, 1, 'solo el de dentro de 6 dias');
  cierto(a.every((x) => x.fecha.getTime() <= AHORA.getTime() + 7 * 86_400_000), 'dentro de la ventana');
});

await prueba('"no fui" no avisa; un evento ya marcado como hecho si', () => {
  const noFui = ev('2026-10-06T18:00', { respondido: 1, completado: 0 });
  const hecho = ev('2026-10-06T18:00', { respondido: 1, completado: 1 });
  const a = plan([noFui, hecho]);
  cierto(!a.some((x) => x.eventoId === noFui.id), 'sin avisos del no fui');
  igual(a.filter((x) => x.eventoId === hecho.id).length, 3, 'el hecho sigue');
});

await prueba('preferencias: general, antes y despues', () => {
  const e = ev('2026-10-06T18:00');
  const D = P.PREFERENCIAS_POR_DEFECTO;
  igual(plan([e], { preferencias: { ...D, activos: false } }), [], 'general apagado');
  igual(resumen(plan([e], { preferencias: { ...D, antes: false } })), ['post 06/10 19:30'], 'sin antes');
  igual(
    resumen(plan([e], { preferencias: { ...D, despues: false } })),
    ['pre3h 06/10 15:00', 'pre1h 06/10 17:00'],
    'sin despues',
  );
  const b = plan([ev('2026-10-07T09:00')], { preferencias: { ...D, antes: false } });
  cierto(!b.some((x) => x.momento === 'noche'), 'sin antes tampoco hay noche anterior');
});

await prueba('ids unicos y deterministicos; ordenados por fecha; con tope', () => {
  const eventos = [];
  for (let d = 6; d <= 12; d++) {
    const dia = `2026-10-${String(d).padStart(2, '0')}`;
    eventos.push(ev(`${dia}T09:00`));
    eventos.push(ev(`${dia}T13:00`, { tipo: 'gimnasio' }));
    eventos.push(ev(`${dia}T18:00`, { tipo: 'entrenamiento', deporte: 'padel' }));
    eventos.push(ev(`${dia}T20:00`, { tipo: 'competencia' }));
  }
  const a = plan(eventos);
  const b = plan(eventos);
  igual(new Set(a.map((x) => x.id)).size, a.length, 'sin repetidos');
  igual(a.map((x) => x.id), b.map((x) => x.id), 'mismos ids en dos corridas');
  cierto(a.length <= P.MAX_AVISOS, `tope de ${P.MAX_AVISOS}: ${a.length}`);
  for (let i = 1; i < a.length; i++) {
    cierto(a[i - 1].fecha.getTime() <= a[i].fecha.getTime(), 'ordenados');
  }
  cierto(a.every((x) => x.id.startsWith(P.PREFIJO_AVISO)), 'prefijo');
});

await prueba('textos sin exclamaciones', () => {
  const a = plan([
    ev('2026-10-06T18:00'),
    ev('2026-10-07T09:00'),
    ev('2026-10-06T19:00', { tipo: 'gimnasio' }),
  ]);
  cierto(!a.some((x) => /[!¡]/.test(x.titulo + x.cuerpo)), 'sin !');
});

// ---------------------------------------------------------------------------
// 2. Sincronizacion
// ---------------------------------------------------------------------------

console.log('\nsincronizar');

const schema = req('./db/schema.js');
const cambios = req('./db/cambios.js');
const qPerfil = req('./db/queries/perfil.js');
const qPeso = req('./db/queries/peso.js');
const qEventos = req('./db/queries/eventos.js');
const agenda = req('./features/agenda/materializar.js');
const S = req('./features/avisos/sincronizar.js');
const N = req('expo-notifications').__estado;
const { aISOLocal } = req('./lib/fechas.js');

/** Lo que tarda en dispararse una sincronizacion pedida, con margen. */
const ESPERA = S.ESPERA_SINCRONIZAR_MS + 400;

// Los errores que se esperan van a console.error; se capturan para poder
// verificarlos y para no ensuciar la salida.
const erroresLogueados = [];
const consoleErrorOriginal = console.error;
console.error = (...args) => erroresLogueados.push(args.map(String).join(' '));

await schema.initDb(':memory:');
await qPerfil.crearPerfil({ id: 'u1', fecha_alta: '2026-08-31T10:00:00-03:00', deporte_principal: 'futbol' });
await qPeso.crearRegistroPeso({ id: 'p1', usuario_id: 'u1', peso_kg: 70, fecha: '2026-09-01', fuente: 'manual' });

// Una notificacion que no es nuestra: la sincronizacion no la puede tocar.
N.programadas.set('otra-cosa', { identifier: 'otra-cosa', content: {}, trigger: null });

const dejar = S.iniciarAvisos('u1');
await esperar(ESPERA);

const nuestras = () => [...N.programadas.keys()].filter((k) => k.startsWith('aviso-'));

await prueba('la migracion 020 deja los avisos activados por defecto', async () => {
  const p = await qPerfil.obtenerPerfil('u1');
  igual(
    [p.avisos_activos, p.avisos_antes, p.avisos_despues, p.avisos_gimnasio],
    [1, 1, 1, 1],
    'columnas',
  );
});

await prueba('materializar una rutina de 7 dias termina en UNA sincronizacion', async () => {
  N.corridas = 0;
  await agenda.programarRutinaSemanal({
    usuarioId: 'u1',
    tipo: 'entrenamiento',
    hora: '19:00',
    duracion_estimada_min: 60,
    intensidad: 'media',
    deporte: 'futbol',
    dias: [0, 1, 2, 3, 4, 5, 6].map((d) => ({ dia_semana: d, rutina_gimnasio_id: null })),
  });
  const creados = await qEventos.listarEventosPorRango('u1', '2000-01-01', '2100-01-01');
  cierto(creados.length > 20, `se crearon muchos eventos: ${creados.length}`);
  await esperar(ESPERA);
  igual(N.corridas, 1, 'corridas');
  cierto(nuestras().length > 0, 'programo avisos');
  cierto(N.programadas.has('otra-cosa'), 'la ajena sigue');
});

await prueba('crear un evento programa sus avisos y borrarlo los cancela', async () => {
  const inicio = new Date(Date.now() + 5 * 3_600_000);
  inicio.setSeconds(0, 0);
  // 5 h adelante puede caer en silencio segun la hora a la que corra la
  // prueba; lo que se verifica es que sus ids aparecen y desaparecen igual
  // que el plan.
  await qEventos.crearEvento({
    id: 'ev-borrar',
    usuario_id: 'u1',
    tipo: 'partido',
    fecha_hora_inicio: aISOLocal(inicio),
    duracion_estimada_min: 90,
    intensidad: 'alta',
  });
  await esperar(ESPERA);
  const esperados = P.planificarAvisos({
    eventos: [await qEventos.obtenerEvento('ev-borrar')],
    pesoKg: 70,
    modoNutricion: 'objetivo',
    deportePrincipal: 'futbol',
    preferencias: P.PREFERENCIAS_POR_DEFECTO,
    ahora: new Date(),
  }).map((a) => a.id);
  igual(nuestras().filter((k) => k.includes('ev-borrar')).sort(), esperados.sort(), 'programados');

  N.corridas = 0;
  await qEventos.eliminarEvento('ev-borrar');
  await esperar(ESPERA);
  igual(N.corridas, 1, 'una corrida al borrar');
  igual(nuestras().filter((k) => k.includes('ev-borrar')), [], 'cancelados');
  cierto(N.programadas.has('otra-cosa'), 'la ajena sigue');
});

await prueba('apagar los avisos en el perfil los cancela todos', async () => {
  await qPerfil.actualizarPerfil('u1', { avisos_activos: 0 });
  await esperar(ESPERA);
  igual(nuestras(), [], 'sin avisos');
  cierto(N.programadas.has('otra-cosa'), 'la ajena sigue');
  await qPerfil.actualizarPerfil('u1', { avisos_activos: 1 });
  await esperar(ESPERA);
  cierto(nuestras().length > 0, 'vuelven');
});

await prueba('sin permiso no programa nada, pero cancela las viejas', async () => {
  N.permiso = false;
  S.sincronizarAvisos('u1');
  await esperar(ESPERA);
  igual(nuestras(), [], 'sin avisos');
  N.permiso = true;
});

await prueba('si la sincronizacion falla, guardar un peso igual funciona y se loguea', async () => {
  N.fallarPermiso = true;
  erroresLogueados.length = 0;
  const fila = await qPeso.crearRegistroPeso({
    id: 'p2',
    usuario_id: 'u1',
    peso_kg: 71,
    fecha: '2026-09-02',
    fuente: 'manual',
  });
  igual(fila.peso_kg, 71, 'el peso se guardo');
  await esperar(ESPERA);
  cierto(
    erroresLogueados.some((l) => l.includes('Error al sincronizar avisos')),
    `se logueo: ${JSON.stringify(erroresLogueados)}`,
  );
  N.fallarPermiso = false;
});

await prueba('un oyente que tira no corta la escritura', async () => {
  const quitar = cambios.escucharCambios(() => {
    throw new Error('oyente roto');
  });
  erroresLogueados.length = 0;
  await qPeso.actualizarRegistroPeso('p2', { peso_kg: 72 });
  const fila = await qPeso.obtenerRegistroPeso('p2');
  igual(fila.peso_kg, 72, 'el peso se actualizo');
  cierto(erroresLogueados.some((l) => l.includes('oyente roto')), 'se logueo');
  quitar();
  await esperar(ESPERA);
});

await prueba('el peso nuevo cambia los gramos de los avisos', async () => {
  await qPeso.crearRegistroPeso({ id: 'p3', usuario_id: 'u1', peso_kg: 90, fecha: '2026-10-05', fuente: 'manual' });
  await esperar(ESPERA);
  const posts = [...N.programadas.values()].filter((n) => n.identifier.endsWith('-post'));
  cierto(posts.length > 0, 'hay posts');
  // 90 x 0,3 = 27 -> 25
  cierto(posts.every((n) => n.content.body.includes('unos 25 g')), posts[0].content.body);
  cierto(posts.every((n) => n.content.data.url === `/evento/${n.content.data.eventoId}`), 'url al evento');
  cierto(posts.every((n) => n.trigger.channelId === 'avisos'), 'canal avisos');
});

dejar();
console.error = consoleErrorOriginal;

// --- resultado -------------------------------------------------------------

rmSync(tmp, { recursive: true, force: true });

console.log(`\n${ok} ok, ${fallos.length} fallaron`);
if (fallos.length) {
  for (const f of fallos) console.log('  -', f);
  process.exit(1);
}
