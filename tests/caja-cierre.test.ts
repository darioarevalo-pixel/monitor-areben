import { describe, expect, it } from 'vitest'
import { cobrosDeGN, diferencia, horaDeGN, resumenTurno } from '@/lib/caja/cierre.core.js'

/**
 * Caja v2 · W3: el turno propio (Bruno, 4-oct-2026). Se cuenta sólo el efectivo: fondo + lo cobrado
 * en efectivo − salidas. Montos de ventas reales del turno #8317 de Zattia (3-oct, tarde).
 */
const REGLAS = {
  cuentas: {
    12921: { nombre: 'Efectivo', efectivo: true },
    25867: { nombre: 'Feria - Efectivo', efectivo: true },
    20196: { nombre: 'Débito' },
    13015: { nombre: 'Transferencia' },
  },
}
const TURNO = { fondo: 51900 }
let k = 0
const v = (estado: string, pagos: Array<{ cuenta: number; monto: number }>, hora = '20:00') => ({
  id: `v${++k}`, estado, pagos, total: pagos.reduce((s, p) => s + p.monto, 0), creada_en: `2026-10-03T${hora}:00.000Z`,
})

describe('resumenTurno', () => {
  it('efectivo esperado = fondo + efectivo cobrado (las DOS cuentas de efectivo) − salidas', () => {
    const r = resumenTurno({
      turno: TURNO,
      ventas: [
        v('en_gn', [{ cuenta: 12921, monto: 21700 }]),
        v('en_gn', [{ cuenta: 25867, monto: 20400 }]),
        v('en_gn', [{ cuenta: 20196, monto: 19900 }]),
        v('en_gn', [{ cuenta: 25867, monto: 6300 }, { cuenta: 20196, monto: 10000 }]), // pago partido
      ],
      salidas: [{ monto: 5000 }, { monto: 1200.5 }],
      reglas: REGLAS, nombres: {}, cobrosGN: [],
    })
    expect(r.efectivo).toEqual({ fondo: 51900, cobrado: 48400, cobradoGN: 0, salidas: 6200.5, esperado: 94099.5 })
    expect(r.total).toBe(78300)
    expect(r.ventas).toBe(4)
    // Primero las de efectivo, después por monto.
    expect(r.porCuenta.map((c) => [c.nombre, c.monto, c.cobros, c.efectivo])).toEqual([
      ['Feria - Efectivo', 26700, 2, true],
      ['Efectivo', 21700, 1, true],
      ['Débito', 29900, 2, false],
    ])
  })

  it('la que espera la transferencia ⛔ suma (va aparte); la cancelada ⛔ aparece; la que ⛔ llegó a GN SÍ suma', () => {
    const r = resumenTurno({
      turno: TURNO,
      ventas: [
        v('esperando_pago', [{ cuenta: 13015, monto: 9000 }], '18:00'),
        v('cancelada', [{ cuenta: 12921, monto: 7000 }]),
        v('error', [{ cuenta: 12921, monto: 8000 }], '19:00'),
        v('borrador', [{ cuenta: 12921, monto: 2000 }], '18:30'),
      ],
      salidas: [], reglas: REGLAS, nombres: {}, cobrosGN: [],
    })
    expect(r.efectivo.cobrado).toBe(10000)
    expect(r.efectivo.esperado).toBe(61900)
    expect(r.ventas).toBe(2)
    expect(r.esperando.map((x) => x.total)).toEqual([9000])
    expect(r.sinGN.map((x) => x.total)).toEqual([2000, 8000]) // por hora
  })

  it('turno sin ventas: el esperado es el fondo', () => {
    const r = resumenTurno({ turno: TURNO, ventas: [], salidas: [], reglas: REGLAS, nombres: {}, cobrosGN: [] })
    expect(r.efectivo.esperado).toBe(51900)
    expect(r.porCuenta).toEqual([])
  })

  it('el nombre de GN gana al de la regla; sin ninguno sale el número', () => {
    const r = resumenTurno({
      turno: TURNO,
      ventas: [v('en_gn', [{ cuenta: 20196, monto: 1 }]), v('en_gn', [{ cuenta: 25188, monto: 1 }])],
      salidas: [], reglas: REGLAS, nombres: { 20196: 'Debito' }, cobrosGN: [],
    })
    expect(r.porCuenta.map((c) => c.nombre)).toEqual(['Debito', 'Cuenta 25188'])
  })

  it('parámetros obligatorios', () => {
    expect(() => resumenTurno({ turno: TURNO, ventas: [], salidas: [], reglas: REGLAS } as never)).toThrow(/nombres/)
    expect(() => resumenTurno({ turno: TURNO, ventas: [], reglas: REGLAS, nombres: {} } as never)).toThrow(/salidas/)
    expect(() => resumenTurno({ turno: {}, ventas: [], salidas: [], reglas: REGLAS, nombres: {} } as never)).toThrow(/fondo/)
    expect(() => resumenTurno({ turno: TURNO, ventas: [], salidas: [], reglas: REGLAS, nombres: {} } as never)).toThrow(/cobros de GN/)
  })
})

describe('diferencia', () => {
  it('positiva sobra, negativa falta', () => {
    expect(diferencia(100000, 94099.5)).toBe(5900.5)
    expect(diferencia(90000, 94099.5)).toBe(-4099.5)
    expect(diferencia(0, 0)).toBe(0)
  })
  it('el contado tiene que ser un número de 0 para arriba', () => {
    expect(() => diferencia(NaN, 1)).toThrow()
    expect(() => diferencia(-1, 1)).toThrow()
  })
})

/**
 * W3b: el pedido web que se paga al retirar se cobra en GN, a mano (la API ⛔ deja agregar un pago a
 * una venta existente). El turno lee ese efectivo y lo suma. El caso real: la #29981 (pedido #7144),
 * cobro en Efectivo de $38.241 cargado el 3-oct a las 13:52:40 (hora del local), leído de la API.
 */
const VENTA_29981 = {
  id: 1498996, number: 29981, channel_id: 16, channel: 'Tienda Nube', integration_source: null, tn_order: '7144', client_name: 'Melania Segovia',
  date_sale: '2026-10-03',
  payments: [{ id: 1344182, date_payment: '2026-10-03', amount: 38241, account_id: 12921, created_at: '2026-10-03 13:52:40' }],
}
const CUENTAS = [12921, 25867]
// El turno de la mañana del 3-oct, 9:00 a 14:00 de Argentina.
const MANANA = { desde: '2026-10-03T12:00:00.000Z', hasta: '2026-10-03T17:00:00.000Z' }

describe('cobrosDeGN', () => {
  it('la hora de GN viene SIN zona y es la de Argentina (UTC−3)', () => {
    expect(new Date(horaDeGN('2026-10-03 13:52:40')).toISOString()).toBe('2026-10-03T16:52:40.000Z')
    expect(new Date(horaDeGN('2026-10-03T16:52:40Z')).toISOString()).toBe('2026-10-03T16:52:40.000Z')
    expect(horaDeGN('')).toBeNaN()
  })

  it('el cobro de la #29981 cae en el turno de la mañana, ⛔ en el de la tarde', () => {
    const m = cobrosDeGN({ ventas: [VENTA_29981], ...MANANA, cuentas: CUENTAS })
    expect(m).toEqual([{ id: 1344182, venta: 29981, tn: '7144', cliente: 'Melania Segovia', cuenta: 12921, monto: 38241, en: '2026-10-03T16:52:40.000Z' }])
    expect(cobrosDeGN({ ventas: [VENTA_29981], desde: '2026-10-03T17:00:00.000Z', hasta: '2026-10-03T22:00:00.000Z', cuentas: CUENTAS })).toEqual([])
  })

  it('el borde: desde entra, hasta ⛔ (dos turnos seguidos ⛔ cuentan el mismo cobro)', () => {
    const justo = { ...VENTA_29981, payments: [{ ...VENTA_29981.payments[0], created_at: '2026-10-03 14:00:00' }] }
    expect(cobrosDeGN({ ventas: [justo], ...MANANA, cuentas: CUENTAS })).toEqual([])
    expect(cobrosDeGN({ ventas: [justo], desde: '2026-10-03T17:00:00.000Z', hasta: '2026-10-03T22:00:00.000Z', cuentas: CUENTAS })).toHaveLength(1)
  })

  it('⛔ la venta presencial (canal Mi Local), ⛔ las de la Caja, ⛔ otra cuenta; y el mismo cobro una sola vez', () => {
    const pago = (id: number, cuenta = 12921) => ({ id, amount: 1000, account_id: cuenta, created_at: '2026-10-03 10:00:00' })
    const r = cobrosDeGN({
      ventas: [
        { number: 1, channel_id: 3, payments: [pago(1)] }, // POS de GN
        { number: 2, channel_id: 16, integration_source: 'monitor-caja', payments: [pago(2)] }, // la Caja: ya suma
        { number: 3, channel_id: 16, payments: [pago(3, 20196)] }, // débito
        { number: 4, channel_id: 16, payments: [pago(4, 25867)] }, // feria efectivo: SÍ
        { number: 4, channel_id: 16, payments: [pago(4, 25867)] }, // la misma venta, leída por las dos cuentas
        { number: 5, channel_id: 12, payments: [pago(5)] }, // otro canal (Administración): SÍ
      ],
      ...MANANA, cuentas: CUENTAS,
    })
    expect(r.map((c) => c.venta)).toEqual([4, 5])
  })

  it('parámetros obligatorios', () => {
    expect(() => cobrosDeGN({ ventas: [], ...MANANA } as never)).toThrow(/cuentas/)
    expect(() => cobrosDeGN({ ventas: [], desde: 'x', hasta: MANANA.hasta, cuentas: [] })).toThrow(/horario/)
    expect(() => cobrosDeGN({ desde: MANANA.desde, hasta: MANANA.hasta, cuentas: [] } as never)).toThrow(/ventas/)
  })
})

describe('resumenTurno con los cobros de GN', () => {
  const cobro = (monto: number, en: string) => ({ id: monto, venta: 1, tn: null, cliente: null, cuenta: 12921, monto, en })
  it('suman al esperado y van aparte del cobrado por la Caja, por hora', () => {
    const r = resumenTurno({
      turno: TURNO, ventas: [v('en_gn', [{ cuenta: 12921, monto: 21700 }])], salidas: [{ monto: 5000 }],
      reglas: REGLAS, nombres: {}, cobrosGN: [cobro(38241, '2026-10-03T16:52:40Z'), cobro(1000.5, '2026-10-03T13:00:00Z')],
    })
    expect(r.efectivo).toEqual({ fondo: 51900, cobrado: 21700, cobradoGN: 39241.5, salidas: 5000, esperado: 107841.5 })
    expect(r.porCuenta.map((c) => c.monto)).toEqual([21700]) // ⛔ se mezclan con las ventas de la Caja
    expect(r.total).toBe(21700)
    expect(r.cobrosGN!.map((c) => c.monto)).toEqual([1000.5, 38241])
  })
  it('GN ⛔ contestó (null): ⛔ suman y el resumen lo dice', () => {
    const r = resumenTurno({ turno: TURNO, ventas: [], salidas: [], reglas: REGLAS, nombres: {}, cobrosGN: null })
    expect(r.cobrosGN).toBeNull()
    expect(r.efectivo.esperado).toBe(51900)
  })
})
