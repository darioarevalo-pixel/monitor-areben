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
  /** Categorías del producto en TN: son muchos productos y sin agruparlos la lista no se lee. */
  categorias: string[]
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
        categorias: tn.categories || [],
        variantes: nuevas,
      })
    }
  }

  const out = [...porTn.values()]
  for (const g of out) g.variantes.sort((a, b) => a.label.localeCompare(b.label, 'es'))
  out.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
  return out
}

/**
 * Los grupos ordenados por categoría, para poder recorrer la lista de a partes.
 *
 * Son cientos de variantes: en una lista plana no se termina nunca y no se sabe por dónde
 * empezar. Un producto puede estar en varias categorías (aparece en cada una) y los que no
 * tienen ninguna van al final, juntos, en vez de desaparecer.
 */
export const SIN_CATEGORIA = '(sin categoría)'

export function agruparPorCategoria(grupos: GrupoSinStock[]): { categoria: string; grupos: GrupoSinStock[] }[] {
  const por = new Map<string, GrupoSinStock[]>()
  for (const g of grupos) {
    const cats = g.categorias.length ? g.categorias : [SIN_CATEGORIA]
    for (const c of cats) por.set(c, [...(por.get(c) ?? []), g])
  }
  return [...por.entries()]
    .map(([categoria, grupos]) => ({ categoria, grupos }))
    .sort((a, b) =>
      a.categoria === SIN_CATEGORIA ? 1 : b.categoria === SIN_CATEGORIA ? -1 : a.categoria.localeCompare(b.categoria, 'es'),
    )
}
