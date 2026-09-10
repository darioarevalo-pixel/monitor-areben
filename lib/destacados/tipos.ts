/**
 * Productos estrella — la cara tipada. La regla vive en `lib/destacados/core.js` (JS plano, porque
 * la usa `api/_destacados.js`).
 */

import { ambitoDe as ambitoDeJs, idDestacado as idJs, indicePorPid as indiceJs } from './core.js'

/** Una estrella, tal como sale del handler. */
export interface Destacado {
  id: string
  store: string
  producto_id: number
  /** `null` = estrella general del producto. Un id de campaña = estrella de esa acción comercial. */
  liq_id: string | null
  sku: string | null
  nombre: string | null
  /** Por qué es estrella: el brief de quien la marcó. */
  nota: string | null
  marcada_en: string
  marcada_por: string | null
  sacada_en: string | null
  sacada_por: string | null
}

export const ambitoDe = ambitoDeJs as (raw: string | null | undefined) => string | null
export const idDestacado = idJs as (store: string, pid: number, liqId: string | null, iso: string) => string
export const indicePorPid = indiceJs as (filas: Destacado[]) => Record<string, Destacado>
