// Las URLs de privacidad de la app de TN «Areben ERP» (api/_tn-erp.js): contestan 200 y ⛔ guardan el cuerpo.
import { describe, it, expect, vi } from 'vitest'
import handler, { ACCIONES_TN_ERP } from '../api/_tn-erp.js'

const respuesta = () => {
  const r = { code: 0, body: null as unknown, status(c: number) { r.code = c; return r }, json(b: unknown) { r.body = b; return r } }
  return r
}

describe('tn-erp (privacidad)', () => {
  it('las 3 acciones de TN contestan 200 sin sesión, y ⛔ escriben al log los datos de la clienta', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    for (const accion of ACCIONES_TN_ERP) {
      const r = respuesta()
      await handler({ method: 'POST', query: { accion }, body: { store_id: 123, customer: { email: 'ana@x.com', phone: '11' } } } as never, r as never)
      expect(r.code).toBe(200)
    }
    expect(log.mock.calls.flat().join(' ')).not.toMatch(/ana@x\.com/)
    log.mockRestore()
  })
  it('otra acción ⇒ 404; otro método ⇒ 405', async () => {
    const r1 = respuesta(); await handler({ method: 'POST', query: { accion: 'x' } } as never, r1 as never); expect(r1.code).toBe(404)
    const r2 = respuesta(); await handler({ method: 'PUT', query: { accion: 'store-redact' } } as never, r2 as never); expect(r2.code).toBe(405)
  })
})
