/**
 * Chequeo de exhibición del Local (Zattia): recorrer el local con el lector físico
 * y confirmar que cada variante con stock está colgada. Todo local (localStorage
 * `monitor_exhib_<cuenta>` + `monitor_exhib_err_<cuenta>`): estados de escaneo y
 * "categorías a corregir en TN". Read-only sobre Supabase/TN; no escribe stock ni GN.
 * Port de index.html:7564-7945.
 */

export type ExhibEstado = 'exhibido' | 'solucionado' | 'una-unidad' | 'no-encuentra'

export type ExhibItem = {
  barcode: string
  sku: string
  productId: string
  name: string
  size: string
  qty: number
  img: string | null
  /** Categoría TN "limpia" elegida (o reasignada por un error marcado). */
  cat: string
  /** Todas las categorías TN limpias del producto (para detectar cruces de categoría). */
  cleanCats: string[]
  tnId: string | number | null
}

/** Un error de categoría marcado durante el recorrido (se corrige a mano en TN). */
export type ExhibError = { name: string; sku: string; tnId: string | number | null; catTN: string; catCorrecta: string }

export type ExhibEstados = Record<string, ExhibEstado>
export type ExhibErrores = Record<string, ExhibError>

export const SIN_CATEGORIA = '(Sin categoría)'
