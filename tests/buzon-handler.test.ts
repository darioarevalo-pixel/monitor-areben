import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * El buzón guarda **correspondencia de clientes**: nombre, mail y lo que escribió una persona.
 *
 * Por eso su handler va un paso más allá que el de Envíos, que no valida marca en la puerta: acá la
 * lista se recorta a las marcas del perfil, y escribir en una marca que no se ve se corta con 403.
 * Lo que fija este archivo es el caso que ninguna pantalla muestra: el `store` mandado a mano en el
 * body por un puesto clavado a la otra marca.
 */

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => { throw new Error('LLEGÓ A LA BASE') },
}))

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

function sesionDe(perfil: unknown) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => (
    String(url).includes('bdi-catalogo.vercel.app/api/usuarios')
      ? { ok: true, json: async () => ({ ok: true, perfil }) }
      : { ok: true, status: 200, headers: { get: () => null }, json: async () => ({ data: [] }), text: async () => '{"data":[]}' }
  )) as unknown as typeof fetch)
}

const post = (body: Record<string, unknown>) => ({
  method: 'POST',
  headers: { 'x-monitor-auth': sobre({ user: 'Alguien', pass: 'p' }) },
  query: {},
  body,
})

async function llamar(req: unknown) {
  const mod = await import('@/api/_buzon.js')
  const res = resFalso()
  await (mod.default as (q: unknown, s: typeof res) => Promise<unknown>)(req, res)
  return res
}

const CLAVADA_A_ZATTIA = {
  name: 'Local Zattia',
  admin: false,
  cuenta: 'zattia',
  acceso: { bdi: { buzon: true }, zattia: { buzon: true } },
  funcion: [],
}

beforeEach(() => {
  vi.resetModules()
  vi.stubEnv('SUPABASE_URL', 'puesto-para-que-no-corte-antes')
  vi.stubEnv('SUPABASE_SERVICE_KEY', 'puesto-para-que-no-corte-antes')
})
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks() })

describe('la cuenta fija manda también acá', () => {
  it('🔴 clavada a Zattia y con «buzon» en las dos: no puede escribir un mensaje de BDI', async () => {
    sesionDe(CLAVADA_A_ZATTIA)
    const res = await llamar(post({ action: 'guardar', mensaje: { store: 'bdi', cuerpo: 'hola' } }))
    expect(res.code).toBe(403)
  })

  it('el mismo perfil SÍ escribe el de Zattia — si no, lo de arriba estaría verde por prohibir todo', async () => {
    sesionDe(CLAVADA_A_ZATTIA)
    let code = 0
    try { code = (await llamar(post({ action: 'guardar', mensaje: { store: 'zattia', cuerpo: 'hola' } }))).code } catch (e) {
      expect(String(e)).toContain('LLEGÓ A LA BASE')
      return
    }
    expect(code).not.toBe(403)
  })
})

describe('lo que el handler no deja pasar antes de tocar la base', () => {
  const SUELTA = { name: 'Suelta', admin: false, cuenta: null, acceso: { bdi: { buzon: true } }, funcion: [] }

  it('un mensaje vacío no entra', async () => {
    sesionDe(SUELTA)
    const res = await llamar(post({ action: 'guardar', mensaje: { store: 'bdi', cuerpo: '  ' } }))
    expect(res.code).toBe(400)
  })

  it('una marca inventada no entra', async () => {
    sesionDe(SUELTA)
    const res = await llamar(post({ action: 'guardar', mensaje: { store: 'stunned', cuerpo: 'hola' } }))
    expect(res.code).toBe(400)
  })

  it('🔴 resolver SIN decir qué se hizo no entra: un tilde sin acción no lo puede leer nadie después', async () => {
    sesionDe(SUELTA)
    const res = await llamar(post({ action: 'resolver', id: 'b1', accion: '   ' }))
    expect(res.code).toBe(400)
  })

  it('una acción desconocida no cae en ninguna rama por descarte', async () => {
    sesionDe(SUELTA)
    const res = await llamar(post({ action: 'inventada', id: 'b1' }))
    expect(res.code).toBe(400)
  })
})
