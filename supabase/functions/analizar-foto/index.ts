// supabase/functions/analizar-foto/index.ts
//
// Registrar comida con una foto. La app manda la foto (JPEG en base64, ya
// achicada a 1024 px) y un id de instalacion; esto le pregunta al modelo que
// hay en el plato y devuelve SOLO nombres, gramos, crudo/cocido y confianza.
// Calorias y macros no: esos los pone la app desde su catalogo local.
//
// LA FOTO NO SE GUARDA EN NINGUN LADO. Se recibe, se manda al modelo y se
// descarta al terminar el pedido. No va a Storage, ni a una tabla, ni a los
// logs: lo unico que se escribe en la base son los contadores de uso_foto.
//
// La clave de Anthropic vive solo aca (secret ANTHROPIC_API_KEY). La app
// nunca la tiene.
//
// Variables de entorno (supabase secrets set ...), para cambiar sin tocar la
// app:
//   MODELO_FOTO              modelo a usar. Por defecto claude-haiku-4-5.
//   LIMITE_FOTOS_SEMANA      fotos por instalacion por semana. Por defecto 5.
//   LIMITE_FOTOS_DIA_GLOBAL  fotos por dia entre todas. Por defecto 100.
// SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY las pone Supabase solo.
//
// verify_jwt esta en false (ver supabase/config.toml): la app manda la clave
// publicable, que no es un JWT. El abuso lo acotan los dos limites.
//
// La salida se fuerza con structured outputs (output_config.format) y no con
// tool_choice forzado: los modelos mas nuevos rechazan el tool_choice forzado
// y el modelo es configurable. Igual se valida a mano antes de devolver: el
// schema no admite minimos ni maximos.

import Anthropic from 'npm:@anthropic-ai/sdk@0.131.0';
import { createClient } from 'npm:@supabase/supabase-js@2.117.2';

const MODELO = Deno.env.get('MODELO_FOTO') || 'claude-haiku-4-5';
const LIMITE_SEMANA = enteroDeEnv('LIMITE_FOTOS_SEMANA', 5);
const LIMITE_GLOBAL = enteroDeEnv('LIMITE_FOTOS_DIA_GLOBAL', 100);

/** Tope de la imagen decodificada. Una foto de 1024 px a 0,7 pesa ~200 KB. */
const MAX_BYTES_IMAGEN = 2 * 1024 * 1024;

/** La app corta a los 30 s; el modelo tiene que contestar antes. */
const TIMEOUT_MODELO_MS = 25_000;

const MAX_ITEMS = 15;
const MAX_GRAMOS = 3000;

const ZONA_ARGENTINA_MS = -3 * 3_600_000;

type Codigo =
  | 'PEDIDO_INVALIDO'
  | 'IMAGEN_GRANDE'
  | 'LIMITE_SEMANAL'
  | 'LIMITE_GLOBAL'
  | 'ANALISIS_FALLIDO'
  | 'ERROR_INTERNO';

interface Item {
  nombre: string;
  gramos: number;
  estado: 'crudo' | 'cocido' | null;
  confianza: 'alta' | 'media' | 'baja';
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function enteroDeEnv(nombre: string, porDefecto: number): number {
  const n = Number.parseInt(Deno.env.get(nombre) ?? '', 10);
  return Number.isFinite(n) && n >= 0 ? n : porDefecto;
}

function responder(cuerpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function error(codigo: Codigo, mensaje: string, status: number): Response {
  return responder({ error: { codigo, mensaje } }, status);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Dia y lunes de la semana, en hora de Argentina (UTC-3, sin horario de verano). */
function diaYSemana(ahora: Date): { dia: string; semana: string } {
  const local = new Date(ahora.getTime() + ZONA_ARGENTINA_MS);
  const dia = local.toISOString().slice(0, 10);
  const desdeLunes = (local.getUTCDay() + 6) % 7;
  const lunes = new Date(local.getTime() - desdeLunes * 86_400_000);
  return { dia, semana: lunes.toISOString().slice(0, 10) };
}

/** Bytes que ocupa un base64 una vez decodificado, sin decodificarlo. */
function bytesDeBase64(b64: string): number {
  const relleno = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  return Math.floor((b64.length * 3) / 4) - relleno;
}

/** El tipo sale de los primeros bytes; la app manda JPEG. */
function tipoDeImagen(b64: string): 'image/jpeg' | 'image/png' | 'image/webp' | null {
  if (b64.startsWith('/9j/')) return 'image/jpeg';
  if (b64.startsWith('iVBORw0KGgo')) return 'image/png';
  if (b64.startsWith('UklGR')) return 'image/webp';
  return null;
}

// ---------------------------------------------------------------------------
// Modelo
// ---------------------------------------------------------------------------

const INSTRUCCIONES = `Sos un asistente de nutricion en Argentina. Te pasan la foto de una comida y tenes que listar los alimentos que se ven, con una estimacion de cuantos gramos hay de cada uno en el plato.

Reglas:
- Nombres en español rioplatense, como los diria alguien en Argentina: "milanesa", "puré de papa", "fideos", "bife de chorizo", "ensalada de lechuga y tomate". Sin marcas.
- Un item por alimento distinto. Si hay dos milanesas, es un solo item con los gramos de las dos.
- gramos: lo que hay en el plato, en el estado en que se ve. Un numero entero.
- estado: "cocido" si se ve cocinado, "crudo" si se come crudo (ensalada, fruta), null si no aplica (bebidas, salsas, pan).
- confianza: "alta" si el alimento y la cantidad son claros, "media" si dudas de la cantidad, "baja" si dudas de que alimento es.
- No incluyas calorias, macros ni comentarios.
- Si en la foto no hay comida, devolve items vacio.`;

const SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          nombre: { type: 'string' },
          gramos: { type: 'number' },
          estado: { anyOf: [{ type: 'string', enum: ['crudo', 'cocido'] }, { type: 'null' }] },
          confianza: { type: 'string', enum: ['alta', 'media', 'baja'] },
        },
        required: ['nombre', 'gramos', 'estado', 'confianza'],
        additionalProperties: false,
      },
    },
  },
  required: ['items'],
  additionalProperties: false,
};

/** Lo que devuelve el modelo, validado. null si no cumple. */
function validar(crudo: unknown): Item[] | null {
  if (typeof crudo !== 'object' || crudo === null) return null;
  const items = (crudo as { items?: unknown }).items;
  if (!Array.isArray(items) || items.length > MAX_ITEMS) return null;

  const salida: Item[] = [];
  for (const it of items) {
    if (typeof it !== 'object' || it === null) return null;
    const { nombre, gramos, estado, confianza } = it as Record<string, unknown>;
    if (typeof nombre !== 'string' || !nombre.trim()) return null;
    if (typeof gramos !== 'number' || !Number.isFinite(gramos)) return null;
    if (gramos < 1 || gramos > MAX_GRAMOS) return null;
    if (estado !== null && estado !== 'crudo' && estado !== 'cocido') return null;
    if (confianza !== 'alta' && confianza !== 'media' && confianza !== 'baja') return null;
    salida.push({ nombre: nombre.trim(), gramos: Math.round(gramos), estado, confianza });
  }
  return salida;
}

async function analizar(imagen: string, tipo: 'image/jpeg' | 'image/png' | 'image/webp'): Promise<Item[] | null> {
  const cliente = new Anthropic({
    apiKey: Deno.env.get('ANTHROPIC_API_KEY'),
    timeout: TIMEOUT_MODELO_MS,
    // Sin reintentos: uno solo ya puede comerse el tiempo que espera la app.
    maxRetries: 0,
  });

  const respuesta = await cliente.messages.create({
    model: MODELO,
    max_tokens: 1024,
    system: INSTRUCCIONES,
    output_config: { format: { type: 'json_schema', schema: SCHEMA } },
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: tipo, data: imagen } },
          { type: 'text', text: 'Listá los alimentos de esta foto.' },
        ],
      },
    ],
  } as Anthropic.MessageCreateParamsNonStreaming);

  // Con refusal o max_tokens la salida puede no cumplir el schema.
  if (respuesta.stop_reason !== 'end_turn') {
    console.error(`analizar-foto: stop_reason ${respuesta.stop_reason}`);
    return null;
  }
  const texto = respuesta.content.find((b) => b.type === 'text');
  if (!texto || texto.type !== 'text') return null;

  try {
    return validar(JSON.parse(texto.text));
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Pedido
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return error('PEDIDO_INVALIDO', 'Usá POST.', 405);
  }

  let cuerpo: { imagen?: unknown; install_id?: unknown };
  try {
    cuerpo = await req.json();
  } catch {
    return error('PEDIDO_INVALIDO', 'El cuerpo no es JSON.', 400);
  }

  const installId = cuerpo.install_id;
  if (typeof installId !== 'string' || !UUID.test(installId)) {
    return error('PEDIDO_INVALIDO', 'Falta install_id o no es un UUID.', 400);
  }

  let imagen = cuerpo.imagen;
  if (typeof imagen !== 'string' || !imagen) {
    return error('PEDIDO_INVALIDO', 'Falta la imagen.', 400);
  }
  // Por si viene como data URL.
  imagen = imagen.replace(/^data:[^;]+;base64,/, '').replace(/\s/g, '');
  const b64 = imagen as string;

  if (bytesDeBase64(b64) > MAX_BYTES_IMAGEN) {
    return error('IMAGEN_GRANDE', 'La imagen pesa más de 2 MB.', 413);
  }
  const tipo = tipoDeImagen(b64);
  if (!tipo) {
    return error('PEDIDO_INVALIDO', 'La imagen tiene que ser JPEG, PNG o WebP.', 400);
  }

  const db = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );
  const { dia, semana } = diaYSemana(new Date());

  // El cupo se toma ANTES de llamar al modelo; si el analisis falla, se
  // devuelve. Asi dos pedidos a la vez no pueden pasarse del limite.
  const { data: cupo, error: errCupo } = await db
    .rpc('consumir_foto', {
      p_install_id: installId,
      p_semana: semana,
      p_limite: LIMITE_SEMANA,
      p_dia: dia,
      p_limite_global: LIMITE_GLOBAL,
    })
    .single<{ permitido: boolean; motivo: 'semanal' | 'global' | null; usadas: number | null }>();

  if (errCupo || !cupo) {
    console.error('analizar-foto: consumir_foto fallo', errCupo);
    return error('ERROR_INTERNO', 'No se pudo verificar el límite.', 500);
  }
  if (!cupo.permitido) {
    return cupo.motivo === 'global'
      ? error('LIMITE_GLOBAL', 'Las fotos están en pausa por hoy.', 503)
      : error('LIMITE_SEMANAL', 'Llegaste al límite de fotos de esta semana.', 429);
  }

  const devolver = async () => {
    const { error: e } = await db.rpc('devolver_foto', {
      p_install_id: installId,
      p_semana: semana,
      p_dia: dia,
    });
    if (e) console.error('analizar-foto: devolver_foto fallo', e);
  };

  let items: Item[] | null;
  try {
    items = await analizar(b64, tipo);
  } catch (e) {
    // Solo el mensaje: el error del SDK no trae la imagen, pero por las dudas
    // no se loguea el objeto entero.
    console.error('analizar-foto: error del modelo', e instanceof Error ? e.message : String(e));
    await devolver();
    return error('ANALISIS_FALLIDO', 'No se pudo analizar la foto.', 502);
  }

  if (items === null) {
    await devolver();
    return error('ANALISIS_FALLIDO', 'La respuesta del análisis no fue válida.', 502);
  }

  return responder({ items, restantes: Math.max(LIMITE_SEMANA - (cupo.usadas ?? 0), 0) });
});
