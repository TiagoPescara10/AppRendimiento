// app/perfil/modo.tsx
//
// Pantalla de configuracion del modo de nutricion desde Perfil.
// Permite alternar entre "Objetivo diario" y "Solo recuento".
// Si el usuario cambia a modo objetivo y le faltan datos (fecha de nacimiento,
// sexo biologico, nivel de actividad u objetivo), solicita completarlos para
// poder calcular su meta nutricional.

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Alert,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';

import { Pantalla } from '@/ui/Pantalla';
import { Boton } from '@/ui/Boton';
import { Input } from '@/ui/Input';
import { ListaOpciones } from '@/ui/ListaOpciones';
import {
  colors,
  spacing,
  radius,
  fontSize,
  fontWeight,
  lineHeight,
  shadow,
  sizes,
} from '@/ui/theme';
import { obtenerPerfilLocal, actualizarPerfil } from '@/db/queries/perfil';
import { ultimoPeso } from '@/db/queries/peso';
import { aFechaLocal } from '@/lib/fechas';
import { validarDatosPerfil, validarObjetivo } from '@/lib/validacion';
import type {
  PerfilRow,
  ModoNutricion,
  SexoBiologico,
  NivelActividad,
  Objetivo as TipoObjetivo,
} from '@/db/schema';

const OPCIONES_ACTIVIDAD: { valor: NivelActividad; titulo: string; descripcion: string }[] = [
  { valor: 'sedentario', titulo: 'Sedentario', descripcion: 'Poco o ningún ejercicio' },
  { valor: 'ligero', titulo: 'Ligero', descripcion: 'Ejercicio liviano 1 a 3 días por semana' },
  { valor: 'moderado', titulo: 'Moderado', descripcion: 'Entrenamiento 3 a 5 días por semana' },
  { valor: 'alto', titulo: 'Alto', descripcion: 'Entrenamiento intenso 6 a 7 días por semana' },
  { valor: 'muy_alto', titulo: 'Muy alto', descripcion: 'Atleta o doble turno diario' },
];

const OPCIONES_OBJETIVO: { valor: TipoObjetivo; titulo: string; descripcion: string }[] = [
  { valor: 'bajar', titulo: 'Bajar de peso', descripcion: 'Reducir grasa corporal de forma gradual' },
  { valor: 'mantener', titulo: 'Mantener peso', descripcion: 'Sostener tu peso actual y comer mejor' },
  { valor: 'subir', titulo: 'Subir de peso', descripcion: 'Ganar masa muscular con superavit calorico' },
  { valor: 'rendimiento', titulo: 'Mejorar rendimiento', descripcion: 'Comer para rendir al maximo sin foco en la balanza' },
];

export default function ModoNutricionScreen() {
  const router = useRouter();

  const [perfil, setPerfil] = useState<PerfilRow | null>(null);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const guardandoRef = useRef(false);

  const [modoSeleccionado, setModoSeleccionado] = useState<ModoNutricion>('objetivo');
  const [fechaNacimiento, setFechaNacimiento] = useState<Date | null>(null);
  const [sexo, setSexo] = useState<SexoBiologico | null>(null);
  const [actividad, setActividad] = useState<NivelActividad | null>(null);
  const [objetivo, setObjetivo] = useState<TipoObjetivo | null>(null);
  const [pesoObjetivoTexto, setPesoObjetivoTexto] = useState('');
  const [ultimoPesoKg, setUltimoPesoKg] = useState<number | null>(null);
  const [pickerAbierto, setPickerAbierto] = useState(false);

  const hace18 = new Date();
  hace18.setFullYear(hace18.getFullYear() - 18);

  useEffect(() => {
    (async () => {
      try {
        const p = await obtenerPerfilLocal();
        if (p) {
          setPerfil(p);
          setModoSeleccionado(p.modo_nutricion ?? 'objetivo');
          if (p.fecha_nacimiento) {
            const [a, m, d] = p.fecha_nacimiento.split('-').map(Number);
            setFechaNacimiento(new Date(a, m - 1, d));
          }
          if (p.sexo_biologico) setSexo(p.sexo_biologico);
          if (p.nivel_actividad) setActividad(p.nivel_actividad);
          if (p.objetivo) setObjetivo(p.objetivo);
          if (p.peso_objetivo_kg != null) {
            setPesoObjetivoTexto(String(p.peso_objetivo_kg).replace('.', ','));
          }

          const uPeso = await ultimoPeso(p.id);
          setUltimoPesoKg(uPeso?.peso_kg ?? null);
        }
      } catch (err) {
        console.error('Error al cargar perfil para modo de nutricion:', err);
      } finally {
        setCargando(false);
      }
    })();
  }, []);

  const requierePesoObjetivo = objetivo === 'bajar' || objetivo === 'subir';

  const guardar = async () => {
    if (guardandoRef.current || !perfil) return;

    if (modoSeleccionado === 'recuento') {
      guardandoRef.current = true;
      setGuardando(true);
      try {
        await actualizarPerfil(perfil.id, { modo_nutricion: 'recuento' });
        router.back();
      } catch (e) {
        console.error('Error al actualizar a modo recuento:', e);
        Alert.alert('Error', 'No se pudo actualizar el modo de nutrición.');
      } finally {
        guardandoRef.current = false;
        setGuardando(false);
      }
      return;
    }

    // Modo objetivo: validar que esten los datos necesarios
    const valPerfil = validarDatosPerfil({
      nombre: perfil.nombre ?? 'Usuario',
      alturaCm: perfil.altura_cm,
      fechaNacimiento: fechaNacimiento ? aFechaLocal(fechaNacimiento) : null,
      sexoBiologico: sexo,
      modoNutricion: 'objetivo',
    });

    if (!valPerfil.ok) {
      Alert.alert(valPerfil.titulo, valPerfil.mensaje);
      return;
    }

    if (!actividad) {
      Alert.alert('Falta nivel de actividad', 'Seleccioná tu nivel de actividad habitual.');
      return;
    }

    if (!objetivo) {
      Alert.alert('Falta objetivo', 'Seleccioná tu objetivo principal.');
      return;
    }

    const pesoObjKg = requierePesoObjetivo ? parseFloat(pesoObjetivoTexto.replace(',', '.')) : null;
    const valObj = validarObjetivo({
      objetivo,
      pesoObjetivoKg: pesoObjKg,
      alturaCm: perfil.altura_cm,
      pesoActualKg: ultimoPesoKg,
    });

    if (!valObj.ok) {
      Alert.alert(valObj.titulo, valObj.mensaje);
      return;
    }

    guardandoRef.current = true;
    setGuardando(true);
    try {
      await actualizarPerfil(perfil.id, {
        modo_nutricion: 'objetivo',
        fecha_nacimiento: fechaNacimiento ? aFechaLocal(fechaNacimiento) : perfil.fecha_nacimiento,
        sexo_biologico: sexo,
        nivel_actividad: actividad,
        objetivo,
        peso_objetivo_kg: requierePesoObjetivo ? pesoObjKg : null,
      });

      router.back();
    } catch (e) {
      console.error('Error al guardar modo objetivo:', e);
      Alert.alert('Error', 'No se pudo guardar la configuración.');
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
      {/* Header con boton volver */}
      <View style={estilos.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={estilos.volverBoton}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={estilos.headerTitulo}>Modo de nutrición</Text>
      </View>

      <View style={estilos.contenido}>
        <Text style={estilos.descripcion}>
          Elegí cómo querés que la app te acompañe en tu alimentación diaria.
        </Text>

        {/* Card Modo Objetivo */}
        <Pressable
          style={[
            estilos.cardModo,
            modoSeleccionado === 'objetivo' && estilos.cardModoSeleccionada,
          ]}
          onPress={() => setModoSeleccionado('objetivo')}
        >
          <View style={estilos.cardModoHeader}>
            <View style={estilos.cardModoIconoContenedor}>
              <Ionicons
                name="flag-outline"
                size={22}
                color={modoSeleccionado === 'objetivo' ? colors.action : colors.textSecondary}
              />
            </View>
            <View style={estilos.flex}>
              <Text style={estilos.cardModoTitulo}>Con objetivo diario</Text>
              <Text style={estilos.cardModoBajada}>
                Calculamos calorías y macronutrientes según tu perfil y metas.
              </Text>
            </View>
            <View
              style={[
                estilos.radioExterior,
                modoSeleccionado === 'objetivo' && estilos.radioExteriorActivo,
              ]}
            >
              {modoSeleccionado === 'objetivo' && <View style={estilos.radioInterior} />}
            </View>
          </View>
        </Pressable>

        {/* Card Modo Recuento */}
        <Pressable
          style={[
            estilos.cardModo,
            modoSeleccionado === 'recuento' && estilos.cardModoSeleccionada,
          ]}
          onPress={() => setModoSeleccionado('recuento')}
        >
          <View style={estilos.cardModoHeader}>
            <View style={estilos.cardModoIconoContenedor}>
              <Ionicons
                name="restaurant-outline"
                size={22}
                color={modoSeleccionado === 'recuento' ? colors.action : colors.textSecondary}
              />
            </View>
            <View style={estilos.flex}>
              <Text style={estilos.cardModoTitulo}>Solo un recuento</Text>
              <Text style={estilos.cardModoBajada}>
                Registrás comidas y macros como un contador simple, sin metas ni barras de cumplimiento.
              </Text>
            </View>
            <View
              style={[
                estilos.radioExterior,
                modoSeleccionado === 'recuento' && estilos.radioExteriorActivo,
              ]}
            >
              {modoSeleccionado === 'recuento' && <View style={estilos.radioInterior} />}
            </View>
          </View>
        </Pressable>

        {/* Campos requeridos si se selecciona objetivo y faltan datos */}
        {modoSeleccionado === 'objetivo' && (
          <View style={estilos.seccionDatosFaltantes}>
            <Text style={estilos.subtituloSeccion}>Datos para tu cálculo nutricional</Text>

            {/* Sexo biologico */}
            <View style={estilos.bloqueCampo}>
              <Text style={estilos.label}>Sexo biológico</Text>
              <View style={estilos.filaBotones}>
                <View style={estilos.botonOpcion}>
                  <Boton
                    titulo="Masculino"
                    variante={sexo === 'masculino' ? 'primario' : 'secundario'}
                    onPress={() => setSexo('masculino')}
                  />
                </View>
                <View style={estilos.botonOpcion}>
                  <Boton
                    titulo="Femenino"
                    variante={sexo === 'femenino' ? 'primario' : 'secundario'}
                    onPress={() => setSexo('femenino')}
                  />
                </View>
              </View>
            </View>

            {/* Fecha de nacimiento */}
            <View style={estilos.bloqueCampo}>
              <Text style={estilos.label}>Fecha de nacimiento</Text>
              <Pressable
                style={estilos.campoFecha}
                onPress={() => setPickerAbierto(true)}
              >
                <Text style={fechaNacimiento ? estilos.textoFecha : estilos.placeholderFecha}>
                  {fechaNacimiento ? fechaNacimiento.toLocaleDateString() : 'Seleccioná tu fecha'}
                </Text>
              </Pressable>
            </View>

            {pickerAbierto && (
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
                    if (Platform.OS === 'android') setPickerAbierto(false);
                    setFechaNacimiento(nueva);
                  }}
                  onDismiss={() => setPickerAbierto(false)}
                />
                {Platform.OS === 'ios' && (
                  <Boton titulo="Listo" variante="secundario" onPress={() => setPickerAbierto(false)} />
                )}
              </View>
            )}

            {/* Nivel de actividad */}
            <View style={estilos.bloqueCampo}>
              <Text style={estilos.label}>Nivel de actividad</Text>
              <ListaOpciones
                opciones={OPCIONES_ACTIVIDAD}
                valor={actividad}
                onChange={setActividad}
              />
            </View>

            {/* Objetivo nutricional */}
            <View style={estilos.bloqueCampo}>
              <Text style={estilos.label}>Objetivo principal</Text>
              <ListaOpciones
                opciones={OPCIONES_OBJETIVO}
                valor={objetivo}
                onChange={setObjetivo}
              />
            </View>

            {/* Peso objetivo si requiere */}
            {requierePesoObjetivo && (
              <View style={estilos.bloqueCampo}>
                <Input
                  placeholder="Ej: 72,5"
                  value={pesoObjetivoTexto}
                  onChangeText={setPesoObjetivoTexto}
                  keyboardType="decimal-pad"
                  label="Peso objetivo (kg)"
                />
              </View>
            )}
          </View>
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
  flex: { flex: 1 },
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
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  contenido: {
    gap: spacing.md,
    marginTop: spacing.sm,
    paddingBottom: spacing.xxl,
  },
  descripcion: {
    fontSize: fontSize.body,
    lineHeight: lineHeight.body,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  cardModo: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    ...shadow.card,
  },
  cardModoSeleccionada: {
    borderColor: colors.action,
  },
  cardModoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  cardModoIconoContenedor: {
    width: 42,
    height: 42,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardModoTitulo: {
    fontSize: fontSize.body,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  cardModoBajada: {
    fontSize: fontSize.caption,
    lineHeight: lineHeight.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  radioExterior: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioExteriorActivo: {
    borderColor: colors.action,
  },
  radioInterior: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.action,
  },
  seccionDatosFaltantes: {
    gap: spacing.md,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  subtituloSeccion: {
    fontSize: fontSize.body,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  bloqueCampo: {
    gap: spacing.xs,
  },
  label: {
    fontSize: fontSize.body,
    fontWeight: fontWeight.medium,
    color: colors.textPrimary,
  },
  filaBotones: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  botonOpcion: {
    flex: 1,
  },
  campoFecha: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
  },
  textoFecha: {
    fontSize: fontSize.body,
    color: colors.textPrimary,
  },
  placeholderFecha: {
    fontSize: fontSize.body,
    color: colors.textSecondary,
  },
  contenedorPicker: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  acciones: {
    marginTop: spacing.lg,
  },
});
