import { describe, it, expect } from 'vitest'
import { computarDatos } from '@/lib/etl/computar'
import type { ProductoProveedor } from '@/lib/etl/tipos'
import {
  chartMensual,
  colorMargen,
  comparativa,
  filtrarPorFecha,
  kpisProveedor,
  mesLabel,
  nombresProveedores,
  ranking,
  type DatosProveedores,
} from '@/lib/proveedores'
import { leerFixture } from './legacy-etl'

const AHORA = new Date('2026-07-17T12:00:00.000Z')

function pp(over: Partial<ProductoProveedor>): ProductoProveedor {
  return {
    id: 'x', name: 'X', retailer_price: 0, unit_cost: 0, firstSale: null,
    stock: 0, soldTotal: 0, soldByMonth: {}, margin: null, ...over,
  }
}

const DATA: DatosProveedores = {
  ZETA: { products: [pp({ id: '1', soldTotal: 10, stock: 5, unit_cost: 100, margin: 50, firstSale: '2026-03-01', soldByMonth: { '2026-03': 10 } })] },
  ACME: { products: [
    pp({ id: '2', soldTotal: 20, stock: 0, unit_cost: 200, margin: 30, firstSale: '2026-05-10', soldByMonth: { '2026-05': 20 } }),
    pp({ id: '3', soldTotal: 5, stock: 3, unit_cost: 50, margin: null, firstSale: null }),
  ] },
}

describe('nombresProveedores / comparativa', () => {
  it('nombres alfabéticos', () => {
    expect(nombresProveedores(DATA)).toEqual(['ACME', 'ZETA'])
  })
  it('comparativa: vendidas, stock, rentab. prom. (solo márgenes válidos), compra', () => {
    const stats = comparativa(DATA)
    const acme = stats.find((s) => s.prov === 'ACME')!
    expect(acme.totalSold).toBe(25)
    expect(acme.totalStock).toBe(3)
    expect(acme.avgMargin).toBe(30) // solo el producto con margin !== null
    expect(acme.compra).toBe((20 + 0) * 200 + (5 + 3) * 50) // 4000 + 400 = 4400
  })
})

describe('kpisProveedor', () => {
  it('avgMargin null si no hay márgenes; estimatedPurchase null si 0', () => {
    const k = kpisProveedor([pp({ soldTotal: 0, stock: 0, unit_cost: 0, margin: null })])
    expect(k.avgMargin).toBeNull()
    expect(k.estimatedPurchase).toBeNull()
  })
})

describe('filtrarPorFecha', () => {
  const products = DATA.ACME.products
  it('sin filtro incluye todos (incluso sin firstSale)', () => {
    expect(filtrarPorFecha(products, '', '').length).toBe(2)
  })
  it('con filtro descarta los que no tienen firstSale', () => {
    expect(filtrarPorFecha(products, '2026-01-01', '').map((p) => p.id)).toEqual(['2'])
  })
  it('respeta desde/hasta', () => {
    expect(filtrarPorFecha(products, '2026-06-01', '').length).toBe(0)
    expect(filtrarPorFecha(products, '', '2026-05-31').map((p) => p.id)).toEqual(['2'])
  })
})

describe('chartMensual / ranking / colorMargen / mesLabel', () => {
  it('chartMensual suma por mes en los últimos 12', () => {
    const c = chartMensual(DATA.ACME.products, ['2026-04', '2026-05'])
    expect(c).toEqual([{ label: 'Abr 26', value: 0 }, { label: 'May 26', value: 20 }])
  })
  it('ranking ordena por soldTotal desc', () => {
    expect(ranking(DATA.ACME.products).map((p) => p.id)).toEqual(['2', '3'])
  })
  it('colorMargen por umbral', () => {
    expect(colorMargen(null)).toBe('#aaa')
    expect(colorMargen(50)).toBe('#1d9e75')
    expect(colorMargen(30)).toBe('#ba7517')
    expect(colorMargen(10)).toBe('#e24b4a')
  })
  it('mesLabel', () => {
    expect(mesLabel('2026-07')).toBe('Jul 26')
  })
})

describe('paridad · sobre el ETL real (zattia)', () => {
  const fixture = leerFixture('zattia')
  if (!fixture) {
    it.skip('falta tests/fixtures/etl-zattia.json', () => {})
  } else {
    it('la comparativa cubre a todos los proveedores del store', () => {
      const datos = computarDatos(fixture.entrada, { today: AHORA, colorManualMap: fixture.ctx.colorManualMap })
      const stats = comparativa(datos.allProveedoresData)
      expect(stats.length).toBe(Object.keys(datos.allProveedoresData).length)
      // Cada stat coincide con recomputar sus KPIs.
      stats.forEach((s) => {
        const k = kpisProveedor(datos.allProveedoresData[s.prov].products)
        expect(s.totalSold).toBe(k.totalSold)
        expect(s.totalStock).toBe(k.totalStock)
      })
    })
  }
})
