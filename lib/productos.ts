/**
 * "Por producto" (key `productos`): la tabla analítica principal. Port puro de la
 * lógica de renderProductos (index.html:2844-2891) — filtros, vida útil por modo y
 * agregación de meses de ingreso — sin DOM. La tabla/orden/paginación viven en
 * `lib/tabla.ts` (compartidos con `variantes`); el display de vida útil, en
 * `lib/etl/helpers.ts`. Read-only sobre `allProductos` del store del ETL.
 */

import { LIFESPAN_SIN_DATO, type Producto } from './etl/tipos'
import { lifespanDaysEfectivo } from './etl/helpers'
import { matcheaTexto } from './tabla'

/** Los 4 modos del selector de vida útil (index.html:396-400). */
export type ModoVidaUtil = '7d' | '15d' | '30d' | 'firstSale'

/**
 * Vida útil en días según el modo elegido. Port de lifespanDaysByMode (index.html:2837), con **una**
 * corrección sobre el legacy: las tres ventanas fijas dividen por los días que el producto estuvo
 * realmente a la venta, no por el largo de la ventana.
 *
 * Sin eso, una funda de 6 días repartía sus 243 ventas entre 30 días y la tabla anunciaba "3 meses"
 * de stock cuando quedaban 16 días. `lifespanDaysGeneric` y `lifespanDays` siguen intactas en
 * `etl/helpers` porque los tests de paridad con el legacy las miden.
 *
 * El modo `firstSale` no cambia: ya viene precomputado en `p.lifespanFirst` dividiendo por los días
 * transcurridos desde la primera venta, que es el mismo criterio.
 */
export function lifespanDaysByMode(p: Producto, mode: ModoVidaUtil): number | null {
  if (mode === 'firstSale') return p.lifespanFirst === LIFESPAN_SIN_DATO ? null : p.lifespanFirst
  if (mode === '7d') return lifespanDaysEfectivo(p.stock, p.sales7, 7, p.diasVivo)
  if (mode === '15d') return lifespanDaysEfectivo(p.stock, p.sales15, 15, p.diasVivo)
  return lifespanDaysEfectivo(p.stock, p.sales30, 30, p.diasVivo)
}

export type FiltrosProductos = {
  /** Texto de búsqueda: matchea contra nombre, SKU o proveedor (lower, se recorta acá). */
  busqueda: string
  /** Estado (phase.label) o '' = todos. */
  estado: string
  /** Proveedor exacto o '' = todos. */
  proveedor: string
  /** Meses de ingreso seleccionados (YYYY-MM); vacío = todos. */
  ingresos: Set<string>
  /** Ocultar los productos con stock 0. */
  ocultarSinStock: boolean
}

/**
 * Aplica los filtros de la toolbar. Port de renderProductos (index.html:2846-2851)
 * + filtrarLista (2666): búsqueda, estado, proveedor, pills de ingreso y
 * "ocultar sin stock". El orden y la paginación se aplican después (lib/tabla).
 *
 * 🔑 **La búsqueda mira nombre, SKU y proveedor**, y ⛔ no sólo el nombre como el legacy. Los tres
 * ya se dibujan en la fila (`ProductosTable`, la línea `meta`): un código que está a la vista y no
 * se puede buscar se lee como que el producto no está. El filtro `proveedor` de al lado sigue
 * siendo el select **exacto** — son dos gestos distintos y no se pisan.
 */
export function filtrarProductos(productos: Producto[], f: FiltrosProductos): Producto[] {
  const q = f.busqueda.trim().toLowerCase()
  return productos.filter((p) => {
    if (!matcheaTexto(q, [p.name, p.sku, p.proveedor])) return false
    if (f.estado && p.phase.label !== f.estado) return false
    if (f.proveedor && p.proveedor !== f.proveedor) return false
    if (f.ingresos.size && (!p.ingresoMes || !f.ingresos.has(p.ingresoMes))) return false
    if (f.ocultarSinStock && !(p.stock > 0)) return false
    return true
  })
}

/** Los proveedores presentes, ordenados alfabéticamente (index.html:2394). */
export function proveedores(productos: Producto[]): string[] {
  return [...new Set(productos.map((p) => p.proveedor).filter((x): x is string => !!x))].sort((a, b) =>
    a.localeCompare(b, 'es'),
  )
}

export type MesIngreso = { mes: string; cantidad: number }

/**
 * Meses de ingreso con su conteo de productos, más reciente primero. Port de
 * buildIngresoPills (index.html:2727-2730).
 */
export function mesesIngreso(productos: Producto[]): MesIngreso[] {
  const cuenta: Record<string, number> = {}
  productos.forEach((p) => {
    if (p.ingresoMes) cuenta[p.ingresoMes] = (cuenta[p.ingresoMes] || 0) + 1
  })
  return Object.entries(cuenta)
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([mes, cantidad]) => ({ mes, cantidad }))
}

const MONTH_NAMES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

/** `YYYY-MM` → `Mmm YYYY` (ej. `2026-07` → `Jul 2026`). Rótulo de las pills (index.html:2735). */
export function mesLabel(m: string): string {
  const [y, mo] = m.split('-')
  return MONTH_NAMES[parseInt(mo) - 1] + ' ' + y
}

/** `YYYY-MM-DD` → `3 Ago 2026`. Se arma a mano y no con `Date`, que corre la fecha por zona horaria. */
export function fechaCorta(iso: string | null): string {
  if (!iso) return ''
  const [y, mo, d] = iso.split('-')
  const nombre = MONTH_NAMES[parseInt(mo) - 1]
  if (!nombre || !d) return iso
  return `${parseInt(d)} ${nombre} ${y}`
}

/**
 * Cuánto hace que existe, en la unidad que se entiende de un vistazo: días hasta el mes y medio,
 * meses hasta los dos años, años después. Mismos cortes que `formatLifespan`, para que las dos
 * columnas se lean con la misma vara.
 */
export function antiguedad(dias: number | null): string {
  if (dias === null) return ''
  if (dias === 0) return 'hoy'
  if (dias === 1) return 'ayer'
  if (dias <= 45) return `hace ${dias} días`
  if (dias <= 730) return `hace ${Math.round(dias / 30)} meses`
  const a = Math.round((dias / 365) * 10) / 10
  return `hace ${String(a).replace('.', ',')} años`
}

/** Umbral de color de la mini-barra de stock (index.html:2882): <5 rojo, <20 ámbar, resto verde. */
export function colorStock(stock: number): string {
  return stock < 5 ? '#e24b4a' : stock < 20 ? '#ef9f27' : '#1d9e75'
}
