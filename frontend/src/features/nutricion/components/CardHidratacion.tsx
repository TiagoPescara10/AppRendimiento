// src/features/nutricion/components/CardHidratacion.tsx
//
// Tarjeta de hidratacion para el dashboard con fondo dark navy.
// Muestra el progreso diario respecto a la meta, permite agregar agua
// con botones rapidos (+250, +500, personalizado) y deshacer la ultima toma.

import { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, fontSize, fontWeight, lineHeight, shadow, sizes } from '@/ui/theme';

interface Props {
  actualMl: number;
  metaMl: number;
  onAgregar: (ml: number) => Promise<void> | void;
  onDeshacer: () => Promise<void> | void;
  deshabilitado?: boolean;
}

const MAX_CUSTOM_ML = 5000;

export function CardHidratacion({
  actualMl,
  metaMl,
  onAgregar,
  onDeshacer,
  deshabilitado = false,
}: Props) {
  const [modalVisible, setModalVisible] = useState(false);
  const [textoPersonalizado, setTextoPersonalizado] = useState('');
  const [procesando, setProcesando] = useState(false);

  const proporcion = metaMl > 0 ? Math.min(1, actualMl / metaMl) : 0;
  const restante = Math.max(0, metaMl - actualMl);
  const superoMeta = actualMl >= metaMl && metaMl > 0;

  const actualL = (actualMl / 1000).toFixed(1);
  const metaL = (metaMl / 1000).toFixed(1);

  const manejarAgregar = async (ml: number) => {
    if (procesando || deshabilitado) return;
    setProcesando(true);
    try {
      await onAgregar(ml);
    } finally {
      setProcesando(false);
    }
  };

  const manejarDeshacer = async () => {
    if (procesando || deshabilitado || actualMl <= 0) return;
    setProcesando(true);
    try {
      await onDeshacer();
    } finally {
      setProcesando(false);
    }
  };

  const confirmarPersonalizado = async () => {
    const val = parseInt(textoPersonalizado.trim(), 10);
    if (!Number.isFinite(val) || val <= 0 || val > MAX_CUSTOM_ML) {
      Alert.alert('Cantidad invalida', `Ingresa un valor entre 1 y ${MAX_CUSTOM_ML} ml.`);
      return;
    }
    setModalVisible(false);
    setTextoPersonalizado('');
    await manejarAgregar(val);
  };

  return (
    <View style={estilos.card}>
      {/* Encabezado: icono, titulo y boton deshacer */}
      <View style={estilos.header}>
        <View style={estilos.tituloFila}>
          <Ionicons name="water" size={sizes.icon} color={colors.textOnAction} />
          <Text style={estilos.titulo}>Hidratacion</Text>
        </View>

        {actualMl > 0 && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Deshacer ultima toma de agua"
            style={({ pressed }) => [
              estilos.botonDeshacer,
              pressed && estilos.botonDeshacerPresionado,
            ]}
            onPress={manejarDeshacer}
            disabled={procesando || deshabilitado}
          >
            <Ionicons name="arrow-undo-outline" size={16} color={colors.textOnAction} />
            <Text style={estilos.botonDeshacerTexto}>Deshacer</Text>
          </Pressable>
        )}
      </View>

      {/* Metricas principales */}
      <View style={estilos.metricas}>
        <View style={estilos.volumenFila}>
          <Text style={estilos.volumenActual}>{actualL}L</Text>
          <Text style={estilos.volumenMeta}> / {metaL}L</Text>
        </View>

        <Text style={estilos.subtitulo}>
          {superoMeta
            ? actualMl > metaMl
              ? `Superaste la meta por ${(actualMl - metaMl).toLocaleString('es-AR')} ml`
              : 'Completaste la meta diaria'
            : `Faltan ${restante.toLocaleString('es-AR')} ml para la meta`}
        </Text>
      </View>

      {/* Barra de progreso */}
      <View style={estilos.barraFondo}>
        <View style={[estilos.barraRelleno, { width: `${proporcion * 100}%` }]} />
      </View>

      {/* Botones rapidos */}
      <View style={estilos.botonesFila}>
        <Pressable
          accessibilityRole="button"
          style={({ pressed }) => [
            estilos.botonRapido,
            pressed && estilos.botonRapidoPresionado,
          ]}
          onPress={() => manejarAgregar(250)}
          disabled={procesando || deshabilitado}
        >
          <Text style={estilos.botonRapidoTexto}>+250 ml</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          style={({ pressed }) => [
            estilos.botonRapido,
            pressed && estilos.botonRapidoPresionado,
          ]}
          onPress={() => manejarAgregar(500)}
          disabled={procesando || deshabilitado}
        >
          <Text style={estilos.botonRapidoTexto}>+500 ml</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          style={({ pressed }) => [
            estilos.botonRapido,
            pressed && estilos.botonRapidoPresionado,
          ]}
          onPress={() => {
            setTextoPersonalizado('');
            setModalVisible(true);
          }}
          disabled={procesando || deshabilitado}
        >
          <Text style={estilos.botonRapidoTexto}>Personalizado</Text>
        </Pressable>
      </View>

      {/* Modal para ingresar ml arbitrarios */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <KeyboardAvoidingView
          style={estilos.modalFondo}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Pressable style={estilos.modalTelon} onPress={() => setModalVisible(false)} />
          <View style={estilos.modalContenido}>
            <Text style={estilos.modalTitulo}>Registrar agua</Text>
            <Text style={estilos.modalDescripcion}>
              Ingresa la cantidad consumida en mililitros:
            </Text>

            <View style={estilos.inputFila}>
              <TextInput
                style={estilos.input}
                value={textoPersonalizado}
                onChangeText={setTextoPersonalizado}
                placeholder="Ej: 350"
                placeholderTextColor={colors.textMuted}
                keyboardType="number-pad"
                autoFocus
              />
              <Text style={estilos.inputUnidad}>ml</Text>
            </View>

            <View style={estilos.modalAcciones}>
              <Pressable
                style={[estilos.modalBoton, estilos.modalBotonCancelar]}
                onPress={() => setModalVisible(false)}
              >
                <Text style={estilos.modalBotonCancelarTexto}>Cancelar</Text>
              </Pressable>
              <Pressable
                style={[estilos.modalBoton, estilos.modalBotonConfirmar]}
                onPress={confirmarPersonalizado}
              >
                <Text style={estilos.modalBotonConfirmarTexto}>Agregar</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const estilos = StyleSheet.create({
  card: {
    backgroundColor: colors.action,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.md,
    ...shadow.card,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tituloFila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  titulo: {
    fontSize: fontSize.body,
    fontWeight: fontWeight.bold,
    color: colors.textOnAction,
  },
  botonDeshacer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
    backgroundColor: colors.controlOnCamara,
    borderWidth: 1,
    borderColor: colors.bordeOnCamara,
  },
  botonDeshacerPresionado: {
    backgroundColor: colors.controlOnCamaraPressed,
  },
  botonDeshacerTexto: {
    fontSize: fontSize.caption,
    fontWeight: fontWeight.medium,
    color: colors.textOnAction,
  },
  metricas: {
    gap: spacing.xs,
  },
  volumenFila: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  volumenActual: {
    fontSize: fontSize.display,
    lineHeight: lineHeight.display,
    fontWeight: fontWeight.bold,
    color: colors.textOnAction,
  },
  volumenMeta: {
    fontSize: fontSize.title,
    fontWeight: fontWeight.medium,
    color: colors.onFaseMedio,
  },
  subtitulo: {
    fontSize: fontSize.caption,
    lineHeight: lineHeight.caption,
    color: colors.onFaseMedio,
  },
  barraFondo: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.controlOnCamara,
    overflow: 'hidden',
  },
  barraRelleno: {
    height: '100%',
    backgroundColor: colors.textOnAction,
    borderRadius: 3,
  },
  botonesFila: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  botonRapido: {
    flex: 1,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.sm,
    backgroundColor: colors.controlOnCamara,
    borderWidth: 1,
    borderColor: colors.bordeOnCamara,
    alignItems: 'center',
    justifyContent: 'center',
  },
  botonRapidoPresionado: {
    backgroundColor: colors.controlOnCamaraPressed,
  },
  botonRapidoTexto: {
    fontSize: fontSize.caption,
    fontWeight: fontWeight.bold,
    color: colors.textOnAction,
  },
  modalFondo: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.overlay,
    paddingHorizontal: spacing.lg,
  },
  modalTelon: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  modalContenido: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadow.card,
  },
  modalTitulo: {
    fontSize: fontSize.subtitle,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  modalDescripcion: {
    fontSize: fontSize.small,
    color: colors.textSecondary,
  },
  inputFila: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  input: {
    flex: 1,
    height: sizes.control,
    fontSize: fontSize.title,
    color: colors.textPrimary,
    fontWeight: fontWeight.bold,
  },
  inputUnidad: {
    fontSize: fontSize.body,
    fontWeight: fontWeight.medium,
    color: colors.textSecondary,
  },
  modalAcciones: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  modalBoton: {
    flex: 1,
    height: sizes.control,
    borderRadius: radius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalBotonCancelar: {
    backgroundColor: colors.surfaceAlt,
  },
  modalBotonCancelarTexto: {
    fontSize: fontSize.body,
    fontWeight: fontWeight.medium,
    color: colors.textSecondary,
  },
  modalBotonConfirmar: {
    backgroundColor: colors.action,
  },
  modalBotonConfirmarTexto: {
    fontSize: fontSize.body,
    fontWeight: fontWeight.bold,
    color: colors.textOnAction,
  },
});
