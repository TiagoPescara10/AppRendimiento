// Pruebas unitarias de las validaciones de perfil y objetivos nutricionales.
//   node scripts/probar-validacion.mjs

import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, '..');

// Compilar a CommonJS en un temporal
const tmp = mkdtempSync(join(tmpdir(), 'probar-validacion-'));
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
      baseUrl: RAIZ,
      paths: { '@/*': ['src/*'] },
    },
    include: [
      join(RAIZ, 'src/lib/validacion.ts'),
      join(RAIZ, 'src/lib/salud.ts'),
      join(RAIZ, 'src/lib/fechas.ts'),
      join(RAIZ, 'src/lib/nutricion.ts'),
      join(RAIZ, 'src/db/schema.ts'),
      join(RAIZ, 'src/db/queries/comidas.ts'),
    ],
  }),
);

try {
  execFileSync('npx', ['tsc', '-p', tsconfig], { cwd: RAIZ, stdio: 'pipe' });
} catch (e) {
  console.error('tsc fallo al compilar validacion.ts:\n' + (e.stdout?.toString() ?? e.message));
  process.exit(1);
}

const req = createRequire(join(build, 'x.cjs'));
const { validarAltura, validarObjetivo, validarDatosPerfil } = req('./lib/validacion.js');
const {
  evaluarPisoCalorias,
  evaluarVelocidadPerdida,
  evaluarImcObjetivo,
  evaluarAvisoPesajeFrecuente,
  PISO_KCAL,
  BAJADA_SEMANAL_MAXIMA_KG,
  DEFICIT_MAXIMO_DIARIO_KCAL,
  IMC_MINIMO_SALUDABLE,
} = req('./lib/salud.js');
const { calcularTodo } = req('./lib/nutricion.js');

let pruebasPasadas = 0;

function prueba(nombre, fn) {
  try {
    fn();
    console.log(`  + ${nombre}`);
    pruebasPasadas++;
  } catch (err) {
    console.error(`  x FALLO: ${nombre}`);
    console.error(err);
    process.exit(1);
  }
}

console.log('validaciones de perfil:');

// validarAltura
prueba('altura menor al minimo (99 cm) es invalida', () => {
  const res = validarAltura(99);
  assert.equal(res.ok, false);
  assert.equal(res.titulo, 'Altura invalida');
});

prueba('altura mayor al maximo (251 cm) es invalida', () => {
  const res = validarAltura(251);
  assert.equal(res.ok, false);
  assert.equal(res.titulo, 'Altura invalida');
});

prueba('altura limite inferior (100 cm) es valida', () => {
  const res = validarAltura(100);
  assert.equal(res.ok, true);
});

prueba('altura limite superior (250 cm) es valida', () => {
  const res = validarAltura(250);
  assert.equal(res.ok, true);
});

prueba('altura NaN o no finita es invalida', () => {
  assert.equal(validarAltura(NaN).ok, false);
  assert.equal(validarAltura(Infinity).ok, false);
});

// validarObjetivo
prueba('mantener no requiere peso objetivo ni altura', () => {
  const res = validarObjetivo({ objetivo: 'mantener' });
  assert.equal(res.ok, true);
});

prueba('rendimiento no requiere peso objetivo ni altura', () => {
  const res = validarObjetivo({ objetivo: 'rendimiento' });
  assert.equal(res.ok, true);
});

prueba('bajar sin peso objetivo falla', () => {
  const res = validarObjetivo({ objetivo: 'bajar', pesoObjetivoKg: null, alturaCm: 178, pesoActualKg: 80 });
  assert.equal(res.ok, false);
  assert.equal(res.titulo, 'Falta el peso objetivo');
});

prueba('bajar sin altura falla con "Falta la altura"', () => {
  const res = validarObjetivo({ objetivo: 'bajar', pesoObjetivoKg: 70, alturaCm: null, pesoActualKg: 80 });
  assert.equal(res.ok, false);
  assert.equal(res.titulo, 'Falta la altura');
});

prueba('bajar a peso con IMC menor a 18.5 falla con "Objetivo no saludable"', () => {
  // Para 178 cm, 18.5 * (1.78^2) = 58.62 kg. 55 kg da IMC ~17.36
  const res = validarObjetivo({ objetivo: 'bajar', pesoObjetivoKg: 55, alturaCm: 178, pesoActualKg: 80 });
  assert.equal(res.ok, false);
  assert.equal(res.titulo, 'Objetivo no saludable');
});

prueba('bajar con peso objetivo mayor o igual al actual falla', () => {
  const resIgual = validarObjetivo({ objetivo: 'bajar', pesoObjetivoKg: 80, alturaCm: 178, pesoActualKg: 80 });
  assert.equal(resIgual.ok, false);
  assert.equal(resIgual.titulo, 'Revisa el objetivo');

  const resMayor = validarObjetivo({ objetivo: 'bajar', pesoObjetivoKg: 82, alturaCm: 178, pesoActualKg: 80 });
  assert.equal(resMayor.ok, false);
  assert.equal(resMayor.titulo, 'Revisa el objetivo');
});

prueba('subir con peso objetivo menor o igual al actual falla', () => {
  const resIgual = validarObjetivo({ objetivo: 'subir', pesoObjetivoKg: 70, alturaCm: 178, pesoActualKg: 70 });
  assert.equal(resIgual.ok, false);
  assert.equal(resIgual.titulo, 'Revisa el objetivo');

  const resMenor = validarObjetivo({ objetivo: 'subir', pesoObjetivoKg: 65, alturaCm: 178, pesoActualKg: 70 });
  assert.equal(resMenor.ok, false);
  assert.equal(resMenor.titulo, 'Revisa el objetivo');
});

prueba('bajar con valores saludables pasa correctamente', () => {
  const res = validarObjetivo({ objetivo: 'bajar', pesoObjetivoKg: 72, alturaCm: 178, pesoActualKg: 78.4 });
  assert.equal(res.ok, true);
});

prueba('subir con valores saludables pasa correctamente', () => {
  const res = validarObjetivo({ objetivo: 'subir', pesoObjetivoKg: 75, alturaCm: 178, pesoActualKg: 68 });
  assert.equal(res.ok, true);
});

console.log('\nsalvaguardas de salud y coach (src/lib/salud.ts):');

// 1. Piso de calorias
prueba('piso calorias hombre (1500 kcal): calculo de 1350 se ajusta a 1500 con mensaje', () => {
  const res = evaluarPisoCalorias(1350, 'masculino');
  assert.equal(res.decision, 'ajustar');
  assert.equal(res.ajustado, true);
  assert.equal(res.kcalFinal, 1500);
  assert.equal(res.mensajeCoach, 'Ajustamos tu objetivo a 1500 kcal, el minimo saludable, aunque tu meta pedia menos.');
});

prueba('piso calorias mujer (1200 kcal): calculo de 1050 se ajusta a 1200 con mensaje', () => {
  const res = evaluarPisoCalorias(1050, 'femenino');
  assert.equal(res.decision, 'ajustar');
  assert.equal(res.ajustado, true);
  assert.equal(res.kcalFinal, 1200);
  assert.equal(res.mensajeCoach, 'Ajustamos tu objetivo a 1200 kcal, el minimo saludable, aunque tu meta pedia menos.');
});

prueba('piso calorias: valor superior al piso no se altera y no muestra mensaje', () => {
  const res = evaluarPisoCalorias(1850, 'masculino');
  assert.equal(res.decision, 'ok');
  assert.equal(res.ajustado, false);
  assert.equal(res.kcalFinal, 1850);
  assert.equal(res.mensajeCoach, null);
});

prueba('calcularTodo en nutricion.ts activa ajustadoPorPiso y mensajePiso cuando corresponde', () => {
  // BMR bajo y objetivo bajar: 50kg, 150cm, 50 anios, sedentario, mujer
  const nut = calcularTodo({
    peso_kg: 48,
    altura_cm: 150,
    edad: 55,
    sexo: 'femenino',
    nivel_actividad: 'sedentario',
    objetivo: 'bajar',
  });
  // tdee ~1.2 * (10*48 + 6.25*150 - 5*55 - 161) = 1.2 * (480 + 937.5 - 275 - 161) = 1.2 * 981.5 = 1177.8
  // con deficit de 500 daria ~678 kcal, muy por debajo de 1200
  assert.equal(nut.ajustadoPorPiso, true);
  assert.equal(nut.kcal_objetivo, 1200);
  assert.equal(nut.mensajePiso, 'Ajustamos tu objetivo a 1200 kcal, el minimo saludable, aunque tu meta pedia menos.');
});

// 2. Limite de velocidad de bajada de peso (maximo 750g / semana)
prueba('velocidad de bajada: deficit mayor a 825 kcal/dia genera aviso del coach', () => {
  const res = evaluarVelocidadPerdida({ deficitDiarioKcal: 1000 });
  assert.equal(res.decision, 'avisar');
  assert.equal(res.excedeVelocidad, true);
  assert.equal(res.deficitSugeridoKcal, 825);
  assert.equal(
    res.mensajeCoach,
    'Bajar mas de 750g por semana no es sostenible ni saludable a largo plazo. Te sugerimos un ritmo mas gradual.',
  );
});

prueba('velocidad de bajada: deficit moderado (500 kcal/dia) no genera aviso', () => {
  const res = evaluarVelocidadPerdida({ deficitDiarioKcal: 500 });
  assert.equal(res.decision, 'ok');
  assert.equal(res.excedeVelocidad, false);
  assert.equal(res.mensajeCoach, null);
});

prueba('velocidad de bajada: meta con plazo excesivo (8kg en 4 semanas = 2kg/sem) sugiere plazo minimo', () => {
  const res = evaluarVelocidadPerdida({ pesoActualKg: 80, pesoObjetivoKg: 72, semanas: 4 });
  assert.equal(res.decision, 'avisar');
  assert.equal(res.excedeVelocidad, true);
  assert.equal(res.semanasMinimasSugeridas, 11); // 8 / 0.75 = 10.66 -> 11 semanas
  assert.equal(
    res.mensajeCoach,
    'Bajar mas de 750g por semana no es sostenible ni saludable a largo plazo. Te sugerimos un ritmo mas gradual.',
  );
});

prueba('velocidad de bajada: meta gradual (3kg en 6 semanas = 0.5kg/sem) es valida', () => {
  const res = evaluarVelocidadPerdida({ pesoActualKg: 75, pesoObjetivoKg: 72, semanas: 6 });
  assert.equal(res.decision, 'ok');
  assert.equal(res.excedeVelocidad, false);
});

// 3. Rango de IMC saludable (< 18.5)
prueba('evaluarImcObjetivo: IMC menor a 18.5 bloquea el objetivo sin valor de reemplazo', () => {
  // 170cm, 50kg -> IMC = 50 / (1.7^2) = 17.3
  const res = evaluarImcObjetivo(50, 170);
  assert.equal(res.decision, 'bloquear');
  assert.equal(res.imcCalculado, 17.3);
  assert.equal(
    res.mensajeCoach,
    'Ese peso queda por debajo del rango saludable para tu altura. Por favor, elegi un objetivo dentro de un rango seguro.',
  );
});

prueba('evaluarImcObjetivo: IMC en rango saludable pasa normalmente', () => {
  // 170cm, 65kg -> IMC = 65 / (1.7^2) = 22.49
  const res = evaluarImcObjetivo(65, 170);
  assert.equal(res.decision, 'ok');
  assert.equal(res.imcCalculado, 22.5);
  assert.equal(res.mensajeCoach, null);
});

// 4. Aviso de pesaje frecuente
prueba('pesaje frecuente: primer registro del dia no genera aviso', () => {
  const res = evaluarAvisoPesajeFrecuente({ registrosHoy: 0, yaAvisadoHoy: false });
  assert.equal(res.decision, 'ignorar');
  assert.equal(res.debeMostrarAviso, false);
});

prueba('pesaje frecuente: segundo registro del dia genera aviso calido del coach', () => {
  const res = evaluarAvisoPesajeFrecuente({ registrosHoy: 1, yaAvisadoHoy: false });
  assert.equal(res.decision, 'avisar');
  assert.equal(res.debeMostrarAviso, true);
  assert.equal(
    res.mensajeCoach,
    'Pesarte varias veces en el dia no te da mas informacion — el peso varia naturalmente por hidratacion y horario. Con una vez al dia alcanza.',
  );
});

prueba('pesaje frecuente: segundo registro si ya fue avisado hoy no repite', () => {
  const res = evaluarAvisoPesajeFrecuente({ registrosHoy: 1, yaAvisadoHoy: true });
  assert.equal(res.decision, 'ignorar');
  assert.equal(res.debeMostrarAviso, false);
});

prueba('pesaje frecuente: tercer pesaje en adelante nunca repite el aviso', () => {
  const res = evaluarAvisoPesajeFrecuente({ registrosHoy: 2, yaAvisadoHoy: true });
  assert.equal(res.decision, 'ignorar');
  assert.equal(res.debeMostrarAviso, false);
});

// 5. Validacion de datos de perfil segun modo de uso
prueba('modo recuento: pasa con solo nombre y altura validos, sin pedir fecha ni sexo', () => {
  const res = validarDatosPerfil({
    nombre: 'Tiago',
    alturaCm: 178,
    modoNutricion: 'recuento',
  });
  assert.equal(res.ok, true);
});

prueba('modo recuento: falla si falta el nombre', () => {
  const res = validarDatosPerfil({
    nombre: '   ',
    alturaCm: 178,
    modoNutricion: 'recuento',
  });
  assert.equal(res.ok, false);
  assert.match(res.titulo, /nombre/i);
});

prueba('modo recuento: falla si la altura es invalida', () => {
  const res = validarDatosPerfil({
    nombre: 'Tiago',
    alturaCm: 30,
    modoNutricion: 'recuento',
  });
  assert.equal(res.ok, false);
  assert.match(res.titulo, /altura/i);
});

prueba('modo objetivo: falla si falta fecha de nacimiento', () => {
  const res = validarDatosPerfil({
    nombre: 'Tiago',
    alturaCm: 178,
    sexoBiologico: 'masculino',
    modoNutricion: 'objetivo',
  });
  assert.equal(res.ok, false);
  assert.match(res.titulo, /fecha/i);
});

prueba('modo objetivo: falla si es menor de 18 años', () => {
  const hoy = new Date();
  const menor = new Date(hoy.getFullYear() - 15, 0, 1);
  const res = validarDatosPerfil({
    nombre: 'Tiago',
    alturaCm: 178,
    fechaNacimiento: menor,
    sexoBiologico: 'masculino',
    modoNutricion: 'objetivo',
  });
  assert.equal(res.ok, false);
  assert.match(res.titulo, /edad/i);
});

prueba('modo objetivo: falla si falta sexo biologico', () => {
  const res = validarDatosPerfil({
    nombre: 'Tiago',
    alturaCm: 178,
    fechaNacimiento: new Date('1998-05-15'),
    modoNutricion: 'objetivo',
  });
  assert.equal(res.ok, false);
  assert.match(res.titulo, /sexo/i);
});

prueba('modo objetivo: pasa con todos los campos requeridos', () => {
  const res = validarDatosPerfil({
    nombre: 'Tiago',
    alturaCm: 178,
    fechaNacimiento: new Date('1998-05-15'),
    sexoBiologico: 'masculino',
    modoNutricion: 'objetivo',
  });
  assert.equal(res.ok, true);
});

console.log(`\n${pruebasPasadas} pasan, 0 fallan\n`);
