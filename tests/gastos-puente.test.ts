import { beforeEach, describe, expect, it, vi } from 'vitest'

const comerciales = vi.fn()
vi.mock('../motor/gasto/gasto.mjs', () => ({ gastosComerciales: (...a: unknown[]) => comerciales(...a), registrarGasto: vi.fn() }))

import handler from '../api/_gastos-puente.js'

const SECRETO = 'z'.repeat(40)
const conMotor = async (_m: string, _q: string, fn: (pg: unknown) => Promise<unknown>) =>
  fn({ query: async (_s: string, p: unknown[]) => ({ rows: (p[0] as string[]).map((id) => ({ id, empresa_id: 'areben' })) }) })
const vacio = { ok: true, por_tipo: { comision: 10, impuesto: 0, otro: 0 }, meses: [{ mes: '2026-10', total: 10, por_tipo: { comision: 10, impuesto: 0, otro: 0 } }], comision_automatica: 10, cobrosSinComision: 2,
  gastos: [{ id: 'g1', fecha: '2026-10-05', tipo: 'comision', monto: 10 }] }

async function llamar(headers: Record<string, string>, query: Record<string, string> = { marca: 'bdi', desde: '2026-10-01', hasta: '2026-10-31' }, method = 'GET') {
  let code = 0
  let body: Record<string, unknown> = {}
  const res = { status: (c: number) => { code = c; return res }, json: (b: Record<string, unknown>) => { body = b; return res } }
  await handler({ method, headers, query }, res, { conMotor })
  return { code, body }
}

describe('gastos-puente (la puerta del dashboard)', () => {
  beforeEach(() => { comerciales.mockReset(); comerciales.mockResolvedValue(vacio); process.env.DASHBOARD_PUENTE_SECRET = SECRETO })

  it('sin sobre, con otro sobre o sin secreto configurado: 401 y ⛔ toca el motor', async () => {
    expect((await llamar({})).code).toBe(401)
    expect((await llamar({ 'x-puente-auth': 'y'.repeat(40) })).code).toBe(401)
    delete process.env.DASHBOARD_PUENTE_SECRET
    expect((await llamar({ 'x-puente-auth': SECRETO })).code).toBe(401)
    process.env.DASHBOARD_PUENTE_SECRET = 'corto'
    expect((await llamar({ 'x-puente-auth': 'corto' })).code).toBe(401)
    expect(comerciales).not.toHaveBeenCalled()
  })

  it('sólo GET', async () => {
    expect((await llamar({ 'x-puente-auth': SECRETO }, undefined, 'POST')).code).toBe(405)
  })

  it('devuelve los totales de los gastos REALES y ⛔ el detalle fila por fila', async () => {
    const r = await llamar({ 'x-puente-auth': SECRETO })
    expect(r.code).toBe(200)
    expect(comerciales.mock.calls[0][1]).toMatchObject({ marca: 'bdi', prueba: false })
    expect(r.body).toEqual({ desde: '2026-10-01', hasta: '2026-10-31', total: 10, por_tipo: { comision: 10, impuesto: 0, otro: 0 }, meses: vacio.meses, comisionAutomatica: 10, cobrosSinComision: 2 })
    expect(r.body.gastos).toBeUndefined()
  })

  it('marca o período inválidos: 400', async () => {
    expect((await llamar({ 'x-puente-auth': SECRETO }, { marca: 'x', desde: '2026-10-01', hasta: '2026-10-31' })).code).toBe(400)
    expect((await llamar({ 'x-puente-auth': SECRETO }, { marca: 'bdi', desde: 'ayer', hasta: '2026-10-31' })).code).toBe(400)
  })
})
