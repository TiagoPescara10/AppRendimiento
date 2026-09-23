// app/onboarding/datos.tsx
//
// Paso 2: Datos personales.
// En modo recuento solo pide nombre y altura (version liviana sin fecha ni sexo).
// En modo objetivo pide nombre, fecha de nacimiento, altura y sexo para calcular TDEE e IMC.

import { View, Text, Pressable, StyleSheet, Alert, Platform } from 'react-native';
import { useRef, useState, useEffect } from 'react';
import { colors, spacing, radius, fontSize, sizes, shadow } from '@/ui/theme';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Input } from '@/ui/Input';
import { aFechaLocal } from '@/lib/fechas';
import { Boton } from '@/ui/Boton';
import {
  crearPerfil,
  actualizarPerfil,
  obtenerPerfilLocal,
  type CambiosPerfil,
} from '@/db/queries/perfil';
import { randomUUID } from '@/db/sync/uuid';
import { router } from 'expo-router';
import { PasoOnboarding } from '@/features/perfil/components/PasoOnboarding';
import { validarDatosPerfil } from '@/lib/validacion';
import { useOnboarding } from '@/features/perfil/hooks/useOnboarding';

export default function Datos() {
  const { perfil, cargando } = useOnboarding();
  const esRecuento = perfil?.modo_nutricion === 'recuento';
  const totalPasos = esRecuento ? 4 : 6;

  const [nombre, setNombre] = useState('');
  const [fechaNacimiento, setFechaNacimiento] = useState<Date | null>(null);
  const [altura, setAltura] = useState('');
  const [sexo, setSexo] = useState<'masculino' | 'femenino' | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const guardandoRef = useRef(false);

  const hace18 = new Date();
  hace18.setFullYear(hace18.getFullYear() - 18);

  // Precargar si el perfil ya existe
  useEffect(() => {
    if (perfil) {
      if (perfil.nombre) setNombre(perfil.nombre);
      if (perfil.altura_cm) setAltura(String(perfil.altura_cm));
      if (perfil.sexo_biologico) setSexo(perfil.sexo_biologico);
      if (perfil.fecha_nacimiento) {
        setFechaNacimiento(new Date(perfil.fecha_nacimiento));
      }
    }
  }, [perfil]);

  const guardar = async () => {
    if (guardandoRef.current) return;

    const alturaCm = parseFloat(altura.replace(',', '.'));
    const val = validarDatosPerfil({
      nombre,
      alturaCm: Number.isFinite(alturaCm) ? alturaCm : null,
      fechaNacimiento,
      sexoBiologico: sexo,
      modoNutricion: perfil?.modo_nutricion ?? 'objetivo',
    });

    if (!val.ok) {
      Alert.alert(val.titulo, val.mensaje);
      return;
    }

    guardandoRef.current = true;
    setGuardando(true);

    const datos: CambiosPerfil = {
      nombre: nombre.trim(),
      altura_cm: alturaCm,
      ...(esRecuento
        ? {}
        : {
            fecha_nacimiento: aFechaLocal(fechaNacimiento!),
            sexo_biologico: sexo!,
          }),
    };

    try {
      const existente = await obtenerPerfilLocal();
      if (existente) {
        await actualizarPerfil(existente.id, datos);
      } else {
        await crearPerfil({
          id: randomUUID(),
          fecha_alta: new Date().toISOString(),
          modo_nutricion: perfil?.modo_nutricion ?? 'objetivo',
          ...datos,
        });
      }
      router.push('/onboarding/peso');
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'No se pudieron guardar los datos.');
    } finally {
      guardandoRef.current = false;
      setGuardando(false);
    }
  };

  return (
    <PasoOnboarding
      paso={2}
      totalPasos={totalPasos}
      titulo="Datos personales"
      subtitulo={
        esRecuento
          ? 'Solo necesitamos tu nombre y altura para tu perfil.'
          : 'Completá tus datos para el cálculo de tu objetivo.'
      }
      onSiguiente={guardar}
      guardando={guardando || cargando}
      puedeSeguir={!cargando}
    >
      <Input
        placeholder="Nombre"
        value={nombre}
        onChangeText={setNombre}
        label="Nombre"
      />

      <Input
        placeholder="Altura"
        value={altura}
        onChangeText={setAltura}
        keyboardType="decimal-pad"
        label="Altura (cm)"
      />

      {/* Campos para calculo calorico (solo modo objetivo) */}
      {!esRecuento && (
        <>
          <View>
            <Text style={estilos.label}>Fecha de nacimiento</Text>
            <Pressable style={estilos.campoFecha} onPress={() => setAbierto(true)}>
              <Text style={fechaNacimiento ? estilos.textoFecha : estilos.placeholderFecha}>
                {fechaNacimiento ? fechaNacimiento.toLocaleDateString() : 'Seleccioná tu fecha'}
              </Text>
            </Pressable>
          </View>

          {abierto && (
            <View style={estilos.contenedorPicker}>
              <DateTimePicker
                value={fechaNacimiento ?? new Date(2000, 0, 1)}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                maximumDate={hace18}
                themeVariant="light"
                textColor={colors.textPrimary}
                accentColor={colors.action}
                onValueChange={(_, nueva) => {
                  if (Platform.OS === 'android') setAbierto(false);
                  setFechaNacimiento(nueva);
                }}
                onDismiss={() => setAbierto(false)}
              />
              {Platform.OS === 'ios' && (
                <Boton titulo="Listo" variante="secundario" onPress={() => setAbierto(false)} />
              )}
            </View>
          )}

          <View>
            <Text style={estilos.label}>Sexo biológico</Text>
            <View style={estilos.fila}>
              <Boton
                titulo="Masculino"
                variante={sexo === 'masculino' ? 'primario' : 'secundario'}
                onPress={() => setSexo('masculino')}
              />
              <Boton
                titulo="Femenino"
                variante={sexo === 'femenino' ? 'primario' : 'secundario'}
                onPress={() => setSexo('femenino')}
              />
            </View>
          </View>
        </>
      )}
    </PasoOnboarding>
  );
}

const estilos = StyleSheet.create({
  label: { fontSize: fontSize.small, color: colors.textSecondary, marginBottom: spacing.xs },
  fila: { flexDirection: 'row', gap: spacing.sm },
  contenedorPicker: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    overflow: 'hidden',
    ...shadow.card,
  },
  campoFecha: {
    height: sizes.control,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
  },
  textoFecha: { fontSize: fontSize.body, color: colors.textPrimary },
  placeholderFecha: { fontSize: fontSize.body, color: colors.textSecondary },
});
