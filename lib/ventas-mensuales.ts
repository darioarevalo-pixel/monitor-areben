/**
 * "Ventas mensuales" (key `ventas-mensuales`): evolución mes a mes. Port puro de
 * renderVentasMensuales (index.html:2994-3070), sin DOM ni Chart.js. Todo deriva
 * de `allMonthlyStats` que ya produce el ETL — la Tanda A es "renderizar lo ya
 * computado".
 */

import type { EstadisticaMensual } from './etl/tipos'

export const MONTH_NAMES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'] as const

/** `YYYY-MM` → `Mmm YY` (ej. `2026-07` → `Jul 26`). Port de monthLabel (index.html:2996). */
export function monthLabel(m: string): string {
  const [y, mo] = m.split('-')
  return MONTH_NAMES[parseInt(mo) - 1] + ' ' + y.slice(2)
}

/** Los períodos del selector: 3/6/12 meses o 0 = todos. */
export type Periodo = 3 | 6 | 12 | 0

/**
 * Filtra por período: reverse (más reciente primero) y toma los primeros N.
 * Port literal de index.html:3002-3003 (`stats.reverse()` + `slice(0, periodo)`).
 */
export function filtrarPeriodo(stats: EstadisticaMensual[], periodo: number): EstadisticaMensual[] {
  const rev = [...stats].reverse() // más reciente primero
  return periodo > 0 ? rev.slice(0, periodo) : rev
}

/** Categorías presentes en el período, ordenadas por total desc (index.html:3025-3031). */
export function categoriasOrdenadas(filtered: EstadisticaMensual[]): string[] {
  const catTotals: Record<string, number> = {}
  filtered.forEach((s) => {
    Object.entries(s.byCategory).forEach(([cat, qty]) => {
      catTotals[cat] = (catTotals[cat] || 0) + qty
    })
  })
  return Object.entries(catTotals)
    .sort((a, b) => b[1] - a[1])
    .map(([c]) => c)
}

/** Canales presentes en el período, ordenados por total desc (index.html:3025-3032). */
export function canalesOrdenados(filtered: EstadisticaMensual[]): string[] {
  const chTotals: Record<string, number> = {}
  filtered.forEach((s) => {
    Object.entries(s.byChannel || {}).forEach(([ch, cnt]) => {
      chTotals[ch] = (chTotals[ch] || 0) + cnt
    })
  })
  return Object.entries(chTotals)
    .sort((a, b) => b[1] - a[1])
    .map(([c]) => c)
}

export type FilaCategoria = {
  mes: string
  label: string
  items: number
  /** Promedio items/venta con 1 decimal, o `—` si no hubo ventas. */
  prom: string
  /** Paralelo a `categoriasOrdenadas`; `null` = sin dato ese mes (se pinta `—`). */
  cats: (number | null)[]
}

/** La tabla "por categoría" (index.html:3039-3050). */
export function filasCategoria(filtered: EstadisticaMensual[], cats: string[]): FilaCategoria[] {
  return filtered.map((s) => ({
    mes: s.mes,
    label: monthLabel(s.mes),
    items: s.items,
    prom: s.ventasCount > 0 ? (s.items / s.ventasCount).toFixed(1) : '—',
    // El legacy pinta `—` también cuando el valor es 0 (`byCategory[c] ? ... : '—'`).
    cats: cats.map((c) => (s.byCategory[c] ? s.byCategory[c] : null)),
  }))
}

export type CeldaCanal = { cnt: number; pct: number }

export type FilaCanal = {
  mes: string
  label: string
  ventas: number
  /** Paralelo a `canalesOrdenados`. */
  canales: CeldaCanal[]
}

/** La tabla "por canal de venta" (index.html:3053-3069). */
export function filasCanal(filtered: EstadisticaMensual[], channels: string[]): FilaCanal[] {
  return filtered.map((s) => ({
    mes: s.mes,
    label: monthLabel(s.mes),
    ventas: s.ventasCount,
    canales: channels.map((c) => {
      const cnt = (s.byChannel || {})[c] || 0
      const pct = s.ventasCount > 0 ? Math.round((cnt / s.ventasCount) * 100) : 0
      return { cnt, pct }
    }),
  }))
}

/** Datos del gráfico de barras, en orden cronológico (index.html:3007-3013). */
export function datosChart(filtered: EstadisticaMensual[]): { label: string; items: number }[] {
  return [...filtered].reverse().map((s) => ({ label: monthLabel(s.mes), items: s.items }))
}
