// app/comida/foto.tsx
//
// Registrar comida con una foto. Llega desde Registrar comida con la foto ya
// sacada (o elegida de la galeria) y hace tres cosas:
//
//   1. Achica la foto y la manda a analizar (features/foto/api.ts). La foto
//      no se guarda: la funcion la analiza y la descarta.
//   2. Empareja lo que vio el modelo con el catalogo local
//      (features/foto/emparejar.ts): de ahi salen las kcal y los macros.
//   3. Muestra la lista para confirmar. Nada se escribe hasta tocar
//      "Agregar a ...", y ahi va todo en una sola transaccion. La foto
//      achicada se guarda SOLO en el celular (features/foto/archivo.ts).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Alert,
  Modal,
  Image,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { Pantalla } from '@/ui/Pantalla';
import { Boton } from '@/ui/Boton';
import { Input } from '@/ui/Input';
import { colors, spacing, radius, fontSize, fontWeight, lineHeight, shadow, sizes } from '@/ui/theme';
import { SheetPorciones } from '@/features/comidas/components/SheetPorciones';
import type { DatosSheet } from '@/features/comidas/components/SheetPorciones';

import { buscarAlimentosPorNombre, listarAlimentosParaEmparejar } from '@/db/queries/alimentos';
import type { Alimento } from '@/db/queries/alimentos';
import { crearComidaConItems } from '@/db/queries/comidas';
import type { CargaCoccion } from '@/db/queries/comidas';
import { obtenerPerfilLocal } from '@/db/queries/perfil';
import type { TipoComida } from '@/db/schema';
import { randomUUID } from '@/db/sync/uuid';
import { aISOLocal } from '@/lib/fechas';

import { analizarFoto, prepararFoto } from '@/features/foto/api';
import { borrarFotoComida, guardarFotoComida } from '@/features/foto/archivo';
import { guardarComidaConFoto } from '@/features/foto/guardar';
import { AnalizandoFoto } from '@/features/foto/components/AnalizandoFoto';
import { aplicarAlimento, emparejar } from '@/features/foto/emparejar';
import type { ItemEmparejado } from '@/features/foto/emparejar';
import { MENSAJE_ERROR_FOTO } from '@/features/foto/respuesta';
import type { ErrorFoto } from '@/features/foto/respuesta';

const TIPOS: TipoComida[] = ['desayuno', 'almuerzo', 'merienda', 'cena', 'snack'];

type Fase =
  | { tipo: 'analizando' }
  | { tipo: 'error'; error: ErrorFoto }
  | { tipo: 'vacio' }
  | { tipo: 'confirmar' };

/** Un item de la lista. `clave` es estable aunque se cambie el alimento. */
type Fila = ItemEmparejado<Alimento> & {
  clave: string;
  /** Lo que eligio en el sheet ("2 × 1 milanesa"). null = la estimacion de la foto. */
  porcion: string | null;
  /** Si el usuario toco los gramos o el alimento. Va a editado_por_usuario. */
  editada: boolean;
};

function kcalDe(alimento: Alimento, gramos: number): number {
  return Math.round((alimento.kcal_por_100g * gramos) / 100);
}

/** Lo que se muestra como cantidad: lo que se peso, no los gramos convertidos. */
function textoCantidad(f: Fila): string {
  if (f.porcion) return f.carga ? f.porcion : `${f.porcion} · ${Math.round(f.cantidad_g)} g`;
  if (f.carga) return `${f.carga.cantidad_ingresada_g} g ${f.carga.estado_carga}`;
  return `${Math.round(f.cantidad_g)} g`;
}

/** Con estos errores reintentar no sirve: se ofrece solo cargar a mano. */
const SIN_REINTENTO: ErrorFoto[] = ['limite_semanal', 'limite_global', 'no_configurado'];

export default function FotoComida() {
  const router = useRouter();
  const params = useLocalSearchParams<{ uri?: string; ancho?: string; alto?: string; tipo?: string }>();
  const tipo: TipoComida = TIPOS.includes(params.tipo as TipoComida)
    ? (params.tipo as TipoComida)
    : 'almuerzo';

  const [fase, setFase] = useState<Fase>({ tipo: 'analizando' });
  const [filas, setFilas] = useState<Fila[]>([]);
  const [guardando, setGuardando] = useState(false);
  const guardandoRef = useRef(false);

  // Sheet de gramos (el mismo del resto de la app) y modal de "Cambiar".
  const [sheet, setSheet] = useState<string | null>(null);
  const [cambiando, setCambiando] = useState<string | null>(null);

  // La foto achicada (la que se mando) es la que se guarda con la comida.
  const [fotoAchicada, setFotoAchicada] = useState<string | null>(null);
  const cancelar = useRef<AbortController | null>(null);

  const analizar = useCallback(async (vivo: () => boolean) => {
    setFase({ tipo: 'analizando' });
    cancelar.current?.abort();
    const control = new AbortController();
    cancelar.current = control;
    try {
      if (!params.uri) {
        setFase({ tipo: 'error', error: 'fallo' });
        return;
      }
      const foto = await prepararFoto(params.uri, Number(params.ancho) || 0, Number(params.alto) || 0);
      if (!vivo() || control.signal.aborted) return;
      setFotoAchicada(foto.uri);
      const r = await analizarFoto(foto.base64, control.signal);
      // Cancelado: la pantalla ya se fue con router.back().
      if (!vivo() || control.signal.aborted) return;
      if (!r.ok) {
        setFase({ tipo: 'error', error: r.error });
        return;
      }
      if (r.respuesta.items.length === 0) {
        setFase({ tipo: 'vacio' });
        return;
      }
      const catalogo = await listarAlimentosParaEmparejar();
      if (!vivo()) return;
      setFilas(
        emparejar(r.respuesta.items, catalogo).map((e, i) => ({
          ...e,
          clave: `f${i}`,
          porcion: null,
          editada: false,
        })),
      );
      setFase({ tipo: 'confirmar' });
    } catch (e) {
      console.error('Error al analizar la foto:', e);
      if (vivo()) setFase({ tipo: 'error', error: 'fallo' });
    }
  }, [params.uri, params.ancho, params.alto]);

  useEffect(() => {
    let vivo = true;
    analizar(() => vivo);
    return () => {
      vivo = false;
      cancelar.current?.abort();
    };
  }, [analizar]);

  // Corta el pedido y vuelve. Sobre el cupo: ver features/foto/api.ts.
  const cancelarAnalisis = () => {
    cancelar.current?.abort();
    router.back();
  };

  // A Registrar comida, sin la camara detras: dismissAll vuelve a las
  // pestanas y desde ahi se abre el registro.
  const cargarAMano = () => {
    router.dismissAll();
    router.push({ pathname: '/comida/nueva', params: { tipo } });
  };

  const actualizar = (clave: string, cambio: (f: Fila) => Fila) => {
    setFilas((prev) => prev.map((f) => (f.clave === clave ? cambio(f) : f)));
  };

  const quitar = (clave: string) => {
    setFilas((prev) => prev.filter((f) => f.clave !== clave));
    setSheet(null);
  };

  const elegirAlimento = (clave: string, alimento: Alimento) => {
    actualizar(clave, (f) => ({
      ...aplicarAlimento(f.item, alimento, f.alternativas.filter((a) => a.id !== alimento.id)),
      clave: f.clave,
      porcion: null,
      editada: true,
    }));
    setCambiando(null);
  };

  const confirmarPorcion = (cantidad_g: number, porcion: string, carga: CargaCoccion | null) => {
    if (!sheet) return;
    actualizar(sheet, (f) => ({ ...f, cantidad_g, porcion, carga, editada: true }));
    setSheet(null);
  };

  // Redondeo al final, igual que en nueva.tsx: redondear por item hace que
  // la suma de las partes no de el total.
  const totales = useMemo(
    () =>
      filas.reduce(
        (acc, f) => {
          if (!f.alimento) return acc;
          const k = f.cantidad_g / 100;
          return {
            kcal: acc.kcal + f.alimento.kcal_por_100g * k,
            prot: acc.prot + f.alimento.proteina_g * k,
            carb: acc.carb + f.alimento.carbohidratos_g * k,
            grasa: acc.grasa + f.alimento.grasa_g * k,
          };
        },
        { kcal: 0, prot: 0, carb: 0, grasa: 0 },
      ),
    [filas],
  );

  const faltaElegir = filas.some((f) => !f.alimento);

  const guardar = async () => {
    if (guardandoRef.current || filas.length === 0 || faltaElegir) return;
    guardandoRef.current = true;
    setGuardando(true);
    try {
      const perfil = await obtenerPerfilLocal();
      if (!perfil) {
        Alert.alert('Error', 'No se encontró el perfil.');
        return;
      }
      const comidaId = randomUUID();
      const items = filas.map((f) => ({
        id: randomUUID(),
        alimento_id: f.alimento!.id,
        cantidad_g: f.cantidad_g,
        editado_por_usuario: f.editada,
        carga: f.carga,
      }));
      // Copiar la foto primero; si la transaccion falla, se borra.
      await guardarComidaConFoto(comidaId, fotoAchicada, {
        copiar: guardarFotoComida,
        borrar: borrarFotoComida,
        crear: async (fotoUrl) => {
          await crearComidaConItems(
            {
              id: comidaId,
              usuario_id: perfil.id,
              tipo,
              fecha_hora: aISOLocal(new Date()),
              foto_url: fotoUrl,
            },
            items,
          );
        },
      });
      // Al dashboard: atras quedaria la camara, y la comida ya esta guardada.
      router.dismissAll();
    } catch (e) {
      console.error('Error al guardar la comida de la foto:', e);
      Alert.alert('Error', 'No se pudo guardar la comida.');
    } finally {
      guardandoRef.current = false;
      setGuardando(false);
    }
  };

  const filaSheet = filas.find((f) => f.clave === sheet) ?? null;
  const datosSheet: DatosSheet | null =
    filaSheet?.alimento
      ? {
          nombre: filaSheet.alimento.nombre,
          kcal_por_100g: filaSheet.alimento.kcal_por_100g,
          porciones: filaSheet.alimento.porciones,
          categoria: filaSheet.alimento.categoria,
          estado_base: filaSheet.alimento.estado_base,
          factor_coccion: filaSheet.alimento.factor_coccion,
          cantidadActual: filaSheet.cantidad_g,
          cargaActual: filaSheet.carga,
          onQuitar: () => quitar(filaSheet.clave),
        }
      : null;

  const filaCambiando = filas.find((f) => f.clave === cambiando) ?? null;

  return (
    <Pantalla>
      <View style={estilos.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityLabel="Cerrar">
          <Text style={estilos.cerrar}>✕</Text>
        </Pressable>
        <Text style={estilos.titulo}>Comida con foto</Text>
      </View>

      {fase.tipo === 'analizando' && params.uri && (
        <AnalizandoFoto uri={params.uri} onCancelar={cancelarAnalisis} />
      )}

      {fase.tipo === 'error' && (
        <View style={estilos.centro}>
          <Text style={[estilos.nombre, estilos.textoCentrado]}>{MENSAJE_ERROR_FOTO[fase.error]}</Text>
          <View style={estilos.botones}>
            <Boton
              titulo={fase.error === 'sin_conexion' ? 'Buscar a mano' : 'Cargar a mano'}
              onPress={cargarAMano}
            />
            {!SIN_REINTENTO.includes(fase.error) && (
              <Boton titulo="Probar de nuevo" variante="secundario" onPress={() => analizar(() => true)} />
            )}
          </View>
        </View>
      )}

      {fase.tipo === 'vacio' && (
        <View style={estilos.centro}>
          <Text style={[estilos.nombre, estilos.textoCentrado]}>No encontramos comida en la foto.</Text>
          <View style={estilos.botones}>
            <Boton titulo="Cargar a mano" onPress={cargarAMano} />
          </View>
        </View>
      )}

      {fase.tipo === 'confirmar' && (
        <>
          {/* Mas chica que mientras se analiza: alcanza para comparar lo que
              se ve con lo que se detecto. */}
          {(fotoAchicada ?? params.uri) && (
            <Image
              source={{ uri: (fotoAchicada ?? params.uri)! }}
              style={estilos.fotoConfirmar}
              resizeMode="cover"
              accessibilityLabel="La foto de la comida"
            />
          )}
          <View style={estilos.lista}>
            {filas.map((f) => (
              <View key={f.clave} style={estilos.item}>
                <View style={estilos.itemFila}>
                  <Pressable
                    style={estilos.flex}
                    onPress={() => (f.alimento ? setSheet(f.clave) : setCambiando(f.clave))}
                    accessibilityLabel={
                      f.alimento ? `Cambiar cantidad de ${f.alimento.nombre}` : 'Elegir alimento'
                    }
                  >
                    <Text style={[estilos.nombre, !f.alimento && estilos.sinElegir]}>
                      {f.alimento?.nombre ?? 'Elegí un alimento'}
                    </Text>
                    <Text style={estilos.detalle}>En la foto: {f.item.nombre}</Text>
                    <Text style={estilos.porcion}>{textoCantidad(f)}</Text>
                  </Pressable>
                  <View style={estilos.derecha}>
                    {f.alimento && (
                      <>
                        <Text style={estilos.nombre}>{kcalDe(f.alimento, f.cantidad_g)}</Text>
                        <Text style={estilos.unidad}>kcal</Text>
                      </>
                    )}
                  </View>
                </View>

                <View style={estilos.acciones}>
                  {f.revisar && !f.editada && (
                    <View style={estilos.revisar}>
                      <Text style={estilos.revisarTexto}>Revisar</Text>
                    </View>
                  )}
                  <View style={estilos.flex} />
                  <Pressable onPress={() => setCambiando(f.clave)} hitSlop={8}>
                    <Text style={estilos.accionTexto}>Cambiar</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => quitar(f.clave)}
                    hitSlop={8}
                    accessibilityLabel={`Sacar ${f.alimento?.nombre ?? f.item.nombre}`}
                  >
                    <Ionicons name="close" size={sizes.iconSmall} color={colors.textSecondary} />
                  </Pressable>
                </View>
              </View>
            ))}
          </View>

          {filas.length === 0 ? (
            <View style={estilos.centro}>
              <Text style={estilos.detalle}>Sacaste todos los alimentos.</Text>
              <Boton titulo="Cargar a mano" onPress={cargarAMano} />
            </View>
          ) : (
            <View style={estilos.pie}>
              <View style={estilos.cardTotal}>
                <View style={estilos.totalCaloriasFila}>
                  <Text style={estilos.totalCaloriasLabel}>Calorías</Text>
                  <View style={estilos.totalCaloriasValorFila}>
                    <Text style={estilos.totalCaloriasNumero}>
                      {Math.round(totales.kcal).toLocaleString('es-AR')}
                    </Text>
                    <Text style={estilos.totalCaloriasUnidad}>kcal</Text>
                  </View>
                </View>
                <View style={estilos.totalSeparador} />
                <View style={estilos.totalMacrosFila}>
                  <Macro color={colors.protein} nombre="Proteína" gramos={totales.prot} />
                  <Macro color={colors.carbs} nombre="Carbohidratos" gramos={totales.carb} />
                  <Macro color={colors.fat} nombre="Grasas" gramos={totales.grasa} />
                </View>
              </View>

              <Text style={estilos.aclaracion}>Cantidades estimadas por la foto. Revisalas.</Text>

              {faltaElegir && (
                <Text style={estilos.detalle}>Elegí un alimento para los que dicen "Elegí un alimento".</Text>
              )}
              <Boton
                titulo={`Agregar a ${tipo}`}
                onPress={guardar}
                cargando={guardando}
                disabled={faltaElegir}
              />
            </View>
          )}
        </>
      )}

      <SheetPorciones datos={datosSheet} onCerrar={() => setSheet(null)} onConfirmar={confirmarPorcion} />

      <ModalCambiar
        fila={filaCambiando}
        onCerrar={() => setCambiando(null)}
        onElegir={(a) => filaCambiando && elegirAlimento(filaCambiando.clave, a)}
      />
    </Pantalla>
  );
}

// ---------------------------------------------------------------------------

function Macro({ color, nombre, gramos }: { color: string; nombre: string; gramos: number }) {
  return (
    <View style={estilos.totalMacroItem}>
      <View style={[estilos.puntoMacro, { backgroundColor: color }]} />
      <Text style={estilos.totalMacroTexto}>
        {nombre} <Text style={estilos.totalMacroValor}>{Math.round(gramos)} g</Text>
      </Text>
    </View>
  );
}

/**
 * Elegir otro alimento: arriba los parecidos que encontro el emparejamiento,
 * abajo la busqueda normal del catalogo.
 */
function ModalCambiar({
  fila,
  onCerrar,
  onElegir,
}: {
  fila: Fila | null;
  onCerrar: () => void;
  onElegir: (a: Alimento) => void;
}) {
  const [busqueda, setBusqueda] = useState('');
  const [resultados, setResultados] = useState<Alimento[]>([]);

  // Cada vez que se abre arranca con el nombre que vio la foto.
  useEffect(() => {
    if (fila) setBusqueda(fila.item.nombre);
  }, [fila?.clave]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!fila || !busqueda.trim()) {
      setResultados([]);
      return;
    }
    let vivo = true;
    buscarAlimentosPorNombre(busqueda, 20)
      .then((r) => { if (vivo) setResultados(r); })
      .catch((e) => console.error('Error al buscar alimentos:', e));
    return () => { vivo = false; };
  }, [busqueda, fila]);

  const parecidos = fila
    ? [fila.alimento, ...fila.alternativas].filter((a): a is Alimento => !!a)
    : [];
  const idsParecidos = new Set(parecidos.map((a) => a.id));
  const otros = resultados.filter((a) => !idsParecidos.has(a.id));

  const filaAlimento = (a: Alimento, elegido: boolean) => (
    <Pressable key={a.id} style={[estilos.opcion, elegido && estilos.opcionActiva]} onPress={() => onElegir(a)}>
      <View style={estilos.flex}>
        <Text style={estilos.nombre}>{a.nombre}</Text>
        <Text style={estilos.detalle}>{a.kcal_por_100g} kcal / 100 g</Text>
      </View>
    </Pressable>
  );

  return (
    <Modal visible={!!fila} transparent animationType="slide" onRequestClose={onCerrar}>
      <KeyboardAvoidingView
        style={estilos.fondo}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={estilos.flex} onPress={onCerrar} />
        <View style={estilos.sheet}>
          <View style={estilos.agarre} />
          <ScrollView contentContainerStyle={estilos.sheetContenido} keyboardShouldPersistTaps="handled">
          <Text style={estilos.sheetTitulo}>¿Qué alimento es?</Text>
          {fila && <Text style={estilos.detalle}>En la foto: {fila.item.nombre}</Text>}

          {parecidos.length > 0 && (
            <>
              <Text style={estilos.seccion}>Parecidos</Text>
              {parecidos.map((a) => filaAlimento(a, a.id === fila?.alimento?.id))}
            </>
          )}

          <Input value={busqueda} onChangeText={setBusqueda} placeholder="Buscar alimento" autoCorrect={false} />
          {otros.slice(0, 6).map((a) => filaAlimento(a, false))}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const estilos = StyleSheet.create({
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  cerrar: { fontSize: fontSize.body, color: colors.textSecondary },
  titulo: {
    fontSize: fontSize.subtitle,
    lineHeight: lineHeight.subtitle,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },

  centro: { paddingVertical: spacing.xxl, alignItems: 'center', gap: spacing.sm },
  fotoConfirmar: {
    width: '100%',
    height: 140,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceAlt,
  },
  textoCentrado: { textAlign: 'center' },
  botones: { alignSelf: 'stretch', gap: spacing.sm, marginTop: spacing.md },

  lista: { gap: spacing.xs },
  item: {
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    gap: spacing.sm,
    ...shadow.card,
  },
  itemFila: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  derecha: { alignItems: 'flex-end' },
  unidad: { fontSize: fontSize.small, color: colors.textSecondary },
  nombre: { fontSize: fontSize.body, lineHeight: lineHeight.body, color: colors.textPrimary },
  sinElegir: { color: colors.textSecondary, fontStyle: 'italic' },
  detalle: { fontSize: fontSize.small, lineHeight: lineHeight.small, color: colors.textSecondary },
  porcion: { fontSize: fontSize.small, color: colors.action, marginTop: 2 },

  acciones: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  accionTexto: { fontSize: fontSize.small, fontWeight: fontWeight.medium, color: colors.action },
  // Fondo calido con texto marino: el amber de `warning` sobre crema no llega
  // a AA, y esto es un aviso que se tiene que leer.
  revisar: {
    backgroundColor: colors.accentSoft,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  revisarTexto: {
    fontSize: fontSize.caption,
    lineHeight: lineHeight.caption,
    fontWeight: fontWeight.medium,
    color: colors.textOnAccentSoft,
  },

  pie: { paddingTop: spacing.sm, gap: spacing.md },
  aclaracion: {
    fontSize: fontSize.caption,
    lineHeight: lineHeight.caption,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  cardTotal: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
    ...shadow.card,
  },
  totalCaloriasFila: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  totalCaloriasLabel: { fontSize: fontSize.body, fontWeight: fontWeight.medium, color: colors.textSecondary },
  totalCaloriasValorFila: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.xs },
  totalCaloriasNumero: {
    fontSize: fontSize.title,
    lineHeight: lineHeight.title,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  totalCaloriasUnidad: { fontSize: fontSize.small, color: colors.textSecondary, fontWeight: fontWeight.regular },
  totalSeparador: { height: sizes.hairline, backgroundColor: colors.border },
  totalMacrosFila: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: spacing.md,
    rowGap: spacing.xs,
    alignItems: 'center',
  },
  totalMacroItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  puntoMacro: { width: 7, height: 7, borderRadius: radius.pill },
  totalMacroTexto: { fontSize: fontSize.small, lineHeight: lineHeight.small, color: colors.textSecondary },
  totalMacroValor: { fontWeight: fontWeight.bold, color: colors.textPrimary },

  fondo: { flex: 1, justifyContent: 'flex-end', backgroundColor: colors.overlay },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.lg,
    paddingBottom: spacing.xxxl,
    maxHeight: '85%',
    ...shadow.sheet,
  },
  sheetContenido: { gap: spacing.sm },
  agarre: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: spacing.sm,
  },
  sheetTitulo: {
    fontSize: fontSize.body,
    lineHeight: lineHeight.body,
    fontWeight: fontWeight.medium,
    color: colors.textPrimary,
  },
  seccion: {
    fontSize: fontSize.caption,
    lineHeight: lineHeight.caption,
    fontWeight: fontWeight.medium,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  opcion: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    ...shadow.card,
  },
  opcionActiva: { borderWidth: 1.5, borderColor: colors.action },
});
