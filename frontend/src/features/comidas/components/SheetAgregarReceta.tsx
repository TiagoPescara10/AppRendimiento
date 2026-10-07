// src/features/comidas/components/SheetAgregarReceta.tsx
//
// Registrar una receta hoy: el tipo de comida (sugerido por la hora) y
// cuantas porciones se comieron. Los atajos cubren lo comun (0,5 · 1 · 1,5 ·
// 2) y "Otra" deja escribir cualquier cantidad.
//
// Con `soloPorciones` no pide el tipo: lo usa Registrar comida, donde el
// tipo ya esta elegido arriba y la receta se suma a la comida que se arma.

import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Boton } from '@/ui/Boton';
import { colors, fontSize, fontWeight, lineHeight, radius, shadow, spacing } from '@/ui/theme';
import type { TipoComida } from '@/db/schema';
import { textoPorciones } from '@/lib/recetas';
import { nombreTipo, TIPOS_COMIDA, tipoPorHora } from '../tipos';

const ATAJOS = [0.5, 1, 1.5, 2];
const PORCIONES_MAX = 20;

function aTexto(n: number): string {
  return String(n).replace('.', ',');
}

export function SheetAgregarReceta({
  receta,
  soloPorciones = false,
  textoBoton = 'Agregar',
  onCerrar,
  onConfirmar,
}: {
  /** null cierra el sheet. */
  receta: { nombre: string; kcal_porcion: number } | null;
  soloPorciones?: boolean;
  textoBoton?: string;
  onCerrar: () => void;
  onConfirmar: (porciones: number, tipo: TipoComida) => void;
}) {
  const [tipo, setTipo] = useState<TipoComida>(tipoPorHora());
  const [porciones, setPorciones] = useState(1);
  const [otra, setOtra] = useState(false);
  const [texto, setTexto] = useState('');

  // Cada vez que se abre arranca de cero
  useEffect(() => {
    if (!receta) return;
    setTipo(tipoPorHora());
    setPorciones(1);
    setOtra(false);
    setTexto('');
  }, [receta]);

  if (!receta) return null;

  const manual = parseFloat(texto.replace(',', '.'));
  const elegidas = otra ? manual : porciones;
  const valida = Number.isFinite(elegidas) && elegidas > 0 && elegidas <= PORCIONES_MAX;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onCerrar}>
      <KeyboardAvoidingView
        style={estilos.fondo}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <Pressable style={estilos.flex} onPress={onCerrar} />
        <View style={estilos.sheet}>
          <View style={estilos.agarre} />
          <Text style={estilos.titulo}>{receta.nombre}</Text>
          <Text style={estilos.detalle}>
            {Math.round(receta.kcal_porcion).toLocaleString('es-AR')} kcal por porción
          </Text>

          {!soloPorciones && (
            <>
              <Text style={estilos.label}>Comida</Text>
              <View style={estilos.fila}>
                {TIPOS_COMIDA.map((t) => (
                  <Pressable
                    key={t}
                    style={[estilos.opcion, tipo === t && estilos.opcionActiva]}
                    onPress={() => setTipo(t)}
                  >
                    <Text style={[estilos.opcionTexto, tipo === t && estilos.opcionTextoActivo]}>
                      {nombreTipo(t)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </>
          )}

          <Text style={estilos.label}>Porciones</Text>
          <View style={estilos.fila}>
            {ATAJOS.map((n) => {
              const activo = !otra && porciones === n;
              return (
                <Pressable
                  key={n}
                  style={[estilos.opcion, activo && estilos.opcionActiva]}
                  onPress={() => {
                    setOtra(false);
                    setPorciones(n);
                  }}
                >
                  <Text style={[estilos.opcionTexto, activo && estilos.opcionTextoActivo]}>
                    {aTexto(n)}
                  </Text>
                </Pressable>
              );
            })}
            <Pressable
              style={[estilos.opcion, otra && estilos.opcionActiva]}
              onPress={() => setOtra(true)}
            >
              <Text style={[estilos.opcionTexto, otra && estilos.opcionTextoActivo]}>Otra</Text>
            </Pressable>
          </View>

          {otra && (
            <TextInput
              style={estilos.input}
              value={texto}
              onChangeText={setTexto}
              placeholder="Ej: 0,75"
              placeholderTextColor={colors.textMuted}
              keyboardType="decimal-pad"
              autoFocus
            />
          )}

          <Boton
            titulo={valida ? `${textoBoton} · ${textoPorciones(elegidas)}` : textoBoton}
            onPress={() => valida && onConfirmar(elegidas, tipo)}
            disabled={!valida}
          />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const estilos = StyleSheet.create({
  fondo: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  flex: { flex: 1 },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.lg,
    paddingBottom: spacing.xxxl,
    gap: spacing.sm,
    ...shadow.sheet,
  },
  agarre: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: spacing.xs,
  },
  titulo: {
    fontSize: fontSize.subtitle,
    lineHeight: lineHeight.subtitle,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  detalle: { fontSize: fontSize.small, lineHeight: lineHeight.small, color: colors.textSecondary },
  label: {
    fontSize: fontSize.caption,
    lineHeight: lineHeight.caption,
    fontWeight: fontWeight.bold,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  fila: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  opcion: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  opcionActiva: { backgroundColor: colors.action, borderColor: colors.action },
  opcionTexto: { fontSize: fontSize.small, fontWeight: '600', color: colors.textPrimary },
  opcionTextoActivo: { color: colors.textOnAction },
  input: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSize.body,
    color: colors.textPrimary,
  },
});
