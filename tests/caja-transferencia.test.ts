import { describe, expect, it } from 'vitest'
import { VENTANA_ANTES_MS, cruzarTransferencia, limpiarPagos } from '@/lib/pagos-recibidos/core.core.js'

/**
 * Caja F5: la transferencia que se confirma sola. Los pagos pasan por `limpiarPagos` con la forma
 * real de MP (horas en UTC-4, medido el 2-oct en la cuenta de Zattia): el cruce compara contra la
 * hora de la venta en UTC-3, y una hora mal convertida lo rompe callado.
 */

const CUENTA = 136578181
const mp = (id: number, monto: number, aprobado: string, extra: Record<string, unknown> = {}) => ({
  id, status: 'approved', collector_id: CUENTA, transaction_amount: monto,
  operation_type: 'money_transfer', payment_method_id: 'account_money', payment_type_id: 'account_money',
  date_created: aprobado, date_approved: aprobado, ...extra,
})
const limpios = (...crudos: unknown[]) => limpiarPagos(crudos, CUENTA).pagos

// La venta se confirmó a las 16:00 hora argentina.
const DESDE = '2026-10-04T19:00:00.000Z'

describe('cruzarTransferencia', () => {
  it('🔑 un pago del monto exacto, después de la venta y sin otra venta igual ⇒ llegó solo', () => {
    // 15:01 en UTC-4 = 16:01 en Argentina: es POSTERIOR.
    const r = cruzarTransferencia({ monto: 21700, desde: DESDE, pagos: limpios(mp(1, 21700, '2026-10-04T15:01:00.000-04:00')), reclamados: [], competidoras: 0 })
    expect(r).toMatchObject({ estado: 'llego', por: 'solo', pago: { id: '1', monto: 21700 } })
  })

  it('el monto es EXACTO: $21.699 o $21.800 ⛔ son el de $21.700', () => {
    const pagos = limpios(mp(1, 21699, '2026-10-04T15:01:00.000-04:00'), mp(2, 21800, '2026-10-04T15:02:00.000-04:00'), mp(3, 21700.01, '2026-10-04T15:03:00.000-04:00'))
    expect(cruzarTransferencia({ monto: 21700, desde: DESDE, pagos, reclamados: [], competidoras: 0 })).toEqual({ estado: 'esperando' })
  })

  it('🔴 sólo lo que ENTRÓ y está APROBADO: un pendiente o uno que sale ⛔ confirma', () => {
    const pagos = limpios(
      mp(1, 21700, '2026-10-04T15:01:00.000-04:00', { status: 'pending' }),
      mp(2, 21700, '2026-10-04T15:02:00.000-04:00', { collector_id: undefined, collector: { id: 555 } }),
    )
    expect(cruzarTransferencia({ monto: 21700, desde: DESDE, pagos, reclamados: [], competidoras: 0 })).toEqual({ estado: 'esperando' })
  })

  it('🔴 un pago que ya confirmó otra venta ⛔ confirma ésta', () => {
    const pagos = limpios(mp(1, 21700, '2026-10-04T15:01:00.000-04:00'))
    expect(cruzarTransferencia({ monto: 21700, desde: DESDE, pagos, reclamados: ['1'], competidoras: 0 })).toEqual({ estado: 'esperando' })
  })

  it('dos pagos del mismo monto después de la venta ⇒ elige la cajera, ⛔ el primero', () => {
    const pagos = limpios(mp(1, 21700, '2026-10-04T15:01:00.000-04:00'), mp(2, 21700, '2026-10-04T15:02:00.000-04:00'))
    const r = cruzarTransferencia({ monto: 21700, desde: DESDE, pagos, reclamados: [], competidoras: 0 })
    expect(r.estado).toBe('elegir')
    expect(r.estado === 'elegir' && r.candidatos.map((p) => p.id)).toEqual(['1', '2'])
  })

  it('🔑 otra venta esperando el mismo monto ⇒ elige la cajera aunque haya UN solo pago', () => {
    const pagos = limpios(mp(1, 21700, '2026-10-04T15:01:00.000-04:00'))
    const r = cruzarTransferencia({ monto: 21700, desde: DESDE, pagos, reclamados: [], competidoras: 1 })
    expect(r).toMatchObject({ estado: 'elegir', candidatos: [{ id: '1' }] })
  })

  it('un pago de unos minutos ANTES de confirmar ⛔ entra solo: se ofrece', () => {
    // 15:55 AR = 14:55 en UTC-4: 5 minutos antes.
    const pagos = limpios(mp(1, 21700, '2026-10-04T14:55:00.000-04:00'))
    const r = cruzarTransferencia({ monto: 21700, desde: DESDE, pagos, reclamados: [], competidoras: 0 })
    expect(r).toMatchObject({ estado: 'elegir', candidatos: [{ id: '1' }] })
    // ...y la cajera lo puede tomar.
    expect(cruzarTransferencia({ monto: 21700, desde: DESDE, pagos, reclamados: [], competidoras: 0, elegido: '1' })).toMatchObject({ estado: 'llego', por: 'cajera' })
  })

  it('más viejo que la ventana ⛔ se ofrece ni se puede elegir', () => {
    const viejo = new Date(Date.parse(DESDE) - VENTANA_ANTES_MS - 1000).toISOString()
    const pagos = [{ id: '1', monto: 21700, cuando: viejo, origen: 'mp' }]
    expect(cruzarTransferencia({ monto: 21700, desde: DESDE, pagos, reclamados: [], competidoras: 0 })).toEqual({ estado: 'esperando' })
    expect(cruzarTransferencia({ monto: 21700, desde: DESDE, pagos, reclamados: [], competidoras: 0, elegido: '1' }).estado).toBe('invalido')
  })

  it('🔴 la cajera ⛔ puede elegir un pago de otro monto ni uno ya tomado', () => {
    const pagos = limpios(mp(1, 21700, '2026-10-04T15:01:00.000-04:00'), mp(2, 9000, '2026-10-04T15:01:00.000-04:00'))
    expect(cruzarTransferencia({ monto: 21700, desde: DESDE, pagos, reclamados: [], competidoras: 0, elegido: '2' }).estado).toBe('invalido')
    expect(cruzarTransferencia({ monto: 21700, desde: DESDE, pagos, reclamados: ['1'], competidoras: 0, elegido: '1' }).estado).toBe('invalido')
  })

  it('sin monto o sin hora ⇒ error, ⛔ un cruce contra $0', () => {
    expect(() => cruzarTransferencia({ monto: 0, desde: DESDE, pagos: [], reclamados: [], competidoras: 0 })).toThrow()
    expect(() => cruzarTransferencia({ monto: 100, desde: 'x', pagos: [], reclamados: [], competidoras: 0 })).toThrow()
  })
})
