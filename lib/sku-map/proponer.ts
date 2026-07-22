/**
 * Poblado del mapeo SKU a nivel VARIANTE (talle). El SKU real y único vive por variante en los dos
 * lados y COINCIDE (`STU-REM-0001-S` en el `inventario` de GN == el sku de esa variante en TN), así
 * que el match es por **SKU exacto** (confiable, verde), con fallback por **código de barras**.
 *
 * Es puro: no hace fetch. El caller baja las variantes STU del mirror de GN (`inventario`) y las de
 * TN (`tiendanube-audit?store=stunned&variantes=1`), las aplana y las pasa acá. El resultado se sube
 * con guardarMapeo() para revisión; el sync (Fase 1) solo usará las filas validadas.
 */

import type { MatchMetodo, SkuMapRow, SkuStore } from './tipos'

/** Variante de GN (del mirror `inventario`). */
export type GnVar = {
  sku: string
  barcode?: string | null
  name?: string | null // nombre del producto (referencia visual)
  gn_product_id?: string | null
  gn_variant_id?: string | null
}

/** Variante de TN (aplanada de `tiendanube-audit?variantes=1`). `tn_variant_id` recién llega cuando
 * el endpoint de bdi-catalogo expone `id` por variante; hasta entonces queda null. */
export type TnVar = {
  sku?: string | null
  barcode?: string | null
  tn_variant_id?: string | null
  tn_product_id?: string | null
}

const norm = (s?: string | null) => String(s || '').toLowerCase().trim()

export type PropuestaMapeo = {
  filas: SkuMapRow[] // propuestas (validado=false), listas para guardarMapeo()
  sinMatch: GnVar[] // variantes GN sin par en TN (cola de pendientes)
}

export function proponerMapeo(store: SkuStore, gn: GnVar[], tn: TnVar[], tnStore: string): PropuestaMapeo {
  const porSku = new Map<string, TnVar>()
  const porBarcode = new Map<string, TnVar>()
  for (const v of tn) {
    if (v.sku) porSku.set(norm(v.sku), v)
    if (v.barcode) porBarcode.set(norm(v.barcode), v)
  }

  const filas: SkuMapRow[] = []
  const sinMatch: GnVar[] = []
  const vistos = new Set<string>() // el mirror de inventario repite el SKU por depósito/local

  for (const g of gn) {
    if (!g.sku) continue
    const skuKey = String(g.sku)
    if (vistos.has(skuKey)) continue
    vistos.add(skuKey)

    let hit = porSku.get(norm(g.sku))
    let metodo: MatchMetodo = 'sku'
    if (!hit && g.barcode) {
      hit = porBarcode.get(norm(g.barcode))
      if (hit) metodo = 'barcode'
    }
    if (!hit) {
      sinMatch.push(g)
      continue
    }

    filas.push({
      store,
      sku: skuKey,
      gn_product_id: g.gn_product_id ?? null,
      gn_variant_id: g.gn_variant_id ?? null,
      tn_store: tnStore,
      tn_product_id: hit.tn_product_id ?? null,
      tn_variant_id: hit.tn_variant_id ?? null,
      match_metodo: metodo,
      validado: false,
    })
  }

  return { filas, sinMatch }
}
