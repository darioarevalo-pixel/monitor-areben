import { describe, it, expect } from 'vitest'
import { detallesPorVenta } from '@/lib/crm/core'
import type { FilaDetalle } from '@/lib/crm/tipos'

/**
 * `detallesPorVenta` es lo que permite abrir CUALQUIER pedido del historial de la ficha
 * y no solo el último.
 *
 * Va acá y no en `crm-paridad.test.ts` por una razón práctica: ese archivo se saltea
 * entero cuando falta el fixture con los datos reales, que es el caso en cualquier
 * máquina que no lo haya bajado. Esto tiene que correr siempre.
 */

const d = (sale_id: number, product_name: string, over: Partial<FilaDetalle> = {}): FilaDetalle => ({
  sale_id,
  product_name,
  size: 'iPhone 15',
  quantity: 1,
  unit_price: 3990,
  total: 3990,
  ...over,
})

describe('detallesPorVenta', () => {
  it('agrupa cada renglón bajo su pedido', () => {
    const m = detallesPorVenta([d(1, 'Funda'), d(2, 'Cargador'), d(1, 'Vidrio')])
    expect([...m.keys()].sort()).toEqual([1, 2])
    expect(m.get(1)!.map((x) => x.product_name)).toEqual(['Funda', 'Vidrio'])
    expect(m.get(2)!.map((x) => x.product_name)).toEqual(['Cargador'])
  })

  it('no pierde ni duplica renglones', () => {
    const det = [d(1, 'a'), d(1, 'b'), d(2, 'c'), d(3, 'd'), d(2, 'e')]
    const m = detallesPorVenta(det)
    expect([...m.values()].reduce((n, l) => n + l.length, 0)).toBe(det.length)
  })

  it('conserva el orden en que vinieron los renglones de un mismo pedido', () => {
    // Importa: el detalle sale de la venta en el orden en que se cargó, y así es como
    // Bruno lo lee contra el remito.
    const m = detallesPorVenta([d(9, 'primero'), d(9, 'segundo'), d(9, 'tercero')])
    expect(m.get(9)!.map((x) => x.product_name)).toEqual(['primero', 'segundo', 'tercero'])
  })

  it('un pedido sin renglones simplemente no está en el mapa (la ficha pide con ?? [])', () => {
    const m = detallesPorVenta([d(1, 'a')])
    expect(m.get(999)).toBeUndefined()
    expect(m.get(999) || []).toEqual([])
  })

  it('descarta los renglones sin pedido en vez de romper', () => {
    const huerfano = { ...d(1, 'x'), sale_id: null as unknown as number }
    const m = detallesPorVenta([huerfano, d(5, 'ok')])
    expect([...m.keys()]).toEqual([5])
  })

  it('aguanta una lista vacía', () => {
    expect(detallesPorVenta([]).size).toBe(0)
  })

  it('agrupa igual si el id viene como texto (PostgREST devuelve numeric como string)', () => {
    const comoTexto = { ...d(7, 'a'), sale_id: '7' as unknown as number }
    const m = detallesPorVenta([comoTexto, d(7, 'b')])
    expect(m.size).toBe(1)
    expect(m.get(7)!.length).toBe(2)
  })
})
