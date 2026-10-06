// src/features/nivel/components/BarraNivel.tsx
//
// La barra hacia el proximo nivel y su texto. Se usa en Progreso (sobre
// accentSoft), en Perfil y en los cierres de sesion (sobre blanco).
//
// Sin `texto`, dice "720 / 1.000 XP", y en el ultimo nivel no dibuja barra:
// solo "Nivel maximo" y la XP total. Con `texto`, usa ese texto y la barra se
// dibuja siempre, llena en el ultimo nivel.

import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, radius, fontSize, lineHeight } from '@/ui/theme';
import { textoXP } from '@/lib/nivel';
import type { Nivel } from '@/lib/nivel';

interface Props {
  nivel: Nivel;
  /** Sobre que fondo va. Cambia solo la pista. */
  fondo?: 'claro' | 'accentSoft';
  /** Reemplaza el "720 / 1.000 XP". */
  texto?: string;
}

export function BarraNivel({ nivel, fondo = 'claro', texto }: Props) {
  if (texto === undefined && nivel.xpSiguiente === null) {
    return <Text style={estilos.xp}>Nivel máximo · {textoXP(nivel.xpActual)} XP</Text>;
  }

  const leyenda =
    texto ?? `${textoXP(nivel.xpActual)} / ${textoXP(nivel.xpSiguiente ?? nivel.xpActual)} XP`;

  return (
    <View style={estilos.contenedor}>
      <View
        style={[
          estilos.pista,
          { backgroundColor: fondo === 'accentSoft' ? colors.pistaSobreAccentSoft : colors.nivelPista },
        ]}
      >
        <View style={[estilos.relleno, { width: `${nivel.progreso * 100}%` }]} />
      </View>
      <Text style={estilos.xp}>{leyenda}</Text>
    </View>
  );
}

const estilos = StyleSheet.create({
  contenedor: { gap: spacing.xs },
  pista: { height: 8, borderRadius: radius.sm, overflow: 'hidden' },
  relleno: { height: '100%', borderRadius: radius.sm, backgroundColor: colors.nivelRelleno },
  xp: { fontSize: fontSize.small, lineHeight: lineHeight.small, color: colors.textSecondary },
});
