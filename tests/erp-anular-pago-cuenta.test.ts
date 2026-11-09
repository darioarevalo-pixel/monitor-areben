import { describe, expect, it, vi } from 'vitest'
import { anularPagoCuentaErp } from '../api/_erp-ventas.js'
import { permisoErpDe } from '../lib/permisos.core.js'

/**
 * **Anular un pago a cuenta (Bruno, 9-nov).** El oráculo es lo que le llega al motor: la empresa del pago, su clave, el motivo y quién.
 * El pago se busca con su cliente y su línea: desde una cuenta ⛔ se anula el pago de otra.
 */
const C = '00000000-0000-0000-0000-0000000000c1'
const base = { clienteId: C, linea: 'bdi', ref: 'erp-cobro-cuenta:abc', motivo: 'Se cargó dos veces' }
const motor = () => ({ anularPagoACuenta: vi.fn(async (_db: unknown, _e: Record<string, unknown>) => ({ ok: true, cuenta: { saldo: 10 } })) })
const conPago = () => ({ query: vi.fn(async (_sql: string, _p: unknown[]) => ({ rows: [{ empresa_id: 'e1' }] })) })

describe('anularPagoCuentaErp', () => {
  it('le pasa al motor la empresa del pago, la clave, el motivo y quién', async () => {
    const m = motor()
    const db = conPago()
    const r = await anularPagoCuentaErp({ marca: 'bdi', body: base, usuario: 'bruno' }, { cuenta: m, db })
    expect(r).toEqual({ ok: true, cuenta: { saldo: 10 } })
    expect(db.query.mock.calls[0][1]).toEqual(['erp-cobro-cuenta:abc', C, 'bdi'])
    expect(m.anularPagoACuenta.mock.calls[0][1]).toEqual({ empresa_id: 'e1', origen_ref: 'erp-cobro-cuenta:abc', motivo: 'Se cargó dos veces', usuario: 'bruno' })
  })
  it('⛔ anula un pago que no es de esa cuenta', async () => {
    const m = motor()
    const r = await anularPagoCuentaErp({ marca: 'bdi', body: base, usuario: 'b' }, { cuenta: m, db: { query: async () => ({ rows: [] }) } })
    expect(r.status).toBe(404)
    expect(m.anularPagoACuenta).not.toHaveBeenCalled()
  })
  it.each([
    ['sin motivo', { motivo: '  ' }],
    ['una compra', { ref: 'venta:1' }],
    ['una anulación', { ref: 'x:anulacion' }],
    ['sin cliente', { clienteId: 'x' }],
  ])('⛔ sigue con %s', async (_n, cambio) => {
    const m = motor()
    const r = await anularPagoCuentaErp({ marca: 'bdi', body: { ...base, ...cambio }, usuario: 'b' }, { cuenta: m, db: conPago() })
    expect(r.status).toBe(400)
    expect(m.anularPagoACuenta).not.toHaveBeenCalled()
  })
  it('lo puede hacer sólo quien configura (Admin)', () => {
    expect(permisoErpDe({ method: 'POST', accion: 'anular-pago-cuenta' })).toBe('configurar')
  })
})
