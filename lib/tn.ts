/**
 * Capa TiendaNube: matcheo de un producto de Gestión Nube contra el catálogo de TN
 * (fotos + precio promo). Port de tnEntryForProducto/cargarImagenesTN
 * (index.html:12847-12897) y _mktIndexTN/_mktFindTN (8823-8848), unificados: el
 * legacy baja `tiendanube-audit` DOS veces (una para fotos en `tnImageMaps`, otra
 * para promo en `_mktTNData`); acá se baja una sola vez y se derivan los dos usos.
 *
 * El matcheo es idéntico en ambos originales: por SKU, luego por nombre exacto,
 * luego por "todas las palabras ≥3 letras contenidas". Este módulo es puro; el
 * fetch + caché por marca vive en `components/productos/useTnImages.ts`.
 */

/** Un producto del payload de `tiendanube-audit` (solo los campos que se usan). */
export type TnProducto = {
  id?: string | number
  sku?: string | null
  name?: string | null
  images?: string[]
  /** Precio normal y promocional de TN. Los consume Etiquetas (precio de la etiqueta de local/promo). */
  price?: number
  promo_price?: number
  // Campos ricos que consume Tabla de talles (gen-talles): la descripción cruda
  // para leer/mostrar la tabla vieja, las categorías y las señales de calidad de la
  // lista de pendientes. Opcionales: el resto de los consumidores no los mira.
  raw_desc?: string
  categories?: string[]
  has_desc?: boolean
  published?: boolean
  image_count?: number
  created_at?: string
  // Campos que consume Marketing (auditoría de fotos por variante + links). El
  // handle arma la URL pública; los variantes_* alimentan el filtro "variantes sin
  // foto propia" y la fila de detalle. Opcionales: el resto no los mira.
  handle?: string
  variantes_total?: number
  variantes_con_foto?: number
  variantes_sin_foto?: string[]
}

export type IndiceTn = {
  bySku: Record<string, TnProducto>
  byName: Record<string, TnProducto>
  /** Sólo en el índice de fotos: los que están en la tienda SIN foto. Ver `matchTn`. */
  sinFoto?: { bySku: Record<string, true>; byName: Record<string, true> }
}

/** El producto GN mínimo para matchear: SKU y nombre. */
export type ClaveGN = { sku?: string | null; name?: string | null }

// 🔑 La implementación vive en `lib/tn-match.core.js` (JS plano, la importa también el parte de la
// mañana). Acá sólo se le ponen los tipos: ⛔ se copia.
import * as nucleo from './tn-match.core.js'

/** Índice por SKU y por nombre. Ver `lib/tn-match.core.js`. */
export const indexarTn: (products: TnProducto[], opts?: { soloConImagenes?: boolean }) => IndiceTn = nucleo.indexarTn
/** SKU exacto → nombre exacto → palabras. Ver `lib/tn-match.core.js`. */
export const matchTn: (p: ClaveGN, idx: IndiceTn) => TnProducto | null = nucleo.matchTn
/** Todas las fotos del producto matcheado. */
export const imagenesDe: (p: ClaveGN, idx: IndiceTn) => string[] = nucleo.imagenesDe
/** La primera foto, o null. */
export const imagenDe: (p: ClaveGN, idx: IndiceTn) => string | null = nucleo.imagenDe
