// app/comida/camara.tsx
//
// La camara de la app, con dos modos:
//   Foto    se saca la foto del plato y va directo al analisis
//           (/comida/foto). Sin paso de "usar esta foto": si salio mal,
//           Cancelar en el analisis vuelve aca.
//   Codigo  escanea codigos de barras solo, sin disparador. El resultado es
//           el sheet de features/escaneo (base local, despues Open Food Facts).
//
// Reemplaza al escaner simulado de escanear.tsx, que ahora redirige aca.
// Todo es expo-camera (CameraView), que anda en Expo Go.
//
// El modo sale del parametro `modo`; sin parametro, el ultimo que se uso
// (AsyncStorage: es una preferencia del telefono, no un dato).

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { CameraView } from 'expo-camera';
import type { BarcodeScanningResult } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useIsFocused, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { Boton } from '@/ui/Boton';
import { colors, fontSize, fontWeight, lineHeight, radius, shadow, spacing } from '@/ui/theme';
import type { TipoComida } from '@/db/schema';
import { asegurarPermisoCamara, elegirFotoDeGaleria } from '@/features/permisos/asegurarPermiso';
import { consultarCodigo, revisarCategorias } from '@/features/escaneo/consultarCodigo';
import type { ProductoEscaneado, RescateProducto } from '@/features/escaneo/openFoodFacts';
import { ModalCodigoManual, ResultadoCodigo } from '@/features/escaneo/components/ResultadoCodigo';
import type { EstadoConsulta } from '@/features/escaneo/components/ResultadoCodigo';

type Modo = 'foto' | 'codigo';

const CLAVE_ULTIMO_MODO = 'camara_ultimo_modo';
const VERSION_APP = Constants.expoConfig?.version ?? '';
const TIPOS_COMIDA: TipoComida[] = ['desayuno', 'almuerzo', 'merienda', 'cena', 'snack'];

/** Los codigos de los productos de supermercado. */
const TIPOS_CODIGO = ['ean13', 'ean8', 'upc_a', 'upc_e'] as const;

/** Cuanto hay que deslizar para cambiar de modo. */
const DESLIZAR_PX = 40;

function tipoPorHora(): TipoComida {
  const h = new Date().getHours();
  if (h < 11) return 'desayuno';
  if (h < 15) return 'almuerzo';
  if (h < 19) return 'merienda';
  return 'cena';
}

const capitalizar = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** Las cuatro esquinas redondeadas de una guia. */
function Esquinas() {
  return (
    <>
      <View style={[estilos.esquina, estilos.esquinaArribaIzq]} />
      <View style={[estilos.esquina, estilos.esquinaArribaDer]} />
      <View style={[estilos.esquina, estilos.esquinaAbajoIzq]} />
      <View style={[estilos.esquina, estilos.esquinaAbajoDer]} />
    </>
  );
}

export default function Camara() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const enFoco = useIsFocused();
  const params = useLocalSearchParams<{ modo?: string; tipo?: string }>();

  const camara = useRef<CameraView>(null);
  const [permiso, setPermiso] = useState<'verificando' | 'concedido' | 'ajustes'>('verificando');
  const [lista, setLista] = useState(false);

  const [modo, setModoEstado] = useState<Modo>(params.modo === 'codigo' ? 'codigo' : 'foto');
  const [linterna, setLinterna] = useState(false);
  const [comida, setComida] = useState<TipoComida>(() =>
    TIPOS_COMIDA.includes(params.tipo as TipoComida) ? (params.tipo as TipoComida) : tipoPorHora(),
  );
  const [menuComida, setMenuComida] = useState(false);

  // Modo Codigo
  const [consulta, setConsulta] = useState<EstadoConsulta>('reposo');
  const [codigo, setCodigo] = useState('');
  const [producto, setProducto] = useState<ProductoEscaneado | null>(null);
  const [rescate, setRescate] = useState<RescateProducto>({ nombre: '', marca: null });
  const [modalCodigoManual, setModalCodigoManual] = useState(false);
  // El callback del escaner puede llegar varias veces antes de que React
  // apague onBarcodeScanned: el ref corta en seco.
  const leyendo = useRef(false);

  // Modo Foto
  const [disparando, setDisparando] = useState(false);
  const flash = useRef(new Animated.Value(0)).current;

  // --- permiso --------------------------------------------------------------

  const pedirPermiso = useCallback(async () => {
    const r = await asegurarPermisoCamara();
    if (r === 'concedido') setPermiso('concedido');
    else if (r === 'ajustes') setPermiso('ajustes');
    // "Ahora no": a Registrar comida con el buscador listo para escribir.
    else router.replace({ pathname: '/comida/nueva', params: { tipo: comida, enfocar: '1' } });
  }, [router, comida]);

  useEffect(() => {
    pedirPermiso();
    // Solo al entrar. Al volver de Ajustes, el usuario toca "Probar de nuevo".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- modo -------------------------------------------------------------------

  // Sin parametro, el ultimo modo usado.
  useEffect(() => {
    if (params.modo === 'foto' || params.modo === 'codigo') return;
    AsyncStorage.getItem(CLAVE_ULTIMO_MODO)
      .then((v) => { if (v === 'foto' || v === 'codigo') setModoEstado(v); })
      .catch(() => {});
  }, [params.modo]);

  const cambiarModo = useCallback((m: Modo) => {
    setModoEstado(m);
    setMenuComida(false);
    AsyncStorage.setItem(CLAVE_ULTIMO_MODO, m).catch(() => {});
  }, []);

  // Deslizar de costado sobre la camara cambia de modo. Foto a la izquierda,
  // Codigo a la derecha, como en el selector.
  const deslizar = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 20 && Math.abs(g.dx) > Math.abs(g.dy) * 2,
      onPanResponderRelease: (_, g) => {
        if (g.dx <= -DESLIZAR_PX) cambiarModo('codigo');
        else if (g.dx >= DESLIZAR_PX) cambiarModo('foto');
      },
    }),
  ).current;

  // --- foto -------------------------------------------------------------------

  const irAlAnalisis = (uri: string, ancho: number, alto: number) => {
    router.push({
      pathname: '/comida/foto',
      params: { uri, ancho: String(ancho), alto: String(alto), tipo: comida },
    });
  };

  const disparar = async () => {
    if (!camara.current || !lista || disparando) return;
    setDisparando(true);
    // El destello va antes de la captura: es la respuesta al toque.
    flash.setValue(0.85);
    Animated.timing(flash, { toValue: 0, duration: 220, useNativeDriver: true }).start();
    try {
      const foto = await camara.current.takePictureAsync({ quality: 0.85 });
      if (foto?.uri) irAlAnalisis(foto.uri, foto.width, foto.height);
    } catch (e) {
      console.error('No se pudo sacar la foto:', e);
    } finally {
      setDisparando(false);
    }
  };

  const abrirGaleria = async () => {
    const asset = await elegirFotoDeGaleria({ mediaTypes: ['images'], quality: 0.9 });
    if (asset) irAlAnalisis(asset.uri, asset.width, asset.height);
  };

  // --- codigo -----------------------------------------------------------------

  const consultar = async (crudo: string) => {
    const cod = crudo.trim();
    if (!cod) return;
    leyendo.current = true;
    setCodigo(cod);
    setConsulta('cargando');
    setProducto(null);
    setRescate({ nombre: '', marca: null });

    const r = await consultarCodigo(cod, VERSION_APP);
    if (r.tipo === 'detectado') {
      setProducto(r.producto);
      setConsulta('detectado');
      if (r.revisarAlimentoId) {
        void revisarCategorias(r.revisarAlimentoId, r.producto.codigo, VERSION_APP).then((n) => {
          if (n) setProducto((p) => (p && p.codigo === r.producto.codigo ? { ...p, ...n } : p));
        });
      }
    } else if (r.tipo === 'no_encontrado') {
      setRescate(r.rescate);
      setConsulta('no_encontrado');
    } else {
      setConsulta('sin_conexion');
    }
  };

  const alLeerCodigo = (r: BarcodeScanningResult) => {
    if (leyendo.current || !r.data) return;
    leyendo.current = true;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    consultar(r.data);
  };

  /** Cierra el resultado y vuelve a escanear. */
  const escanearOtro = () => {
    setConsulta('reposo');
    setProducto(null);
    setCodigo('');
    leyendo.current = false;
  };

  // A Registrar comida con el codigo precargado: queda guardado con el
  // alimento y la proxima vez se encuentra.
  const cargarAMano = () => {
    router.replace({
      pathname: '/comida/nueva',
      params: {
        busqueda: producto?.nombre || rescate.nombre || '',
        codigo,
        marca: producto?.marca || rescate.marca || '',
        tipo: comida,
      },
    });
  };

  // --- render -----------------------------------------------------------------

  const conResultado = modo === 'codigo' && consulta !== 'reposo';
  const escaneando = modo === 'codigo' && consulta === 'reposo' && !modalCodigoManual && enFoco;
  const ladoFoto = Math.min(width * 0.78, 320);
  const anchoCodigo = Math.min(width * 0.82, 340);

  if (permiso !== 'concedido') {
    return (
      <View style={[estilos.contenedor, estilos.centrado, { paddingTop: insets.top }]}>
        {permiso === 'ajustes' && (
          <View style={estilos.sinPermiso}>
            <Ionicons name="camera-outline" size={40} color={colors.textoSobreFoto} />
            <Text style={estilos.sinPermisoTexto}>
              Cuando permitas la cámara en Ajustes, volvé y tocá "Probar de nuevo".
            </Text>
            <Boton titulo="Probar de nuevo" onPress={pedirPermiso} />
            <Boton
              titulo="Buscar a mano"
              variante="secundario"
              onPress={() => router.replace({ pathname: '/comida/nueva', params: { tipo: comida, enfocar: '1' } })}
            />
          </View>
        )}
      </View>
    );
  }

  return (
    <View style={estilos.contenedor}>
      <CameraView
        ref={camara}
        style={StyleSheet.absoluteFill}
        facing="back"
        active={enFoco}
        enableTorch={linterna}
        onCameraReady={() => setLista(true)}
        barcodeScannerSettings={{ barcodeTypes: [...TIPOS_CODIGO] }}
        onBarcodeScanned={escaneando ? alLeerCodigo : undefined}
      />

      {/* Todo lo que va arriba de la imagen. Deslizar aca cambia de modo. */}
      <View style={StyleSheet.absoluteFill} {...(conResultado ? {} : deslizar.panHandlers)}>
        <View style={[estilos.encabezado, { paddingTop: insets.top + spacing.sm }]}>
          <Pressable
            style={({ pressed }) => [estilos.botonRedondo, pressed && estilos.botonRedondoPresionado]}
            onPress={() => router.back()}
            accessibilityLabel="Cerrar la cámara"
          >
            <Ionicons name="close" size={22} color={colors.textoSobreFoto} />
          </Pressable>

          <View>
            <Pressable
              style={({ pressed }) => [estilos.pastilla, pressed && estilos.botonRedondoPresionado]}
              onPress={() => setMenuComida((v) => !v)}
              accessibilityLabel={`Comida: ${comida}. Cambiar`}
            >
              <Text style={estilos.pastillaTexto}>{capitalizar(comida)}</Text>
              <Ionicons name="chevron-down" size={14} color={colors.textoSobreFoto} />
            </Pressable>
            {menuComida && (
              <View style={estilos.menu}>
                {TIPOS_COMIDA.map((t) => (
                  <Pressable
                    key={t}
                    style={[estilos.menuItem, comida === t && estilos.menuItemActivo]}
                    onPress={() => {
                      setComida(t);
                      setMenuComida(false);
                    }}
                  >
                    <Text style={[estilos.menuTexto, comida === t && estilos.menuTextoActivo]}>
                      {capitalizar(t)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>

          <View style={estilos.accionesDerecha}>
            {modo === 'codigo' && (
              <Pressable
                style={({ pressed }) => [estilos.botonRedondo, pressed && estilos.botonRedondoPresionado]}
                onPress={() => setModalCodigoManual(true)}
                accessibilityLabel="Escribir el código a mano"
              >
                <Ionicons name="keypad-outline" size={20} color={colors.textoSobreFoto} />
              </Pressable>
            )}
            <Pressable
              style={({ pressed }) => [
                estilos.botonRedondo,
                linterna && estilos.botonLinternaActiva,
                pressed && estilos.botonRedondoPresionado,
              ]}
              onPress={() => setLinterna((v) => !v)}
              accessibilityLabel={linterna ? 'Apagar la linterna' : 'Prender la linterna'}
            >
              <Ionicons
                name={linterna ? 'flash' : 'flash-outline'}
                size={20}
                color={linterna ? colors.textPrimary : colors.textoSobreFoto}
              />
            </Pressable>
          </View>
        </View>

        {/* La guia del modo */}
        {!conResultado && (
          <View style={estilos.centroGuia} pointerEvents="none">
            {modo === 'foto' ? (
              <View style={{ width: ladoFoto, height: ladoFoto }}>
                <Esquinas />
              </View>
            ) : (
              <View style={{ width: anchoCodigo, height: anchoCodigo * 0.5 }}>
                <Esquinas />
              </View>
            )}
            <Text style={estilos.indicacion}>
              {modo === 'foto' ? 'Encuadrá el plato' : 'Centrá el código de barras'}
            </Text>
          </View>
        )}

        {/* Abajo: disparador (solo Foto) y selector de modo */}
        {!conResultado && (
          <View style={[estilos.pie, { paddingBottom: insets.bottom + spacing.lg }]}>
            {modo === 'foto' ? (
              <View style={estilos.filaDisparador}>
                <Pressable
                  style={({ pressed }) => [estilos.botonGaleria, pressed && estilos.botonRedondoPresionado]}
                  onPress={abrirGaleria}
                  accessibilityLabel="Elegir una foto de la galería"
                >
                  <Ionicons name="images-outline" size={24} color={colors.textoSobreFoto} />
                </Pressable>
                <Pressable
                  onPress={disparar}
                  disabled={!lista || disparando}
                  style={({ pressed }) => [estilos.disparadorAro, pressed && estilos.disparadorPresionado]}
                  accessibilityRole="button"
                  accessibilityLabel="Sacar la foto"
                >
                  <View style={estilos.disparador} />
                </Pressable>
                {/* Mismo ancho que la galeria, para que el disparador quede centrado. */}
                <View style={estilos.botonGaleriaHueco} />
              </View>
            ) : (
              <View style={estilos.filaDisparador} />
            )}

            <View style={estilos.selector} accessibilityRole="tablist">
              {(['foto', 'codigo'] as const).map((m) => {
                const activo = modo === m;
                return (
                  <Pressable
                    key={m}
                    onPress={() => cambiarModo(m)}
                    style={[estilos.opcionModo, activo && estilos.opcionModoActiva]}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: activo }}
                  >
                    <Text style={[estilos.opcionModoTexto, activo && estilos.opcionModoTextoActivo]}>
                      {m === 'foto' ? 'Foto' : 'Código'}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}
      </View>

      {/* El destello de la foto */}
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, estilos.flash, { opacity: flash }]} />

      {conResultado && (
        <ResultadoCodigo
          consulta={consulta}
          codigo={codigo}
          producto={producto}
          rescate={rescate}
          comida={comida}
          onProductoCambio={setProducto}
          onIngresarCodigo={() => setModalCodigoManual(true)}
          onReintentar={() => consultar(codigo)}
          onCargarAMano={cargarAMano}
          onGuardado={() => router.back()}
          onCerrar={escanearOtro}
          style={[estilos.sheet, { paddingBottom: insets.bottom + spacing.lg }]}
        />
      )}

      <ModalCodigoManual
        visible={modalCodigoManual}
        onCerrar={() => setModalCodigoManual(false)}
        onConsultar={(c) => {
          setModalCodigoManual(false);
          consultar(c);
        }}
      />
    </View>
  );
}

const LADO_ESQUINA = 28;
const GROSOR_ESQUINA = 3.5;

const estilos = StyleSheet.create({
  contenedor: { flex: 1, backgroundColor: colors.camaraFondo },
  centrado: { justifyContent: 'center', alignItems: 'center' },

  encabezado: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    zIndex: 20,
  },
  botonRedondo: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.controlOnCamara,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.bordeOnCamara,
  },
  botonRedondoPresionado: { backgroundColor: colors.controlOnCamaraPressed },
  botonLinternaActiva: { backgroundColor: colors.surface },
  accionesDerecha: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  pastilla: {
    height: 40,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.controlOnCamara,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.bordeOnCamara,
  },
  pastillaTexto: { color: colors.textoSobreFoto, fontSize: fontSize.small, fontWeight: fontWeight.bold },
  menu: {
    position: 'absolute',
    top: 48,
    left: -20,
    width: 140,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.card,
  },
  menuItem: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radius.sm },
  menuItemActivo: { backgroundColor: colors.accentSoft },
  menuTexto: { fontSize: fontSize.small, color: colors.textPrimary },
  menuTextoActivo: { fontWeight: fontWeight.bold },

  centroGuia: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg },
  esquina: { position: 'absolute', width: LADO_ESQUINA, height: LADO_ESQUINA, borderColor: colors.scannerHud },
  esquinaArribaIzq: {
    top: 0,
    left: 0,
    borderTopWidth: GROSOR_ESQUINA,
    borderLeftWidth: GROSOR_ESQUINA,
    borderTopLeftRadius: radius.md,
  },
  esquinaArribaDer: {
    top: 0,
    right: 0,
    borderTopWidth: GROSOR_ESQUINA,
    borderRightWidth: GROSOR_ESQUINA,
    borderTopRightRadius: radius.md,
  },
  esquinaAbajoIzq: {
    bottom: 0,
    left: 0,
    borderBottomWidth: GROSOR_ESQUINA,
    borderLeftWidth: GROSOR_ESQUINA,
    borderBottomLeftRadius: radius.md,
  },
  esquinaAbajoDer: {
    bottom: 0,
    right: 0,
    borderBottomWidth: GROSOR_ESQUINA,
    borderRightWidth: GROSOR_ESQUINA,
    borderBottomRightRadius: radius.md,
  },
  indicacion: {
    color: colors.textoSobreFoto,
    fontSize: fontSize.body,
    lineHeight: lineHeight.body,
    fontWeight: fontWeight.medium,
  },

  pie: { gap: spacing.lg, alignItems: 'center' },
  filaDisparador: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xxl,
    minHeight: 80,
  },
  botonGaleria: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.controlOnCamara,
    borderWidth: 1,
    borderColor: colors.bordeOnCamara,
    alignItems: 'center',
    justifyContent: 'center',
  },
  botonGaleriaHueco: { width: 48, height: 48 },
  disparadorAro: {
    width: 80,
    height: 80,
    borderRadius: radius.pill,
    borderWidth: 4,
    borderColor: colors.disparadorAro,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disparadorPresionado: { transform: [{ scale: 0.94 }] },
  disparador: { width: 64, height: 64, borderRadius: radius.pill, backgroundColor: colors.disparador },

  selector: {
    flexDirection: 'row',
    backgroundColor: colors.controlOnCamara,
    borderRadius: radius.pill,
    padding: spacing.xs,
    borderWidth: 1,
    borderColor: colors.bordeOnCamara,
  },
  opcionModo: { paddingVertical: spacing.sm, paddingHorizontal: spacing.lg, borderRadius: radius.pill },
  opcionModoActiva: { backgroundColor: colors.scannerHud },
  opcionModoTexto: { color: colors.textoSobreFoto, fontSize: fontSize.small, fontWeight: fontWeight.medium },
  opcionModoTextoActivo: { color: colors.textPrimary, fontWeight: fontWeight.bold },

  flash: { backgroundColor: colors.flashCamara },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0 },

  sinPermiso: { alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.xl, alignSelf: 'stretch' },
  sinPermisoTexto: {
    color: colors.textoSobreFoto,
    fontSize: fontSize.body,
    lineHeight: lineHeight.body,
    textAlign: 'center',
  },
});
