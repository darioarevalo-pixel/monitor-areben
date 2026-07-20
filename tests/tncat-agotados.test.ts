import { describe, it, expect } from 'vitest'
import { candidatosAOcultar } from '@/lib/tncat/agotados'
import { indexarTn, type TnProducto } from '@/lib/tn'
import type { Fase, Producto } from '@/lib/etl/tipos'

const MADUREZ: Fase = { label: 'madurez', cls: '' }

const prod = (over: Partial<Producto>): Producto => ({
  id: '1', name: 'Prod', sku: null, proveedor: null, category: null,
  retailer_price: 0, unit_cost: 0, margin: null, markup: null, ingresoMes: null,
  firstSale: null, lastSale: null, daysSinceLast: 0, sales7: 0, sales15: 0, sales30: 0,
  sales60: 0, sales90: 0, totalSales: 0, monthlySales: [], stock: 0, lifespan: 0,
  lifespanFirst: 0, phase: MADUREZ, ...over,
})

const idxDe = (tn: TnProducto[]) => indexarTn(tn)

describe('candidatosAOcultar', () => {
  it('agotado (stock 0) + publicado en TN → candidato, con el id de TN', () => {
    const idx = idxDe([{ id: 111, sku: 'A', name: 'Funda A', published: true }])
    const out = candidatosAOcultar([prod({ sku: 'A', name: 'Funda A', stock: 0 })], idx)
    expect(out).toHaveLength(1)
    expect(out[0].tnId).toBe(111)
    expect(out[0].sku).toBe('A')
  })

  it('con stock → NO es candidato', () => {
    const idx = idxDe([{ id: 111, sku: 'A', name: 'Funda A', published: true }])
    expect(candidatosAOcultar([prod({ sku: 'A', name: 'Funda A', stock: 3 })], idx)).toEqual([])
  })

  it('agotado pero ya despublicado en TN → NO es candidato', () => {
    const idx = idxDe([{ id: 111, sku: 'A', name: 'Funda A', published: false }])
    expect(candidatosAOcultar([prod({ sku: 'A', name: 'Funda A', stock: 0 })], idx)).toEqual([])
  })

  it('agotado sin match en TN → NO es candidato', () => {
    const idx = idxDe([{ id: 111, sku: 'Z', name: 'Otra cosa', published: true }])
    expect(candidatosAOcultar([prod({ sku: 'A', name: 'Producto sólo en GN', stock: 0 })], idx)).toEqual([])
  })

  it('dedup: dos productos GN que matchean el mismo TN → un solo candidato', () => {
    const idx = idxDe([{ id: 111, name: 'Funda azul iphone', published: true }])
    const out = candidatosAOcultar([
      prod({ id: 'g1', sku: null, name: 'Funda azul iphone', stock: 0 }),
      prod({ id: 'g2', sku: null, name: 'Funda azul iphone 13', stock: 0 }),
    ], idx)
    expect(out).toHaveLength(1)
    expect(out[0].tnId).toBe(111)
  })
})
