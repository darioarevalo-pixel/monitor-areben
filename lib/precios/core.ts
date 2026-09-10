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
  descuentoDe as descuentoDeJs,
  esFirme as esFirmeJs,
  ESTADOS_VISIBLES as ESTADOS_VISIBLES_JS,
  listaParaMarketing as listaJs,
  paraMarketing as paraMarketingJs,
} from './core.core.js'
import type { PrecioItem } from './tipos'

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
