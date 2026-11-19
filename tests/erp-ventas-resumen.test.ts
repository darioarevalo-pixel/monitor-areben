/**
 * ERP › Ventas: los cálculos del rediseño de Darío (19-nov) — lo vendido por día, el mismo tramo del mes pasado,
 * la variación, las ventas de un producto por variante y el % del margen.
 */
import { describe, expect, it } from 'vitest'
import { mismoTramoDelMesPasado, variacion, vendidoPorDia } from '@/lib/erp/ventas-lista.core.js'
import { margenPct, porVariante } from '@/lib/erp/ventas-producto.core.js'

const dia = (iso: string) => iso.slice(0, 10)

describe('lo vendido por día', () => {
  it('suma las ventas vivas de cada día, con los días sin venta en 0; ⛔ pedidos ni anuladas', () => {
    const filas = [
      { kind: 'venta', anulada: false, total: 100, pedidoEn: '2026-11-01T15:00:00Z' },
      { kind: 'venta', anulada: false, total: 50, pedidoEn: '2026-11-01T18:00:00Z' },
      { kind: 'venta', anulada: true, total: 999, pedidoEn: '2026-11-02T15:00:00Z' },
      { kind: 'pedido', anulada: false, total: 999, pedidoEn: '2026-11-02T15:00:00Z' },
      { kind: 'venta', anulada: false, total: 30, pedidoEn: '2026-11-03T15:00:00Z' },
    ]
    expect(vendidoPorDia(filas, '2026-11-01', '2026-11-04', dia)).toEqual([
      { dia: '2026-11-01', vendido: 150 }, { dia: '2026-11-02', vendido: 0 }, { dia: '2026-11-03', vendido: 30 }, { dia: '2026-11-04', vendido: 0 },
    ])
  })
})

describe('contra el mes pasado', () => {
  it('el mismo tramo: del 1 al mismo día; si el mes pasado es más corto, hasta su último día', () => {
    expect(mismoTramoDelMesPasado('2026-11-19')).toEqual({ desde: '2026-10-01', hasta: '2026-10-19' })
    expect(mismoTramoDelMesPasado('2026-03-31')).toEqual({ desde: '2026-02-01', hasta: '2026-02-28' })
    expect(mismoTramoDelMesPasado('2026-01-15')).toEqual({ desde: '2025-12-01', hasta: '2025-12-15' })
  })
  it('la variación en % entero; sin nada antes, null', () => {
    expect(variacion(112, 100)).toBe(12)
    expect(variacion(80, 100)).toBe(-20)
    expect(variacion(50, 0)).toBeNull()
  })
})

describe('un producto por variante', () => {
  it('agrupa por SKU, la más vendida primero; una devolución resta', () => {
    const r = (sku: string | null, talle: string, cantidad: number, total: number) => ({ sku, talle, cantidad, total })
    const v = porVariante([r('A-15', 'iPhone 15', 2, 200), r('A-16', 'iPhone 16', 1, 100), r('A-15', 'iPhone 15', 1, 100), r('A-16', 'iPhone 16', -1, -100), r(null, 'Única', 3, 30)] as never)
    expect(v.map((x: { talle: string; unidades: number }) => [x.talle, x.unidades])).toEqual([['iPhone 15', 3], ['Única', 3]])
  })
  it('el % del margen; sin costo o sin venta, null', () => {
    expect(margenPct(68, 100)).toBe(68)
    expect(margenPct(null, 100)).toBeNull()
    expect(margenPct(10, 0)).toBeNull()
  })
})
