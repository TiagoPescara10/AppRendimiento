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
// - Si hay quantity y es bebida o envase > 500 g, se generan fracciones utiles
//   (1 vaso 250 g, medio litro 500 g, envase entero). Nadie toma 2,5 L de una vez.
// - Si el envase es chico (<= 500 g), se ofrece el envase entero como predeterminada.
// - Si no hay datos parseables, cae en 100 g como predeterminada.
// - Al guardar con guardarAlimento (UPSERT por codigo de barras), esas porciones
//   quedan persistidas en la columna porciones para siempre.
//
// TODO: Integrar expo-camera con escaneo real en vivo.
// Requiere development build (no disponible directamente en Expo Go estandar).
// Mientras tanto, la zona superior queda simulada y la pantalla se prueba con
// el ingreso manual por teclado (icono en el header).

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Image,
  Alert,
  Modal,
  TextInput,
  Dimensions,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { colors, spacing, radius, fontSize, fontWeight, lineHeight, shadow, sizes } from '@/ui/theme';
import type { TipoComida, PorcionTipica, FuenteAlimento } from '@/db/schema';
import { getDb } from '@/db/schema';
import { guardarAlimento, obtenerAlimentoPorCodigoBarras } from '@/db/queries/alimentos';
import {
  TOPE_GRAMOS_MAX,
  parsearCantidadTexto,
  esProbableBebida,
  generarPorcionesAutomaticas,
} from '@/features/comidas/porciones';
import { crearComida, agregarItem } from '@/db/queries/comidas';
import { obtenerPerfilLocal } from '@/db/queries/perfil';
import { randomUUID } from '@/db/sync/uuid';
import { aISOLocal } from '@/lib/fechas';
import { verificarCoherenciaMacros } from '@/lib/validacion';

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

// Estructura normalizada del producto luego de validar Open Food Facts
interface ProductoNormalizado {
  codigo: string;
  nombre: string;
  marca: string | null;
  kcal100g: number;
  proteina100g: number | null;
  carbos100g: number | null;
  grasa100g: number | null;
  fibra100g: number | null;
  macroFaltante: string | null;
  porciones: PorcionTipica[];
  fuente?: FuenteAlimento;
  verificado?: boolean;
}

export default function PantallaEscanear() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // Estados de controles del escaner
  const [linterna, setLinterna] = useState(false);
  const [comida, setComida] = useState<TipoComida>(tipoPorHora);
  const [menuComidaVisible, setMenuComidaVisible] = useState(false);

  // Estados de consulta y resultado:
  // 'reposo' | 'cargando' | 'detectado' | 'no_encontrado' | 'sin_conexion'
  const [estadoConsulta, setEstadoConsulta] = useState<
    'reposo' | 'cargando' | 'detectado' | 'no_encontrado' | 'sin_conexion'
  >('reposo');

  // Codigo actual y datos obtenidos
  const [codigoConsultado, setCodigoConsultado] = useState('');
  const [producto, setProducto] = useState<ProductoNormalizado | null>(null);

  // Datos de rescate si el producto no tiene macros pero si nombre/marca
  const [datosRescate, setDatosRescate] = useState<{ nombre: string; marca: string | null }>({
    nombre: '',
    marca: null,
  });

  // Selector de cantidad en el sheet
  const [gramos, setGramos] = useState<number>(100);
  const [modalEditarGramos, setModalEditarGramos] = useState(false);
  const [textoGramosEdit, setTextoGramosEdit] = useState('100');

  // Modal para escribir el codigo de barras a mano
  const [modalCodigoManual, setModalCodigoManual] = useState(false);
  const [inputCodigoManual, setInputCodigoManual] = useState('');

  // Modal para corregir valores nutricionales segun el envase
  const [modalCorregirVisible, setModalCorregirVisible] = useState(false);
  const [editKcal, setEditKcal] = useState('');
  const [editProt, setEditProt] = useState('');
  const [editCarb, setEditCarb] = useState('');
  const [editGrasa, setEditGrasa] = useState('');

  // Estado de guardado en la base de datos
  const [guardando, setGuardando] = useState(false);

  // -------------------------------------------------------------
  // Consulta real a Open Food Facts con timeout de 10 segundos
  // -------------------------------------------------------------
  const consultarCodigo = async (codigoLimpio: string) => {
    const cod = codigoLimpio.trim();
    if (!cod) return;

    setCodigoConsultado(cod);
    setEstadoConsulta('cargando');
    setProducto(null);

    // 1. Revisar si ya existe en la base local por codigo de barras
    try {
      const existente = await obtenerAlimentoPorCodigoBarras(cod);
      if (existente) {
        const porcionesExistentes =
          existente.porciones && existente.porciones.length > 0
            ? existente.porciones
            : generarPorcionesAutomaticas(existente.nombre);
        const porcionDef =
          porcionesExistentes.find((p) => p.predeterminada) || porcionesExistentes[0];
        const gramosIniciales = porcionDef ? porcionDef.gramos : 100;

        setProducto({
          codigo: existente.codigo_barras || cod,
          nombre: existente.nombre,
          marca: existente.marca,
          kcal100g: existente.kcal_por_100g,
          proteina100g: existente.proteina_g,
          carbos100g: existente.carbohidratos_g,
          grasa100g: existente.grasa_g,
          fibra100g: existente.fibra_g,
          macroFaltante: null,
          porciones: porcionesExistentes,
          fuente: existente.fuente,
          verificado: Boolean(existente.verificado),
        });
        setGramos(gramosIniciales);
        setTextoGramosEdit(String(gramosIniciales));
        setEstadoConsulta('detectado');
        return;
      }
    } catch (errDb) {
      console.warn('Error al consultar SQLite local:', errDb);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      // Se solicitan quantity y serving_size ademas de macros
      const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(cod)}.json?fields=product_name,brands,nutriments,quantity,serving_size`;
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'AppRendimiento - Mobile App',
        },
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        setEstadoConsulta('no_encontrado');
        return;
      }

      const data = await res.json();

      // Caso producto inexistente en la API
      if (!data || data.status !== 1 || !data.product) {
        setDatosRescate({ nombre: '', marca: null });
        setEstadoConsulta('no_encontrado');
        return;
      }

      const prod = data.product;
      const nombre = (prod.product_name || prod.product_name_es || '').trim();
      const marca = prod.brands ? String(prod.brands).trim() : null;
      setDatosRescate({ nombre, marca });

      const nutriments = prod.nutriments || {};

      // energy-kcal_100g obligatorio segun regla de negocio
      const rawKcal = nutriments['energy-kcal_100g'];
      const tieneKcal = typeof rawKcal === 'number' && !Number.isNaN(rawKcal) && rawKcal >= 0;

      if (!tieneKcal) {
        // Sin kcal no sirve para tracking
        setEstadoConsulta('no_encontrado');
        return;
      }

      // Verificacion de los tres macros obligatorios
      const rawProt = nutriments.proteins_100g;
      const rawCarb = nutriments.carbohydrates_100g;
      const rawFat = nutriments.fat_100g;

      const tieneProt = typeof rawProt === 'number' && !Number.isNaN(rawProt);
      const tieneCarb = typeof rawCarb === 'number' && !Number.isNaN(rawCarb);
      const tieneFat = typeof rawFat === 'number' && !Number.isNaN(rawFat);

      const faltantes: string[] = [];
      if (!tieneProt) faltantes.push('Proteina');
      if (!tieneCarb) faltantes.push('Carbohidratos');
      if (!tieneFat) faltantes.push('Grasa');

      // Si faltan dos o mas de los tres, no es confiable: mandar al caso B
      if (faltantes.length >= 2) {
        setEstadoConsulta('no_encontrado');
        return;
      }

      const rawFiber = nutriments.fiber_100g;
      const fibraValida = typeof rawFiber === 'number' && !Number.isNaN(rawFiber) ? rawFiber : null;

      // Generacion automatica de porciones tipicas segun quantity y serving_size
      const porcionesGeneradas = generarPorcionesAutomaticas(
        nombre,
        prod.serving_size,
        prod.quantity
      );
      const esBebida = esProbableBebida(nombre, prod.quantity, prod.serving_size);

      // Persistir inmediatamente en SQLite para que este disponible en todos los caminos
      try {
        await guardarAlimento({
          id: randomUUID(),
          nombre: nombre || 'Producto sin nombre',
          marca,
          codigo_barras: cod,
          kcal_por_100g: Math.round(rawKcal),
          proteina_g: tieneProt ? Math.round(rawProt * 10) / 10 : 0,
          carbohidratos_g: tieneCarb ? Math.round(rawCarb * 10) / 10 : 0,
          grasa_g: tieneFat ? Math.round(rawFat * 10) / 10 : 0,
          fibra_g: fibraValida,
          fuente: 'open_food_facts',
          verificado: false,
          porciones: porcionesGeneradas,
          categoria: esBebida ? 'bebidas' : 'otros',
        });
      } catch (errDb) {
        console.error('Error al precargar alimento escaneado en SQLite:', errDb);
      }

      const prodNorm: ProductoNormalizado = {
        codigo: cod,
        nombre: nombre || 'Producto sin nombre',
        marca,
        kcal100g: Math.round(rawKcal),
        proteina100g: tieneProt ? Math.round(rawProt * 10) / 10 : null,
        carbos100g: tieneCarb ? Math.round(rawCarb * 10) / 10 : null,
        grasa100g: tieneFat ? Math.round(rawFat * 10) / 10 : null,
        fibra100g: fibraValida,
        macroFaltante: faltantes.length === 1 ? faltantes[0] : null,
        porciones: porcionesGeneradas,
      };

      // Establecer como gramos iniciales la porcion predeterminada generada
      const porcionDef = porcionesGeneradas.find((p) => p.predeterminada) || porcionesGeneradas[0];
      const gramosIniciales = porcionDef ? porcionDef.gramos : 100;

      setProducto(prodNorm);
      setGramos(gramosIniciales);
      setTextoGramosEdit(String(gramosIniciales));
      setEstadoConsulta('detectado');
    } catch (err: unknown) {
      clearTimeout(timeoutId);
      // Caso C: sin conexion o tiempo de espera agotado
      setEstadoConsulta('sin_conexion');
    }
  };

  // Ajuste de cantidad con tope de 3000 g
  const ajustarGramos = (delta: number) => {
    setGramos((prev) => Math.max(1, Math.min(TOPE_GRAMOS_MAX, prev + delta * 25)));
  };

  const guardarEdicionGramos = () => {
    const val = parseInt(textoGramosEdit, 10);
    if (!Number.isNaN(val) && val > 0 && val <= TOPE_GRAMOS_MAX) {
      setGramos(val);
      setModalEditarGramos(false);
    } else {
      Alert.alert('Valor invalido', `Ingresa un numero entre 1 y ${TOPE_GRAMOS_MAX} gramos.`);
    }
  };

  // Navegar a /comida/nueva pasando los datos precargados
  const irACargaManual = () => {
    const nombreEnviar = producto?.nombre || datosRescate.nombre || '';
    const marcaEnviar = producto?.marca || datosRescate.marca || '';

    router.push({
      pathname: '/comida/nueva',
      params: {
        busqueda: nombreEnviar,
        codigo: codigoConsultado,
        marca: marcaEnviar,
      },
    });
  };

  // -------------------------------------------------------------
  // Correccion de valores nutricionales segun el envase
  // -------------------------------------------------------------
  const abrirModalCorregir = () => {
    if (!producto) return;
    setEditKcal(String(producto.kcal100g));
    setEditProt(producto.proteina100g !== null ? String(producto.proteina100g) : '');
    setEditCarb(producto.carbos100g !== null ? String(producto.carbos100g) : '');
    setEditGrasa(producto.grasa100g !== null ? String(producto.grasa100g) : '');
    setModalCorregirVisible(true);
  };

  const persistirCorreccion = async (k: number, p: number, c: number, g: number) => {
    if (!producto) return;

    try {
      const esBebida = esProbableBebida(producto.nombre);
      // Guardar en SQLite con fuente 'manual' y verificado en 1
      await guardarAlimento({
        id: randomUUID(),
        nombre: producto.nombre,
        marca: producto.marca,
        codigo_barras: producto.codigo,
        kcal_por_100g: Math.round(k),
        proteina_g: p,
        carbohidratos_g: c,
        grasa_g: g,
        fibra_g: producto.fibra100g,
        fuente: 'manual',
        verificado: true,
        porciones: producto.porciones,
        categoria: esBebida ? 'bebidas' : 'otros',
      });

      // Actualizar estado local del producto
      setProducto({
        ...producto,
        kcal100g: Math.round(k),
        proteina100g: p,
        carbos100g: c,
        grasa100g: g,
        macroFaltante: null,
        fuente: 'manual',
        verificado: true,
      });

      setModalCorregirVisible(false);
      Alert.alert('Datos corregidos', 'Se actualizaron los valores por 100 g y quedaron verificados en tu base local.');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'No se pudo guardar la correccion.';
      Alert.alert('Error', msg);
    }
  };

  const validarYConfirmarCorreccion = () => {
    const k = parseFloat(editKcal.replace(',', '.'));
    if (!Number.isFinite(k) || k < 0 || k > 1000) {
      Alert.alert('Calorias invalidas', 'Ingresa un valor de energia valido entre 0 y 1000 kcal.');
      return;
    }

    const p = parseFloat(editProt.replace(',', '.')) || 0;
    const c = parseFloat(editCarb.replace(',', '.')) || 0;
    const g = parseFloat(editGrasa.replace(',', '.')) || 0;

    if (p < 0 || c < 0 || g < 0 || p > 100 || c > 100 || g > 100) {
      Alert.alert('Macros invalidos', 'Los macronutrientes deben estar entre 0 y 100 g.');
      return;
    }

    // Validacion de coherencia reutilizando verificarCoherenciaMacros (tolerancia 25%)
    const coherencia = verificarCoherenciaMacros(k, p, c, g, 0.25);

    if (!coherencia.esCoherente) {
      Alert.alert(
        'Valores incoherentes',
        `Los macros que cargaste dan unas ${coherencia.kcalCalculadas} kcal, pero pusiste ${coherencia.kcalDeclaradas} kcal.\n\n¿Deseas revisarlos o guardar igual?`,
        [
          { text: 'Revisar', style: 'cancel' },
          { text: 'Guardar igual', onPress: () => persistirCorreccion(k, p, c, g) },
        ]
      );
      return;
    }

    persistirCorreccion(k, p, c, g);
  };

  // -------------------------------------------------------------
  // Guardado real en transaccion SQLite con porciones persistidas
  // -------------------------------------------------------------
  const ejecutarGuardado = async () => {
    if (!producto || guardando) return;
    setGuardando(true);

    try {
      const perfil = await obtenerPerfilLocal();
      if (!perfil) {
        Alert.alert('Error', 'No se encontro el perfil del usuario.');
        setGuardando(false);
        return;
      }

      const esBebida = esProbableBebida(producto.nombre);

      await getDb().withTransactionAsync(async () => {
        // 1. Guardar o actualizar alimento con UPSERT por codigo_barras
        // Guardar las porciones generadas para que ya queden disponibles siempre
        const alimentoGuardado = await guardarAlimento({
          id: randomUUID(),
          nombre: producto.nombre,
          marca: producto.marca,
          codigo_barras: producto.codigo,
          kcal_por_100g: producto.kcal100g,
          proteina_g: producto.proteina100g ?? 0,
          carbohidratos_g: producto.carbos100g ?? 0,
          grasa_g: producto.grasa100g ?? 0,
          fibra_g: producto.fibra100g,
          fuente: producto.fuente || 'open_food_facts',
          verificado: producto.verificado ?? false,
          porciones: producto.porciones,
          categoria: esBebida ? 'bebidas' : 'otros',
        });

        // 2. Crear registro de comida
        const comidaId = randomUUID();
        await crearComida({
          id: comidaId,
          usuario_id: perfil.id,
          tipo: comida,
          fecha_hora: aISOLocal(new Date()),
        });

        // 3. Agregar el item a la comida
        await agregarItem({
          id: randomUUID(),
          comida_id: comidaId,
          alimento_id: alimentoGuardado.id,
          cantidad_g: gramos,
        });
      });

      Alert.alert(
        'Alimento registrado',
        `Se agregaron ${gramos} g de ${producto.nombre} a ${capitalizar(comida)}.`,
        [{ text: 'Listo', onPress: () => router.back() }]
      );
    } catch (e: unknown) {
      const errorMsg = e instanceof Error ? e.message : 'No se pudo guardar.';
      Alert.alert('Error al guardar', errorMsg);
    } finally {
      setGuardando(false);
    }
  };

  const confirmarGuardado = () => {
    if (!producto) return;

    // Si falta un macro, advertir antes de escribir en la base
    if (producto.macroFaltante) {
      Alert.alert(
        'Macro incompleto',
        `Este producto no tiene cargado el dato de ${producto.macroFaltante} en Open Food Facts. No se sumara a tus totales del dia. ¿Deseas agregarlo igual o cargarlo a mano?`,
        [
          { text: 'Cargar a mano', onPress: irACargaManual, style: 'cancel' },
          { text: 'Registrar igual', onPress: ejecutarGuardado },
        ]
      );
      return;
    }

    ejecutarGuardado();
  };

  // Calculos de macros proporcionales a los gramos elegidos
  const factor = gramos / 100;
  const calcKcal = producto ? Math.round(producto.kcal100g * factor) : 0;
  const calcProt = producto && producto.proteina100g !== null ? Math.round(producto.proteina100g * factor * 10) / 10 : null;
  const calcCarb = producto && producto.carbos100g !== null ? Math.round(producto.carbos100g * factor * 10) / 10 : null;
  const calcGrasa = producto && producto.grasa100g !== null ? Math.round(producto.grasa100g * factor * 10) / 10 : null;

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
                setInputCodigoManual(codigoConsultado);
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
            {estadoConsulta === 'cargando' && <View style={estilos.laserEscaneo} />}

            {/* Badge de detectado con scannerHud */}
            {estadoConsulta === 'detectado' && producto && (
              <View style={estilos.badgeDetectado}>
                <Ionicons name="checkmark-circle" size={14} color={colors.textPrimary} />
                <Text style={estilos.badgeDetectadoTexto}>Detectado: {producto.codigo}</Text>
              </View>
            )}
          </View>

          <Text style={estilos.instruccionCamara}>
            {estadoConsulta === 'cargando'
              ? 'Consultando Open Food Facts (hasta 10s)...'
              : estadoConsulta === 'detectado'
                ? 'Producto identificado con exito'
                : 'Usa el icono de teclado arriba para ingresar un codigo'}
          </Text>
        </View>
      </View>

      {/* ------------------------------------------------------------- */}
      {/* 2. BOTTOM SHEET DE RESULTADOS / ESTADOS */}
      {/* ------------------------------------------------------------- */}
      <View style={estilos.bottomSheetContainer}>
        <View style={estilos.sheetHandle} />

        {/* ESTADO 1: CARGANDO */}
        {estadoConsulta === 'cargando' && (
          <View style={estilos.estadoCentrado}>
            <ActivityIndicator size="large" color={colors.action} />
            <Text style={estilos.textoCargando}>Buscando codigo {codigoConsultado}...</Text>
            <Text style={estilos.subtextoCargando}>Consultando datos nutricionales y porciones</Text>
          </View>
        )}

        {/* ESTADO 2: PRODUCTO DETECTADO */}
        {estadoConsulta === 'detectado' && producto && (
          <View style={estilos.sheetContenido}>
            {/* Header del producto */}
            <View style={estilos.productoHeader}>
              <View style={{ flex: 1 }}>
                {producto.marca ? (
                  <Text style={estilos.marcaTexto}>{producto.marca.toUpperCase()}</Text>
                ) : null}
                <Text style={estilos.nombreTexto} numberOfLines={2}>
                  {producto.nombre}
                </Text>
                <Text style={estilos.porcionReferenciaTexto}>
                  Codigo: {producto.codigo}
                </Text>
              </View>
              <Pressable
                onPress={() => {
                  setInputCodigoManual('');
                  setModalCodigoManual(true);
                }}
                style={estilos.botonReintentarMin}
                accessibilityLabel="Buscar otro codigo"
              >
                <Ionicons name="sync-outline" size={18} color={colors.textSecondary} />
              </Pressable>
            </View>

            {/* Cuatro datos nutricionales: kcal + 3 macros con colores fijos en los puntos */}
            <View style={estilos.cuadriculaMacros}>
              {/* Energia / Kcal */}
              <View style={estilos.columnaMacro}>
                <View style={estilos.etiquetaConPunto}>
                  <View style={[estilos.puntoMacro, { backgroundColor: colors.textSecondary }]} />
                  <Text style={estilos.macroLabel}>Energia</Text>
                </View>
                <View style={estilos.filaValor}>
                  <Text style={estilos.macroValor}>{calcKcal}</Text>
                  <Text style={estilos.macroUnidad}>kcal</Text>
                </View>
              </View>

              {/* Proteina: #D4537E */}
              <View style={[estilos.columnaMacro, estilos.bordeSeparador]}>
                <View style={estilos.etiquetaConPunto}>
                  <View style={[estilos.puntoMacro, { backgroundColor: colors.protein }]} />
                  <Text style={estilos.macroLabel}>Prot</Text>
                </View>
                <View style={estilos.filaValor}>
                  <Text style={estilos.macroValor}>
                    {calcProt !== null ? calcProt : '—'}
                  </Text>
                  <Text style={estilos.macroUnidad}>
                    {calcProt !== null ? 'g' : 'sin dato'}
                  </Text>
                </View>
              </View>

              {/* Carbohidratos: #5DCAA5 */}
              <View style={[estilos.columnaMacro, estilos.bordeSeparador]}>
                <View style={estilos.etiquetaConPunto}>
                  <View style={[estilos.puntoMacro, { backgroundColor: colors.carbs }]} />
                  <Text style={estilos.macroLabel}>Carbos</Text>
                </View>
                <View style={estilos.filaValor}>
                  <Text style={estilos.macroValor}>
                    {calcCarb !== null ? calcCarb : '—'}
                  </Text>
                  <Text style={estilos.macroUnidad}>
                    {calcCarb !== null ? 'g' : 'sin dato'}
                  </Text>
                </View>
              </View>

              {/* Grasas: #EF9F27 */}
              <View style={[estilos.columnaMacro, estilos.bordeSeparador]}>
                <View style={estilos.etiquetaConPunto}>
                  <View style={[estilos.puntoMacro, { backgroundColor: colors.fat }]} />
                  <Text style={estilos.macroLabel}>Grasas</Text>
                </View>
                <View style={estilos.filaValor}>
                  <Text style={estilos.macroValor}>
                    {calcGrasa !== null ? calcGrasa : '—'}
                  </Text>
                  <Text style={estilos.macroUnidad}>
                    {calcGrasa !== null ? 'g' : 'sin dato'}
                  </Text>
                </View>
              </View>
            </View>

            {/* Enlace para corregir valores con el envase */}
            <Pressable
              style={estilos.enlaceCorregir}
              onPress={abrirModalCorregir}
              accessibilityLabel="Corregir valores con el envase"
            >
              <Ionicons name="create-outline" size={14} color={colors.action} />
              <Text style={estilos.enlaceCorregirTexto}>
                Los valores no coinciden con el envase
              </Text>
            </Pressable>

            {/* Selector de porciones automaticas (chips horizontales) */}
            {producto.porciones.length > 0 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={estilos.porcionesFila}
              >
                {producto.porciones.map((p) => {
                  const activa = gramos === p.gramos;
                  return (
                    <Pressable
                      key={p.nombre}
                      style={[estilos.chipPorcion, activa && estilos.chipPorcionActiva]}
                      onPress={() => {
                        setGramos(p.gramos);
                        setTextoGramosEdit(String(p.gramos));
                      }}
                    >
                      <Text style={[estilos.chipPorcionTexto, activa && estilos.chipPorcionTextoActiva]}>
                        {p.nombre}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}

            {/* Stepper ergonimico para ajuste fino (tope 3000 g) */}
            <View style={estilos.filaCantidad}>
              <Text style={estilos.cantidadLabel}>Cantidad consumida</Text>

              <View style={estilos.stepperContenedor}>
                <Pressable
                  style={({ pressed }) => [estilos.stepperBoton, pressed && estilos.stepperBotonPresionado]}
                  onPress={() => ajustarGramos(-1)}
                  accessibilityLabel="Disminuir cantidad"
                >
                  <Text style={estilos.stepperSigno}>−</Text>
                </Pressable>

                <Pressable
                  style={estilos.stepperNumeroArea}
                  onPress={() => {
                    setTextoGramosEdit(String(gramos));
                    setModalEditarGramos(true);
                  }}
                  accessibilityLabel="Ingresar gramos exactos"
                >
                  <Text style={estilos.stepperNumero}>{gramos}</Text>
                  <Text style={estilos.stepperUnidad}>gramos</Text>
                </Pressable>

                <Pressable
                  style={({ pressed }) => [estilos.stepperBoton, pressed && estilos.stepperBotonPresionado]}
                  onPress={() => ajustarGramos(1)}
                  accessibilityLabel="Aumentar cantidad"
                >
                  <Text style={estilos.stepperSigno}>+</Text>
                </Pressable>
              </View>
            </View>

            {/* Mensaje del Coach Leon: tono estrictamente informativo */}
            <View style={estilos.cardCoach}>
              <View style={estilos.coachAvatarWrapper}>
                <Image
                  source={require('@/assets/images/leon-avatar.png')}
                  style={estilos.coachAvatarImg}
                  resizeMode="cover"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={estilos.coachTitulo}>COACH LEON • APORTE</Text>
                <Text style={estilos.coachMensaje}>
                  Esta porcion suma {calcKcal} kcal
                  {calcProt !== null ? ` y ${calcProt} g de proteina` : ''} a tu registro de hoy.
                </Text>
              </View>
            </View>

            {/* Boton principal ancho */}
            <Pressable
              style={({ pressed }) => [
                estilos.botonPrincipal,
                guardando && { opacity: 0.7 },
                pressed && estilos.botonPrincipalPresionado,
              ]}
              onPress={confirmarGuardado}
              disabled={guardando}
            >
              {guardando ? (
                <ActivityIndicator color={colors.textOnAction} />
              ) : (
                <>
                  <Ionicons name="add-circle-outline" size={20} color={colors.textOnAction} style={{ marginRight: 6 }} />
                  <Text style={estilos.botonPrincipalTexto}>
                    Agregar a {capitalizar(comida)}
                  </Text>
                </>
              )}
            </Pressable>
          </View>
        )}

        {/* ESTADO 3: CODIGO NO ENCONTRADO O DATOS INSUFICIENTES (CASO B) */}
        {estadoConsulta === 'no_encontrado' && (
          <View style={estilos.sheetContenido}>
            <View style={estilos.alertaSinResultado}>
              <View style={estilos.iconoAlertaWrapper}>
                <Ionicons name="barcode-outline" size={24} color={colors.action} />
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={estilos.alertaTitulo}>Codigo no disponible</Text>
                  {codigoConsultado ? (
                    <View style={estilos.chipCodigo}>
                      <Text style={estilos.chipCodigoTexto}>{codigoConsultado}</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={estilos.alertaBajada}>
                  {datosRescate.nombre
                    ? `Encontramos "${datosRescate.nombre}", pero no tiene los datos nutricionales basicos en Open Food Facts.`
                    : 'Este codigo no esta registrado en Open Food Facts o no tiene informacion nutricional suficiente.'}
                </Text>
              </View>
            </View>

            <View style={estilos.cardCoach}>
              <View style={estilos.coachAvatarWrapper}>
                <Image
                  source={require('@/assets/images/leon-avatar.png')}
                  style={estilos.coachAvatarImg}
                  resizeMode="cover"
                />
              </View>
              <Text style={[estilos.coachMensaje, { flex: 1 }]}>
                Es habitual en productos locales de Argentina. Podes cargarlo a mano con la tabla del envase y queda guardado.
              </Text>
            </View>

            <View style={estilos.filaSalidas}>
              <Pressable
                style={({ pressed }) => [estilos.botonPrincipal, pressed && estilos.botonPrincipalPresionado]}
                onPress={irACargaManual}
              >
                <Ionicons name="create-outline" size={18} color={colors.textOnAction} style={{ marginRight: 6 }} />
                <Text style={estilos.botonPrincipalTexto}>Cargar producto a mano</Text>
              </Pressable>

              <Pressable
                style={({ pressed }) => [estilos.botonSecundario, pressed && estilos.botonSecundarioPresionado]}
                onPress={() => {
                  setInputCodigoManual('');
                  setModalCodigoManual(true);
                }}
              >
                <Ionicons name="keypad-outline" size={18} color={colors.textPrimary} style={{ marginRight: 6 }} />
                <Text style={estilos.botonSecundarioTexto}>Ingresar otro codigo</Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* ESTADO 4: SIN CONEXION (CASO C) */}
        {estadoConsulta === 'sin_conexion' && (
          <View style={estilos.sheetContenido}>
            <View style={estilos.alertaSinResultado}>
              <View style={[estilos.iconoAlertaWrapper, { borderColor: colors.warning }]}>
                <Ionicons name="cloud-offline-outline" size={24} color={colors.warning} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={estilos.alertaTitulo}>Sin conexion a internet</Text>
                <Text style={estilos.alertaBajada}>
                  No pudimos consultar Open Food Facts. Comproba tus datos moviles o Wi-Fi.
                </Text>
              </View>
            </View>

            <View style={estilos.cardCoach}>
              <View style={estilos.coachAvatarWrapper}>
                <Image
                  source={require('@/assets/images/leon-avatar.png')}
                  style={estilos.coachAvatarImg}
                  resizeMode="cover"
                />
              </View>
              <Text style={[estilos.coachMensaje, { flex: 1 }]}>
                La base local de la app funciona offline. Si no tenes señal podes registrarlo a mano directamente.
              </Text>
            </View>

            <View style={estilos.filaSalidas}>
              <Pressable
                style={({ pressed }) => [estilos.botonPrincipal, pressed && estilos.botonPrincipalPresionado]}
                onPress={() => consultarCodigo(codigoConsultado)}
              >
                <Ionicons name="refresh-outline" size={18} color={colors.textOnAction} style={{ marginRight: 6 }} />
                <Text style={estilos.botonPrincipalTexto}>Reintentar consulta</Text>
              </Pressable>

              <Pressable
                style={({ pressed }) => [estilos.botonSecundario, pressed && estilos.botonSecundarioPresionado]}
                onPress={irACargaManual}
              >
                <Ionicons name="create-outline" size={18} color={colors.textPrimary} style={{ marginRight: 6 }} />
                <Text style={estilos.botonSecundarioTexto}>Cargar a mano sin conexion</Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* ESTADO 5: REPOSO (INICIAL) */}
        {estadoConsulta === 'reposo' && (
          <View style={estilos.sheetContenido}>
            <Text style={estilos.alertaTitulo}>Escaner de alimentos</Text>
            <Text style={estilos.alertaBajada}>
              Toca el icono de teclado para ingresar el codigo de barras de cualquier producto argentino o internacional.
            </Text>

            <Pressable
              style={({ pressed }) => [estilos.botonPrincipal, pressed && estilos.botonPrincipalPresionado]}
              onPress={() => setModalCodigoManual(true)}
            >
              <Ionicons name="keypad-outline" size={18} color={colors.textOnAction} style={{ marginRight: 6 }} />
              <Text style={estilos.botonPrincipalTexto}>Ingresar codigo de barras</Text>
            </Pressable>
          </View>
        )}
      </View>

      {/* ------------------------------------------------------------- */}
      {/* 3. MODAL DE INGRESO MANUAL DE CODIGO DE BARRAS */}
      {/* ------------------------------------------------------------- */}
      <Modal visible={modalCodigoManual} transparent animationType="fade">
        <View style={estilos.modalFondo}>
          <View style={estilos.modalCard}>
            <Text style={estilos.modalTitulo}>Ingresar codigo de barras</Text>
            <Text style={estilos.modalSubtitulo}>
              Escribi los digitos que estan debajo de las barras (ej: 779...):
            </Text>

            <View style={estilos.modalInputFila}>
              <TextInput
                style={estilos.modalInput}
                keyboardType="numeric"
                value={inputCodigoManual}
                onChangeText={setInputCodigoManual}
                placeholder="7791234567890"
                placeholderTextColor={colors.textMuted}
                autoFocus
                returnKeyType="search"
                onSubmitEditing={() => {
                  setModalCodigoManual(false);
                  consultarCodigo(inputCodigoManual);
                }}
              />
            </View>

            <View style={estilos.modalBotones}>
              <Pressable
                style={estilos.modalBotonCancelar}
                onPress={() => setModalCodigoManual(false)}
              >
                <Text style={estilos.modalBotonCancelarTexto}>Cancelar</Text>
              </Pressable>

              <Pressable
                style={estilos.modalBotonConfirmar}
                onPress={() => {
                  setModalCodigoManual(false);
                  consultarCodigo(inputCodigoManual);
                }}
              >
                <Text style={estilos.modalBotonConfirmarTexto}>Consultar</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ------------------------------------------------------------- */}
      {/* 4. MODAL PARA EDITAR GRAMOS DIRECTO (TOPE 3000 G) */}
      {/* ------------------------------------------------------------- */}
      <Modal visible={modalEditarGramos} transparent animationType="fade">
        <View style={estilos.modalFondo}>
          <View style={estilos.modalCard}>
            <Text style={estilos.modalTitulo}>Cantidad consumida</Text>
            <Text style={estilos.modalSubtitulo}>Especifica los gramos consumidos (hasta 3000 g):</Text>
            <View style={estilos.modalInputFila}>
              <TextInput
                style={estilos.modalInput}
                keyboardType="numeric"
                value={textoGramosEdit}
                onChangeText={setTextoGramosEdit}
                autoFocus
                selectTextOnFocus
              />
              <Text style={estilos.modalInputUnidad}>g</Text>
            </View>
            <View style={estilos.modalBotones}>
              <Pressable
                style={estilos.modalBotonCancelar}
                onPress={() => setModalEditarGramos(false)}
              >
                <Text style={estilos.modalBotonCancelarTexto}>Cancelar</Text>
              </Pressable>
              <Pressable
                style={estilos.modalBotonConfirmar}
                onPress={guardarEdicionGramos}
              >
                <Text style={estilos.modalBotonConfirmarTexto}>Aplicar</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ------------------------------------------------------------- */}
      {/* 5. MODAL PARA CORREGIR VALORES SEGUN EL ENVASE */}
      {/* ------------------------------------------------------------- */}
      <Modal visible={modalCorregirVisible} transparent animationType="slide">
        <View style={estilos.modalFondo}>
          <View style={estilos.modalCard}>
            <View style={estilos.modalHeaderFila}>
              <View style={{ flex: 1 }}>
                <Text style={estilos.modalTitulo}>Corregir con el envase</Text>
                <Text style={estilos.modalSubtitulo}>
                  Valores nutricionales por 100 g impresos en la etiqueta:
                </Text>
              </View>
              <Pressable
                onPress={() => setModalCorregirVisible(false)}
                hitSlop={8}
              >
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </Pressable>
            </View>

            <View style={estilos.formularioCorregirGrid}>
              <View style={estilos.campoCorregir}>
                <Text style={estilos.campoLabel}>Energia (kcal) *</Text>
                <TextInput
                  style={estilos.campoInput}
                  keyboardType="numeric"
                  value={editKcal}
                  onChangeText={setEditKcal}
                  placeholder="0"
                  placeholderTextColor={colors.textMuted}
                />
              </View>

              <View style={estilos.campoCorregir}>
                <Text style={estilos.campoLabel}>Proteina (g) *</Text>
                <TextInput
                  style={estilos.campoInput}
                  keyboardType="numeric"
                  value={editProt}
                  onChangeText={setEditProt}
                  placeholder="0"
                  placeholderTextColor={colors.textMuted}
                />
              </View>

              <View style={estilos.campoCorregir}>
                <Text style={estilos.campoLabel}>Carbos (g) *</Text>
                <TextInput
                  style={estilos.campoInput}
                  keyboardType="numeric"
                  value={editCarb}
                  onChangeText={setEditCarb}
                  placeholder="0"
                  placeholderTextColor={colors.textMuted}
                />
              </View>

              <View style={estilos.campoCorregir}>
                <Text style={estilos.campoLabel}>Grasas (g) *</Text>
                <TextInput
                  style={estilos.campoInput}
                  keyboardType="numeric"
                  value={editGrasa}
                  onChangeText={setEditGrasa}
                  placeholder="0"
                  placeholderTextColor={colors.textMuted}
                />
              </View>
            </View>

            <Text style={estilos.ayudaCoherencia}>
              Se guardara como producto verificado en tu base local.
            </Text>

            <View style={estilos.modalBotones}>
              <Pressable
                style={estilos.modalBotonCancelar}
                onPress={() => setModalCorregirVisible(false)}
              >
                <Text style={estilos.modalBotonCancelarTexto}>Cancelar</Text>
              </Pressable>

              <Pressable
                style={estilos.modalBotonConfirmar}
                onPress={validarYConfirmarCorreccion}
              >
                <Text style={estilos.modalBotonConfirmarTexto}>Guardar correccion</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
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

  // Bottom Sheet
  bottomSheetContainer: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
    ...shadow.sheet,
  },
  sheetHandle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderStrong,
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  sheetContenido: {
    gap: spacing.md,
  },
  estadoCentrado: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxl,
    gap: spacing.sm,
  },
  textoCargando: {
    fontSize: fontSize.body,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  subtextoCargando: {
    fontSize: fontSize.small,
    color: colors.textSecondary,
  },
  productoHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  marcaTexto: {
    fontSize: fontSize.caption,
    fontWeight: fontWeight.bold,
    color: colors.textSecondary,
    letterSpacing: 0.5,
  },
  nombreTexto: {
    fontSize: fontSize.subtitle,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    marginTop: 2,
  },
  porcionReferenciaTexto: {
    fontSize: fontSize.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  botonReintentarMin: {
    padding: spacing.sm,
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },

  // Cuadricula de 4 datos nutricionales
  cuadriculaMacros: {
    flexDirection: 'row',
    backgroundColor: colors.bg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  columnaMacro: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bordeSeparador: {
    borderLeftWidth: 1,
    borderLeftColor: colors.border,
  },
  etiquetaConPunto: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 2,
  },
  puntoMacro: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  macroLabel: {
    fontSize: 10,
    fontWeight: fontWeight.bold,
    color: colors.textSecondary,
    textTransform: 'uppercase',
  },
  filaValor: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 2,
  },
  macroValor: {
    fontSize: fontSize.body,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  macroUnidad: {
    fontSize: 10,
    color: colors.textSecondary,
  },

  // Porciones automaticas
  porcionesFila: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingVertical: 2,
  },
  chipPorcion: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipPorcionActiva: {
    backgroundColor: colors.surface,
    borderColor: colors.action,
    ...shadow.card,
  },
  chipPorcionTexto: {
    fontSize: fontSize.caption,
    color: colors.textSecondary,
    fontWeight: fontWeight.medium,
  },
  chipPorcionTextoActiva: {
    color: colors.action,
    fontWeight: fontWeight.bold,
  },

  // Selector de cantidad
  filaCantidad: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cantidadLabel: {
    fontSize: fontSize.small,
    fontWeight: fontWeight.medium,
    color: colors.textSecondary,
  },
  stepperContenedor: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 3,
  },
  stepperBoton: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  stepperBotonPresionado: {
    backgroundColor: colors.surfaceAlt,
  },
  stepperSigno: {
    fontSize: fontSize.subtitle,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  stepperNumeroArea: {
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 70,
  },
  stepperNumero: {
    fontSize: fontSize.body,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  stepperUnidad: {
    fontSize: 10,
    color: colors.textSecondary,
  },

  // Card Coach Leon usando avatarFondo y avatarBorde
  cardCoach: {
    backgroundColor: colors.accentSoft,
    borderRadius: radius.lg,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  coachAvatarWrapper: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.avatarFondo,
    borderWidth: 2,
    borderColor: colors.avatarBorde,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  coachAvatarImg: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  coachTitulo: {
    fontSize: 10,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  coachMensaje: {
    fontSize: fontSize.small,
    color: colors.textPrimary,
    lineHeight: lineHeight.small,
  },

  // Botones principales y secundarios
  botonPrincipal: {
    height: sizes.control,
    backgroundColor: colors.action,
    borderRadius: radius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.card,
  },
  botonPrincipalPresionado: {
    backgroundColor: colors.actionPressed,
  },
  botonPrincipalTexto: {
    color: colors.textOnAction,
    fontSize: fontSize.body,
    fontWeight: fontWeight.bold,
  },
  alertaSinResultado: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    paddingVertical: spacing.xs,
  },
  iconoAlertaWrapper: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertaTitulo: {
    fontSize: fontSize.subtitle,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  chipCodigo: {
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  chipCodigoTexto: {
    fontSize: 10,
    fontFamily: 'monospace',
    color: colors.textSecondary,
  },
  alertaBajada: {
    fontSize: fontSize.small,
    color: colors.textSecondary,
    lineHeight: lineHeight.small,
    marginTop: 2,
  },
  filaSalidas: {
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  botonSecundario: {
    height: sizes.control,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  botonSecundarioPresionado: {
    backgroundColor: colors.bg,
  },
  botonSecundarioTexto: {
    color: colors.textPrimary,
    fontSize: fontSize.body,
    fontWeight: fontWeight.bold,
  },

  // Modales
  modalFondo: {
    flex: 1,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  modalCard: {
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.xl,
    ...shadow.sheet,
  },
  modalTitulo: {
    fontSize: fontSize.subtitle,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  modalSubtitulo: {
    fontSize: fontSize.small,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  },
  modalInputFila: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    height: sizes.control,
    marginBottom: spacing.xl,
  },
  modalInput: {
    flex: 1,
    fontSize: fontSize.body,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  modalInputUnidad: {
    fontSize: fontSize.body,
    color: colors.textSecondary,
    fontWeight: fontWeight.bold,
  },
  modalBotones: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  modalBotonCancelar: {
    flex: 1,
    height: sizes.controlSmall,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalBotonCancelarTexto: {
    color: colors.textSecondary,
    fontWeight: fontWeight.medium,
  },
  modalBotonConfirmar: {
    flex: 1,
    height: sizes.controlSmall,
    backgroundColor: colors.action,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
  },
  modalBotonConfirmarTexto: {
    color: colors.textOnAction,
    fontWeight: fontWeight.bold,
  },

  // Correccion de datos con el envase
  enlaceCorregir: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: spacing.xs,
  },
  enlaceCorregirTexto: {
    fontSize: fontSize.caption,
    color: colors.action,
    fontWeight: fontWeight.medium,
    textDecorationLine: 'underline',
  },
  modalHeaderFila: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  formularioCorregirGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  campoCorregir: {
    width: '47%',
    gap: 4,
  },
  campoLabel: {
    fontSize: fontSize.caption,
    fontWeight: fontWeight.bold,
    color: colors.textSecondary,
  },
  campoInput: {
    height: sizes.controlSmall,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    fontSize: fontSize.body,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  ayudaCoherencia: {
    fontSize: fontSize.caption,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
});
