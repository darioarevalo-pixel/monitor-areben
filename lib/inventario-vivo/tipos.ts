/**
 * Tipos de inventario-vivo: el stock por depósito/ubicación leído en VIVO de GN
 * (endpoint propio `/api/inventario-vivo`), con fallback al espejo Supabase. Es el
 * cimiento de los conteos de la Tanda D (conteo-deposito, conteo-estandar). Port de
 * la forma que devuelve `api/inventario-vivo.js` (rows) y consume `_cdepFetchVivo`
 * (index.html:11633).
 */

/**
 * Una fila del inventario en vivo. `inventory_id` es el `id_inventario` del Excel de
 * GN — NULL si la fila vino del espejo (no confiable para ajustar). `fuente`
 * distingue vivo/directo/espejo.
 */
export type FilaVivo = {
  inventory_id: number | string | null
  product_id: number | string
  product_name: string
  product_code?: string
  size_id: number | string
  size_name: string
  store_name: string
  sku?: string
  barcode?: string
  available_quantity: number
  fuente?: 'vivo' | 'directo' | 'espejo'
}

/** La respuesta completa de `/api/inventario-vivo`. */
export type RespuestaVivo = {
  ok: boolean
  error?: string
  store?: string
  loc?: string
  store_id?: number | string
  store_name?: string
  count?: number
  rows: FilaVivo[]
}
