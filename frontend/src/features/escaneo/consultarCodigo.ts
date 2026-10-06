// src/features/escaneo/consultarCodigo.ts
//
// De un codigo de barras a un producto: primero la base local, despues Open
// Food Facts. Lo que se encuentra afuera se guarda enseguida, asi la proxima
// vez esta aunque no haya senal. Salio de app/comida/escanear.tsx.

import { guardarAlimento, obtenerAlimentoPorCodigoBarras, completarCategoriasEscaneado } from '../../db/queries/alimentos';
import { randomUUID } from '../../db/sync/uuid';
import { detectarCoccion } from '../../lib/coccion';
import { generarPorcionesAutomaticas, generarPorcionesPaquete } from '../comidas/porciones';
import type { PorcionTipica } from '../../db/schema';
import type { EstadoCoccion } from '../../lib/coccion';
import { pedirCategoriasOff, pedirProductoOff } from './openFoodFacts';
import type { ProductoEscaneado, RescateProducto } from './openFoodFacts';

export type ResultadoConsulta =
  | {
      tipo: 'detectado';
      producto: ProductoEscaneado;
      /** Guardado antes de que existiera la coccion: hay que revisarlo una vez. */
      revisarAlimentoId: string | null;
    }
  | { tipo: 'no_encontrado'; rescate: RescateProducto }
  | { tipo: 'sin_conexion' };

export async function consultarCodigo(codigoCrudo: string, version: string): Promise<ResultadoConsulta> {
  const codigo = codigoCrudo.trim();

  // 1. La base local. Un error aca no corta: se sigue con la red.
  try {
    const existente = await obtenerAlimentoPorCodigoBarras(codigo);
    if (existente) {
      const porciones =
        existente.porciones && existente.porciones.length > 0
          ? existente.porciones
          : generarPorcionesAutomaticas(existente.nombre);
      return {
        tipo: 'detectado',
        producto: {
          codigo: existente.codigo_barras || codigo,
          nombre: existente.nombre,
          marca: existente.marca,
          kcal100g: existente.kcal_por_100g,
          proteina100g: existente.proteina_g,
          carbos100g: existente.carbohidratos_g,
          grasa100g: existente.grasa_g,
          fibra100g: existente.fibra_g,
          macroFaltante: null,
          porciones,
          fuente: existente.fuente,
          verificado: Boolean(existente.verificado),
          coccion:
            existente.estado_base && existente.factor_coccion
              ? { estado_base: existente.estado_base, factor_coccion: existente.factor_coccion }
              : null,
          categoria: existente.categoria,
        },
        // Tambien los corregidos a mano (fuente 'manual' con codigo): siguen
        // siendo un producto de Open Food Facts, con valores de paquete.
        revisarAlimentoId:
          existente.codigo_barras && !existente.categorias_revisadas ? existente.id : null,
      };
    }
  } catch (e) {
    console.warn('Error al consultar la base local:', e);
  }

  // 2. Open Food Facts.
  let lectura;
  try {
    lectura = await pedirProductoOff(codigo, version);
  } catch {
    // Sin red o se agotaron los 8 s.
    return { tipo: 'sin_conexion' };
  }
  if (lectura.tipo === 'no_encontrado') return { tipo: 'no_encontrado', rescate: lectura.rescate };

  const p = lectura.producto;
  try {
    await guardarAlimento({
      id: randomUUID(),
      nombre: p.nombre,
      marca: p.marca,
      codigo_barras: codigo,
      kcal_por_100g: p.kcal100g,
      proteina_g: p.proteina100g ?? 0,
      carbohidratos_g: p.carbos100g ?? 0,
      grasa_g: p.grasa100g ?? 0,
      fibra_g: p.fibra100g,
      fuente: 'open_food_facts',
      verificado: false,
      porciones: p.porciones,
      categoria: p.categoria,
      coccion: p.coccion,
      categorias_revisadas: true,
    });
  } catch (e) {
    console.error('Error al guardar el alimento escaneado:', e);
  }
  return { tipo: 'detectado', producto: p, revisarAlimentoId: null };
}

/**
 * Revision unica de categorias de un producto guardado antes de la coccion.
 * Si se cocina, completa la fila y devuelve lo nuevo para la pantalla; si no,
 * la marca como revisada y devuelve null. Sin red no marca nada: se reintenta
 * en el proximo escaneo. Nunca tira.
 */
export async function revisarCategorias(
  alimentoId: string,
  codigo: string,
  version: string,
): Promise<{ coccion: { estado_base: EstadoCoccion; factor_coccion: number }; porciones: PorcionTipica[] } | null> {
  const r = await pedirCategoriasOff(codigo, version);
  if (!r) return null;

  const det = detectarCoccion(r.categorias);
  const porciones = det ? generarPorcionesPaquete(det.porcionSecaG, r.quantity) : null;
  const coccion = det ? { estado_base: 'crudo' as const, factor_coccion: det.factor } : null;

  try {
    await completarCategoriasEscaneado(alimentoId, coccion && porciones ? { ...coccion, porciones } : null);
  } catch (e) {
    console.warn('No se pudo completar la revision de categorias:', e);
    return null;
  }
  return coccion && porciones ? { coccion, porciones } : null;
}
