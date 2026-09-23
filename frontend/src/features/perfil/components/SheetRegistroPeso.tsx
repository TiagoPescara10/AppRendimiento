// Modal bottom sheet para registrar o actualizar el peso del dia
// Sigue el mismo estilo visual que SheetPorciones y la logica de peso.tsx del onboarding

import { useState, useEffect, useRef } from 'react';
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
  ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors, spacing, radius, fontSize, lineHeight, shadow, sizes } from '@/ui/theme';
import { crearRegistroPeso, actualizarRegistroPeso, ultimoPeso } from '@/db/queries/peso';
import { aFechaLocal } from '@/lib/fechas';
import { randomUUID } from '@/db/sync/uuid';
import { evaluarAvisoPesajeFrecuente } from '@/lib/salud';

interface Props {
  visible: boolean;
  usuarioId: string;
  pesoActual?: number | null;
  onCerrar: () => void;
  onGuardado: () => void;
}

const PESO_MIN_KG = 30;
const PESO_MAX_KG = 300;

export function SheetRegistroPeso({
  visible,
  usuarioId,
  pesoActual,
  onCerrar,
  onGuardado,
}: Props) {
  const [pesoTexto, setPesoTexto] = useState('');
  const [guardando, setGuardando] = useState(false);
  const guardandoRef = useRef(false);

  useEffect(() => {
    if (visible) {
      setPesoTexto(pesoActual != null ? String(pesoActual).replace('.', ',') : '');
    }
  }, [visible, pesoActual]);

  if (!visible) return null;

  const guardar = async () => {
    if (guardandoRef.current) return;

    if (!pesoTexto.trim()) {
      Alert.alert('Faltan datos', 'Ingresa tu peso actual.');
      return;
    }

    const pesoKg = parseFloat(pesoTexto.replace(',', '.'));
    if (!Number.isFinite(pesoKg) || pesoKg < PESO_MIN_KG || pesoKg > PESO_MAX_KG) {
      Alert.alert('Peso invalido', `Ingresa un peso entre ${PESO_MIN_KG} y ${PESO_MAX_KG} kg.`);
      return;
    }

    guardandoRef.current = true;
    setGuardando(true);

    try {
      const hoy = aFechaLocal(new Date());
      const ultimo = await ultimoPeso(usuarioId);
      let mensajeAvisoCoach: string | null = null;

      // Si ya hay un registro cargado hoy, se actualiza en vez de duplicar
      if (ultimo && ultimo.fecha === hoy) {
        const claveAviso = `@avanza/aviso_pesaje_${hoy}`;
        const claveCuenta = `@avanza/cuenta_pesaje_${hoy}`;

        const [cuentaStr, yaAvisadoStr] = await Promise.all([
          AsyncStorage.getItem(claveCuenta),
          AsyncStorage.getItem(claveAviso),
        ]);

        const registrosHoy = cuentaStr ? parseInt(cuentaStr, 10) : 1;
        const yaAvisadoHoy = yaAvisadoStr === 'true';

        const evaluacion = evaluarAvisoPesajeFrecuente({
          registrosHoy,
          yaAvisadoHoy,
        });

        if (evaluacion.debeMostrarAviso) {
          mensajeAvisoCoach = evaluacion.mensajeCoach;
          await AsyncStorage.setItem(claveAviso, 'true');
        }

        await AsyncStorage.setItem(claveCuenta, String(registrosHoy + 1));
        await actualizarRegistroPeso(ultimo.id, { peso_kg: pesoKg });
      } else {
        const claveCuenta = `@avanza/cuenta_pesaje_${hoy}`;
        await AsyncStorage.setItem(claveCuenta, '1');

        await crearRegistroPeso({
          id: randomUUID(),
          usuario_id: usuarioId,
          peso_kg: pesoKg,
          fecha: hoy,
          fuente: 'manual',
        });
      }

      onGuardado();
      onCerrar();

      if (mensajeAvisoCoach) {
        Alert.alert('Consejo del coach', mensajeAvisoCoach);
      }
    } catch (error) {
      console.error('Error al guardar el peso:', error);
      Alert.alert('Error', 'No se pudo guardar el peso. Por favor, intenta nuevamente.');
    } finally {
      guardandoRef.current = false;
      setGuardando(false);
    }
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onCerrar}>
      <KeyboardAvoidingView
        style={estilos.fondo}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Fondo superior para cerrar al tocar afuera */}
        <Pressable style={estilos.flex} onPress={onCerrar} />

        <View style={estilos.sheet}>
          <View style={estilos.agarre} />

          <Text style={estilos.sheetTitulo}>Registrar mi peso</Text>
          <Text style={estilos.detalle}>Ingresa tu peso en kilogramos para el dia de hoy.</Text>

          <View style={estilos.inputFila}>
            <TextInput
              style={estilos.input}
              value={pesoTexto}
              onChangeText={setPesoTexto}
              placeholder="72,5"
              placeholderTextColor={colors.textMuted}
              keyboardType="decimal-pad"
              autoFocus
            />
            <Text style={estilos.unidad}>kg</Text>
          </View>

          <View style={estilos.acciones}>
            <Pressable
              style={[estilos.boton, guardando && estilos.botonDeshabilitado]}
              onPress={guardar}
              disabled={guardando}
            >
              {guardando ? (
                <ActivityIndicator color={colors.textOnAction} />
              ) : (
                <Text style={estilos.botonTexto}>Guardar peso</Text>
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const estilos = StyleSheet.create({
  fondo: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  flex: {
    flex: 1,
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.lg,
    paddingBottom: spacing.xxxl,
    ...shadow.sheet,
    gap: spacing.md,
  },
  agarre: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: spacing.xs,
  },
  sheetTitulo: {
    fontSize: fontSize.subtitle,
    lineHeight: lineHeight.subtitle,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  detalle: {
    fontSize: fontSize.small,
    lineHeight: lineHeight.small,
    color: colors.textSecondary,
  },
  inputFila: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    height: sizes.control,
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  input: {
    flex: 1,
    fontSize: fontSize.body,
    color: colors.textPrimary,
  },
  unidad: {
    fontSize: fontSize.body,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  acciones: {
    marginTop: spacing.sm,
  },
  boton: {
    height: sizes.control,
    backgroundColor: colors.action,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  botonDeshabilitado: {
    backgroundColor: colors.actionDisabled,
  },
  botonTexto: {
    fontSize: fontSize.body,
    fontWeight: '600',
    color: colors.textOnAction,
  },
});
