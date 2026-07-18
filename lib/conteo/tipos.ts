/**
 * Tipos del Conteo de local por código de barras (BDI). Conteo físico por escáner
 * contra el stock del sistema (espejo Supabase del Local), agrupado por modelo/
 * categoría. El ajuste NO se genera de cero: se COMPLETA el Excel "Inventario Actual"
 * exportado de GN (rellena `nuevo_stock` con lo contado, solo Local + grupos
 * marcados). Port de index.html:11355-11548.
 */

/** Una variante contable del Local. */
export type ConteoVar = {
  vid: string
  pid: string
  name: string
  size: string
  barcode: string
  grupo: string
  /** Stock del sistema (suma de available_quantity del Local). */
  esperado: number
}

/** Fila cruda del inventario del Local (espejo Supabase). */
export type FilaInvLocal = {
  product_id: number | string
  product_name?: string
  size_id: number | string
  size_name?: string
  barcode?: string
  available_quantity?: number
  store_name?: string
}

/** vid → cantidad contada (persistido en localStorage). */
export type ConteoCount = Record<string, number>
