// El nombre del comprador de los pedidos sin pagar, de TN EN VIVO por la puerta del ERP (Bruno, 19-oct; api/_erp.js).
import { describe, it, expect, vi } from 'vitest'
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({}) }))
const { compradoresTn: real } = await import('../api/_erp.js')
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const compradoresTn = real as (p: unknown[], d: { env: Record<string, string>, pedir: any }) => Promise<Map<string, string>>

const pedidos = [{ tienda: 'zattia', tnId: '11' }, { tienda: 'zattia', tnId: '12' }, { tienda: 'bdi', tnId: '21' }]
const env = { ERP_LLAVE_MONITOR: 'llave' }

describe('compradoresTn', () => {
  it('sin la llave ⛔ pregunta y la lista sale sin nombres', async () => {
    const pedir = vi.fn()
    expect((await compradoresTn(pedidos, { env: {}, pedir })).size).toBe(0)
    expect(pedir).not.toHaveBeenCalled()
  })
  it('una llamada por tienda, con la llave; lo que TN ⛔ trae queda sin nombre', async () => {
    const pedir = vi.fn(async (url: string) => ({ ok: true, json: async () => ({ compradores: url.includes('zattia') ? { 11: 'Ana', 12: null } : { 21: 'Luz' } }) }))
    const r = await compradoresTn(pedidos, { env, pedir })
    expect([...r.entries()].sort()).toEqual([['bdi/21', 'Luz'], ['zattia/11', 'Ana']])
    expect(pedir).toHaveBeenCalledTimes(2)
    expect(pedir.mock.calls.map((c) => String(c[0])).sort()).toEqual([
      'https://erp.arebensrl.com/api/tn-compradores?tienda=bdi&ids=21',
      'https://erp.arebensrl.com/api/tn-compradores?tienda=zattia&ids=11,12',
    ])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((pedir.mock.calls[0] as any)[1].headers['x-erp-llave']).toBe('llave')
  })
  it('la puerta caída o con error ⛔ rompe la lista', async () => {
    const caida = vi.fn(async () => { throw Object.assign(new Error('x'), { name: 'TimeoutError' }) })
    expect((await compradoresTn(pedidos, { env, pedir: caida })).size).toBe(0)
    const mal = vi.fn(async () => ({ ok: false, status: 401, json: async () => ({}) }))
    expect((await compradoresTn(pedidos, { env, pedir: mal })).size).toBe(0)
  })
})
