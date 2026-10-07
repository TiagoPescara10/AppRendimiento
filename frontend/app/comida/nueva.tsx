// Registro de una comida. El flujo es: elegis el tipo (ya viene sugerido por
// la hora), buscas alimentos, y por cada uno elegis cuanto comiste. Nada se
// escribe en la base hasta que tocas "Guardar comida".

import { useState, useEffect, useRef } from 'react';
import { View, Text, Pressable, StyleSheet, Alert, Modal, TextInput } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';

import { Pantalla } from '@/ui/Pantalla';
import { Boton } from '@/ui/Boton';
import { SheetPorciones } from '@/features/comidas/components/SheetPorciones';
import type { DatosSheet } from '@/features/comidas/components/SheetPorciones';
import { BuscadorAlimentos } from '@/features/comidas/components/BuscadorAlimentos';
import { TarjetaTotales } from '@/features/comidas/components/TarjetaTotales';
import { TIPOS_COMIDA, tipoPorHora } from '@/features/comidas/tipos';
import { colors, spacing, radius, fontSize, lineHeight, shadow } from '@/ui/theme';

import type { Alimento } from '@/db/queries/alimentos';
import { crearComidaConItems } from '@/db/queries/comidas';
import type { CargaCoccion } from '@/db/queries/comidas';
import { obtenerPerfilLocal } from '@/db/queries/perfil';
import type { TipoComida } from '@/db/schema';
import { randomUUID } from '@/db/sync/uuid';
import { aISOLocal } from '@/lib/fechas';

/**
 * Un alimento agregado a la comida que todavia no se guardo. Se convierte en
 * fila de item_comida recien al tocar Guardar.
 *
 * `porcion` es solo para mostrar: lo que se persiste es cantidad_g, en el
 * estado base del alimento. `carga` es lo que se peso si fue en el otro
 * estado ("300 g crudo").
 */
type ItemPendiente = {
  alimento: Alimento;
  cantidad_g: number;
  porcion: string;
  carga: CargaCoccion | null;
};

const TIPOS = TIPOS_COMIDA;

function kcalDe(alimento: Alimento, gramos: number): number {
  return Math.round((alimento.kcal_por_100g * gramos) / 100);
}

function capitalizar(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

export default function NuevaComida() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    busqueda?: string;
    codigo?: string;
    marca?: string;
    /** Lo pasan la camara y la foto al volver, para no perder el tipo. */
    tipo?: string;
    /** "1" si se vuelve de la camara sin permiso: el buscador arranca enfocado. */
    enfocar?: string;
  }>();

  const [tipo, setTipo] = useState<TipoComida>(() =>
    TIPOS.includes(params.tipo as TipoComida) ? (params.tipo as TipoComida) : tipoPorHora(),
  );
  const [selectorAbierto, setSelectorAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState(params.busqueda ?? '');
  const [items, setItems] = useState<ItemPendiente[]>([]);
  const [guardando, setGuardando] = useState(false);
  const buscador = useRef<TextInput>(null);

  // Sin permiso de camara se vuelve aca para cargar a mano: el teclado ya
  // abierto. Con un respiro, para que la transicion termine antes del foco.
  useEffect(() => {
    if (params.enfocar !== '1') return;
    const t = setTimeout(() => buscador.current?.focus(), 350);
    return () => clearTimeout(t);
  }, [params.enfocar]);

  // Actualizar si cambian los params de navegacion
  useEffect(() => {
    if (params.busqueda) setBusqueda(params.busqueda);
  }, [params.busqueda]);

  // El sheet sirve para agregar (indice null) o editar (indice = posicion).
  const [sheet, setSheet] = useState<{ alimento: Alimento; indice: number | null } | null>(null);

  const confirmarPorcion = (cantidad_g: number, porcion: string, carga: CargaCoccion | null) => {
    if (!sheet) return;
    const nuevo: ItemPendiente = { alimento: sheet.alimento, cantidad_g, porcion, carga };

    setItems((prev) =>
      sheet.indice === null
        ? [...prev, nuevo]
        : prev.map((it, i) => (i === sheet.indice ? nuevo : it)),
    );

    setSheet(null);
    setBusqueda('');   // limpiar deja la lista de items a la vista otra vez
  };

  const quitarItem = () => {
    if (!sheet || sheet.indice === null) return;
    const i = sheet.indice;
    setItems((prev) => prev.filter((_, idx) => idx !== i));
    setSheet(null);
  };

  // Totales en vivo. Se redondea al final y no por item: redondear cada uno
  // hace que la suma de las partes no de el total que se muestra.
  const totales = items.reduce(
    (acc, it) => {
      const f = it.cantidad_g / 100;
      return {
        kcal: acc.kcal + it.alimento.kcal_por_100g * f,
        prot: acc.prot + it.alimento.proteina_g * f,
        carb: acc.carb + it.alimento.carbohidratos_g * f,
        grasa: acc.grasa + it.alimento.grasa_g * f,
      };
    },
    { kcal: 0, prot: 0, carb: 0, grasa: 0 },
  );

  const guardar = async () => {
    if (guardando || items.length === 0) return;
    setGuardando(true);

    try {
      const perfil = await obtenerPerfilLocal();
      if (!perfil) {
        Alert.alert('Error', 'No se encontró el perfil.');
        return;
      }

      // Comida e items en una sola transaccion: si falla uno, no queda nada.
      await crearComidaConItems(
        {
          id: randomUUID(),
          usuario_id: perfil.id,
          tipo,
          fecha_hora: aISOLocal(new Date()),
        },
        items.map((item) => ({
          id: randomUUID(),
          alimento_id: item.alimento.id,
          cantidad_g: item.cantidad_g,
          editado_por_usuario: false,
          carga: item.carga,
        })),
      );

      router.back();
    } catch (e) {
      console.error('Error al guardar la comida:', e);
      Alert.alert('Error', 'No se pudo guardar la comida.');
    } finally {
      setGuardando(false);
    }
  };

  // --- Camara ---------------------------------------------------------------
  //
  // Foto y codigo de barras son los dos modos de la camara de la app
  // (/comida/camara), que guarda su propia comida. Se entra con replace: al
  // confirmar o cerrar, se vuelve a donde estaba el usuario antes de
  // Registrar comida, no a esta pantalla vacia. El permiso lo pide la camara;
  // con "Ahora no" vuelve aca con el buscador enfocado (?enfocar=1).

  const irACamara = (modo: 'foto' | 'codigo') => {
    router.replace({ pathname: '/comida/camara', params: { modo, tipo } });
  };

  // La camara guarda su propia comida: lo cargado aca sin guardar se perderia.
  const abrirCamara = (modo: 'foto' | 'codigo') => {
    if (items.length === 0) {
      irACamara(modo);
      return;
    }
    Alert.alert(
      'Tenés alimentos sin guardar',
      'La cámara arma una comida nueva. Lo que cargaste acá se descarta.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Descartar y seguir', style: 'destructive', onPress: () => irACamara(modo) },
      ],
    );
  };

  const buscando = busqueda.trim().length > 0;

  // Traduccion del estado local al contrato del sheet compartido.
  const datosSheet: DatosSheet | null = sheet && {
    nombre: sheet.alimento.nombre,
    kcal_por_100g: sheet.alimento.kcal_por_100g,
    porciones: sheet.alimento.porciones,
    categoria: sheet.alimento.categoria,
    estado_base: sheet.alimento.estado_base,
    factor_coccion: sheet.alimento.factor_coccion,
    cantidadActual: sheet.indice != null ? items[sheet.indice]?.cantidad_g : undefined,
    cargaActual: sheet.indice != null ? items[sheet.indice]?.carga : null,
    onQuitar: sheet.indice != null ? quitarItem : undefined,
  };

  return (
    <Pantalla>
      {/* Encabezado: cerrar + selector de tipo desplegable */}
      <View style={estilos.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={estilos.cerrar}>✕</Text>
        </Pressable>
        <Pressable style={estilos.selector} onPress={() => setSelectorAbierto(true)}>
          <Text style={estilos.selectorTexto}>{capitalizar(tipo)}</Text>
          <Text style={estilos.selectorFlecha}>▾</Text>
        </Pressable>
      </View>

      {/* Buscador + los dos accesos alternativos: foto y codigo de barras. */}
      <BuscadorAlimentos
        busqueda={busqueda}
        onCambiarBusqueda={setBusqueda}
        onElegir={(a) => setSheet({ alimento: a, indice: null })}
        inputRef={buscador}
        altaInicial={{ marca: params.marca, codigo: params.codigo }}
        accesorios={
          <>
            <Pressable
              style={estilos.accionChica}
              onPress={() => abrirCamara('foto')}
              accessibilityLabel="Registrar con foto"
            >
              <Text style={estilos.accionIcono}>📷</Text>
            </Pressable>
            <Pressable
              style={estilos.accionChica}
              onPress={() => abrirCamara('codigo')}
              accessibilityLabel="Escanear código de barras"
            >
              <Text style={estilos.accionIcono}>▥</Text>
            </Pressable>
          </>
        }
      />

      {/* Tres estados excluyentes: buscando (los resultados los muestra el
          buscador), vacio, o con items cargados. */}
      {buscando ? null : items.length === 0 ? (
        <View style={estilos.vacio}>
          <Text style={estilos.detalle}>Buscá lo que comiste para empezar.</Text>
        </View>
      ) : (
        <View style={estilos.lista}>
          {items.map((item, i) => (
            <Pressable
              key={`${item.alimento.id}-${i}`}
              style={estilos.item}
              onPress={() => setSheet({ alimento: item.alimento, indice: i })}
            >
              <View style={estilos.flex}>
                <Text style={estilos.nombre}>{item.alimento.nombre}</Text>
                {/* Pesado en el otro estado: se muestra lo que se peso, no
                    los gramos convertidos, que no los reconoceria nadie. */}
                <Text style={estilos.porcion}>
                  {item.carga ? item.porcion : `${item.porcion} · ${item.cantidad_g} g`}
                </Text>
              </View>
              <View style={estilos.derecha}>
                <Text style={estilos.nombre}>{kcalDe(item.alimento, item.cantidad_g)}</Text>
                <Text style={estilos.unidad}>kcal</Text>
              </View>
            </Pressable>
          ))}
        </View>
      )}

      {/* Pie con totales. Solo cuando hay algo cargado. */}
      {items.length > 0 && !buscando && (
        <View style={estilos.pie}>
          <TarjetaTotales
            kcal={totales.kcal}
            proteina={totales.prot}
            carbohidratos={totales.carb}
            grasa={totales.grasa}
          />

          <Boton titulo="Guardar comida" onPress={guardar} cargando={guardando} />
        </View>
      )}

      {/* Selector de tipo de comida. */}
      <Modal
        visible={selectorAbierto}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectorAbierto(false)}
      >
        <View style={estilos.fondo}>
          <Pressable style={estilos.flex} onPress={() => setSelectorAbierto(false)} />
          <View style={estilos.sheet}>
            <View style={estilos.agarre} />
            <Text style={estilos.sheetTitulo}>¿Qué comida es?</Text>

            {TIPOS.map((t) => (
              <Pressable
                key={t}
                style={[estilos.opcion, tipo === t && estilos.opcionActiva]}
                onPress={() => {
                  setTipo(t);
                  setSelectorAbierto(false);
                }}
              >
                <Text style={estilos.nombre}>{capitalizar(t)}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      </Modal>

      <SheetPorciones
        datos={datosSheet}
        onCerrar={() => setSheet(null)}
        onConfirmar={confirmarPorcion}
      />
    </Pantalla>
  );
}

const estilos = StyleSheet.create({
  flex: { flex: 1 },

  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  cerrar: { fontSize: fontSize.body, color: colors.textSecondary },
  selector: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  selectorTexto: {
    fontSize: fontSize.body,
    lineHeight: lineHeight.body,
    fontWeight: '500',
    color: colors.textPrimary,
  },
  selectorFlecha: { fontSize: fontSize.small, color: colors.textSecondary },

  accionChica: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accionIcono: { fontSize: 20 },

  vacio: { paddingVertical: spacing.xl, alignItems: 'center', gap: spacing.xs },

  lista: { gap: spacing.xs },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    ...shadow.card,
  },
  derecha: { alignItems: 'flex-end' },
  unidad: { fontSize: fontSize.small, color: colors.textSecondary },

  nombre: { fontSize: fontSize.body, lineHeight: lineHeight.body, color: colors.textPrimary },
  detalle: { fontSize: fontSize.small, lineHeight: lineHeight.small, color: colors.textSecondary },
  porcion: { fontSize: fontSize.small, color: colors.action, marginTop: 2 },

  pie: {
    paddingTop: spacing.sm,
    gap: spacing.md,
  },
  // Estilos del modal del selector de tipo.
  fondo: { flex: 1, justifyContent: 'flex-end', backgroundColor: colors.overlay },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.lg,
    paddingBottom: spacing.xxxl,
    ...shadow.sheet,
    gap: spacing.sm,
  },
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
    fontWeight: '500',
    color: colors.textPrimary,
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