// Pantalla de edicion de datos personales desde Perfil
// Precarga los datos existentes, valida altura y guarda volviendo atras

import { useState, useEffect, useRef } from 'react';
import { View, Text, Pressable, StyleSheet, Alert, Platform, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';

import { Pantalla } from '@/ui/Pantalla';
import { Boton } from '@/ui/Boton';
import { Input } from '@/ui/Input';
import { colors, spacing, radius, fontSize, sizes, shadow, lineHeight } from '@/ui/theme';
import { obtenerPerfilLocal, actualizarPerfil } from '@/db/queries/perfil';
import { aFechaLocal } from '@/lib/fechas';
import { validarAltura, validarDatosPerfil } from '@/lib/validacion';
import type { PerfilRow } from '@/db/schema';

export default function EditarDatos() {
  const router = useRouter();

  const [perfil, setPerfil] = useState<PerfilRow | null>(null);
  const [cargando, setCargando] = useState(true);
  const [nombre, setNombre] = useState('');
  const [fechaNacimiento, setFechaNacimiento] = useState<Date | null>(null);
  const [altura, setAltura] = useState('');
  const [sexo, setSexo] = useState<'masculino' | 'femenino' | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const guardandoRef = useRef(false);

  const hace18 = new Date();
  hace18.setFullYear(hace18.getFullYear() - 18);

  useEffect(() => {
    (async () => {
      try {
        const p = await obtenerPerfilLocal();
        if (p) {
          setPerfil(p);
          setNombre(p.nombre ?? '');
          if (p.fecha_nacimiento) {
            const [a, m, d] = p.fecha_nacimiento.split('-').map(Number);
            setFechaNacimiento(new Date(a, m - 1, d));
          }
          setAltura(p.altura_cm != null ? String(p.altura_cm) : '');
          setSexo(p.sexo_biologico);
        }
      } catch (err) {
        console.error('Error al cargar perfil:', err);
      } finally {
        setCargando(false);
      }
    })();
  }, []);

  const esRecuento = perfil?.modo_nutricion === 'recuento';

  const guardar = async () => {
    if (guardandoRef.current) return;

    if (!perfil) {
      Alert.alert('Error', 'No se encontro el perfil.');
      return;
    }

    const alturaCm = parseFloat(altura.replace(',', '.'));
    const val = validarDatosPerfil({
      nombre: nombre.trim(),
      alturaCm,
      fechaNacimiento: fechaNacimiento ? aFechaLocal(fechaNacimiento) : null,
      sexoBiologico: sexo,
      modoNutricion: perfil.modo_nutricion,
    });

    if (!val.ok) {
      Alert.alert(val.titulo, val.mensaje);
      return;
    }

    guardandoRef.current = true;
    setGuardando(true);

    try {
      await actualizarPerfil(perfil.id, {
        nombre: nombre.trim(),
        altura_cm: alturaCm,
        fecha_nacimiento: !esRecuento && fechaNacimiento ? aFechaLocal(fechaNacimiento) : (perfil.fecha_nacimiento ?? null),
        sexo_biologico: !esRecuento ? sexo : (perfil.sexo_biologico ?? null),
      });

      router.back();
    } catch (e) {
      console.error('Error al actualizar datos:', e);
      Alert.alert('Error', 'No se pudieron guardar los cambios.');
    } finally {
      guardandoRef.current = false;
      setGuardando(false);
    }
  };

  if (cargando) {
    return (
      <Pantalla>
        <View style={estilos.centrado}>
          <ActivityIndicator size="large" color={colors.action} />
        </View>
      </Pantalla>
    );
  }

  return (
    <Pantalla>
      {/* Header con boton para volver */}
      <View style={estilos.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={estilos.volverBoton}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={estilos.headerTitulo}>Datos personales</Text>
      </View>

      <View style={estilos.formulario}>
        <Input
          placeholder="Tu nombre"
          value={nombre}
          onChangeText={setNombre}
          label="Nombre"
        />

        <Input
          placeholder="178"
          value={altura}
          onChangeText={setAltura}
          keyboardType="decimal-pad"
          label="Altura (cm)"
        />

        {!esRecuento && (
          <>
            <View>
              <Text style={estilos.label}>Fecha de nacimiento</Text>
              <Pressable style={estilos.campoFecha} onPress={() => setAbierto(true)}>
                <Text style={fechaNacimiento ? estilos.textoFecha : estilos.placeholderFecha}>
                  {fechaNacimiento ? fechaNacimiento.toLocaleDateString() : 'Selecciona tu fecha'}
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

        <View style={estilos.acciones}>
          <Boton
            titulo="Guardar cambios"
            variante="primario"
            onPress={guardar}
            disabled={guardando}
          />
        </View>
      </View>
    </Pantalla>
  );
}

const estilos = StyleSheet.create({
  centrado: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: spacing.xxxl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  volverBoton: {
    padding: spacing.xs,
  },
  headerTitulo: {
    fontSize: fontSize.title,
    lineHeight: lineHeight.title,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  formulario: {
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  label: {
    fontSize: fontSize.small,
    lineHeight: lineHeight.small,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  fila: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
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
  textoFecha: {
    fontSize: fontSize.body,
    lineHeight: lineHeight.body,
    color: colors.textPrimary,
  },
  placeholderFecha: {
    fontSize: fontSize.body,
    lineHeight: lineHeight.body,
    color: colors.textSecondary,
  },
  acciones: {
    marginTop: spacing.lg,
  },
});
