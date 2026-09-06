// Alta de un evento suelto o de una rutina semanal. El switch cambia el
// formulario entero, no solo agrega campos: un evento tiene fecha y hora
// puntual, una rutina tiene dias de la semana y hora.

import { useState } from 'react';
import { View, Text, Pressable, StyleSheet, Alert, Switch, Platform, Modal, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';

import { Pantalla } from '@/ui/Pantalla';
import { Boton } from '@/ui/Boton';
import { colors, spacing, radius, fontSize, lineHeight } from '@/ui/theme';

import { crearEvento } from '@/db/queries/eventos';
import { crearRutina } from '@/db/queries/rutinas';
import { materializarRutinas } from '@/features/agenda/materializar';
import { obtenerPerfilLocal } from '@/db/queries/perfil';
import type { TipoEvento, Intensidad } from '@/db/schema';
import { randomUUID } from '@/db/sync/uuid';

// ---------------------------------------------------------------------------
// Constantes y helpers
// ---------------------------------------------------------------------------

const TIPOS: { valor: TipoEvento; label: string }[] = [
  { valor: 'entrenamiento', label: 'Entrenamiento' },
  { valor: 'gimnasio', label: 'Gimnasio' },
  { valor: 'partido', label: 'Partido' },
];

const INTENSIDADES: { valor: Intensidad; label: string }[] = [
  { valor: 'baja', label: 'Baja' },
  { valor: 'media', label: 'Media' },
  { valor: 'alta', label: 'Alta' },
];

const DURACIONES = [30, 45, 60, 90];

/** Indice = Date.getDay(): 0 domingo, 6 sabado. */
const DIAS = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];

const p = (n: number) => String(n).padStart(2, '0');

/**
 * "08:30" en hora LOCAL. El CHECK del DDL rechaza "8:30", de ahi el padding.
 * No pasar por toISOString(): eso convierte a UTC y en Argentina te corre
 * la hora tres lugares.
 */
function horaLocal(d: Date): string {
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * ISO 8601 CON offset local. La columna generada `fecha` de evento sale de
 * los primeros 10 caracteres, asi que guardar UTC manda los entrenamientos
 * de la noche al dia siguiente.
 */
function aISOLocal(d: Date): string {
  const offsetMin = -d.getTimezoneOffset();
  const signo = offsetMin >= 0 ? '+' : '-';
  const offH = p(Math.floor(Math.abs(offsetMin) / 60));
  const offM = p(Math.abs(offsetMin) % 60);

  return (
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` +
    `T${p(d.getHours())}:${p(d.getMinutes())}:00` +
    `${signo}${offH}:${offM}`
  );
}

function fechaLegible(d: Date): string {
  return d.toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' });
}

// ---------------------------------------------------------------------------
// Pantalla
// ---------------------------------------------------------------------------

export default function NuevoEvento() {
  const router = useRouter();

  const [esRutina, setEsRutina] = useState(false);
  const [tipo, setTipo] = useState<TipoEvento>('entrenamiento');
  const [intensidad, setIntensidad] = useState<Intensidad>('media');
  const [duracion, setDuracion] = useState(60);
  const [otraDuracion, setOtraDuracion] = useState(false);
  const [duracionTexto, setDuracionTexto] = useState('');

  // Evento suelto: un Date completo. Rutina: solo se usa la hora.
  const [cuando, setCuando] = useState(new Date());
  const [picker, setPicker] = useState<'date' | 'time' | null>(null);

  // Rutina: dias de la semana elegidos, por indice de getDay().
  const [dias, setDias] = useState<number[]>([]);

  const [guardando, setGuardando] = useState(false);

  const alternarDia = (i: number) => {
    setDias((prev) => (prev.includes(i) ? prev.filter((d) => d !== i) : [...prev, i]));
  };

  const confirmarOtraDuracion = () => {
    const n = parseInt(duracionTexto, 10);
    if (!Number.isFinite(n) || n < 5 || n > 480) {
      Alert.alert('Duración inválida', 'Ingresá un valor entre 5 y 480 minutos.');
      return;
    }
    setDuracion(n);
    setOtraDuracion(false);
    setDuracionTexto('');
  };

  const guardar = async () => {
    if (guardando) return;

    if (esRutina && dias.length === 0) {
      Alert.alert('Faltan días', 'Elegí al menos un día de la semana.');
      return;
    }

    setGuardando(true);
    try {
      const perfil = await obtenerPerfilLocal();
      if (!perfil) {
        Alert.alert('Error', 'No se encontró el perfil.');
        return;
      }

      if (esRutina) {
        // Una rutina por dia elegido: la tabla guarda un dia_semana por fila.
        for (const dia of dias) {
          await crearRutina({
            id: randomUUID(),
            usuario_id: perfil.id,
            dia_semana: dia,
            hora: horaLocal(cuando),
            tipo,
            duracion_estimada_min: duracion,
            intensidad,
          });
        }
        // Sin esto la rutina existe pero la agenda sigue vacia.
        await materializarRutinas(perfil.id);
      } else {
        await crearEvento({
          id: randomUUID(),
          usuario_id: perfil.id,
          tipo,
          fecha_hora_inicio: aISOLocal(cuando),
          duracion_estimada_min: duracion,
          intensidad,
        });
      }

      router.back();
    } catch (e) {
      console.error('Error al guardar:', e);
      Alert.alert('Error', 'No se pudo guardar. Intentá de nuevo.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Pantalla>
      <View style={estilos.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={estilos.cerrar}>✕</Text>
        </Pressable>
        <Text style={estilos.headerTitulo}>{esRutina ? 'Nueva rutina' : 'Nuevo evento'}</Text>
      </View>

      {/* Tipo */}
      <Text style={estilos.label}>Tipo</Text>
      <View style={estilos.chips}>
        {TIPOS.map((t) => (
          <Pressable
            key={t.valor}
            style={[estilos.chip, tipo === t.valor && estilos.chipActivo]}
            onPress={() => setTipo(t.valor)}
          >
            <Text style={[estilos.chipTexto, tipo === t.valor && estilos.chipTextoActivo]}>
              {t.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Switch: es el control que mas cambia la pantalla, asi que se resalta
          cuando esta activo y no solo mueve la perilla. */}
      <View style={[estilos.switchFila, esRutina && estilos.switchActivo]}>
        <View style={estilos.flex}>
          <Text style={estilos.nombre}>Se repite</Text>
          <Text style={estilos.detalle}>Todas las semanas</Text>
        </View>
        <Switch
          value={esRutina}
          onValueChange={setEsRutina}
          trackColor={{ true: colors.action }}
        />
      </View>

      {/* Cuando: cambia de forma segun el modo. */}
      {esRutina ? (
        <>
          <Text style={estilos.label}>Qué días</Text>
          <View style={estilos.dias}>
            {DIAS.map((d, i) => (
              <Pressable
                key={i}
                style={[estilos.dia, dias.includes(i) && estilos.diaActivo]}
                onPress={() => alternarDia(i)}
              >
                <Text style={[estilos.chipTexto, dias.includes(i) && estilos.chipTextoActivo]}>
                  {d}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={estilos.label}>A qué hora</Text>
          <Pressable style={estilos.campo} onPress={() => setPicker('time')}>
            <Text style={estilos.nombre}>{horaLocal(cuando)}</Text>
          </Pressable>
        </>
      ) : (
        <>
          <Text style={estilos.label}>Cuándo</Text>
          <View style={estilos.cuandoFila}>
            <Pressable style={[estilos.campo, estilos.flex2]} onPress={() => setPicker('date')}>
              <Text style={estilos.nombre}>{fechaLegible(cuando)}</Text>
            </Pressable>
            <Pressable style={[estilos.campo, estilos.flex]} onPress={() => setPicker('time')}>
              <Text style={estilos.nombre}>{horaLocal(cuando)}</Text>
            </Pressable>
          </View>
        </>
      )}

      {picker && (
        <DateTimePicker
          value={cuando}
          mode={picker}
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onValueChange={(evento, nueva) => {
            // Android: dialogo modal, dispara una vez al confirmar o cancelar.
            // iOS: inline, dispara en cada giro; lo cierra el boton "Listo".
            if (Platform.OS === 'android') {
              setPicker(null);
              if (evento.type === 'dismissed') return;
            }
            if (nueva) setCuando(nueva);
          }}
        />
      )}
      {picker && Platform.OS === 'ios' && (
        <Boton titulo="Listo" variante="secundario" onPress={() => setPicker(null)} />
      )}

      {/* Duracion */}
      <Text style={estilos.label}>Duración</Text>
      <View style={estilos.chips}>
        {DURACIONES.map((d) => (
          <Pressable
            key={d}
            style={[estilos.chip, duracion === d && estilos.chipActivo]}
            onPress={() => setDuracion(d)}
          >
            <Text style={[estilos.chipTexto, duracion === d && estilos.chipTextoActivo]}>
              {d} min
            </Text>
          </Pressable>
        ))}
        <Pressable
          style={[estilos.chip, !DURACIONES.includes(duracion) && estilos.chipActivo]}
          onPress={() => setOtraDuracion(true)}
        >
          <Text
            style={[
              estilos.chipTexto,
              !DURACIONES.includes(duracion) && estilos.chipTextoActivo,
            ]}
          >
            {DURACIONES.includes(duracion) ? 'Otra' : `${duracion} min`}
          </Text>
        </Pressable>
      </View>

      {/* Intensidad */}
      <Text style={estilos.label}>Intensidad</Text>
      <View style={estilos.intensidades}>
        {INTENSIDADES.map((i) => (
          <Pressable
            key={i.valor}
            style={[estilos.chipAncho, intensidad === i.valor && estilos.chipActivo]}
            onPress={() => setIntensidad(i.valor)}
          >
            <Text
              style={[estilos.chipTexto, intensidad === i.valor && estilos.chipTextoActivo]}
            >
              {i.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Crear una rutina genera decenas de eventos sin que se vea nada.
          Decirlo antes evita la sorpresa. */}
      {esRutina && (
        <Text style={estilos.aviso}>
          Se van a crear los eventos de las próximas 8 semanas. Podés borrar o cambiar
          cualquiera por separado.
        </Text>
      )}

      <Boton
        titulo={esRutina ? 'Crear rutina' : 'Guardar'}
        onPress={guardar}
        cargando={guardando}
      />

      {/* Duracion a medida */}
      <Modal
        visible={otraDuracion}
        transparent
        animationType="slide"
        onRequestClose={() => setOtraDuracion(false)}
      >
        <View style={estilos.fondo}>
          <Pressable style={estilos.flex} onPress={() => setOtraDuracion(false)} />
          <View style={estilos.sheet}>
            <View style={estilos.agarre} />
            <Text style={estilos.nombre}>¿Cuántos minutos?</Text>
            <View style={estilos.cuandoFila}>
              <TextInput
                style={estilos.input}
                value={duracionTexto}
                onChangeText={setDuracionTexto}
                placeholder="Ej: 75"
                placeholderTextColor={colors.textSecondary}
                keyboardType="number-pad"
                returnKeyType="done"
                onSubmitEditing={confirmarOtraDuracion}
                autoFocus
              />
              <Pressable style={estilos.usarBoton} onPress={confirmarOtraDuracion}>
                <Text style={estilos.chipTextoActivo}>Usar</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </Pantalla>
  );
}

// ---------------------------------------------------------------------------

const estilos = StyleSheet.create({
  flex: { flex: 1 },
  flex2: { flex: 2 },

  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  cerrar: { fontSize: fontSize.body, color: colors.textSecondary },
  headerTitulo: {
    fontSize: fontSize.body,
    lineHeight: lineHeight.body,
    fontWeight: '500',
    color: colors.textPrimary,
  },

  label: { fontSize: fontSize.small, color: colors.textSecondary, marginTop: spacing.sm },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
  },
  chipAncho: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    alignItems: 'center',
  },
  chipActivo: { backgroundColor: colors.action },
  chipTexto: { fontSize: fontSize.small, color: colors.textSecondary },
  chipTextoActivo: { fontSize: fontSize.small, color: colors.textOnAction },

  switchFila: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    marginTop: spacing.sm,
  },
  switchActivo: { backgroundColor: colors.accentSoft },

  dias: { flexDirection: 'row', gap: spacing.xs },
  dia: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  diaActivo: { backgroundColor: colors.action },

  cuandoFila: { flexDirection: 'row', gap: spacing.sm },
  campo: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 0.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
  },

  intensidades: { flexDirection: 'row', gap: spacing.xs },

  nombre: { fontSize: fontSize.body, lineHeight: lineHeight.body, color: colors.textPrimary },
  detalle: { fontSize: fontSize.small, color: colors.textSecondary },
  aviso: {
    fontSize: fontSize.small,
    lineHeight: lineHeight.small,
    color: colors.textSecondary,
  },

  fondo: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.lg,
    paddingBottom: spacing.xxxl,
    gap: spacing.md,
  },
  agarre: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center',
  },
  input: {
    flex: 1,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    fontSize: fontSize.body,
    color: colors.textPrimary,
  },
  usarBoton: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.action,
    justifyContent: 'center',
  },
});