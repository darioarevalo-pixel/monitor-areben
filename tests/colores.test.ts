import { describe, it, expect } from 'vitest'
import type { Agotamiento, VentaColor } from '@/lib/etl/tipos'
import {
  coloresDeAgotamiento,
  coloresOrdenados,
  cutoffDe,
  filtrarAgotamiento,
  filtrarVentas,
  fmtDate,
  proveedoresAgot,
  ventasPorColor,
} from '@/lib/colores'

const SALES: VentaColor[] = [
  { product_name: 'TOP CROP', color: 'NEGRO', qty: 10, mes: '2026-03' },
  { product_name: 'TOP CROP', color: 'BLANCO', qty: 4, mes: '2026-05' },
  { product_name: 'PANTALON', color: 'NEGRO', qty: 3, mes: '2026-05' },
  { product_name: 'TOP CROP', color: 'ROJO', qty: 1, mes: '2026-01' },
]

describe('cutoffDe', () => {
  const months = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05']
  it('período N → mes N-ésimo desde el final', () => {
    expect(cutoffDe(3, months)).toBe('2026-03')
  })
  it('período 0 → sin corte', () => {
    expect(cutoffDe(0, months)).toBe('')
  })
})

describe('filtrarVentas / coloresOrdenados', () => {
  it('filtra por búsqueda (nombre) y corte', () => {
    const f = filtrarVentas(SALES, 'top', '2026-02')
    // TOP CROP con mes >= 2026-02: NEGRO(03), BLANCO(05). ROJO(01) queda fuera del corte.
    expect(f.map((r) => r.color)).toEqual(['NEGRO', 'BLANCO'])
  })
  it('colores ordenados por volumen desc', () => {
    expect(coloresOrdenados(SALES)).toEqual(['NEGRO', 'BLANCO', 'ROJO']) // 13, 4, 1
  })
})

describe('ventasPorColor', () => {
  it('suma sólo los colores tildados y ordena por cantidad', () => {
    const { filas, total } = ventasPorColor(SALES, new Set(['NEGRO', 'BLANCO']))
    expect(filas).toEqual([{ color: 'NEGRO', qty: 13 }, { color: 'BLANCO', qty: 4 }])
    expect(total).toBe(17)
  })
  it('sin colores tildados → vacío', () => {
    expect(ventasPorColor(SALES, new Set()).total).toBe(0)
  })
})

const AGOT: Agotamiento[] = [
  {
    product_name: 'TOP CROP', product_id: '1', proveedor: 'ACME', firstSelloutDate: '2026-05-10',
    soldOutColors: ['NEGRO'],
    colors: {
      NEGRO: { initialStock: 20, totalSold: 20, currentStock: 0, selloutDate: '2026-05-10', cumByDate: [] },
      BLANCO: { initialStock: 20, totalSold: 8, currentStock: 12, selloutDate: null, cumByDate: [] },
    },
    ratioAtRef: { NEGRO: { sold: 20, pct: 71.4 }, BLANCO: { sold: 8, pct: 28.6 } },
  },
  {
    product_name: 'PANTALON', product_id: '2', proveedor: null, firstSelloutDate: null,
    soldOutColors: [], colors: { AZUL: { initialStock: 10, totalSold: 2, currentStock: 8, selloutDate: null, cumByDate: [] } },
    ratioAtRef: { AZUL: { sold: 2, pct: 100 } },
  },
]

describe('filtrarAgotamiento', () => {
  it('los agotados primero (fecha desc), después en curso', () => {
    expect(filtrarAgotamiento(AGOT, { search: '', prov: '', estado: '' }).map((p) => p.product_id)).toEqual(['1', '2'])
  })
  it('filtra por estado', () => {
    expect(filtrarAgotamiento(AGOT, { search: '', prov: '', estado: 'en_curso' }).map((p) => p.product_id)).toEqual(['2'])
    expect(filtrarAgotamiento(AGOT, { search: '', prov: '', estado: 'agotado' }).map((p) => p.product_id)).toEqual(['1'])
  })
  it('filtra por proveedor y búsqueda', () => {
    expect(filtrarAgotamiento(AGOT, { search: 'top', prov: '', estado: '' }).map((p) => p.product_id)).toEqual(['1'])
    expect(filtrarAgotamiento(AGOT, { search: '', prov: 'ACME', estado: '' }).map((p) => p.product_id)).toEqual(['1'])
  })
})

describe('coloresDeAgotamiento', () => {
  it('ordena por % desc y marca el que agotó primero', () => {
    const filas = coloresDeAgotamiento(AGOT[0])
    expect(filas.map((f) => f.color)).toEqual(['NEGRO', 'BLANCO'])
    expect(filas[0].isSoldOut).toBe(true)
    expect(filas[0].initialStock).toBe(20)
    expect(filas[1].isSoldOut).toBe(false)
  })
})

describe('proveedoresAgot / fmtDate', () => {
  it('proveedores no nulos, alfabéticos', () => {
    expect(proveedoresAgot(AGOT)).toEqual(['ACME'])
  })
  it('fmtDate ISO → DD/MM/YYYY', () => {
    expect(fmtDate('2026-05-10')).toBe('10/05/2026')
    expect(fmtDate(null)).toBe('—')
  })
})
