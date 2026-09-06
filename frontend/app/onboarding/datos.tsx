import { View, Text, Pressable, StyleSheet, Alert, Platform } from 'react-native';
import { useRef, useState } from 'react';
import { colors, spacing, radius, fontSize, sizes } from '@/ui/theme';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Input } from '@/ui/Input';
import { aFechaLocal } from '@/lib/fechas';
import { Boton } from '@/ui/Boton';
import { crearPerfil, actualizarPerfil, obtenerPerfilLocal } from '@/db/queries/perfil';
import { randomUUID } from '@/db/sync/uuid';
import { router } from 'expo-router';
import { PasoOnboarding } from '@/features/perfil/components/PasoOnboarding';

const ALTURA_MIN_CM = 100;
const ALTURA_MAX_CM = 250;

export default function Datos() {
  const [nombre, setNombre] = useState('');
  const [fechaNacimiento, setFechaNacimiento] = useState<Date | null>(null);
  const [altura, setAltura] = useState('');
  const [sexo, setSexo] = useState<'masculino' | 'femenino' | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [guardando, setGuardando] = useState(false);

  // El estado de React se lee del render, asi que dos taps en el mismo frame
  // verian guardando === false los dos. El ref cambia en el acto y cierra esa
  // ventana; el estado existe para deshabilitar el boton en pantalla.
  const guardandoRef = useRef(false);

  const hace18 = new Date();
  hace18.setFullYear(hace18.getFullYear() - 18);

  const guardar = async () => {
    if (guardandoRef.current) return;

    if (!nombre || !fechaNacimiento || !altura || !sexo) {
      Alert.alert('Faltan datos', 'Completá todos los campos.');
      return;
    }

    // parseFloat('abc') es NaN, y NaN entra a la base sin que nadie chiste:
    // SQLite lo guarda como NULL y el TDEE despues sale mal sin explicacion.
    const alturaCm = parseFloat(altura.replace(',', '.'));
    if (!Number.isFinite(alturaCm) || alturaCm < ALTURA_MIN_CM || alturaCm > ALTURA_MAX_CM) {
      Alert.alert('Altura inválida', `Ingresá una altura entre ${ALTURA_MIN_CM} y ${ALTURA_MAX_CM} cm.`);
      return;
    }

    guardandoRef.current = true;
    setGuardando(true);

    const datos = {
      nombre,
      fecha_nacimiento: aFechaLocal(fechaNacimiento),
      altura_cm: alturaCm,
      sexo_biologico: sexo,
    };

    try {
      const existente = await obtenerPerfilLocal();
      if (existente) {
        await actualizarPerfil(existente.id, datos);
      } else {
        await crearPerfil({ id: randomUUID(), fecha_alta: new Date().toISOString(), ...datos });
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
    paso={1} 
    totalPasos={5} 
    titulo="Datos personales" 
    onSiguiente={guardar} 
    guardando={guardando}>

      <Input placeholder="Nombre" value={nombre} onChangeText={setNombre} label="Nombre" />

      <View>
        <Text style={estilos.label}>Fecha de nacimiento</Text>
        <Pressable style={estilos.campoFecha} onPress={() => setAbierto(true)}>
          <Text style={fechaNacimiento ? estilos.textoFecha : estilos.placeholderFecha}>
            {fechaNacimiento ? fechaNacimiento.toLocaleDateString() : 'Seleccioná tu fecha'}
          </Text>
        </Pressable>
      </View>

      {/* El fondo va en el View: la prop backgroundColor del picker fue
          removida en la v8, y de todos modos era iOS-only. */}
      {abierto && (
        <View style={estilos.contenedorPicker}>
          <DateTimePicker
            value={fechaNacimiento ?? new Date(2000, 0, 1)}
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            maximumDate={hace18}
            // Solo iOS. Sin esto el picker sigue la apariencia del sistema: en
            // un telefono en modo oscuro queda texto blanco sobre el fondo claro
            // de la app y no se lee nada. La paleta del proyecto es unica y
            // clara, asi que se fija a light en vez de seguir al sistema.
            themeVariant="light"
            textColor={colors.textPrimary}
            accentColor={colors.action}
            onValueChange={(evento, nueva) => {
              // Android: el picker es un dialogo modal y onChange dispara una
              // sola vez, al confirmar o cancelar.
              // iOS: es inline y dispara en CADA giro de la rueda, asi que
              // cerrarlo aca lo mataria apenas el usuario lo toca. En iOS lo
              // cierra el boton "Listo" de abajo.
              if (Platform.OS === 'android') {
                setAbierto(false);
                // Cancelar tambien llega por onChange, con la fecha original.
                // Sin esto, cancelar equivale a aceptar.
                if (evento.type === 'dismissed') return;
              }
              if (nueva) setFechaNacimiento(nueva);
            }}
          />
          {Platform.OS === 'ios' && (
            <Boton titulo="Listo" variante="secundario" onPress={() => setAbierto(false)} />
          )}
        </View>
      )}

      <Input
        placeholder="Altura"
        value={altura}
        onChangeText={setAltura}
        keyboardType="decimal-pad"
        label="Altura (cm)"
      />

      <View>
        <Text style={estilos.label}>Sexo</Text>
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
  textoFecha: { fontSize: fontSize.body, color: colors.textSecondary },
  placeholderFecha: { fontSize: fontSize.body, color: colors.textSecondary },
});
