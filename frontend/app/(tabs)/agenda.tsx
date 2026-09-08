// Calendario mensual con los eventos del usuario. El mes muestra solo que hay
// algo cada dia; el detalle esta a un toque, en /evento/dia/[fecha].
//
// La grilla es a mano y no con libreria: son sesenta lineas de aritmetica de
// fechas contra una dependencia grande con la que habria que pelear para que
// respete la paleta.

import { useState, useMemo, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';

import { Pantalla } from '@/ui/Pantalla';
import { Boton } from '@/ui/Boton';
import { colors, spacing, radius, fontSize, lineHeight, shadow, sizes } from '@/ui/theme';

import { listarEventosPorRango } from '@/db/queries/eventos';
import { materializarRutinas } from '@/features/agenda/materializar';
import { ETIQUETA_TIPO, horaDe } from '@/features/agenda/formato';
import { aFechaLocal, aISOLocal } from '@/lib/fechas';
import { obtenerPerfilLocal } from '@/db/queries/perfil';
import type { EventoRow, TipoEvento } from '@/db/schema';

// ---------------------------------------------------------------------------
// La grilla
//
// Las claves de este archivo son "YYYY-MM-DD" locales, que es lo que devuelve
// aFechaLocal() y lo que trae la columna generada `fecha`: comparan directo,
// sin convertir nada. El por que del formato esta en lib/fechas.ts.
// ---------------------------------------------------------------------------

const DIAS_CABECERA = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

/** Celda de la grilla. `delMes` distingue los dias de relleno. */
type Celda = { fecha: Date; clave: string; delMes: boolean };

/**
 * La grilla del mes: tantas semanas como haga falta para cubrirlo, ni una mas.
 *
 * Antes eran 42 celdas fijas (6 semanas) para que la pantalla no saltara de
 * alto al navegar entre meses. Se cambio porque el precio era peor que el
 * problema: los meses que entran en 5 semanas dibujaban una sexta fila entera
 * de dias del mes siguiente, y adentro de la card blanca esa fila se lee como
 * un error de la app, no como relleno. Un salto de alto al cambiar de mes se
 * entiende; una fila fantasma, no.
 *
 * El largo es variable, asi que nadie puede indexar posiciones fijas: la
 * ultima celda es `grilla[grilla.length - 1]`.
 */
function armarGrilla(ancla: Date): Celda[] {
  const primero = new Date(ancla.getFullYear(), ancla.getMonth(), 1);
  // getDay() del dia 1 dice cuantas celdas de relleno van adelante.
  const offset = primero.getDay();
  const inicio = new Date(primero);
  inicio.setDate(1 - offset);

  // El dia 0 del mes SIGUIENTE es el ultimo del actual: asi sale la cantidad
  // de dias sin tabla de meses ni casos de año bisiesto.
  const diasDelMes = new Date(ancla.getFullYear(), ancla.getMonth() + 1, 0).getDate();
  const semanas = Math.ceil((diasDelMes + offset) / 7);

  const celdas: Celda[] = [];
  for (let i = 0; i < semanas * 7; i++) {
    const d = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate() + i);
    celdas.push({
      fecha: d,
      clave: aFechaLocal(d),
      delMes: d.getMonth() === ancla.getMonth(),
    });
  }
  return celdas;
}

/** Domingo a sabado de la semana que contiene a `d`. */
function semanaDe(d: Date): { desde: Date; hasta: Date } {
  const desde = new Date(d.getFullYear(), d.getMonth(), d.getDate() - d.getDay());
  const hasta = new Date(desde.getFullYear(), desde.getMonth(), desde.getDate() + 6, 23, 59, 59);
  return { desde, hasta };
}

/** Los partidos y competencias se distinguen del resto en el calendario. */
function esDestacado(tipo: TipoEvento): boolean {
  return tipo === 'partido' || tipo === 'competencia';
}

// ---------------------------------------------------------------------------
// Pantalla
// ---------------------------------------------------------------------------

export default function Agenda() {
  const router = useRouter();

  // Primer dia del mes visible. Cambiarlo es navegar entre meses.
  const [ancla, setAncla] = useState(() => {
    const h = new Date();
    return new Date(h.getFullYear(), h.getMonth(), 1);
  });

  const [eventosDelMes, setEventosDelMes] = useState<EventoRow[]>([]);
  const [semana, setSemana] = useState<EventoRow[]>([]);
  const [cargando, setCargando] = useState(true);

  const hoy = aFechaLocal(new Date());

  // useMemo y no una llamada suelta: la grilla es dependencia del efecto de
  // abajo, y sin memoizar cambia de identidad en cada render y lo dispara.
  const grilla = useMemo(() => armarGrilla(ancla), [ancla]);

  useFocusEffect(
    useCallback(() => {
      let vivo = true;

      (async () => {
        const perfil = await obtenerPerfilLocal();
        if (!perfil) return;

        // Genera las ocurrencias que falten. Es idempotente, asi que llamarla
        // en cada foco no duplica nada.
        await materializarRutinas(perfil.id);

        // El rango cubre la grilla entera, no solo el mes: los dias de relleno
        // tambien muestran su punto.
        const desde = grilla[0].fecha;
        // La ultima del array, no la 41: la grilla mide 4, 5 o 6 semanas segun
        // el mes, asi que la posicion 41 puede no existir.
        const ultima = grilla[grilla.length - 1].fecha;
        const hasta = new Date(
          ultima.getFullYear(),
          ultima.getMonth(),
          ultima.getDate(),
          23, 59, 59,
        );

        const sem = semanaDe(new Date());

        const [delMes, deLaSemana] = await Promise.all([
          listarEventosPorRango(perfil.id, aISOLocal(desde), aISOLocal(hasta)),
          listarEventosPorRango(perfil.id, aISOLocal(sem.desde), aISOLocal(sem.hasta)),
        ]);

        if (!vivo) return;
        setEventosDelMes(delMes);
        setSemana(deLaSemana);
      })()
        .catch((e) => console.error('Error al cargar la agenda:', e))
        .finally(() => { if (vivo) setCargando(false); });

      return () => { vivo = false; };
    }, [grilla]),
  );

  // Un Map de "YYYY-MM-DD" a los tipos de ese dia. Se arma una vez por render
  // en vez de filtrar el array en cada celda de la grilla.
  const porDia = useMemo(() => {
    const m = new Map<string, TipoEvento[]>();
    for (const e of eventosDelMes) {
      const lista = m.get(e.fecha) ?? [];
      lista.push(e.tipo);
      m.set(e.fecha, lista);
    }
    return m;
  }, [eventosDelMes]);

  const cambiarMes = (delta: number) => {
    setAncla((a) => new Date(a.getFullYear(), a.getMonth() + delta, 1));
  };

  // Solo en la primera carga. Al cambiar de mes se ve el anterior un instante,
  // que es mejor que un spinner parpadeando en cada navegacion.
  if (cargando) {
    return (
      <Pantalla scroll={false}>
        <View style={estilos.centrado}>
          <ActivityIndicator color={colors.action} />
        </View>
      </Pantalla>
    );
  }

  return (
    <Pantalla>
      {/* Calendario completo en card blanca */}
      <View style={estilos.cardCalendario}>
        {/* Navegacion de mes */}
        <View style={estilos.mesFila}>
          <Pressable onPress={() => cambiarMes(-1)} hitSlop={12}>
            <Text style={estilos.flecha}>‹</Text>
          </Pressable>
          <Text style={estilos.mes}>
            {MESES[ancla.getMonth()]}
            {ancla.getFullYear() !== new Date().getFullYear() && ` ${ancla.getFullYear()}`}
          </Text>
          <Pressable onPress={() => cambiarMes(1)} hitSlop={12}>
            <Text style={estilos.flecha}>›</Text>
          </Pressable>
        </View>

        <View style={estilos.cabecera}>
          {DIAS_CABECERA.map((d, i) => (
            <Text key={i} style={estilos.cabeceraDia}>{d}</Text>
          ))}
        </View>

        <View style={estilos.grilla}>
          {grilla.map((celda) => {
            const tipos = porDia.get(celda.clave) ?? [];
            const esHoy = celda.clave === hoy;

            return (
              <Pressable
                key={celda.clave}
                style={[estilos.celda, esHoy && estilos.celdaHoy]}
                onPress={() => router.push(`/evento/dia/${celda.clave}`)}
              >
                <Text
                  style={[
                    estilos.numero,
                    !celda.delMes && estilos.numeroFuera,
                    esHoy && estilos.numeroHoy,
                  ]}
                >
                  {celda.fecha.getDate()}
                </Text>
                {/* El contenedor va siempre: sin el, las celdas con punto corren
                    el numero hacia arriba y la grilla queda despareja. */}
                <View style={estilos.puntoEspacio}>
                  {tipos.length > 0 && (
                    <View
                      style={[
                        estilos.punto,
                        tipos.some(esDestacado) && estilos.puntoDestacado,
                        esHoy && estilos.puntoHoy,
                      ]}
                    />
                  )}
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Sin esto el mes se ve lindo pero no dice que hacer hoy. */}
      <Text style={estilos.seccion}>Esta semana</Text>

      {/* Todo adentro de una card, igual que las comidas del dashboard: se lee
          como un bloque y no como filas flotando sobre el lienzo. */}
      <View style={estilos.card}>
        {semana.length === 0 ? (
          <View style={estilos.vacio}>
            <Text style={estilos.detalle}>No tenés nada agendado esta semana.</Text>
          </View>
        ) : (
          semana.map((e, i) => (
            <Pressable
              key={e.id}
              style={[
                estilos.evento,
                // El separador va ADENTRO de la card, y la ultima fila no lleva.
                i < semana.length - 1 && estilos.eventoSeparador,
              ]}
              onPress={() => router.push(`/evento/${e.id}`)}
            >
              <Text style={estilos.diaCorto}>
                {e.fecha === hoy
                  ? 'Hoy'
                  : new Date(`${e.fecha}T00:00:00`).toLocaleDateString('es-AR', {
                      weekday: 'short',
                    })}
              </Text>
              <Text style={[estilos.nombre, estilos.flex]}>{ETIQUETA_TIPO[e.tipo]}</Text>
              <Text style={estilos.detalle}>{horaDe(e.fecha_hora_inicio)}</Text>
            </Pressable>
          ))
        )}
      </View>

      <Boton titulo="Agregar evento" onPress={() => router.push('/evento/nuevo')} />
    </Pantalla>
  );
}

// ---------------------------------------------------------------------------

const estilos = StyleSheet.create({
  flex: { flex: 1 },
  centrado: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // Card del calendario. Padding chico para que las 7 columnas respiren
  // sin achicar las celdas. La navegacion de mes va adentro.
  //
  // paddingBottom 0 y no spacing.md: la celda ya trae su propio aire abajo. Es
  // cuadrada (aspectRatio 1, ~49px) y su contenido mide ~31 (numero + hueco del
  // punto), asi que centrado deja ~9px libres, y debajo del numero hay otros
  // 10 del hueco del punto, casi siempre vacio. Eso son ~19px que hacen de
  // padding solos; sumarles 12 mas era lo que dejaba el fondo de la card
  // pareciendo una fila de mas.
  cardCalendario: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.md,
    paddingBottom: 0,
    gap: spacing.sm,
    ...shadow.card,
  },

  mesFila: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xs,
  },
  flecha: { fontSize: fontSize.title, color: colors.textSecondary },
  mes: {
    fontSize: fontSize.body,
    lineHeight: lineHeight.body,
    fontWeight: '500',
    color: colors.textPrimary,
  },

  cabecera: { flexDirection: 'row' },
  cabeceraDia: {
    flex: 1,
    textAlign: 'center',
    fontSize: fontSize.small,
    color: colors.textSecondary,
  },

  grilla: { flexDirection: 'row', flexWrap: 'wrap' },
  celda: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  celdaHoy: { backgroundColor: colors.action, borderRadius: radius.md },
  numero: { fontSize: fontSize.small, color: colors.textPrimary },
  numeroFuera: { color: colors.textSecondary, opacity: 0.35 },
  numeroHoy: { color: colors.textOnAction, fontWeight: '500' },

  punto: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.action },
  puntoDestacado: { backgroundColor: colors.accent },
  puntoHoy: { backgroundColor: colors.textOnAction },
  puntoEspacio: { height: 10 },

  seccion: {
    fontSize: fontSize.small,
    fontWeight: '500',
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  // La card de "Esta semana". Sin padding vertical: lo pone cada fila, asi los
  // separadores llegan de lado a lado del interior.
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    ...shadow.card,
  },
  evento: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  eventoSeparador: {
    borderBottomWidth: sizes.hairline,
    borderBottomColor: colors.border,
  },
  diaCorto: { fontSize: fontSize.small, color: colors.textSecondary, width: 36 },

  nombre: { fontSize: fontSize.body, lineHeight: lineHeight.body, color: colors.textPrimary },
  detalle: { fontSize: fontSize.small, lineHeight: lineHeight.small, color: colors.textSecondary },

  vacio: { paddingVertical: spacing.xl, alignItems: 'center' },
});