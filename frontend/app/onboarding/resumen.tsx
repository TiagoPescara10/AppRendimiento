// app/onboarding/resumen.tsx
//
// Paso final del onboarding:
// - Modo objetivo (paso 6 de 6): muestra TDEE, macros y resumen de metas.
// - Modo recuento (paso 4 de 4): confirmacion de cuenta lista para registrar,
//   sin calculos ni metas numericas.

import { View, Text, StyleSheet } from 'react-native';
import { useState, useEffect } from 'react';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useOnboarding } from '@/features/perfil/hooks/useOnboarding';
import { PasoOnboarding } from '@/features/perfil/components/PasoOnboarding';
import { Card } from '@/ui/Card';
import { ultimoPeso } from '@/db/queries/peso';
import { calcularTodo } from '@/lib/nutricion';
import { calcularEdad } from '@/lib/fechas';
import {
  colors,
  spacing,
  radius,
  fontSize,
  lineHeight,
  fontWeight,
  shadow,
  sizes,
} from '@/ui/theme';
import { capitalizarDeporte } from '@/features/agenda/formato';

const NIVELES: Record<string, string> = {
  sedentario: 'Sedentaria',
  ligero: 'Ligera',
  moderado: 'Moderada',
  alto: 'Alta',
  muy_alto: 'Muy alta',
};

const OBJETIVOS: Record<string, string> = {
  bajar: 'Bajar de peso',
  mantener: 'Mantener peso',
  subir: 'Subir de peso',
  rendimiento: 'Mejorar rendimiento',
};

export default function Resumen() {
  const router = useRouter();
  const { perfil, cargando } = useOnboarding();
  const [pesoActual, setPesoActual] = useState<number | null>(null);

  const esRecuento = perfil?.modo_nutricion === 'recuento';
  const pasoActual = esRecuento ? 4 : 6;
  const totalPasos = esRecuento ? 4 : 6;

  useEffect(() => {
    if (!perfil) return;
    let vivo = true;
    ultimoPeso(perfil.id)
      .then((r) => {
        if (vivo) setPesoActual(r?.peso_kg ?? null);
      })
      .catch(console.error);
    return () => {
      vivo = false;
    };
  }, [perfil]);

  const edad = perfil?.fecha_nacimiento ? calcularEdad(perfil.fecha_nacimiento) : null;

  const resultado =
    !esRecuento &&
    perfil &&
    pesoActual &&
    perfil.altura_cm &&
    edad &&
    perfil.sexo_biologico &&
    perfil.nivel_actividad &&
    perfil.objetivo
      ? calcularTodo({
          peso_kg: pesoActual,
          altura_cm: perfil.altura_cm,
          edad,
          sexo: perfil.sexo_biologico,
          nivel_actividad: perfil.nivel_actividad,
          objetivo: perfil.objetivo,
        })
      : null;

  const actividad = perfil?.nivel_actividad
    ? NIVELES[perfil.nivel_actividad] +
      (perfil.deporte_principal ? ` · ${capitalizarDeporte(perfil.deporte_principal)}` : '')
    : '—';

  const objetivo = perfil?.objetivo
    ? OBJETIVOS[perfil.objetivo] +
      (perfil.peso_objetivo_kg ? ` a ${perfil.peso_objetivo_kg} kg` : '')
    : '—';

  // En modo recuento no requiere calculo de macros para poder seguir
  const puedeSeguir = esRecuento ? !cargando : !cargando && !!resultado;

  return (
    <PasoOnboarding
      paso={pasoActual}
      totalPasos={totalPasos}
      titulo={perfil?.nombre ? `Listo, ${perfil.nombre}` : 'Listo'}
      subtitulo={
        esRecuento
          ? 'Ya podés empezar a registrar tus comidas y entrenamientos'
          : 'Esto es lo que calculamos para vos'
      }
      onSiguiente={() => router.push('/onboarding/beneficios')}
      puedeSeguir={puedeSeguir}
      textoBoton="Ver qué hace la app"
    >
      {esRecuento ? (
        // =====================================================================
        // VISTA RESUMEN: MODO RECUENTO (Sin numeros ni macros)
        // =====================================================================
        <>
          <View style={estilos.destacadoRecuento}>
            <View style={estilos.circuloIconoRecuento}>
              <Ionicons name="checkmark-circle" size={32} color={colors.action} />
            </View>
            <Text style={estilos.destacadoTituloRecuento}>
              Todo listo para empezar
            </Text>
            <Text style={estilos.destacadoBajadaRecuento}>
              Vas a registrar tus comidas y entrenamientos a tu propio ritmo,
              construyendo hábitos sostenibles sin metas numéricas.
            </Text>
          </View>

          <Card>
            <Text style={estilos.seccion}>Tus datos iniciales</Text>
            {perfil?.nombre && <Fila label="Nombre" valor={perfil.nombre} />}
            {perfil?.altura_cm && (
              <Fila label="Altura" valor={`${perfil.altura_cm} cm`} />
            )}
            {pesoActual != null && (
              <Fila label="Peso inicial" valor={`${pesoActual} kg`} />
            )}
            <Fila label="Modo" valor="Solo un recuento" ultima />
          </Card>

          <View style={estilos.avisoCambioModo}>
            <Ionicons
              name="information-circle-outline"
              size={18}
              color={colors.textSecondary}
            />
            <Text style={estilos.avisoCambioTexto}>
              Podés calcular calorías y macros en cualquier momento cambiando de
              modo desde tu perfil.
            </Text>
          </View>
        </>
      ) : resultado ? (
        // =====================================================================
        // VISTA RESUMEN: MODO OBJETIVO (Con calculos y macros)
        // =====================================================================
        <>
          <View style={estilos.destacado}>
            <Text style={estilos.destacadoLabel}>Tu objetivo diario</Text>
            <Text style={estilos.destacadoNumero}>
              {resultado.kcal_objetivo.toLocaleString('es-AR')}
            </Text>
            <Text style={estilos.destacadoLabel}>kcal por día</Text>
          </View>

          {resultado.ajustadoPorPiso && resultado.mensajePiso && (
            <View style={estilos.avisoPiso}>
              <Text style={estilos.avisoPisoTexto}>{resultado.mensajePiso}</Text>
            </View>
          )}

          <View style={estilos.macros}>
            <View style={estilos.macro}>
              <Text style={estilos.macroLabel}>Proteína</Text>
              <Text style={estilos.macroValor}>
                {resultado.macros.proteina_g} g
              </Text>
            </View>
            <View style={estilos.macro}>
              <Text style={estilos.macroLabel}>Carbos</Text>
              <Text style={estilos.macroValor}>
                {resultado.macros.carbohidratos_g} g
              </Text>
            </View>
            <View style={estilos.macro}>
              <Text style={estilos.macroLabel}>Grasas</Text>
              <Text style={estilos.macroValor}>{resultado.macros.grasa_g} g</Text>
            </View>
          </View>

          <Card>
            <Text style={estilos.seccion}>Tus datos</Text>
            <Fila label="Peso actual" valor={`${pesoActual} kg`} />
            <Fila label="Altura" valor={`${perfil!.altura_cm} cm`} />
            <Fila label="Actividad" valor={actividad} />
            <Fila label="Objetivo" valor={objetivo} ultima />
          </Card>
        </>
      ) : (
        <Card>
          <Text style={estilos.muroTexto}>
            Faltan datos para calcular tu objetivo. Revisá los pasos anteriores.
          </Text>
        </Card>
      )}
    </PasoOnboarding>
  );
}

function Fila({
  label,
  valor,
  ultima,
}: {
  label: string;
  valor: string;
  ultima?: boolean;
}) {
  return (
    <View style={[estilos.fila, ultima && estilos.filaUltima]}>
      <Text style={estilos.filaLabel}>{label}</Text>
      <Text style={estilos.filaValor}>{valor}</Text>
    </View>
  );
}

const estilos = StyleSheet.create({
  destacado: {
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
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  destacadoRecuento: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.xs,
    ...shadow.card,
  },
  circuloIconoRecuento: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  destacadoTituloRecuento: {
    fontSize: fontSize.subtitle,
    lineHeight: lineHeight.subtitle,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  destacadoBajadaRecuento: {
    fontSize: fontSize.body,
    lineHeight: lineHeight.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  macros: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  macro: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: 'center',
    ...shadow.card,
  },
  macroLabel: {
    fontSize: fontSize.small,
    lineHeight: lineHeight.small,
    color: colors.textSecondary,
  },
  macroValor: {
    fontSize: fontSize.body,
    lineHeight: lineHeight.body,
    fontWeight: '500',
    color: colors.textPrimary,
  },
  seccion: {
    fontSize: fontSize.small,
    lineHeight: lineHeight.small,
    fontWeight: '500',
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  fila: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
  },
  filaUltima: {
    borderBottomWidth: 0,
    paddingBottom: 0,
  },
  filaLabel: {
    fontSize: fontSize.body,
    lineHeight: lineHeight.body,
    color: colors.textSecondary,
  },
  filaValor: {
    fontSize: fontSize.body,
    lineHeight: lineHeight.body,
    color: colors.textPrimary,
  },
  muroTexto: {
    fontSize: fontSize.small,
    lineHeight: lineHeight.small,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  avisoPiso: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.xs,
  },
  avisoPisoTexto: {
    fontSize: fontSize.small,
    lineHeight: lineHeight.small,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  avisoCambioModo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  avisoCambioTexto: {
    fontSize: fontSize.caption,
    lineHeight: lineHeight.caption,
    color: colors.textSecondary,
    flex: 1,
  },
});