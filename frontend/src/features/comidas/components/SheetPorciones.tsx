// Selector de cantidad. Lo usan las dos pantallas de comida: nueva.tsx para
// agregar un alimento, y [id].tsx para editar uno ya guardado.
//
// El multiplicador resuelve el caso mas comun del registro real: las porciones
// del catalogo son unitarias ("1 milanesa"), pero la gente come dos. Los
// gramos salen de porcion x multiplicador.
//
// Crudo y cocido: si el alimento tiene factor de coccion, arriba aparece un
// selector. La opcion del estado base va primero y es la predeterminada, que
// es el comportamiento de siempre. En el otro estado se ocultan las porciones
// (son del estado base: "1 taza de arroz" es de cocido) y queda solo el campo
// de gramos, que es lo que usa alguien que pesa. Debajo va la equivalencia,
// para que se vea que la cuenta tiene sentido. Ver src/lib/coccion.ts.

import { useState, useEffect } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Alert,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { colors, spacing, radius, fontSize, lineHeight, shadow } from '@/ui/theme';
import type { EstadoCoccion, PorcionTipica } from '@/db/schema';
import type { CargaCoccion } from '@/db/queries/comidas';
import {
  admiteCoccion,
  convertirAEstadoBase,
  opcionesCoccion,
  textoCantidadIngresada,
  textoEquivalencia,
} from '@/lib/coccion';
import { resolverPorcionesAlimento } from '../porciones';

const MULTIPLICADOR_MAX = 20;
const GRAMOS_MAX = 5000;

export type DatosSheet = {
  /** Nombre del alimento, para el titulo. */
  nombre: string;
  kcal_por_100g: number;
  porciones: PorcionTipica[];
  /** Categoria opcional para fallback de porciones al vuelo */
  categoria?: string | null;
  /** En que estado estan los valores. Con factor_coccion, habilita el selector. */
  estado_base?: EstadoCoccion | null;
  factor_coccion?: number | null;
  /** Gramos actuales si se esta editando; undefined si se esta agregando. */
  cantidadActual?: number;
  /** Si el item que se edita se habia pesado en el otro estado. */
  cargaActual?: CargaCoccion | null;
  /** Si viene, el sheet muestra la opcion de quitar. */
  onQuitar?: () => void;
};

export function SheetPorciones({
  datos,
  onCerrar,
  onConfirmar,
}: {
  datos: DatosSheet | null;
  onCerrar: () => void;
  /**
   * cantidad_g final (en el estado base del alimento), la etiqueta para
   * mostrar ("2 × 1 milanesa") y, si se peso en el otro estado, lo que se peso.
   */
  onConfirmar: (cantidad_g: number, porcion: string, carga: CargaCoccion | null) => void;
}) {
  const [multiplicador, setMultiplicador] = useState(1);
  const [gramos, setGramos] = useState('');
  const [estado, setEstado] = useState<EstadoCoccion>('cocido');

  // Al abrir, resetear el multiplicador y precargar los gramos si se edita.
  // Si el item se habia pesado en el otro estado, se abre en ese estado y con
  // lo que se peso, no con los gramos convertidos.
  useEffect(() => {
    setMultiplicador(1);
    const carga = datos?.cargaActual ?? null;
    setEstado(carga?.estado_carga ?? datos?.estado_base ?? 'cocido');
    const g = carga ? carga.cantidad_ingresada_g : datos?.cantidadActual;
    setGramos(g != null ? String(g) : '');
  }, [datos]);

  if (!datos) return null;

  const base = datos.estado_base ?? null;
  const factor = datos.factor_coccion ?? null;
  const conSelector = admiteCoccion(base, factor);
  // En el otro estado las porciones no aplican: son del estado base.
  const enOtroEstado = conSelector && estado !== base;

  const porcionesEfectivas = enOtroEstado ? [] : resolverPorcionesAlimento(datos);
  const kcalDe = (g: number) => Math.round((datos.kcal_por_100g * g) / 100);

  const gramosEscritos = parseFloat(gramos.replace(',', '.'));
  const equivalencia =
    enOtroEstado && Number.isFinite(gramosEscritos)
      ? textoEquivalencia(gramosEscritos, estado, base, factor, datos.kcal_por_100g)
      : null;

  const confirmarGramos = () => {
    const n = gramosEscritos;
    if (!Number.isFinite(n) || n <= 0 || n > GRAMOS_MAX) {
      Alert.alert('Cantidad inválida', `Ingresá un valor entre 1 y ${GRAMOS_MAX} g.`);
      return;
    }
    const ingresados = Math.round(n);
    if (enOtroEstado) {
      const enBase = Math.round(convertirAEstadoBase(ingresados, estado, base, factor));
      onConfirmar(enBase, textoCantidadIngresada(ingresados, estado, base), {
        estado_carga: estado,
        cantidad_ingresada_g: ingresados,
      });
      return;
    }
    onConfirmar(ingresados, `${ingresados} g`, null);
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onCerrar}>
      <KeyboardAvoidingView
        style={estilos.fondo}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* El fondo tocable ocupa solo el espacio libre de arriba: asi un
            toque sobre el sheet nunca puede cerrarlo por burbujeo. */}
        <Pressable style={estilos.flex} onPress={onCerrar} />

        <View style={estilos.sheet}>
          <View style={estilos.agarre} />

          <Text style={estilos.sheetTitulo}>{datos.nombre}</Text>
          <Text style={estilos.detalle}>¿Cuánto comiste?</Text>

          {conSelector && (
            <View style={estilos.selector}>
              {opcionesCoccion(base).map((o) => {
                const activo = o.estado === estado;
                return (
                  <Pressable
                    key={o.estado}
                    style={[estilos.selectorOpcion, activo && estilos.selectorActivo]}
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

          {/* Multiplicador. Solo tiene sentido si hay porciones que multiplicar. */}
          {porcionesEfectivas.length > 0 && (
            <View style={estilos.multiFila}>
              <Text style={estilos.detalle}>Cantidad</Text>
              <View style={estilos.multiControles}>
                <Pressable
                  style={estilos.multiBoton}
                  onPress={() => setMultiplicador((m) => Math.max(1, m - 1))}
                >
                  <Text style={estilos.multiSigno}>−</Text>
                </Pressable>
                <Text style={estilos.multiValor}>{multiplicador}</Text>
                <Pressable
                  style={estilos.multiBoton}
                  onPress={() => setMultiplicador((m) => Math.min(MULTIPLICADOR_MAX, m + 1))}
                >
                  <Text style={estilos.multiSigno}>+</Text>
                </Pressable>
              </View>
            </View>
          )}

          {porcionesEfectivas.map((p) => {
            const gramosTotal = p.gramos * multiplicador;
            const seleccionada = datos.cantidadActual === gramosTotal;
            const etiqueta = multiplicador === 1 ? p.nombre : `${multiplicador} × ${p.nombre}`;

            return (
              <Pressable
                key={p.nombre}
                style={[estilos.opcion, seleccionada && estilos.opcionActiva]}
                onPress={() => onConfirmar(gramosTotal, etiqueta, null)}
              >
                <View style={estilos.flex}>
                  <Text style={estilos.nombre}>{etiqueta}</Text>
                  <Text style={estilos.detalle}>{gramosTotal} g</Text>
                </View>
                <Text style={estilos.nombre}>{kcalDe(gramosTotal)} kcal</Text>
              </Pressable>
            );
          })}

          {/* Cantidad exacta. Casi nadie la usa, pero cuando hace falta y no
              esta, no hay salida. */}
          <View style={estilos.gramosFila}>
            <TextInput
              style={estilos.gramosInput}
              value={gramos}
              onChangeText={setGramos}
              placeholder={
                enOtroEstado
                  ? 'Gramos que pesaste'
                  : datos.cantidadActual != null
                  ? `Actual: ${datos.cantidadActual} g`
                  : 'Otra cantidad'
              }
              placeholderTextColor={colors.textSecondary}
              keyboardType="decimal-pad"
              returnKeyType="done"
              onSubmitEditing={confirmarGramos}
            />
            <Text style={estilos.detalle}>g</Text>
            <Pressable style={estilos.gramosBoton} onPress={confirmarGramos}>
              <Text style={estilos.gramosBotonTexto}>Usar</Text>
            </Pressable>
          </View>

          {equivalencia && <Text style={estilos.equivalencia}>{equivalencia}</Text>}

          {datos.onQuitar && (
            <Pressable style={estilos.eliminar} onPress={datos.onQuitar}>
              <Text style={estilos.eliminarTexto}>Quitar de la comida</Text>
            </Pressable>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const estilos = StyleSheet.create({
  flex: { flex: 1 },

  nombre: { fontSize: fontSize.body, lineHeight: lineHeight.body, color: colors.textPrimary },
  detalle: { fontSize: fontSize.small, lineHeight: lineHeight.small, color: colors.textSecondary },

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

  multiFila: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  multiControles: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  multiBoton: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  multiSigno: { fontSize: fontSize.body, color: colors.textPrimary },
  multiValor: {
    fontSize: fontSize.body,
    fontWeight: '500',
    color: colors.textPrimary,
    minWidth: 24,
    textAlign: 'center',
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

  selector: {
    flexDirection: 'row',
    padding: spacing.xs,
    gap: spacing.xs,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
  },
  selectorOpcion: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
  },
  selectorActivo: { backgroundColor: colors.surface, ...shadow.card },
  selectorTexto: { fontSize: fontSize.small, lineHeight: lineHeight.small, color: colors.textSecondary },
  selectorTextoActivo: { color: colors.textPrimary, fontWeight: '500' },

  equivalencia: { fontSize: fontSize.caption, lineHeight: lineHeight.caption, color: colors.textSecondary },

  gramosFila: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  gramosInput: {
    flex: 1,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    fontSize: fontSize.body,
    color: colors.textPrimary,
  },
  gramosBoton: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.action,
  },
  gramosBotonTexto: { fontSize: fontSize.body, color: colors.textOnAction },

  eliminar: { paddingVertical: spacing.md, alignItems: 'center' },
  eliminarTexto: { fontSize: fontSize.body, color: colors.danger },
});