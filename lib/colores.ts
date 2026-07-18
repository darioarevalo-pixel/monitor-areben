/**
 * "Por color" (key `colores`, Zattia): dos análisis. Ventas por color (search +
 * período + selección de colores) y Análisis de agotamiento (ratio por color
 * congelado al primer sellout). Port puro de renderColores/reloadColoresPanel
 * (index.html:5713, 5688) y renderAgotamiento (5808), sin DOM. Deriva de
 * `allColoresSales` y `allAgotamientoData` (ya computados por el ETL).
 */

import type { Agotamiento, VentaColor } from './etl/tipos'

// ── Ventas por color ──────────────────────────────────────────────────────────

/** Mes de corte para un período (o '' = todos). Port de reloadColoresPanel:5691. */
export function cutoffDe(periodo: number, months: string[]): string {
  return periodo > 0 && months.length >= periodo ? months[months.length - periodo] : ''
}

/** Filas de venta que pasan búsqueda (nombre, upper) y corte de período. */
export function filtrarVentas(sales: VentaColor[], search: string, cutoff: string): VentaColor[] {
  const q = search.trim().toUpperCase()
  return sales.filter((r) => {
    if (cutoff && r.mes < cutoff) return false
    if (q && !r.product_name.toUpperCase().includes(q)) return false
    return true
  })
}

/** Colores presentes en las filas, ordenados por volumen desc (para los checkboxes). */
export function coloresOrdenados(filtered: VentaColor[]): string[] {
  const totals: Record<string, number> = {}
  filtered.forEach((r) => { totals[r.color] = (totals[r.color] || 0) + r.qty })
  return Object.entries(totals).sort((a, b) => b[1] - a[1]).map(([c]) => c)
}

export type FilaColor = { color: string; qty: number }

/**
 * Agrega por color (sólo los tildados) y ordena por cantidad desc, con el total.
 * Port de renderColores (index.html:5726-5735).
 */
export function ventasPorColor(filtered: VentaColor[], checkedColors: Set<string>): { filas: FilaColor[]; total: number } {
  const byColor: Record<string, number> = {}
  filtered.forEach((r) => {
    if (!checkedColors.has(r.color)) return
    byColor[r.color] = (byColor[r.color] || 0) + r.qty
  })
  const filas = Object.entries(byColor).sort((a, b) => b[1] - a[1]).map(([color, qty]) => ({ color, qty }))
  const total = filas.reduce((s, f) => s + f.qty, 0)
  return { filas, total }
}

// ── Análisis de agotamiento ───────────────────────────────────────────────────

export const AGOT_PALETTE = [
  '#2563EB', '#D97706', '#16A34A', '#DC2626', '#7C3AED', '#0891B2',
  '#DB2777', '#65A30D', '#EA580C', '#0D9488', '#92400E', '#1D4ED8',
]

/** `YYYY-MM-DD` → `DD/MM/YYYY`. Port de fmtDate (index.html:5804). */
export function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

/** Proveedores presentes en los datos de agotamiento, alfabéticos (para el selector). */
export function proveedoresAgot(data: Agotamiento[]): string[] {
  return [...new Set(data.map((p) => p.proveedor).filter((x): x is string => !!x))].sort((a, b) => a.localeCompare(b, 'es'))
}

export type FiltrosAgot = { search: string; prov: string; estado: '' | 'agotado' | 'en_curso' }

/**
 * Filtra y ordena los productos de agotamiento: primero los que ya tuvieron sellout
 * (por fecha desc), después los en curso (por nombre). Port de renderAgotamiento
 * (index.html:5810-5821).
 */
export function filtrarAgotamiento(data: Agotamiento[], f: FiltrosAgot): Agotamiento[] {
  const q = f.search.trim().toUpperCase()
  const lista = data.filter((p) => {
    if (q && !(p.product_name || '').toUpperCase().includes(q)) return false
    if (f.prov && p.proveedor !== f.prov) return false
    if (f.estado === 'agotado' && !p.firstSelloutDate) return false
    if (f.estado === 'en_curso' && p.firstSelloutDate) return false
    return true
  })
  return lista.sort((a, b) => {
    if (a.firstSelloutDate && !b.firstSelloutDate) return -1
    if (!a.firstSelloutDate && b.firstSelloutDate) return 1
    if (a.firstSelloutDate && b.firstSelloutDate) return b.firstSelloutDate.localeCompare(a.firstSelloutDate)
    return (a.product_name || '').localeCompare(b.product_name || '')
  })
}

export type FilaAgotColor = { color: string; pct: number; sold: number; initialStock: number; palette: string; isSoldOut: boolean }

/** Filas de color de una tarjeta, ordenadas por % desc. Port de index.html:5831-5847. */
export function coloresDeAgotamiento(prod: Agotamiento): FilaAgotColor[] {
  return Object.entries(prod.ratioAtRef)
    .sort((a, b) => (b[1].pct ?? 0) - (a[1].pct ?? 0))
    .map(([color, data], i) => ({
      color,
      pct: data.pct ?? 0,
      sold: data.sold,
      initialStock: prod.colors[color]?.initialStock || 0,
      palette: AGOT_PALETTE[i % AGOT_PALETTE.length],
      isSoldOut: !!prod.firstSelloutDate && prod.colors[color]?.selloutDate === prod.firstSelloutDate,
    }))
}
