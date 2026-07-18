import { describe, it, expect } from 'vitest'
import { LIFESPAN_SIN_DATO, type Producto } from '@/lib/etl/tipos'
import { candidatos, depositosOrdenados, diasDesde, type StockPorDeposito, type UltimaVenta } from '@/lib/caducados'

const NOW = new Date('2026-07-17T12:00:00.000Z')

function prod(over: Partial<Producto> & { id: string }): Producto {
  return {
    name: 'X', sku: null, proveedor: null, category: null, retailer_price: 0, unit_cost: 0,
    margin: null, markup: null, ingresoMes: null, firstSale: null, lastSale: null, daysSinceLast: 0,
    sales7: 0, sales15: 0, sales30: 0, sales60: 0, sales90: 0, totalSales: 0, monthlySales: [],
    stock: 0, lifespan: LIFESPAN_SIN_DATO, lifespanFirst: LIFESPAN_SIN_DATO,
    phase: { label: 'obsoleto', cls: 'badge-danger' }, ...over,
  }
}

describe('diasDesde', () => {
  it('cuenta días desde una fecha hasta now', () => {
    expect(diasDesde('2026-07-07', NOW)).toBe(10)
  })
})

describe('depositosOrdenados', () => {
  it('"Local" primero, el resto alfabético', () => {
    const stock: StockPorDeposito = {
      a: { total: 0, stores: { Depósito: 0, Local: 0, 'A-Bodega': 0 } },
    }
    expect(depositosOrdenados(stock)).toEqual(['Local', 'A-Bodega', 'Depósito'])
  })
})

describe('candidatos', () => {
  const productos = [
    prod({ id: '1', name: 'Sin stock viejo', category: 'Remeras' }),
    prod({ id: '2', name: 'Con stock' }),
    prod({ id: '3', name: 'Sin stock reciente' }),
    prod({ id: '4', name: 'Sin ventas nunca' }),
  ]
  const stock: StockPorDeposito = {
    '1': { total: 0, stores: { Local: 0, Depósito: 0 } },
    '2': { total: 5, stores: { Local: 5 } },
    '3': { total: 0, stores: { Local: 0 } },
    '4': { total: 0, stores: { Local: 0 } },
  }
  const ultimaVenta: UltimaVenta = {
    '1': '2026-01-01', // hace mucho
    '2': '2026-07-10',
    '3': '2026-07-10', // reciente
    // '4' sin venta
  }

  it('incluye sólo stock 0 + última venta anterior al corte', () => {
    const cands = candidatos(productos, stock, ultimaVenta, 30, NOW)
    expect(cands.map((c) => c.id)).toEqual(['1'])
  })
  it('excluye los que tienen stock, venta reciente o nunca vendieron', () => {
    const cands = candidatos(productos, stock, ultimaVenta, 30, NOW)
    expect(cands.some((c) => ['2', '3', '4'].includes(c.id))).toBe(false)
  })
  it('ordena por última venta ascendente (más viejo primero)', () => {
    const ps = [prod({ id: 'a' }), prod({ id: 'b' })]
    const st: StockPorDeposito = { a: { total: 0, stores: {} }, b: { total: 0, stores: {} } }
    const uv: UltimaVenta = { a: '2026-05-01', b: '2026-02-01' }
    expect(candidatos(ps, st, uv, 30, NOW).map((c) => c.id)).toEqual(['b', 'a'])
  })
  it('el corte se corre con N días', () => {
    // La venta de id '1' es de hace ~197 días: entra con N=30 pero NO con N=250
    // (ahí el corte exige un gap mayor al que tiene).
    expect(candidatos(productos, stock, ultimaVenta, 30, NOW).map((c) => c.id)).toEqual(['1'])
    expect(candidatos(productos, stock, ultimaVenta, 250, NOW)).toEqual([])
    // Venta de hace 10 días: entra con N=5, no con N=30.
    const uv2: UltimaVenta = { '3': '2026-07-07' }
    const st2: StockPorDeposito = { '3': { total: 0, stores: {} } }
    expect(candidatos([productos[2]], st2, uv2, 5, NOW).map((c) => c.id)).toEqual(['3'])
    expect(candidatos([productos[2]], st2, uv2, 30, NOW)).toEqual([])
  })
})
