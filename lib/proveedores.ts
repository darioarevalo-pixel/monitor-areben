/**
 * "Por proveedor" (key `proveedores`, Zattia): comparativa entre proveedores +
 * detalle de uno. Port puro de renderProveedoresComparativa (index.html:5514) y
 * renderProveedores (5585), sin DOM ni Chart.js. Todo deriva de `allProveedoresData`
 * (ya computado por el ETL) + `allMonths`.
 */

import type { ProductoProveedor } from './etl/tipos'

export type DatosProveedores = Record<string, { products: ProductoProveedor[] }>

export type StatProveedor = {
  prov: string
  totalSold: number
  totalStock: number
  /** Rentabilidad promedio (%), 0 si no hay márgenes válidos. */
  avgMargin: number
  /** Compra estimada: (vendidas + stock) × costo unitario. */
  compra: number
}

const MONTH_NAMES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

/** `YYYY-MM` → `Mmm YY`. */
export function mesLabel(m: string): string {
  const [y, mo] = m.split('-')
  return MONTH_NAMES[parseInt(mo) - 1] + ' ' + y.slice(2)
}

/** Nombres de proveedores, alfabéticos (para el selector y la comparativa). */
export function nombresProveedores(data: DatosProveedores): string[] {
  return Object.keys(data).sort((a, b) => a.localeCompare(b, 'es'))
}

/** Stats por proveedor (vendidas, stock, rentab. prom., compra estimada). */
function statsDe(products: ProductoProveedor[]): Omit<StatProveedor, 'prov'> {
  const totalSold = products.reduce((s, p) => s + p.soldTotal, 0)
  const totalStock = products.reduce((s, p) => s + p.stock, 0)
  const validMargins = products.filter((p) => p.margin !== null)
  const avgMargin = validMargins.length
    ? validMargins.reduce((s, p) => s + (p.margin as number), 0) / validMargins.length
    : 0
  const compra = products.reduce((s, p) => s + (p.soldTotal + p.stock) * p.unit_cost, 0)
  return { totalSold, totalStock, avgMargin, compra }
}

/** La comparativa: un stat por proveedor, en orden alfabético (index.html:5514). */
export function comparativa(data: DatosProveedores): StatProveedor[] {
  return nombresProveedores(data).map((prov) => ({ prov, ...statsDe(data[prov].products) }))
}

export type KpisProveedor = {
  totalStock: number
  totalSold: number
  /** Rentabilidad promedio (%) o null si no hay márgenes. */
  avgMargin: number | null
  /** Compra estimada ($) o null si es 0. */
  estimatedPurchase: number | null
}

/** Los 4 KPIs del detalle, sobre TODOS los productos del proveedor (index.html:5602). */
export function kpisProveedor(products: ProductoProveedor[]): KpisProveedor {
  const s = statsDe(products)
  const validMargins = products.filter((p) => p.margin !== null)
  return {
    totalStock: s.totalStock,
    totalSold: s.totalSold,
    avgMargin: validMargins.length ? s.avgMargin : null,
    estimatedPurchase: s.compra > 0 ? s.compra : null,
  }
}

/**
 * Filtra por rango de primera venta. Port de renderProveedores (index.html:5594):
 * un producto sin `firstSale` sólo entra si NO hay filtro de fecha.
 */
export function filtrarPorFecha(products: ProductoProveedor[], desde: string, hasta: string): ProductoProveedor[] {
  return products.filter((p) => {
    if (!p.firstSale) return !desde && !hasta
    if (desde && p.firstSale < desde) return false
    if (hasta && p.firstSale > hasta) return false
    return true
  })
}

/** Unidades vendidas por mes (últimos 12), sobre todos los productos (index.html:5619). */
export function chartMensual(products: ProductoProveedor[], allMonths: string[]): { label: string; value: number }[] {
  return allMonths.slice(-12).map((m) => ({
    label: mesLabel(m),
    value: products.reduce((s, p) => s + (p.soldByMonth[m] || 0), 0),
  }))
}

/** Ranking del detalle: productos filtrados, ordenados por vendidas desc (index.html:5648). */
export function ranking(filtered: ProductoProveedor[]): ProductoProveedor[] {
  return [...filtered].sort((a, b) => b.soldTotal - a.soldTotal)
}

/** Color del margen en el ranking (index.html:5654): >40 verde, >20 ámbar, resto rojo. */
export function colorMargen(margin: number | null): string {
  if (margin === null) return '#aaa'
  return margin > 40 ? '#1d9e75' : margin > 20 ? '#ba7517' : '#e24b4a'
}
