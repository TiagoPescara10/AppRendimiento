import { View, Text, StyleSheet } from 'react-native';
import { useState, useEffect } from 'react';
import { useRouter } from 'expo-router';
import { useOnboarding } from '@/features/perfil/hooks/useOnboarding';
import { PasoOnboarding } from '@/features/perfil/components/PasoOnboarding';
import { Card } from '@/ui/Card';
import { ultimoPeso } from '@/db/queries/peso';
import { calcularTodo } from '@/lib/nutricion';
import { calcularEdad } from '@/lib/fechas';
import { colors, spacing, radius, fontSize, lineHeight, shadow } from '@/ui/theme';

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

  useEffect(() => {
    if (!perfil) return;
    let vivo = true;
    ultimoPeso(perfil.id)
      .then((r) => { if (vivo) setPesoActual(r?.peso_kg ?? null); })
      .catch(console.error);
    return () => { vivo = false; };
  }, [perfil]);

  const edad = perfil?.fecha_nacimiento ? calcularEdad(perfil.fecha_nacimiento) : null;

  const resultado =
    perfil && pesoActual && perfil.altura_cm && edad && perfil.sexo_biologico &&
    perfil.nivel_actividad && perfil.objetivo
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
    ? NIVELES[perfil.nivel_actividad] + (perfil.deporte_principal ? ` · ${perfil.deporte_principal}` : '')
    : '—';

  const objetivo = perfil?.objetivo
    ? OBJETIVOS[perfil.objetivo] + (perfil.peso_objetivo_kg ? ` a ${perfil.peso_objetivo_kg} kg` : '')
    : '—';

  return (
    <PasoOnboarding
      paso={5}
      totalPasos={5}
      titulo={perfil?.nombre ? `Listo, ${perfil.nombre}` : 'Listo'}
      subtitulo="Esto es lo que calculamos para vos"
      onSiguiente={() => router.push('/onboarding/beneficios')}
      puedeSeguir={!cargando && !!resultado}
      textoBoton="Ver qué hace la app"
    >
      {resultado ? (
        <>
          <View style={estilos.destacado}>
            <Text style={estilos.destacadoLabel}>Tu objetivo diario</Text>
            <Text style={estilos.destacadoNumero}>{resultado.kcal_objetivo.toLocaleString('es-AR')}</Text>
            <Text style={estilos.destacadoLabel}>kcal por día</Text>
          </View>

          <View style={estilos.macros}>
            <View style={estilos.macro}>
              <Text style={estilos.macroLabel}>Proteína</Text>
              <Text style={estilos.macroValor}>{resultado.macros.proteina_g} g</Text>
            </View>
            <View style={estilos.macro}>
              <Text style={estilos.macroLabel}>Carbos</Text>
              <Text style={estilos.macroValor}>{resultado.macros.carbohidratos_g} g</Text>
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

function Fila({ label, valor, ultima }: { label: string; valor: string; ultima?: boolean }) {
  return (
    <View style={[estilos.fila, ultima && estilos.filaUltima]}>
      <Text style={estilos.filaLabel}>{label}</Text>
      <Text style={estilos.filaValor}>{valor}</Text>
    </View>
  );
}

const estilos = StyleSheet.create({
  destacado: {
    // Blanco, no surfaceAlt: es el gemelo del destacado del dashboard y el
    // esquema dice que el contenido va en blanco. En crema sobre crema casi no
    // se despegaba del lienzo.
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
});