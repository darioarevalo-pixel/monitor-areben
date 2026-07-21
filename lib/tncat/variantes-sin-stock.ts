/**
 * Variantes SIN stock que siguen VISIBLES en TiendaNube — lista de trabajo para
 * ocultarlas/gestionarlas a mano (TN no permite ocultar una variante suelta por API;
 * solo el producto entero tiene `published`).
 *
 * A diferencia de `candidatosAOcultar` (que mira el stock a nivel producto entero),
 * esto baja a nivel variante: el stock por variante sale del ETL de Gestión Nube
 * (`Variante.stock`, fuente de verdad). El `id`/`published` de TN salen del índice del
 * audit vía `matchTn` (cruce difuso por SKU/nombre). Solo se incluyen variantes cuyo
 * producto está publicado en TN (si no, no está visible en la tienda: no hay nada que
 * gestionar). Puro y testeable.
 */

import type { Producto, Variante } from '@/lib/etl/tipos'
import { matchTn, type IndiceTn } from '@/lib/tn'

export type VarSinStock = { vid: string; label: string; sku: string; stock: number }

export type GrupoSinStock = {
  tnId: string | number
  nombre: string // nombre GN del producto
  tnNombre: string
  sku: string | null
  /** El producto entero está agotado (stock GN total = 0) → conviene usar "Ocultar agotados". */
  enteroAgotado: boolean
  variantes: VarSinStock[]
}

export function variantesSinStockVisibles(
  productos: Producto[],
  variantes: Variante[],
  idx: IndiceTn,
): GrupoSinStock[] {
  // Variantes agrupadas por producto (pid).
  const porPid = new Map<string, Variante[]>()
  for (const v of variantes) {
    const arr = porPid.get(v.pid)
    if (arr) arr.push(v)
    else porPid.set(v.pid, [v])
  }

  // Agrupado por producto de TN (varios productos GN pueden matchear el mismo TN → se fusionan).
  const porTn = new Map<string, GrupoSinStock>()
  for (const p of productos) {
    const sinStock = (porPid.get(p.id) || []).filter((v) => v.stock === 0)
    if (sinStock.length === 0) continue
    const tn = matchTn({ sku: p.sku, name: p.name }, idx)
    if (!tn || tn.id == null) continue
    if (tn.published === false) continue // ya no está visible en la tienda
    const key = String(tn.id)
    const nuevas: VarSinStock[] = sinStock.map((v) => ({ vid: v.id, label: v.size || '—', sku: v.sku, stock: v.stock }))
    const g = porTn.get(key)
    if (g) {
      g.variantes.push(...nuevas)
      g.enteroAgotado = g.enteroAgotado && p.stock === 0
    } else {
      porTn.set(key, {
        tnId: tn.id,
        nombre: p.name,
        tnNombre: tn.name || p.name,
        sku: p.sku,
        enteroAgotado: p.stock === 0,
        variantes: nuevas,
      })
    }
  }

  const out = [...porTn.values()]
  for (const g of out) g.variantes.sort((a, b) => a.label.localeCompare(b.label, 'es'))
  out.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
  return out
}
