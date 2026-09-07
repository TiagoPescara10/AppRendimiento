// La forma de la sesion, dibujada. Una barra alta por cada trabajo, una baja
// por cada descanso y una larga y mas baja por cada descanso de bloque, con el
// ancho proporcional a la duracion.
//
// Sale del mismo construirPlan() que despues se ejecuta, asi que no puede
// mentir: lo que se dibuja es literalmente el plan.
//
// Usa los colores de fase, los mismos que despues ocupan la pantalla entera.
// De paso el codigo de color queda aprendido antes de arrancar: cuando la
// pantalla se ponga verde, ya se sabe que eso es descanso.

import { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, radius, fontSize, lineHeight } from '@/ui/theme';
import { construirPlan, esCronometro } from '../temporizador';
import type { ConfigTemporizador, TipoFase } from '../temporizador';

const ALTURA = 34;

/** Que tan alta va cada fase, como fraccion de ALTURA. */
const PROPORCION: Record<TipoFase, number> = {
  trabajo: 1,
  descanso: 0.45,
  descansoBloque: 0.3,
};

const COLOR: Record<TipoFase, string> = {
  trabajo: colors.faseTrabajo,
  descanso: colors.faseDescanso,
  descansoBloque: colors.faseDescansoBloque,
};

export function VistaPrevia({
  config,
  resumen,
}: {
  config: ConfigTemporizador;
  /** El texto de resumenPlan(), que va debajo del dibujo. */
  resumen: string;
}) {
  const { barras, cortado } = useMemo(() => {
    // El cronometro no tiene forma: una sola fase abierta, sin proporcion que
    // dibujar. Se queda solo con el resumen.
    if (esCronometro(config)) return { barras: [], cortado: false };

    const plan = construirPlan(config);

    // Con 6 bloques de 8 pasadas son casi cien barras de dos pixeles: ilegible
    // y ademas repetido, porque todos los bloques son iguales. Se muestra el
    // primero entero mas el descanso que lo cierra, y el resto se insinua con
    // los puntos suspensivos.
    const hasta = plan.findIndex((f) => f.bloque > 1);
    const visibles = hasta === -1 ? plan : plan.slice(0, hasta);

    return {
      barras: visibles.map((f, i) => ({
        clave: `${f.tipo}-${i}`,
        tipo: f.tipo,
        // duracionMs nunca es null aca: el unico caso de fase abierta es el
        // cronometro, que ya salio arriba.
        duracion: f.duracionMs ?? 0,
      })),
      cortado: visibles.length < plan.length,
    };
  }, [config]);

  return (
    <View style={estilos.caja}>
      {barras.length > 0 && (
        <View style={estilos.barra}>
          {barras.map((b) => (
            <View
              key={b.clave}
              style={{
                // flex proporcional a la duracion: el ancho relativo sale solo.
                flex: b.duracion,
                // Sin un minimo, un descanso de 5 s al lado de uno de 90
                // desaparece del todo.
                minWidth: 2,
                height: ALTURA * PROPORCION[b.tipo],
                backgroundColor: COLOR[b.tipo],
                borderRadius: radius.sm,
              }}
            />
          ))}
          {cortado && <Text style={estilos.corte}>…</Text>}
        </View>
      )}

      <Text style={estilos.resumen}>{resumen}</Text>
    </View>
  );
}

const estilos = StyleSheet.create({
  caja: {
    backgroundColor: colors.accentSoft,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
  },
  // flex-end las apoya sobre una linea de base comun, para que las bajas
  // cuelguen del piso y no floten al medio.
  barra: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: ALTURA,
    gap: 2,
  },
  corte: {
    fontSize: fontSize.body,
    lineHeight: lineHeight.body,
    color: colors.textOnAccentSoft,
    paddingLeft: spacing.xs,
  },
  resumen: {
    textAlign: 'center',
    fontSize: fontSize.small,
    lineHeight: lineHeight.small,
    color: colors.textOnAccentSoft,
  },
});
