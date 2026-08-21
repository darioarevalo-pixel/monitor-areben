import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * `api/_disenos-votacion.js` es **lo único de Diseños abierto a internet**: se entra con un token,
 * sin sesión, desde un celular.
 *
 * Lo que fija este archivo es lo que no se ve en ninguna pantalla:
 *   1. Que un token con forma inválida muera en 404 **antes de tocar la base**. Un gate que
 *      contesta después de consultar ya convirtió el link en un oráculo de tiempos, y de paso
 *      deja que cualquiera con un script haga latir la base.
 *   2. Que el 404 sea **pelado y siempre el mismo**. Si "no existe" y "se cerró" contestaran
 *      distinto, el link serviría para averiguar qué rondas hubo.
 */

// Si el gate no corta, esto tira y el test se cae con un mensaje que dice exactamente qué pasó.
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => { throw new Error('LLEGÓ A LA BASE — el gate no cortó') },
}))

function resFalso() {
  const r = {
    code: 0 as number,
    body: null as Record<string, unknown> | null,
    headers: {} as Record<string, string>,
    setHeader(k: string, v: string) { r.headers[k.toLowerCase()] = String(v) },
    status(c: number) { r.code = c; return r },
    json(b: unknown) { r.body = b as Record<string, unknown>; return r },
    end() { return r },
  }
  return r
}

async function llamar(req: unknown) {
  const mod = await import('@/api/_disenos-votacion.js')
  const res = resFalso()
  await (mod.default as (q: unknown, s: typeof res) => Promise<unknown>)(req, res)
  return res
}

beforeEach(() => {
  vi.resetModules()
  for (const v of ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'ZATTIA_SUPABASE_URL', 'ZATTIA_SUPABASE_SERVICE_KEY']) {
    vi.stubEnv(v, 'puesto-para-que-no-corte-antes')
  }
})
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks() })

/** Todo lo que no tiene forma de token de este repo (64 hex). */
const MALOS: [string, unknown][] = [
  ['sin token', undefined],
  ['vacío', ''],
  ['el id numérico de la ronda', '42'],
  ['demasiado corto', 'abc123'],
  ['con caracteres que no son hex', 'z'.repeat(64)],
  ['con un path adentro', '../../etc/passwd'],
  ['un SQL', "' or 1=1 --"],
  ['un objeto', { id: 1 }],
  ['un booleano', true],
  ['una lista de basura', ['x', 'y']],
  ['64 hex con un caracter de más pegado', 'a'.repeat(64) + '!'],
]

describe('el token inválido muere antes de la base', () => {
  for (const [comoEs, token] of MALOS) {
    it(`GET con un token ${comoEs} → 404 sin consultar`, async () => {
      const res = await llamar({ method: 'GET', query: { token }, headers: {} })
      expect(res.code).toBe(404)
    })
    it(`POST con un token ${comoEs} → 404 sin consultar`, async () => {
      const res = await llamar({ method: 'POST', body: { token, votanteId: 'v1', puntajes: { a: 5 } }, headers: {} })
      expect(res.code).toBe(404)
    })
  }
})

describe('el 404 no cuenta nada', () => {
  it('es el mismo cuerpo, exacto, para cualquier link que no sirve', async () => {
    const a = await llamar({ method: 'GET', query: { token: '42' }, headers: {} })
    const b = await llamar({ method: 'GET', query: { token: 'z'.repeat(64) }, headers: {} })
    expect(a.body).toEqual({ error: 'no encontrado' })
    expect(b.body).toEqual(a.body)
  })

  it('no se cachea: la respuesta cambia cuando cambia la ronda', async () => {
    const res = await llamar({ method: 'GET', query: { token: '42' }, headers: {} })
    expect(res.headers['cache-control']).toBe('no-store')
  })
})
