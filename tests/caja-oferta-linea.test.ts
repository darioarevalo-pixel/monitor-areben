import { describe, expect, it } from 'vitest'
import { REGLAS_INICIALES, baseParaMonto, cobro, cuentaDeMedio, normalizarPctCampanias, pagosDeMedio, pctDePrenda, renglones, subtotal } from '@/lib/caja/core.core.js'
import { cobroDelCambio } from '@/lib/erp/venta.core.js'

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

/**
 * El % por campaña (Bruno, 1-nov-2026, Cyber Monday de Zattia): los 253 de CYBER MONDAY pagan 10/10, la línea el 15/10
 * de las cuentas, los dos al precio de tienda. Oráculo, a mano: $20.000 −10 % = $18.000; −15 % = $17.000; mixta en
 * efectivo $40.000 −12,5 % = $35.000 (18.000 + 17.000), UN pago a la cuenta normal.
 */
describe('caja · el % por campaña lo decide el servidor, por el producto', () => {
  type R_ = Parameters<typeof cuentaDeMedio>[1]['reglas']
  const CYBER = 711918
  const R = { ...REGLAS_INICIALES, transferenciaA: 13015, pctDePrendas: { [CYBER]: { nombre: 'Cyber', efectivo: 10, transferencia: 10 } } } as unknown as R_
  const no = { promoCreditoHoy: false, esDelBanco: false, seisCuotas: false }
  const cyber = { product_id: CYBER, size_id: 1, cantidad: 1, precio: 20000 }
  const linea = { product_id: 2, size_id: 1, cantidad: 1, precio: 20000 }
  const pagar = (medio: 'efectivo' | 'transferencia' | 'debito' | 'credito', items: Parameters<typeof renglones>[0], reglas: R_ = R, q = no) => {
    const filas = renglones(items)
    const pagos = pagosDeMedio(medio, { filas, reglas, total: subtotal(filas), ...q })
    return cobro({ filas, pagos, reglas, descuentoVenta: null })
  }

  it('🔑 Cyber en efectivo ⇒ −10 %, ⛔ −15 %, a la cuenta NORMAL de efectivo', () => {
    const c = pagar('efectivo', [cyber])
    expect(c.total).toBe(18000)
    expect(c.pagos).toHaveLength(1)
    expect(c.pagos[0].cuenta).toBe(12921)
    expect(c.pagos[0].porcentaje).toBe(10)
  })
  it('Cyber en transferencia ⇒ −10 %', () => expect(pagar('transferencia', [cyber]).total).toBe(18000))
  it('la línea ⛔ cambia: −15 % en efectivo, −10 % en transferencia', () => {
    expect(pagar('efectivo', [linea]).total).toBe(17000)
    expect(pagar('transferencia', [linea]).total).toBe(18000)
  })
  it('🔑 venta mixta en efectivo ⇒ el % PESADO, UN pago: $40.000 ⇒ $35.000', () => {
    const c = pagar('efectivo', [cyber, linea])
    expect(c.total).toBe(35000)
    expect(c.pagos).toHaveLength(1)
    expect(c.pagos[0].cuenta).toBe(12921)
    expect(c.pagos[0].porcentaje).toBe(12.5)
  })
  it('el peso va por IMPORTE: 2 Cyber + 1 línea ⇒ $36.000 + $17.000 = $53.000', () => {
    expect(pagar('efectivo', [{ ...cyber, cantidad: 2 }, linea]).total).toBe(53000)
  })
  it('🔴 la pantalla ⛔ decide: mandar `oferta` en una prenda Cyber o en una de línea ⛔ mueve el %', () => {
    expect(pagar('efectivo', [{ ...cyber, linea: 'stunned', oferta: true }]).total).toBe(18000)
    expect(pagar('efectivo', [{ ...linea, linea: 'stunned', oferta: true }]).total).toBe(17000)
  })
  it('redondea a 100 como siempre: $18.990 −10 % = $17.091 ⇒ $17.100', () => {
    expect(pagar('efectivo', [{ ...cyber, precio: 18990 }]).total).toBe(17100)
  })
  it('débito y crédito siguen con su cuenta', () => {
    expect(pagar('debito', [cyber]).total).toBe(18000)
    expect(pagar('credito', [cyber]).total).toBe(20000)
  })
  it('sin la lista, la misma prenda paga su cuenta (BDI y cualquier otra caja, ⛔ cambian)', () => {
    const { pctDePrendas: _p, ...sin } = R as unknown as Record<string, unknown>
    expect(pagar('efectivo', [cyber], sin as unknown as R_).total).toBe(17000)
  })
  it('«varios pagos»: la vuelta del monto usa el mismo % pesado', () => {
    const filas = renglones([cyber, linea])
    expect(baseParaMonto({ filas, reglas: R, descuentoVenta: null, cuenta: 12921, monto: 35000 })).toBe(40000)
  })
  it('la promo o el descuento a la venta van ANTES del %: $20.000 − $2.000 = $18.000, −10 % = $16.200', () => {
    const filas = renglones([cyber])
    const c = cobro({ filas, pagos: [{ cuenta: 12921 }], reglas: R, descuentoVenta: { tipo: 'pesos', valor: 2000 } })
    expect(c.total).toBe(16200)
  })
  it('🔴 el cambio con una prenda Cyber entre lo nuevo ⛔ se cobra acá: pagaría el % de la cuenta', () => {
    expect(() => cobroDelCambio({ diferencia: 5000, pagos: [{ cuenta: 12921 }], reglas: R, nuevas: [{ product_id: CYBER }] })).toThrow(/Gestión Nube/)
    expect(cobroDelCambio({ diferencia: 5000, pagos: [{ cuenta: 12921 }], reglas: R, nuevas: [{ product_id: 2 }] }).total).toBe(4300)
  })
  it('pctDePrenda: null fuera de la lista y en un medio sin % propio', () => {
    expect(pctDePrenda(R, 'efectivo', CYBER)).toBe(10)
    expect(pctDePrenda(R, 'debito', CYBER)).toBeNull()
    expect(pctDePrenda(R, 'efectivo', 2)).toBeNull()
    expect(pctDePrenda(null, 'efectivo', CYBER)).toBeNull()
  })
  it('la lista que se carga: ⛔ sin nombre, ⛔ repetida, ⛔ un % sin cargar', () => {
    const ok = { campania: 'a', nombre: 'Cyber', efectivo: 10, transferencia: 10 }
    expect(normalizarPctCampanias([ok])).toEqual([ok])
    expect(normalizarPctCampanias([])).toEqual([])
    expect(() => normalizarPctCampanias([ok, ok])).toThrow()
    expect(() => normalizarPctCampanias([{ ...ok, nombre: ' ' }])).toThrow()
    expect(() => normalizarPctCampanias([{ campania: 'a', nombre: 'x', efectivo: 10 }])).toThrow()
    expect(() => normalizarPctCampanias([{ ...ok, efectivo: 101 }])).toThrow()
    expect(() => normalizarPctCampanias('a')).toThrow()
  })
})
