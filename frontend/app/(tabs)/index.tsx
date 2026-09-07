// Dashboard del dia. Responde una sola pregunta de un vistazo: cuanto me
// queda hoy. Todo lo demas es secundario.
//
// Los datos salen de cuatro fuentes: el perfil, el ultimo peso registrado, las
// comidas de hoy y los items de cada una. El objetivo se recalcula en cada
// carga y no se guarda: depende del peso, que cambia.

import { useState, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';

import { Ionicons } from '@expo/vector-icons';

import { Pantalla } from '@/ui/Pantalla';
import { Boton } from '@/ui/Boton';
import { colors, spacing, radius, fontSize, fontWeight, lineHeight, shadow, sizes } from '@/ui/theme';

import { calcularTodo } from '@/lib/nutricion';
import type { ResultadoNutricional } from '@/lib/nutricion';
import { obtenerPerfilLocal } from '@/db/queries/perfil';
import { ultimoPeso } from '@/db/queries/peso';
import { listarComidasPorFecha, listarItemsConAlimento } from '@/db/queries/comidas';
import { CartelPendientes } from '@/features/agenda/components/CartelPendientes';
import type { TipoComida } from '@/db/schema';
import { calcularEdad, aFechaLocal } from '@/lib/fechas';

// ---------------------------------------------------------------------------
// Tipos y helpers
// ---------------------------------------------------------------------------

type Macros = { kcal: number; prot: number; carb: number; grasa: number };

type ComidaResumen = {
  id: string;
  tipo: TipoComida;
  kcal: number;
  /** Los primeros nombres nomas: la fila es un resumen, no la lista completa. */
  alimentos: string[];
};

/**
 * Un solo objeto de estado en vez de cinco useState sueltos: asi la pantalla
 * no se arma por partes mientras cargan las queries.
 */
type Estado = {
  /** El cartel de eventos sin responder lo necesita para su consulta. */
  usuarioId: string;
  objetivo: ResultadoNutricional | null;
  consumido: Macros;
  comidas: ComidaResumen[];
};

const VACIO: Macros = { kcal: 0, prot: 0, carb: 0, grasa: 0 };

/** Cuantos alimentos se nombran por fila antes de cortar. */
const MAX_ALIMENTOS = 3;

function capitalizar(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

// ---------------------------------------------------------------------------
// Pantalla
// ---------------------------------------------------------------------------

export default function Dashboard() {
  const router = useRouter();
  const [estado, setEstado] = useState<Estado | null>(null);

  // useFocusEffect y no useEffect: al volver de registrar una comida, el
  // dashboard tiene que reflejarla.
  useFocusEffect(
    useCallback(() => {
      let vivo = true;

      (async () => {
        const perfil = await obtenerPerfilLocal();
        if (!perfil) return;

        const hoy = aFechaLocal(new Date());
        const [peso, comidas] = await Promise.all([
          ultimoPeso(perfil.id),
          listarComidasPorFecha(perfil.id, hoy),
        ]);

        // Una query de items por comida. Con 3-5 comidas por dia es barato;
        // si algun dia hay muchas mas, conviene un solo JOIN por fecha.
        const conItems = await Promise.all(
          comidas.map(async (c) => ({
            comida: c,
            items: await listarItemsConAlimento(c.id),
          })),
        );

        const edad = perfil.fecha_nacimiento ? calcularEdad(perfil.fecha_nacimiento) : null;

        // Todos los campos del perfil son nullable porque el onboarding los
        // va guardando de a uno. Sin alguno, no hay objetivo que mostrar.
        const objetivo =
          peso?.peso_kg &&
          perfil.altura_cm &&
          edad &&
          perfil.sexo_biologico &&
          perfil.nivel_actividad &&
          perfil.objetivo
            ? calcularTodo({
                peso_kg: peso.peso_kg,
                altura_cm: perfil.altura_cm,
                edad,
                sexo: perfil.sexo_biologico,
                nivel_actividad: perfil.nivel_actividad,
                objetivo: perfil.objetivo,
              })
            : null;

        // Se acumula sin redondear y se redondea recien al mostrar: redondear
        // cada item hace que la suma de las partes no de el total.
        const consumido = conItems.reduce((acc, { items }) => {
          for (const it of items) {
            const f = it.cantidad_g / 100;
            acc.kcal += it.kcal_por_100g * f;
            acc.prot += it.proteina_g * f;
            acc.carb += it.carbohidratos_g * f;
            acc.grasa += it.grasa_g * f;
          }
          return acc;
        }, { ...VACIO });

        if (!vivo) return;
        setEstado({
          usuarioId: perfil.id,
          objetivo,
          consumido,
          comidas: conItems.map(({ comida, items }) => ({
            id: comida.id,
            tipo: comida.tipo,
            kcal: Math.round(
              items.reduce((s, it) => s + (it.kcal_por_100g * it.cantidad_g) / 100, 0),
            ),
            // Se corta aca y no al renderizar: la fila entra en una linea y
            // con tres nombres ya se entiende que comio. Sin puntos
            // suspensivos, que no agregan nada.
            alimentos: items.slice(0, MAX_ALIMENTOS).map((it) => it.alimento_nombre),
          })),
        });
      })().catch((e) => console.error('Error al cargar el dashboard:', e));

      return () => { vivo = false; };
    }, []),
  );

  if (!estado) {
    return (
      <Pantalla style={{ paddingTop: 0 }}>
        <Text style={estilos.detalle}>Cargando…</Text>
      </Pantalla>
    );
  }

  const { usuarioId, objetivo, consumido, comidas } = estado;
  const meta = objetivo?.kcal_objetivo ?? 0;
  const restante = Math.round(meta - consumido.kcal);
  const proporcion = meta > 0 ? Math.min(1, consumido.kcal / meta) : 0;
  const seExcedio = restante < 0;

  const fecha = new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric' });

  return (
    <Pantalla style={{ paddingTop: 0 }}>
      <View style={estilos.header}>
        <Text style={estilos.titulo}>Hoy</Text>
        <Text style={estilos.fecha}>{capitalizar(fecha)}</Text>
      </View>

      {/* Lo que queda del dia. Si se paso, cambia el texto en vez de mostrar
          un negativo suelto: dice lo mismo y no se lee como un error. */}
      <View style={estilos.destacado}>
        <Text style={estilos.destacadoLabel}>
          {seExcedio ? 'Te pasaste por' : 'Te quedan'}
        </Text>
        <Text style={[estilos.destacadoNumero, seExcedio && estilos.excedido]}>
          {Math.abs(restante).toLocaleString('es-AR')}
        </Text>
        <Text style={estilos.destacadoLabel}>de {meta.toLocaleString('es-AR')} kcal</Text>
        <View style={estilos.barraFondo}>
          <View
            style={[
              estilos.barraRelleno,
              { width: `${proporcion * 100}%` },
              seExcedio && estilos.barraExcedida,
            ]}
          />
        </View>
      </View>

      {/* Macros. Orden y color fijos: el usuario aprende que el rosa es
          proteina y despues lee de un vistazo. */}
      {objetivo && (
        <View style={estilos.macros}>
          <Macro
            label="Proteína"
            actual={consumido.prot}
            meta={objetivo.macros.proteina_g}
            estiloBarra={estilos.macroBarraProteina}
          />
          <Macro
            label="Carbos"
            actual={consumido.carb}
            meta={objetivo.macros.carbohidratos_g}
            estiloBarra={estilos.macroBarraCarbos}
          />
          <Macro
            label="Grasas"
            actual={consumido.grasa}
            meta={objetivo.macros.grasa_g}
            estiloBarra={estilos.macroBarraGrasas}
          />
        </View>
      )}

      <Text style={estilos.seccion}>Comiste</Text>

      {/* Todo adentro de una card: se lee como un bloque y no como items
          flotando sobre el lienzo. Solo aparecen las comidas registradas; las
          que faltan no se listan en gris, porque se leen como un reproche. */}
      <View style={estilos.card}>
        {comidas.length === 0 ? (
          <View style={estilos.vacio}>
            <Text style={estilos.detalle}>Todavía no registraste nada hoy.</Text>
          </View>
        ) : (
          comidas.map((c, i) => (
            <Pressable
              key={c.id}
              style={({ pressed }) => [
                estilos.comida,
                // El separador va ADENTRO de la card, y la ultima fila no lleva.
                i < comidas.length - 1 && estilos.comidaSeparador,
                pressed && estilos.comidaPresionada,
              ]}
              onPress={() => router.push(`/comida/${c.id}`)}
            >
              <View style={estilos.flex}>
                <Text style={estilos.comidaTipo}>{capitalizar(c.tipo)}</Text>
                {c.alimentos.length > 0 && (
                  <Text style={estilos.comidaAlimentos} numberOfLines={1}>
                    {c.alimentos.join(', ')}
                  </Text>
                )}
              </View>
              <Text style={estilos.comidaKcal}>{c.kcal}</Text>
            </Pressable>
          ))
        )}
      </View>

      {/* Entrenar va aca y no escondido: el temporizador sirve para el
          entrenamiento propio, y hasta ahora solo se llegaba desde un evento
          agendado, que es justo cuando no hace falta. */}
      <View style={estilos.acciones}>
        <BotonAccion
          titulo="Registrar comida"
          icono="restaurant-outline"
          variante="primario"
          onPress={() => router.push('/comida/nueva')}
        />
        <BotonAccion
          titulo="Entrenar"
          icono="barbell-outline"
          variante="secundario"
          onPress={() => router.push('/evento/temporizador')}
        />
      </View>

      {/* --- SOLO DESARROLLO: sacar antes de publicar --- */}
      <Boton
        titulo="Playground"
        variante="secundario"
        onPress={() => router.push('/playground')}
      />

      {/* Va aca y no en el layout raiz: asi nunca aparece sobre el onboarding
          ni sobre el registro. Se muestra una sola vez por sesion de app. */}
      <CartelPendientes usuarioId={usuarioId} />
    </Pantalla>
  );
}

/**
 * Boton grande del dashboard: icono arriba, texto abajo.
 *
 * No sale de ui/Boton porque ese es de una sola linea y altura fija; estos dos
 * van apilados, del mismo ancho y uno al lado del otro.
 */
function BotonAccion({
  titulo,
  icono,
  variante,
  onPress,
}: {
  titulo: string;
  icono: keyof typeof Ionicons.glyphMap;
  variante: 'primario' | 'secundario';
  onPress: () => void;
}) {
  const primario = variante === 'primario';

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        estilos.accion,
        primario ? estilos.accionPrimaria : estilos.accionSecundaria,
        pressed &&
          (primario ? estilos.accionPrimariaPresionada : estilos.accionSecundariaPresionada),
      ]}
    >
      <Ionicons
        name={icono}
        size={sizes.icon}
        color={primario ? colors.textOnAction : colors.action}
      />
      <Text
        style={[
          estilos.accionTexto,
          primario ? estilos.accionTextoPrimario : estilos.accionTextoSecundario,
        ]}
      >
        {titulo}
      </Text>
    </Pressable>
  );
}

/** Una card de macro con su barra de progreso. */
function Macro({
  label,
  actual,
  meta,
  estiloBarra,
}: {
  label: string;
  actual: number;
  meta: number;
  estiloBarra: object;
}) {
  const proporcion = meta > 0 ? Math.min(1, actual / meta) : 0;

  return (
    <View style={estilos.macro}>
      <Text style={estilos.macroLabel}>{label}</Text>
      <Text style={estilos.macroValor}>
        {Math.round(actual)}
        <Text style={estilos.macroObjetivo}> / {meta} g</Text>
      </Text>
      <View style={estilos.macroBarraFondo}>
        <View style={[estiloBarra, { width: `${proporcion * 100}%` }]} />
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------

const estilos = StyleSheet.create({
  flex: { flex: 1 },

  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  titulo: {
    fontSize: fontSize.title,
    lineHeight: lineHeight.title,
    fontWeight: '500',
    color: colors.textPrimary,
  },
  fecha: { fontSize: fontSize.small, color: colors.textSecondary },

  destacado: {
    // Blanco, no surfaceAlt: es la card principal del dashboard y el esquema
    // dice que el contenido va en blanco. En crema sobre crema casi no se
    // despegaba del lienzo.
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    alignItems: 'center',
    ...shadow.card,
  },
  destacadoLabel: {
    fontSize: fontSize.small,
    lineHeight: lineHeight.small,
    color: colors.textSecondary,
  },
  destacadoNumero: {
    fontSize: fontSize.title,
    lineHeight: lineHeight.title,
    fontWeight: 'bold',
    color: colors.textPrimary,
  },
  excedido: { color: colors.danger },
  barraFondo: {
    width: '100%',
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.border,
    overflow: 'hidden',
    marginTop: spacing.md,
  },
  barraRelleno: { height: '100%', backgroundColor: colors.action },
  barraExcedida: { backgroundColor: colors.danger },

  macros: { flexDirection: 'row', gap: spacing.sm },
  macro: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
    ...shadow.card,
  },
  macroLabel: { fontSize: fontSize.small, color: colors.textSecondary },
  macroValor: { fontSize: fontSize.body, fontWeight: '500', color: colors.textPrimary },
  macroObjetivo: { fontSize: fontSize.small, color: colors.textSecondary },
  macroBarraFondo: {
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  macroBarraProteina: { height: '100%', backgroundColor: colors.protein },
  macroBarraCarbos: { height: '100%', backgroundColor: colors.carbs },
  macroBarraGrasas: { height: '100%', backgroundColor: colors.fat },

  seccion: {
    fontSize: fontSize.small,
    fontWeight: '500',
    color: colors.textSecondary,
    marginTop: spacing.md,
  },
  // La card de comidas. Sin padding vertical: lo pone cada fila, asi los
  // separadores llegan de lado a lado del interior.
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    ...shadow.card,
  },
  comida: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  comidaSeparador: {
    borderBottomWidth: sizes.hairline,
    borderBottomColor: colors.border,
  },
  comidaPresionada: { opacity: 0.6 },
  comidaTipo: { fontSize: fontSize.body, color: colors.textPrimary },
  comidaAlimentos: {
    fontSize: fontSize.caption,
    lineHeight: lineHeight.caption,
    color: colors.textSecondary,
  },
  comidaKcal: { fontSize: fontSize.body, color: colors.textPrimary },

  // Los dos botones: mismo ancho (flex 1) y el icono arriba del texto.
  acciones: { flexDirection: 'row', gap: spacing.sm },
  accion: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  accionPrimaria: { backgroundColor: colors.action },
  accionPrimariaPresionada: { backgroundColor: colors.actionPressed },
  // Borde de accion, no de border: tiene que leerse como el par del primario
  // y no como una card mas.
  accionSecundaria: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.action,
  },
  accionSecundariaPresionada: { backgroundColor: colors.surfaceAlt },
  accionTexto: { fontSize: fontSize.small, fontWeight: fontWeight.medium },
  accionTextoPrimario: { color: colors.textOnAction },
  accionTextoSecundario: { color: colors.action },

  vacio: { paddingVertical: spacing.xl, alignItems: 'center' },
  detalle: { fontSize: fontSize.small, lineHeight: lineHeight.small, color: colors.textSecondary },
});