// src/features/entrenamiento/components/VistaCronometroLibre.tsx
//
// La pantalla en vivo del cronometro libre: correr, caminar o bici, con los km
// del GPS. Las pasadas siguen con el anillo de temporizador.tsx; esto no tiene
// fases, asi que no hay anillo.
//
// Dos disposiciones, segun el GPS:
//
//   con GPS (o buscando)   numero grande = km;  columnas = tiempo · ritmo · kcal
//   sin GPS                numero grande = tiempo;  columnas = — km · kcal
//
// Sin peso no hay kcal y la columna no aparece. En pausa el fondo baja un
// escalon y los numeros se atenuan.
//
// Las kcal se recalculan cada 5 s y no en cada tick: con el redondeo a 10, en
// cada tick el numero podria ir y venir entre dos valores.

import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';

import { Pantalla } from '@/ui/Pantalla';
import { colors, spacing, radius, fontSize, lineHeight, fontWeight, sizes } from '@/ui/theme';
import { estimarKcal } from '@/lib/gasto';
import type { Actividad } from '@/lib/gasto';
import { tiempoTarjeta } from '@/features/compartir/tarjeta';
import { calcularRitmo } from '../temporizador';
import type { SenalGps } from '../gps';

const ETIQUETA: Record<Actividad, string> = {
  correr: 'CORRER',
  caminar: 'CAMINAR',
  bici: 'BICI',
};

const ETIQUETA_SENAL: Record<SenalGps, string> = {
  ok: 'GPS',
  buscando: 'Buscando GPS',
  sinGps: 'Sin GPS',
};

/** Debajo de esto el ritmo es ruido: 20 m en un minuto dan 50:00 min/km. */
const KM_MIN_RITMO = 0.1;

const CADA_KCAL_MS = 5000;

interface Props {
  actividad: Actividad;
  km: number;
  senal: SenalGps;
  transcurridoMs: number;
  pausado: boolean;
  pesoKg: number | null;
  huboCorte: boolean;
  onCerrarAviso: () => void;
  onAlternarPausa: () => void;
  onTerminar: () => void;
}

interface Columna {
  valor: string;
  etiqueta: string;
}

export function VistaCronometroLibre({
  actividad,
  km,
  senal,
  transcurridoMs,
  pausado,
  pesoKg,
  huboCorte,
  onCerrarAviso,
  onAlternarPausa,
  onTerminar,
}: Props) {
  const conKm = senal !== 'sinGps';
  const duracionSeg = Math.floor(transcurridoMs / 1000);
  const tiempo = tiempoTarjeta(duracionSeg);

  // --- kcal, muestreadas ---------------------------------------------------

  const datos = {
    actividad,
    duracionSeg,
    distanciaKm: senal === 'ok' && km > 0 ? km : null,
    pesoKg,
  };
  const datosRef = useRef(datos);
  useEffect(() => {
    datosRef.current = datos;
  });

  const [kcal, setKcal] = useState<number | null>(null);
  useEffect(() => {
    if (pausado || pesoKg === null) return;
    const t = setInterval(() => setKcal(estimarKcal(datosRef.current)), CADA_KCAL_MS);
    return () => clearInterval(t);
  }, [pausado, pesoKg]);

  // --- columnas -------------------------------------------------------------

  const columnas: Columna[] = [];
  if (conKm) {
    columnas.push({ valor: tiempo, etiqueta: 'Tiempo' });
    const ritmo = km >= KM_MIN_RITMO ? calcularRitmo(km, duracionSeg) : null;
    columnas.push(
      actividad === 'bici'
        ? { valor: ritmo?.velocidadTexto ?? '—', etiqueta: 'km/h' }
        : { valor: ritmo?.ritmoTexto ?? '—', etiqueta: 'min/km' },
    );
  } else {
    columnas.push({ valor: '—', etiqueta: 'km' });
  }
  if (pesoKg !== null) columnas.push({ valor: `≈ ${kcal ?? 0}`, etiqueta: 'kcal' });

  const numero = pausado ? estilos.numeroPausa : null;
  const suave = pausado ? estilos.numeroPausa : estilos.suave;

  return (
    <Pantalla
      scroll={false}
      fondo={pausado ? colors.faseTrabajoPausa : colors.faseTrabajo}
      style={estilos.pantalla}
    >
      <StatusBar style="light" />

      <View style={estilos.arriba}>
        <Text style={estilos.actividad}>{ETIQUETA[actividad]}</Text>
        <View style={estilos.pastilla}>
          <View
            style={[estilos.punto, { backgroundColor: senal === 'ok' ? colors.gpsActivo : colors.onFaseMedio }]}
          />
          <Text style={estilos.pastillaTexto}>{ETIQUETA_SENAL[senal]}</Text>
        </View>
      </View>

      {huboCorte && (
        <View style={estilos.aviso} accessibilityLiveRegion="polite">
          <Text style={estilos.avisoTexto}>
            El GPS se cortó mientras la app estaba cerrada. Ese tramo no se contó.
          </Text>
          <Pressable onPress={onCerrarAviso} hitSlop={12} accessibilityLabel="Cerrar aviso">
            <Ionicons name="close" size={sizes.iconSmall} color={colors.textOnFase} />
          </Pressable>
        </View>
      )}

      <View style={estilos.centro}>
        {/* El renglon esta siempre, vacio fuera de la pausa: asi el numero no
            salta de lugar al pausar. */}
        <Text style={estilos.enPausa}>{pausado ? 'En pausa' : ' '}</Text>

        {conKm ? (
          <Text style={[estilos.grande, numero]} numberOfLines={1} adjustsFontSizeToFit allowFontScaling={false}>
            {/* Siempre con 2 decimales, a diferencia de formatearDecimal: si
                el ancho cambiara entre 3,4 y 3,47 el numero bailaria. */}
            {km.toFixed(2).replace('.', ',')}
            <Text style={[estilos.unidad, suave]}> km</Text>
          </Text>
        ) : (
          <>
            <Text style={[estilos.grande, numero]} numberOfLines={1} adjustsFontSizeToFit allowFontScaling={false}>
              {tiempo}
            </Text>
            <Text style={[estilos.etiquetaGrande, suave]}>Tiempo</Text>
          </>
        )}

        {!conKm && <Text style={[estilos.nota, suave]}>Los km los cargás al terminar</Text>}
      </View>

      <View style={estilos.separador} />

      <View style={estilos.columnas}>
        {columnas.map((c, i) => (
          <View key={c.etiqueta} style={[estilos.columna, i > 0 && estilos.columnaConBorde]}>
            <Text style={[estilos.valor, numero]} numberOfLines={1} adjustsFontSizeToFit>
              {c.valor}
            </Text>
            <Text style={[estilos.etiqueta, suave]}>{c.etiqueta}</Text>
          </View>
        ))}
      </View>

      <View style={estilos.espacio} />

      <View style={estilos.acciones}>
        {pausado ? (
          <>
            <BotonFase titulo="Terminar" onPress={onTerminar} />
            <BotonFase titulo="Reanudar" onPress={onAlternarPausa} claro />
          </>
        ) : (
          <>
            <BotonFase titulo="Pausar" onPress={onAlternarPausa} />
            <BotonFase titulo="Terminar" onPress={onTerminar} />
          </>
        )}
      </View>
    </Pantalla>
  );
}

/**
 * Boton sobre el fondo de fase. No es una variante de Boton: solo existe aca,
 * y sus colores no tienen sentido sobre el crema del resto de la app.
 */
function BotonFase({ titulo, onPress, claro = false }: { titulo: string; onPress: () => void; claro?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        estilos.boton,
        claro ? estilos.botonClaro : pressed && estilos.botonPresionado,
        claro && pressed && estilos.botonClaroPresionado,
      ]}
    >
      <Text style={[estilos.botonTexto, claro && estilos.botonTextoClaro]}>{titulo}</Text>
    </Pressable>
  );
}

const estilos = StyleSheet.create({
  pantalla: { gap: spacing.lg, paddingBottom: spacing.xl },

  arriba: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.md },
  actividad: {
    fontSize: fontSize.small,
    lineHeight: lineHeight.small,
    fontWeight: fontWeight.bold,
    letterSpacing: 2,
    color: colors.textOnFase,
  },
  pastilla: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.onFaseSuperficie,
  },
  punto: { width: 8, height: 8, borderRadius: radius.pill },
  pastillaTexto: { fontSize: fontSize.small, lineHeight: lineHeight.small, color: colors.textOnFase },

  aviso: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.onFaseBorde,
    backgroundColor: colors.onFaseSuperficie,
  },
  avisoTexto: { flex: 1, fontSize: fontSize.small, lineHeight: lineHeight.small, color: colors.textOnFase },

  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.xs },
  enPausa: {
    fontSize: fontSize.title,
    lineHeight: lineHeight.title,
    fontWeight: fontWeight.bold,
    color: colors.textOnFase,
    marginBottom: spacing.xl,
  },
  // Mas grande que el numero del anillo: aca es lo unico que hay que leer,
  // y se lee corriendo.
  grande: {
    fontSize: 112,
    lineHeight: 120,
    fontWeight: fontWeight.bold,
    letterSpacing: -2,
    color: colors.textOnFase,
    fontVariant: ['tabular-nums'],
  },
  unidad: {
    fontSize: fontSize.display,
    fontWeight: fontWeight.regular,
    letterSpacing: 0,
    color: colors.textOnFaseSuave,
  },
  etiquetaGrande: { fontSize: fontSize.subtitle, lineHeight: lineHeight.subtitle, color: colors.textOnFaseSuave },
  nota: { fontSize: fontSize.small, lineHeight: lineHeight.small, marginTop: spacing.xxl },

  numeroPausa: { color: colors.textOnFasePausa },
  suave: { color: colors.textOnFaseSuave },

  separador: { height: 1, backgroundColor: colors.onFaseTenue },
  columnas: { flexDirection: 'row' },
  columna: { flex: 1, alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.xs, paddingHorizontal: spacing.xs },
  columnaConBorde: { borderLeftWidth: 1, borderLeftColor: colors.onFaseTenue },
  valor: {
    fontSize: fontSize.display,
    lineHeight: lineHeight.display,
    fontWeight: fontWeight.bold,
    color: colors.textOnFase,
    fontVariant: ['tabular-nums'],
  },
  etiqueta: { fontSize: fontSize.small, lineHeight: lineHeight.small },

  espacio: { flex: 0.6 },

  acciones: { flexDirection: 'row', gap: spacing.md },
  boton: {
    flex: 1,
    minHeight: sizes.control + spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.lg,
    backgroundColor: colors.onFaseSuperficie,
  },
  botonPresionado: { backgroundColor: colors.onFaseSuperficiePresionada },
  botonClaro: { backgroundColor: colors.textOnFase },
  botonClaroPresionado: { opacity: 0.85 },
  botonTexto: {
    fontSize: fontSize.subtitle,
    lineHeight: lineHeight.subtitle,
    fontWeight: fontWeight.bold,
    color: colors.textOnFase,
  },
  botonTextoClaro: { color: colors.action },
});
