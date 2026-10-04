import { describe, expect, it } from 'vitest'
import { diferencia, resumenTurno } from '@/lib/caja/cierre.core.js'

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
      reglas: REGLAS, nombres: {},
    })
    expect(r.efectivo).toEqual({ fondo: 51900, cobrado: 48400, salidas: 6200.5, esperado: 94099.5 })
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
      salidas: [], reglas: REGLAS, nombres: {},
    })
    expect(r.efectivo.cobrado).toBe(10000)
    expect(r.efectivo.esperado).toBe(61900)
    expect(r.ventas).toBe(2)
    expect(r.esperando.map((x) => x.total)).toEqual([9000])
    expect(r.sinGN.map((x) => x.total)).toEqual([2000, 8000]) // por hora
  })

  it('turno sin ventas: el esperado es el fondo', () => {
    const r = resumenTurno({ turno: TURNO, ventas: [], salidas: [], reglas: REGLAS, nombres: {} })
    expect(r.efectivo.esperado).toBe(51900)
    expect(r.porCuenta).toEqual([])
  })

  it('el nombre de GN gana al de la regla; sin ninguno sale el número', () => {
    const r = resumenTurno({
      turno: TURNO,
      ventas: [v('en_gn', [{ cuenta: 20196, monto: 1 }]), v('en_gn', [{ cuenta: 25188, monto: 1 }])],
      salidas: [], reglas: REGLAS, nombres: { 20196: 'Debito' },
    })
    expect(r.porCuenta.map((c) => c.nombre)).toEqual(['Debito', 'Cuenta 25188'])
  })

  it('parámetros obligatorios', () => {
    expect(() => resumenTurno({ turno: TURNO, ventas: [], salidas: [], reglas: REGLAS } as never)).toThrow(/nombres/)
    expect(() => resumenTurno({ turno: TURNO, ventas: [], reglas: REGLAS, nombres: {} } as never)).toThrow(/salidas/)
    expect(() => resumenTurno({ turno: {}, ventas: [], salidas: [], reglas: REGLAS, nombres: {} } as never)).toThrow(/fondo/)
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
