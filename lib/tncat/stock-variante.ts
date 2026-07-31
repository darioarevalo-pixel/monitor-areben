/**
 * Stock real por variante de TiendaNube, cruzando con Gestión Nube por código.
 *
 * **Por qué no se usa el stock que ya trae el payload de TiendaNube:** es de UN solo depósito, y
 * distinto en cada marca. Medido variante por variante el 31-jul-2026: el stock de TN coincide con
 * el Depósito Minorista de GN en el 93% de los casos en BDI, y con el Local en el 98% en Zattia.
 * Contra el total (local + depósito) coincide en 38% y 85%. Usarlo sería subcontar con un sesgo
 * distinto por marca — y en BDI el Depósito tiene 28.994 unidades contra 2.703 del Local, así que
 * el error no es ni parejo ni chico.
 *
 * **Por qué el cruce va por código y no por nombre:** el resto de tncat cruza a nivel producto con
 * `matchTn`, que es difuso (SKU → nombre exacto → todas las palabras contenidas). Para el stock por
 * color hace falta llegar a la variante, y ahí el único criterio confiable es el código exacto —el
 * mismo que usa `proponerMapeo` (`lib/sku-map/proponer.ts`): SKU y, si no, código de barras.
 * Cobertura medida: **BDI 89,5%** (63% por SKU + 27% por barcode) y **Zattia 73,3%** (72% + 1%).
 *
 * Lo que no cruza vale `undefined`, **nunca 0**: un cero se lee como "no hay stock" y haría
 * descartar un producto que sí hay que fotografiar. Es el mismo criterio de `aplicarRecortes`.
 *
 * Se devuelve el total (local + depósito, con Mayorista ya excluido por el ETL) **y nada más**:
 * esta pantalla decide a qué sacarle foto, no de dónde retirarlo. Eso es de la solicitud.
 */

import type { Variante } from '@/lib/etl/tipos'
import type { ProductoFchk, VarianteFchk } from './tipos'

export type IndiceStock = {
  bySku: Map<string, number>
  byBarcode: Map<string, number>
}

const norm = (s: string | null | undefined): string => String(s ?? '').toLowerCase().trim()

/**
 * Índice de stock de Gestión Nube por SKU y por código de barras.
 *
 * Hay que pasarle `allVariantes` **y** `allVariantesHuerfanas ?? []`: las huérfanas son variantes
 * con stock cuyo producto todavía no está en `productos` (recién cargado en GN), y son justamente
 * las que más chance tienen de no tener foto.
 *
 * Se suma en vez de pisar porque dos variantes distintas pueden compartir código —pasa cuando se
 * duplica un producto en GN— y quedarse con la última escondería unidades.
 */
export function indexarStockGn(variantes: Variante[]): IndiceStock {
  const bySku = new Map<string, number>()
  const byBarcode = new Map<string, number>()
  for (const v of variantes) {
    const stock = v.stock || 0
    // En el ETL los códigos faltantes son `''`, no null: sin este filtro el vacío matchearía todo.
    const sku = norm(v.sku)
    if (sku) bySku.set(sku, (bySku.get(sku) ?? 0) + stock)
    const barcode = norm(v.barcode)
    if (barcode) byBarcode.set(barcode, (byBarcode.get(barcode) ?? 0) + stock)
  }
  return { bySku, byBarcode }
}

/** Unidades de una variante de TiendaNube. `undefined` = no se pudo cruzar con Gestión Nube. */
export function stockDeVariante(v: VarianteFchk, idx: IndiceStock): number | undefined {
  const sku = norm(v.sku)
  if (sku) {
    const s = idx.bySku.get(sku)
    if (s !== undefined) return s
  }
  const barcode = norm(v.barcode)
  if (barcode) {
    const b = idx.byBarcode.get(barcode)
    if (b !== undefined) return b
  }
  return undefined
}

/**
 * Unidades por color. `undefined` para un color en el que **ninguna** de sus variantes cruzó: no
 * es lo mismo "no hay stock" que "no lo pudimos averiguar". Si cruzó alguna, se suman las que
 * cruzaron (mejor un piso que nada).
 */
export function stockPorColor(p: ProductoFchk, idx: IndiceStock): Map<string, number | undefined> {
  const out = new Map<string, number | undefined>()
  for (const v of p.variantes || []) {
    if (!v.color) continue
    const s = stockDeVariante(v, idx)
    if (s === undefined) {
      if (!out.has(v.color)) out.set(v.color, undefined)
      continue
    }
    out.set(v.color, (out.get(v.color) ?? 0) + s)
  }
  return out
}

/**
 * Unidades que están esperando una foto: las variantes **con color y sin foto propia**.
 *
 * Es el número del tablero. Se cuentan solo las que tienen color porque una variante sin color usa
 * la foto principal del producto, que para un producto de un solo color es la correcta.
 */
export function unidadesSinFoto(p: ProductoFchk, idx: IndiceStock): number | undefined {
  let total: number | undefined
  for (const v of p.variantes || []) {
    if (!v.color || v.image_url) continue
    const s = stockDeVariante(v, idx)
    if (s === undefined) continue
    total = (total ?? 0) + s
  }
  return total
}
