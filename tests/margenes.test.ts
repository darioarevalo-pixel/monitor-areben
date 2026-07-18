import { describe, it, expect } from 'vitest'
import { LIFESPAN_SIN_DATO, type Producto } from '@/lib/etl/tipos'
import {
  buscar,
  colorDesfase,
  computarFilas,
  etiquetaDesfase,
  ordenar,
  resumen,
} from '@/lib/margenes'
import { indexarTn } from '@/lib/tn'

function prod(over: Partial<Producto> & { id: string }): Producto {
  return {
    name: 'X', sku: null, proveedor: null, category: null, retailer_price: 0, unit_cost: 0,
    margin: null, markup: null, ingresoMes: null, firstSale: null, lastSale: null, daysSinceLast: 0,
    sales7: 0, sales15: 0, sales30: 0, sales60: 0, sales90: 0, totalSales: 0, monthlySales: [],
    stock: 0, lifespan: LIFESPAN_SIN_DATO, lifespanFirst: LIFESPAN_SIN_DATO,
    phase: { label: 'madurez', cls: 'badge-info' }, ...over,
  }
}

describe('computarFilas · disponibles + exclusiones', () => {
  const productos = [
    prod({ id: '1', name: 'A', stock: 5, unit_cost: 100, retailer_price: 250 }),
    prod({ id: '2', name: 'Sin stock', stock: 0, unit_cost: 100, retailer_price: 250 }),
    prod({ id: '3', name: 'Sin costo', stock: 5, unit_cost: 0, retailer_price: 250 }),
    prod({ id: '4', name: 'Sin precio', stock: 5, unit_cost: 100, retailer_price: 0 }),
    prod({ id: '5', name: 'Stunned', sku: 'STU-001', stock: 5, unit_cost: 100, retailer_price: 250 }),
  ]

  it('sólo con stock, costo y precio; excluye SKU "stu"', () => {
    const filas = computarFilas(productos, indexarTn([]), 130)
    expect(filas.map((f) => f.p.id)).toEqual(['1'])
  })

  it('markup y margen sobre el minorista si no hay promo', () => {
    const [f] = computarFilas([productos[0]], indexarTn([]), 130)
    expect(f.markup).toBeCloseTo(150) // 250/100 - 1 = 1.5 → 150%
    expect(f.margin).toBeCloseTo(60) // (250-100)/250 = 0.6 → 60%
    expect(f.desfase).toBeCloseTo(20) // 150 - 130
    expect(f.esPromo).toBe(false)
    expect(f.precio).toBe(250)
  })

  it('usa la promo de TN si existe (más barata) y trae la foto', () => {
    const idx = indexarTn([{ sku: 'P1', name: 'A', promo_price: 200, images: ['x.jpg'] }])
    const [f] = computarFilas([prod({ id: '1', name: 'A', sku: 'P1', stock: 5, unit_cost: 100, retailer_price: 250 })], idx, 130)
    expect(f.esPromo).toBe(true)
    expect(f.precio).toBe(200)
    expect(f.markup).toBeCloseTo(100) // 200/100 - 1
    expect(f.foto).toBe('x.jpg')
  })
})

describe('buscar / ordenar / resumen', () => {
  const filas = computarFilas(
    [
      prod({ id: '1', name: 'Alfa', stock: 3, unit_cost: 100, retailer_price: 300 }), // mk 200
      prod({ id: '2', name: 'Beta', stock: 9, unit_cost: 100, retailer_price: 150 }), // mk 50
      prod({ id: '3', name: 'Gama', stock: 1, unit_cost: 100, retailer_price: 250 }), // mk 150
    ],
    indexarTn([]),
    130,
  )

  it('buscar por nombre', () => {
    expect(buscar(filas, 'beta').map((f) => f.p.id)).toEqual(['2'])
  })
  it('ordenar markup desc / asc / stock', () => {
    expect(ordenar(filas, 'markup-desc').map((f) => f.p.id)).toEqual(['1', '3', '2'])
    expect(ordenar(filas, 'markup-asc').map((f) => f.p.id)).toEqual(['2', '3', '1'])
    expect(ordenar(filas, 'stock-desc').map((f) => f.p.id)).toEqual(['2', '1', '3'])
  })
  it('resumen: promedio, mediana y desfasados (>15pts sobre objetivo 130)', () => {
    const r = resumen(filas)!
    expect(r.count).toBe(3)
    expect(r.prom).toBeCloseTo((200 + 50 + 150) / 3)
    expect(r.mediana).toBe(150) // ordenados [50,150,200], mediana índice 1
    expect(r.desfasados).toBe(2) // markup 200 (desf 70) y 150 (desf 20) > 15; 50 no
  })
  it('resumen null si no hay filas', () => {
    expect(resumen([])).toBeNull()
  })
})

describe('colorDesfase / etiquetaDesfase', () => {
  it('bandas de color', () => {
    expect(colorDesfase(60).color).toBe('#DC2626')
    expect(colorDesfase(20).color).toBe('#D97706')
    expect(colorDesfase(0).color).toBe('#16A34A')
    expect(colorDesfase(-30).color).toBe('#2563EB')
  })
  it('etiqueta', () => {
    expect(etiquetaDesfase(5)).toBe('en objetivo')
    expect(etiquetaDesfase(40)).toBe('+40 pts vs obj.')
    expect(etiquetaDesfase(-40)).toBe('−40 pts vs obj.')
  })
})
