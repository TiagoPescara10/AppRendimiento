// Pantalla de edicion de objetivo nutricional desde Perfil
// Precarga el objetivo actual y valida salvaguardas de salud antes de guardar

import { useState, useEffect, useRef } from 'react';
import { View, Text, Pressable, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { Pantalla } from '@/ui/Pantalla';
import { Boton } from '@/ui/Boton';
import { Input } from '@/ui/Input';
import { ListaOpciones } from '@/ui/ListaOpciones';
import { colors, spacing, fontSize, lineHeight, radius, shadow } from '@/ui/theme';
import { obtenerPerfilLocal, actualizarPerfil } from '@/db/queries/perfil';
import { ultimoPeso } from '@/db/queries/peso';
import { validarObjetivo } from '@/lib/validacion';
import type { PerfilRow, Objetivo as TipoObjetivo } from '@/db/schema';

const OPCIONES: { valor: TipoObjetivo; titulo: string; descripcion: string }[] = [
  {
    valor: 'bajar',
    titulo: 'Bajar de peso',
    descripcion: 'Reducir grasa corporal de forma gradual',
  },
  {
    valor: 'mantener',
    titulo: 'Mantener peso',
    descripcion: 'Sostener tu peso actual y comer mejor',
  },
  {
    valor: 'subir',
    titulo: 'Subir de peso',
    descripcion: 'Ganar masa muscular con superavit calorico',
  },
  {
    valor: 'rendimiento',
    titulo: 'Mejorar rendimiento',
    descripcion: 'Comer para entrenar y competir mejor, sin foco en la balanza',
  },
];

export default function EditarObjetivo() {
  const router = useRouter();

  const [perfil, setPerfil] = useState<PerfilRow | null>(null);
  const [ultimoPesoValue, setUltimoPesoValue] = useState<number | null>(null);
  const [objetivo, setObjetivo] = useState<TipoObjetivo | null>(null);
  const [objetivoKgTexto, setObjetivoKgTexto] = useState('');
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const guardandoRef = useRef(false);

  useEffect(() => {
    (async () => {
      try {
        const p = await obtenerPerfilLocal();
        if (p) {
          setPerfil(p);
          setObjetivo(p.objetivo);
          if (p.peso_objetivo_kg != null) {
            setObjetivoKgTexto(String(p.peso_objetivo_kg).replace('.', ','));
          }
          const ult = await ultimoPeso(p.id);
          setUltimoPesoValue(ult?.peso_kg ?? null);
        }
      } catch (err) {
        console.error('Error al cargar objetivo:', err);
      } finally {
        setCargando(false);
      }
    })();
  }, []);

  const requierePesoObjetivo = objetivo === 'bajar' || objetivo === 'subir';

  const guardar = async () => {
    if (guardandoRef.current) return;

    if (!objetivo) {
      Alert.alert('Faltan datos', 'Selecciona un objetivo.');
      return;
    }

    if (!perfil) {
      Alert.alert('Error', 'No se encontro el perfil.');
      return;
    }

    const objetivoKg = requierePesoObjetivo ? parseFloat(objetivoKgTexto.replace(',', '.')) : null;

    const val = validarObjetivo({
      objetivo,
      pesoObjetivoKg: objetivoKg,
      alturaCm: perfil.altura_cm,
      pesoActualKg: ultimoPesoValue,
    });

    if (!val.ok) {
      Alert.alert(val.titulo, val.mensaje);
      return;
    }

    guardandoRef.current = true;
    setGuardando(true);

    try {
      await actualizarPerfil(perfil.id, {
        objetivo,
        peso_objetivo_kg: requierePesoObjetivo ? objetivoKg : null,
      });

      router.back();
    } catch (e) {
      console.error('Error al actualizar objetivo:', e);
      Alert.alert('Error', 'No se pudo guardar el objetivo.');
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

  // Guardia amigable si el usuario esta en modo recuento
  if (perfil?.modo_nutricion === 'recuento') {
    return (
      <Pantalla>
        <View style={estilos.header}>
          <Pressable onPress={() => router.back()} hitSlop={12} style={estilos.volverBoton}>
            <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
          </Pressable>
          <Text style={estilos.headerTitulo}>Objetivo</Text>
        </View>

        <View style={estilos.recuentoCard}>
          <Ionicons name="information-circle-outline" size={36} color={colors.action} />
          <Text style={estilos.recuentoTitulo}>Modo recuento activo</Text>
          <Text style={estilos.recuentoTexto}>
            Esto no aplica en modo recuento. Podés cambiar de modo desde Ajustes en tu perfil si querés usar objetivos diarios.
          </Text>
          <View style={estilos.recuentoAcciones}>
            <Boton
              titulo="Volver al perfil"
              variante="secundario"
              onPress={() => router.back()}
            />
          </View>
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
        <Text style={estilos.headerTitulo}>Objetivo</Text>
      </View>

      <View style={estilos.contenido}>
        <ListaOpciones
          opciones={OPCIONES}
          valor={objetivo}
          onChange={setObjetivo}
        />

        {requierePesoObjetivo && (
          <View style={estilos.pesoContainer}>
            <Input
              label="Peso objetivo (kg)"
              value={objetivoKgTexto}
              onChangeText={setObjetivoKgTexto}
              keyboardType="decimal-pad"
              placeholder="Ej: 72,5"
            />
            {ultimoPesoValue != null && (
              <Text style={estilos.detallePeso}>
                Tu ultimo peso registrado es de {ultimoPesoValue.toLocaleString('es-AR')} kg.
              </Text>
            )}
          </View>
        )}

        <View style={estilos.acciones}>
          <Boton
            titulo="Guardar objetivo"
            variante="primario"
            onPress={guardar}
            disabled={guardando || !objetivo || (requierePesoObjetivo && !objetivoKgTexto.trim())}
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
  contenido: {
    gap: spacing.lg,
    marginTop: spacing.sm,
  },
  pesoContainer: {
    gap: spacing.xs,
  },
  detallePeso: {
    fontSize: fontSize.small,
    lineHeight: lineHeight.small,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  acciones: {
    marginTop: spacing.md,
  },
  recuentoCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.xl,
    ...shadow.card,
  },
  recuentoTitulo: {
    fontSize: fontSize.body,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  recuentoTexto: {
    fontSize: fontSize.body,
    lineHeight: lineHeight.body,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  recuentoAcciones: {
    width: '100%',
    marginTop: spacing.sm,
  },
});
