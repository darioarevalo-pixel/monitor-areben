/**
 * Los dos sentidos de la visibilidad en TiendaNube: ocultar lo que la tienda ya no puede vender
 * y volver a mostrar lo que sí puede. Puro y testeable.
 *
 * 🔴 **Deciden con el stock DE LA TIENDA, no con el de Gestión Nube** (15-sep-2026). Hasta acá
 * cruzaban el stock total de GN con `matchTn`, y medido en BDI andaba mal en los dos sentidos:
 *   - **no aparecía lo que sí figura sin stock**: 19 de 20 productos en 0 en la tienda tenían
 *     unidades sólo en el Local. GN sumaba Local + Depósito Minorista y los daba por vivos.
 *   - **y aparecía lo que se está vendiendo**: 14 de 15 candidatos a ocultar tenían stock en la
 *     tienda (STAR CASE, 932). Un producto viejo de GN con el mismo nombre y stock 0 matcheaba al
 *     mismo de la tienda, y alcanzaba con ése para proponerlo.
 *
 * El stock de TN es de UN depósito, distinto por marca (ver `lib/tncat/stock-variante.ts`), y por
 * eso no sirve para decidir qué fotografiar. Para esto es exactamente lo que hace falta: es lo que
 * la tienda deja comprar, o sea lo que el cliente ve como «sin stock».
 *
 * Solo productos ENTEROS: uno con stock en alguna variante nunca se oculta (TN no oculta una
 * variante suelta; `published` existe sólo a nivel producto).
 */

import type { Producto } from '@/lib/etl/tipos'
import { matchTn, type IndiceTn } from '@/lib/tn'
import type { ProductoFchk } from './tipos'

export type CandidatoVisibilidad = {
  tnId: string | number
  nombre: string
  sku: string | null
  /** Unidades en la tienda (suma de las variantes). */
  stock: number
}

/**
 * Unidades que la tienda deja comprar. `null` = no se sabe, y ⛔ nunca se lee como 0:
 * sin variantes (el payload liviano no las trae) o con alguna variante sin gestión de stock
 * (`stock: null` en TN es ilimitado). Un negativo cuenta como 0.
 */
export function stockEnTienda(p: ProductoFchk): number | null {
  const vs = p.variantes
  if (!vs || vs.length === 0) return null
  let total = 0
  for (const v of vs) {
    if (v.stock == null) return null
    total += Math.max(0, v.stock)
  }
  return total
}

/** Publicados en la tienda con todas sus variantes en 0. */
export function candidatosAOcultar(productos: ProductoFchk[]): CandidatoVisibilidad[] {
  return filtrar(productos, (publicado, stock) => publicado && stock === 0)
}

/**
 * El movimiento inverso: productos **con stock en la tienda** que están DESPUBLICADOS.
 *
 * Es el que faltaba. Ocultar agotados es fácil de recordar —lo hacés cuando se termina algo—
 * pero volver a mostrarlos cuando reingresa mercadería no lo dispara nada: el producto
 * queda invisible en la tienda con stock disponible, o sea plata quieta. El "Deshacer" de
 * ocultar solo sirve en la misma sesión; esto lo encuentra siempre.
 */
export function candidatosAMostrar(productos: ProductoFchk[]): CandidatoVisibilidad[] {
  return filtrar(productos, (publicado, stock) => !publicado && stock > 0)
}

function filtrar(
  productos: ProductoFchk[],
  entra: (publicado: boolean, stock: number) => boolean,
): CandidatoVisibilidad[] {
  const out: CandidatoVisibilidad[] = []
  for (const p of productos) {
    const stock = stockEnTienda(p)
    if (stock === null) continue
    // `published` puede venir undefined en el audit: se asume publicado (es el default de TN).
    if (!entra(p.published !== false, stock)) continue
    out.push({ tnId: p.id, nombre: p.name, sku: p.sku ?? null, stock })
  }
  out.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
  return out
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

/**
 * Ventas de los últimos 90 días por producto de TiendaNube (`id` de TN → unidades vendidas).
 *
 * Es el compañero de `stockPorProductoTn` y lo que hace manejable la auditoría de fotos en
 * Zattia: son 288 productos con color en la variante y revisarlos todos a ojo no se termina
 * nunca. Revisar **los que se venden** sí. Mismo cruce difuso y misma suma que el stock.
 */
export function ventas90PorProductoTn(productos: Producto[], idx: IndiceTn): Map<string, number> {
  const out = new Map<string, number>()
  for (const p of productos) {
    const tn = matchTn({ sku: p.sku, name: p.name }, idx)
    if (!tn || tn.id == null) continue
    const key = String(tn.id)
    out.set(key, (out.get(key) ?? 0) + (p.sales90 || 0))
  }
  return out
}
