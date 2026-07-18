/**
 * Tipos de Etiquetas: impresión de etiquetas 5×2,5 cm (Code 128) para depósito,
 * local (con precio), promo, SKU, y una etiqueta libre. Port del bloque
 * index.html:6628-7209.
 */

/** Los cuatro modos de la tabla de productos (libre es un editor aparte). */
export type ModoEtiqueta = 'dep' | 'loc' | 'promo' | 'sku'

/** La variante etiquetable, tal como viene de `allVariantes` del ETL. */
export type VarianteEti = {
  id: string
  pid: string
  name: string
  size: string
  sku: string
  barcode: string
  stock: number
}

/** Cantidades cargadas por modo: id de variante → cantidad. */
export type Cantidades = Record<string, number>

/** Precio final por producto (pid → precio) y promo (pid → {normal, promo}). */
export type MapaPrecios = Record<string, number>
export type Promo = { normal: number; promo: number }
export type MapaPromo = Record<string, Promo>

/** Una línea de la etiqueta de formas de pago / etiqueta libre. */
export type LineaEtiqueta = { texto: string; tam: 'titulo' | 'subtitulo' | 'normal' | 'chico'; bold: boolean }

/** Un elemento de la secuencia de impresión: una variante, un separador (null) o la etiqueta de formas de pago. */
export type LabelItem = VarianteEti | null | { __fp: true }

/** Config del PDF libre. */
export type LibreConfig = {
  grande: boolean
  copias: number
  barcode: string
  precio: number | null
  lineas: LineaEtiqueta[]
}
