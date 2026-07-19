import { describe, it, expect, vi, afterEach } from 'vitest'
import { traerOverview, traerDetalleCuenta } from '@/lib/meta-ads/cliente'

/**
 * El cliente de Meta Ads: que arme bien el request (preset / account) y traduzca
 * la respuesta a `{ok}` / `{ok:false}`. El parseo de omni_purchase vive en el
 * endpoint (api/*.js, sin tests por convención); acá cubrimos el seam.
 */

const resp = (status: number, body: unknown) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
})
const noJson = (status: number) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => { throw new Error('no es JSON') },
})
type Opts = { method?: string; body?: string }
const mockFetch = (impl: (url: string, opts: Opts) => Promise<unknown>) => {
  const fn = vi.fn(impl)
  vi.stubGlobal('fetch', fn)
  return fn
}

afterEach(() => vi.unstubAllGlobals())

describe('traerOverview', () => {
  it('pega a /api/meta-ads con el preset y devuelve las cuentas', async () => {
    const fetchMock = mockFetch(() => Promise.resolve(resp(200, { ok: true, rango: 'last_30d', cuentas: [{ id: '1', nombre: 'A', moneda: 'ARS', spend: 10 }] })))
    const r = await traerOverview({ preset: 'last_30d' })
    expect(r.ok && r.dato.cuentas[0]!.id).toBe('1')
    const url = fetchMock.mock.calls[0]![0]
    expect(url).toBe('/api/meta-ads?preset=last_30d')
  })

  it('propaga error cuando el server dice ok:false / 500', async () => {
    mockFetch(() => Promise.resolve(resp(500, { error: 'Meta Ads no configurado' })))
    const r = await traerOverview({ preset: 'last_7d' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.motivo).toMatch(/Meta Ads no configurado/)
  })
})

describe('traerDetalleCuenta', () => {
  it('incluye account y el rango since/until en el request', async () => {
    const fetchMock = mockFetch(() => Promise.resolve(resp(200, { ok: true, cuenta: { id: '9', nombre: 'X', moneda: 'ARS' }, totales: {}, campañas: [], daily: [], placements: [] })))
    const r = await traerDetalleCuenta('9', { since: '2026-06-01', until: '2026-06-30' })
    expect(r.ok && r.dato.cuenta.id).toBe('9')
    const url = new URL('http://x' + fetchMock.mock.calls[0]![0])
    expect(url.searchParams.get('account')).toBe('9')
    expect(url.searchParams.get('since')).toBe('2026-06-01')
    expect(url.searchParams.get('until')).toBe('2026-06-30')
  })

  it('lanza a {ok:false} ante respuesta no-JSON', async () => {
    mockFetch(() => Promise.resolve(noJson(502)))
    const r = await traerDetalleCuenta('9', { preset: 'last_30d' })
    expect(r.ok).toBe(false)
  })
})
