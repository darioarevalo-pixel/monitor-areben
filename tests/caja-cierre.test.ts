import { describe, expect, it } from 'vitest'
import { cierreDeTurno } from '@/lib/caja/cierre.core.js'

/**
 * Caja v2 · W3: el cierre de turno (4-oct-2026). Lo cobrado por la Caja en el turno, por cuenta,
 * para cruzarlo con el arqueo de GN. Los montos son de ventas reales del turno #8317 de Zattia.
 */
const DESDE = '2026-10-03T17:04:00.000Z' // 14:04 en Rosario
const HASTA = '2026-10-03T22:06:00.000Z' // 19:06
const NOMBRES = { 12921: 'Efectivo', 20196: 'Debito', 25172: 'Credito 10% OFF (Mier-Vie-Sab) - Nro 1 o 3' }

const v = (id: string, estado: string, cuando: string, pagos: Array<{ cuenta: number; monto: number }>, extra: Record<string, unknown> = {}) => ({
  id, estado, pagos, total: pagos.reduce((s, p) => s + p.monto, 0), creada_en: cuando, en_gn_en: estado === 'en_gn' ? cuando : null, ...extra,
})

describe('cierreDeTurno', () => {
  it('suma por cuenta lo que llegó a GN adentro del turno, con el nombre de GN', () => {
    const r = cierreDeTurno({
      ventas: [
        v('a', 'en_gn', '2026-10-03T20:32:00.000Z', [{ cuenta: 12921, monto: 21700 }]),
        v('b', 'en_gn', '2026-10-03T19:30:00.000Z', [{ cuenta: 20196, monto: 19900 }]),
        v('c', 'en_gn', '2026-10-03T21:22:00.000Z', [{ cuenta: 20196, monto: 44600 }]),
        // Pago partido: cada parte va a su cuenta.
        v('d', 'en_gn', '2026-10-03T21:25:00.000Z', [{ cuenta: 12921, monto: 10000.5 }, { cuenta: 25172, monto: 40399.5 }]),
      ],
      desde: DESDE, hasta: HASTA, nombres: NOMBRES,
    })
    expect(r.porCuenta).toEqual([
      { cuenta: 20196, nombre: 'Debito', monto: 64500, ventas: 2 },
      { cuenta: 25172, nombre: 'Credito 10% OFF (Mier-Vie-Sab) - Nro 1 o 3', monto: 40399.5, ventas: 1 },
      { cuenta: 12921, nombre: 'Efectivo', monto: 31700.5, ventas: 2 },
    ])
    expect(r.total).toBe(136600)
    expect(r.ventas).toBe(4)
    expect(r.sinGN).toEqual([])
  })

  it('la hora que cuenta es la de GN: cobrada en el turno de la mañana pero llegada a la tarde ⇒ es de la tarde', () => {
    const tarde = v('t', 'en_gn', '2026-10-03T16:50:00.000Z', [{ cuenta: 12921, monto: 5000 }], { en_gn_en: '2026-10-03T17:10:00.000Z' })
    const r = cierreDeTurno({ ventas: [tarde], desde: DESDE, hasta: HASTA, nombres: NOMBRES })
    expect(r.total).toBe(5000)
    const manana = cierreDeTurno({ ventas: [tarde], desde: '2026-10-03T12:11:00.000Z', hasta: DESDE, nombres: NOMBRES })
    expect(manana.total).toBe(0)
  })

  it('el borde: «desde» entra, «hasta» ⛔ (dos turnos seguidos ⛔ cuentan dos veces la misma venta)', () => {
    const borde = v('x', 'en_gn', HASTA, [{ cuenta: 12921, monto: 1000 }])
    expect(cierreDeTurno({ ventas: [borde], desde: DESDE, hasta: HASTA, nombres: NOMBRES }).total).toBe(0)
    expect(cierreDeTurno({ ventas: [borde], desde: HASTA, hasta: '2026-10-03T23:00:00.000Z', nombres: NOMBRES }).total).toBe(1000)
  })

  it('las que todavía ⛔ están en GN van aparte (el arqueo ⛔ las tiene); la cancelada ⛔ aparece', () => {
    const r = cierreDeTurno({
      ventas: [
        v('e', 'error', '2026-10-03T19:00:00.000Z', [{ cuenta: 12921, monto: 8000 }]),
        v('w', 'esperando_pago', '2026-10-03T18:00:00.000Z', [{ cuenta: 13015, monto: 9000 }]),
        v('k', 'cancelada', '2026-10-03T18:30:00.000Z', [{ cuenta: 13015, monto: 7000 }]),
        v('fuera', 'error', '2026-10-03T12:00:00.000Z', [{ cuenta: 12921, monto: 1 }]),
      ],
      desde: DESDE, hasta: HASTA, nombres: NOMBRES,
    })
    expect(r.porCuenta).toEqual([])
    expect(r.total).toBe(0)
    expect(r.sinGN.map((s) => [s.id, s.estado, s.total])).toEqual([['w', 'esperando_pago', 9000], ['e', 'error', 8000]])
  })

  it('una cuenta sin nombre de GN ⛔ desaparece: sale con su número', () => {
    const r = cierreDeTurno({ ventas: [v('n', 'en_gn', '2026-10-03T20:00:00.000Z', [{ cuenta: 25868, monto: 100 }])], desde: DESDE, hasta: HASTA, nombres: {} })
    expect(r.porCuenta[0]).toMatchObject({ cuenta: 25868, nombre: 'Cuenta 25868', monto: 100 })
  })

  it('parámetros obligatorios', () => {
    expect(() => cierreDeTurno({ ventas: [], desde: DESDE, hasta: HASTA } as never)).toThrow(/nombres/)
    expect(() => cierreDeTurno({ ventas: [], desde: 'ayer', hasta: HASTA, nombres: {} })).toThrow(/fechas/)
    expect(() => cierreDeTurno({ ventas: [], desde: HASTA, hasta: DESDE, nombres: {} })).toThrow(/antes de empezar/)
  })
})
