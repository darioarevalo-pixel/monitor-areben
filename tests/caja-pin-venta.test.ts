import { describe, expect, it } from 'vitest'
import { pidePinDeVenta, prendasQueFaltan } from '../lib/caja/pin-venta.core.js'
import { entradaDelMotorErp } from '../lib/caja/motor.core.js'

describe('el PIN de vender sin stock: a quién le toca', () => {
  it('Stunned y Zattia una vez cortadas; BDI todavía no (Bruno, 1-nov); lo que va a GN nunca', () => {
    expect(pidePinDeVenta('erp', 'stunned')).toBe(true)
    expect(pidePinDeVenta('erp', 'zattia')).toBe(true)
    expect(pidePinDeVenta('erp', 'bdi')).toBe(false)
    expect(pidePinDeVenta('gn', 'zattia')).toBe(false)
  })
})

describe('prendasQueFaltan', () => {
  const r = (product_id: number, cantidad: number) => ({ product_id, size_id: 1, cantidad, nombre: 'Remera', talle: 'M' })
  it('alcanza justo ⇒ nada; una menos ⇒ la prenda, con cuánto hay y cuánto pide', () => {
    expect(prendasQueFaltan([r(7, 2)], () => 2)).toEqual([])
    expect(prendasQueFaltan([r(7, 2)], () => 1)).toEqual([{ product_id: 7, size_id: 1, nombre: 'Remera', talle: 'M', hay: 1, pide: 2 }])
  })
  it('dos renglones de la misma prenda suman: hay 1 y se llevan 2 ⇒ falta', () => {
    expect(prendasQueFaltan([r(7, 1), r(7, 1)], () => 1)).toHaveLength(1)
  })
  it('un libro en negativo cuenta como que falta', () => {
    expect(prendasQueFaltan([r(7, 1)], () => -3)[0].hay).toBe(-3)
  })
})

describe('entradaDelMotorErp lleva el PIN que verificó el servidor', () => {
  const venta = { id: 'x', store: 'zattia', renglones: [], pagos: [], subtotal: 0, total: 0 }
  it('con `payload.autoriza` lo pasa; sin él, ⛔ agrega nada', () => {
    const autoriza = { usuario: 'encargada', motivo: 'pin_encargada' }
    expect(entradaDelMotorErp({ ...venta, payload: { autoriza } }, { marca: 'stunned' }).autoriza).toEqual(autoriza)
    expect(entradaDelMotorErp(venta, { marca: 'stunned' })).not.toHaveProperty('autoriza')
  })
})
