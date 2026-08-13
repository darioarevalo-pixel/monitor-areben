import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * La sonda `?recurso=sistema&vista=credenciales`, ejercida como handler y no sólo como función.
 *
 * El molde es el de `tests/handlers-autorizacion.test.ts`, y la mitad que importa es la misma: que
 * el 403 salga **antes de tocar la base**. Acá suma una razón propia — esta ruta existe para poder
 * contestar cuando la base es justamente el problema, así que si dependiera de `createClient` sería
 * inútil el día que se la necesita.
 *
 * Lo que no se puede probar acá es qué tiene Vercel adentro: eso lo contesta abrir la pantalla en
 * producción. Lo que sí queda amarrado es que la pregunta llegue, que sólo la conteste un admin, y
 * que la respuesta no lleve claves.
 */

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => { throw new Error('LLEGÓ A LA BASE — la sonda no tenía que necesitarla') },
}))

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

function sesionDe(perfil: unknown) {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ ok: true, perfil }) })))
}

const pedido = () => ({
  method: 'GET',
  headers: { 'x-monitor-auth': sobre({ user: 'Quien', pass: 'p' }) },
  query: { recurso: 'sistema', vista: 'credenciales' },
  body: {},
})

const jwt = (payload: object) => `xxx.${Buffer.from(JSON.stringify(payload)).toString('base64')}.yyy`
const SERVICIO_BDI = jwt({ role: 'service_role', ref: 'refbdi' })
const ANON_ZAT = jwt({ role: 'anon', ref: 'refzat' })

const ADMIN = { name: 'Bruno', admin: true, cuenta: null, acceso: {}, funcion: [] }
/** Alguien real del equipo, con permisos de sobra pero sin ser admin. */
const NO_ADMIN = { name: 'Local', admin: false, cuenta: null, acceso: { bdi: { novedades: true, usuarios: true } }, funcion: [] }

async function llamar(req: unknown) {
  const mod = await import('@/api/_sistema.js')
  const res = resFalso()
  await (mod.default as (q: unknown, s: typeof res) => Promise<unknown>)(req, res)
  return res
}

beforeEach(() => {
  vi.resetModules()
  // El estado que motivó todo esto, puesto a mano: BDI con service key, Zattia sin ella.
  vi.stubEnv('SUPABASE_URL', 'https://refbdi.supabase.co')
  vi.stubEnv('SUPABASE_SERVICE_KEY', SERVICIO_BDI)
  vi.stubEnv('ZATTIA_SUPABASE_URL', 'https://refzat.supabase.co')
  vi.stubEnv('ZATTIA_SUPABASE_KEY', ANON_ZAT)
  vi.stubEnv('ZATTIA_SUPABASE_SERVICE_KEY', '')
})
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks() })

describe('sonda de credenciales', () => {
  it('sin sesión: 403', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ ok: false }) })))
    expect((await llamar(pedido())).code).toBe(403)
  })

  it('con sesión pero sin ser admin: 403, y sin tocar la base', async () => {
    sesionDe(NO_ADMIN)
    const res = await llamar(pedido())
    expect(res.code).toBe(403)
  })

  it('admin: contesta el diagnóstico SIN tocar la base', async () => {
    // Si la sonda pidiera un cliente de Supabase, el mock de arriba tira y el test se cae diciendo
    // por qué. Que conteste 200 es también la prueba de que va antes que `cfgMaestra()`.
    sesionDe(ADMIN)
    const res = await llamar(pedido())
    expect(res.code).toBe(200)
    const d = res.body?.credenciales as { listoParaRls: boolean; marcas: { marca: string; efectivo: string; listoParaRls: boolean }[] }
    expect(d.marcas.map((m) => m.marca)).toEqual(['bdi', 'zattia'])
    expect(d.marcas.find((m) => m.marca === 'bdi')!.listoParaRls).toBe(true)
    expect(d.marcas.find((m) => m.marca === 'zattia')!.efectivo).toBe('anon')
    expect(d.listoParaRls).toBe(false)
  })

  it('⛔ la respuesta del handler no lleva ninguna clave', async () => {
    sesionDe(ADMIN)
    const res = await llamar(pedido())
    const txt = JSON.stringify(res.body)
    expect(txt).not.toContain(SERVICIO_BDI)
    expect(txt).not.toContain(SERVICIO_BDI.slice(0, 12))
  })

  it('la sonda no se come el GET normal de novedades', async () => {
    // Sin `vista=credenciales` el handler tiene que seguir su camino de siempre — o sea, llegar a
    // la base. El mock tirando es la prueba de que no lo desvió.
    sesionDe(ADMIN)
    await expect(llamar({ ...pedido(), query: { recurso: 'sistema' } })).rejects.toThrow('LLEGÓ A LA BASE')
  })
})
