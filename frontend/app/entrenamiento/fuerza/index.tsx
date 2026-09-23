// app/entrenamiento/fuerza/index.tsx
//
// Fuerza y Progresion, pantalla 1: elegir rutina y, dentro de ella, el
// ejercicio. Cada fila resume como viene el ejercicio (ultimo 1RM estimado y
// tendencia) para ver el panorama de la rutina entera antes de entrar al
// detalle, que vive en fuerza/[ejercicioId].tsx.
//
// "Otros" junta los ejercicios con historial que no estan en ninguna rutina
// activa (sesiones libres, o sacados de la rutina): sin ese grupo, ese
// historial no tendria por donde verse.

import { useState, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { Pantalla } from '@/ui/Pantalla';
import { colors, spacing, radius, fontSize, lineHeight, shadow } from '@/ui/theme';

import { obtenerPerfilLocal } from '@/db/queries/perfil';
import { listarRutinasGimnasio } from '@/db/queries/rutinasGimnasio';
import { listarEjerciciosConHistorial, listarSeriesPorEjercicio } from '@/db/queries/sesiones';
import type { EjercicioRow } from '@/db/schema';
import {
  agruparEjerciciosPorRutina,
  resumenFilaEjercicio,
  type GrupoEjercicios,
  type ResumenFilaEjercicio,
  type Tendencia,
} from '@/lib/fuerza';
import { aFechaLocal } from '@/lib/fechas';

const ICONO_TENDENCIA: Record<Tendencia, { nombre: 'arrow-up' | 'arrow-down' | 'remove'; color: string }> = {
  sube: { nombre: 'arrow-up', color: colors.success },
  baja: { nombre: 'arrow-down', color: colors.danger },
  igual: { nombre: 'remove', color: colors.textMuted },
};

function capitalizar(t: string): string {
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function textoUltimaVez(fecha: string | null, hoy: string): string {
  if (!fecha) return '';
  if (fecha === hoy) return 'hoy';
  // "18 sep": corto a proposito, la fila no tiene lugar para "Jueves 18 de septiembre".
  return new Date(`${fecha}T00:00:00`).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
}

export default function FuerzaPorRutina() {
  const router = useRouter();

  const [cargando, setCargando] = useState(true);
  const [grupos, setGrupos] = useState<GrupoEjercicios<EjercicioRow>[]>([]);
  const [resumenes, setResumenes] = useState<Record<string, ResumenFilaEjercicio>>({});
  const [grupoId, setGrupoId] = useState<string | null>(null);

  const hoy = aFechaLocal(new Date());

  useFocusEffect(
    useCallback(() => {
      let vivo = true;
      (async () => {
        try {
          const perfil = await obtenerPerfilLocal();
          if (!perfil) return;

          const [rutinas, conHistorial] = await Promise.all([
            listarRutinasGimnasio(perfil.id, true),
            listarEjerciciosConHistorial(perfil.id),
          ]);

          const pares = await Promise.all(
            conHistorial.map(
              async (ej) =>
                [ej.id, resumenFilaEjercicio(await listarSeriesPorEjercicio(perfil.id, ej.id))] as const,
            ),
          );
          if (!vivo) return;

          const nuevos = agruparEjerciciosPorRutina(rutinas, conHistorial);
          setGrupos(nuevos);
          setResumenes(Object.fromEntries(pares));
          // Mantener la rutina elegida al volver del detalle; si ya no existe,
          // arrancar por la primera que tenga algo registrado.
          setGrupoId((actual) =>
            actual && nuevos.some((g) => g.id === actual)
              ? actual
              : (nuevos.find((g) => g.ejercicios.some((e) => e.conHistorial)) ?? nuevos[0])?.id ?? null,
          );
        } catch (e) {
          console.error('Error al cargar fuerza por rutina:', e);
        } finally {
          if (vivo) setCargando(false);
        }
      })();
      return () => {
        vivo = false;
      };
    }, []),
  );

  const header = (
    <View style={estilos.header}>
      <Pressable onPress={() => router.back()} hitSlop={12} style={estilos.botonVolver}>
        <Ionicons name="arrow-back" size={20} color={colors.textPrimary} />
      </Pressable>
      <Text style={estilos.titulo}>Fuerza y Progresión</Text>
    </View>
  );

  if (cargando) {
    return (
      <Pantalla scroll={false}>
        <View style={estilos.centrado}>
          <ActivityIndicator color={colors.action} />
        </View>
      </Pantalla>
    );
  }

  if (grupos.length === 0) {
    return (
      <Pantalla>
        {header}
        <View style={estilos.cardVacia}>
          <Ionicons name="barbell-outline" size={36} color={colors.textMuted} />
          <Text style={estilos.cardVaciaTitulo}>Sin registros de fuerza todavía</Text>
          <Text style={estilos.cardVaciaTexto}>
            Creá una rutina de gimnasio y completala para empezar a ver la evolución de tus cargas y el 1RM estimado de cada ejercicio.
          </Text>
        </View>
      </Pantalla>
    );
  }

  const grupo = grupos.find((g) => g.id === grupoId) ?? grupos[0];
  const conDatos = grupo.ejercicios.filter((e) => e.conHistorial).length;

  return (
    <Pantalla>
      {header}

      {/* Paso 1: la rutina */}
      <View style={estilos.selectorSeccion}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={estilos.selectorScroll}
        >
          {grupos.map((g) => {
            const activo = g.id === grupo.id;
            return (
              <Pressable
                key={g.id}
                style={[estilos.chip, activo && estilos.chipActivo]}
                onPress={() => setGrupoId(g.id)}
              >
                <Text style={[estilos.chipTexto, activo && estilos.chipTextoActivo]}>
                  {g.nombre}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <Text style={estilos.seccionSubtitulo}>
        {grupo.ejercicios.length} {grupo.ejercicios.length === 1 ? 'ejercicio' : 'ejercicios'}
        {conDatos < grupo.ejercicios.length ? ` · ${conDatos} con registros` : ''}
      </Text>

      {/* Paso 2: el ejercicio */}
      <View style={estilos.lista}>
        {grupo.ejercicios.map(({ ejercicio: ej, conHistorial }, idx) => {
          const r = resumenes[ej.id];
          const tend = r?.tendencia ? ICONO_TENDENCIA[r.tendencia] : null;
          const mejor = r?.mejorSerie;
          const valor =
            r?.unRM != null
              ? `${r.unRM} kg`
              : mejor
              ? `${mejor.peso_kg} kg × ${mejor.repeticiones}`
              : conHistorial
              ? 'Corporal'
              : null;

          return (
            <Pressable
              key={ej.id}
              disabled={!conHistorial}
              onPress={() => router.push(`/entrenamiento/fuerza/${ej.id}`)}
              style={({ pressed }) => [
                estilos.fila,
                !conHistorial && estilos.filaSinDatos,
                pressed && estilos.filaPresionada,
              ]}
            >
              {grupo.id !== 'otros' && <Text style={estilos.numero}>{idx + 1}</Text>}
              <View style={estilos.filaInfo}>
                <Text style={estilos.filaNombre} numberOfLines={1}>
                  {ej.nombre}
                </Text>
                <Text style={estilos.filaDetalle}>
                  {conHistorial
                    ? `${capitalizar(ej.grupo)} · ${textoUltimaVez(r?.ultimaFecha ?? null, hoy)}`
                    : 'Sin registros'}
                </Text>
              </View>

              {valor ? (
                <View style={estilos.filaValorCol}>
                  <View style={estilos.filaValorFila}>
                    <Text style={estilos.filaValor}>{valor}</Text>
                    {tend ? <Ionicons name={tend.nombre} size={14} color={tend.color} /> : null}
                  </View>
                  <Text style={estilos.filaValorEtiqueta}>
                    {r?.unRM != null ? '1RM est.' : 'mejor serie'}
                  </Text>
                </View>
              ) : null}

              {conHistorial ? (
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </Pantalla>
  );
}

const estilos = StyleSheet.create({
  centrado: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  botonVolver: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    ...shadow.card,
  },
  titulo: {
    fontSize: fontSize.title,
    fontWeight: '700',
    color: colors.textPrimary,
  },

  selectorSeccion: {
    marginHorizontal: -spacing.lg,
  },
  selectorScroll: {
    paddingHorizontal: spacing.lg,
    gap: spacing.xs,
  },
  chip: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActivo: {
    backgroundColor: colors.action,
    borderColor: colors.action,
  },
  chipTexto: {
    fontSize: fontSize.small,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  chipTextoActivo: {
    color: colors.textOnAction,
    fontWeight: '600',
  },

  seccionSubtitulo: {
    fontSize: fontSize.small,
    fontWeight: '600',
    color: colors.textSecondary,
    marginLeft: 2,
  },
  lista: { gap: spacing.xs },
  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 56,
    ...shadow.card,
  },
  filaSinDatos: { opacity: 0.55 },
  filaPresionada: { opacity: 0.8 },
  numero: {
    width: 20,
    fontSize: fontSize.small,
    fontWeight: '700',
    color: colors.textMuted,
    textAlign: 'center',
  },
  filaInfo: { flex: 1, gap: 2 },
  filaNombre: {
    fontSize: fontSize.body,
    lineHeight: lineHeight.body,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  filaDetalle: {
    fontSize: fontSize.caption,
    color: colors.textSecondary,
  },
  filaValorCol: { alignItems: 'flex-end' },
  filaValorFila: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  filaValor: {
    fontSize: fontSize.body,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  filaValorEtiqueta: {
    fontSize: fontSize.caption,
    color: colors.textMuted,
  },

  cardVacia: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    ...shadow.card,
  },
  cardVaciaTitulo: {
    fontSize: fontSize.body,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  cardVaciaTexto: {
    fontSize: fontSize.small,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: lineHeight.small,
  },
});
