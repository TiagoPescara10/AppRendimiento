// frontend/app/comida/escanear.tsx
//
// Pantalla de escaner de codigo de barras para nutricion y rendimiento deportivo.
//
// NOTA SOBRE OPEN FOOD FACTS:
// Open Food Facts es una base colaborativa abierta. Muchos productos tienen
// datos incompletos o cargados a medias (por ejemplo, tienen kcal pero no
// tienen proteinas, o viceversa). Por eso:
// 1. energy-kcal_100g es obligatorio. Sin calorias el producto no sirve para tracking.
// 2. Si faltan dos o mas macros de los tres (proteinas, carbos, grasas), el producto
//    se considera no confiable y pasa al estado de no encontrado.
// 3. Si falta exactamente un macro, se muestra en pantalla con la leyenda "sin dato"
//    (nunca como 0 g ficticio) y se advierte al usuario antes de guardar.
// 4. Nombre y marca se conservan siempre para que la carga manual arranque precargada.
//
// NOTA SOBRE QUANTITY Y SERVING_SIZE (PORCIONES AUTOMATICAS):
// En Open Food Facts, los campos `quantity` (tamano del envase) y `serving_size`
// (porcion sugerida) son texto libre y completamente opcionales. Cualquier
// usuario de la comunidad puede haber escrito "2.5 L", "500 ml", "180 g",
// "1 pote (190 g)", "250 cc", "6 x 330 ml" o dejarlos vacios.
// Por eso el parseo es defensivo:
// - Si hay serving_size parseable, esa es la predeterminada.
// - Si hay quantity y es bebida, se generan fracciones utiles (1 vaso 250 g,
//   medio litro 500 g, envase entero). Nadie toma 2,5 L de una vez. SOLO
//   bebidas: una bolsa de arroz de 1 kg no ofrece vasos.
// - Si el envase es chico (<= 500 g), se ofrece el envase entero como predeterminada.
// - Si no hay datos parseables, cae en 100 g como predeterminada.
// - Al guardar con guardarAlimento (UPSERT por codigo de barras), esas porciones
//   quedan persistidas en la columna porciones para siempre.
//
// NOTA SOBRE PRODUCTOS QUE SE COCINAN (fideos, arroz, legumbres secas):
// Los valores de Open Food Facts son del producto como se vende, o sea SECO.
// Con categories_tags se detecta si se cocina (src/lib/coccion.ts): en ese caso
// el alimento queda con estado_base 'crudo' y un factor por categoria, las
// porciones pasan a ser "1 porcion (80 g seco) / medio paquete / paquete
// entero", y aparece el selector de seco o cocido.
// Los productos guardados antes de esto se revisan una sola vez, la proxima vez
// que se escanean (categorias_revisadas). Si la red falla queda en 0 y se
// reintenta en el siguiente escaneo. Nunca bloquea la pantalla.
//
// La lectura de Open Food Facts esta en src/features/escaneo/ y el resultado
// (el bottom sheet) en features/escaneo/components/ResultadoCodigo.tsx.
//
// TODO: Integrar expo-camera con escaneo real en vivo.
// Requiere development build (no disponible directamente en Expo Go estandar).
// Mientras tanto, la zona superior queda simulada y la pantalla se prueba con
// el ingreso manual por teclado (icono en el header).

import { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Dimensions } from 'react-native';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { colors, spacing, radius, fontSize, fontWeight, lineHeight, shadow } from '@/ui/theme';
import type { TipoComida } from '@/db/schema';
import { consultarCodigo, revisarCategorias } from '@/features/escaneo/consultarCodigo';
import type { ProductoEscaneado, RescateProducto } from '@/features/escaneo/openFoodFacts';
import { ModalCodigoManual, ResultadoCodigo } from '@/features/escaneo/components/ResultadoCodigo';
import type { EstadoConsulta } from '@/features/escaneo/components/ResultadoCodigo';

const VERSION_APP = Constants.expoConfig?.version ?? '';

const TIPOS_COMIDA: TipoComida[] = ['desayuno', 'almuerzo', 'merienda', 'cena', 'snack'];

function tipoPorHora(): TipoComida {
  const h = new Date().getHours();
  if (h < 11) return 'desayuno';
  if (h < 15) return 'almuerzo';
  if (h < 19) return 'merienda';
  return 'cena';
}

function capitalizar(t: string): string {
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export default function PantallaEscanear() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [linterna, setLinterna] = useState(false);
  const [comida, setComida] = useState<TipoComida>(tipoPorHora);
  const [menuComidaVisible, setMenuComidaVisible] = useState(false);

  const [consulta, setConsulta] = useState<EstadoConsulta>('reposo');
  const [codigo, setCodigo] = useState('');
  const [producto, setProducto] = useState<ProductoEscaneado | null>(null);
  const [rescate, setRescate] = useState<RescateProducto>({ nombre: '', marca: null });
  const [modalCodigoManual, setModalCodigoManual] = useState(false);

  const consultar = async (crudo: string) => {
    const cod = crudo.trim();
    if (!cod) return;
    setCodigo(cod);
    setConsulta('cargando');
    setProducto(null);
    setRescate({ nombre: '', marca: null });

    const r = await consultarCodigo(cod, VERSION_APP);
    if (r.tipo === 'detectado') {
      setProducto(r.producto);
      setConsulta('detectado');
      // Guardado antes de que existiera la coccion: se revisa una sola vez,
      // en segundo plano.
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

  // A /comida/nueva con el codigo precargado: queda guardado con el alimento
  // y la proxima vez se encuentra.
  const irACargaManual = () => {
    router.push({
      pathname: '/comida/nueva',
      params: {
        busqueda: producto?.nombre || rescate.nombre || '',
        codigo,
        marca: producto?.marca || rescate.marca || '',
      },
    });
  };

  return (
    <View style={estilos.contenedorTotal}>
      {/* ------------------------------------------------------------- */}
      {/* 1. ZONA DE CAMARA (Mitad superior) */}
      {/* ------------------------------------------------------------- */}
      <View style={estilos.zonaCamara}>
        {/* Fondo oscuro simulado de camara */}
        <View style={estilos.camaraFondo}>
          <View style={[estilos.linternaEfecto, linterna && estilos.linternaEncendida]} />
        </View>

        {/* Header flotante respetando safe area */}
        <View style={[estilos.headerFlotante, { paddingTop: Math.max(insets.top, 16) }]}>
          {/* Boton circular de cerrar en pastilla translucida */}
          <Pressable
            style={({ pressed }) => [estilos.botonTranslucido, pressed && estilos.botonTranslucidoPresionado]}
            onPress={() => router.back()}
            accessibilityLabel="Cerrar escaner"
          >
            <Ionicons name="close" size={22} color={colors.textOnAction} />
          </Pressable>

          {/* Selector de comida activa al centro */}
          <View>
            <Pressable
              style={({ pressed }) => [estilos.pastillaComida, pressed && estilos.botonTranslucidoPresionado]}
              onPress={() => setMenuComidaVisible((v) => !v)}
            >
              <Text style={estilos.pastillaComidaTexto}>{capitalizar(comida)}</Text>
              <Ionicons name="chevron-down" size={14} color={colors.textOnAction} style={{ marginLeft: 4 }} />
            </Pressable>

            {menuComidaVisible && (
              <View style={estilos.dropdownMenu}>
                {TIPOS_COMIDA.map((t) => (
                  <Pressable
                    key={t}
                    style={[estilos.dropdownItem, comida === t && estilos.dropdownItemActivo]}
                    onPress={() => {
                      setComida(t);
                      setMenuComidaVisible(false);
                    }}
                  >
                    <Text style={[estilos.dropdownTexto, comida === t && estilos.dropdownTextoActivo]}>
                      {capitalizar(t)} {comida === t ? '✓' : ''}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>

          {/* Acciones de la derecha: Linterna y Teclado para cargar codigo a mano */}
          <View style={estilos.accionesDerecha}>
            <Pressable
              style={({ pressed }) => [
                estilos.botonTranslucido,
                linterna && estilos.botonLinternaActivo,
                pressed && estilos.botonTranslucidoPresionado,
              ]}
              onPress={() => setLinterna((v) => !v)}
              accessibilityLabel="Alternar linterna"
            >
              <Ionicons
                name={linterna ? 'flash' : 'flash-outline'}
                size={20}
                color={linterna ? colors.textPrimary : colors.textOnAction}
              />
            </Pressable>

            <Pressable
              style={({ pressed }) => [estilos.botonTranslucido, pressed && estilos.botonTranslucidoPresionado]}
              onPress={() => {
                setModalCodigoManual(true);
              }}
              accessibilityLabel="Ingresar codigo de barras por teclado"
            >
              <Ionicons name="keypad-outline" size={20} color={colors.textOnAction} />
            </Pressable>
          </View>
        </View>

        {/* Visor central: guias y badge usan scannerHud (ambar/crema), NO colors.carbs */}
        <View style={estilos.contenedorVisor}>
          <View style={estilos.marcoVisor}>
            {/* Esquinas guia usando scannerHud */}
            <View style={[estilos.guiaEsquina, estilos.guiaArribaIzq]} />
            <View style={[estilos.guiaEsquina, estilos.guiaArribaDer]} />
            <View style={[estilos.guiaEsquina, estilos.guiaAbajoIzq]} />
            <View style={[estilos.guiaEsquina, estilos.guiaAbajoDer]} />

            {/* Barras decorativas simuladas */}
            <View style={estilos.simulacionBarras}>
              <View style={[estilos.barra, { width: 3 }]} />
              <View style={[estilos.barra, { width: 1.5 }]} />
              <View style={[estilos.barra, { width: 4 }]} />
              <View style={[estilos.barra, { width: 2 }]} />
              <View style={[estilos.barra, { width: 5 }]} />
              <View style={[estilos.barra, { width: 2 }]} />
              <View style={[estilos.barra, { width: 3 }]} />
            </View>

            {/* Laser animado con scannerHud */}
            {consulta === 'cargando' && <View style={estilos.laserEscaneo} />}

            {/* Badge de detectado con scannerHud */}
            {consulta === 'detectado' && producto && (
              <View style={estilos.badgeDetectado}>
                <Ionicons name="checkmark-circle" size={14} color={colors.textPrimary} />
                <Text style={estilos.badgeDetectadoTexto}>Detectado: {producto.codigo}</Text>
              </View>
            )}
          </View>

          <Text style={estilos.instruccionCamara}>
            {consulta === 'cargando'
              ? 'Consultando Open Food Facts (hasta 10s)...'
              : consulta === 'detectado'
                ? 'Producto identificado con exito'
                : 'Usa el icono de teclado arriba para ingresar un codigo'}
          </Text>
        </View>
      </View>

      <ResultadoCodigo
        consulta={consulta}
        codigo={codigo}
        producto={producto}
        rescate={rescate}
        comida={comida}
        onProductoCambio={setProducto}
        onIngresarCodigo={() => setModalCodigoManual(true)}
        onReintentar={() => consultar(codigo)}
        onCargarAMano={irACargaManual}
        onGuardado={() => router.back()}
      />

      <ModalCodigoManual
        visible={modalCodigoManual}
        valorInicial={consulta === 'reposo' ? '' : codigo}
        onCerrar={() => setModalCodigoManual(false)}
        onConsultar={consultar}
      />
    </View>
  );
}

const { width } = Dimensions.get('window');

const estilos = StyleSheet.create({
  contenedorTotal: {
    flex: 1,
    backgroundColor: colors.camaraFondo,
  },

  // Zona de camara
  zonaCamara: {
    flex: 1,
    position: 'relative',
    justifyContent: 'space-between',
  },
  camaraFondo: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.camaraFondo,
    opacity: 0.95,
  },
  linternaEfecto: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.accentSoft,
    opacity: 0,
  },
  linternaEncendida: {
    opacity: 0.25,
  },
  headerFlotante: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    zIndex: 20,
  },
  botonTranslucido: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.controlOnCamara,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.bordeOnCamara,
  },
  botonTranslucidoPresionado: {
    backgroundColor: colors.controlOnCamaraPressed,
  },
  botonLinternaActivo: {
    backgroundColor: colors.surface,
  },
  pastillaComida: {
    height: 40,
    paddingHorizontal: spacing.md,
    borderRadius: 20,
    backgroundColor: colors.controlOnCamara,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.bordeOnCamara,
  },
  pastillaComidaTexto: {
    color: colors.textOnAction,
    fontSize: fontSize.small,
    fontWeight: fontWeight.bold,
  },
  accionesDerecha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  dropdownMenu: {
    position: 'absolute',
    top: 48,
    left: -20,
    width: 140,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.xs,
    ...shadow.card,
    zIndex: 50,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dropdownItem: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
  },
  dropdownItemActivo: {
    backgroundColor: colors.accentSoft,
  },
  dropdownTexto: {
    fontSize: fontSize.small,
    color: colors.textPrimary,
  },
  dropdownTextoActivo: {
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },

  // Visor Central usando scannerHud (ambar)
  contenedorVisor: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xl,
  },
  marcoVisor: {
    width: Math.min(width * 0.72, 270),
    height: 130,
    borderRadius: radius.lg,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  guiaEsquina: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderColor: colors.scannerHud,
  },
  guiaArribaIzq: {
    top: 0,
    left: 0,
    borderTopWidth: 3.5,
    borderLeftWidth: 3.5,
    borderTopLeftRadius: 12,
  },
  guiaArribaDer: {
    top: 0,
    right: 0,
    borderTopWidth: 3.5,
    borderRightWidth: 3.5,
    borderTopRightRadius: 12,
  },
  guiaAbajoIzq: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 3.5,
    borderLeftWidth: 3.5,
    borderBottomLeftRadius: 12,
  },
  guiaAbajoDer: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 3.5,
    borderRightWidth: 3.5,
    borderBottomRightRadius: 12,
  },
  simulacionBarras: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    opacity: 0.35,
  },
  barra: {
    height: 50,
    backgroundColor: colors.textOnAction,
    borderRadius: 2,
  },
  laserEscaneo: {
    position: 'absolute',
    left: 8,
    right: 8,
    height: 2,
    backgroundColor: colors.scannerHud,
  },
  badgeDetectado: {
    position: 'absolute',
    top: -14,
    backgroundColor: colors.scannerHud,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  badgeDetectadoTexto: {
    fontSize: fontSize.caption,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  instruccionCamara: {
    color: colors.onFaseMedio,
    fontSize: fontSize.caption,
    marginTop: spacing.md,
    textAlign: 'center',
    paddingHorizontal: spacing.lg,
  },
});
