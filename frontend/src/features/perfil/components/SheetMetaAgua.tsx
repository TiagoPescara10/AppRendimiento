// src/features/perfil/components/SheetMetaAgua.tsx
//
// Modal bottom sheet para configurar la meta diaria de hidratacion.
// Permite ingresar un valor manual en mililitros o restablecer al
// calculo automatico basado en peso y entrenamientos.

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
} from 'react-native';
import { colors, spacing, radius, fontSize, lineHeight, shadow, sizes } from '@/ui/theme';
import { actualizarPerfil } from '@/db/queries/perfil';

interface Props {
  visible: boolean;
  usuarioId: string;
  metaCalculada: number;
  metaManual?: number | null;
  onCerrar: () => void;
  onGuardado: () => void;
}

const META_MIN_ML = 500;
const META_MAX_ML = 10000;

export function SheetMetaAgua({
  visible,
  usuarioId,
  metaCalculada,
  metaManual,
  onCerrar,
  onGuardado,
}: Props) {
  const [texto, setTexto] = useState('');
  const [guardando, setGuardando] = useState(false);
  const guardandoRef = useRef(false);

  useEffect(() => {
    if (visible) {
      setTexto(metaManual != null ? String(metaManual) : '');
    }
  }, [visible, metaManual]);

  if (!visible) return null;

  const guardarManual = async () => {
    if (guardandoRef.current) return;

    const valorLimpio = texto.trim();
    if (!valorLimpio) {
      // Si deja vacio, restablece al calculo automatico
      await restablecerAutomatico();
      return;
    }

    const n = parseInt(valorLimpio, 10);
    if (!Number.isFinite(n) || n < META_MIN_ML || n > META_MAX_ML) {
      Alert.alert(
        'Valor invalido',
        `Ingresa una meta entre ${META_MIN_ML.toLocaleString('es-AR')} y ${META_MAX_ML.toLocaleString('es-AR')} ml.`,
      );
      return;
    }

    guardandoRef.current = true;
    setGuardando(true);
    try {
      await actualizarPerfil(usuarioId, { meta_agua_manual_ml: n });
      onGuardado();
      onCerrar();
    } catch (e) {
      console.error('Error al guardar meta de agua:', e);
      Alert.alert('Error', 'No se pudo guardar la meta. Intenta nuevamente.');
    } finally {
      guardandoRef.current = false;
      setGuardando(false);
    }
  };

  const restablecerAutomatico = async () => {
    if (guardandoRef.current) return;
    guardandoRef.current = true;
    setGuardando(true);
    try {
      await actualizarPerfil(usuarioId, { meta_agua_manual_ml: null });
      onGuardado();
      onCerrar();
    } catch (e) {
      console.error('Error al restablecer meta de agua:', e);
      Alert.alert('Error', 'No se pudo restablecer la meta.');
    } finally {
      guardandoRef.current = false;
      setGuardando(false);
    }
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onCerrar}>
      <KeyboardAvoidingView
        style={estilos.fondo}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={estilos.telon} onPress={onCerrar} />
        <View style={estilos.sheet}>
          <View style={estilos.barraArrastre} />

          <Text style={estilos.titulo}>Meta de hidratacion</Text>
          <Text style={estilos.descripcion}>
            Tu meta diaria calculada segun peso y actividad es de{' '}
            <Text style={estilos.destacado}>
              {metaCalculada.toLocaleString('es-AR')} ml
            </Text>
            . Podes ingresar una cantidad fija manual a continuacion.
          </Text>

          <View style={estilos.campo}>
            <TextInput
              style={estilos.input}
              value={texto}
              onChangeText={setTexto}
              placeholder={`Ej: ${metaCalculada}`}
              placeholderTextColor={colors.textMuted}
              keyboardType="number-pad"
              autoFocus
              selectTextOnFocus
            />
            <Text style={estilos.unidad}>ml</Text>
          </View>

          {metaManual != null && (
            <Pressable
              style={estilos.botonReset}
              onPress={restablecerAutomatico}
              disabled={guardando}
            >
              <Text style={estilos.botonResetTexto}>
                Usar calculo automatico ({metaCalculada.toLocaleString('es-AR')} ml)
              </Text>
            </Pressable>
          )}

          <View style={estilos.acciones}>
            <Pressable
              style={[estilos.boton, estilos.botonCancelar]}
              onPress={onCerrar}
              disabled={guardando}
            >
              <Text style={estilos.botonCancelarTexto}>Cancelar</Text>
            </Pressable>

            <Pressable
              style={[estilos.boton, estilos.botonGuardar]}
              onPress={guardarManual}
              disabled={guardando}
            >
              <Text style={estilos.botonGuardarTexto}>
                {guardando ? 'Guardando...' : 'Guardar'}
              </Text>
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
    justifyContent: 'flex-end',
    backgroundColor: colors.overlay,
  },
  telon: {
    flex: 1,
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
    ...shadow.sheet,
  },
  barraArrastre: {
    width: 36,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.borderStrong,
    alignSelf: 'center',
    marginBottom: spacing.xs,
  },
  titulo: {
    fontSize: fontSize.subtitle,
    lineHeight: lineHeight.subtitle,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  descripcion: {
    fontSize: fontSize.small,
    lineHeight: lineHeight.small,
    color: colors.textSecondary,
  },
  destacado: {
    fontWeight: '600',
    color: colors.textPrimary,
  },
  campo: {
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
    fontWeight: '600',
  },
  unidad: {
    fontSize: fontSize.body,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  botonReset: {
    paddingVertical: spacing.xs,
    alignSelf: 'flex-start',
  },
  botonResetTexto: {
    fontSize: fontSize.small,
    color: colors.action,
    fontWeight: '500',
  },
  acciones: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  boton: {
    flex: 1,
    height: sizes.control,
    borderRadius: radius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  botonCancelar: {
    backgroundColor: colors.surfaceAlt,
  },
  botonCancelarTexto: {
    fontSize: fontSize.body,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  botonGuardar: {
    backgroundColor: colors.action,
  },
  botonGuardarTexto: {
    fontSize: fontSize.body,
    fontWeight: '600',
    color: colors.textOnAction,
  },
});
