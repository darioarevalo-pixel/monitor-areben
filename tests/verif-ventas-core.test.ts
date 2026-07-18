import { describe, it, expect } from 'vitest'
import { mesDe, particionar, rango } from '@/lib/verif-ventas/core'
import type { Discrepancia, Resueltas } from '@/lib/verif-ventas/tipos'

describe('mesDe / rango', () => {
  it('mesDe: YYYY-MM', () => {
    expect(mesDe(new Date(2026, 6, 18))).toBe('2026-07') // julio (mes 6 = índice)
    expect(mesDe(new Date(2026, 0, 1))).toBe('2026-01')
  })
  it('rango: primer y último día del mes', () => {
    expect(rango('2026-07')).toEqual({ from: '2026-07-01', to: '2026-07-31' })
    expect(rango('2026-02')).toEqual({ from: '2026-02-01', to: '2026-02-28' })
    expect(rango('2024-02')).toEqual({ from: '2024-02-01', to: '2024-02-29' }) // bisiesto
  })
})

describe('particionar', () => {
  const disc: Discrepancia[] = [
    { tn_order: '1001' },
    { tn_order: 1002 },
    { tn_order: '1003' },
  ]
  it('separa pendientes de resueltas (por tn_order string)', () => {
    const resueltas: Resueltas = { '1002': { resuelto: true, por: 'ana', fecha: '2026-07-18', mes: '2026-07' } }
    const { pend, res } = particionar(disc, resueltas)
    expect(pend.map((d) => String(d.tn_order))).toEqual(['1001', '1003'])
    expect(res.map((d) => String(d.tn_order))).toEqual(['1002'])
  })
  it('sin resueltas: todo pendiente', () => {
    expect(particionar(disc, {}).pend).toHaveLength(3)
    expect(particionar([], {}).pend).toEqual([])
  })
})
