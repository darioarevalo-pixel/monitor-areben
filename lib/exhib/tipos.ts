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
  /**
   * Precio de lista y oferta vigente, los dos de Tienda Nube. `null` = no se sabe (el producto no
   * cruzó con TN); `promo` en `null` = no está en oferta, que es distinto.
   *
   * 🔑 **Salen de TN y no de nuestras campañas de Liquidación**, y no es una comodidad: medido el
   * 15-ago-2026, Gestión Nube tenía **404 promos vivas** en Zattia y la bitácora del Monitor conocía
   * **262** — las otras 142 se cargaron a mano. Leyendo lo nuestro, más de un tercio de las etiquetas
   * a controlar aparecería como "sin oferta" teniéndola, y el recorrido pasaría de largo en silencio.
   *
   * 🔑 **Y TN es espejo fiel de GN**: de los 262 que el Monitor escribió, TN devolvió **262 con el
   * mismo precio**, cero distintos, cero sin cruzar. La cadena es GN → TN, con hasta un día de
   * retraso: un precio cambiado hace una hora puede no estar todavía.
   */
  precio: number | null
  promo: number | null
}

/** Un error de categoría marcado durante el recorrido (se corrige a mano en TN). */
export type ExhibError = { name: string; sku: string; tnId: string | number | null; catTN: string; catCorrecta: string }

export type ExhibEstados = Record<string, ExhibEstado>
export type ExhibErrores = Record<string, ExhibError>

export const SIN_CATEGORIA = '(Sin categoría)'
