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

export type IndiceTn = { bySku: Record<string, TnProducto>; byName: Record<string, TnProducto> }

/**
 * Índice por SKU y por nombre (ambos lower+trim). `soloConImagenes` replica el mapa
 * de fotos del legacy, que sólo indexaba productos con al menos una imagen
 * (index.html:12857). Sin esa opción indexa todos (para el precio promo, P3).
 */
export function indexarTn(products: TnProducto[], opts?: { soloConImagenes?: boolean }): IndiceTn {
  const idx: IndiceTn = { bySku: {}, byName: {} }
  for (const p of products) {
    if (opts?.soloConImagenes && !(p.images || []).filter(Boolean).length) continue
    if (p.sku) idx.bySku[p.sku.toLowerCase().trim()] = p
    if (p.name) idx.byName[p.name.toLowerCase().trim()] = p
  }
  return idx
}

/** El producto GN mínimo para matchear: SKU y nombre. */
export type ClaveGN = { sku?: string | null; name?: string | null }

/**
 * Matchea un producto GN contra el índice TN. Port literal de _mktFindTN
 * (index.html:8832) / tnEntryForProducto (12879): SKU exacto → nombre exacto →
 * todas las palabras de ≥3 letras contenidas en algún nombre TN.
 */
export function matchTn(p: ClaveGN, idx: IndiceTn): TnProducto | null {
  if (p.sku) {
    const h = idx.bySku[p.sku.toLowerCase().trim()]
    if (h) return h
  }
  if (p.name) {
    const nameLower = p.name.toLowerCase().trim()
    if (idx.byName[nameLower]) return idx.byName[nameLower]
    const palabras = nameLower.split(/\s+/).filter((w) => w.length >= 3)
    if (palabras.length) {
      for (const tnName of Object.keys(idx.byName)) {
        if (palabras.every((w) => tnName.includes(w))) return idx.byName[tnName]
      }
    }
  }
  return null
}

/** Todas las fotos del producto matcheado (index.html:12906). */
export function imagenesDe(p: ClaveGN, idx: IndiceTn): string[] {
  return (matchTn(p, idx)?.images || []).filter(Boolean)
}

/** La primera foto, o null (thumbnail de la tabla, index.html:12900). */
export function imagenDe(p: ClaveGN, idx: IndiceTn): string | null {
  return imagenesDe(p, idx)[0] || null
}
