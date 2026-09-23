import { describe, expect, it } from 'vitest'
import {
  diasDesde,
  esPagoManual,
  estadoDeCobro,
  filasDeCobranzas,
  lineaDeNota,
  validarCobro,
  type Cobro,
  type OrdenCobro,
} from '@/lib/cobranzas/tipos'

/**
 * Cobranzas: el estado de cada orden sale de CRUZAR lo que dice Tienda Nube con el cobro del Monitor,
 * porque TN ⛔ deja marcar una orden pagada por API.
 *
 * Los mutantes que tienen que caer:
 *  1. `esPagoManual` mirando el MÉTODO (`bank_transfer`/`wire_transfer`) en vez del gateway ⇒ las
 *     transferencias de Pago Nube, que se concilian solas, aparecerían como pendientes.
 *  2. Una orden cancelada CON cobro devolviendo `null` ⇒ la plata de una compra que ya no existe se
 *     esconde en vez de ir a «Revisar».
 *  3. `pending` + cobro devolviendo `cerrado` ⇒ nadie aprieta el «pagado» en TN.
 *  4. `filasDeCobranzas` contando un cobro ANULADO como vigente ⇒ anular no devuelve la orden a
 *     pendientes.
 *  5. `validarCobro` aceptando monto 0 ⇒ una orden «cobrada» sin plata.
 *  6. `lineaDeNota` sin el id del cobro ⇒ el catálogo ⛔ puede reconocer el reintento y la escribe
 *     dos veces.
 */

function orden(p: Partial<OrdenCobro> = {}): OrdenCobro {
  return {
    id: 1001,
    number: 5001,
    cliente: 'Ana',
    total: '19900.00',
    fecha: '2026-09-20T15:00:00-03:00',
    pago_gateway: 'offline',
    pago_metodo: 'custom',
    estado_pago: 'pending',
    estado_orden: 'open',
    pagado_en: null,
    ...p,
  }
}

function cobro(p: Partial<Cobro> = {}): Cobro {
  return {
    id: 'co1_abc',
    store: 'zattia',
    order_id: '1001',
    numero: '5001',
    monto: 19900,
    medio: 'transferencia',
    operacion: null,
    quien: 'Bruno Arevalo',
    cuando: '2026-09-21T13:00:00.000Z',
    nota_tn: 'ok',
    anulado_en: null,
    anulado_por: null,
    ...p,
  }
}

describe('esPagoManual', () => {
  it('sólo el gateway offline es manual', () => {
    expect(esPagoManual(orden())).toBe(true)
    expect(esPagoManual(orden({ pago_gateway: 'offline', pago_metodo: 'bank_transfer' }))).toBe(true)
  })
  it('🔴 una transferencia de Pago Nube NO es manual (mutante 1)', () => {
    expect(esPagoManual(orden({ pago_gateway: 'pago-nube', pago_metodo: 'wire_transfer' }))).toBe(false)
    expect(esPagoManual(orden({ pago_gateway: 'mercado-pago', pago_metodo: 'credit_card' }))).toBe(false)
    expect(esPagoManual(null)).toBe(false)
  })
})

describe('estadoDeCobro — la tabla del plan', () => {
  it('pending sin cobro → pendiente', () => {
    expect(estadoDeCobro(orden(), null)).toBe('pendiente')
  })
  it('🔴 pending con cobro → falta marcar en TN (mutante 3)', () => {
    expect(estadoDeCobro(orden(), cobro())).toBe('falta-tn')
  })
  it('paid con cobro → cerrado', () => {
    expect(estadoDeCobro(orden({ estado_pago: 'paid' }), cobro())).toBe('cerrado')
  })
  it('paid sin cobro → cerrado igual (la marcaron directo en el admin)', () => {
    expect(estadoDeCobro(orden({ estado_pago: 'paid' }), null)).toBe('cerrado')
  })
  it('🔴 cancelada con cobro → revisar (mutante 2)', () => {
    expect(estadoDeCobro(orden({ estado_orden: 'cancelled' }), cobro())).toBe('revisar')
    expect(estadoDeCobro(orden({ estado_pago: 'voided' }), cobro())).toBe('revisar')
    expect(estadoDeCobro(orden({ estado_pago: 'refunded', estado_orden: 'closed' }), cobro())).toBe('revisar')
  })
  it('cancelada sin cobro → no va (13 de 236 órdenes de Zattia son así: carritos «a pagar» abandonados)', () => {
    expect(estadoDeCobro(orden({ estado_orden: 'cancelled' }), null)).toBeNull()
  })
  it('una orden cerrada que sigue pending es PENDIENTE (medido: 2 en Zattia)', () => {
    expect(estadoDeCobro(orden({ estado_orden: 'closed' }), null)).toBe('pendiente')
  })
  it('una orden no manual no va, tenga lo que tenga', () => {
    expect(estadoDeCobro(orden({ pago_gateway: 'pago-nube' }), null)).toBeNull()
    expect(estadoDeCobro(orden({ pago_gateway: 'pago-nube' }), cobro())).toBeNull()
  })
})

describe('filasDeCobranzas', () => {
  it('🔴 un cobro anulado no cuenta: la orden vuelve a pendientes (mutante 4)', () => {
    const { filas, cuenta } = filasDeCobranzas([orden()], [cobro({ anulado_en: '2026-09-22T10:00:00Z' })])
    expect(filas[0].estado).toBe('pendiente')
    expect(filas[0].cobro).toBeNull()
    expect(cuenta).toEqual({ pendiente: 1, 'falta-tn': 0, revisar: 0, cerrado: 0 })
  })
  it('anulado + cobro nuevo: gana el vigente', () => {
    const { filas } = filasDeCobranzas(
      [orden()],
      [cobro({ id: 'viejo', anulado_en: '2026-09-22T10:00:00Z' }), cobro({ id: 'nuevo', cuando: '2026-09-22T11:00:00Z' })],
    )
    expect(filas[0].cobro?.id).toBe('nuevo')
    expect(filas[0].estado).toBe('falta-tn')
  })
  it('cruza por id interno de la orden, ⛔ por número', () => {
    const { filas } = filasDeCobranzas([orden({ id: 2002, number: 1001 })], [cobro({ order_id: '1001' })])
    expect(filas[0].cobro).toBeNull()
  })
  it('marca sinCobro sólo en las cerradas sin cobro, y deja afuera lo que no va', () => {
    const { filas, cuenta } = filasDeCobranzas(
      [orden({ id: 1, estado_pago: 'paid' }), orden({ id: 2, pago_gateway: 'pago-nube' }), orden({ id: 3, estado_orden: 'cancelled' })],
      [],
    )
    expect(filas).toHaveLength(1)
    expect(filas[0].sinCobro).toBe(true)
    expect(cuenta.cerrado).toBe(1)
  })
  it('lo más viejo primero', () => {
    const { filas } = filasDeCobranzas(
      [orden({ id: 1, fecha: '2026-09-22T10:00:00Z' }), orden({ id: 2, fecha: '2026-09-18T10:00:00Z' })],
      [],
    )
    expect(filas.map((f) => f.orden.id)).toEqual([2, 1])
  })
})

describe('validarCobro', () => {
  const bien = { order_id: '1001', medio: 'transferencia' as const, monto: 19900 }
  it('acepta un cobro bien formado', () => {
    expect(validarCobro(bien)).toBeNull()
    expect(validarCobro({ ...bien, medio: 'efectivo', operacion: '123' })).toBeNull()
  })
  it('🔴 rechaza monto cero, negativo o basura (mutante 5)', () => {
    expect(validarCobro({ ...bien, monto: 0 })).not.toBeNull()
    expect(validarCobro({ ...bien, monto: -5 })).not.toBeNull()
    expect(validarCobro({ ...bien, monto: 'abc' as unknown as number })).not.toBeNull()
  })
  it('rechaza medio desconocido y orden sin id numérico', () => {
    expect(validarCobro({ ...bien, medio: 'cheque' as unknown as 'efectivo' })).not.toBeNull()
    expect(validarCobro({ ...bien, order_id: '#5001' })).not.toBeNull()
  })
})

describe('lineaDeNota', () => {
  it('🔴 lleva el id del cobro, quién, cómo y el día en hora argentina (mutante 6)', () => {
    // 01:30 UTC del 22 = 22:30 del 21 en Argentina.
    const l = lineaDeNota(cobro({ cuando: '2026-09-22T01:30:00Z', operacion: '777' }))
    expect(l).toContain('co1_abc')
    expect(l).toContain('21/09')
    expect(l).toContain('Bruno Arevalo')
    expect(l).toContain('transferencia')
    expect(l).toContain('op 777')
  })
  it('la de anulación también lleva el id, y es distinta de la de cobro', () => {
    const c = cobro({ anulado_en: '2026-09-23T15:00:00Z', anulado_por: 'Darío' })
    const l = lineaDeNota(c, { anulado: true })
    expect(l).toContain('co1_abc')
    expect(l).toContain('ANULADO')
    expect(l).not.toBe(lineaDeNota(c))
  })
})

describe('diasDesde', () => {
  it('cuenta días enteros y no da negativos', () => {
    const ahora = new Date('2026-09-23T12:00:00Z')
    expect(diasDesde('2026-09-20T11:00:00Z', ahora)).toBe(3)
    expect(diasDesde('2026-09-24T11:00:00Z', ahora)).toBe(0)
    expect(diasDesde(null, ahora)).toBeNull()
  })
})
