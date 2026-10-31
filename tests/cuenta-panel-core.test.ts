import { describe, expect, it } from 'vitest'
import { repartirPago, textoSaldo } from '@/lib/erp/cuenta-panel.core.js'

const P = [
  { ref: 'venta:b', fecha: '2026-10-07', pendiente: 540500 },
  { ref: 'venta:a', fecha: '2026-09-22', pendiente: 612000 },
  { ref: 'venta:c', fecha: '2026-10-14', pendiente: 323600 },
]

describe('La vista previa del pago en el panel (igual que reparte el motor)', () => {
  it('paga primero la compra más VIEJA y lo que sobra a la siguiente', () => {
    expect(repartirPago(P, 700000)).toEqual({ aFavor: 0, partes: [
      { ref: 'venta:a', fecha: '2026-09-22', paga: 612000, queda: 0 },
      { ref: 'venta:b', fecha: '2026-10-07', paga: 88000, queda: 452500 },
    ] })
  })
  it('sólo queda a favor si ya ⛔ debe nada; sin monto, nada', () => {
    const r = repartirPago(P, 1500000)
    expect(r.partes.map((p) => p.queda)).toEqual([0, 0, 0])
    expect(r.aFavor).toBe(23900)
    expect(repartirPago([], 1000)).toEqual({ partes: [], aFavor: 1000 })
    expect(repartirPago(P, 0)).toEqual({ partes: [], aFavor: 0 })
    expect(repartirPago(P, Number.NaN)).toEqual({ partes: [], aFavor: 0 })
  })
  it('el saldo en palabras', () => {
    const plata = (n: number) => `$${n}`
    expect(textoSaldo(10, plata)).toBe('$10')
    expect(textoSaldo(-5, plata)).toBe('$5 a favor')
    expect(textoSaldo(0, plata)).toBe('Al día')
  })
})
