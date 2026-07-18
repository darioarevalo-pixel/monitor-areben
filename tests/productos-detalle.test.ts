import { describe, it, expect } from 'vitest'
import { desglosePorVariante } from '@/lib/productos-detalle'
import type { VentasVariante, Variante } from '@/lib/etl/tipos'

function vv(over: Partial<VentasVariante> & { pid: string; sid: string }): VentasVariante {
  return { total: 0, s7: 0, s15: 0, s30: 0, s60: 0, s90: 0, byMonth: {}, last: null, name: '', size: '', ...over }
}
function variante(over: Partial<Variante> & { pid: string; sid: string }): Variante {
  return {
    name: '', size: '', stock: 0, local: 0, deposito: 0, sku: '', barcode: '',
    lastSale: null, daysSinceLast: 0, sales7: 0, sales15: 0, sales30: 0, sales60: 0, sales90: 0,
    totalSales: 0, lifespan: 0, phase: { label: 'madurez', cls: 'badge-info' }, ...over,
    id: over.pid + '_' + over.sid,
  } as Variante
}

describe('desglosePorVariante', () => {
  const allVvar = {
    'P_1': vv({ pid: 'P', sid: '1', size: 'M', total: 10, s7: 2, s30: 8 }),
    'P_2': vv({ pid: 'P', sid: '2', size: 'L', total: 5, s7: 1, s30: 4 }),
    'Q_1': vv({ pid: 'Q', sid: '1', size: 'S', total: 99, s7: 9, s30: 9 }),
  }
  const allVariantes = [
    variante({ pid: 'P', sid: '1', size: 'M', stock: 3 }),
    variante({ pid: 'P', sid: '2', size: 'L', stock: 0 }),
    variante({ pid: 'P', sid: '3', size: 'XL', stock: 7 }), // stock sin ventas
    variante({ pid: 'Q', sid: '1', size: 'S', stock: 1 }),
  ]

  it('cruza ventas + stock del producto y suma las variantes-solo-stock', () => {
    const { items, totalVendido } = desglosePorVariante(allVvar, allVariantes, 'P', 'total', -1)
    expect(totalVendido).toBe(15)
    // Orden por total desc: M(10), L(5), XL(0)
    expect(items.map((i) => i.size)).toEqual(['M', 'L', 'XL'])
    expect(items.find((i) => i.size === 'M')!.stock).toBe(3)
    expect(items.find((i) => i.size === 'XL')).toMatchObject({ total: 0, s7: 0, s30: 0, stock: 7 })
  })

  it('no mezcla otros productos', () => {
    const { items } = desglosePorVariante(allVvar, allVariantes, 'P', 'total', -1)
    expect(items.some((i) => i.size === 'S')).toBe(false)
  })

  it('orden por variante (string) es numeric-aware y respeta dir', () => {
    const vs = {
      'P_1': vv({ pid: 'P', sid: '1', size: '2', total: 1 }),
      'P_2': vv({ pid: 'P', sid: '2', size: '10', total: 1 }),
    }
    const vars = [variante({ pid: 'P', sid: '1', size: '2', stock: 0 }), variante({ pid: 'P', sid: '2', size: '10', stock: 0 })]
    const asc = desglosePorVariante(vs, vars, 'P', 'size', 1)
    expect(asc.items.map((i) => i.size)).toEqual(['2', '10']) // numeric: 2 antes que 10
  })

  it('producto sin variantes → vacío', () => {
    const { items } = desglosePorVariante(allVvar, allVariantes, 'ZZZ', 'total', -1)
    expect(items).toEqual([])
  })
})
