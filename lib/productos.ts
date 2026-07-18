/**
 * "Por producto" (key `productos`): la tabla analítica principal. Port puro de la
 * lógica de renderProductos (index.html:2844-2891) — filtros, vida útil por modo y
 * agregación de meses de ingreso — sin DOM. La tabla/orden/paginación viven en
 * `lib/tabla.ts` (compartidos con `variantes`); el display de vida útil, en
 * `lib/etl/helpers.ts`. Read-only sobre `allProductos` del store del ETL.
 */

import { LIFESPAN_SIN_DATO, type Producto } from './etl/tipos'
import { lifespanDays, lifespanDaysGeneric } from './etl/helpers'

/** Los 4 modos del selector de vida útil (index.html:396-400). */
export type ModoVidaUtil = '7d' | '15d' | '30d' | 'firstSale'

/**
 * Vida útil en días según el modo elegido. Port de lifespanDaysByMode
 * (index.html:2837). El modo `firstSale` (contra el promedio desde la primera
 * venta) ya viene precomputado en `p.lifespanFirst` con la misma fórmula y la misma
 * fecha del ETL → se reusa el sentinel `LIFESPAN_SIN_DATO` en vez de arrastrar `today`.
 */
export function lifespanDaysByMode(p: Producto, mode: ModoVidaUtil): number | null {
  if (mode === 'firstSale') return p.lifespanFirst === LIFESPAN_SIN_DATO ? null : p.lifespanFirst
  if (mode === '7d') return lifespanDaysGeneric(p.stock, p.sales7, 7)
  if (mode === '15d') return lifespanDaysGeneric(p.stock, p.sales15, 15)
  return lifespanDays(p.stock, p.sales30)
}

export type FiltrosProductos = {
  /** Texto de búsqueda por nombre (lower, ya recortado por el caller o acá). */
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
 * + filtrarLista (2666): búsqueda por nombre, estado, proveedor, pills de ingreso y
 * "ocultar sin stock". El orden y la paginación se aplican después (lib/tabla).
 */
export function filtrarProductos(productos: Producto[], f: FiltrosProductos): Producto[] {
  const q = f.busqueda.trim().toLowerCase()
  return productos.filter((p) => {
    if (q && !(p.name || '').toLowerCase().includes(q)) return false
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

/** Umbral de color de la mini-barra de stock (index.html:2882): <5 rojo, <20 ámbar, resto verde. */
export function colorStock(stock: number): string {
  return stock < 5 ? '#e24b4a' : stock < 20 ? '#ef9f27' : '#1d9e75'
}
