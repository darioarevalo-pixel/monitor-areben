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
  return cruzar(productos, idx, { stockCero: true, publicado: true })
}

/**
 * El movimiento inverso: productos **con stock** que están DESPUBLICADOS en la tienda.
 *
 * Es el que faltaba. Ocultar agotados es fácil de recordar —lo hacés cuando se termina algo—
 * pero volver a mostrarlos cuando reingresa mercadería no lo dispara nada: el producto
 * queda invisible en la tienda con stock disponible, o sea plata quieta. El "Deshacer" de
 * ocultar solo sirve en la misma sesión; esto lo encuentra siempre.
 */
export function candidatosAMostrar(productos: Producto[], idx: IndiceTn): CandidatoAgotado[] {
  return cruzar(productos, idx, { stockCero: false, publicado: false })
}

/**
 * Stock de Gestión Nube por producto de TiendaNube (`id` de TN → unidades).
 *
 * Existe para que la revisión de fotos pueda descartar lo que no tiene stock: una foto
 * sirve para vender, así que arreglar la de algo agotado no es trabajo de hoy. El stock
 * sale de GN —la fuente de verdad—, no del que TiendaNube tenga cargado.
 *
 * Varios productos de GN pueden matchear el mismo de TN (colores separados): se suman.
 */
export function stockPorProductoTn(productos: Producto[], idx: IndiceTn): Map<string, number> {
  const out = new Map<string, number>()
  for (const p of productos) {
    const tn = matchTn({ sku: p.sku, name: p.name }, idx)
    if (!tn || tn.id == null) continue
    const key = String(tn.id)
    out.set(key, (out.get(key) ?? 0) + (p.stock || 0))
  }
  return out
}

/** El cruce GN⨯TN compartido por los dos sentidos (mismo match difuso, mismo dedupe). */
function cruzar(
  productos: Producto[],
  idx: IndiceTn,
  filtro: { stockCero: boolean; publicado: boolean },
): CandidatoAgotado[] {
  const out: CandidatoAgotado[] = []
  const vistos = new Set<string>() // dedupe: varios productos GN pueden matchear el mismo TN
  for (const p of productos) {
    if (filtro.stockCero ? p.stock !== 0 : p.stock <= 0) continue
    const tn = matchTn({ sku: p.sku, name: p.name }, idx)
    if (!tn || tn.id == null) continue
    // `published` puede venir undefined en el audit: se asume publicado (es el default de TN).
    const publicado = tn.published !== false
    if (publicado !== filtro.publicado) continue
    const key = String(tn.id)
    if (vistos.has(key)) continue
    vistos.add(key)
    out.push({ tnId: tn.id, gnNombre: p.name, tnNombre: tn.name || p.name, sku: p.sku, stock: p.stock })
  }
  out.sort((a, b) => a.gnNombre.localeCompare(b.gnNombre, 'es'))
  return out
}
