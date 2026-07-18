/**
 * "Por talle" (key `talles`, Zattia): ventas por talle de una categoría, en un rango
 * de meses. Port puro de renderTalles (index.html:5916), sin DOM. Deriva de
 * `allTallesData` (ya computado por el ETL).
 */

import type { VentaTalle } from './etl/tipos'

const MONTH_NAMES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

/** `YYYY-MM` → `Mmm YY` (para los selectores de mes). */
export function mesLabel(m: string): string {
  const [y, mo] = m.split('-')
  return MONTH_NAMES[parseInt(mo) - 1] + ' ' + y.slice(2)
}

/**
 * Rango de meses `[desde, hasta]` para un período (3/6/12 o 0 = todos). Port de
 * applyTallesPeriodo (index.html:5904): hasta = último mes; desde = N meses atrás.
 */
export function rangoPeriodo(meses: string[], periodo: number): { desde: string; hasta: string } | null {
  if (!meses.length) return null
  const hasta = meses[meses.length - 1]
  const desde = periodo === 0 ? meses[0] : meses[Math.max(0, meses.length - periodo)]
  return { desde, hasta }
}

export type FilaTalle = { size: string; qty: number }

/**
 * Ventas por talle de la categoría, filtradas por rango y ordenadas (numéricos de
 * menor a mayor, después el resto alfabético). Port de renderTalles (5921-5938).
 */
export function ventasPorTalle(data: VentaTalle[], categoria: string, desde: string, hasta: string): FilaTalle[] {
  const bySize: Record<string, number> = {}
  data.forEach((r) => {
    if (r.category !== categoria) return
    if (desde && r.mes < desde) return
    if (hasta && r.mes > hasta) return
    bySize[r.size] = (bySize[r.size] || 0) + r.qty
  })
  return Object.entries(bySize)
    .sort(([a], [b]) => {
      const na = parseFloat(a)
      const nb = parseFloat(b)
      if (!isNaN(na) && !isNaN(nb)) return na - nb
      if (!isNaN(na)) return -1
      if (!isNaN(nb)) return 1
      return a.localeCompare(b)
    })
    .map(([size, qty]) => ({ size, qty }))
}

/** Categoría por defecto: JEANS si existe, si no la primera (index.html:5885). */
export function categoriaDefault(categorias: string[]): string {
  if (categorias.includes('JEANS')) return 'JEANS'
  return categorias[0] || ''
}
