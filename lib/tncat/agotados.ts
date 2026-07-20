/**
 * Candidatos a ocultar en TiendaNube: productos AGOTADOS (stock GN = 0) que siguen
 * PUBLICADOS en la tienda. El agotado sale del ETL (GN, fuente de verdad); el `id` y el
 * `published` de TN salen del índice del audit, cruzando por SKU/nombre con `matchTn`.
 *
 * Solo productos ENTEROS agotados (nunca se toca uno que aún tiene stock en alguna
 * variante), así el criterio es seguro tanto si el color es un producto aparte como si
 * es una variante interna. Devuelve ambos nombres (GN y TN) para poder verificar el
 * match —que es difuso— antes de ocultar. Puro y testeable.
 */

import type { Producto } from '@/lib/etl/tipos'
import { matchTn, type IndiceTn } from '@/lib/tn'

export type CandidatoAgotado = {
  tnId: string | number
  gnNombre: string
  tnNombre: string
  sku: string | null
  stock: number
}

export function candidatosAOcultar(productos: Producto[], idx: IndiceTn): CandidatoAgotado[] {
  const out: CandidatoAgotado[] = []
  const vistos = new Set<string>() // dedupe: varios productos GN pueden matchear el mismo TN
  for (const p of productos) {
    if (p.stock !== 0) continue
    const tn = matchTn({ sku: p.sku, name: p.name }, idx)
    if (!tn || tn.id == null) continue
    if (tn.published === false) continue // ya está oculto en la tienda
    const key = String(tn.id)
    if (vistos.has(key)) continue
    vistos.add(key)
    out.push({ tnId: tn.id, gnNombre: p.name, tnNombre: tn.name || p.name, sku: p.sku, stock: p.stock })
  }
  out.sort((a, b) => a.gnNombre.localeCompare(b.gnNombre, 'es'))
  return out
}
