// src/features/comidas/components/BuscadorAlimentos.tsx
//
// El buscador de alimentos de Registrar comida, compartido con el editor de
// recetas: el campo, la card de resultados y el alta a mano de un alimento
// que no esta en el catalogo. Lo que se elige sale por onElegir; que hacer con
// el (abrir SheetPorciones) lo decide la pantalla.
//
// La busqueda es controlada: la pantalla tiene el texto, porque mientras se
// busca oculta su propia lista y la vuelve a mostrar al limpiar.

import { useEffect, useState } from 'react';
import type { ReactNode, Ref } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Alert } from 'react-native';

import { Boton } from '@/ui/Boton';
import { Input } from '@/ui/Input';
import { colors, fontSize, fontWeight, lineHeight, radius, shadow, sizes, spacing } from '@/ui/theme';
import { buscarAlimentosPorNombre, guardarAlimento } from '@/db/queries/alimentos';
import type { Alimento } from '@/db/queries/alimentos';
import { randomUUID } from '@/db/sync/uuid';
import { esProbableBebida, obtenerPorcionesBebidaEstandar } from '../porciones';

export function BuscadorAlimentos({
  busqueda,
  onCambiarBusqueda,
  onElegir,
  inputRef,
  accesorios,
  antesDeResultados,
  hayAntes = false,
  altaInicial,
}: {
  busqueda: string;
  onCambiarBusqueda: (texto: string) => void;
  onElegir: (alimento: Alimento) => void;
  inputRef?: Ref<TextInput>;
  /** Botones al lado del campo (la camara en Registrar comida). */
  accesorios?: ReactNode;
  /** Filas que van primero en la card de resultados (las recetas). */
  antesDeResultados?: ReactNode;
  /** Si antesDeResultados trae algo: con eso la card no esta vacia. */
  hayAntes?: boolean;
  /** Para precargar el alta a mano cuando se llega desde un escaneo. */
  altaInicial?: { marca?: string; codigo?: string };
}) {
  const [resultados, setResultados] = useState<Alimento[]>([]);

  // Alta a mano de un alimento que no esta en el catalogo
  const [modalAlta, setModalAlta] = useState(false);
  const [altaNombre, setAltaNombre] = useState('');
  const [altaMarca, setAltaMarca] = useState(altaInicial?.marca ?? '');
  const [altaKcal, setAltaKcal] = useState('');
  const [altaProt, setAltaProt] = useState('');
  const [altaCarb, setAltaCarb] = useState('');
  const [altaGrasa, setAltaGrasa] = useState('');

  useEffect(() => {
    if (altaInicial?.marca) setAltaMarca(altaInicial.marca);
  }, [altaInicial?.marca]);

  // Contra el catalogo local es instantanea, asi que no hace falta debounce.
  // El flag `vivo` evita que una respuesta vieja pise a una nueva.
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

  const guardarAlta = async () => {
    const nombreLimpio = altaNombre.trim();
    const kcal = parseFloat(altaKcal.replace(',', '.'));
    if (!nombreLimpio) {
      Alert.alert('Falta nombre', 'Ingresá el nombre del alimento.');
      return;
    }
    if (!Number.isFinite(kcal) || kcal < 0) {
      Alert.alert('Kcal inválidas', 'Ingresá las calorías cada 100 gramos.');
      return;
    }

    const prot = parseFloat(altaProt.replace(',', '.')) || 0;
    const carb = parseFloat(altaCarb.replace(',', '.')) || 0;
    const grasa = parseFloat(altaGrasa.replace(',', '.')) || 0;

    try {
      const esBebida = esProbableBebida(nombreLimpio);
      const nuevo = await guardarAlimento({
        id: randomUUID(),
        nombre: nombreLimpio,
        marca: altaMarca.trim() || null,
        codigo_barras: altaInicial?.codigo || null,
        kcal_por_100g: Math.round(kcal),
        proteina_g: prot,
        carbohidratos_g: carb,
        grasa_g: grasa,
        fuente: 'manual',
        verificado: false,
        porciones: esBebida ? obtenerPorcionesBebidaEstandar() : [],
        categoria: esBebida ? 'bebidas' : 'otros',
      });

      setModalAlta(false);
      onCambiarBusqueda('');
      onElegir(nuevo);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al guardar alimento';
      Alert.alert('Error', msg);
    }
  };

  const buscando = busqueda.trim().length > 0;

  return (
    <>
      <View style={estilos.buscadorFila}>
        <View style={estilos.flex}>
          <Input
            ref={inputRef}
            value={busqueda}
            onChangeText={onCambiarBusqueda}
            placeholder="Buscar alimento"
            autoCorrect={false}
          />
        </View>
        {accesorios}
      </View>

      {buscando && (
        // Los resultados van agrupados en una card, igual que las comidas del
        // dashboard: sueltos sobre el lienzo se leian como filas flotando.
        <View style={estilos.card}>
          {antesDeResultados}
          {resultados.map((a, i) => (
            <Pressable
              key={a.id}
              style={[
                estilos.resultado,
                // El separador va ADENTRO de la card, y la ultima fila no lleva.
                i < resultados.length - 1 && estilos.resultadoSeparador,
              ]}
              onPress={() => onElegir(a)}
            >
              <View style={estilos.flex}>
                <Text style={estilos.nombre}>{a.nombre}</Text>
                <Text style={estilos.detalle}>{a.kcal_por_100g} kcal / 100 g</Text>
              </View>
              <Text style={estilos.mas}>+</Text>
            </Pressable>
          ))}

          {resultados.length === 0 && !hayAntes && (
            <View style={estilos.vacio}>
              <Text style={estilos.detalle}>No encontramos nada con ese nombre.</Text>
              <Pressable
                style={estilos.botonCargarManual}
                onPress={() => {
                  setAltaNombre(busqueda);
                  setModalAlta(true);
                }}
              >
                <Text style={estilos.botonCargarManualTexto}>
                  + Cargar "{busqueda}" a mano
                </Text>
              </Pressable>
            </View>
          )}
        </View>
      )}

      {/* Modal de alta de alimento a mano */}
      <Modal
        visible={modalAlta}
        transparent
        animationType="slide"
        onRequestClose={() => setModalAlta(false)}
      >
        <View style={estilos.fondo}>
          <Pressable style={estilos.flex} onPress={() => setModalAlta(false)} />
          <View style={estilos.sheetAlta}>
            <View style={estilos.agarre} />
            <Text style={estilos.sheetTitulo}>Cargar alimento a mano</Text>
            <Text style={estilos.sheetSubtitulo}>Completá los datos de la tabla nutricional por 100 g:</Text>

            <View style={estilos.formFila}>
              <Text style={estilos.labelForm}>Nombre *</Text>
              <TextInput
                style={estilos.inputForm}
                value={altaNombre}
                onChangeText={setAltaNombre}
                placeholder="Ej: Yogur Natural"
                placeholderTextColor={colors.textMuted}
              />
            </View>

            <View style={estilos.formFila}>
              <Text style={estilos.labelForm}>Marca (opcional)</Text>
              <TextInput
                style={estilos.inputForm}
                value={altaMarca}
                onChangeText={setAltaMarca}
                placeholder="Ej: La Serenísima"
                placeholderTextColor={colors.textMuted}
              />
            </View>

            <View style={estilos.macrosFilaGrid}>
              {(
                [
                  ['Kcal *', altaKcal, setAltaKcal],
                  ['Prot (g)', altaProt, setAltaProt],
                  ['Carb (g)', altaCarb, setAltaCarb],
                  ['Grasa (g)', altaGrasa, setAltaGrasa],
                ] as const
              ).map(([label, valor, set]) => (
                <View key={label} style={estilos.macroColInput}>
                  <Text style={estilos.labelForm}>{label}</Text>
                  <TextInput
                    style={estilos.inputForm}
                    keyboardType="numeric"
                    value={valor}
                    onChangeText={set}
                    placeholder="0"
                    placeholderTextColor={colors.textMuted}
                  />
                </View>
              ))}
            </View>

            <View style={estilos.modalBotonesFila}>
              <Boton titulo="Cancelar" variante="secundario" onPress={() => setModalAlta(false)} />
              <Boton titulo="Guardar y usar" onPress={guardarAlta} />
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const estilos = StyleSheet.create({
  flex: { flex: 1 },
  buscadorFila: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },

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
  nombre: { fontSize: fontSize.body, lineHeight: lineHeight.body, color: colors.textPrimary },
  detalle: { fontSize: fontSize.small, lineHeight: lineHeight.small, color: colors.textSecondary },

  botonCargarManual: {
    marginTop: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignSelf: 'center',
  },
  botonCargarManualTexto: {
    color: colors.action,
    fontSize: fontSize.small,
    fontWeight: fontWeight.bold,
  },

  fondo: { flex: 1, justifyContent: 'flex-end', backgroundColor: colors.overlay },
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
  sheetAlta: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.lg,
    paddingBottom: spacing.xxxl,
    ...shadow.sheet,
    gap: spacing.sm,
  },
  sheetSubtitulo: {
    fontSize: fontSize.caption,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  formFila: { gap: 4 },
  labelForm: {
    fontSize: fontSize.caption,
    fontWeight: fontWeight.bold,
    color: colors.textSecondary,
  },
  inputForm: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    height: sizes.controlSmall,
    fontSize: fontSize.small,
    color: colors.textPrimary,
  },
  macrosFilaGrid: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  macroColInput: { flex: 1, gap: 4 },
  modalBotonesFila: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.md,
    marginTop: spacing.md,
  },
});
