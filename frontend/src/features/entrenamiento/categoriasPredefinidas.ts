// src/features/entrenamiento/categoriasPredefinidas.ts
//
// Como se agrupan las rutinas predefinidas en pantalla. Lo usan la biblioteca
// (app/rutina-gimnasio/predefinidas.tsx) y el sheet de Mi semana, asi las dos
// muestran las mismas secciones en el mismo orden.

import type { CategoriaRutinaPredefinida } from '@/db/schema';

export const CATEGORIAS_PREDEFINIDAS: {
  valor: CategoriaRutinaPredefinida;
  titulo: string;
  detalle: string;
}[] = [
  { valor: 'principiante', titulo: 'Principiante', detalle: 'Para empezar o volver a entrenar' },
  { valor: 'split', titulo: 'Split intermedio', detalle: 'Un grupo de músculos por día' },
  { valor: 'especifica', titulo: 'Específicas', detalle: 'Sesiones enfocadas en dos grupos' },
];
