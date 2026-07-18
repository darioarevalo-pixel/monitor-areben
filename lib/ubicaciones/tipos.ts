/**
 * Tipos de Ubicaciones (Depósito Minorista, BDI): la ubicación física (formato
 * NN-N) de cada producto, guardada en la observación de GN, en todas sus variantes.
 * Port del modelo de ubicacionesInit (index.html:14393-14430).
 */

/** Fila cruda de inventario (una por variante) que se lee de Supabase. */
export type FilaInvUbi = {
  product_id: number | string
  product_name: string | null
  sku: string | null
  store_name: string | null
  observation: string | number | null
}

/** Un producto con su ubicación dominante y el diagnóstico de sus variantes. */
export type UbiProducto = {
  product_id: number | string
  name: string
  sku: string
  /** La ubicación NN-N dominante (la más frecuente entre las variantes válidas), o ''. */
  actual: string
  /** Valores no vacíos distintos entre las variantes (para el aviso). */
  valores: string[]
  /** Cantidad de variantes. */
  nvar: number
  /** Las variantes NO tienen todas el mismo valor. */
  inconsistente: boolean
  /** Tiene códigos pero ninguno es NN-N (formato viejo → cargar a mano). */
  malFormato: boolean
  /** Desparejo pero con un NN-N dominante → 🔧 Reparar lo arregla solo. */
  reparable: boolean
}
