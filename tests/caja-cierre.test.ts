import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { anuladasEnGN, cobrosDeGN, diferencia, horaDeGN, puedeAnularMov, puedeMoverEfectivo, puedeUsarPOS, resumenTurno, usuarioDe } from '@/lib/caja/cierre.core.js'

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
      movs: [{ tipo: 'salida', monto: 5000 }, { tipo: 'salida', monto: 1200.5 }],
      reglas: REGLAS, nombres: {}, cobrosGN: [], anuladasGN: [],
    })
    expect(r.efectivo).toEqual({ fondo: 51900, cobrado: 48400, deEspera: 0, cobradoGN: 0, aportes: 0, salidas: 6200.5, esperado: 94099.5 })
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
      movs: [], reglas: REGLAS, nombres: {}, cobrosGN: [], anuladasGN: [],
    })
    expect(r.efectivo.cobrado).toBe(10000)
    expect(r.efectivo.esperado).toBe(61900)
    expect(r.ventas).toBe(2)
    expect(r.esperando.map((x) => x.total)).toEqual([9000])
    expect(r.sinGN.map((x) => x.total)).toEqual([2000, 8000]) // por hora
  })

  it('🔴 A2: venta mixta efectivo + transferencia esperando ⇒ el EFECTIVO ya está en el cajón y suma; la transferencia ⛔', () => {
    const mixta = v('esperando_pago', [{ cuenta: 12921, monto: 5000 }, { cuenta: 13015, monto: 9000 }])
    const r = resumenTurno({ turno: TURNO, ventas: [mixta], movs: [], reglas: REGLAS, nombres: {}, cobrosGN: [], anuladasGN: [] })
    expect(r.efectivo.deEspera).toBe(5000)
    expect(r.efectivo.cobrado).toBe(0)
    expect(r.efectivo.esperado).toBe(56900)
    expect(r.total).toBe(0)
    expect(r.esperando.map((x) => x.total)).toEqual([14000])
    // Cancelada: la cajera devolvió el efectivo ⇒ ⛔ suma.
    const can = resumenTurno({ turno: TURNO, ventas: [{ ...mixta, estado: 'cancelada' }], movs: [], reglas: REGLAS, nombres: {}, cobrosGN: [], anuladasGN: [] })
    expect(can.efectivo.esperado).toBe(51900)
  })

  it('turno sin ventas: el esperado es el fondo', () => {
    const r = resumenTurno({ turno: TURNO, ventas: [], movs: [], reglas: REGLAS, nombres: {}, cobrosGN: [], anuladasGN: [] })
    expect(r.efectivo.esperado).toBe(51900)
    expect(r.porCuenta).toEqual([])
  })

  it('el nombre de GN gana al de la regla; sin ninguno sale el número', () => {
    const r = resumenTurno({
      turno: TURNO,
      ventas: [v('en_gn', [{ cuenta: 20196, monto: 1 }]), v('en_gn', [{ cuenta: 25188, monto: 1 }])],
      movs: [], reglas: REGLAS, nombres: { 20196: 'Debito' }, cobrosGN: [], anuladasGN: [],
    })
    expect(r.porCuenta.map((c) => c.nombre)).toEqual(['Debito', 'Cuenta 25188'])
  })

  it('parámetros obligatorios', () => {
    expect(() => resumenTurno({ turno: TURNO, ventas: [], movs: [], reglas: REGLAS } as never)).toThrow(/nombres/)
    expect(() => resumenTurno({ turno: TURNO, ventas: [], reglas: REGLAS, nombres: {} } as never)).toThrow(/movimientos/)
    expect(() => resumenTurno({ turno: {}, ventas: [], movs: [], reglas: REGLAS, nombres: {} } as never)).toThrow(/fondo/)
    expect(() => resumenTurno({ turno: TURNO, ventas: [], movs: [], reglas: REGLAS, nombres: {} } as never)).toThrow(/cobros de GN/)
    expect(() => resumenTurno({ turno: TURNO, ventas: [], movs: [], reglas: REGLAS, nombres: {}, cobrosGN: [] } as never)).toThrow(/anuladas en GN/)
  })

  it('B4: el aporte suma, la salida resta y lo ANULADO ⛔ cuenta', () => {
    const r = resumenTurno({
      turno: TURNO, ventas: [],
      movs: [
        { tipo: 'salida', monto: 3000 },
        { tipo: 'aporte', monto: 10000 },
        { tipo: 'salida', monto: 50000, anulado_en: '2026-10-11T15:00:00Z' },
        { tipo: 'aporte', monto: 7000, anulado_en: '2026-10-11T15:00:00Z' },
      ],
      reglas: REGLAS, nombres: {}, cobrosGN: [], anuladasGN: [],
    })
    expect(r.efectivo).toMatchObject({ aportes: 10000, salidas: 3000, esperado: 51900 + 10000 - 3000 })
  })

  it('B2: la DESCARTADA ⛔ suma, como la cancelada', () => {
    const r = resumenTurno({ turno: TURNO, ventas: [v('descartada', [{ cuenta: 12921, monto: 7000 }])], movs: [], reglas: REGLAS, nombres: {}, cobrosGN: [], anuladasGN: [] })
    expect(r.efectivo.esperado).toBe(51900)
    expect(r.ventas).toBe(0)
  })

  it('🔴 A12: la venta que GN ya ⛔ tiene (anulada a mano) deja de sumar y se lista aparte', () => {
    const anulada = { ...v('en_gn', [{ cuenta: 12921, monto: 7000 }]), id: 'x1', gn_number: 30500 }
    const viva = { ...v('en_gn', [{ cuenta: 12921, monto: 2000 }]), id: 'x2' }
    const r = resumenTurno({ turno: TURNO, ventas: [anulada, viva], movs: [], reglas: REGLAS, nombres: {}, cobrosGN: [], anuladasGN: ['x1'] })
    expect(r.efectivo.cobrado).toBe(2000)
    expect(r.ventas).toBe(1)
    expect(r.anuladasGN?.map((x) => x.gn_number)).toEqual([30500])
    // Sin poder mirar GN: ⛔ se saca nada, y el resumen lo dice con null.
    const sin = resumenTurno({ turno: TURNO, ventas: [anulada, viva], movs: [], reglas: REGLAS, nombres: {}, cobrosGN: [], anuladasGN: null })
    expect(sin.efectivo.cobrado).toBe(9000)
    expect(sin.anuladasGN).toBeNull()
  })

  it('B5: lo hecho a mano queda a la vista (ventas y pesos)', () => {
    const r = resumenTurno({
      turno: TURNO,
      ventas: [
        { ...v('en_gn', [{ cuenta: 12921, monto: 7000 }]), a_mano: { venta: 500, prendas: 0, precios: 1000 } },
        { ...v('en_gn', [{ cuenta: 12921, monto: 7000 }]), a_mano: { venta: 0, prendas: 0, precios: 0 } },
        { ...v('cancelada', [{ cuenta: 12921, monto: 7000 }]), a_mano: { venta: 9000, prendas: 0, precios: 0 } },
      ],
      movs: [], reglas: REGLAS, nombres: {}, cobrosGN: [], anuladasGN: [],
    })
    expect(r.aMano).toEqual({ ventas: 1, venta: 500, prendas: 0, precios: 1000 })
  })
})

describe('anuladasEnGN', () => {
  it('las en_gn cuyo id de GN ⛔ vino; las que ⛔ llegaron a GN ⛔ se miran', () => {
    const ventas = [
      { id: 'a', estado: 'en_gn', gn_sale_id: 1 },
      { id: 'b', estado: 'en_gn', gn_sale_id: 2 },
      { id: 'c', estado: 'error', gn_sale_id: null },
      { id: 'd', estado: 'en_gn', gn_sale_id: null },
    ]
    expect(anuladasEnGN({ ventas, idsGN: [1, 99] })).toEqual(['b'])
  })
})

describe('puedeMoverEfectivo / puedeAnularMov (A8, B4)', () => {
  const turno = { abierto_por: 'Cajera', abierto_por_usuario: 'cajera@x.com' }
  const duena = { name: 'Cajera', email: 'cajera@x.com' }
  const otra = { name: 'Otra', email: 'otra@x.com' }
  it('carga la dueña del turno o un admin; otra cuenta con permiso de Caja ⛔', () => {
    expect(puedeMoverEfectivo(turno, duena, false)).toBe(true)
    expect(puedeMoverEfectivo(turno, otra, false)).toBe(false)
    expect(puedeMoverEfectivo(turno, otra, true)).toBe(true)
    expect(puedeMoverEfectivo(null, duena, true)).toBe(false)
  })
  it('anula un admin, o la dueña lo que cargó ELLA', () => {
    const suyo = { usuario_cuenta: 'cajera@x.com', usuario: 'Cajera' }
    const deAdmin = { usuario_cuenta: 'bruno@x.com', usuario: 'Bruno' }
    expect(puedeAnularMov(suyo, turno, duena, false)).toBe(true)
    expect(puedeAnularMov(deAdmin, turno, duena, false)).toBe(false)
    expect(puedeAnularMov(suyo, turno, otra, false)).toBe(false)
    expect(puedeAnularMov(deAdmin, turno, otra, true)).toBe(true)
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
    const m = cobrosDeGN({ ventas: [VENTA_29981], ...MANANA, cuentas: CUENTAS, deCaja: [] })
    expect(m).toEqual([{ id: 1344182, venta: 29981, tn: '7144', cliente: 'Melania Segovia', cuenta: 12921, monto: 38241, en: '2026-10-03T16:52:40.000Z', pos: false }])
    expect(cobrosDeGN({ ventas: [VENTA_29981], desde: '2026-10-03T17:00:00.000Z', hasta: '2026-10-03T22:00:00.000Z', cuentas: CUENTAS, deCaja: [] })).toEqual([])
  })

  it('el borde: desde entra, hasta ⛔ (dos turnos seguidos ⛔ cuentan el mismo cobro)', () => {
    const justo = { ...VENTA_29981, payments: [{ ...VENTA_29981.payments[0], created_at: '2026-10-03 14:00:00' }] }
    expect(cobrosDeGN({ ventas: [justo], ...MANANA, cuentas: CUENTAS, deCaja: [] })).toEqual([])
    expect(cobrosDeGN({ ventas: [justo], desde: '2026-10-03T17:00:00.000Z', hasta: '2026-10-03T22:00:00.000Z', cuentas: CUENTAS, deCaja: [] })).toHaveLength(1)
  })

  it('🔑 la venta del POS de GN SÍ suma (las dos cajas, 13-oct); ⛔ las de la Caja, ⛔ otra cuenta; y el mismo cobro una sola vez', () => {
    const pago = (id: number, cuenta = 12921) => ({ id, amount: 1000, account_id: cuenta, created_at: '2026-10-03 10:00:00' })
    const r = cobrosDeGN({
      ventas: [
        { id: 101, number: 1, channel_id: 3, payments: [pago(1)] }, // POS de GN: SÍ, marcada
        { id: 102, number: 2, channel_id: 16, integration_source: 'monitor-caja', payments: [pago(2)] }, // la Caja: ya suma
        { id: 106, number: 6, channel_id: 3, payments: [pago(6)] }, // la Caja sin la marca: la saca su id
        { id: 103, number: 3, channel_id: 16, payments: [pago(3, 20196)] }, // débito
        { id: 104, number: 4, channel_id: 16, payments: [pago(4, 25867)] }, // feria efectivo: SÍ
        { id: 104, number: 4, channel_id: 16, payments: [pago(4, 25867)] }, // la misma venta, leída por las dos cuentas
        { id: 105, number: 5, channel_id: 12, payments: [pago(5)] }, // otro canal (Administración): SÍ
      ],
      ...MANANA, cuentas: CUENTAS, deCaja: [106],
    })
    expect(r.map((c) => [c.venta, c.pos])).toEqual([[1, true], [4, false], [5, false]])
  })

  it('parámetros obligatorios', () => {
    expect(() => cobrosDeGN({ ventas: [], ...MANANA } as never)).toThrow(/cuentas/)
    expect(() => cobrosDeGN({ ventas: [], ...MANANA, cuentas: [] } as never)).toThrow(/Caja/)
    expect(() => cobrosDeGN({ ventas: [], desde: 'x', hasta: MANANA.hasta, cuentas: [], deCaja: [] })).toThrow(/horario/)
    expect(() => cobrosDeGN({ desde: MANANA.desde, hasta: MANANA.hasta, cuentas: [] } as never)).toThrow(/ventas/)
  })
})

describe('resumenTurno con los cobros de GN', () => {
  const cobro = (monto: number, en: string) => ({ id: monto, venta: 1, tn: null, cliente: null, cuenta: 12921, monto, en })
  it('suman al esperado y van aparte del cobrado por la Caja, por hora', () => {
    const r = resumenTurno({
      turno: TURNO, ventas: [v('en_gn', [{ cuenta: 12921, monto: 21700 }])], movs: [{ tipo: 'salida', monto: 5000 }],
      reglas: REGLAS, nombres: {}, cobrosGN: [cobro(38241, '2026-10-03T16:52:40Z'), cobro(1000.5, '2026-10-03T13:00:00Z')], anuladasGN: [],
    })
    expect(r.efectivo).toEqual({ fondo: 51900, cobrado: 21700, deEspera: 0, cobradoGN: 39241.5, aportes: 0, salidas: 5000, esperado: 107841.5 })
    expect(r.porCuenta.map((c) => c.monto)).toEqual([21700]) // ⛔ se mezclan con las ventas de la Caja
    expect(r.total).toBe(21700)
    expect(r.cobrosGN!.map((c) => c.monto)).toEqual([1000.5, 38241])
  })
  it('GN ⛔ contestó (null): ⛔ suman y el resumen lo dice', () => {
    const r = resumenTurno({ turno: TURNO, ventas: [], movs: [], reglas: REGLAS, nombres: {}, cobrosGN: null, anuladasGN: [] })
    expect(r.cobrosGN).toBeNull()
    expect(r.efectivo.esperado).toBe(51900)
  })
})

describe('puedeUsarPOS (fase C: sólo la cuenta que abrió la caja)', () => {
  const T = { abierto_por: 'Sofi', abierto_por_usuario: 'sofi@zattia.com' }
  it('la misma cuenta, por mail (sin mirar mayúsculas)', () => {
    expect(puedeUsarPOS(T, { name: 'Sofi', email: 'Sofi@Zattia.com' })).toBe(true)
  })
  it('🔴 otra cuenta con el MISMO nombre ⛔: manda el mail', () => {
    expect(puedeUsarPOS(T, { name: 'Sofi', email: 'otra@zattia.com' })).toBe(false)
  })
  it('🔴 un admin ⛔ es la excepción', () => {
    expect(puedeUsarPOS(T, { name: 'Bruno', email: 'bruno@x.com', admin: true } as never)).toBe(false)
  })
  it('sin mail en el padrón, el nombre', () => {
    expect(usuarioDe({ name: 'Cajera' })).toBe('cajera')
    expect(puedeUsarPOS({ abierto_por: 'Cajera', abierto_por_usuario: 'cajera' }, { name: 'Cajera' })).toBe(true)
  })
  it('un turno de antes de la fase C (sin usuario) se compara por nombre; sin turno o sin perfil ⛔', () => {
    expect(puedeUsarPOS({ abierto_por: 'Sofi' }, { name: 'Sofi' })).toBe(true)
    expect(puedeUsarPOS({ abierto_por: 'Sofi' }, { name: 'Ana' })).toBe(false)
    expect(puedeUsarPOS({ abierto_por: null }, { name: '' })).toBe(false)
    expect(puedeUsarPOS(null, { name: 'Sofi' })).toBe(false)
    expect(puedeUsarPOS(T, null)).toBe(false)
  })
})

describe('venta del ERP anulada (ensayo Caja Stunned, 26-oct)', () => {
  it('una venta en_erp con `anulada` ⛔ suma al efectivo esperado', () => {
    const r = resumenTurno({
      turno: { fondo: 0 },
      ventas: [{ ...v('en_erp', [{ cuenta: 12921, monto: 11700 }]), anulada: { por: 'Bruno', en: '2026-10-26T22:10:17Z', motivo: 'ensayo' } }],
      movs: [], reglas: REGLAS, nombres: {}, cobrosGN: [], anuladasGN: [],
    })
    expect(r.efectivo.esperado).toBe(0)
  })
  it('la consulta del turno pide la columna `anulada` (sin ella la regla de arriba nunca se entera)', () => {
    const src = readFileSync('api/_caja.js', 'utf-8')
    expect(src).toMatch(/from\('caja_venta'\)\.select\('[^']*a_mano, anulada'\)\.eq\('turno_id'/)
  })
})
