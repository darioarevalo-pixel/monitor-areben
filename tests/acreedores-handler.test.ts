import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * "A quién le debemos" es la primera sección que **no tiene base propia**: le pide el saldo al
 * dashboard por HTTP. Eso agrega dos modos de falla que ninguna otra sección tiene, y son los que
 * fija este archivo:
 *
 *  1. El dashboard no contesta (está caído, tarda, rechaza la credencial). La sección tiene que
 *     quedarse **sin los montos, no sin pantalla**: 200 con un aviso escrito para leer.
 *  2. La credencial no está cargada. Mismo trato: aviso, no explosión.
 *
 * Y el de siempre: identidad ≠ permiso. Al Monitor entra mucha más gente que al dashboard, así que
 * estar logueado no alcanza para ver cuánto le debemos al contador.
 */

function resFalso() {
  const r = {
    code: 0 as number,
    body: null as Record<string, unknown> | null,
    setHeader() { return r },
    status(c: number) { r.code = c; return r },
    json(b: unknown) { r.body = b as Record<string, unknown>; return r },
    end() { return r },
  }
  return r
}

const sobre = (d: unknown) => Buffer.from(JSON.stringify(d), 'utf8').toString('base64')

/** El padrón contesta con este perfil; el dashboard, con lo que diga `dashboard`. */
function escenario(perfil: unknown, dashboard: { ok: boolean; status?: number; body?: unknown }) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (String(url).includes('bdi-catalogo.vercel.app/api/usuarios')) {
      return { ok: true, json: async () => ({ ok: true, perfil }) }
    }
    if (!dashboard.ok && dashboard.status === undefined) throw new Error('conexión rechazada')
    return {
      ok: dashboard.ok,
      status: dashboard.status ?? (dashboard.ok ? 200 : 500),
      json: async () => dashboard.body,
      text: async () => JSON.stringify(dashboard.body),
    }
  }) as unknown as typeof fetch)
}

const get = () => ({
  method: 'GET',
  headers: { 'x-monitor-auth': sobre({ user: 'Alguien', pass: 'p' }) },
  query: {},
  body: {},
})

async function llamar(req: unknown) {
  const { default: handler } = await import('../api/_acreedores.js')
  const res = resFalso()
  await handler(req as never, res as never)
  return res
}

const ADMIN = { name: 'Dario Arevalo', admin: true }
const SIN_PERMISO = { name: 'Alguien', admin: false, permisos: {} }

beforeEach(() => {
  process.env.DASHBOARD_PUENTE_SECRET = 'x'.repeat(64)
  process.env.DASHBOARD_PUENTE_URL = 'http://dashboard-de-prueba/api/puente/acreedores'
})
afterEach(() => {
  vi.unstubAllGlobals()
  delete process.env.DASHBOARD_PUENTE_SECRET
  delete process.env.DASHBOARD_PUENTE_URL
})

describe('quién puede mirar', () => {
  it('estar logueado no alcanza: hace falta el permiso de la sección', async () => {
    escenario(SIN_PERMISO, { ok: true, body: { acreedores: [] } })
    const res = await llamar(get())
    expect(res.code).toBe(403)
  })

  it('un admin entra', async () => {
    escenario(ADMIN, { ok: true, body: { acreedores: [{ id: 'a', nombre: 'Contador', saldo: 10 }] } })
    const res = await llamar(get())
    expect(res.code).toBe(200)
    expect((res.body as { acreedores: unknown[] }).acreedores).toHaveLength(1)
    expect((res.body as { aviso: unknown }).aviso).toBeNull()
  })

  it('sin sesión no pasa', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ ok: false }) })) as unknown as typeof fetch)
    const res = await llamar(get())
    expect(res.code).toBe(403)
  })

  it('solo se lee: un POST se rechaza', async () => {
    const res = await llamar({ ...get(), method: 'POST' })
    expect(res.code).toBe(405)
  })
})

describe('cuando el dashboard no contesta', () => {
  it('la sección se queda sin los montos, no sin pantalla', async () => {
    escenario(ADMIN, { ok: false })
    const res = await llamar(get())
    expect(res.code).toBe(200) // ⛔ no 502: la pantalla se tiene que poder dibujar igual
    expect((res.body as { acreedores: unknown[] }).acreedores).toEqual([])
    expect((res.body as { aviso: string }).aviso).toMatch(/No se pudo leer la deuda/)
  })

  it('si el dashboard explica el motivo, ese motivo es el que se muestra', async () => {
    escenario(ADMIN, { ok: false, status: 503, body: { error: 'La puerta no está configurada.' } })
    const res = await llamar(get())
    expect(res.code).toBe(200)
    expect((res.body as { aviso: string }).aviso).toContain('La puerta no está configurada.')
  })

  it('sin la credencial cargada avisa cuál falta, en vez de golpear la puerta', async () => {
    delete process.env.DASHBOARD_PUENTE_SECRET
    escenario(ADMIN, { ok: true, body: { acreedores: [] } })
    const res = await llamar(get())
    expect(res.code).toBe(200)
    expect((res.body as { aviso: string }).aviso).toMatch(/DASHBOARD_PUENTE_SECRET/)
  })

  it('si el dashboard devuelve cualquier cosa, no se rompe: lista vacía', async () => {
    escenario(ADMIN, { ok: true, body: { cualquier: 'cosa' } })
    const res = await llamar(get())
    expect(res.code).toBe(200)
    expect((res.body as { acreedores: unknown[] }).acreedores).toEqual([])
  })
})

describe('la credencial', () => {
  it('viaja en el header y NO en la URL', async () => {
    const espia = vi.fn(async (url: string, _init?: { headers?: Record<string, string> }) => (
      String(url).includes('bdi-catalogo.vercel.app/api/usuarios')
        ? { ok: true, json: async () => ({ ok: true, perfil: ADMIN }) }
        : { ok: true, status: 200, json: async () => ({ acreedores: [] }), text: async () => '{}' }
    ))
    vi.stubGlobal('fetch', espia as unknown as typeof fetch)
    await llamar(get())
    const alDashboard = espia.mock.calls.find((c) => String(c[0]).includes('dashboard-de-prueba'))
    expect(alDashboard).toBeTruthy()
    const [url, init] = alDashboard!
    expect(String(url)).not.toContain('x'.repeat(64))
    expect(init?.headers?.['x-puente-auth']).toBe('x'.repeat(64))
  })
})
