/**
 * "Desglose por variante" del detalle expandible de un producto. Port puro de
 * buildProductoDetalle (index.html:2903-2965), sin DOM. Cruza las ventas por
 * variante (`allVvar`) con el stock (`allVariantes`): las que se vendieron traen su
 * ritmo; las que sólo tienen stock aparecen en 0.
 */

import type { VentasVariante, Variante } from './etl/tipos'

export type ItemVariante = {
  sid: string
  size: string
  total: number
  s7: number
  s30: number
  stock: number
}

export type ColDetalle = 'size' | 'total' | 's7' | 's30' | 'stock'

/**
 * Filas del desglose de un producto, ya ordenadas. `col`/`dir` son el estado del
 * mini-orden del detalle (default `total` desc, index.html:1924). El id de variante
 * es `pid_sid`, la misma clave que arma el ETL (computar.ts:143).
 */
export function desglosePorVariante(
  allVvar: Record<string, VentasVariante>,
  allVariantes: Variante[],
  pid: string,
  col: ColDetalle,
  dir: number,
): { items: ItemVariante[]; totalVendido: number } {
  const varSales = Object.values(allVvar).filter((v) => v.pid === pid)

  const stockByVid: Record<string, number> = {}
  allVariantes.filter((v) => v.pid === pid).forEach((v) => {
    stockByVid[v.id] = v.stock
  })

  // Variantes con stock pero sin ventas (no están en varSales).
  const seen = new Set(varSales.map((v) => v.pid + '_' + v.sid))
  const stockOnly = allVariantes.filter((v) => v.pid === pid && !seen.has(v.id))

  const items: ItemVariante[] = [
    ...varSales.map((v) => ({
      sid: v.sid,
      size: v.size,
      total: v.total,
      s7: v.s7,
      s30: v.s30,
      stock: stockByVid[pid + '_' + v.sid] || 0,
    })),
    ...stockOnly.map((v) => ({ sid: v.sid, size: v.size, total: 0, s7: 0, s30: 0, stock: v.stock })),
  ]

  items.sort((a, b) => {
    const va = a[col]
    const vb = b[col]
    if (typeof va === 'string') return dir * (va || '').localeCompare((vb as string) || '', 'es', { numeric: true })
    return dir * ((Number(va) || 0) - (Number(vb) || 0))
  })

  const totalVendido = items.reduce((s, v) => s + v.total, 0)
  return { items, totalVendido }
}
