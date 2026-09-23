import { Text, StyleSheet } from 'react-native';
import type { ReactNode } from 'react';
import { Pantalla } from '@/ui/Pantalla';
import { Progreso } from '@/ui/Progreso';
import { Boton } from '@/ui/Boton';
import { colors, spacing, fontSize, lineHeight } from '@/ui/theme';

//Definimos los props que le vamos a pasar al componente PasoOnboarding. Esto nos permite tener un control más estricto sobre los datos que recibe el componente y facilita la lectura del código.
type Props = {
  paso: number;
  totalPasos: number;
  titulo: string;
  subtitulo?: string;
  children: ReactNode;
  onSiguiente: () => void;
  puedeSeguir?: boolean;
  guardando?: boolean;
  textoBoton?: string;
};

export function PasoOnboarding({
  paso,
  totalPasos,
  titulo,
  subtitulo,
  children,
  onSiguiente,
  puedeSeguir = true,
  guardando = false,
  textoBoton = 'Continuar',
}: Props) {
  return (
    <Pantalla>
      <Progreso actual={paso} total={totalPasos} />
      <Text style={estilos.titulo}>{titulo}</Text>
      {subtitulo && <Text style={estilos.subtitulo}>{subtitulo}</Text>}

      {children}

      <Boton titulo={textoBoton} onPress={onSiguiente} cargando={guardando} disabled={!puedeSeguir} />
    </Pantalla>
  );
}

const estilos = StyleSheet.create({
  titulo: {
    fontSize: fontSize.title,
    lineHeight: lineHeight.title,
    fontWeight: 'bold',
    color: colors.textPrimary,
  },
  subtitulo: {
    fontSize: fontSize.body,
    lineHeight: lineHeight.body,
    color: colors.textSecondary,
    marginTop: -spacing.xs,
  },
});