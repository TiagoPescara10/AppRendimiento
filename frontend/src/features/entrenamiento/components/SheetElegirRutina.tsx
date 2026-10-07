// src/features/entrenamiento/components/SheetElegirRutina.tsx
//
// El sheet de Mi semana para elegir que se hace un dia. Tres secciones, en
// este orden:
//   - "+ Crear una nueva", arriba de todo: armar la propia tiene que estar a
//     la vista, no al final de una lista larga;
//   - "Rutinas listas", las predefinidas agrupadas como en la biblioteca;
//   - "Mis rutinas". Si no hay ninguna la seccion no desaparece: dice que
//     todavia no armo ninguna y ofrece armarla.

import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Boton } from '@/ui/Boton';
import { colors, fontSize, fontWeight, lineHeight, radius, shadow, sizes, spacing } from '@/ui/theme';
import { CATEGORIAS_PREDEFINIDAS } from '../categoriasPredefinidas';
import type { RefRutina } from '../miSemana';

/** Lo que tarda la animacion de cierre del Modal. Mismo valor que SheetAcciones. */
export const ESPERA_CIERRE_MS = 350;

export interface OpcionPredefinida {
  id: string;
  nombre: string;
  descripcion: string | null;
  categoria: string;
}

export interface OpcionPropia {
  id: string;
  nombre: string;
  cantidadEjercicios: number;
}

export function SheetElegirRutina({
  visible,
  titulo,
  elegida,
  predefinidas,
  propias,
  onElegir,
  onCrear,
  onCerrar,
}: {
  visible: boolean;
  titulo: string;
  elegida: RefRutina | undefined;
  predefinidas: OpcionPredefinida[];
  propias: OpcionPropia[];
  onElegir: (ref: RefRutina) => void;
  /** Se llama con el sheet ya cerrado: puede navegar sin pelearse con el Modal. */
  onCrear: () => void;
  onCerrar: () => void;
}) {
  const insets = useSafeAreaInsets();
  if (!visible) return null;

  const esElegida = (ref: RefRutina) => elegida?.origen === ref.origen && elegida.id === ref.id;

  const elegir = (ref: RefRutina) => {
    onElegir(ref);
    onCerrar();
  };

  const crear = () => {
    onCerrar();
    // En iOS, navegar mientras el Modal se cierra deja la pantalla nueva tapada.
    setTimeout(onCrear, ESPERA_CIERRE_MS);
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onCerrar}>
      <View style={estilos.fondo}>
        <Pressable style={estilos.flex} onPress={onCerrar} accessibilityLabel="Cerrar" />
        <View style={[estilos.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
          <View style={estilos.agarre} />
          <Text style={estilos.titulo}>{titulo}</Text>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={estilos.contenido}>
            <Pressable
              style={({ pressed }) => [estilos.crear, pressed && estilos.presionado]}
              onPress={crear}
              accessibilityRole="button"
            >
              <Ionicons name="add-circle-outline" size={sizes.icon} color={colors.action} />
              <Text style={estilos.crearTexto}>Crear una nueva</Text>
            </Pressable>

            <Text style={estilos.seccion}>Rutinas listas</Text>
            {CATEGORIAS_PREDEFINIDAS.map((cat) => {
              const deCategoria = predefinidas.filter((p) => p.categoria === cat.valor);
              if (deCategoria.length === 0) return null;
              return (
                <View key={cat.valor} style={estilos.grupo}>
                  <Text style={estilos.grupoTitulo}>{cat.titulo}</Text>
                  {deCategoria.map((p) => {
                    const ref: RefRutina = { origen: 'predefinida', id: p.id };
                    return (
                      <Opcion
                        key={p.id}
                        nombre={p.nombre}
                        detalle={p.descripcion}
                        activa={esElegida(ref)}
                        onPress={() => elegir(ref)}
                      />
                    );
                  })}
                </View>
              );
            })}

            <Text style={estilos.seccion}>Mis rutinas</Text>
            {propias.length === 0 ? (
              <View style={estilos.vacio}>
                <Text style={estilos.vacioTexto}>Todavía no armaste ninguna</Text>
                <Boton titulo="Armar la mía" variante="secundario" onPress={crear} />
              </View>
            ) : (
              <View style={estilos.grupo}>
                {propias.map((p) => {
                  const ref: RefRutina = { origen: 'propia', id: p.id };
                  return (
                    <Opcion
                      key={p.id}
                      nombre={p.nombre}
                      detalle={`${p.cantidadEjercicios} ${p.cantidadEjercicios === 1 ? 'ejercicio' : 'ejercicios'}`}
                      activa={esElegida(ref)}
                      onPress={() => elegir(ref)}
                    />
                  );
                })}
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function Opcion({
  nombre,
  detalle,
  activa,
  onPress,
}: {
  nombre: string;
  detalle: string | null;
  activa: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [estilos.opcion, activa && estilos.opcionActiva, pressed && estilos.presionado]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: activa }}
    >
      <View style={estilos.flex}>
        <Text style={estilos.opcionNombre}>{nombre}</Text>
        {detalle ? (
          <Text style={estilos.opcionDetalle} numberOfLines={2}>
            {detalle}
          </Text>
        ) : null}
      </View>
      {activa && <Ionicons name="checkmark" size={sizes.iconSmall} color={colors.action} />}
    </Pressable>
  );
}

const estilos = StyleSheet.create({
  fondo: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  flex: { flex: 1 },
  sheet: {
    maxHeight: '85%',
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    ...shadow.sheet,
  },
  agarre: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: spacing.sm,
  },
  titulo: {
    fontSize: fontSize.subtitle,
    lineHeight: lineHeight.subtitle,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  contenido: {
    gap: spacing.sm,
    paddingBottom: spacing.sm,
  },
  crear: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: sizes.control,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  crearTexto: {
    fontSize: fontSize.body,
    fontWeight: fontWeight.bold,
    color: colors.action,
  },
  presionado: { backgroundColor: colors.surfaceAlt },
  seccion: {
    fontSize: fontSize.small,
    lineHeight: lineHeight.small,
    fontWeight: fontWeight.bold,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: spacing.md,
  },
  grupo: { gap: spacing.xs },
  grupoTitulo: {
    fontSize: fontSize.caption,
    lineHeight: lineHeight.caption,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  opcion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  opcionActiva: { borderColor: colors.action },
  opcionNombre: {
    fontSize: fontSize.body,
    lineHeight: lineHeight.body,
    fontWeight: fontWeight.medium,
    color: colors.textPrimary,
  },
  opcionDetalle: {
    fontSize: fontSize.caption,
    lineHeight: lineHeight.caption,
    color: colors.textSecondary,
  },
  vacio: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
  },
  vacioTexto: {
    fontSize: fontSize.small,
    lineHeight: lineHeight.small,
    color: colors.textSecondary,
  },
});
