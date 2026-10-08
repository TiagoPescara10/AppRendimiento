// src/features/guias/cardInicio.ts
//
// La card de Inicio que invita a mirar las guias. Se muestra hasta que el
// usuario la cierra o la toca; despues no vuelve. La marca vive en meta, como
// la del bono mensual: es estado de la app en este telefono, no del perfil.

import { getDb } from '@/db/schema';
import { leerMeta, escribirMeta } from '@/db/meta';

const CLAVE = 'guias_card_inicio_cerrada';

export async function mostrarCardGuias(): Promise<boolean> {
  return !(await leerMeta(getDb(), CLAVE));
}

export async function cerrarCardGuias(): Promise<void> {
  await escribirMeta(getDb(), CLAVE, '1');
}
