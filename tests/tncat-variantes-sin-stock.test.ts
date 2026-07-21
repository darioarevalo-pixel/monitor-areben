import { describe, it, expect } from 'vitest'
import { variantesSinStockVisibles } from '@/lib/tncat/variantes-sin-stock'
import { indexarTn, type TnProducto } from '@/lib/tn'
import type { Fase, Producto, Variante } from '@/lib/etl/tipos'

const MADUREZ: Fase = { label: 'madurez', cls: '' }

const prod = (over: Partial<Producto>): Producto => ({
  id: '1', name: 'Prod', sku: null, proveedor: null, category: null,
  retailer_price: 0, unit_cost: 0, margin: null, markup: null, ingresoMes: null,
  firstSale: null, lastSale: null, daysSinceLast: 0, sales7: 0, sales15: 0, sales30: 0,
  sales60: 0, sales90: 0, totalSales: 0, monthlySales: [], stock: 0, lifespan: 0,
  lifespanFirst: 0, phase: MADUREZ, ...over,
})

const mkVar = (over: Partial<Variante>): Variante => ({
  id: 'v1', pid: '1', sid: 's1', name: 'Prod', size: 'M', stock: 0, local: 0, deposito: 0,
  sku: 'A-M', barcode: '', lastSale: null, daysSinceLast: 0, sales7: 0, sales15: 0,
  sales30: 0, sales60: 0, sales90: 0, totalSales: 0, lifespan: 0, phase: MADUREZ, ...over,
})

const idxDe = (tn: TnProducto[]) => indexarTn(tn)

describe('variantesSinStockVisibles', () => {
  it('variante en 0 + producto publicado en TN → incluida, con el id de TN', () => {
    const idx = idxDe([{ id: 111, sku: 'A', name: 'Funda A', published: true }])
    const out = variantesSinStockVisibles(
      [prod({ id: '1', sku: 'A', name: 'Funda A', stock: 5 })],
      [mkVar({ pid: '1', size: 'Rojo', stock: 0, sku: 'A-ROJO' }), mkVar({ pid: '1', size: 'Azul', stock: 3, sku: 'A-AZUL' })],
      idx,
    )
    expect(out).toHaveLength(1)
    expect(out[0].tnId).toBe(111)
    expect(out[0].variantes).toHaveLength(1)
    expect(out[0].variantes[0].label).toBe('Rojo')
    expect(out[0].enteroAgotado).toBe(false)
  })

  it('producto ya despublicado en TN → NO aparece', () => {
    const idx = idxDe([{ id: 111, sku: 'A', name: 'Funda A', published: false }])
    const out = variantesSinStockVisibles(
      [prod({ id: '1', sku: 'A', name: 'Funda A', stock: 0 })],
      [mkVar({ pid: '1', stock: 0 })],
      idx,
    )
    expect(out).toEqual([])
  })

  it('producto sin match en TN → NO aparece', () => {
    const idx = idxDe([{ id: 111, sku: 'Z', name: 'Otra cosa', published: true }])
    const out = variantesSinStockVisibles(
      [prod({ id: '1', sku: 'A', name: 'Solo en GN', stock: 0 })],
      [mkVar({ pid: '1', stock: 0 })],
      idx,
    )
    expect(out).toEqual([])
  })

  it('todas las variantes con stock → producto no aparece', () => {
    const idx = idxDe([{ id: 111, sku: 'A', name: 'Funda A', published: true }])
    const out = variantesSinStockVisibles(
      [prod({ id: '1', sku: 'A', name: 'Funda A', stock: 6 })],
      [mkVar({ pid: '1', stock: 3 }), mkVar({ pid: '1', stock: 3 })],
      idx,
    )
    expect(out).toEqual([])
  })

  it('producto entero agotado → aparece con el flag enteroAgotado', () => {
    const idx = idxDe([{ id: 111, sku: 'A', name: 'Funda A', published: true }])
    const out = variantesSinStockVisibles(
      [prod({ id: '1', sku: 'A', name: 'Funda A', stock: 0 })],
      [mkVar({ pid: '1', size: 'M', stock: 0 }), mkVar({ pid: '1', size: 'L', stock: 0 })],
      idx,
    )
    expect(out).toHaveLength(1)
    expect(out[0].enteroAgotado).toBe(true)
    expect(out[0].variantes).toHaveLength(2)
  })
})
