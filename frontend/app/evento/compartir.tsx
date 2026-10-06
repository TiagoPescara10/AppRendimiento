// app/evento/compartir.tsx
//
// Tarjeta para compartir una sesion de cronometro: vista previa, foto de
// fondo, compartir y guardar en la galeria. Se llega de dos lados:
//
//   - Al terminar el cronometro libre (desde=temporizador), que reemplaza a la
//     pantalla de "Listo". Por eso aca esta la XP ganada y el boton "Listo"
//     vuelve al inicio.
//   - Desde el detalle de una sesion que ya paso. Ahi "Listo" vuelve atras.
//
// La tarjeta tiene un tamano logico fijo de 360 x 640 y se exporta a 1080 x
// 1920. Para mostrarla, la escala va en un contenedor de AFUERA; captureRef
// apunta a la tarjeta de adentro, que queda sin transformar. Si la escala
// estuviera sobre la misma vista que se captura, la imagen podria salir
// recortada o escalada.
//
// Los permisos se piden en el momento de usarlos, nunca antes: la camara al
// elegir "Sacar foto", la galeria al tocar "Guardar en galeria".
//
// "Corregir km" recalcula ritmo y kcal en la vista previa mientras se escribe
// y lo guarda al confirmar (o antes de compartir, guardar o salir, si quedo
// escrito sin confirmar). Arranca abierto cuando el GPS no midio nada o
// empezo a medir tarde (gpsMinuto).

import { useCallback, useRef, useState } from 'react';
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import { captureRef } from 'react-native-view-shot';

import { Pantalla } from '@/ui/Pantalla';
import { Boton } from '@/ui/Boton';
import { Input } from '@/ui/Input';
import { colors, spacing, radius, fontSize, lineHeight, fontWeight } from '@/ui/theme';
import { obtenerEvento } from '@/db/queries/eventos';
import { obtenerPerfilLocal } from '@/db/queries/perfil';
import { ultimoPeso } from '@/db/queries/peso';
import { actualizarSesionCronometro, obtenerSesionPorEvento } from '@/db/queries/sesiones';
import type { EventoRow, SesionEntrenamientoRow } from '@/db/schema';
import { estimarKcal } from '@/lib/gasto';
import { formatearDecimal, parsearDistancia } from '@/features/entrenamiento/temporizador';
import { contenidoTarjeta } from '@/features/compartir/tarjeta';
import { borrarFotoSesion, guardarFotoSesion } from '@/features/compartir/fotos';
import {
  ALTO_TARJETA,
  ANCHO_TARJETA,
  TarjetaCompartir,
} from '@/features/compartir/components/TarjetaCompartir';
import { cargarNivel } from '@/features/nivel/api';
import type { DatosNivel } from '@/features/nivel/api';
import { GananciaXP } from '@/features/nivel/components/GananciaXP';

/** 1080 x 1920: la tarjeta logica por 3. */
const EXPORTAR = { width: ANCHO_TARJETA * 3, height: ALTO_TARJETA * 3 };

export default function Compartir() {
  const router = useRouter();
  const { id, desde, gpsMinuto } = useLocalSearchParams<{
    id: string;
    desde?: string;
    gpsMinuto?: string;
  }>();
  const { width } = useWindowDimensions();
  const delTemporizador = desde === 'temporizador';
  const minutoGps = gpsMinuto ? Number(gpsMinuto) : null;

  const [evento, setEvento] = useState<EventoRow | null>(null);
  const [sesion, setSesion] = useState<SesionEntrenamientoRow | null>(null);
  const [pesoKg, setPesoKg] = useState<number | null>(null);
  const [nivel, setNivel] = useState<DatosNivel | null>(null);
  const [cargando, setCargando] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  // null = "Corregir km" cerrado. Con texto, es lo que se esta escribiendo.
  const [kmTexto, setKmTexto] = useState<string | null>(null);
  const tarjeta = useRef<View>(null);
  // La apertura automatica de "Corregir km" y la XP pasan una sola vez, no en
  // cada foco: volver de la camara no tiene que reabrir nada.
  const yaPreparo = useRef(false);

  useFocusEffect(
    useCallback(() => {
      if (!id) return;
      let vivo = true;
      (async () => {
        const [e, s, perfil] = await Promise.all([
          obtenerEvento(id),
          obtenerSesionPorEvento(id),
          obtenerPerfilLocal(),
        ]);
        const peso = perfil ? await ultimoPeso(perfil.id).catch(() => null) : null;
        if (!vivo) return;
        setEvento(e);
        setSesion(s);
        setPesoKg(peso?.peso_kg ?? null);

        if (yaPreparo.current || !delTemporizador || !s) return;
        yaPreparo.current = true;
        if (s.distancia_km === null || minutoGps !== null) {
          setKmTexto(s.distancia_km !== null ? formatearDecimal(s.distancia_km, 2) : '');
        }
        cargarNivel()
          .then((n) => vivo && setNivel(n))
          .catch((err) => console.error('Error al cargar el nivel:', err));
      })()
        .catch((err) => console.error('Error al cargar la sesion para compartir:', err))
        .finally(() => vivo && setCargando(false));
      return () => {
        vivo = false;
      };
    }, [id, delTemporizador, minutoGps]),
  );

  // --- km ------------------------------------------------------------------

  /**
   * Las kcal para unos km. Con el peso de ahora: si no hay peso, quedan las
   * que estaban guardadas (que sin peso tambien son null).
   */
  const kcalPara = (s: SesionEntrenamientoRow, km: number | null): number | null =>
    pesoKg === null
      ? s.kcal_estimadas
      : estimarKcal({
          actividad: s.actividad ?? 'correr',
          duracionSeg: s.duracion_real_seg ?? 0,
          distanciaKm: km,
          pesoKg,
        });

  /** Guarda lo escrito en "Corregir km" y lo cierra. No hace nada si esta cerrado. */
  const confirmarKm = async () => {
    if (!sesion || kmTexto === null) return;
    const km = parsearDistancia(kmTexto);
    const kcal = kcalPara(sesion, km);
    try {
      await actualizarSesionCronometro(sesion.id, { distancia_km: km, kcal_estimadas: kcal });
      setSesion({ ...sesion, distancia_km: km, kcal_estimadas: kcal });
      setKmTexto(null);
    } catch (e) {
      console.error('Error al corregir los km:', e);
      Alert.alert('Error', 'No se pudieron guardar los km.');
      throw e;
    }
  };

  // --- foto ----------------------------------------------------------------

  const usarFoto = async (uriElegida: string) => {
    if (!sesion) return;
    try {
      const uri = await guardarFotoSesion(sesion.id, uriElegida, sesion.foto_uri);
      await actualizarSesionCronometro(sesion.id, { foto_uri: uri });
      setSesion((s) => (s ? { ...s, foto_uri: uri } : s));
    } catch (e) {
      console.error('Error al guardar la foto:', e);
      Alert.alert('Error', 'No se pudo guardar la foto.');
    }
  };

  const sacarFoto = async () => {
    const permiso = await ImagePicker.requestCameraPermissionsAsync();
    if (!permiso.granted) {
      Alert.alert('Sin acceso a la cámara', 'Podés habilitarlo desde los ajustes del teléfono.');
      return;
    }
    const r = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.9 });
    if (!r.canceled && r.assets[0]) await usarFoto(r.assets[0].uri);
  };

  // El selector de galeria del sistema no necesita permiso de lectura.
  const elegirDeGaleria = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 });
    if (!r.canceled && r.assets[0]) await usarFoto(r.assets[0].uri);
  };

  const quitarFoto = async () => {
    if (!sesion?.foto_uri) return;
    try {
      await actualizarSesionCronometro(sesion.id, { foto_uri: null });
      borrarFotoSesion(sesion.foto_uri);
      setSesion({ ...sesion, foto_uri: null });
    } catch (e) {
      console.error('Error al quitar la foto:', e);
    }
  };

  /** Camara o galeria, y quitar si ya hay una. La hoja nativa en iOS. */
  const elegirFoto = () => {
    const conFoto = !!sesion?.foto_uri;
    const acciones: { titulo: string; fn: () => Promise<void>; destructiva?: boolean }[] = [
      { titulo: 'Sacar foto', fn: sacarFoto },
      { titulo: 'Elegir de la galería', fn: elegirDeGaleria },
      ...(conFoto ? [{ titulo: 'Quitar foto', fn: quitarFoto, destructiva: true }] : []),
    ];
    const correr = (fn: () => Promise<void>) =>
      void fn().catch((e) => console.error('Error con la foto:', e));

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: [...acciones.map((a) => a.titulo), 'Cancelar'],
          cancelButtonIndex: acciones.length,
          destructiveButtonIndex: conFoto ? acciones.length - 1 : undefined,
        },
        (i) => {
          if (i < acciones.length) correr(acciones[i].fn);
        },
      );
      return;
    }

    // En Android un Alert muestra hasta 3 botones: sin "Cancelar", que se
    // reemplaza por tocar afuera.
    Alert.alert(
      conFoto ? 'Cambiar foto' : 'Agregar foto',
      undefined,
      acciones.map((a) => ({
        text: a.titulo,
        style: a.destructiva ? 'destructive' : 'default',
        onPress: () => correr(a.fn),
      })),
      { cancelable: true },
    );
  };

  // --- exportar --------------------------------------------------------------

  const capturar = () =>
    captureRef(tarjeta, { format: 'png', quality: 1, result: 'tmpfile', ...EXPORTAR });

  const compartir = async () => {
    if (ocupado) return;
    setOcupado(true);
    try {
      await confirmarKm();
      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert('No disponible', 'Este dispositivo no permite compartir archivos.');
        return;
      }
      const uri = await capturar();
      await Sharing.shareAsync(uri, { mimeType: 'image/png', UTI: 'public.png' });
    } catch (e) {
      console.error('Error al compartir la tarjeta:', e);
      Alert.alert('Error', 'No se pudo generar la imagen.');
    } finally {
      setOcupado(false);
    }
  };

  const guardarEnGaleria = async () => {
    if (ocupado) return;
    setOcupado(true);
    try {
      await confirmarKm();
      // Solo escritura: para guardar no hace falta leer la galeria.
      const permiso = await MediaLibrary.requestPermissionsAsync(true, ['photo']);
      if (!permiso.granted) {
        Alert.alert('Sin acceso a la galería', 'Podés habilitarlo desde los ajustes del teléfono.');
        return;
      }
      const uri = await capturar();
      await MediaLibrary.Asset.create(uri);
      Alert.alert('Guardada', 'La imagen quedó en tu galería.');
    } catch (e) {
      console.error('Error al guardar en la galeria:', e);
      Alert.alert('Error', 'No se pudo guardar la imagen.');
    } finally {
      setOcupado(false);
    }
  };

  /** Desde el temporizador vuelve al inicio; desde el detalle, atras. */
  const salir = async () => {
    try {
      await confirmarKm();
    } catch {
      // Ya avisado. La sesion esta guardada; se pierde solo la correccion.
    }
    if (delTemporizador) router.dismissTo('/');
    else router.back();
  };

  // --- pantalla ----------------------------------------------------------------

  if (cargando) {
    return (
      <Pantalla scroll={false}>
        <View style={estilos.centrado}>
          <ActivityIndicator color={colors.action} />
        </View>
      </Pantalla>
    );
  }

  if (!evento || !sesion || sesion.modo !== 'cronometro') {
    return (
      <Pantalla>
        <Text style={estilos.detalle}>Esta sesión no tiene una tarjeta para compartir.</Text>
        <Boton titulo="Volver" variante="secundario" onPress={() => router.back()} ancho />
      </Pantalla>
    );
  }

  // Mientras se corrigen los km, la vista previa ya muestra lo escrito.
  const editando = kmTexto !== null;
  const kmVista = editando ? parsearDistancia(kmTexto) : sesion.distancia_km;
  const contenido = contenidoTarjeta({
    actividad: sesion.actividad,
    fecha: evento.fecha,
    duracionSeg: sesion.duracion_real_seg ?? 0,
    distanciaKm: kmVista,
    kcal: editando ? kcalPara(sesion, kmVista) : sesion.kcal_estimadas,
  });

  // Ancho de la pantalla menos los margenes de Pantalla (spacing.lg a cada lado).
  const anchoVista = width - spacing.lg * 2;
  const escala = anchoVista / ANCHO_TARJETA;

  return (
    <Pantalla>
      <View style={estilos.header}>
        <Pressable onPress={salir} hitSlop={12} accessibilityLabel="Cerrar">
          <Text style={estilos.cerrar}>✕</Text>
        </Pressable>
        <Text style={estilos.titulo}>Compartir</Text>
      </View>

      {/* La escala va en el contenedor de afuera. La tarjeta de adentro queda
          en 360 x 640, que es lo que captura captureRef. */}
      <View style={[estilos.vista, { width: anchoVista, height: ALTO_TARJETA * escala }]}>
        <View style={{ transform: [{ scale: escala }] }}>
          <TarjetaCompartir ref={tarjeta} contenido={contenido} fotoUri={sesion.foto_uri} />
        </View>
      </View>

      {editando ? (
        <View style={estilos.corregir}>
          <View style={estilos.corregirFila}>
            <View style={estilos.flex}>
              <Input
                label="Distancia"
                value={kmTexto}
                onChangeText={setKmTexto}
                placeholder="Ej: 6,2"
                keyboardType="decimal-pad"
                returnKeyType="done"
                onSubmitEditing={() => void confirmarKm().catch(() => {})}
              />
            </View>
            <Boton
              titulo="Guardar"
              variante="secundario"
              onPress={() => void confirmarKm().catch(() => {})}
            />
          </View>
          {minutoGps !== null && (
            <Text style={estilos.nota}>
              El GPS empezó a medir en el minuto {minutoGps}. Revisá los km.
            </Text>
          )}
        </View>
      ) : (
        <Pressable
          onPress={() =>
            setKmTexto(sesion.distancia_km !== null ? formatearDecimal(sesion.distancia_km, 2) : '')
          }
          style={estilos.enlace}
          hitSlop={8}
        >
          <Text style={estilos.enlaceTexto}>Corregir km</Text>
        </Pressable>
      )}

      {/* Solo en pantalla: TarjetaCompartir no la dibuja, no sale en la imagen. */}
      {nivel && <GananciaXP nivel={nivel} />}

      <Boton
        titulo={sesion.foto_uri ? 'Cambiar foto' : 'Agregar foto'}
        variante="secundario"
        onPress={elegirFoto}
        disabled={ocupado}
        ancho
      />
      <Boton titulo="Compartir" onPress={compartir} cargando={ocupado} ancho />
      <Boton titulo="Guardar en galería" variante="secundario" onPress={guardarEnGaleria} disabled={ocupado} ancho />
      <Boton titulo="Listo" variante="fantasma" onPress={salir} disabled={ocupado} ancho />
    </Pantalla>
  );
}

const estilos = StyleSheet.create({
  flex: { flex: 1 },
  centrado: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  cerrar: { fontSize: fontSize.subtitle, color: colors.textSecondary },
  titulo: {
    fontSize: fontSize.title,
    lineHeight: lineHeight.title,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  detalle: { fontSize: fontSize.body, lineHeight: lineHeight.body, color: colors.textSecondary },
  // Centra la tarjeta de 360 x 640: el scale transforma desde el centro, asi
  // que centrada queda exactamente ocupando el contenedor.
  vista: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderRadius: radius.lg,
  },
  enlace: { alignSelf: 'center', paddingVertical: spacing.xs },
  enlaceTexto: { fontSize: fontSize.small, lineHeight: lineHeight.small, color: colors.textSecondary },
  corregir: { gap: spacing.xs },
  // El boton alineado con el campo y no con la etiqueta de arriba.
  corregirFila: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  nota: { fontSize: fontSize.small, lineHeight: lineHeight.small, color: colors.textSecondary },
});
