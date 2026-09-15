import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * El HANDLER de `?recurso=destinos` — adónde puede llevar un aviso de cero.
 *
 * Decide tres cosas que `destinos.core.js` ⛔ no puede ver:
 * 1. **Que conteste SIN token**: la tienda sale del menú público. Se despacha arriba del guard; si
 *    quedara abajo, el día que el token se venza la pantalla no podría ni elegir destino.
 * 2. **El gate de la línea**: la línea la elige el request, así que el servidor corta.
 * 3. **Que el Instagram que no se puede leer ⛔ no se lleve las páginas**.
 */

function resFalso() {
  const r = {
    code: 0 as number,
    body: null as Record<string, unknown> | null,
    setHeader() {},
    status(c: number) { r.code = c; return r },
    json(b: unknown) { r.body = b as Record<string, unknown>; return r },
    end() { return r },
  }
  return r
}

const sobre = (d: unknown) => Buffer.from(JSON.stringify(d), 'utf8').toString('base64')
const ADMIN = { name: 'Bruno', admin: true, cuenta: null, acceso: {}, funcion: [] }
const SOLO_ZATTIA = { name: 'Alguien', admin: false, cuenta: 'zattia', acceso: { zattia: { 'meta-ads': true } }, funcion: [] }

const MENU = `
  <a href="https://bdiaccesorios.com.ar/new-in/">NEW IN</a>
  <a href="/fundas/moods-collection/">Moods Collection</a>
  <a href="https://bdiaccesorios.com.ar/productos/cow-case/">Cow</a>`

type Resp = { status: number; body?: unknown; html?: string }

function red(perfil: unknown, otra: (url: string) => Resp) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const u = String(url)
    if (u.includes('/api/usuarios')) return { ok: true, json: async () => ({ ok: true, perfil }) }
    const r = otra(u)
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      headers: { get: () => null },
      json: async () => r.body,
      text: async () => r.html || '',
    }
  }))
}

async function llamar(query: Record<string, unknown> = {}) {
  const mod = await import('@/api/meta-ads.js')
  const res = resFalso()
  await (mod.default as (q: unknown, s: typeof res) => Promise<unknown>)({
    method: 'GET',
    headers: { 'x-monitor-auth': sobre({ user: 'Bruno', pass: 'p' }) },
    query: { recurso: 'destinos', linea: 'bdi', ...query },
    body: {},
  }, res)
  return res
}

beforeEach(() => {
  vi.resetModules()
  for (const v of ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY']) vi.stubEnv(v, 'https://ejemplo.supabase.co')
  vi.stubEnv('META_ADS_TOKEN', 'un-token-vivo')
})
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks() })

const tiendaYGraph = (u: string): Resp => {
  if (u.startsWith('https://bdiaccesorios.com.ar')) return { status: 200, html: MENU }
  if (u.includes('instagram_business_account')) {
    return { status: 200, body: { data: [{ id: '264601567300555', instagram_business_account: { id: '17841404229291199', username: 'bdi.accesorios' } }] } }
  }
  if (u.includes('me/accounts')) return { status: 200, body: { data: [{ id: '264601567300555', name: 'BDI Accesorios' }] } }
  return { status: 404 }
}

describe('?recurso=destinos', () => {
  it('lista las colecciones del menú y las páginas con su Instagram', async () => {
    red(ADMIN, tiendaYGraph)
    const res = await llamar()
    expect(res.code).toBe(200)
    expect(res.body).toMatchObject({ ok: true, linea: 'bdi', sinDestinos: null })
    expect((res.body!.destinos as { ruta: string }[]).map((d) => d.ruta)).toEqual(['/new-in/', '/fundas/moods-collection/'])
    expect(res.body!.paginas).toEqual([
      { id: '264601567300555', nombre: 'BDI Accesorios', instagram: { id: '17841404229291199', usuario: 'bdi.accesorios' } },
    ])
  })

  it('🔴 SIN token contesta igual los destinos de la tienda, y dice por qué no hay páginas', async () => {
    vi.stubEnv('META_ADS_TOKEN', '')
    red(ADMIN, tiendaYGraph)
    const res = await llamar()
    expect(res.code).toBe(200)
    expect((res.body!.destinos as unknown[]).length).toBe(2)
    expect(res.body!.paginas).toEqual([])
    expect(String(res.body!.sinPaginas)).toContain('no está configurado')
  })

  it('el Instagram que no se puede leer ⛔ no se lleva las páginas', async () => {
    red(ADMIN, (u) => (u.includes('instagram_business_account')
      ? { status: 400, body: { error: { code: 100, message: 'missing permission' } } }
      : tiendaYGraph(u)))
    const res = await llamar()
    expect(res.body!.paginas).toEqual([{ id: '264601567300555', nombre: 'BDI Accesorios', instagram: null }])
    expect(String(res.body!.sinInstagram)).toContain('missing permission')
  })

  it('🔴 corta la línea que el perfil no ve', async () => {
    red(SOLO_ZATTIA, tiendaYGraph)
    const res = await llamar({ linea: 'bdi' })
    expect(res.code).toBe(403)
  })

  it('una línea sin tienda es 400', async () => {
    red(ADMIN, tiendaYGraph)
    expect((await llamar({ linea: 'todas' })).code).toBe(400)
  })

  it('con `url`: valida el destino y cuenta los productos de la página', async () => {
    red(ADMIN, (u) => (u.includes('/fundas/moods-collection/')
      ? { status: 200, html: '<a href="/productos/cow-case/">a</a><a href="/productos/moo-case/">b</a>' }
      : tiendaYGraph(u)))
    const res = await llamar({ url: 'https://bdiaccesorios.com.ar/fundas/moods-collection' })
    expect(res.code).toBe(200)
    expect(res.body).toMatchObject({ destino: 'https://bdiaccesorios.com.ar/fundas/moods-collection/', responde: true, productos: 2 })
  })

  it('🔴 con `url` de otro dominio contesta el 409 del guard y ⛔ no va a buscarla', async () => {
    red(ADMIN, tiendaYGraph)
    const res = await llamar({ url: 'https://example.com/' })
    expect(res.code).toBe(409)
    const pedidas = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls.map((c) => String(c[0]))
    expect(pedidas.some((u) => u.includes('example.com'))).toBe(false)
  })
})
