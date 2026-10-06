// src/features/nivel/components/InsigniaNivel.tsx
//
// La insignia de cada nivel. Los PNG vienen hechos (288 px, 3x de 96) y no se
// redibujan ni se recolorean.
//
// Un require literal por nivel: Metro resuelve los assets al compilar y no
// acepta una ruta armada en el momento.

import { Image } from 'react-native';
import type { ImageSourcePropType } from 'react-native';
import { NIVELES } from '@/lib/nivel';

const INSIGNIAS: Record<number, ImageSourcePropType> = {
  1: require('@/assets/images/niveles/nivel_1.png'),
  2: require('@/assets/images/niveles/nivel_2.png'),
  3: require('@/assets/images/niveles/nivel_3.png'),
  4: require('@/assets/images/niveles/nivel_4.png'),
  5: require('@/assets/images/niveles/nivel_5.png'),
};

const ULTIMO = NIVELES[NIVELES.length - 1].nivel;

interface Props {
  nivel: number;
  tamano?: number;
}

export function InsigniaNivel({ nivel, tamano = 48 }: Props) {
  // Pasado el ultimo nivel se usa la del ultimo; por debajo de 1, la del 1.
  const n = Math.min(Math.max(1, Math.floor(nivel)), ULTIMO);
  const nombre = NIVELES.find((x) => x.nivel === n)?.nombre ?? '';

  return (
    <Image
      source={INSIGNIAS[n]}
      style={{ width: tamano, height: tamano }}
      resizeMode="contain"
      accessibilityRole="image"
      accessibilityLabel={`Nivel ${n}, ${nombre}`}
    />
  );
}
