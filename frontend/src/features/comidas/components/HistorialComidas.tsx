// src/features/comidas/components/HistorialComidas.tsx
//
// Pestaña Historial de Mis comidas: lo registrado por semana o por mes, dia
// por dia. Los totales salen de SQL (totalesPorDia y comidasPorRango), no de
// recorrer comida por comida. Los periodos son de calendario: ver
// src/lib/historial.ts.
//
// El resumen son datos: dias registrados y promedio de esos dias, sin
// objetivo y sin colores de "bien" o "mal".

import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { Chip } from '@/ui/Chip';
import { SheetAcciones } from '@/ui/SheetAcciones';
import type { Accion } from '@/ui/SheetAcciones';
import { colors, fontSize, fontWeight, lineHeight, radius, shadow, sizes, spacing } from '@/ui/theme';
import { comidasPorRango, repetirComida, totalesPorDia } from '@/db/queries/comidas';
import type { ComidaHistorial, DiaHistorial } from '@/db/queries/comidas';
import { MiniaturaComida } from '@/features/foto/components/FotoComida';
import { fotoDisponible } from '@/features/foto/archivo';
import { aFechaLocal, aISOLocal } from '@/lib/fechas';
import {
  diasDelPeriodo,
  etiquetaDia,
  hayPeriodoSiguiente,
  miles,
  moverPeriodo,
  rangoDe,
  textoResumen,
  tituloPeriodo,
} from '@/lib/historial';
import type { PeriodoHistorial, Rango } from '@/lib/historial';

const ETIQUETA: Record<PeriodoHistorial, string> = { semana: 'Semana', mes: 'Mes' };

function capitalizar(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/** "13:05" de un ISO con offset: la hora tal como se guardo, local. */
function horaDe(fechaHora: string): string {
  return fechaHora.slice(11, 16);
}

export function HistorialComidas({
  usuarioId,
  onAviso,
  accionesExtra,
  version = 0,
}: {
  usuarioId: string;
  /** Para el toast de la pantalla ("Agregado a hoy"). */
  onAviso: (mensaje: string) => void;
  /** Acciones del "⋯" ademas de Repetir, por comida. */
  accionesExtra?: (comida: ComidaHistorial) => Accion[];
  /** Cambiarla recarga la lista (despues de guardar algo desde la pantalla). */
  version?: number;
}) {
  const router = useRouter();
  const hoy = aFechaLocal(new Date());
  const [periodo, setPeriodo] = useState<PeriodoHistorial>('semana');
  const [rango, setRango] = useState<Rango>(() => rangoDe('semana', hoy));
  const [dias, setDias] = useState<DiaHistorial[] | null>(null);
  const [comidas, setComidas] = useState<ComidaHistorial[]>([]);
  const [menu, setMenu] = useState<ComidaHistorial | null>(null);

  const cargar = useCallback(async () => {
    const [d, c] = await Promise.all([
      totalesPorDia(usuarioId, rango.desde, rango.hasta),
      comidasPorRango(usuarioId, rango.desde, rango.hasta),
    ]);
    setDias(d);
    setComidas(c);
    // version no se lee: esta para que cambiarla vuelva a cargar
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuarioId, rango, version]);

  // Al volver del detalle (pudo borrar o editar) se recarga
  useFocusEffect(
    useCallback(() => {
      cargar().catch((e) => console.error('Error al cargar el historial:', e));
    }, [cargar]),
  );

  const elegirPeriodo = (p: PeriodoHistorial) => {
    setPeriodo(p);
    setRango(rangoDe(p, hoy));
  };

  const repetir = async (c: ComidaHistorial) => {
    try {
      await repetirComida(c.id, aISOLocal(new Date()));
      onAviso('Agregado a hoy');
      await cargar();
    } catch (e) {
      console.error('Error al repetir la comida:', e);
      onAviso('No se pudo repetir');
    }
  };

  const siguiente = hayPeriodoSiguiente(rango, hoy);
  const porDia = new Map<string, ComidaHistorial[]>();
  for (const c of comidas) porDia.set(c.fecha, [...(porDia.get(c.fecha) ?? []), c]);

  return (
    <View style={estilos.contenedor}>
      <View style={estilos.chips}>
        {(['semana', 'mes'] as const).map((p) => (
          <Chip key={p} texto={ETIQUETA[p]} activo={p === periodo} onPress={() => elegirPeriodo(p)} />
        ))}
      </View>

      <View style={estilos.navegacion}>
        <Pressable
          onPress={() => setRango(moverPeriodo(periodo, rango.desde, -1))}
          hitSlop={12}
          accessibilityLabel="Período anterior"
        >
          <Ionicons name="chevron-back" size={sizes.icon} color={colors.textPrimary} />
        </Pressable>
        <Text style={estilos.tituloPeriodo}>{tituloPeriodo(periodo, rango, hoy)}</Text>
        <Pressable
          onPress={() => setRango(moverPeriodo(periodo, rango.desde, 1))}
          disabled={!siguiente}
          hitSlop={12}
          accessibilityLabel="Período siguiente"
        >
          <Ionicons
            name="chevron-forward"
            size={sizes.icon}
            color={siguiente ? colors.textPrimary : colors.actionDisabled}
          />
        </Pressable>
      </View>

      {dias !== null && (
        <Text style={estilos.resumen}>
          {textoResumen(
            dias.map((d) => d.kcal),
            diasDelPeriodo(rango, hoy),
          )}
        </Text>
      )}

      {dias !== null && dias.length === 0 ? (
        <Text style={estilos.vacio}>Todavía no registraste comidas en este período.</Text>
      ) : (
        (dias ?? []).map((d) => (
          <View key={d.fecha} style={estilos.dia}>
            <View style={estilos.diaCabecera}>
              <Text style={estilos.diaTitulo}>{etiquetaDia(d.fecha, hoy)}</Text>
              <Text style={estilos.diaTotal}>{miles(d.kcal)} kcal</Text>
            </View>
            <View style={estilos.card}>
              {(porDia.get(d.fecha) ?? []).map((c, i, lista) => {
                const foto = fotoDisponible(c.foto_url);
                return (
                  <Pressable
                    key={c.id}
                    style={({ pressed }) => [
                      estilos.comida,
                      i < lista.length - 1 && estilos.comidaSeparador,
                      pressed && estilos.comidaPresionada,
                    ]}
                    onPress={() => router.push(`/comida/${c.id}`)}
                  >
                    {foto && <MiniaturaComida uri={foto} />}
                    <View style={estilos.flex}>
                      <Text style={estilos.comidaTipo}>{capitalizar(c.tipo)}</Text>
                      <Text style={estilos.comidaHora}>{horaDe(c.fecha_hora)}</Text>
                    </View>
                    <Text style={estilos.comidaKcal}>{miles(c.kcal)} kcal</Text>
                    <Pressable
                      onPress={() => setMenu(c)}
                      hitSlop={10}
                      style={estilos.botonMenu}
                      accessibilityLabel="Más acciones"
                    >
                      <Ionicons name="ellipsis-horizontal" size={20} color={colors.textSecondary} />
                    </Pressable>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))
      )}

      <SheetAcciones
        visible={menu !== null}
        titulo={menu ? `${capitalizar(menu.tipo)} · ${etiquetaDia(menu.fecha, hoy)}` : undefined}
        onCerrar={() => setMenu(null)}
        acciones={
          menu
            ? [
                { texto: 'Repetir hoy', icono: 'repeat-outline', onPress: () => void repetir(menu) },
                ...(accionesExtra?.(menu) ?? []),
              ]
            : []
        }
      />
    </View>
  );
}

const estilos = StyleSheet.create({
  contenedor: { gap: spacing.md },
  flex: { flex: 1 },
  chips: { flexDirection: 'row', gap: spacing.sm },
  navegacion: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tituloPeriodo: {
    fontSize: fontSize.body,
    lineHeight: lineHeight.body,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  resumen: {
    fontSize: fontSize.small,
    lineHeight: lineHeight.small,
    color: colors.textSecondary,
  },
  vacio: {
    fontSize: fontSize.small,
    lineHeight: lineHeight.small,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingVertical: spacing.xl,
  },
  dia: { gap: spacing.xs },
  diaCabecera: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingHorizontal: 2,
  },
  diaTitulo: {
    fontSize: fontSize.small,
    lineHeight: lineHeight.small,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  diaTotal: {
    fontSize: fontSize.small,
    lineHeight: lineHeight.small,
    color: colors.textSecondary,
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
  comidaHora: {
    fontSize: fontSize.caption,
    lineHeight: lineHeight.caption,
    color: colors.textSecondary,
  },
  comidaKcal: { fontSize: fontSize.body, fontWeight: fontWeight.medium, color: colors.textPrimary },
  botonMenu: { paddingLeft: spacing.xs },
});
