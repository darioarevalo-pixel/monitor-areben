import { describe, expect, it } from 'vitest'
import { calcularDiferencia, calcularTotalCambio, type CambioItem } from '@/lib/cambios/tipos'

const item = (precio: number, cantidad = 1): CambioItem => ({ producto: 'x', precio, cantidad })

describe('calcularTotalCambio (Fase B.4)', () => {
  it('diferencia a cobrar sin forma ni envío = diferencia pura', () => {
    const t = calcularTotalCambio({ devueltos: [item(1000)], nuevos: [item(1500)] })
    expect(t.diferencia).toBe(500)
    expect(t.estado).toBe('a_cobrar')
    expect(t.descuento).toBe(0)
    expect(t.envioACobrar).toBe(0)
    expect(t.total).toBe(500)
  })

  it('tarjeta no descuenta (0%)', () => {
    const t = calcularTotalCambio({ devueltos: [item(1000)], nuevos: [item(2000)], forma: 'tarjeta' })
    expect(t.descuento).toBe(0)
    expect(t.total).toBe(1000)
  })

  it('transferencia descuenta 10% SOLO sobre la diferencia', () => {
    const t = calcularTotalCambio({ devueltos: [item(1000)], nuevos: [item(2000)], forma: 'transferencia' })
    expect(t.diferencia).toBe(1000)
    expect(t.descuento).toBe(100) // 10% de 1000
    expect(t.total).toBe(900)
  })

  it('el envío se suma solo si lo paga el cliente, y NO entra en el descuento', () => {
    const conCliente = calcularTotalCambio({ devueltos: [item(1000)], nuevos: [item(2000)], forma: 'transferencia', envioCosto: 500, envioPaga: 'cliente' })
    expect(conCliente.descuento).toBe(100) // sigue siendo 10% de la diferencia (1000), no de 1500
    expect(conCliente.envioACobrar).toBe(500)
    expect(conCliente.total).toBe(1400) // (1000 − 100) + 500

    const conNosotros = calcularTotalCambio({ devueltos: [item(1000)], nuevos: [item(2000)], forma: 'transferencia', envioCosto: 500, envioPaga: 'nosotros' })
    expect(conNosotros.envioACobrar).toBe(0)
    expect(conNosotros.total).toBe(900)
  })

  it('a devolver (diferencia negativa) no lleva descuento', () => {
    const t = calcularTotalCambio({ devueltos: [item(2000)], nuevos: [item(1000)], forma: 'transferencia' })
    expect(t.diferencia).toBe(-1000)
    expect(t.estado).toBe('a_devolver')
    expect(t.descuento).toBe(0)
    expect(t.total).toBe(-1000)
  })

  it('parejo = 0', () => {
    const t = calcularTotalCambio({ devueltos: [item(1500)], nuevos: [item(1500)], forma: 'transferencia' })
    expect(t.estado).toBe('parejo')
    expect(t.total).toBe(0)
  })

  it('respeta cantidades en la diferencia', () => {
    const { diferencia } = calcularDiferencia([item(500, 2)], [item(1000, 1)])
    expect(diferencia).toBe(0) // 1000 − (500×2)
  })
})
