// Pantalla de Perfil de usuario
// Cuatro bloques: Identidad, Objetivo, Ajustes, Ayuda y cerrar sesión.

import { useState, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { Pantalla } from '@/ui/Pantalla';
import { colors, spacing, radius, fontSize, fontWeight, lineHeight, shadow, sizes } from '@/ui/theme';
import { calcularTodo, calcularMetaAgua, type ResultadoNutricional } from '@/lib/nutricion';
import { calcularEdad, aFechaLocal } from '@/lib/fechas';
import { obtenerPerfilLocal } from '@/db/queries/perfil';
import { listarPesos, ultimoPeso } from '@/db/queries/peso';
import { minutosEntrenamientoDelDia } from '@/db/queries/eventos';
import { cerrarSesion } from '@/features/auth/session';
import { SheetRegistroPeso } from '@/features/perfil/components/SheetRegistroPeso';
import { SheetMetaAgua } from '@/features/perfil/components/SheetMetaAgua';
import { sembrarDatosDesarrollo } from '@/db/seeds/devSeed';
import type { PerfilRow, RegistroPesoRow } from '@/db/schema';

// ---------------------------------------------------------------------------
// Constantes y helpers
// ---------------------------------------------------------------------------

const ETIQUETA_ACTIVIDAD: Record<string, string> = {
  sedentario: 'Sedentario',
  ligero: 'Actividad ligera',
  moderado: 'Actividad moderada',
  alto: 'Actividad alta',
  muy_alto: 'Actividad muy alta',
};

function formatearPeso(n: number): string {
  return n.toLocaleString('es-AR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  });
}

function formatoHaceDias(fechaStr?: string): string {
  if (!fechaStr) return 'Sin registros';
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const [a, m, d] = fechaStr.split('-').map(Number);
  const fecha = new Date(a, m - 1, d);
  fecha.setHours(0, 0, 0, 0);
  const diffMs = hoy.getTime() - fecha.getTime();
  const diffDias = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDias <= 0) return 'hoy';
  if (diffDias === 1) return 'hace 1 día';
  return `hace ${diffDias} días`;
}

// ---------------------------------------------------------------------------
// Pantalla de Perfil
// ---------------------------------------------------------------------------

export default function Perfil() {
  const router = useRouter();

  const [cargando, setCargando] = useState(true);
  const [perfil, setPerfil] = useState<PerfilRow | null>(null);
  const [ultimo, setUltimo] = useState<RegistroPesoRow | null>(null);
  const [pesoInicial, setPesoInicial] = useState<number | null>(null);
  const [nutricion, setNutricion] = useState<ResultadoNutricional | null>(null);
  const [metaAguaCalculada, setMetaAguaCalculada] = useState<number>(2000);
  const [sheetPesoVisible, setSheetPesoVisible] = useState(false);
  const [sheetAguaVisible, setSheetAguaVisible] = useState(false);

  const cargarDatos = useCallback(async () => {
    try {
      const p = await obtenerPerfilLocal();
      if (!p) {
        setCargando(false);
        return;
      }
      setPerfil(p);

      const hoy = aFechaLocal(new Date());
      const [uPeso, historialPesos, minEntreno] = await Promise.all([
        ultimoPeso(p.id),
        listarPesos(p.id),
        minutosEntrenamientoDelDia(p.id, hoy),
      ]);

      setUltimo(uPeso);
      setMetaAguaCalculada(calcularMetaAgua(uPeso?.peso_kg ?? 70, minEntreno));

      // El peso mas antiguo del historial como peso inicial
      if (historialPesos.length > 0) {
        setPesoInicial(historialPesos[historialPesos.length - 1].peso_kg);
      } else if (uPeso) {
        setPesoInicial(uPeso.peso_kg);
      }

      // Calculo de nutricion igual que en el dashboard
      const edad = p.fecha_nacimiento ? calcularEdad(p.fecha_nacimiento) : null;
      if (
        uPeso?.peso_kg &&
        p.altura_cm &&
        edad &&
        p.sexo_biologico &&
        p.nivel_actividad &&
        p.objetivo
      ) {
        const nut = calcularTodo({
          peso_kg: uPeso.peso_kg,
          altura_cm: p.altura_cm,
          edad,
          sexo: p.sexo_biologico,
          nivel_actividad: p.nivel_actividad,
          objetivo: p.objetivo,
        });
        setNutricion(nut);
      } else {
        setNutricion(null);
      }

    } catch (e) {
      console.error('Error al cargar perfil:', e);
    } finally {
      setCargando(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      cargarDatos();
    }, [cargarDatos])
  );

  const confirmarCerrarSesion = () => {
    Alert.alert(
      'Cerrar sesion',
      '¿Estas seguro de que queres cerrar sesion?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Cerrar sesion',
          style: 'destructive',
          onPress: async () => {
            await cerrarSesion();
            router.replace('/(auth)/login');
          },
        },
      ]
    );
  };

  const [sembrando, setSembrando] = useState(false);

  const ejecutarSeed = async () => {
    if (sembrando || !perfil) return;
    setSembrando(true);
    try {
      await sembrarDatosDesarrollo(perfil.id);
      await cargarDatos();
      Alert.alert('Seed completado', 'Se cargaron los datos de prueba en tu perfil.');
    } catch (e: any) {
      console.error('Error al cargar seed:', e);
      Alert.alert('Error', e?.message ?? 'No se pudo cargar el seed.');
    } finally {
      setSembrando(false);
    }
  };

  if (cargando) {
    return (
      <Pantalla>
        <View style={estilos.centrado}>
          <ActivityIndicator size="large" color={colors.action} />
        </View>
      </Pantalla>
    );
  }

  if (!perfil) {
    return (
      <Pantalla>
        <View style={estilos.centrado}>
          <Text style={estilos.cardSubtitulo}>No se encontro el perfil.</Text>
        </View>
      </Pantalla>
    );
  }

  const edad = perfil.fecha_nacimiento ? calcularEdad(perfil.fecha_nacimiento) : null;
  const inicialNombre = perfil.nombre ? perfil.nombre.charAt(0).toUpperCase() : '?';

  // Logica de bloque Objetivo
  const obj = perfil.objetivo;
  const tienePesoObj = (obj === 'bajar' || obj === 'subir') && perfil.peso_objetivo_kg != null;
  const pesoActual = ultimo?.peso_kg ?? null;

  let tituloObj = 'Objetivo';
  let subtituloObj = '';
  let porcentajeProgreso = 0;

  if (obj === 'mantener') {
    tituloObj = 'Mantener peso';
  } else if (obj === 'rendimiento') {
    tituloObj = 'Mejorar rendimiento';
  } else if (tienePesoObj && perfil.peso_objetivo_kg != null) {
    const metaKg = perfil.peso_objetivo_kg;
    tituloObj = obj === 'bajar' ? `Bajar a ${formatearPeso(metaKg)} kg` : `Subir a ${formatearPeso(metaKg)} kg`;

    if (pesoActual != null) {
      const falta = Math.abs(pesoActual - metaKg);
      subtituloObj = `Estas en ${formatearPeso(pesoActual)} kg · faltan ${formatearPeso(falta)}`;

      // Calculo de la barra de progreso
      const pIni = pesoInicial ?? pesoActual;
      const recorridoTotal = Math.abs(pIni - metaKg);
      if (recorridoTotal > 0) {
        const recorridoHecho = obj === 'bajar' ? pIni - pesoActual : pesoActual - pIni;
        porcentajeProgreso = Math.min(100, Math.max(0, (recorridoHecho / recorridoTotal) * 100));
      } else {
        porcentajeProgreso = 100;
      }
    }
  }

  const detalleNutricion = [
    nutricion ? `${nutricion.kcal_objetivo.toLocaleString('es-AR')} kcal/dia` : null,
    perfil.nivel_actividad ? ETIQUETA_ACTIVIDAD[perfil.nivel_actividad] : null,
  ].filter(Boolean).join(' · ');

  return (
    <Pantalla>
      {/* Bloque a: Identidad */}
      <View style={[estilos.card, estilos.identidadCard]}>
        <View style={estilos.avatar}>
          <Text style={estilos.avatarTexto}>{inicialNombre}</Text>
        </View>

        <View style={estilos.identidadInfo}>
          <Text style={estilos.nombreTexto}>{perfil.nombre ?? 'Usuario'}</Text>
          <Text style={estilos.datosTexto}>
            {[
              edad != null ? `${edad} años` : null,
              perfil.altura_cm != null ? `${perfil.altura_cm} cm` : null,
            ].filter(Boolean).join(' · ')}
          </Text>
        </View>

        <Pressable
          style={estilos.iconoBoton}
          onPress={() => router.push('/perfil/datos')}
          hitSlop={8}
        >
          <Ionicons name="pencil" size={sizes.iconSmall} color={colors.action} />
        </Pressable>
      </View>

      {/* Bloque b: Objetivo (solo en modo objetivo) */}
      {perfil.modo_nutricion !== 'recuento' && (
        <View style={estilos.card}>
          <View style={estilos.cardHeaderFila}>
            <Text style={estilos.cardTitulo}>{tituloObj}</Text>
            <Pressable onPress={() => router.push('/perfil/objetivo')} hitSlop={8}>
              <Text style={estilos.enlaceTexto}>Cambiar</Text>
            </Pressable>
          </View>

          {tienePesoObj && (
            <>
              {!!subtituloObj && <Text style={estilos.cardSubtitulo}>{subtituloObj}</Text>}
              <View style={estilos.barraContenedor}>
                <View style={[estilos.barraProgreso, { width: `${porcentajeProgreso}%` }]} />
              </View>
            </>
          )}

          {!!detalleNutricion && (
            <Text style={estilos.textoChico}>{detalleNutricion}</Text>
          )}
        </View>
      )}

      {/* Bloque c: Ajustes */}
      <View style={estilos.card}>
        <Text style={estilos.cardTitulo}>Ajustes</Text>

        {/* Modo de nutrición */}
        <Pressable
          style={estilos.opcionFila}
          onPress={() => router.push('/perfil/modo')}
        >
          <View style={estilos.opcionIzquierda}>
            <Ionicons name="sparkles-outline" size={sizes.iconSmall} color={colors.textSecondary} />
            <Text style={estilos.opcionTexto}>Modo de nutrición</Text>
          </View>
          <View style={estilos.opcionDerecha}>
            <Text style={estilos.opcionValor}>
              {perfil.modo_nutricion === 'recuento' ? 'Solo recuento' : 'Objetivo diario'}
            </Text>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </View>
        </Pressable>

        <View style={estilos.separador} />

        {/* Avisos y recordatorios */}
        <Pressable style={estilos.opcionFila}>
          <View style={estilos.opcionIzquierda}>
            <Ionicons name="notifications-outline" size={sizes.iconSmall} color={colors.textSecondary} />
            <Text style={estilos.opcionTexto}>Avisos y recordatorios</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </Pressable>

        <View style={estilos.separador} />

        {/* Registrar mi peso */}
        <Pressable style={estilos.opcionFila} onPress={() => setSheetPesoVisible(true)}>
          <View style={estilos.opcionIzquierda}>
            <Ionicons name="scale-outline" size={sizes.iconSmall} color={colors.textSecondary} />
            <Text style={estilos.opcionTexto}>Registrar mi peso</Text>
          </View>
          <View style={estilos.opcionDerecha}>
            <Text style={estilos.opcionValor}>{formatoHaceDias(ultimo?.fecha)}</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </View>
        </Pressable>

        <View style={estilos.separador} />

        {/* Meta de hidratacion */}
        <Pressable style={estilos.opcionFila} onPress={() => setSheetAguaVisible(true)}>
          <View style={estilos.opcionIzquierda}>
            <Ionicons name="water-outline" size={sizes.iconSmall} color={colors.textSecondary} />
            <Text style={estilos.opcionTexto}>Meta de hidratación</Text>
          </View>
          <View style={estilos.opcionDerecha}>
            <Text style={estilos.opcionValor}>
              {perfil.meta_agua_manual_ml != null
                ? `${perfil.meta_agua_manual_ml.toLocaleString('es-AR')} ml (manual)`
                : `${metaAguaCalculada.toLocaleString('es-AR')} ml`}
            </Text>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </View>
        </Pressable>

        <View style={estilos.separador} />

        {/* Mis rutinas */}
        <Pressable
          style={estilos.opcionFila}
          onPress={() => router.push('/perfil/rutinas')}
        >
          <View style={estilos.opcionIzquierda}>
            <Ionicons name="repeat-outline" size={sizes.iconSmall} color={colors.textSecondary} />
            <Text style={estilos.opcionTexto}>Mis rutinas</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </Pressable>

        <View style={estilos.separador} />

        {/* Mis alimentos */}
        <Pressable style={estilos.opcionFila}>
          <View style={estilos.opcionIzquierda}>
            <Ionicons name="nutrition-outline" size={sizes.iconSmall} color={colors.textSecondary} />
            <Text style={estilos.opcionTexto}>Mis alimentos</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </Pressable>

        <View style={estilos.separador} />

        {/* Suscripcion */}
        <Pressable style={estilos.opcionFila}>
          <View style={estilos.opcionIzquierda}>
            <Ionicons name="card-outline" size={sizes.iconSmall} color={colors.textSecondary} />
            <Text style={estilos.opcionTexto}>Suscripción</Text>
          </View>
          <View style={estilos.opcionDerecha}>
            <Text style={estilos.opcionValor}>Anual</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </View>
        </Pressable>
      </View>

      {/* Bloque e: Ayuda y cerrar sesion */}
      <View style={estilos.card}>
        <Pressable style={estilos.opcionFila}>
          <View style={estilos.opcionIzquierda}>
            <Ionicons name="help-circle-outline" size={sizes.iconSmall} color={colors.textSecondary} />
            <Text style={estilos.opcionTexto}>Ayuda y soporte</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </Pressable>

        <View style={estilos.separador} />

        {__DEV__ && (
          <>
            <Pressable
              style={estilos.opcionFila}
              onPress={ejecutarSeed}
              disabled={sembrando}
            >
              <View style={estilos.opcionIzquierda}>
                <Ionicons name="flash-outline" size={sizes.iconSmall} color={colors.action} />
                <Text style={[estilos.opcionTexto, { color: colors.action, fontWeight: fontWeight.medium }]}>
                  {sembrando ? 'Cargando datos de prueba…' : 'Cargar datos de prueba (Seed)'}
                </Text>
              </View>
            </Pressable>
            <View style={estilos.separador} />
          </>
        )}

        <Pressable style={estilos.opcionFila} onPress={confirmarCerrarSesion}>
          <View style={estilos.opcionIzquierda}>
            <Ionicons name="log-out-outline" size={sizes.iconSmall} color={colors.danger} />
            <Text style={[estilos.opcionTexto, estilos.textoCerrarSesion]}>
              Cerrar sesión
            </Text>
          </View>
        </Pressable>
      </View>

      {/* Version al pie */}
      <Text style={estilos.versionTexto}>Versión 1.0.0</Text>

      {/* Sheet para registrar peso */}
      <SheetRegistroPeso
        visible={sheetPesoVisible}
        usuarioId={perfil.id}
        pesoActual={ultimo?.peso_kg}
        onCerrar={() => setSheetPesoVisible(false)}
        onGuardado={cargarDatos}
      />

      {/* Sheet para meta de hidratacion */}
      <SheetMetaAgua
        visible={sheetAguaVisible}
        usuarioId={perfil.id}
        metaCalculada={metaAguaCalculada}
        metaManual={perfil.meta_agua_manual_ml}
        onCerrar={() => setSheetAguaVisible(false)}
        onGuardado={cargarDatos}
      />
    </Pantalla>
  );
}

// ---------------------------------------------------------------------------
// Estilos
// ---------------------------------------------------------------------------

const estilos = StyleSheet.create({
  centrado: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: spacing.xxxl,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    ...shadow.card,
    gap: spacing.md,
  },
  cardHeaderFila: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardTitulo: {
    fontSize: fontSize.subtitle,
    lineHeight: lineHeight.subtitle,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  cardSubtitulo: {
    fontSize: fontSize.small,
    lineHeight: lineHeight.small,
    color: colors.textSecondary,
  },
  enlaceTexto: {
    fontSize: fontSize.small,
    lineHeight: lineHeight.small,
    fontWeight: '500',
    color: colors.action,
  },

  // Identidad
  identidadCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarTexto: {
    fontSize: fontSize.title,
    lineHeight: lineHeight.title,
    fontWeight: '600',
    color: colors.textOnAccentSoft,
  },
  identidadInfo: {
    flex: 1,
    gap: spacing.xs,
  },
  nombreTexto: {
    fontSize: fontSize.subtitle,
    lineHeight: lineHeight.subtitle,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  datosTexto: {
    fontSize: fontSize.small,
    lineHeight: lineHeight.small,
    color: colors.textSecondary,
  },
  iconoBoton: {
    padding: spacing.xs,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Barra de progreso de objetivo
  barraContenedor: {
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    overflow: 'hidden',
    marginTop: spacing.xs,
  },
  barraProgreso: {
    height: '100%',
    borderRadius: radius.pill,
    backgroundColor: colors.action,
  },
  textoChico: {
    fontSize: fontSize.caption,
    lineHeight: lineHeight.caption,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },


  // Opciones de lista (Ajustes y Ayuda)
  opcionFila: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  opcionIzquierda: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  opcionTexto: {
    fontSize: fontSize.body,
    lineHeight: lineHeight.body,
    color: colors.textPrimary,
  },
  opcionDerecha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  opcionValor: {
    fontSize: fontSize.small,
    lineHeight: lineHeight.small,
    color: colors.textSecondary,
  },
  separador: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.xs,
  },
  textoCerrarSesion: {
    color: colors.danger,
    fontWeight: '500',
  },

  // Version
  versionTexto: {
    fontSize: fontSize.caption,
    lineHeight: lineHeight.caption,
    color: colors.textMuted,
    textAlign: 'center',
    marginVertical: spacing.sm,
  },
});
