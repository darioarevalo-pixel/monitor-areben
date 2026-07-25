import { describe, it, expect } from 'vitest'
import { comparativaPeriodo, mesesEnRango, pedidoATexto, pedidosPorProveedor, statsPeriodo, vendidasEn } from '@/lib/proveedores'
import type { ProductoProveedor } from '@/lib/etl/tipos'

const p = (over: Partial<ProductoProveedor>): ProductoProveedor => ({
  id: '1',
  name: 'Prod',
  retailer_price: 100,
  unit_cost: 10,
  firstSale: '2026-01-01',
  stock: 5,
  soldTotal: 0,
  soldByMonth: {},
  margin: null,
  ...over,
})

const MESES = ['2026-01', '2026-02', '2026-03', '2026-04']

/**
 * El sesgo que Bruno detectó: el filtro de fecha recortaba QUÉ productos entraban (por su
 * primera venta), pero los números seguían siendo de toda la vida. Estos tests fijan que
 * ahora las unidades y la compra sean del período elegido.
 */
describe('proveedores — métricas por período', () => {
  const prod = p({ soldByMonth: { '2026-01': 10, '2026-02': 5, '2026-04': 100 }, soldTotal: 115, unit_cost: 20 })

  it('mesesEnRango recorta por los dos extremos, inclusive', () => {
    expect(mesesEnRango(MESES, '2026-02', '2026-03')).toEqual(['2026-02', '2026-03'])
    expect(mesesEnRango(MESES, '', '')).toEqual(MESES)
    expect(mesesEnRango(MESES, '2026-04', '')).toEqual(['2026-04'])
  })

  it('vendidasEn suma SOLO los meses del período (no el acumulado)', () => {
    expect(vendidasEn(prod, ['2026-01', '2026-02'])).toBe(15)
    expect(prod.soldTotal).toBe(115) // el acumulado sigue existiendo, pero no es lo que se muestra
  })

  it('la compra del período es lo que costó reponer lo vendido en él', () => {
    const s = statsPeriodo([prod], ['2026-01', '2026-02'])
    expect(s.vendidas).toBe(15)
    expect(s.compraPeriodo).toBe(300) // 15 × 20
  })

  it('el margen se pondera por unidades vendidas, no promedia parejo', () => {
    const caro = p({ id: 'a', soldByMonth: { '2026-01': 100 }, margin: 50 })
    const raro = p({ id: 'b', soldByMonth: { '2026-01': 1 }, margin: 0 })
    const s = statsPeriodo([caro, raro], ['2026-01'])
    // Promedio parejo daría 25; ponderado da ~49,5, que es lo que pasa en el negocio.
    expect(Math.round(s.avgMargin * 10) / 10).toBe(49.5)
  })

  it('un producto sin ventas en el período no infla el margen', () => {
    const viejo = p({ id: 'v', soldByMonth: { '2025-01': 999 }, margin: 90 })
    const actual = p({ id: 'n', soldByMonth: { '2026-01': 10 }, margin: 30 })
    expect(statsPeriodo([viejo, actual], ['2026-01']).avgMargin).toBe(30)
  })

  it('comparativaPeriodo devuelve un stat por proveedor', () => {
    const data = { A: { products: [prod] }, B: { products: [p({ soldByMonth: { '2026-01': 2 } })] } }
    const c = comparativaPeriodo(data, ['2026-01'])
    expect(c.map((x) => [x.prov, x.vendidas])).toEqual([['A', 10], ['B', 2]])
  })
})

/** Del dato a la acción: qué pedirle a cada proveedor. */
describe('proveedores — accionable de compra', () => {
  const data = {
    Tela: {
      products: [
        p({ id: '1', name: 'Remera', stock: 0, soldByMonth: { '2026-01': 30 }, unit_cost: 10 }),
        p({ id: '2', name: 'Buzo', stock: 4, soldByMonth: { '2026-01': 50 } }), // tiene stock → no se pide
        p({ id: '3', name: 'Gorra', stock: 0, soldByMonth: {} }), // sin ventas → no se pide
      ],
    },
    Otro: { products: [p({ id: '4', name: 'Media', stock: 0, soldByMonth: { '2026-01': 5 }, unit_cost: 2 })] },
  }

  it('pide solo lo que se vendió y hoy está en cero', () => {
    const r = pedidosPorProveedor(data, ['2026-01'])
    expect(r.map((x) => x.prov)).toEqual(['Tela', 'Otro']) // ordenado por unidades
    expect(r[0].items.map((i) => i.name)).toEqual(['Remera'])
    expect(r[0].unidades).toBe(30)
    expect(r[0].costoEstimado).toBe(300)
  })

  it('el mínimo de ventas filtra la cola larga', () => {
    expect(pedidosPorProveedor(data, ['2026-01'], 10).map((x) => x.prov)).toEqual(['Tela'])
  })

  it('el texto del pedido lista producto y unidades', () => {
    const txt = pedidoATexto(pedidosPorProveedor(data, ['2026-01'])[0], 'ene-2026')
    expect(txt).toContain('Pedido a Tela')
    expect(txt).toContain('Remera — vendidas 30')
    expect(txt).toContain('30 unidades')
  })
})
