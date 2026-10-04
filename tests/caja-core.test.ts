import { describe, expect, it } from 'vitest'
import {
  MODO_LOCAL_ZATTIA,
  REGLAS_INICIALES,
  aplicarCuenta,
  armarVentaGN,
  cobro,
  redondeo,
  renglones,
  subtotal,
  vuelto,
} from '@/lib/caja/core.core.js'

/**
 * Caja: el núcleo del cobro.
 *
 * 🔑 El oráculo NO es la regla escrita: son ventas REALES de Zattia Mi Local cobradas en el POS de
 * GN el 3-oct-2026 (`GET /ventas/{id}`), más el caso que se copió de su pantalla de cobro. Cada
 * caso trae lo que GN guardó: total, `discount` a nivel venta, y el pago con su cuenta.
 */

const EFECTIVO = 12921
const TRANSFERENCIA = 13015
const DEBITO = 20196
const CREDITO_10 = 25172
const FERIA_EFECTIVO = 25867
const FERIA_TC = 25869

const prenda = (precio: number, cantidad = 1, descuento?: number) => ({
  product_id: 1, size_id: 1, cantidad, precio, descuento,
})

const ORACULO = [
  // La pantalla de cobro del POS de GN: descuento $748,50, redondeo −$41,50.
  { caso: 'pantalla de GN · $4.990 efectivo', items: [prenda(4990)], cuenta: EFECTIVO,
    descuentoCuenta: 748.5, redondeo: -41.5, total: 4200, discount: 790 },
  // #30021: el redondeo SUBE ($21.666,50 ⇒ $21.700).
  { caso: '#30021 · efectivo', items: [prenda(25490)], cuenta: EFECTIVO,
    descuentoCuenta: 3823.5, redondeo: 33.5, total: 21700, discount: 3790 },
  { caso: '#30028 · transferencia, 2 renglones', items: [prenda(15490), prenda(15490)], cuenta: TRANSFERENCIA,
    descuentoCuenta: 3098, redondeo: 18, total: 27900, discount: 3080 },
  { caso: '#30038 · crédito 10% OFF, cantidad 2', items: [prenda(36990), prenda(19990, 2), prenda(15490)], cuenta: CREDITO_10,
    descuentoCuenta: 9246, redondeo: -14, total: 83200, discount: 9260 },
  // #30031: cuenta de feria (0 %) con rebaja POR PRENDA del 15 % ⇒ el discount de la venta queda negativo.
  { caso: '#30031 · feria efectivo, 15 % en la prenda', items: [prenda(55990, 1, 15)], cuenta: FERIA_EFECTIVO,
    descuentoCuenta: 0, redondeo: 8.5, total: 47600, discount: -8.5 },
]

describe('caja · contra ventas reales del POS de GN', () => {
  for (const o of ORACULO) {
    it(o.caso, () => {
      const filas = renglones(o.items)
      const c = cobro({ filas, pagos: [{ cuenta: o.cuenta }], reglas: REGLAS_INICIALES })
      expect(c.pagos[0].descuento).toBe(o.descuentoCuenta)
      expect(c.pagos[0].redondeo).toBe(o.redondeo)
      expect(c.total).toBe(o.total)
      expect(c.descuentoVenta).toBe(o.discount)

      const p = armarVentaGN({ filas, pagos: c.pagos, modoLocal: MODO_LOCAL_ZATTIA, integrationId: 'x', fecha: '2026-10-03' })
      expect(p.discount_amount).toBe(o.discount)
      expect(p.payments).toEqual([{ amount: o.total, account_id: o.cuenta, date_payment: '2026-10-03', description: '' }])
      // Lo que GN calcula del lado suyo: Σ renglones (con su %) − discount = lo cobrado ⇒ saldo 0.
      const gn = p.items.reduce((s, it) => s + it.quantity * it.unit_price * (1 - it.discount / 100), 0)
      expect(gn - p.discount_amount).toBeCloseTo(o.total, 6)
    })
  }
})

describe('caja · piezas', () => {
  it('renglones: importe con la rebaja por prenda; subtotal suma', () => {
    const f = renglones([prenda(19990, 2), prenda(55990, 1, 15)])
    expect(f.map(r => r.importe)).toEqual([39980, 47591.5])
    expect(subtotal(f)).toBe(87571.5)
  })

  it('renglones rechaza lo que no se cobra', () => {
    expect(() => renglones([])).toThrow()
    expect(() => renglones([prenda(100, 0)])).toThrow(/cantidad/)
    expect(() => renglones([prenda(100, -1)])).toThrow(/cantidad/)
    expect(() => renglones([prenda(100, 1.5)])).toThrow(/cantidad/)
    expect(() => renglones([{ ...prenda(100), size_id: 0 }])).toThrow(/talle/)
    expect(() => renglones([prenda(100, 1, 120)])).toThrow(/descuento/)
  })

  it('aplicarCuenta: el % sale de las reglas, ⛔ de un default', () => {
    expect(aplicarCuenta(10000, DEBITO, REGLAS_INICIALES)).toEqual({ porcentaje: 10, ajuste: 1000, neto: 9000 })
    expect(aplicarCuenta(10000, FERIA_TC, REGLAS_INICIALES)).toEqual({ porcentaje: -10, ajuste: -1000, neto: 11000 })
    const otras = { redondeo: 100, cuentas: { [EFECTIVO]: { nombre: 'Efectivo', descuento: 20 } } }
    expect(aplicarCuenta(10000, EFECTIVO, otras).neto).toBe(8000)
    // @ts-expect-error — sin reglas no hay cobro
    expect(() => aplicarCuenta(10000, EFECTIVO)).toThrow(/reglas/)
    expect(() => aplicarCuenta(10000, 13014, REGLAS_INICIALES)).toThrow(/no tiene regla/)
  })

  it('redondeo: al más cercano, el paso es obligatorio', () => {
    expect(redondeo(4241.5, 100)).toEqual({ total: 4200, ajuste: -41.5 })
    expect(redondeo(47591.5, 100)).toEqual({ total: 47600, ajuste: 8.5 })
    expect(redondeo(4241.5, 10).total).toBe(4240)
    // @ts-expect-error — sin paso
    expect(() => redondeo(4241.5)).toThrow(/paso/)
  })

  it('vuelto', () => {
    expect(vuelto(5000, 4200)).toEqual({ vuelto: 800, falta: 0 })
    expect(vuelto(4200, 4200)).toEqual({ vuelto: 0, falta: 0 })
    expect(vuelto(4000, 4200)).toEqual({ vuelto: 0, falta: 200 })
  })
})

describe('caja · varios pagos', () => {
  it('cada pago se descuenta con SU cuenta y se redondea solo', () => {
    // $30.000 de lista: $10.000 en efectivo (−15 %) y el resto con débito (−10 %).
    const filas = renglones([prenda(30000)])
    const c = cobro({ filas, pagos: [{ cuenta: EFECTIVO, base: 10000 }, { cuenta: DEBITO }], reglas: REGLAS_INICIALES })
    expect(c.pagos.map(p => [p.base, p.monto])).toEqual([[10000, 8500], [20000, 18000]])
    expect(c.total).toBe(26500)
    expect(c.descuentoVenta).toBe(3500)
    const p = armarVentaGN({ filas, pagos: c.pagos, modoLocal: MODO_LOCAL_ZATTIA, integrationId: 'x', fecha: '2026-10-03' })
    expect(p.payments.map(x => [x.account_id, x.amount])).toEqual([[EFECTIVO, 8500], [DEBITO, 18000]])
    expect(p.discount_amount).toBe(3500)
  })

  it('las bases tienen que cerrar con el subtotal', () => {
    const filas = renglones([prenda(10000)])
    expect(() => cobro({ filas, pagos: [{ cuenta: EFECTIVO, base: 10000 }, { cuenta: DEBITO }], reglas: REGLAS_INICIALES })).toThrow(/más que el subtotal/)
    expect(() => cobro({ filas, pagos: [{ cuenta: EFECTIVO, base: 4000 }, { cuenta: DEBITO, base: 6000 }], reglas: REGLAS_INICIALES })).toThrow(/sin base/)
    expect(() => cobro({ filas, pagos: [{ cuenta: EFECTIVO }, { cuenta: DEBITO }], reglas: REGLAS_INICIALES })).toThrow(/base/)
    expect(() => cobro({ filas, pagos: [], reglas: REGLAS_INICIALES })).toThrow(/pagos/)
  })

  it('el pago es lo COBRADO, ⛔ lo que entregó la clienta (el vuelto ⛔ viaja a GN)', () => {
    const filas = renglones([prenda(4990)])
    const c = cobro({ filas, pagos: [{ cuenta: EFECTIVO }], reglas: REGLAS_INICIALES })
    expect(vuelto(5000, c.total).vuelto).toBe(800)
    const p = armarVentaGN({ filas, pagos: c.pagos, modoLocal: MODO_LOCAL_ZATTIA, integrationId: 'x', fecha: '2026-10-03' })
    expect(p.payments[0].amount).toBe(4200)
  })
})

describe('caja · payload de GN', () => {
  const filas = renglones([{ product_id: 1106847, size_id: 229042, cantidad: 1, precio: 25490 }])
  const { pagos } = cobro({ filas, pagos: [{ cuenta: EFECTIVO }], reglas: REGLAS_INICIALES })

  it('modo Local de Zattia, deduplicable, con el renglón completo', () => {
    const p = armarVentaGN({ filas, pagos, modoLocal: MODO_LOCAL_ZATTIA, integrationId: 'caja-abc', fecha: '2026-10-03' })
    expect(p).toMatchObject({
      client_id: 137131, channel_id: 3, sale_type_id: 1, sale_state_id: 6, currency_id: 1,
      price_list_id: 4163, store_id: 11780, date_sale: '2026-10-03', discount_inventory: true,
      integration_source: 'monitor-caja', integration_id: 'caja-abc',
    })
    expect(p.items).toEqual([{ product_id: 1106847, size_id: 229042, quantity: 1, unit_price: 25490, discount: 0, store_id: 11780 }])
  })

  it('sin integration_id, fecha o modo Local ⛔ arma', () => {
    const base = { filas, pagos, modoLocal: MODO_LOCAL_ZATTIA, integrationId: 'x', fecha: '2026-10-03' }
    expect(() => armarVentaGN({ ...base, integrationId: '' })).toThrow(/integration_id/)
    expect(() => armarVentaGN({ ...base, fecha: '3/10/2026' })).toThrow(/Fecha/)
    // @ts-expect-error — sin modo Local
    expect(() => armarVentaGN({ ...base, modoLocal: undefined })).toThrow(/modo Local/)
    expect(() => armarVentaGN({ ...base, pagos: [{ ...pagos[0], monto: 0 }] })).toThrow(/Pago 1/)
  })
})
