/**
 * Canjes — cancelar con el stock ya descontado (Bruno 9-nov): lo decide dónde está la prenda.
 * Devolver de más suma stock que no está; devolver de menos lo pierde.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cancelarDevuelveStock } from '@/lib/canjes/reglas.core.js'

const devolver = vi.hoisted(() => vi.fn())
let fila: Record<string, unknown>
let updates: Record<string, unknown>[]

function fakeSupabase() {
  const desde = (tabla: string) => {
    let update: Record<string, unknown> | null = null
    const resolver = async () => {
      if (update) { updates.push(update); Object.assign(fila, update); return { data: null, error: null } }
      if (tabla === 'canjes') return { data: fila, error: null }
      if (tabla === 'canje_config') return { data: { factor_costo_estimado: 0.4 }, error: null }
      return { data: [], error: null }
    }
    const api: Record<string, unknown> = {
      select: () => api, eq: () => api, is: () => api, order: () => api,
      update: (row: Record<string, unknown>) => { update = row; return api },
      maybeSingle: () => resolver(), single: () => resolver(),
      then: (ok: (v: unknown) => unknown, mal: (e: unknown) => unknown) => resolver().then(ok, mal),
    }
    return api
  }
  return { from: desde }
}

vi.mock('@supabase/supabase-js', () => ({ createClient: () => fakeSupabase() }))
vi.mock('@/api/_auth.js', () => ({
  soloMismoOrigen: () => false,
  exigirUsuario: async () => ({ name: 'Sofi', email: 'sofi@arebensrl.com', admin: true }),
}))
vi.mock('@/api/_salida-documento.js', () => ({ devolverCanjeAlErp: devolver }))

async function cancelar() {
  const mod = await import('@/api/_canjes.js')
  const res = {
    code: 0, body: null as Record<string, unknown> | null,
    setHeader() { return res }, end() { return res },
    status(c: number) { res.code = c; return res },
    json(b: unknown) { res.body = b as Record<string, unknown>; return res },
  }
  await (mod.default as (q: unknown, s: typeof res) => Promise<unknown>)(
    { method: 'POST', headers: {}, query: {}, body: { store: 'bdi', id: 12, action: 'canje-estado', estado: 'cancelado', motivo: 'se bajó' } },
    res,
  )
  return res
}

beforeEach(() => {
  vi.resetModules()
  devolver.mockReset()
  updates = []
  fila = { id: 12, store: 'bdi', estado: 'preparando', stock_estado: 'hecho', envio_estado: 'pendiente', entregado_at: null, historial: [] }
  vi.stubEnv('SUPABASE_URL', 'https://x.supabase.co')
  vi.stubEnv('SUPABASE_SERVICE_KEY', 'service')
})
afterEach(() => { vi.unstubAllEnvs() })

describe('canje-estado — cancelar', () => {
  it('con la prenda acá: devuelve, cancela y lo deja anotado', async () => {
    devolver.mockResolvedValue({ ok: true, ajustes: [21] })
    const res = await cancelar()
    expect(res.code).toBe(200)
    expect(devolver).toHaveBeenCalledWith({ store: 'bdi', canjeId: 12, usuario: expect.anything() })
    expect(fila.estado).toBe('cancelado')
    expect(fila.stock_estado).toBe('no_aplica')
    expect(JSON.stringify(fila)).toContain('stock devuelto (A-21)')
  })

  it('si el stock no se puede devolver, el canje NO se cancela', async () => {
    devolver.mockResolvedValue({ error: 'sin base' })
    const res = await cancelar()
    expect(res.code).toBe(409)
    expect(updates).toEqual([])
    expect(fila.estado).toBe('preparando')
  })

  it('de antes del corte (salió por GN): cancela y no dice que volvió', async () => {
    devolver.mockResolvedValue({ ok: true, ajustes: [] })
    const res = await cancelar()
    expect(res.code).toBe(200)
    expect(fila.estado).toBe('cancelado')
    expect(fila.stock_estado).toBe('hecho')
    expect(JSON.stringify(fila)).not.toContain('stock devuelto')
  })

  it('ya la recibió: cancela sin tocar el stock', async () => {
    fila.estado = 'en_curso'
    fila.entregado_at = '2026-11-16T15:00:00.000Z'
    const res = await cancelar()
    expect(res.code).toBe(200)
    expect(devolver).not.toHaveBeenCalled()
    expect(fila.estado).toBe('cancelado')
  })
})

const canje = (p = {}) => ({ estado: 'preparando', stock_estado: 'hecho', envio_estado: 'pendiente', entregado_at: null, ...p })

describe('cancelarDevuelveStock', () => {
  it('stock descontado y la prenda todavía acá: vuelve', () => {
    expect(cancelarDevuelveStock(canje())).toBe(true)
  })

  it('ya la recibió: no vuelve', () => {
    expect(cancelarDevuelveStock(canje({ estado: 'en_curso', entregado_at: '2026-11-16T15:00:00.000Z' }))).toBe(false)
    expect(cancelarDevuelveStock(canje({ entregado_at: '2026-11-16T15:00:00.000Z' }))).toBe(false)
  })

  it('ya despachada: está en el correo, no vuelve sola', () => {
    expect(cancelarDevuelveStock(canje({ envio_estado: 'hecho' }))).toBe(false)
  })

  it('el stock nunca salió: no hay nada que devolver', () => {
    for (const stock_estado of ['no_aplica', 'pendiente']) expect(cancelarDevuelveStock(canje({ stock_estado }))).toBe(false)
    expect(cancelarDevuelveStock(canje({ estado: 'acuerdo', stock_estado: 'no_aplica' }))).toBe(false)
  })
})
