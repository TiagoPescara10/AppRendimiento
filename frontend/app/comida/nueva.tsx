// Registro de una comida. El flujo es: elegis el tipo (ya viene sugerido por
// la hora), buscas alimentos, y por cada uno elegis cuanto comiste. Nada se
// escribe en la base hasta que tocas "Guardar comida".

import { useState, useEffect } from 'react';
import { View, Text, Pressable, StyleSheet, Alert, Modal } from 'react-native';
import { useRouter } from 'expo-router';

import { Pantalla } from '@/ui/Pantalla';
import { Input } from '@/ui/Input';
import { Boton } from '@/ui/Boton';
import { SheetPorciones } from '@/features/comidas/components/SheetPorciones';
import type { DatosSheet } from '@/features/comidas/components/SheetPorciones';
import { colors, spacing, radius, fontSize, fontWeight, lineHeight, shadow, sizes } from '@/ui/theme';

import { buscarAlimentosPorNombre } from '@/db/queries/alimentos';
import type { Alimento } from '@/db/queries/alimentos';
import { crearComida, agregarItem } from '@/db/queries/comidas';
import { obtenerPerfilLocal } from '@/db/queries/perfil';
import type { TipoComida } from '@/db/schema';
import { randomUUID } from '@/db/sync/uuid';
import { aISOLocal } from '@/lib/fechas';

/**
 * Un alimento agregado a la comida que todavia no se guardo. Se convierte en
 * fila de item_comida recien al tocar Guardar.
 *
 * `porcion` es solo para mostrar: lo que se persiste es cantidad_g.
 */
type ItemPendiente = {
  alimento: Alimento;
  cantidad_g: number;
  porcion: string;
};

const TIPOS: TipoComida[] = ['desayuno', 'almuerzo', 'merienda', 'cena', 'snack'];

/** El tipo mas probable segun la hora. El usuario lo puede cambiar. */
function tipoPorHora(): TipoComida {
  const h = new Date().getHours();
  if (h < 11) return 'desayuno';
  if (h < 15) return 'almuerzo';
  if (h < 19) return 'merienda';
  return 'cena';
}

function kcalDe(alimento: Alimento, gramos: number): number {
  return Math.round((alimento.kcal_por_100g * gramos) / 100);
}

function capitalizar(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

export default function NuevaComida() {
  const router = useRouter();

  const [tipo, setTipo] = useState<TipoComida>(tipoPorHora);
  const [selectorAbierto, setSelectorAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [resultados, setResultados] = useState<Alimento[]>([]);
  const [items, setItems] = useState<ItemPendiente[]>([]);
  const [guardando, setGuardando] = useState(false);

  // El sheet sirve para agregar (indice null) o editar (indice = posicion).
  const [sheet, setSheet] = useState<{ alimento: Alimento; indice: number | null } | null>(null);

  // Busqueda. Contra 318 filas locales es instantanea, asi que no hace falta
  // debounce. El flag `vivo` evita que una respuesta vieja pise a una nueva.
  useEffect(() => {
    if (!busqueda.trim()) {
      setResultados([]);
      return;
    }
    let vivo = true;
    buscarAlimentosPorNombre(busqueda)
      .then((r) => { if (vivo) setResultados(r); })
      .catch((e) => console.error('Error al buscar alimentos:', e));
    return () => { vivo = false; };
  }, [busqueda]);

  const confirmarPorcion = (cantidad_g: number, porcion: string) => {
    if (!sheet) return;
    const nuevo: ItemPendiente = { alimento: sheet.alimento, cantidad_g, porcion };

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

      const comidaId = randomUUID();
      await crearComida({
        id: comidaId,
        usuario_id: perfil.id,
        tipo,
        fecha_hora: aISOLocal(new Date()),
      });

      // TODO: esto deberia ir en una transaccion. Si falla un item a la mitad,
      // queda una comida incompleta guardada.
      for (const item of items) {
        await agregarItem({
          id: randomUUID(),
          comida_id: comidaId,
          alimento_id: item.alimento.id,
          cantidad_g: item.cantidad_g,
          editado_por_usuario: false,
        });
      }

      router.back();
    } catch (e) {
      console.error('Error al guardar la comida:', e);
      Alert.alert('Error', 'No se pudo guardar la comida.');
    } finally {
      setGuardando(false);
    }
  };

  const buscando = busqueda.trim().length > 0;

  // Traduccion del estado local al contrato del sheet compartido.
  const datosSheet: DatosSheet | null = sheet && {
    nombre: sheet.alimento.nombre,
    kcal_por_100g: sheet.alimento.kcal_por_100g,
    porciones: sheet.alimento.porciones,
    cantidadActual: sheet.indice != null ? items[sheet.indice]?.cantidad_g : undefined,
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

      {/* Buscador + los dos accesos alternativos. Todavia no hacen nada. */}
      <View style={estilos.buscadorFila}>
        <View style={estilos.flex}>
          <Input
            value={busqueda}
            onChangeText={setBusqueda}
            placeholder="Buscar alimento"
            autoCorrect={false}
          />
        </View>
        <Pressable
          style={estilos.accionChica}
          onPress={() => Alert.alert('Próximamente', 'Registrar por foto todavía no está listo.')}
        >
          <Text style={estilos.accionIcono}>📷</Text>
        </Pressable>
        <Pressable
          style={estilos.accionChica}
          onPress={() => Alert.alert('Próximamente', 'El escáner todavía no está listo.')}
        >
          <Text style={estilos.accionIcono}>▥</Text>
        </Pressable>
      </View>

      {/* Tres estados excluyentes: buscando, vacio, o con items cargados. */}
      {buscando ? (
        // Los resultados van agrupados en una card, igual que las comidas del
        // dashboard: sueltos sobre el lienzo se leian como filas flotando.
        <View style={estilos.card}>
          {resultados.map((a, i) => (
            <Pressable
              key={a.id}
              style={[
                estilos.resultado,
                // El separador va ADENTRO de la card, y la ultima fila no lleva.
                i < resultados.length - 1 && estilos.resultadoSeparador,
              ]}
              onPress={() => setSheet({ alimento: a, indice: null })}
            >
              <View style={estilos.flex}>
                <Text style={estilos.nombre}>{a.nombre}</Text>
                <Text style={estilos.detalle}>{a.kcal_por_100g} kcal / 100 g</Text>
              </View>
              <Text style={estilos.mas}>+</Text>
            </Pressable>
          ))}

          {resultados.length === 0 && (
            <View style={estilos.vacio}>
              <Text style={estilos.detalle}>No encontramos nada con ese nombre.</Text>
              <Text style={estilos.detalle}>Probá con otro nombre o cargalo a mano.</Text>
            </View>
          )}
        </View>
      ) : items.length === 0 ? (
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
                <Text style={estilos.porcion}>
                  {item.porcion} · {item.cantidad_g} g
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
          <View style={estilos.cardTotal}>
            {/* Calorias destacadas */}
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

            {/* Los 3 macros con nombres completos y puntos de color */}
            <View style={estilos.totalMacrosFila}>
              <View style={estilos.totalMacroItem}>
                <View style={[estilos.puntoMacro, { backgroundColor: colors.protein }]} />
                <Text style={estilos.totalMacroTexto}>
                  Proteína{' '}
                  <Text style={estilos.totalMacroValor}>{Math.round(totales.prot)} g</Text>
                </Text>
              </View>

              <View style={estilos.totalMacroItem}>
                <View style={[estilos.puntoMacro, { backgroundColor: colors.carbs }]} />
                <Text style={estilos.totalMacroTexto}>
                  Carbohidratos{' '}
                  <Text style={estilos.totalMacroValor}>{Math.round(totales.carb)} g</Text>
                </Text>
              </View>

              <View style={estilos.totalMacroItem}>
                <View style={[estilos.puntoMacro, { backgroundColor: colors.fat }]} />
                <Text style={estilos.totalMacroTexto}>
                  Grasas{' '}
                  <Text style={estilos.totalMacroValor}>{Math.round(totales.grasa)} g</Text>
                </Text>
              </View>
            </View>
          </View>

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

  buscadorFila: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  accionChica: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accionIcono: { fontSize: 20 },

  // La card que agrupa los resultados de la busqueda. Sin padding vertical: lo
  // pone cada fila, asi los separadores llegan de lado a lado del interior.
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    ...shadow.card,
  },
  resultado: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  resultadoSeparador: {
    borderBottomWidth: sizes.hairline,
    borderBottomColor: colors.border,
  },
  mas: { fontSize: fontSize.title, color: colors.action, paddingHorizontal: spacing.sm },

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
  cardTotal: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
    ...shadow.card,
  },
  totalCaloriasFila: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  totalCaloriasLabel: {
    fontSize: fontSize.body,
    fontWeight: fontWeight.medium,
    color: colors.textSecondary,
  },
  totalCaloriasValorFila: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.xs,
  },
  totalCaloriasNumero: {
    fontSize: fontSize.title,
    lineHeight: lineHeight.title,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  totalCaloriasUnidad: {
    fontSize: fontSize.small,
    color: colors.textSecondary,
    fontWeight: fontWeight.regular,
  },
  totalSeparador: {
    height: sizes.hairline,
    backgroundColor: colors.border,
  },
  totalMacrosFila: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: spacing.md,
    rowGap: spacing.xs,
    alignItems: 'center',
  },
  totalMacroItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  puntoMacro: {
    width: 7,
    height: 7,
    borderRadius: radius.pill,
  },
  totalMacroTexto: {
    fontSize: fontSize.small,
    lineHeight: lineHeight.small,
    color: colors.textSecondary,
  },
  totalMacroValor: {
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
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