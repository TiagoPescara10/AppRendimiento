// Dashboard del dia. Responde una sola pregunta de un vistazo: cuanto me
// queda hoy. Todo lo demas es secundario.
//
// Los datos salen de cuatro fuentes: el perfil, el ultimo peso registrado, las
// comidas de hoy y los items de cada una. El objetivo se recalcula en cada
// carga y no se guarda: depende del peso, que cambia.

import { useState, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, Alert } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';

import { Ionicons } from '@expo/vector-icons';

import { Pantalla } from '@/ui/Pantalla';
import { Boton } from '@/ui/Boton';
import { colors, spacing, radius, fontSize, fontWeight, lineHeight, shadow, sizes } from '@/ui/theme';

import { calcularTodo, calcularMetaAgua } from '@/lib/nutricion';
import type { ResultadoNutricional } from '@/lib/nutricion';
import { obtenerPerfilLocal } from '@/db/queries/perfil';
import { ultimoPeso } from '@/db/queries/peso';
import { listarComidasPorFecha, listarItemsConAlimento } from '@/db/queries/comidas';
import { totalDelDia, registrarAgua, eliminarUltimoRegistro } from '@/db/queries/agua';
import { CartelPendientes } from '@/features/agenda/components/CartelPendientes';
import { SheetModoEntrenamiento } from '@/features/entrenamiento/components/SheetModoEntrenamiento';
import { proximosEventos, minutosEntrenamientoDelDia } from '@/db/queries/eventos';
import { CardHidratacion } from '@/features/nutricion/components/CardHidratacion';
import { MascotaLeon } from '@/features/mascota/MascotaLeon';
import {
  obtenerConsejoLeon,
  type ConsejoLeon,
  type EventoProximoResumen,
} from '@/features/mascota/logicaConsejos';
import type { TipoComida, PerfilRow } from '@/db/schema';
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
  nombreUsuario: string | null;
  modoNutricion: PerfilRow['modo_nutricion'];
  objetivo: ResultadoNutricional | null;
  consumido: Macros;
  comidas: ComidaResumen[];
  consejo: ConsejoLeon;
  aguaTotal: number;
  metaAgua: number;
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
  const [sheetEntrenarVisible, setSheetEntrenarVisible] = useState(false);

  // useFocusEffect y no useEffect: al volver de registrar una comida o agua, el
  // dashboard tiene que reflejarla.
  useFocusEffect(
    useCallback(() => {
      let vivo = true;

      (async () => {
        const perfil = await obtenerPerfilLocal();
        if (!perfil) return;

        const hoy = aFechaLocal(new Date());
        const ahoraIso = new Date().toISOString();
        const mananaIso = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
        const [peso, comidas, proximos, aguaTotal, minEntreno] = await Promise.all([
          ultimoPeso(perfil.id),
          listarComidasPorFecha(perfil.id, hoy),
          proximosEventos(perfil.id, ahoraIso, mananaIso, 1),
          totalDelDia(perfil.id, hoy),
          minutosEntrenamientoDelDia(perfil.id, hoy),
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

        const pesoKg = peso?.peso_kg ?? 70;
        const metaAgua = perfil.meta_agua_manual_ml ?? calcularMetaAgua(pesoKg, minEntreno);

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

        const primerEvento = proximos?.[0];
        let eventoResumen: EventoProximoResumen | null = null;
        if (primerEvento) {
          const diffMs = new Date(primerEvento.fecha_hora_inicio).getTime() - Date.now();
          const minutosParaInicio = Math.round(diffMs / 60000);
          eventoResumen = {
            id: primerEvento.id,
            titulo:
              primerEvento.tipo === 'partido'
                ? 'partido'
                : primerEvento.tipo === 'entrenamiento'
                ? 'entrenamiento'
                : 'tu sesión',
            tipo: primerEvento.tipo,
            horaInicio: primerEvento.fecha_hora_inicio,
            minutosParaInicio,
          };
        }

        const consejo = obtenerConsejoLeon({
          consumido,
          objetivo,
          proximoEvento: eventoResumen,
        });

        if (!vivo) return;
        setEstado({
          usuarioId: perfil.id,
          nombreUsuario: perfil.nombre,
          modoNutricion: perfil.modo_nutricion,
          objetivo,
          consumido,
          consejo,
          aguaTotal,
          metaAgua,
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
      <Pantalla>
        <Text style={estilos.detalle}>Cargando…</Text>
      </Pantalla>
    );
  }

  const { usuarioId, objetivo, consumido, comidas, modoNutricion } = estado;
  const esRecuento = modoNutricion === 'recuento' || !objetivo;
  const meta = objetivo?.kcal_objetivo ?? 0;
  const restante = Math.round(meta - consumido.kcal);
  const proporcion = meta > 0 ? Math.min(1, consumido.kcal / meta) : 0;
  const seExcedio = restante < 0;

  const manejarAgregarAgua = async (ml: number) => {
    if (!estado) return;
    const anterior = estado.aguaTotal;
    const hoy = aFechaLocal(new Date());

    // Actualizacion optimista inmediata para reflejar el cambio al instante
    setEstado((prev) => (prev ? { ...prev, aguaTotal: prev.aguaTotal + ml } : null));

    try {
      await registrarAgua({ usuario_id: estado.usuarioId, ml, fecha: hoy });
      // Sincronizacion con la fuente de verdad en base de datos
      const totalReal = await totalDelDia(estado.usuarioId, hoy);
      setEstado((prev) => (prev ? { ...prev, aguaTotal: totalReal } : null));
    } catch (error) {
      console.error('Error al registrar agua:', error);
      // Rollback al valor previo si falla la persistencia
      setEstado((prev) => (prev ? { ...prev, aguaTotal: anterior } : null));
      Alert.alert('Error', 'No se pudo guardar la toma de agua.');
    }
  };

  const manejarDeshacerAgua = async () => {
    if (!estado || estado.aguaTotal <= 0) return;
    const anterior = estado.aguaTotal;
    const hoy = aFechaLocal(new Date());

    try {
      await eliminarUltimoRegistro(estado.usuarioId, hoy);
      const nuevoTotal = await totalDelDia(estado.usuarioId, hoy);
      setEstado((prev) => (prev ? { ...prev, aguaTotal: nuevoTotal } : null));
    } catch (error) {
      console.error('Error al deshacer agua:', error);
      setEstado((prev) => (prev ? { ...prev, aguaTotal: anterior } : null));
      Alert.alert('Error', 'No se pudo deshacer la toma de agua.');
    }
  };

  const fecha = new Date().toLocaleDateString('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  return (
    <Pantalla style={estilos.pantalla}>
      {/* El leon reemplaza el encabezado: avatar, saludo y fecha en una sola linea */}
      <MascotaLeon
        consejo={estado.consejo}
        nombreUsuario={estado.nombreUsuario}
        fechaTexto={fecha}
      />

      {/* Lo que queda del dia o total consumido */}
      {esRecuento ? (
        <View style={estilos.destacado}>
          <Text style={estilos.destacadoLabel}>Consumiste</Text>
          <Text style={estilos.destacadoNumero}>
            {Math.round(consumido.kcal).toLocaleString('es-AR')}
          </Text>
          <Text style={estilos.destacadoLabel}>kcal hoy</Text>
        </View>
      ) : (
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
      )}

      {/* Macros */}
      <View style={estilos.macros}>
        <Macro
          label="Proteína"
          actual={consumido.prot}
          meta={objetivo?.macros.proteina_g}
          estiloBarra={estilos.macroBarraProteina}
        />
        <Macro
          label="Carbos"
          actual={consumido.carb}
          meta={objetivo?.macros.carbohidratos_g}
          estiloBarra={estilos.macroBarraCarbos}
        />
        <Macro
          label="Grasas"
          actual={consumido.grasa}
          meta={objetivo?.macros.grasa_g}
          estiloBarra={estilos.macroBarraGrasas}
        />
      </View>

      {/* Hidratacion */}
      <CardHidratacion
        actualMl={estado.aguaTotal}
        metaMl={estado.metaAgua}
        onAgregar={manejarAgregarAgua}
        onDeshacer={manejarDeshacerAgua}
      />

      <Text style={estilos.seccion}>Comiste</Text>

      {/* Estado vacio que ocupa el espacio sobrante en el lienzo, sin card blanca */}
      {comidas.length === 0 ? (
        <View style={estilos.vacioSobrante}>
          <Text style={estilos.vacioTexto}>Todavía no registraste nada hoy.</Text>
        </View>
      ) : (
        <View style={estilos.card}>
          {comidas.map((c, i) => (
            <Pressable
              key={c.id}
              style={({ pressed }) => [
                estilos.comida,
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
              <View style={estilos.comidaKcalColumna}>
                <Text style={estilos.comidaKcal}>{c.kcal.toLocaleString('es-AR')}</Text>
                <Text style={estilos.comidaKcalUnidad}>kcal</Text>
              </View>
            </Pressable>
          ))}
        </View>
      )}

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
          onPress={() => setSheetEntrenarVisible(true)}
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

      <SheetModoEntrenamiento
        visible={sheetEntrenarVisible}
        onCerrar={() => setSheetEntrenarVisible(false)}
      />
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

/** Una card de macro con su barra de progreso (o contador simple si no hay meta). */
function Macro({
  label,
  actual,
  meta,
  estiloBarra,
}: {
  label: string;
  actual: number;
  meta?: number | null;
  estiloBarra: object;
}) {
  const tieneMeta = meta != null && meta > 0;
  const proporcion = tieneMeta ? Math.min(1, actual / meta) : 0;

  return (
    <View style={estilos.macro}>
      <Text style={estilos.macroLabel}>{label}</Text>
      <Text style={estilos.macroValor}>
        {Math.round(actual)}
        <Text style={estilos.macroObjetivo}>{tieneMeta ? ` / ${meta} g` : ' g'}</Text>
      </Text>
      {tieneMeta && (
        <View style={estilos.macroBarraFondo}>
          <View style={[estiloBarra, { width: `${proporcion * 100}%` }]} />
        </View>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------

const estilos = StyleSheet.create({
  flex: { flex: 1 },

  pantalla: {
    gap: spacing.md,
    paddingBottom: spacing.lg,
  },

  destacado: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    ...shadow.card,
  },
  destacadoLabel: {
    fontSize: fontSize.caption,
    lineHeight: lineHeight.caption,
    color: colors.textSecondary,
  },
  destacadoNumero: {
    fontSize: fontSize.display,
    lineHeight: lineHeight.display,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  excedido: { color: colors.danger },
  barraFondo: {
    width: '100%',
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.border,
    overflow: 'hidden',
    marginTop: spacing.xs,
  },
  barraRelleno: { height: '100%', backgroundColor: colors.action },
  barraExcedida: { backgroundColor: colors.danger },

  macros: { flexDirection: 'row', gap: spacing.sm },
  macro: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    gap: 4,
    ...shadow.card,
  },
  macroLabel: {
    fontSize: fontSize.caption,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  macroValor: {
    fontSize: fontSize.body,
    fontWeight: fontWeight.medium,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  macroObjetivo: { fontSize: fontSize.caption, color: colors.textSecondary },
  macroBarraFondo: {
    width: '100%',
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    overflow: 'hidden',
    marginTop: spacing.xs,
  },
  macroBarraProteina: { height: '100%', backgroundColor: colors.protein },
  macroBarraCarbos: { height: '100%', backgroundColor: colors.carbs },
  macroBarraGrasas: { height: '100%', backgroundColor: colors.fat },

  seccion: {
    fontSize: fontSize.caption,
    fontWeight: fontWeight.bold,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: spacing.sm,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
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
  comidaTipo: { fontSize: fontSize.body, color: colors.textPrimary, fontWeight: fontWeight.medium },
  comidaAlimentos: {
    fontSize: fontSize.caption,
    lineHeight: lineHeight.caption,
    color: colors.textSecondary,
  },
  comidaKcalColumna: {
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  comidaKcal: { fontSize: fontSize.body, fontWeight: fontWeight.medium, color: colors.textPrimary },
  comidaKcalUnidad: {
    fontSize: fontSize.caption,
    lineHeight: lineHeight.caption,
    color: colors.textSecondary,
  },

  // Vacio sobre el lienzo sin card blanca ni elevacion
  vacioSobrante: {
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vacioTexto: {
    fontSize: fontSize.small,
    color: colors.textMuted,
  },

  // Los dos botones: mismo ancho (flex 1) y el icono arriba del texto.
  acciones: { flexDirection: 'row', gap: spacing.xs },
  accion: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  accionPrimaria: { backgroundColor: colors.action },
  accionPrimariaPresionada: { backgroundColor: colors.actionPressed },
  accionSecundaria: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.action,
  },
  accionSecundariaPresionada: { backgroundColor: colors.surfaceAlt },
  accionTexto: { fontSize: fontSize.caption, fontWeight: fontWeight.bold },
  accionTextoPrimario: { color: colors.textOnAction },
  accionTextoSecundario: { color: colors.action },

  vacio: { paddingVertical: spacing.xl, alignItems: 'center' },
  detalle: { fontSize: fontSize.small, lineHeight: lineHeight.small, color: colors.textSecondary },
});