/**
 * Precios de campaña, la cara tipada.
 *
 * ⚠️ **La regla no vive acá: vive en `lib/precios/core.core.js`**, en JS plano, porque la arma
 * `api/_precios.js` y los handlers no pueden importar TypeScript. Misma forma que
 * `lib/liquidacion/colgadas.ts` sobre `colgadas.core.js`.
 */

import type { LiquidacionItem } from '@/lib/liquidacion'
import {
  compartidaConMarketing as compartidaJs,
  desglosarInventario as desglosarJs,
  tieneVariantes as tieneVariantesJs,
  VARIANTE_UNICA as VARIANTE_UNICA_JS,
  descuentoDe as descuentoDeJs,
  esFirme as esFirmeJs,
  ESTADOS_VISIBLES as ESTADOS_VISIBLES_JS,
  listaParaMarketing as listaJs,
  paraMarketing as paraMarketingJs,
} from './core.core.js'
import type { PrecioItem, VariantePrecio } from './tipos'

/** Lo que sale de la lista blanca, sin lo que le pega el handler (`stock`, `estrella`). */
export type PrecioProyectado = Omit<PrecioItem, 'stock' | 'estrella'>

export const ESTADOS_VISIBLES = ESTADOS_VISIBLES_JS as readonly string[]
export const esFirme = esFirmeJs as (estado: string) => boolean
export const descuentoDe = descuentoDeJs as (item: LiquidacionItem) => number | null
export const paraMarketing = paraMarketingJs as (item: LiquidacionItem) => PrecioProyectado
export const listaParaMarketing = listaJs as (items: LiquidacionItem[]) => PrecioProyectado[]
export const compartidaConMarketing = compartidaJs as (
  campania: { estado: string; datos?: { compartida?: boolean } | null },
) => boolean

/** Una fila cruda de `inventario`, como la lee el handler. */
export interface FilaInventario {
  product_id: number | string
  size_name: string | null
  store_name: string | null
  available_quantity: number | null
}

export const VARIANTE_UNICA = VARIANTE_UNICA_JS as string

export const desglosarInventario = desglosarJs as (filas: FilaInventario[]) => {
  porPid: Record<string, { total: number; variantes: VariantePrecio[] }>
  tiendas: string[]
}

/** ¿Hay algo que desplegar? Un producto sin variantes trae un solo renglón, y no cuenta. */
export const tieneVariantes = tieneVariantesJs as (
  desglose: { variantes: VariantePrecio[] } | null | undefined,
) => boolean
