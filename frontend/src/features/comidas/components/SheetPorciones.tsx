// Selector de cantidad. Lo usan las dos pantallas de comida: nueva.tsx para
// agregar un alimento, y [id].tsx para editar uno ya guardado.
//
// El multiplicador resuelve el caso mas comun del registro real: las porciones
// del catalogo son unitarias ("1 milanesa"), pero la gente come dos. Los
// gramos salen de porcion x multiplicador.

import { useState, useEffect } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Alert,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { colors, spacing, radius, fontSize, lineHeight } from '@/ui/theme';
import type { PorcionTipica } from '@/db/schema';

const MULTIPLICADOR_MAX = 20;
const GRAMOS_MAX = 5000;

export type DatosSheet = {
  /** Nombre del alimento, para el titulo. */
  nombre: string;
  kcal_por_100g: number;
  porciones: PorcionTipica[];
  /** Gramos actuales si se esta editando; undefined si se esta agregando. */
  cantidadActual?: number;
  /** Si viene, el sheet muestra la opcion de quitar. */
  onQuitar?: () => void;
};

export function SheetPorciones({
  datos,
  onCerrar,
  onConfirmar,
}: {
  datos: DatosSheet | null;
  onCerrar: () => void;
  /** cantidad_g final y la etiqueta para mostrar ("2 × 1 milanesa"). */
  onConfirmar: (cantidad_g: number, porcion: string) => void;
}) {
  const [multiplicador, setMultiplicador] = useState(1);
  const [gramos, setGramos] = useState('');

  // Al abrir, resetear el multiplicador y precargar los gramos si se edita.
  useEffect(() => {
    setMultiplicador(1);
    setGramos(datos?.cantidadActual != null ? String(datos.cantidadActual) : '');
  }, [datos]);

  if (!datos) return null;

  const kcalDe = (g: number) => Math.round((datos.kcal_por_100g * g) / 100);

  const confirmarGramos = () => {
    const n = parseFloat(gramos.replace(',', '.'));
    if (!Number.isFinite(n) || n <= 0 || n > GRAMOS_MAX) {
      Alert.alert('Cantidad inválida', `Ingresá un valor entre 1 y ${GRAMOS_MAX} g.`);
      return;
    }
    onConfirmar(Math.round(n), `${Math.round(n)} g`);
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onCerrar}>
      <KeyboardAvoidingView
        style={estilos.fondo}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* El fondo tocable ocupa solo el espacio libre de arriba: asi un
            toque sobre el sheet nunca puede cerrarlo por burbujeo. */}
        <Pressable style={estilos.flex} onPress={onCerrar} />

        <View style={estilos.sheet}>
          <View style={estilos.agarre} />

          <Text style={estilos.sheetTitulo}>{datos.nombre}</Text>
          <Text style={estilos.detalle}>¿Cuánto comiste?</Text>

          {/* Multiplicador. Solo tiene sentido si hay porciones que multiplicar. */}
          {datos.porciones.length > 0 && (
            <View style={estilos.multiFila}>
              <Text style={estilos.detalle}>Cantidad</Text>
              <View style={estilos.multiControles}>
                <Pressable
                  style={estilos.multiBoton}
                  onPress={() => setMultiplicador((m) => Math.max(1, m - 1))}
                >
                  <Text style={estilos.multiSigno}>−</Text>
                </Pressable>
                <Text style={estilos.multiValor}>{multiplicador}</Text>
                <Pressable
                  style={estilos.multiBoton}
                  onPress={() => setMultiplicador((m) => Math.min(MULTIPLICADOR_MAX, m + 1))}
                >
                  <Text style={estilos.multiSigno}>+</Text>
                </Pressable>
              </View>
            </View>
          )}

          {datos.porciones.map((p) => {
            const gramosTotal = p.gramos * multiplicador;
            const seleccionada = datos.cantidadActual === gramosTotal;
            const etiqueta = multiplicador === 1 ? p.nombre : `${multiplicador} × ${p.nombre}`;

            return (
              <Pressable
                key={p.nombre}
                style={[estilos.opcion, seleccionada && estilos.opcionActiva]}
                onPress={() => onConfirmar(gramosTotal, etiqueta)}
              >
                <View style={estilos.flex}>
                  <Text style={estilos.nombre}>{etiqueta}</Text>
                  <Text style={estilos.detalle}>{gramosTotal} g</Text>
                </View>
                <Text style={estilos.nombre}>{kcalDe(gramosTotal)} kcal</Text>
              </Pressable>
            );
          })}

          {/* Cantidad exacta. Casi nadie la usa, pero cuando hace falta y no
              esta, no hay salida. */}
          <View style={estilos.gramosFila}>
            <TextInput
              style={estilos.gramosInput}
              value={gramos}
              onChangeText={setGramos}
              placeholder={
                datos.cantidadActual != null
                  ? `Actual: ${datos.cantidadActual} g`
                  : 'Otra cantidad'
              }
              placeholderTextColor={colors.textSecondary}
              keyboardType="decimal-pad"
              returnKeyType="done"
              onSubmitEditing={confirmarGramos}
            />
            <Text style={estilos.detalle}>g</Text>
            <Pressable style={estilos.gramosBoton} onPress={confirmarGramos}>
              <Text style={estilos.gramosBotonTexto}>Usar</Text>
            </Pressable>
          </View>

          {datos.onQuitar && (
            <Pressable style={estilos.eliminar} onPress={datos.onQuitar}>
              <Text style={estilos.eliminarTexto}>Quitar de la comida</Text>
            </Pressable>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const estilos = StyleSheet.create({
  flex: { flex: 1 },

  nombre: { fontSize: fontSize.body, lineHeight: lineHeight.body, color: colors.textPrimary },
  detalle: { fontSize: fontSize.small, lineHeight: lineHeight.small, color: colors.textSecondary },

  fondo: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.lg,
    paddingBottom: spacing.xxxl,
    gap: spacing.sm,
  },
  agarre: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: spacing.sm,
  },
  sheetTitulo: {
    fontSize: fontSize.body,
    lineHeight: lineHeight.body,
    fontWeight: '500',
    color: colors.textPrimary,
  },

  multiFila: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  multiControles: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  multiBoton: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  multiSigno: { fontSize: fontSize.body, color: colors.textPrimary },
  multiValor: {
    fontSize: fontSize.body,
    fontWeight: '500',
    color: colors.textPrimary,
    minWidth: 24,
    textAlign: 'center',
  },

  opcion: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  opcionActiva: { borderWidth: 1.5, borderColor: colors.action },

  gramosFila: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  gramosInput: {
    flex: 1,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    fontSize: fontSize.body,
    color: colors.textPrimary,
  },
  gramosBoton: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.action,
  },
  gramosBotonTexto: { fontSize: fontSize.body, color: colors.textOnAction },

  eliminar: { paddingVertical: spacing.md, alignItems: 'center' },
  eliminarTexto: { fontSize: fontSize.body, color: colors.danger },
});