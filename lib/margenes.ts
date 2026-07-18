/**
 * "Margen por producto" (key `margenes`): grilla con foto (TN), markup/margen y solo
 * disponibles, contra un markup objetivo. Port puro de renderMargenesGrid
 * (index.html:8527-8624), sin DOM. El precio efectivo es la promo de TN si existe, si
 * no el minorista de GN; el foto y la promo salen del índice completo de TN
 * (`lib/tn.ts`). El objetivo por defecto es 130% de markup.
 */

import type { Producto } from './etl/tipos'
import { matchTn, type IndiceTn } from './tn'

export const OBJETIVO_DEFAULT = 130

export type FilaMargen = {
  p: Producto
  foto: string | null
  /** Precio efectivo: promo TN si la tiene, si no el minorista GN. */
  precio: number
  esPromo: boolean
  /** Recargo sobre el costo (%). */
  markup: number
  /** Margen sobre la venta (%). */
  margin: number
  /** markup − objetivo (pts). + = más caro que el objetivo. */
  desfase: number
}

export type OrdenMargen = 'markup-desc' | 'markup-asc' | 'desfase-desc' | 'name' | 'pvp-desc' | 'stock-desc'

/**
 * Filas base: sólo disponibles (stock>0, costo>0, precio>0) y sin los SKU "stu"
 * (Stunned, otra marca cargada en el GN de Zattia). Port de index.html:8535-8552.
 */
export function computarFilas(productos: Producto[], promoIdx: IndiceTn, objetivo: number): FilaMargen[] {
  return productos
    .filter((p) => (p.stock || 0) > 0 && p.unit_cost > 0 && p.retailer_price > 0)
    .filter((p) => !(p.sku && /^stu/i.test(p.sku)))
    .map((p) => {
      const tn = matchTn(p, promoIdx)
      const promo = tn && (tn.promo_price ?? 0) > 0 ? tn.promo_price! : null
      const precio = promo || p.retailer_price
      const markup = (precio / p.unit_cost - 1) * 100
      const margin = ((precio - p.unit_cost) / precio) * 100
      const desfase = markup - objetivo
      return { p, foto: (tn && tn.images && tn.images[0]) || null, precio, esPromo: !!promo, markup, margin, desfase }
    })
}

/** Filtra por texto (nombre o SKU). */
export function buscar(filas: FilaMargen[], q: string): FilaMargen[] {
  const s = q.trim().toLowerCase()
  if (!s) return filas
  return filas.filter((x) => x.p.name.toLowerCase().includes(s) || (x.p.sku || '').toLowerCase().includes(s))
}

const COMPARADORES: Record<OrdenMargen, (a: FilaMargen, b: FilaMargen) => number> = {
  'markup-desc': (a, b) => b.markup - a.markup,
  'markup-asc': (a, b) => a.markup - b.markup,
  'desfase-desc': (a, b) => Math.abs(b.desfase) - Math.abs(a.desfase),
  name: (a, b) => a.p.name.localeCompare(b.p.name, 'es'),
  'pvp-desc': (a, b) => b.precio - a.precio,
  'stock-desc': (a, b) => b.p.stock - a.p.stock,
}

/** Ordena una copia según el criterio (default markup desc). Port de index.html:8554-8561. */
export function ordenar(filas: FilaMargen[], orden: OrdenMargen): FilaMargen[] {
  return [...filas].sort(COMPARADORES[orden] || COMPARADORES['markup-desc'])
}

export type ResumenMargen = { count: number; prom: number; mediana: number; desfasados: number }

/** El resumen de arriba: markup promedio, mediana y cuántos superan el objetivo por +15pts. */
export function resumen(filas: FilaMargen[]): ResumenMargen | null {
  if (!filas.length) return null
  const mks = filas.map((x) => x.markup).sort((a, b) => a - b)
  const prom = mks.reduce((s, m) => s + m, 0) / mks.length
  const mediana = mks[Math.floor(mks.length / 2)]
  const desfasados = filas.filter((x) => x.desfase > 15).length
  return { count: filas.length, prom, mediana, desfasados }
}

/** Color/fondo de la tarjeta según el desfase vs el objetivo. Port de index.html:8580-8586. */
export function colorDesfase(desfase: number): { color: string; bg: string } {
  if (desfase > 50) return { color: '#DC2626', bg: '#FEF2F2' } // muy por encima
  if (desfase > 15) return { color: '#D97706', bg: '#FFFBEB' } // por encima
  if (desfase < -15) return { color: '#2563EB', bg: '#EFF6FF' } // por debajo
  return { color: '#16A34A', bg: '#F0FDF4' } // en objetivo
}

/** Etiqueta del desfase ("en objetivo" / "+N pts vs obj." / "−N pts vs obj."). */
export function etiquetaDesfase(desfase: number): string {
  if (Math.abs(desfase) <= 15) return 'en objetivo'
  return (desfase > 0 ? '+' : '−') + Math.abs(desfase).toFixed(0) + ' pts vs obj.'
}
