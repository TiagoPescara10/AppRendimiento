// src/db/seeds/devSeed.ts
//
// Seed de desarrollo ejecutable tanto desde Node como directamente dentro de
// la app Expo (util para Expo Go en celulares fisicos donde la base vive en el
// dispositivo).
//
// SOLO PARA DESARROLLO. No se ejecuta en produccion ni dentro de initDb().

import { getDb } from '../schema';
import type { PerfilRow } from '../schema';
import { obtenerPerfil, obtenerPerfilLocal, crearPerfil } from '../queries/perfil';
import { crearRegistroPeso } from '../queries/peso';
import { crearRutina, listarRutinas } from '../queries/rutinas';
import { crearRutinaGimnasio, listarRutinasGimnasio } from '../queries/rutinasGimnasio';
import { buscarEjercicios } from '../queries/ejercicios';
import { crearEvento } from '../queries/eventos';
import { crearComida, agregarItem, listarComidasPorFecha } from '../queries/comidas';
import { buscarAlimentosPorNombre } from '../queries/alimentos';
import { guardarRutinaTerminada } from '../../features/entrenamiento/guardarRutina';
import { materializarRutinas } from '../../features/agenda/materializar';
import { randomUUID } from '../sync/uuid';
import { aFechaLocal, aISOLocal } from '../../lib/fechas';
import { guardarSesion } from '../../features/auth/session';

function restarDias(fecha: Date, dias: number): Date {
  const d = new Date(fecha.getTime());
  d.setDate(d.getDate() - dias);
  return d;
}

function fijarHora(fecha: Date, horaStr: string): Date {
  const [hh, mm] = horaStr.split(':').map(Number);
  return new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate(), hh, mm, 0, 0);
}

function redondear1Dec(num: number): number {
  return Math.round(num * 10) / 10;
}

export async function sembrarDatosDesarrollo(perfilIdOpcional?: string): Promise<PerfilRow> {
  const db = getDb();
  const hoy = new Date();

  // 1. Obtener o crear perfil
  let perfil: PerfilRow | null = null;
  if (perfilIdOpcional) {
    perfil = await obtenerPerfil(perfilIdOpcional);
  } else {
    perfil = await obtenerPerfilLocal();
  }

  if (!perfil) {
    const fechaAlta = aISOLocal(restarDias(hoy, 60));
    perfil = await crearPerfil({
      id: randomUUID(),
      nombre: 'Usuario Demo',
      fecha_alta: fechaAlta,
      fecha_nacimiento: '1998-06-15',
      sexo_biologico: 'masculino',
      altura_cm: 180,
      nivel_actividad: 'alto',
      deporte_principal: 'Futbol',
      objetivo: 'bajar',
      peso_objetivo_kg: 76.0,
      meta_agua_manual_ml: 2500,
      modo_nutricion: 'objetivo',
    });
  }

  // Asegurar sesion activa en almacenamiento local (para pasar el guard de autenticacion)
  try {
    await guardarSesion({ email: 'demo@apprendimiento.com' });
  } catch {}

  // 2. Registros de peso (ultimas 7 semanas, tendencia bajista realista)
  let pesoInicial = 82.8;
  if (perfil.peso_objetivo_kg && perfil.peso_objetivo_kg > 0) {
    pesoInicial = perfil.peso_objetivo_kg + 4.5;
  }

  const diasHaciaAtras = [
    50, 47, 44, 41, 38, 35, 32, 29, 26, 23, 20, 17, 14, 11, 8, 5, 3, 1,
  ];
  const ruidos = [
    0.0, 0.2, -0.1, 0.3, -0.2, 0.1, -0.3, 0.2, -0.1, 0.2, -0.2, 0.1, -0.1, 0.2, -0.3, 0.1, -0.1, 0.0,
  ];

  for (let i = 0; i < diasHaciaAtras.length; i++) {
    const diasAtras = diasHaciaAtras[i];
    const fechaPesada = restarDias(hoy, diasAtras);
    const fechaStr = aFechaLocal(fechaPesada);

    const existente = await db.getFirstAsync(
      'SELECT id FROM registro_peso WHERE usuario_id = ? AND fecha = ?',
      [perfil.id, fechaStr],
    );

    if (!existente) {
      const caidaAcumulada = (50 - diasAtras) * 0.08;
      const pesoCalc = redondear1Dec(pesoInicial - caidaAcumulada + ruidos[i]);
      await crearRegistroPeso({
        id: randomUUID(),
        usuario_id: perfil.id,
        peso_kg: pesoCalc,
        fecha: fechaStr,
        fuente: 'manual',
      });
    }
  }

  // 3. Rutinas deportivas semanales
  const rutinasExistentes = await listarRutinas(perfil.id, false);

  let rutinaFutbolMartes = rutinasExistentes.find(
    (r) => r.dia_semana === 2 && r.hora === '19:00' && r.tipo === 'entrenamiento',
  );
  if (!rutinaFutbolMartes) {
    rutinaFutbolMartes = await crearRutina({
      id: randomUUID(),
      usuario_id: perfil.id,
      dia_semana: 2,
      hora: '19:00',
      tipo: 'entrenamiento',
      duracion_estimada_min: 90,
      intensidad: 'alta',
      activa: true,
    });
  }

  let rutinaFutbolJueves = rutinasExistentes.find(
    (r) => r.dia_semana === 4 && r.hora === '19:00' && r.tipo === 'entrenamiento',
  );
  if (!rutinaFutbolJueves) {
    rutinaFutbolJueves = await crearRutina({
      id: randomUUID(),
      usuario_id: perfil.id,
      dia_semana: 4,
      hora: '19:00',
      tipo: 'entrenamiento',
      duracion_estimada_min: 90,
      intensidad: 'alta',
      activa: true,
    });
  }

  // 4. Catalogo de rutinas de gimnasio con ejercicios
  async function buscarEjercicioSeguro(nombreParcial: string) {
    const lista = await buscarEjercicios(nombreParcial);
    if (lista.length > 0) return lista[0];
    throw new Error(`Ejercicio no encontrado: ${nombreParcial}`);
  }

  const ejPressPlano = await buscarEjercicioSeguro('Press de banca plano con barra');
  const ejPressInclinado = await buscarEjercicioSeguro('Press de banca inclinado con mancuernas');
  const ejCrucesPolea = await buscarEjercicioSeguro('Cruces en polea');
  const ejTricepsPolea = await buscarEjercicioSeguro('Extension de triceps en polea con soga');

  const ejRemoBarra = await buscarEjercicioSeguro('Remo con barra');
  const ejJalonPecho = await buscarEjercicioSeguro('Jalon al pecho en polea');
  const ejRemoMancuerna = await buscarEjercicioSeguro('Remo con mancuerna a una mano');
  const ejCurlBiceps = await buscarEjercicioSeguro('Curl de biceps con barra de pie');

  const rutinasGimExistentes = await listarRutinasGimnasio(perfil.id, false);

  let rutinaGim1 = rutinasGimExistentes.find((r) => r.nombre.includes('Pecho y triceps'));
  if (!rutinaGim1) {
    rutinaGim1 = await crearRutinaGimnasio({
      id: randomUUID(),
      usuario_id: perfil.id,
      nombre: 'Pecho y triceps',
      activa: true,
      ejercicio_ids: [ejPressPlano.id, ejPressInclinado.id, ejCrucesPolea.id, ejTricepsPolea.id],
    });
  }

  let rutinaGim2 = rutinasGimExistentes.find((r) => r.nombre.includes('Espalda y biceps'));
  if (!rutinaGim2) {
    rutinaGim2 = await crearRutinaGimnasio({
      id: randomUUID(),
      usuario_id: perfil.id,
      nombre: 'Espalda y biceps',
      activa: true,
      ejercicio_ids: [ejRemoBarra.id, ejJalonPecho.id, ejRemoMancuerna.id, ejCurlBiceps.id],
    });
  }

  let rutinaGimLunes = rutinasExistentes.find(
    (r) => r.dia_semana === 1 && r.hora === '18:00' && r.tipo === 'gimnasio',
  );
  if (!rutinaGimLunes) {
    rutinaGimLunes = await crearRutina({
      id: randomUUID(),
      usuario_id: perfil.id,
      dia_semana: 1,
      hora: '18:00',
      tipo: 'gimnasio',
      duracion_estimada_min: 60,
      intensidad: 'media',
      rutina_gimnasio_id: rutinaGim1.id,
      activa: true,
    });
  }

  let rutinaGimMiercoles = rutinasExistentes.find(
    (r) => r.dia_semana === 3 && r.hora === '18:00' && r.tipo === 'gimnasio',
  );
  if (!rutinaGimMiercoles) {
    rutinaGimMiercoles = await crearRutina({
      id: randomUUID(),
      usuario_id: perfil.id,
      dia_semana: 3,
      hora: '18:00',
      tipo: 'gimnasio',
      duracion_estimada_min: 60,
      intensidad: 'media',
      rutina_gimnasio_id: rutinaGim2.id,
      activa: true,
    });
  }

  // 5. Eventos y sesiones pasadas completadas (ultimas 4 semanas)
  function obtenerFechasDiaSemana(diaSemanaDeseado: number, semanasAtras = 4): Date[] {
    const resultado: Date[] = [];
    for (let w = semanasAtras; w >= 1; w--) {
      const d = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - w * 7);
      const diff = diaSemanaDeseado - d.getDay();
      d.setDate(d.getDate() + diff);
      if (d.getTime() < hoy.getTime()) {
        resultado.push(d);
      }
    }
    return resultado;
  }

  const martesPasados = obtenerFechasDiaSemana(2, 4);
  const juevesPasados = obtenerFechasDiaSemana(4, 4);
  const lunesPasados = obtenerFechasDiaSemana(1, 4);
  const miercolesPasados = obtenerFechasDiaSemana(3, 4);

  // Futbol
  const diasFutbol = [
    ...martesPasados.map((f) => ({ fecha: f, rutina: rutinaFutbolMartes! })),
    ...juevesPasados.map((f) => ({ fecha: f, rutina: rutinaFutbolJueves! })),
  ].sort((a, b) => a.fecha.getTime() - b.fecha.getTime());

  for (let idx = 0; idx < diasFutbol.length; idx++) {
    const item = diasFutbol[idx];
    const fechaHora = fijarHora(item.fecha, '19:00');
    const fechaStr = aFechaLocal(fechaHora);

    const eventoExistente = await db.getFirstAsync(
      'SELECT id FROM evento WHERE usuario_id = ? AND fecha = ? AND tipo = ?',
      [perfil.id, fechaStr, 'entrenamiento'],
    );

    if (!eventoExistente) {
      const fueCompletado = idx !== 3;
      await crearEvento({
        id: randomUUID(),
        usuario_id: perfil.id,
        tipo: 'entrenamiento',
        fecha_hora_inicio: aISOLocal(fechaHora),
        duracion_estimada_min: 90,
        intensidad: 'alta',
        completado: fueCompletado,
        respondido: true,
        notas: 'Fútbol',
        rutina_id: item.rutina.id,
      });
    }
  }

  // Gimnasio Lunes: Pecho y triceps
  const cargasPecho = [
    { plano: { reps: 10, kg: 60.0 }, inc: { reps: 10, kg: 20.0 }, cruces: { reps: 12, kg: 15.0 }, tri: { reps: 12, kg: 17.5 } },
    { plano: { reps: 10, kg: 62.5 }, inc: { reps: 10, kg: 20.0 }, cruces: { reps: 12, kg: 17.5 }, tri: { reps: 12, kg: 20.0 } },
    { plano: { reps: 8, kg: 65.0 }, inc: { reps: 8, kg: 22.0 }, cruces: { reps: 10, kg: 20.0 }, tri: { reps: 10, kg: 22.5 } },
    { plano: { reps: 8, kg: 67.5 }, inc: { reps: 8, kg: 24.0 }, cruces: { reps: 10, kg: 20.0 }, tri: { reps: 10, kg: 22.5 } },
  ];

  for (let i = 0; i < lunesPasados.length; i++) {
    const fechaSesion = fijarHora(lunesPasados[i], '18:00');
    const fechaStr = aFechaLocal(fechaSesion);

    const eventoExistente = await db.getFirstAsync(
      'SELECT id FROM evento WHERE usuario_id = ? AND fecha = ? AND tipo = ?',
      [perfil.id, fechaStr, 'gimnasio'],
    );

    if (!eventoExistente) {
      const c = cargasPecho[Math.min(i, cargasPecho.length - 1)];
      const series = [
        { ejercicioId: ejPressPlano.id, repeticiones: c.plano.reps, pesoKg: c.plano.kg },
        { ejercicioId: ejPressPlano.id, repeticiones: c.plano.reps, pesoKg: c.plano.kg },
        { ejercicioId: ejPressPlano.id, repeticiones: c.plano.reps, pesoKg: c.plano.kg },
        { ejercicioId: ejPressInclinado.id, repeticiones: c.inc.reps, pesoKg: c.inc.kg },
        { ejercicioId: ejPressInclinado.id, repeticiones: c.inc.reps, pesoKg: c.inc.kg },
        { ejercicioId: ejPressInclinado.id, repeticiones: c.inc.reps, pesoKg: c.inc.kg },
        { ejercicioId: ejCrucesPolea.id, repeticiones: c.cruces.reps, pesoKg: c.cruces.kg },
        { ejercicioId: ejCrucesPolea.id, repeticiones: c.cruces.reps, pesoKg: c.cruces.kg },
        { ejercicioId: ejCrucesPolea.id, repeticiones: c.cruces.reps, pesoKg: c.cruces.kg },
        { ejercicioId: ejTricepsPolea.id, repeticiones: c.tri.reps, pesoKg: c.tri.kg },
        { ejercicioId: ejTricepsPolea.id, repeticiones: c.tri.reps, pesoKg: c.tri.kg },
        { ejercicioId: ejTricepsPolea.id, repeticiones: c.tri.reps, pesoKg: c.tri.kg },
      ];

      const res = await guardarRutinaTerminada({
        usuarioId: perfil.id,
        inicio: fechaSesion,
        duracionRealSeg: 3600,
        series,
        rutinaGimnasioId: rutinaGim1.id,
        nombreRutina: 'Lunes: Pecho y triceps',
        intensidad: 'media',
      });

      await db.runAsync('UPDATE evento SET rutina_id = ? WHERE id = ?', [
        rutinaGimLunes!.id,
        res.eventoId,
      ]);
    }
  }

  // Gimnasio Miercoles: Espalda y biceps
  const cargasEspalda = [
    { remo: { reps: 10, kg: 50.0 }, jalon: { reps: 10, kg: 55.0 }, mancuerna: { reps: 10, kg: 22.0 }, curl: { reps: 10, kg: 25.0 } },
    { remo: { reps: 10, kg: 52.5 }, jalon: { reps: 10, kg: 60.0 }, mancuerna: { reps: 10, kg: 24.0 }, curl: { reps: 10, kg: 27.5 } },
    { remo: { reps: 8, kg: 55.0 }, jalon: { reps: 8, kg: 62.5 }, mancuerna: { reps: 8, kg: 24.0 }, curl: { reps: 8, kg: 30.0 } },
    { remo: { reps: 8, kg: 57.5 }, jalon: { reps: 8, kg: 65.0 }, mancuerna: { reps: 8, kg: 26.0 }, curl: { reps: 8, kg: 30.0 } },
  ];

  for (let i = 0; i < miercolesPasados.length; i++) {
    const fechaSesion = fijarHora(miercolesPasados[i], '18:00');
    const fechaStr = aFechaLocal(fechaSesion);

    const eventoExistente = await db.getFirstAsync(
      'SELECT id FROM evento WHERE usuario_id = ? AND fecha = ? AND tipo = ?',
      [perfil.id, fechaStr, 'gimnasio'],
    );

    if (!eventoExistente) {
      const c = cargasEspalda[Math.min(i, cargasEspalda.length - 1)];
      const series = [
        { ejercicioId: ejRemoBarra.id, repeticiones: c.remo.reps, pesoKg: c.remo.kg },
        { ejercicioId: ejRemoBarra.id, repeticiones: c.remo.reps, pesoKg: c.remo.kg },
        { ejercicioId: ejRemoBarra.id, repeticiones: c.remo.reps, pesoKg: c.remo.kg },
        { ejercicioId: ejJalonPecho.id, repeticiones: c.jalon.reps, pesoKg: c.jalon.kg },
        { ejercicioId: ejJalonPecho.id, repeticiones: c.jalon.reps, pesoKg: c.jalon.kg },
        { ejercicioId: ejJalonPecho.id, repeticiones: c.jalon.reps, pesoKg: c.jalon.kg },
        { ejercicioId: ejRemoMancuerna.id, repeticiones: c.mancuerna.reps, pesoKg: c.mancuerna.kg },
        { ejercicioId: ejRemoMancuerna.id, repeticiones: c.mancuerna.reps, pesoKg: c.mancuerna.kg },
        { ejercicioId: ejRemoMancuerna.id, repeticiones: c.mancuerna.reps, pesoKg: c.mancuerna.kg },
        { ejercicioId: ejCurlBiceps.id, repeticiones: c.curl.reps, pesoKg: c.curl.kg },
        { ejercicioId: ejCurlBiceps.id, repeticiones: c.curl.reps, pesoKg: c.curl.kg },
        { ejercicioId: ejCurlBiceps.id, repeticiones: c.curl.reps, pesoKg: c.curl.kg },
      ];

      const res = await guardarRutinaTerminada({
        usuarioId: perfil.id,
        inicio: fechaSesion,
        duracionRealSeg: 3600,
        series,
        rutinaGimnasioId: rutinaGim2.id,
        nombreRutina: 'Miercoles: Espalda y biceps',
        intensidad: 'media',
      });

      await db.runAsync('UPDATE evento SET rutina_id = ? WHERE id = ?', [
        rutinaGimMiercoles!.id,
        res.eventoId,
      ]);
    }
  }

  // 6. Comidas en 22 de los ultimos 30 dias
  async function buscarAlimentoSeguro(nombreParcial: string) {
    const lista = await buscarAlimentosPorNombre(nombreParcial, 5);
    if (lista.length > 0) return lista[0];
    throw new Error(`Alimento no encontrado: ${nombreParcial}`);
  }

  const alAvena = await buscarAlimentoSeguro('Avena en hojuelas');
  const alLeche = await buscarAlimentoSeguro('Leche descremada');
  const alBanana = await buscarAlimentoSeguro('Banana');
  const alPollo = await buscarAlimentoSeguro('Pechuga de pollo');
  const alArroz = await buscarAlimentoSeguro('Arroz blanco');
  const alManzana = await buscarAlimentoSeguro('Manzana');
  const alYogur = await buscarAlimentoSeguro('Yogur');
  const alCarne = await buscarAlimentoSeguro('Bife de');
  const alPapa = await buscarAlimentoSeguro('Papa');

  const diasConComida = [
    30, 29, 27, 26, 25, 23, 22, 20, 19, 17, 16, 15, 14, 13, 11, 10, 9, 8, 6, 5, 3, 2,
  ];

  for (const diasAtras of diasConComida) {
    const fechaDia = restarDias(hoy, diasAtras);
    const fechaStr = aFechaLocal(fechaDia);

    const comidasExistentes = await listarComidasPorFecha(perfil.id, fechaStr);
    if (comidasExistentes.length > 0) continue;

    // Desayuno
    const fechaHoraDesayuno = fijarHora(fechaDia, '08:30');
    const comidaDesayuno = await crearComida({
      id: randomUUID(),
      usuario_id: perfil.id,
      fecha_hora: aISOLocal(fechaHoraDesayuno),
      tipo: 'desayuno',
      notas: 'Desayuno habitual',
    });
    await agregarItem({ id: randomUUID(), comida_id: comidaDesayuno.id, alimento_id: alAvena.id, cantidad_g: 50 });
    await agregarItem({ id: randomUUID(), comida_id: comidaDesayuno.id, alimento_id: alLeche.id, cantidad_g: 200 });
    await agregarItem({ id: randomUUID(), comida_id: comidaDesayuno.id, alimento_id: alBanana.id, cantidad_g: 120 });

    // Almuerzo
    const fechaHoraAlmuerzo = fijarHora(fechaDia, '13:00');
    const comidaAlmuerzo = await crearComida({
      id: randomUUID(),
      usuario_id: perfil.id,
      fecha_hora: aISOLocal(fechaHoraAlmuerzo),
      tipo: 'almuerzo',
      notas: 'Almuerzo proteico',
    });
    await agregarItem({ id: randomUUID(), comida_id: comidaAlmuerzo.id, alimento_id: alPollo.id, cantidad_g: 200 });
    await agregarItem({ id: randomUUID(), comida_id: comidaAlmuerzo.id, alimento_id: alArroz.id, cantidad_g: 150 });

    // Merienda
    const fechaHoraMerienda = fijarHora(fechaDia, '17:00');
    const comidaMerienda = await crearComida({
      id: randomUUID(),
      usuario_id: perfil.id,
      fecha_hora: aISOLocal(fechaHoraMerienda),
      tipo: 'merienda',
      notas: 'Merienda ligera',
    });
    await agregarItem({ id: randomUUID(), comida_id: comidaMerienda.id, alimento_id: alYogur.id, cantidad_g: 180 });
    await agregarItem({ id: randomUUID(), comida_id: comidaMerienda.id, alimento_id: alManzana.id, cantidad_g: 150 });

    // Cena
    const fechaHoraCena = fijarHora(fechaDia, '21:30');
    const comidaCena = await crearComida({
      id: randomUUID(),
      usuario_id: perfil.id,
      fecha_hora: aISOLocal(fechaHoraCena),
      tipo: 'cena',
      notas: 'Cena equilibrada',
    });
    await agregarItem({ id: randomUUID(), comida_id: comidaCena.id, alimento_id: alCarne.id, cantidad_g: 180 });
    await agregarItem({ id: randomUUID(), comida_id: comidaCena.id, alimento_id: alPapa.id, cantidad_g: 200 });
  }

  // 7. Materializar rutinas hacia adelante
  await materializarRutinas(perfil.id, 4, hoy);

  return perfil;
}
