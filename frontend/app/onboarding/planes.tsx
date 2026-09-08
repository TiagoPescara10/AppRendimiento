// La pasarela: ultimo paso del muro. Reemplaza al registro obligatorio que
// habia antes.
//
// ============================================================================
// TODO — ACA VA LA COMPRA DE VERDAD. HOY NO SE COBRA NADA.
//
// El boton de abajo NO cobra: guarda la sesion mock y entra a la app, igual
// que hacia el registro. Es un placeholder de flujo, no una pasarela.
//
// No se instalo expo-in-app-purchases (ni ninguna libreria de pagos) a
// proposito: necesitan development build y cuenta de Apple/Google Play, que
// todavia no hay. Instalarlas ahora rompe el build de Expo Go sin dar nada a
// cambio.
//
// Cuando entren, lo que cambia es el cuerpo de `empezar()`:
//   1. lanzar la compra del producto que corresponda a `plan`
//   2. si el usuario la cancela, volver sin tocar la sesion
//   3. si sale bien, validar el recibo y recien ahi guardarSesion()
// El email que se pide abajo ya queda guardado, asi que sirve para el aviso de
// fin de prueba y para restaurar compras.
// ============================================================================

import { useState, useRef } from 'react';
import { View, Text, Pressable, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { Pantalla } from '@/ui/Pantalla';
import { Boton } from '@/ui/Boton';
import { Input } from '@/ui/Input';
import { guardarSesion } from '@/features/auth/session';
import { colors, spacing, radius, fontSize, lineHeight, fontWeight, shadow, sizes } from '@/ui/theme';

// ---------------------------------------------------------------------------

type ClavePlan = 'anual' | 'mensual';

type Plan = {
  clave: ClavePlan;
  nombre: string;
  precio: string;
  detalle: string;
  /** El que viene marcado y lleva la etiqueta. Uno solo. */
  destacado?: boolean;
};

const PLANES: Plan[] = [
  {
    clave: 'anual',
    nombre: 'Anual',
    precio: '$2.400 por año',
    detalle: '$200 por mes',
    destacado: true,
  },
  {
    clave: 'mensual',
    nombre: 'Mensual',
    precio: '$350 por mes',
    detalle: 'Cancelás cuando quieras',
  },
];

const BENEFICIOS = [
  'Registro de comidas ilimitado',
  'Cronómetro y agenda de entrenamientos',
  'Tu progreso guardado, mes a mes',
];

// ---------------------------------------------------------------------------

export default function Planes() {
  const router = useRouter();
  const [plan, setPlan] = useState<ClavePlan>('anual');
  const [email, setEmail] = useState('');
  const [guardando, setGuardando] = useState(false);
  const guardandoRef = useRef(false);

  const empezar = async () => {
    if (guardandoRef.current) return;

    // El email es obligatorio: el copy promete avisar antes de que termine la
    // prueba, y sin mail no hay a donde avisar. Cuando entre la compra real
    // tambien hace falta para restaurar compras.
    const limpio = email.trim();
    if (!limpio) {
      Alert.alert('Falta el email', 'Lo necesitamos para avisarte antes de que termine la prueba.');
      return;
    }
    if (!limpio.includes('@')) {
      Alert.alert('Email invalido', 'Revisá el email que ingresaste.');
      return;
    }

    guardandoRef.current = true;
    setGuardando(true);

    try {
      // MOCK: ver el TODO de arriba. Aca va la compra.
      await guardarSesion({ email: limpio });
      router.replace('/(tabs)');
    } catch (error) {
      console.error('Error al iniciar la prueba:', error);
      Alert.alert('Error', 'No se pudo empezar la prueba. Intentá de nuevo.');
    } finally {
      guardandoRef.current = false;
      setGuardando(false);
    }
  };

  return (
    <Pantalla>
      <Text style={estilos.titulo}>Empezá hoy</Text>
      <Text style={estilos.bajada}>Probá 7 días. Si no te sirve, cancelás y no pagás nada.</Text>

      <View style={estilos.planes}>
        {PLANES.map((p) => (
          <TarjetaPlan
            key={p.clave}
            plan={p}
            elegido={plan === p.clave}
            onPress={() => setPlan(p.clave)}
          />
        ))}
      </View>

      <View style={estilos.card}>
        {BENEFICIOS.map((b) => (
          <View key={b} style={estilos.beneficio}>
            <Ionicons name="checkmark-circle" size={sizes.iconSmall} color={colors.action} />
            <Text style={estilos.beneficioTexto}>{b}</Text>
          </View>
        ))}
      </View>

      <Input
        label="Tu email"
        value={email}
        placeholder="tu@email.com"
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
      />

      <Boton titulo="Empezar los 7 días gratis" onPress={empezar} cargando={guardando} />
      <Text style={estilos.aclaracion}>Te avisamos antes de que termine la prueba.</Text>

      <Pressable onPress={() => router.push('/login')}>
        <Text style={estilos.link}>Ya tengo cuenta</Text>
      </Pressable>
    </Pantalla>
  );
}

// ---------------------------------------------------------------------------

function TarjetaPlan({
  plan,
  elegido,
  onPress,
}: {
  plan: Plan;
  elegido: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected: elegido }}
      onPress={onPress}
      style={({ pressed }) => [
        estilos.plan,
        elegido && estilos.planElegido,
        pressed && estilos.planPresionado,
      ]}
    >
      <View style={estilos.planCabecera}>
        <Text style={estilos.planNombre}>{plan.nombre}</Text>
        {plan.destacado && (
          <View style={estilos.etiqueta}>
            <Text style={estilos.etiquetaTexto}>Más elegido</Text>
          </View>
        )}
        {/* El circulo de seleccion va a la derecha del todo: es el que dice
            cual esta marcado cuando los dos tienen el mismo peso visual. */}
        <View style={[estilos.radio, elegido && estilos.radioElegido]}>
          {elegido && <View style={estilos.radioPunto} />}
        </View>
      </View>

      <Text style={estilos.planPrecio}>{plan.precio}</Text>
      <Text style={estilos.planDetalle}>{plan.detalle}</Text>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------

const estilos = StyleSheet.create({
  titulo: {
    fontSize: fontSize.title,
    lineHeight: lineHeight.title,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  bajada: {
    fontSize: fontSize.body,
    lineHeight: lineHeight.body,
    color: colors.textSecondary,
    marginTop: -spacing.xs,
  },

  planes: { gap: spacing.sm },

  plan: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.xs,
    // Borde transparente y no ausente: si el borde apareciera recien al
    // elegir, la card se moveria 2px al tocarla.
    borderWidth: 2,
    borderColor: 'transparent',
    ...shadow.card,
  },
  planElegido: { borderColor: colors.action },
  planPresionado: { backgroundColor: colors.surfaceAlt },

  planCabecera: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  planNombre: {
    fontSize: fontSize.body,
    lineHeight: lineHeight.body,
    fontWeight: fontWeight.medium,
    color: colors.textPrimary,
  },
  planPrecio: {
    fontSize: fontSize.subtitle,
    lineHeight: lineHeight.subtitle,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  planDetalle: {
    fontSize: fontSize.small,
    lineHeight: lineHeight.small,
    color: colors.textSecondary,
  },

  etiqueta: {
    backgroundColor: colors.accentSoft,
    borderRadius: radius.pill,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  etiquetaTexto: {
    fontSize: fontSize.caption,
    lineHeight: lineHeight.caption,
    fontWeight: fontWeight.medium,
    color: colors.textOnAccentSoft,
  },

  // marginLeft auto: la etiqueta esta solo en un plan, asi que sin esto el
  // radio del otro se pegaria al nombre en vez de quedar a la derecha.
  radio: {
    marginLeft: 'auto',
    width: 22,
    height: 22,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioElegido: { borderColor: colors.action },
  radioPunto: {
    width: 10,
    height: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.action,
  },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
    ...shadow.card,
  },
  beneficio: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  beneficioTexto: {
    flex: 1,
    fontSize: fontSize.small,
    lineHeight: lineHeight.small,
    color: colors.textPrimary,
  },

  aclaracion: {
    fontSize: fontSize.caption,
    lineHeight: lineHeight.caption,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: -spacing.xs,
  },
  link: {
    fontSize: fontSize.body,
    lineHeight: lineHeight.body,
    color: colors.action,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
});
