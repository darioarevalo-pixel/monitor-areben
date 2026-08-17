/**
 * Las ofertas colgadas, la cara tipada.
 *
 * ⚠️ **La regla no vive acá: vive en `lib/liquidacion/colgadas.core.js`**, en JS plano, porque la
 * arma `api/_liquidacion.js` y los handlers no pueden importar TypeScript. Misma forma que
 * `lib/liquidacion/bitacora.ts` sobre `bitacora.core.js`.
 */

import {
  ofertasColgadas as ofertasColgadasJs,
  ESTADOS_VIVA as ESTADOS_VIVA_JS,
} from './colgadas.core.js'

/** Por qué la oferta no debería seguir puesta, de peor a menos peor. */
export type MotivoColgada = 'fuera-de-alcance' | 'campania-cerrada' | 'vigencia-vencida'

/** El último movimiento de precio de un producto, como lo guarda la bitácora. */
export interface UltimoMovimiento {
  pid: string
  producto: string
  sku: string | null
  liqId: string
  liqNombre: string
  /** Lo que quedó puesto. `null` = quedó a precio de lista, y entonces no hay nada colgado. */
  precioA: number | null
  /** ISO. */
  cuando: string
}

/** Una oferta que sigue escrita en Gestión Nube sin campaña viva que la justifique. */
export interface OfertaColgada {
  pid: string
  producto: string
  sku: string | null
  liqId: string
  liqNombre: string
  /** El precio que está puesto en la tienda ahora mismo. */
  precio: number
  cuando: string
  motivo: MotivoColgada
  /** Unidades de hoy. Con stock se está vendiendo barato ahora; sin stock, está latente. */
  stock: number
  /**
   * Si el botón «sacar» de la campaña puede alcanzarlo. `false` = el producto ya no está como
   * `aplicado` en ninguna campaña y hay que sacarle la oferta a mano en Gestión Nube.
   */
  seSacaDesdeAca: boolean
}

export interface Colgadas {
  colgadas: OfertaColgada[]
  conStock: number
  sinStock: number
}

export const ESTADOS_VIVA = ESTADOS_VIVA_JS as readonly string[]

export const ofertasColgadas = ofertasColgadasJs as (
  eventos: UltimoMovimiento[],
  campanias: Record<string, { nombre: string; estado: string; hasta: string | null }>,
  aplicadosHoy: Record<string, boolean>,
  stockPorPid: Record<string, number>,
  hoy: string,
) => Colgadas
