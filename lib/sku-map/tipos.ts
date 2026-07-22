/**
 * Tipos del mapeo estable de SKU entre GN y TN (tabla sku_map, ver sql/migrate-sku-map.sql).
 * `store` es más amplio que `Marca` a propósito: Stunned todavía no es una Marca de primera
 * clase, pero ya vive en el mapeo (línea STU dentro del GN de Zattia).
 */

export type SkuStore = 'bdi' | 'zattia' | 'stunned'

/** Cómo se propuso el match GN↔TN (para poder auditar y priorizar la validación). */
export type MatchMetodo = 'sku' | 'barcode' | 'nombre' | 'palabras' | 'manual'

export type SkuMapRow = {
  id?: number
  store: SkuStore
  sku: string
  // Identificadores GN (leer stock + crear ventas que descuentan):
  gn_product_id?: string | null
  gn_variant_id?: string | null
  gn_inventory_id?: string | null
  // Identificadores TN (escribir stock absoluto + crear órdenes):
  tn_store?: string | null
  tn_product_id?: string | null
  tn_variant_id?: string | null
  // Trazabilidad + estado:
  match_metodo?: MatchMetodo | null
  validado?: boolean
  nota?: string | null
  updated_at?: string
  created_at?: string
}
