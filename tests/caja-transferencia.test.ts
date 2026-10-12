import { describe, expect, it } from 'vitest'
import { TOLERANCIA_TRANSFERENCIA, VENTANA_ANTES_MS, VENTANA_SOLA_MS, cruzarTransferencia, limpiarPagos, pagosRecientes, sumarCobros } from '@/lib/pagos-recibidos/core.core.js'

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
    const r = cruzarTransferencia({ monto: 21700, desde: DESDE, pagos: limpios(mp(1, 21700, '2026-10-04T15:01:00.000-04:00')), reclamados: [], competidoras: 0, antesManual: VENTANA_ANTES_MS })
    expect(r).toMatchObject({ estado: 'llego', por: 'solo', pago: { id: '1', monto: 21700 } })
  })

  it('🔑 tolerancia de $100 (Bruno, 12-oct: el redondeo): $21.600 y $21.800 entran, $21.599 ⛔', () => {
    const t = (monto: number) => cruzarTransferencia({ monto: 21700, desde: DESDE, pagos: limpios(mp(1, monto, '2026-10-04T15:01:00.000-04:00')), reclamados: [], competidoras: 0, antesManual: VENTANA_ANTES_MS })
    expect(t(21600)).toMatchObject({ estado: 'llego', por: 'solo', pago: { id: '1', diferencia: -100 } })
    expect(t(21800)).toMatchObject({ estado: 'llego', pago: { diferencia: 100 } })
    expect(t(21599)).toEqual({ estado: 'esperando' })
    expect(t(21800.01)).toEqual({ estado: 'esperando' })
    expect(TOLERANCIA_TRANSFERENCIA).toBe(100)
  })

  it('🔴 si llegó uno EXACTO, el que sólo cae en la tolerancia ⛔ es duda: el exacto confirma solo', () => {
    const pagos = limpios(mp(1, 21650, '2026-10-04T15:01:00.000-04:00'), mp(2, 21700, '2026-10-04T15:02:00.000-04:00'))
    expect(cruzarTransferencia({ monto: 21700, desde: DESDE, pagos, reclamados: [], competidoras: 0, antesManual: VENTANA_ANTES_MS })).toMatchObject({ estado: 'llego', por: 'solo', pago: { id: '2', diferencia: 0 } })
  })

  it('dos dentro de la tolerancia y ninguno exacto ⇒ elige la cajera', () => {
    const pagos = limpios(mp(1, 21650, '2026-10-04T15:01:00.000-04:00'), mp(2, 21750, '2026-10-04T15:02:00.000-04:00'))
    expect(cruzarTransferencia({ monto: 21700, desde: DESDE, pagos, reclamados: [], competidoras: 0, antesManual: VENTANA_ANTES_MS })).toMatchObject({ estado: 'elegir' })
  })

  it('🔴 sólo lo que ENTRÓ y está APROBADO: un pendiente o uno que sale ⛔ confirma', () => {
    const pagos = limpios(
      mp(1, 21700, '2026-10-04T15:01:00.000-04:00', { status: 'pending' }),
      mp(2, 21700, '2026-10-04T15:02:00.000-04:00', { collector_id: undefined, collector: { id: 555 } }),
    )
    expect(cruzarTransferencia({ monto: 21700, desde: DESDE, pagos, reclamados: [], competidoras: 0, antesManual: VENTANA_ANTES_MS })).toEqual({ estado: 'esperando' })
  })

  it('🔴 un pago que ya confirmó otra venta ⛔ confirma ésta', () => {
    const pagos = limpios(mp(1, 21700, '2026-10-04T15:01:00.000-04:00'))
    expect(cruzarTransferencia({ monto: 21700, desde: DESDE, pagos, reclamados: ['1'], competidoras: 0, antesManual: VENTANA_ANTES_MS })).toEqual({ estado: 'esperando' })
  })

  it('dos pagos del mismo monto después de la venta ⇒ elige la cajera, ⛔ el primero', () => {
    const pagos = limpios(mp(1, 21700, '2026-10-04T15:01:00.000-04:00'), mp(2, 21700, '2026-10-04T15:02:00.000-04:00'))
    const r = cruzarTransferencia({ monto: 21700, desde: DESDE, pagos, reclamados: [], competidoras: 0, antesManual: VENTANA_ANTES_MS })
    expect(r.estado).toBe('elegir')
    expect(r.estado === 'elegir' && r.candidatos.map((p) => p.id)).toEqual(['1', '2'])
  })

  it('🔑 otra venta esperando el mismo monto ⇒ elige la cajera aunque haya UN solo pago', () => {
    const pagos = limpios(mp(1, 21700, '2026-10-04T15:01:00.000-04:00'))
    const r = cruzarTransferencia({ monto: 21700, desde: DESDE, pagos, reclamados: [], competidoras: 1, antesManual: VENTANA_ANTES_MS })
    expect(r).toMatchObject({ estado: 'elegir', candidatos: [{ id: '1' }] })
  })

  it('un pago de unos minutos ANTES de confirmar ⛔ entra solo: se ofrece', () => {
    // 15:55 AR = 14:55 en UTC-4: 5 minutos antes.
    const pagos = limpios(mp(1, 21700, '2026-10-04T14:55:00.000-04:00'))
    const r = cruzarTransferencia({ monto: 21700, desde: DESDE, pagos, reclamados: [], competidoras: 0, antesManual: VENTANA_ANTES_MS })
    expect(r).toMatchObject({ estado: 'elegir', candidatos: [{ id: '1' }] })
    // ...y la cajera lo puede tomar.
    expect(cruzarTransferencia({ monto: 21700, desde: DESDE, pagos, reclamados: [], competidoras: 0, elegido: '1', antesManual: VENTANA_ANTES_MS })).toMatchObject({ estado: 'llego', por: 'cajera' })
  })

  it('más viejo que la ventana ⛔ se ofrece ni se puede elegir', () => {
    const viejo = new Date(Date.parse(DESDE) - VENTANA_ANTES_MS - 1000).toISOString()
    const pagos = [{ id: '1', monto: 21700, cuando: viejo, origen: 'mp' }]
    expect(cruzarTransferencia({ monto: 21700, desde: DESDE, pagos, reclamados: [], competidoras: 0, antesManual: VENTANA_ANTES_MS })).toEqual({ estado: 'esperando' })
    expect(cruzarTransferencia({ monto: 21700, desde: DESDE, pagos, reclamados: [], competidoras: 0, elegido: '1', antesManual: VENTANA_ANTES_MS }).estado).toBe('invalido')
  })

  it('🔴 la cajera ⛔ puede elegir un pago de otro monto ni uno ya tomado', () => {
    const pagos = limpios(mp(1, 21700, '2026-10-04T15:01:00.000-04:00'), mp(2, 9000, '2026-10-04T15:01:00.000-04:00'))
    expect(cruzarTransferencia({ monto: 21700, desde: DESDE, pagos, reclamados: [], competidoras: 0, elegido: '2', antesManual: VENTANA_ANTES_MS }).estado).toBe('invalido')
    expect(cruzarTransferencia({ monto: 21700, desde: DESDE, pagos, reclamados: ['1'], competidoras: 0, elegido: '1', antesManual: VENTANA_ANTES_MS }).estado).toBe('invalido')
  })

  it('🔑 A4: la venta re-escaneada nace DESPUÉS del pago ⇒ el pago de 2 h antes se OFRECE, ⛔ entra solo', () => {
    const antes = new Date(Date.parse(DESDE) - 2 * 3600_000).toISOString()
    const pagos = [{ id: '1', monto: 21700, cuando: antes, origen: 'mp' }]
    const r = cruzarTransferencia({ monto: 21700, desde: DESDE, pagos, reclamados: [], competidoras: 0, antesManual: 24 * 3600_000 })
    expect(r).toMatchObject({ estado: 'elegir', candidatos: [{ id: '1' }] })
    expect(r.estado === 'elegir' && r.motivo).toMatch(/mirá la hora/)
    expect(cruzarTransferencia({ monto: 21700, desde: DESDE, pagos, reclamados: [], competidoras: 0, elegido: '1', antesManual: 24 * 3600_000 })).toMatchObject({ estado: 'llego', por: 'cajera' })
    // Uno posterior sigue entrando solo aunque haya uno viejo del mismo monto.
    const conNuevo = [...pagos, { id: '2', monto: 21700, cuando: new Date(Date.parse(DESDE) + 60_000).toISOString(), origen: 'mp' }]
    expect(cruzarTransferencia({ monto: 21700, desde: DESDE, pagos: conNuevo, reclamados: [], competidoras: 0, antesManual: 24 * 3600_000 })).toMatchObject({ estado: 'llego', por: 'solo', pago: { id: '2' } })
  })

  it('🔴 A5: un pago del monto exacto que llega TARDE ⛔ entra solo: puede ser una transferencia ajena', () => {
    const tarde = new Date(Date.parse(DESDE) + VENTANA_SOLA_MS + 60_000).toISOString()
    const pagos = [{ id: '1', monto: 21700, cuando: tarde, origen: 'banco' }]
    const r = cruzarTransferencia({ monto: 21700, desde: DESDE, pagos, reclamados: [], competidoras: 0, antesManual: VENTANA_ANTES_MS })
    expect(r).toMatchObject({ estado: 'elegir', candidatos: [{ id: '1' }] })
    expect(r.estado === 'elegir' && r.motivo).toMatch(/número de operación/)
    // Dentro de la ventana, solo.
    const aTiempo = [{ id: '1', monto: 21700, cuando: new Date(Date.parse(DESDE) + VENTANA_SOLA_MS - 1000).toISOString(), origen: 'banco' }]
    expect(cruzarTransferencia({ monto: 21700, desde: DESDE, pagos: aTiempo, reclamados: [], competidoras: 0, antesManual: VENTANA_ANTES_MS })).toMatchObject({ estado: 'llego', por: 'solo' })
  })

  it('antesManual es obligatorio', () => {
    expect(() => cruzarTransferencia({ monto: 100, desde: DESDE, pagos: [], reclamados: [], competidoras: 0 } as never)).toThrow(/antesManual/)
  })

  it('sin monto o sin hora ⇒ error, ⛔ un cruce contra $0', () => {
    expect(() => cruzarTransferencia({ monto: 0, desde: DESDE, pagos: [], reclamados: [], competidoras: 0, antesManual: VENTANA_ANTES_MS })).toThrow()
    expect(() => cruzarTransferencia({ monto: 100, desde: 'x', pagos: [], reclamados: [], competidoras: 0, antesManual: VENTANA_ANTES_MS })).toThrow()
  })
})

describe('pagosRecientes (paso «Confirmar transferencia», Bruno 12-oct)', () => {
  const p = (id: string, monto: number, min: number) => ({ id, monto, cuando: new Date(Date.parse(DESDE) + min * 60000).toISOString(), origen: 'mp' })
  it('🔑 el más nuevo primero, marca el del monto exacto y saca lo de antes de 30 min y lo ya tomado', () => {
    const r = pagosRecientes({ monto: 4500, desde: DESDE, cuantos: 5, reclamados: ['tomado'], pagos: [p('viejo', 4500, -31), p('a', 12300, -5), p('b', 4500, 2), p('tomado', 4500, 3)] })
    expect(r.map((x) => [x.id, x.coincide])).toEqual([['b', true], ['a', false]])
  })
  it('«coincide» es dentro de la tolerancia, y cada pago dice su diferencia', () => {
    const r = pagosRecientes({ monto: 4500, desde: DESDE, cuantos: 5, reclamados: [], pagos: [p('c', 4400, 1), p('d', 4399, 2)] })
    expect(r.map((x) => [x.id, x.coincide, x.diferencia])).toEqual([['d', false, -101], ['c', true, -100]])
  })
  it('🔴 el tope corta a los OTROS: un pago del monto exacto entra siempre', () => {
    const r = pagosRecientes({ monto: 4500, desde: DESDE, cuantos: 2, reclamados: [], pagos: [p('x', 4500, -20), p('o1', 100, 1), p('o2', 200, 2), p('o3', 300, 3)] })
    expect(r.map((x) => x.id)).toEqual(['o3', 'x'])
  })
  it('sin cuántos mostrar ⇒ error (⛔ un default callado)', () => {
    expect(() => pagosRecientes({ monto: 4500, desde: DESDE, cuantos: 0, reclamados: [], pagos: [] })).toThrow(/cuántos/)
  })
})

describe('sumarCobros (Bruno, 12-oct: «13.300 + 100»)', () => {
  const p = (id: string, monto: number, min: number) => ({ id, monto, cuando: new Date(Date.parse(DESDE) + min * 60000).toISOString(), origen: 'mp' })
  const base = { monto: 13400, desde: DESDE, antesManual: VENTANA_ANTES_MS, reclamados: [] as string[] }
  it('🔑 dos pagos que suman el total ⇒ llegó, en orden de hora', () => {
    const r = sumarCobros({ ...base, pagos: [p('a', 13300, 1), p('b', 100, 4)], elegidos: ['b', 'a'] })
    expect(r).toMatchObject({ estado: 'llego', suma: 13400, diferencia: 0 })
    expect(r.estado === 'llego' && r.pagos.map((x) => x.id)).toEqual(['a', 'b'])
  })
  it('la suma también va con la tolerancia: 13.300 + 50 entra (−$50)', () => {
    expect(sumarCobros({ ...base, pagos: [p('a', 13300, 1), p('b', 50, 4)], elegidos: ['a', 'b'] })).toMatchObject({ estado: 'llego', diferencia: -50 })
  })
  it('🔴 corta o pasada ⇒ inválido, diciendo cuánto falta o sobra', () => {
    expect(sumarCobros({ ...base, pagos: [p('a', 13200, 1)], elegidos: ['a'] })).toEqual({ estado: 'invalido', motivo: expect.stringMatching(/Faltan \$200/) })
    expect(sumarCobros({ ...base, pagos: [p('a', 13300, 1), p('b', 300, 2)], elegidos: ['a', 'b'] })).toEqual({ estado: 'invalido', motivo: expect.stringMatching(/pasan el total por \$200/) })
  })
  it('🔴 un pago que ya tomó otra venta, uno de antes de la venta o uno que no existe ⇒ inválido', () => {
    const pagos = [p('a', 13300, 1), p('b', 100, 2), p('viejo', 100, -11)]
    expect(sumarCobros({ ...base, pagos, reclamados: ['b'], elegidos: ['a', 'b'] }).estado).toBe('invalido')
    expect(sumarCobros({ ...base, pagos, elegidos: ['a', 'viejo'] }).estado).toBe('invalido')
    expect(sumarCobros({ ...base, pagos, elegidos: ['a', 'zzz'] }).estado).toBe('invalido')
    expect(sumarCobros({ ...base, pagos, elegidos: [] }).estado).toBe('invalido')
  })
  it('el mismo id dos veces cuenta UNA', () => {
    expect(sumarCobros({ ...base, pagos: [p('a', 6700, 1)], elegidos: ['a', 'a'] }).estado).toBe('invalido')
  })
})
