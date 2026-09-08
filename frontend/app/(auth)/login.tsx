// app/(auth)/login.tsx
import { useState, useRef } from 'react';
import { useRouter } from 'expo-router';
import { Alert, Text, StyleSheet } from 'react-native';
import { Pantalla } from '@/ui/Pantalla';
import { Input } from '@/ui/Input';
import { Boton } from '@/ui/Boton';
import { guardarSesion } from '@/features/auth/session';
import { colors, fontSize, lineHeight } from '@/ui/theme';

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [entrando, setEntrando] = useState(false);
  const entrandoRef = useRef(false);

  const entrar = async () => {
    if (entrandoRef.current) return;

    if (!email || !password) {
      Alert.alert('Faltan datos', 'Completá email y contraseña.');
      return;
    }
    if (!email.includes('@')) {
      Alert.alert('Email invalido', 'Revisá el email que ingresaste.');
      return;
    }

    entrandoRef.current = true;
    setEntrando(true);

    try {
      // MOCK: sin backend no hay contra que validar la contrasena.
      // Cuando exista, esto pasa a ser una llamada a la API y guardarSesion
      // recibe el token que devuelva.
      await guardarSesion({ email });
      router.replace('/(tabs)');
    } catch (error) {
      console.error('Error al iniciar sesion:', error);
      Alert.alert('Error', 'No se pudo iniciar sesión. Intentá de nuevo.');
    } finally {
      entrandoRef.current = false;
      setEntrando(false);
    }
  };

  return (
    <Pantalla>
      <Text style={estilos.titulo}>Iniciá sesión</Text>

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
        placeholder="Tu contraseña"
        onChangeText={setPassword}
        secureTextEntry
      />

      <Boton titulo="Entrar" onPress={entrar} cargando={entrando} />
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
});