import { describe, it, expect } from 'vitest'
import { LIFESPAN_SIN_DATO, type Producto } from '@/lib/etl/tipos'
import { filasSale, mesLabelCorto, precioMasBarato } from '@/lib/productos-sale'
import { indexarTn } from '@/lib/tn'

function prod(over: Partial<Producto>): Producto {
  return {
    id: 'x', name: 'X', sku: null, proveedor: null, category: null,
    retailer_price: 0, unit_cost: 0, margin: null, markup: null,
    ingresoMes: null, firstSale: null, lastSale: null, daysSinceLast: 0,
    sales7: 0, sales15: 0, sales30: 0, sales60: 0, sales90: 0, totalSales: 0,
    monthlySales: [], stock: 0, lifespan: LIFESPAN_SIN_DATO, lifespanFirst: LIFESPAN_SIN_DATO,
    phase: { label: 'madurez', cls: 'badge-info' },
    ...over,
  }
}

describe('precioMasBarato · mín(GN, promo TN)', () => {
  it('toma la promo TN si es más barata que el minorista GN', () => {
    const idx = indexarTn([{ sku: 'A', name: 'Prod A', promo_price: 800 }])
    expect(precioMasBarato(prod({ sku: 'A', name: 'Prod A', retailer_price: 1000 }), idx)).toBe(800)
  })
  it('toma el minorista GN si es más barato que la promo', () => {
    const idx = indexarTn([{ sku: 'A', name: 'Prod A', promo_price: 1200 }])
    expect(precioMasBarato(prod({ sku: 'A', name: 'Prod A', retailer_price: 1000 }), idx)).toBe(1000)
  })
  it('sin promo (0) usa el GN', () => {
    const idx = indexarTn([{ sku: 'A', name: 'Prod A', promo_price: 0 }])
    expect(precioMasBarato(prod({ sku: 'A', name: 'Prod A', retailer_price: 1000 }), idx)).toBe(1000)
  })
  it('sin match TN usa el GN', () => {
    expect(precioMasBarato(prod({ sku: 'ZZZ', name: 'Sin match', retailer_price: 500 }), indexarTn([]))).toBe(500)
  })
  it('sin GN ni promo → 0', () => {
    expect(precioMasBarato(prod({ sku: 'A', name: 'Sin precio', retailer_price: 0 }), indexarTn([]))).toBe(0)
  })
})

describe('mesLabelCorto', () => {
  it('YYYY-MM → Mmm YY', () => {
    expect(mesLabelCorto('2026-07')).toBe('Jul 26')
  })
})

describe('filasSale', () => {
  const promoIdx = indexarTn([{ sku: 'B', name: 'B', promo_price: 700 }])
  const sel = [
    prod({ id: '1', name: 'Zapatilla', sku: 'Z-01', stock: 4, retailer_price: 2000, ingresoMes: '2026-05' }),
    prod({ id: '2', name: 'Buzo', sku: 'B', stock: 0, retailer_price: 900 }),
  ]

  it('ordena por nombre y formatea precio (mín GN/promo) e ingreso', () => {
    const filas = filasSale(sel, promoIdx, '30d')
    expect(filas.map((f) => f.name)).toEqual(['Buzo', 'Zapatilla']) // alfabético
    expect(filas[0].precio).toBe('$700') // promo TN < GN 900
    expect(filas[1].precio).toBe('$2.000') // sin match TN → GN, con separador es-AR
    expect(filas[1].ingreso).toBe('May 26')
    expect(filas[0].ingreso).toBe('—') // sin ingresoMes
  })
  it('trunca el SKU a 18 caracteres', () => {
    const f = filasSale([prod({ name: 'X', sku: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', retailer_price: 100 })], indexarTn([]), '30d')
    expect(f[0].sku).toBe('ABCDEFGHIJKLMNOPQR')
    expect(f[0].sku.length).toBe(18)
  })
  it('sin precio → —', () => {
    const f = filasSale([prod({ name: 'X', retailer_price: 0 })], indexarTn([]), '30d')
    expect(f[0].precio).toBe('—')
  })
})
