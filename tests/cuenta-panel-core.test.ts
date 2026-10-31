import { describe, expect, it } from 'vitest'
import { mensajeDeSaldo, repartirPago, textoSaldo } from '@/lib/erp/cuenta-panel.core.js'

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
  it('«Enviar saldo»: los pedidos sin pagar, el más viejo primero, y el total; a favor, una línea; en cero, nada', () => {
    const plata = (n: number) => `$${n}`
    expect(mensajeDeSaldo({ nombre: 'Martín Ejemplo', saldo: 1500, pendientes: [
      { fecha: '2026-10-14', pendiente: 500, nombre: 'Venta 4930' }, { fecha: '2026-09-22', pendiente: 1000, nombre: 'Venta 4812' }, { fecha: '2026-09-01', pendiente: 0 },
    ] }, plata)).toBe('Hola Martín, te paso el saldo de tu cuenta en BDI:\n• Venta 4812 del 22/09: $1000\n• Venta 4930 del 14/10: $500\nTotal: $1500\n¡Gracias!')
    expect(mensajeDeSaldo({ nombre: 'Ana', saldo: -300, pendientes: [] }, plata)).toContain('$300 a favor')
    expect(mensajeDeSaldo({ nombre: 'Ana', saldo: 0, pendientes: [] }, plata)).toBeNull()
  })
})

describe('repartirPago desde un pedido (Darío §4)', () => {
  it('el pedido elegido va primero aunque sea el más nuevo; lo que sobra, a lo más viejo; lo demás, a favor', () => {
    const pend = [{ ref: 'venta:a', fecha: '2026-09-01', pendiente: 300 }, { ref: 'venta:b', fecha: '2026-10-01', pendiente: 500 }]
    expect(repartirPago(pend, 600, 'venta:b')).toEqual({ aFavor: 0, partes: [
      { ref: 'venta:b', fecha: '2026-10-01', paga: 500, queda: 0 }, { ref: 'venta:a', fecha: '2026-09-01', paga: 100, queda: 200 }] })
    expect(repartirPago(pend, 900, 'venta:b').aFavor).toBe(100)
    expect(repartirPago(pend, 600).partes[0].ref).toBe('venta:a')
  })
})
