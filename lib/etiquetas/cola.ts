/**
 * La cola de reetiquetado, la cara tipada.
 *
 * ⚠️ **La regla no vive acá: vive en `lib/etiquetas/cola.core.js`**, en JS plano, porque la arma
 * `api/_liquidacion.js` y los handlers no pueden importar TypeScript. Misma forma que
 * `lib/permisos.ts` sobre `lib/permisos.core.js`.
 */

import { armarCola as armarColaJs, precioQueQuedo as precioQueQuedoJs, sinEtiquetar as sinEtiquetarJs, STOCK_MINIMO as STOCK_MINIMO_JS } from './cola.core.js'

/** Un cambio de precio, tal como sale de la bitácora. Sólo el último de cada producto. */
export interface EventoDePrecio {
  pid: string
  producto: string
  sku: string | null
  /** ISO. */
  cuando: string
  /** La oferta que quedó puesta. `null` = quedó a precio de lista. */
  precioA: number | null
  precioLista: number | null
  /** De qué campaña vino, si vino de alguna. Sirve de filtro, no de condición. */
  liqNombre: string | null
  modo: 'poner' | 'sacar'
}

/** Una fila de la cola: el evento, más en qué estado está su etiqueta. */
export interface FilaCola extends EventoDePrecio {
  stock: number
  /** ISO de la última vez que se dio por hecha, o `null` si nunca. */
  impresaEn: string | null
  alDia: boolean
}

export interface Cola {
  /** Con stock y con la etiqueta atrasada: lo que hay que hacer. Lo más viejo primero. */
  pendientes: FilaCola[]
  /** Ya etiquetadas después del último cambio de precio. */
  hechas: FilaCola[]
  /** Cambiaron de precio pero no queda una unidad: no hay prenda que etiquetar. */
  sinStock: FilaCola[]
}

export const STOCK_MINIMO = STOCK_MINIMO_JS as number

export const armarCola = armarColaJs as (
  eventos: EventoDePrecio[],
  impresasPorPid: Record<string, string>,
  stockPorPid: Record<string, number>,
) => Cola

/** Las pendientes lo bastante viejas como para sospechar que la prenda no está exhibida. */
export const sinEtiquetar = sinEtiquetarJs as (
  pendientes: FilaCola[],
  ahoraMs: number,
  diasParaSospechar?: number,
) => FilaCola[]

export const precioQueQuedo = precioQueQuedoJs as (ev: Pick<EventoDePrecio, 'precioA'> | null) => number | null
