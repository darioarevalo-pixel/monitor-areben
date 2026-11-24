import { describe, expect, it, vi } from 'vitest'
import { corregirSaldoInicialErp } from '../api/_erp-ventas.js'
import { permisoErpDe } from '../lib/permisos.core.js'
import { ACCIONES } from '../lib/erp/entrada.core.js'

/**
 * **«Corregir saldo inicial» (Darío, 24-nov).** El oráculo es lo que le llega al motor: el cliente, su línea, el monto nuevo,
 * el motivo y quién. 0 = anularlo (anular una venta de antes del corte ⛔ baja la deuda, porque vino en el saldo inicial).
 */
const C = '00000000-0000-0000-0000-0000000000c1'
const base = { clienteId: C, linea: 'bdi', prueba: false, monto: 0, motivo: 'Anulé la venta 33280, de antes del corte' }
const motor = () => ({ corregirApertura: vi.fn(async (_db: unknown, _e: Record<string, unknown>) => ({ ok: true, cuenta: 0, apertura: null })) })

describe('corregirSaldoInicialErp', () => {
  it('le pasa al motor el cliente, la línea, el monto, el motivo y quién', async () => {
    const m = motor()
    const r = await corregirSaldoInicialErp({ marca: 'bdi', body: base, usuario: 'dario' }, { cuenta: m, db: {} })
    expect(r).toEqual({ ok: true, cuenta: 0, apertura: null })
    expect(m.corregirApertura.mock.calls[0][1]).toEqual({ cliente_id: C, marca: 'bdi', monto: 0, motivo: 'Anulé la venta 33280, de antes del corte', usuario: 'dario', prueba: false })
  })
  it('un monto en negativo (a favor) pasa con su signo', async () => {
    const m = motor()
    await corregirSaldoInicialErp({ marca: 'bdi', body: { ...base, monto: -500 }, usuario: 'b' }, { cuenta: m, db: {} })
    expect(m.corregirApertura.mock.calls[0][1].monto).toBe(-500)
  })
  it.each([
    ['sin motivo', { motivo: '  ' }],
    ['sin monto', { monto: '' }],
    ['un monto que no es número', { monto: 'abc' }],
    ['sin cliente', { clienteId: 'x' }],
  ])('⛔ sigue con %s', async (_n, cambio) => {
    const m = motor()
    const r = await corregirSaldoInicialErp({ marca: 'bdi', body: { ...base, ...cambio }, usuario: 'b' }, { cuenta: m, db: {} })
    expect(r.status).toBe(400)
    expect(m.corregirApertura).not.toHaveBeenCalled()
  })
  it('lo que dice el motor (sin saldo inicial) vuelve como error', async () => {
    const m = { corregirApertura: vi.fn(async () => ({ ok: false, error: { codigo: 'SIN_APERTURA', mensaje: 'Este cliente no tiene saldo inicial para corregir' } })) }
    const r = await corregirSaldoInicialErp({ marca: 'bdi', body: base, usuario: 'b' }, { cuenta: m, db: {} })
    expect(r.error).toMatch(/no tiene saldo inicial/)
  })
  it('lo puede hacer sólo quien configura (Admin), y es una acción conocida', () => {
    expect(permisoErpDe({ method: 'POST', accion: 'corregir-saldo-inicial' })).toBe('configurar')
    expect(ACCIONES).toContain('corregir-saldo-inicial')
  })
})
