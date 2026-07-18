import { describe, it, expect } from 'vitest'
import type { VentaTalle } from '@/lib/etl/tipos'
import { categoriaDefault, mesLabel, rangoPeriodo, ventasPorTalle } from '@/lib/talles'

const DATA: VentaTalle[] = [
  { category: 'JEANS', size: '38', qty: 5, mes: '2026-03' },
  { category: 'JEANS', size: '40', qty: 3, mes: '2026-05' },
  { category: 'JEANS', size: '38', qty: 2, mes: '2026-05' },
  { category: 'JEANS', size: 'XL', qty: 4, mes: '2026-05' },
  { category: 'REMERAS', size: 'M', qty: 9, mes: '2026-05' },
]

describe('ventasPorTalle', () => {
  it('agrega por talle dentro de la categoría y el rango', () => {
    const filas = ventasPorTalle(DATA, 'JEANS', '2026-05', '2026-05')
    // 38 (2) queda del 05; 40 (3); XL (4). El 38 de marzo queda fuera del rango.
    expect(filas).toEqual([
      { size: '38', qty: 2 },
      { size: '40', qty: 3 },
      { size: 'XL', qty: 4 },
    ])
  })
  it('ordena numéricos asc y después alfabéticos', () => {
    const d: VentaTalle[] = [
      { category: 'C', size: 'XL', qty: 1, mes: '2026-01' },
      { category: 'C', size: '10', qty: 1, mes: '2026-01' },
      { category: 'C', size: '2', qty: 1, mes: '2026-01' },
      { category: 'C', size: 'S', qty: 1, mes: '2026-01' },
    ]
    expect(ventasPorTalle(d, 'C', '', '').map((f) => f.size)).toEqual(['2', '10', 'S', 'XL'])
  })
  it('otra categoría no se mezcla', () => {
    expect(ventasPorTalle(DATA, 'REMERAS', '', '').map((f) => f.size)).toEqual(['M'])
  })
})

describe('rangoPeriodo', () => {
  const meses = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05']
  it('período N toma los últimos N meses', () => {
    expect(rangoPeriodo(meses, 3)).toEqual({ desde: '2026-03', hasta: '2026-05' })
  })
  it('período 0 = todos', () => {
    expect(rangoPeriodo(meses, 0)).toEqual({ desde: '2026-01', hasta: '2026-05' })
  })
  it('sin meses → null', () => {
    expect(rangoPeriodo([], 12)).toBeNull()
  })
})

describe('categoriaDefault / mesLabel', () => {
  it('JEANS si existe, si no la primera', () => {
    expect(categoriaDefault(['REMERAS', 'JEANS', 'CAMPERAS'])).toBe('JEANS')
    expect(categoriaDefault(['REMERAS', 'CAMPERAS'])).toBe('REMERAS')
    expect(categoriaDefault([])).toBe('')
  })
  it('mesLabel', () => {
    expect(mesLabel('2026-07')).toBe('Jul 26')
  })
})
