// src/features/agenda/materializar.ts
//
// Convierte las rutinas activas en eventos reales. Es politica de agenda, no
// acceso a datos: el SQL vive en db/queries/, aca esta el criterio.
//
// Por que materializar en vez de guardar la regla y calcular al vuelo:
// `completado` y el temporizador operan sobre una ocurrencia concreta, y no
// hay donde escribir eso si el evento del martes no existe como fila.
//
// La hora local es el punto delicado de todo el archivo: `evento.fecha` es una
// columna generada con substr(fecha_hora_inicio, 1, 10). Por eso las fechas
// salen de aFechaLocal() y aISOLocal(), de lib/fechas.ts, donde esta explicado
// por que no se pasa por toISOString().

import {
  eliminarEventosFuturosDeRutina,
  fechasMaterializadas,
  crearEvento,
} from '../../db/queries/eventos';
import { actualizarRutina, listarRutinas } from '../../db/queries/rutinas';
import { getDb } from '../../db/schema';
import { randomUUID } from '../../db/sync/uuid';
import { aFechaLocal, aISOLocal } from '../../lib/fechas';

/**
 * ISO 8601 con offset local a partir de un dia y un "HH:MM".
 * El Date se construye con el constructor local, no con Date.UTC: el offset
 * que estampa aISOLocal tiene que ser el del instante, y en una zona con
 * horario de verano no es el mismo todo el ano.
 *
 * Los segundos van en cero por construccion, asi que aISOLocal escribe ":00"
 * igual que la version que vivia aca.
 */
function inicioLocalISO(dia: Date, hora: string): string {
  const [hh, mm] = hora.split(':').map(Number);
  return aISOLocal(new Date(dia.getFullYear(), dia.getMonth(), dia.getDate(), hh, mm, 0, 0));
}

/** Medianoche local del dia de `d`. El ancla de la ventana. */
function medianocheLocal(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

/**
 * Genera los eventos de las rutinas activas del usuario, `semanas` semanas
 * hacia adelante desde hoy, y devuelve cuantos inserto.
 *
 * Que NO hace, y son las tres cosas que la vuelven segura de correr en cada
 * arranque:
 *   - no duplica: si ya hay un evento de esa rutina ese dia, lo saltea;
 *   - no toca eventos pasados ni eventos sin rutina_id;
 *   - no genera ocurrencias que ya pasaron, ni siquiera las de hoy mas
 *     temprano: crear a las 20:00 el entrenamiento de las 08:30 de esta manana
 *     solo agrega una fila incompleta que nadie va a marcar.
 *
 * `hoy` existe para las pruebas. Las pantallas la llaman con dos argumentos.
 */
export async function materializarRutinas(
  usuarioId: string,
  semanas: number = 8,
  hoy: Date = new Date(),
): Promise<number> {
  const rutinas = await listarRutinas(usuarioId, true);
  if (rutinas.length === 0) return 0;

  const dias = semanas * 7;
  const inicio = medianocheLocal(hoy);

  // La ventana del anti-duplicado, en fechas locales. El ultimo dia es
  // inicio + (dias - 1): con semanas = 8 son 56 dias, ocho de cada dia de la
  // semana, no nueve.
  const ultimo = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate() + dias - 1);

  let insertados = 0;

  // La lectura del anti-duplicado va DENTRO de la transaccion, junto con los
  // inserts que decide: leer afuera dejaria una ventana en la que otra
  // escritura mete la ocurrencia que estamos por meter nosotros.
  await getDb().withTransactionAsync(async () => {
    const yaHay = await fechasMaterializadas(
      rutinas.map((r) => r.id),
      aFechaLocal(inicio),
      aFechaLocal(ultimo),
    );

    // Una sola lectura para todas las ocurrencias candidatas, en vez de un
    // SELECT por cada una. Se le suman las que insertamos en esta corrida para
    // que dos rutinas iguales el mismo dia no se pisen entre si.
    const vistos = new Set(yaHay.map((f) => `${f.rutina_id}|${f.fecha}`));

    for (let i = 0; i < dias; i++) {
      const dia = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate() + i);
      const fecha = aFechaLocal(dia);

      for (const rutina of rutinas) {
        if (rutina.dia_semana !== dia.getDay()) continue;

        const clave = `${rutina.id}|${fecha}`;
        if (vistos.has(clave)) continue;

        const inicioISO = inicioLocalISO(dia, rutina.hora);
        // Comparar instantes, no strings: la ocurrencia de hoy mas temprano
        // tiene la fecha correcta y aun asi ya paso.
        if (new Date(inicioISO).getTime() < hoy.getTime()) continue;

        await crearEvento({
          id: randomUUID(),
          usuario_id: usuarioId,
          tipo: rutina.tipo,
          fecha_hora_inicio: inicioISO,
          duracion_estimada_min: rutina.duracion_estimada_min,
          intensidad: rutina.intensidad,
          rutina_id: rutina.id,
        });

        vistos.add(clave);
        insertados++;
      }
    }
  });

  return insertados;
}

/**
 * Apaga la rutina y limpia sus ocurrencias futuras. Devuelve cuantas borro.
 *
 * Las dos escrituras van juntas o ninguna: una rutina inactiva que sigue
 * teniendo eventos futuros en el calendario es peor que no haberla apagado.
 *
 * El historial no se toca. Los entrenamientos que ya ocurrieron son un hecho
 * registrado, y el usuario esta diciendo "no lo hago mas", no "nunca lo hice".
 */
export async function desactivarRutina(
  rutinaId: string,
  hoy: Date = new Date(),
): Promise<number> {
  // Los segundos van en cero, igual que antes: `hoy` es new Date() y trae los
  // del momento. El corte se compara como texto contra fecha_hora_inicio, asi
  // que redondear hacia abajo es lo conservador — a lo sumo alcanza a una
  // ocurrencia que arranca dentro de este mismo minuto.
  const alMinuto = new Date(hoy);
  alMinuto.setSeconds(0, 0);
  const corte = aISOLocal(alMinuto);

  let borrados = 0;
  await getDb().withTransactionAsync(async () => {
    await actualizarRutina(rutinaId, { activa: false });
    borrados = await eliminarEventosFuturosDeRutina(rutinaId, corte);
  });

  return borrados;
}
