import { useState, useRef } from 'react';
import { useRouter } from 'expo-router';
import { Alert, Text, StyleSheet, Pressable } from 'react-native';
import { Pantalla } from '@/ui/Pantalla';
import { Input } from '@/ui/Input';
import { Boton } from '@/ui/Boton';
import { guardarSesion } from '@/features/auth/session';
import { colors, spacing, fontSize, lineHeight } from '@/ui/theme';

export default function Registro() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [guardando, setGuardando] = useState(false);
  const guardandoRef = useRef(false);

  const registrar = async () => {
    if (guardandoRef.current) return;

    if (!email || !password || !confirmar) {
      Alert.alert('Faltan datos', 'Completá todos los campos.');
      return;
    }
    if (!email.includes('@')) {
      Alert.alert('Email invalido', 'Revisá el email que ingresaste.');
      return;
    }
    if (password.length < 8) {
      Alert.alert('Contraseña corta', 'Tiene que tener al menos 8 caracteres.');
      return;
    }
    if (password !== confirmar) {
      Alert.alert('No coinciden', 'Las contraseñas no son iguales.');
      return;
    }

    guardandoRef.current = true;
    setGuardando(true);

    try {
      await guardarSesion({ email });
      router.replace('/(tabs)');
    } catch (error) {
      console.error('Error al registrar:', error);
      Alert.alert('Error', 'No se pudo completar el registro. Intentá de nuevo.');
    } finally {
      guardandoRef.current = false;
      setGuardando(false);
    }
  };

  return (
    <Pantalla>
      <Text style={estilos.titulo}>Creá tu cuenta</Text>

      <Input
        label="Email"
        value={email}
        placeholder="tu@email.com"
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
      />
      <Input
        label="Contraseña"
        value={password}
        placeholder="Al menos 8 caracteres"
        onChangeText={setPassword}
        secureTextEntry
      />
      <Input
        label="Repetir contraseña"
        value={confirmar}
        placeholder="Repetí la contraseña"
        onChangeText={setConfirmar}
        secureTextEntry
      />

      <Boton titulo="Crear cuenta" onPress={registrar} cargando={guardando} />

      <Pressable onPress={() => router.replace('/login')}>
        <Text style={estilos.link}>¿Ya tenés cuenta? Iniciá sesión</Text>
      </Pressable>
    </Pantalla>
  );
}

const estilos = StyleSheet.create({
  titulo: {
    fontSize: fontSize.title,
    lineHeight: lineHeight.title,
    fontWeight: 'bold',
    color: colors.textPrimary,
  },

    link: {
    fontSize: fontSize.body,
    lineHeight: lineHeight.body,
    color: colors.action,
    textAlign: 'center',
  },
});