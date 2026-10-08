// app/perfil/guias.tsx
//
// Perfil > Guias: la lista de guias paso a paso, agrupada por categoria. El
// contenido vive en src/features/guias/contenido.ts; aca solo se dibuja.

import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { Pantalla } from '@/ui/Pantalla';
import { colors, spacing, radius, fontSize, lineHeight, fontWeight, shadow } from '@/ui/theme';
import { CATEGORIAS_GUIA, guiasDeCategoria } from '@/features/guias/contenido';

export default function Guias() {
  const router = useRouter();

  return (
    <Pantalla>
      <View style={estilos.headerBar}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={estilos.botonVolver}
          accessibilityRole="button"
          accessibilityLabel="Volver"
        >
          <Text style={estilos.flechaVolver}>‹</Text>
        </Pressable>
        <Text style={estilos.tituloPantalla}>Guías</Text>
      </View>

      {CATEGORIAS_GUIA.map((cat) => {
        const guias = guiasDeCategoria(cat.valor);
        if (guias.length === 0) return null;
        return (
          <View key={cat.valor} style={estilos.seccion}>
            <Text style={estilos.seccionTitulo}>{cat.titulo}</Text>
            <View style={estilos.card}>
              {guias.map((g, i) => (
                <Pressable
                  key={g.id}
                  style={({ pressed }) => [
                    estilos.fila,
                    i < guias.length - 1 && estilos.filaSeparada,
                    pressed && estilos.presionada,
                  ]}
                  onPress={() => router.push({ pathname: '/perfil/guia/[id]', params: { id: g.id } })}
                  accessibilityRole="button"
                >
                  <View style={estilos.flex}>
                    <Text style={estilos.filaTitulo}>{g.titulo}</Text>
                    <Text style={estilos.filaDescripcion}>{g.descripcion}</Text>
                  </View>
                  <Text style={estilos.duracion}>2 min</Text>
                  <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                </Pressable>
              ))}
            </View>
          </View>
        );
      })}
    </Pantalla>
  );
}

const estilos = StyleSheet.create({
  flex: { flex: 1 },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  botonVolver: { paddingRight: spacing.xs },
  flechaVolver: { fontSize: 28, color: colors.textSecondary, marginTop: -2 },
  tituloPantalla: {
    fontSize: fontSize.title,
    lineHeight: lineHeight.title,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  seccion: { gap: spacing.sm },
  seccionTitulo: {
    fontSize: fontSize.caption,
    fontWeight: fontWeight.bold,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    ...shadow.card,
  },
  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  filaSeparada: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  presionada: { opacity: 0.7 },
  filaTitulo: {
    fontSize: fontSize.body,
    lineHeight: lineHeight.body,
    fontWeight: fontWeight.medium,
    color: colors.textPrimary,
  },
  filaDescripcion: {
    fontSize: fontSize.small,
    lineHeight: lineHeight.small,
    color: colors.textSecondary,
  },
  duracion: {
    fontSize: fontSize.caption,
    color: colors.textSecondary,
  },
});
