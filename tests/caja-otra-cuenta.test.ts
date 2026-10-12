import { describe, expect, it } from 'vitest'
import { REGLAS_INICIALES } from '@/lib/caja/core.core.js'
import { aOtraCuenta, mailOtraCuenta, titularDe, titularesDe } from '@/lib/caja/otra-cuenta.core.js'

/** La transferencia que fue a OTRA cuenta nuestra (Bruno, 12-oct). */
describe('aOtraCuenta', () => {
  const pagos = [{ cuenta: 25868, monto: 5000 }, { cuenta: 13015, monto: 9000 }]
  const payload = { items: [], payments: [{ account_id: 25868, amount: 5000 }, { account_id: 13015, amount: 9000 }] }
  it('🔑 Darío o Bruno ⇒ Transferencia CG; la parte de oferta (25868) ⛔ cambia', () => {
    const r = aOtraCuenta({ pagos, payload, titular: titularDe('bruno', REGLAS_INICIALES)!, reglas: REGLAS_INICIALES })
    expect(r.pagos.map((p) => p.cuenta)).toEqual([25868, 20595])
    expect(r.payload.payments.map((p) => [p.account_id, p.amount])).toEqual([[25868, 5000], [20595, 9000]])
  })
  it('Areben Comercial ⇒ Transferencia (13015): queda igual', () => {
    const r = aOtraCuenta({ pagos, payload, titular: titularDe('areben', REGLAS_INICIALES)!, reglas: REGLAS_INICIALES })
    expect(r.payload.payments.map((p) => p.account_id)).toEqual([25868, 13015])
  })
  it('🔴 si las dos cuentas tienen descuentos distintos ⇒ tira (el monto cambiaría)', () => {
    const reglas = { ...REGLAS_INICIALES, cuentas: { ...REGLAS_INICIALES.cuentas, 20595: { nombre: 'CG', descuento: 5 } } }
    expect(() => aOtraCuenta({ pagos, payload, titular: titularDe('dario', REGLAS_INICIALES)!, reglas })).toThrow(/descuentos distintos/)
  })
  it('sin el pedido a GN armado ⇒ tira', () => {
    expect(() => aOtraCuenta({ pagos, payload: { payments: [] }, titular: titularesDe(REGLAS_INICIALES)[0], reglas: REGLAS_INICIALES })).toThrow(/pedido/)
  })
})

describe('titularDe (V4: la cuenta es de la tienda)', () => {
  it('🔑 cada tienda pone la cuenta de cada titular: BDI es otra empresa en GN', () => {
    const bdi = { titulares: { areben: 14701, dario: 20597, bruno: 20597 } }
    expect(titularDe('dario', bdi)!.cuenta).toBe(20597)
    expect(titularDe('areben', REGLAS_INICIALES)!.cuenta).toBe(13015)
  })
  it('un titular sin cuenta en la tienda ⛔ se ofrece; uno desconocido es null', () => {
    expect(titularesDe({ titulares: { dario: 20597 } }).map((t) => t.id)).toEqual(['dario'])
    expect(titularDe('pepe', REGLAS_INICIALES)).toBeNull()
    expect(titularDe('areben', null)).toBeNull()
  })
})

describe('mailOtraCuenta', () => {
  it('dice titular, banco, venta, quién y las prendas, y escapa el html', () => {
    const m = mailOtraCuenta({
      venta: { id: 'abcd1234-0000', total: 14000, gn_number: 30100, creada_en: '2026-10-12T19:00:00.000Z', renglones: [{ nombre: 'TOP <b>', talle: 'M', cantidad: 1 }] },
      titular: titularDe('dario', REGLAS_INICIALES)!, banco: 'Galicia', por: 'cajera',
    })
    expect(m.asunto).toMatch(/\$14\.000 a la cuenta de Darío Arévalo/)
    expect(m.texto).toMatch(/Banco: Galicia/)
    expect(m.texto).toMatch(/#30100/)
    expect(m.texto).toMatch(/1 × TOP <b> \(M\)/)
    expect(m.html).toContain('TOP &lt;b&gt;')
  })
})
