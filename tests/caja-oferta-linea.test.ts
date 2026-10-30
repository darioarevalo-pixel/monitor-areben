import { describe, expect, it } from 'vitest'
import { REGLAS_INICIALES, baseParaMonto, cobro, cuentaDeMedio, pagosDeMedio, renglones, subtotal } from '@/lib/caja/core.core.js'

/**
 * La oferta de Stunned en el local (Bruno, 26-oct-2026: «10 % efectivo y transferencia en feria»). La STND
 * SALE está a ~1,07× el costo y el efectivo le sacaba el 15 %: quedaba abajo del costo.
 * Oráculo, a mano: OFICIAL $12.990 en efectivo ⇒ −10 % = $11.691 ⇒ redondeo a 100 = $11.700 (con el
 * 15 % eran $11.041,50 ⇒ $11.000). Una prenda de Zattia de $20.000 sigue con su −15 % = $17.000.
 */
describe('caja · la oferta de Stunned paga 10 % en efectivo y transferencia', () => {
  type R_ = Parameters<typeof cuentaDeMedio>[1]['reglas']
  const R = REGLAS_INICIALES as unknown as R_
  const no = { promoCreditoHoy: false, esDelBanco: false, seisCuotas: false }
  const oficial = { product_id: 913515, size_id: 1, cantidad: 1, precio: 12990, linea: 'stunned', oferta: true }
  const vestido = { product_id: 2, size_id: 1, cantidad: 1, precio: 20000 }
  const total = (medio: 'efectivo' | 'transferencia' | 'debito', items: Parameters<typeof renglones>[0], reglas: R_ = R) => {
    const filas = renglones(items)
    const pagos = pagosDeMedio(medio, { filas, reglas, total: subtotal(filas), ...no })
    return cobro({ filas, pagos, reglas, descuentoVenta: null })
  }

  it('🔑 Stunned en oferta en efectivo ⇒ −10 %, ⛔ −15 %: $12.990 ⇒ $11.700', () => {
    expect(total('efectivo', [oficial]).total).toBe(11700)
  })

  it('en transferencia también −10 % ⇒ $11.700', () => {
    expect(total('transferencia', [oficial]).total).toBe(11700)
  })

  it('🔑 el DROP 2 en oferta (Cyber, 30-oct) ⛔ va al 10/10: STARRY $27.990 efectivo −15 % ⇒ $23.791,50 ⇒ $23.800', () => {
    const starry = { product_id: 1097604, size_id: 1, cantidad: 1, precio: 27990, linea: 'stunned', oferta: true }
    expect(total('efectivo', [starry]).total).toBe(23800)
  })

  it('el drop 2 en oferta en transferencia, el 10 % de la cuenta: $27.990 ⇒ $25.191 ⇒ $25.200', () => {
    const starry = { product_id: 1097604, size_id: 1, cantidad: 1, precio: 27990, linea: 'stunned', oferta: true }
    expect(total('transferencia', [starry]).total).toBe(25200)
  })

  it('mixto drop 1 + drop 2 en efectivo: $11.691 + $23.791,50 = $35.482,50 ⇒ $35.500', () => {
    const starry = { product_id: 1097604, size_id: 1, cantidad: 1, precio: 27990, linea: 'stunned', oferta: true }
    expect(total('efectivo', [oficial, starry]).total).toBe(35500)
  })

  it('Stunned SIN oferta sigue con el 15 % del efectivo: $37.990 ⇒ $32.300', () => {
    expect(total('efectivo', [{ product_id: 11, size_id: 1, cantidad: 1, precio: 37990, linea: 'stunned' }]).total).toBe(32300)
  })

  it('mixto: cada prenda con su % ⇒ $11.691 + $17.000 = $28.691 ⇒ $28.700', () => {
    expect(total('efectivo', [oficial, vestido]).total).toBe(28700)
  })

  it('débito ⛔ cambia: lo de su cuenta', () => {
    const sin = total('debito', [{ ...oficial, oferta: undefined }]).total
    expect(total('debito', [oficial]).total).toBe(sin)
  })

  it('con la feria de Zattia en el carrito: la feria a su cuenta a precio final, la oferta de Stunned al 10 %', () => {
    const conFeria = { ...R, feriaProductos: [{ id: 2, nombre: 'TOP FERIA' }] } as R_
    const c = total('efectivo', [oficial, { ...vestido, precio: 10000 }], conFeria)
    expect(c.pagos.map((p) => p.monto)).toEqual([10000, 11700])
  })

  it('🔴 la oferta sin línea ⛔ significa nada: una prenda de Zattia marcada igual paga el 15 %', () => {
    const filas = renglones([{ ...vestido, oferta: true }])
    expect(filas[0]).not.toHaveProperty('oferta')
    expect(total('efectivo', [{ ...vestido, oferta: true }]).total).toBe(17000)
  })

  it('«Varios pagos»: el monto que se escribe da la base con el MISMO %', () => {
    const filas = renglones([oficial, vestido])
    const efectivo = (R as unknown as { medios: { efectivo: { normal: number } } }).medios.efectivo.normal
    const base = baseParaMonto({ filas, reglas: R, descuentoVenta: null, cuenta: efectivo, monto: 9000 })
    const c = cobro({ filas, pagos: [{ cuenta: efectivo, base: base as number }, { cuenta: efectivo }], reglas: R, descuentoVenta: null })
    expect(c.pagos[0].monto).toBe(9000)
  })
})
