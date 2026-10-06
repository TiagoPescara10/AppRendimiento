// src/features/escaneo/components/ResultadoCodigo.tsx
//
// El resultado de escanear un codigo de barras: el bottom sheet con el
// producto (macros con sus colores fijos, porciones, seco o cocido, coach y
// "Agregar a ..."), "Codigo no disponible" y "Sin conexion", con sus modales
// de gramos y de correccion con el envase. Tambien el modal para escribir el
// codigo a mano.
//
// Salio de app/comida/escanear.tsx tal cual: la pantalla que lo usa decide de
// donde sale el codigo (la camara o el teclado) y que pasa despues.

import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Image,
  Alert,
  Modal,
  TextInput,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, spacing, radius, fontSize, fontWeight, lineHeight, shadow, sizes } from '@/ui/theme';
import type { TipoComida, EstadoCoccion } from '@/db/schema';
import { getDb } from '@/db/schema';
import { guardarAlimento } from '@/db/queries/alimentos';
import { TOPE_GRAMOS_MAX, esProbableBebida } from '@/features/comidas/porciones';
import { admiteCoccion, convertirAEstadoBase, opcionesCoccion, textoEquivalencia } from '@/lib/coccion';
import { crearComida, agregarItem } from '@/db/queries/comidas';
import { obtenerPerfilLocal } from '@/db/queries/perfil';
import { randomUUID } from '@/db/sync/uuid';
import { aISOLocal } from '@/lib/fechas';
import { verificarCoherenciaMacros } from '@/lib/validacion';
import { gramosPredeterminados } from '../openFoodFacts';
import type { ProductoEscaneado, RescateProducto } from '../openFoodFacts';

export type EstadoConsulta = 'reposo' | 'cargando' | 'detectado' | 'no_encontrado' | 'sin_conexion';

function capitalizar(t: string): string {
  return t.charAt(0).toUpperCase() + t.slice(1);
}

interface Props {
  consulta: EstadoConsulta;
  codigo: string;
  producto: ProductoEscaneado | null;
  rescate: RescateProducto;
  /** La comida a la que se agrega. */
  comida: TipoComida;
  /** El producto cambio (correccion con el envase o revision de categorias). */
  onProductoCambio: (p: ProductoEscaneado) => void;
  /** Escribir un codigo con el teclado. */
  onIngresarCodigo: () => void;
  onReintentar: () => void;
  onCargarAMano: () => void;
  /** Despues de "Listo" en el aviso de guardado. */
  onGuardado: () => void;
  /** Si viene, el sheet lleva una X: en la camara, para volver a escanear. */
  onCerrar?: () => void;
  style?: StyleProp<ViewStyle>;
}

export function ResultadoCodigo({
  consulta,
  codigo,
  producto,
  rescate,
  comida,
  onProductoCambio,
  onIngresarCodigo,
  onReintentar,
  onCargarAMano,
  onGuardado,
  onCerrar,
  style,
}: Props) {
  // Selector de cantidad en el sheet
  const [gramos, setGramos] = useState<number>(100);
  const [modalEditarGramos, setModalEditarGramos] = useState(false);
  const [textoGramosEdit, setTextoGramosEdit] = useState('100');
  // En que estado peso el usuario. `gramos` esta en ESTE estado; lo que se
  // guarda en cantidad_g se convierte al estado base del producto.
  const [estado, setEstado] = useState<EstadoCoccion>('crudo');

  // Modal para corregir valores nutricionales segun el envase
  const [modalCorregirVisible, setModalCorregirVisible] = useState(false);
  const [editKcal, setEditKcal] = useState('');
  const [editProt, setEditProt] = useState('');
  const [editCarb, setEditCarb] = useState('');
  const [editGrasa, setEditGrasa] = useState('');

  const [guardando, setGuardando] = useState(false);

  // Producto nuevo: la cantidad arranca en su porcion predeterminada y en su
  // estado base.
  const predeterminada = useRef(100);
  useEffect(() => {
    if (!producto) return;
    const g = gramosPredeterminados(producto.porciones);
    predeterminada.current = g;
    setGramos(g);
    setTextoGramosEdit(String(g));
    setEstado(producto.coccion?.estado_base ?? 'crudo');
    // Solo cuando cambia el producto, no cuando se corrigen sus valores.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [producto?.codigo]);

  // La revision de categorias puede descubrir que se cocina: pasan a las
  // porciones de paquete, y si los gramos seguian en la predeterminada vieja,
  // a la nueva.
  const teniaCoccion = useRef(false);
  useEffect(() => {
    const tiene = Boolean(producto?.coccion);
    if (producto && tiene && !teniaCoccion.current) {
      const nueva = gramosPredeterminados(producto.porciones);
      setEstado('crudo');
      setGramos((g) => (g === predeterminada.current ? nueva : g));
      predeterminada.current = nueva;
    }
    teniaCoccion.current = tiene;
  }, [producto]);

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
      const esBebida = !producto.coccion && esProbableBebida(producto.nombre);
      // Guardar en SQLite con fuente 'manual' y verificado en 1. Sin `coccion`:
      // corregir los macros no cambia si el producto se cocina, y asi no se
      // pisa lo que haya completado la revision de categorias.
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

      // Actualizar el producto que se esta viendo
      onProductoCambio({
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

      const esBebida = !producto.coccion && esProbableBebida(producto.nombre);

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

        // 3. Agregar el item a la comida. cantidad_g va en el estado base del
        // producto (seco); si se peso cocido, lo pesado queda aparte.
        await agregarItem({
          id: randomUUID(),
          comida_id: comidaId,
          alimento_id: alimentoGuardado.id,
          cantidad_g: gramosBase,
          carga: enOtroEstado ? { estado_carga: estado, cantidad_ingresada_g: gramos } : null,
        });
      });

      Alert.alert(
        'Alimento registrado',
        `Se agregaron ${gramos} g${enOtroEstado ? ' cocidos' : ''} de ${producto.nombre} a ${capitalizar(comida)}.`,
        [{ text: 'Listo', onPress: onGuardado }]
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
          { text: 'Cargar a mano', onPress: onCargarAMano, style: 'cancel' },
          { text: 'Registrar igual', onPress: ejecutarGuardado },
        ]
      );
      return;
    }

    ejecutarGuardado();
  };

  // Crudo/cocido. `gramos` esta en el estado que eligio el usuario; las
  // cuentas y lo que se guarda van en el estado base del producto.
  const baseCoccion = producto?.coccion?.estado_base ?? null;
  const factorCoccion = producto?.coccion?.factor_coccion ?? null;
  const conSelector = admiteCoccion(baseCoccion, factorCoccion);
  const enOtroEstado = conSelector && estado !== baseCoccion;
  const gramosBase = Math.round(convertirAEstadoBase(gramos, estado, baseCoccion, factorCoccion));
  const equivalencia =
    enOtroEstado && producto
      ? textoEquivalencia(gramos, estado, baseCoccion, factorCoccion, producto.kcal100g)
      : null;

  // Calculos de macros proporcionales a los gramos elegidos
  const factor = gramosBase / 100;
  const calcKcal = producto ? Math.round(producto.kcal100g * factor) : 0;
  const calcProt = producto && producto.proteina100g !== null ? Math.round(producto.proteina100g * factor * 10) / 10 : null;
  const calcCarb = producto && producto.carbos100g !== null ? Math.round(producto.carbos100g * factor * 10) / 10 : null;
  const calcGrasa = producto && producto.grasa100g !== null ? Math.round(producto.grasa100g * factor * 10) / 10 : null;
  return (
    <>
        <View style={[estilos.bottomSheetContainer, style]}>
          <View style={estilos.sheetHandle} />
          {onCerrar && consulta !== 'cargando' && (
            <Pressable
              onPress={onCerrar}
              style={estilos.botonCerrarSheet}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Cerrar y escanear otro"
            >
              <Ionicons name="close" size={20} color={colors.textSecondary} />
            </Pressable>
          )}

          {/* ESTADO 1: CARGANDO */}
          {consulta === 'cargando' && (
            <View style={estilos.estadoCentrado}>
              <ActivityIndicator size="large" color={colors.action} />
              <Text style={estilos.textoCargando}>Buscando codigo {codigo}...</Text>
              <Text style={estilos.subtextoCargando}>Consultando datos nutricionales y porciones</Text>
            </View>
          )}

          {/* ESTADO 2: PRODUCTO DETECTADO */}
          {consulta === 'detectado' && producto && (
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
                    onIngresarCodigo();
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

              {/* Seco o cocido, solo para productos que se cocinan */}
              {conSelector && (
                <View style={estilos.selectorCoccion}>
                  {opcionesCoccion(baseCoccion).map((o) => {
                    const activo = o.estado === estado;
                    return (
                      <Pressable
                        key={o.estado}
                        style={[estilos.selectorOpcion, activo && estilos.selectorOpcionActiva]}
                        onPress={() => setEstado(o.estado)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: activo }}
                      >
                        <Text style={[estilos.selectorTexto, activo && estilos.selectorTextoActivo]}>
                          {o.etiqueta}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}

              {/* Selector de porciones automaticas (chips horizontales). En el
                  otro estado no aplican: son porciones del paquete, en seco. */}
              {!enOtroEstado && producto.porciones.length > 0 && (
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
                    <Text style={estilos.stepperUnidad}>{enOtroEstado ? 'g cocidos' : 'gramos'}</Text>
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

              {equivalencia && <Text style={estilos.equivalenciaTexto}>{equivalencia}</Text>}

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
          {consulta === 'no_encontrado' && (
            <View style={estilos.sheetContenido}>
              <View style={estilos.alertaSinResultado}>
                <View style={estilos.iconoAlertaWrapper}>
                  <Ionicons name="barcode-outline" size={24} color={colors.action} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={estilos.alertaTitulo}>Codigo no disponible</Text>
                    {codigo ? (
                      <View style={estilos.chipCodigo}>
                        <Text style={estilos.chipCodigoTexto}>{codigo}</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={estilos.alertaBajada}>
                    {rescate.nombre
                      ? `Encontramos "${rescate.nombre}", pero no tiene los datos nutricionales basicos en Open Food Facts.`
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
                  onPress={onCargarAMano}
                >
                  <Ionicons name="create-outline" size={18} color={colors.textOnAction} style={{ marginRight: 6 }} />
                  <Text style={estilos.botonPrincipalTexto}>Cargar producto a mano</Text>
                </Pressable>

                <Pressable
                  style={({ pressed }) => [estilos.botonSecundario, pressed && estilos.botonSecundarioPresionado]}
                  onPress={() => {
                    onIngresarCodigo();
                  }}
                >
                  <Ionicons name="keypad-outline" size={18} color={colors.textPrimary} style={{ marginRight: 6 }} />
                  <Text style={estilos.botonSecundarioTexto}>Ingresar otro codigo</Text>
                </Pressable>
              </View>
            </View>
          )}

          {/* ESTADO 4: SIN CONEXION (CASO C) */}
          {consulta === 'sin_conexion' && (
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
                  onPress={() => onReintentar()}
                >
                  <Ionicons name="refresh-outline" size={18} color={colors.textOnAction} style={{ marginRight: 6 }} />
                  <Text style={estilos.botonPrincipalTexto}>Reintentar consulta</Text>
                </Pressable>

                <Pressable
                  style={({ pressed }) => [estilos.botonSecundario, pressed && estilos.botonSecundarioPresionado]}
                  onPress={onCargarAMano}
                >
                  <Ionicons name="create-outline" size={18} color={colors.textPrimary} style={{ marginRight: 6 }} />
                  <Text style={estilos.botonSecundarioTexto}>Cargar a mano sin conexion</Text>
                </Pressable>
              </View>
            </View>
          )}

          {/* ESTADO 5: REPOSO (INICIAL) */}
          {consulta === 'reposo' && (
            <View style={estilos.sheetContenido}>
              <Text style={estilos.alertaTitulo}>Escaner de alimentos</Text>
              <Text style={estilos.alertaBajada}>
                Toca el icono de teclado para ingresar el codigo de barras de cualquier producto argentino o internacional.
              </Text>

              <Pressable
                style={({ pressed }) => [estilos.botonPrincipal, pressed && estilos.botonPrincipalPresionado]}
                onPress={() => onIngresarCodigo()}
              >
                <Ionicons name="keypad-outline" size={18} color={colors.textOnAction} style={{ marginRight: 6 }} />
                <Text style={estilos.botonPrincipalTexto}>Ingresar codigo de barras</Text>
              </Pressable>
            </View>
          )}
        </View>

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
    </>
  );
}

/** Escribir el codigo de barras a mano: con el codigo gastado o sin camara. */
export function ModalCodigoManual({
  visible,
  valorInicial = '',
  onCerrar,
  onConsultar,
}: {
  visible: boolean;
  valorInicial?: string;
  onCerrar: () => void;
  onConsultar: (codigo: string) => void;
}) {
  const [texto, setTexto] = useState(valorInicial);
  useEffect(() => {
    if (visible) setTexto(valorInicial);
  }, [visible, valorInicial]);

  const consultar = () => {
    onCerrar();
    if (texto.trim()) onConsultar(texto.trim());
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
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
              value={texto}
              onChangeText={setTexto}
              placeholder="7791234567890"
              placeholderTextColor={colors.textMuted}
              autoFocus
              returnKeyType="search"
              onSubmitEditing={() => {
                consultar();
              }}
            />
          </View>

          <View style={estilos.modalBotones}>
            <Pressable
              style={estilos.modalBotonCancelar}
              onPress={onCerrar}
            >
              <Text style={estilos.modalBotonCancelarTexto}>Cancelar</Text>
            </Pressable>

            <Pressable
              style={estilos.modalBotonConfirmar}
              onPress={() => {
                consultar();
              }}
            >
              <Text style={estilos.modalBotonConfirmarTexto}>Consultar</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const estilos = StyleSheet.create({
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
  botonCerrarSheet: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.lg,
    zIndex: 10,
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
  selectorCoccion: {
    flexDirection: 'row',
    padding: spacing.xs,
    gap: spacing.xs,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    marginBottom: spacing.sm,
  },
  selectorOpcion: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
  },
  selectorOpcionActiva: { backgroundColor: colors.surface, ...shadow.card },
  selectorTexto: { fontSize: fontSize.small, lineHeight: lineHeight.small, color: colors.textSecondary },
  selectorTextoActivo: { color: colors.textPrimary, fontWeight: fontWeight.medium },
  equivalenciaTexto: {
    fontSize: fontSize.caption,
    lineHeight: lineHeight.caption,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.xs,
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
