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

// ── Métricas POR PERÍODO ────────────────────────────────────────────────────────
/**
 * El sesgo que tenía esta pantalla: el filtro de fecha existía, pero recortaba por *primera
 * venta del producto* — decidía qué productos entraban, no de cuándo eran los números. Las
 * unidades, la compra y el margen seguían siendo acumulados de toda la vida, así que un
 * proveedor con el que dejamos de trabajar hace un año podía seguir liderando el ranking.
 *
 * Acá las ventas se suman SOLO sobre los meses elegidos (`soldByMonth`, que el ETL ya
 * calcula). Lo que NO se puede recortar por período es el **stock**: es la foto de hoy, y se
 * rotula así en la UI para no mezclar dos cosas distintas en la misma tabla.
 */
export type StatPeriodo = StatProveedor & {
  /** Unidades vendidas dentro del período elegido. */
  vendidas: number
  /** Lo que costó reponer lo vendido en el período (vendidas × costo unitario). */
  compraPeriodo: number
}

/** Los meses de `allMonths` dentro del rango (`YYYY-MM`); sin rango, todos. */
export function mesesEnRango(allMonths: string[], desde: string, hasta: string): string[] {
  return allMonths.filter((m) => (!desde || m >= desde) && (!hasta || m <= hasta))
}

/** Unidades de un producto en esos meses. */
export function vendidasEn(p: ProductoProveedor, meses: string[]): number {
  return meses.reduce((s, m) => s + (p.soldByMonth[m] || 0), 0)
}

/**
 * Stats de un proveedor acotadas al período. El margen es un promedio **ponderado por las
 * unidades vendidas en el período**: promediar a secas le da el mismo peso a un producto que
 * vendió 200 que a uno que vendió 1, y eso es lo que hace que el número no se parezca al
 * negocio.
 */
export function statsPeriodo(products: ProductoProveedor[], meses: string[]): Omit<StatPeriodo, 'prov'> {
  let vendidas = 0
  let compraPeriodo = 0
  let margenPonderado = 0
  let unidadesConMargen = 0
  for (const p of products) {
    const v = vendidasEn(p, meses)
    vendidas += v
    compraPeriodo += v * p.unit_cost
    if (p.margin !== null && v > 0) {
      margenPonderado += p.margin * v
      unidadesConMargen += v
    }
  }
  const base = statsDe(products)
  return {
    ...base,
    vendidas,
    compraPeriodo,
    avgMargin: unidadesConMargen ? margenPonderado / unidadesConMargen : 0,
  }
}

/** La comparativa del período: un stat por proveedor. */
export function comparativaPeriodo(data: DatosProveedores, meses: string[]): StatPeriodo[] {
  return nombresProveedores(data).map((prov) => ({ prov, ...statsPeriodo(data[prov].products, meses) }))
}

// ── Accionable de compra ────────────────────────────────────────────────────────
/**
 * Qué hay que reponer, agrupado por proveedor: productos que **se vendieron en el período y
 * hoy están en cero**.
 *
 * Es el paso que faltaba entre el dato y la acción. La pantalla contaba qué pasó; esto dice
 * qué hacer con eso, y agrupado por proveedor porque el pedido se manda a uno, no al
 * catálogo entero.
 */
export type FaltanteCompra = { id: string; name: string; vendidas: number; unit_cost: number; margin: number | null }
export type PedidoProveedor = { prov: string; items: FaltanteCompra[]; unidades: number; costoEstimado: number }

export function pedidosPorProveedor(data: DatosProveedores, meses: string[], minimo = 1): PedidoProveedor[] {
  const out: PedidoProveedor[] = []
  for (const prov of nombresProveedores(data)) {
    const items = data[prov].products
      .map((p) => ({ id: p.id, name: p.name || '(sin nombre)', vendidas: vendidasEn(p, meses), unit_cost: p.unit_cost, margin: p.margin, stock: p.stock }))
      .filter((p) => p.stock <= 0 && p.vendidas >= minimo)
      .sort((a, b) => b.vendidas - a.vendidas)
      .map(({ id, name, vendidas, unit_cost, margin }) => ({ id, name, vendidas, unit_cost, margin }))
    if (!items.length) continue
    out.push({
      prov,
      items,
      unidades: items.reduce((s, i) => s + i.vendidas, 0),
      // Reponer lo vendido: la referencia más simple y honesta para decidir cuánto pedir.
      costoEstimado: items.reduce((s, i) => s + i.vendidas * i.unit_cost, 0),
    })
  }
  return out.sort((a, b) => b.unidades - a.unidades)
}

/** El pedido en texto, para pegarlo en un mail o un WhatsApp al proveedor. */
export function pedidoATexto(p: PedidoProveedor, periodo: string): string {
  const lineas = p.items.map((i) => `- ${i.name} — vendidas ${i.vendidas}`)
  return `Pedido a ${p.prov}${periodo ? ` (según ventas ${periodo})` : ''}\n\n${lineas.join('\n')}\n\nTotal: ${p.unidades} unidades sin stock.`
}
