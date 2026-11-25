import { describe, expect, it } from 'vitest'
import { REGLAS_INICIALES, cobro, renglones } from '@/lib/caja/core.core.js'
import { cobroConPublicidad, conSaldo, cubreTodo, descuentoDePublicidad, limpiarPublicidad, resumenDePublicidad } from '@/lib/caja/publicidad.core.js'
import { entradaDelMotor, entradaDelMotorErp } from '@/lib/caja/motor.core.js'

/**
 * «Publicidad» en el POS (Bruno, 25-nov): la persona y lo que tiene a favor, descontado del total. Si se lleva más, se cobra la
 * diferencia como en una venta; si se lleva menos, lo que sobra le queda a favor.
 */

const filas = renglones([{ product_id: 7, size_id: 8, cantidad: 1, precio: 24000 }, { product_id: 9, size_id: 1, cantidad: 1, precio: 18000 }])
const EFECTIVO = 12921

describe('lo que manda la pantalla', () => {
  it('limpia la persona y exige persona y monto', () => {
    expect(limpiarPublicidad({ persona: '  @mica   fotos ', aFavor: '30000' })).toEqual({ persona: '@mica fotos', aFavor: 30000 })
    expect(limpiarPublicidad(null)).toBeNull()
    expect(() => limpiarPublicidad({ persona: 'a', aFavor: 100 })).toThrow(/persona/)
    expect(() => limpiarPublicidad({ persona: 'Mica', aFavor: 0 })).toThrow(/a favor/)
    expect(() => limpiarPublicidad({ persona: 'x'.repeat(81), aFavor: 100 })).toThrow(/80/)
  })
})

describe('el cobro', () => {
  it('🔑 se lleva MÁS: lo a favor es el descuento a la venta y la diferencia paga como venta (con el % de la forma de pago)', () => {
    const p = { persona: 'Mica', aFavor: 30000 }
    const c = cobroConPublicidad({ filas, pagos: [{ cuenta: EFECTIVO }], reglas: REGLAS_INICIALES, publicidad: p })
    const igual = cobro({ filas, pagos: [{ cuenta: EFECTIVO }], reglas: REGLAS_INICIALES, descuentoVenta: { tipo: 'pesos', valor: 30000 } })
    expect(c).toEqual(igual)
    expect(c.aVenta).toBe(30000)
    expect(c.total).toBeLessThanOrEqual(12000)
    expect(resumenDePublicidad(p, c.aVenta)).toEqual({ persona: 'Mica', a_favor: 30000, usado: 30000, sobra: 0 })
  })

  it('🔑 se lleva MENOS: total $0, SIN forma de pago, y lo que sobra le queda a favor', () => {
    const p = { persona: 'Mica', aFavor: 50000 }
    expect(cubreTodo(p, filas)).toBe(true)
    const c = cobroConPublicidad({ filas, pagos: [], reglas: REGLAS_INICIALES, publicidad: p })
    expect(c).toMatchObject({ subtotal: 42000, aVenta: 42000, pagos: [], total: 0 })
    expect(resumenDePublicidad(p, c.aVenta)).toEqual({ persona: 'Mica', a_favor: 50000, usado: 42000, sobra: 8000 })
  })

  it('🔴 con todo a favor ⛔ se cobra con una forma de pago', () => {
    expect(() => cobroConPublicidad({ filas, pagos: [{ cuenta: EFECTIVO }], reglas: REGLAS_INICIALES, publicidad: { persona: 'Mica', aFavor: 42000 } })).toThrow(/no se cobra/)
  })

  it('el descuento se corta en el subtotal', () => {
    expect(descuentoDePublicidad({ aFavor: 90000 }, 42000)).toEqual({ tipo: 'pesos', valor: 42000 })
  })
})

describe('lo que queda', () => {
  const pub = { persona: 'Mica', a_favor: 50000, usado: 42000, sobra: 8000 }
  it('🔑 al ERP va en `detalle.publicidad` (el descuento con nombre)', () => {
    const fila = { id: 'v1', store: 'zattia', usuario: 'Sofi', creada_en: '2026-11-25T15:00:00Z', renglones: [], pagos: [], subtotal: 42000, total: 0, a_mano: { venta: 0, prendas: 0, precios: 0, publicidad: pub } }
    expect(entradaDelMotor(fila).detalle).toMatchObject({ publicidad: pub })
    expect(entradaDelMotorErp(fila, { marca: 'zattia', reglas: null }).detalle).toMatchObject({ publicidad: pub })
    expect(entradaDelMotor({ ...fila, a_mano: { venta: 0, prendas: 0, precios: 0 } }).detalle).not.toHaveProperty('publicidad')
  })

  it('«Publicidad con saldo»: sólo a las que les sobró, ⛔ anuladas ni descartadas, la más nueva primero', () => {
    const v = (id: string, sobra: number, extra = {}) => ({ id, estado: 'en_erp', creada_en: `2026-11-${id}T12:00:00Z`, a_mano: { publicidad: { ...pub, sobra } }, ...extra })
    const r = conSaldo([v('10', 500), v('12', 0), v('14', 300), v('15', 900, { anulada: true }), v('16', 100, { estado: 'descartada' }), { id: 'x', a_mano: null }])
    expect(r.map((x) => x.id)).toEqual(['14', '10'])
  })
})
