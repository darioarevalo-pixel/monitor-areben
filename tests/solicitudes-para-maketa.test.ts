import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { esLlaveDeMaketa, paraMaketa } from '@/lib/solicitudes/para-maketa.core.js'

/**
 * **La puerta de sólo lectura de Maketa** (6-oct-2026). 📌 `lib/solicitudes/para-maketa.core.js`.
 *
 * 🔴 Lo que importa es lo que ⛔ deja hacer: con la llave ⛔ se escribe ni se borra, ⛔ se leen las
 * solicitudes internas, y sin la variable configurada ⛔ entra nadie.
 */

type Filtro = { metodo: 'eq' | 'in' | 'gte'; campo: string; valor: unknown }
let filtros: Filtro[] = []
let filas: { kind: string; datos: Record<string, unknown> }[] = []
let escrituras = 0

vi.mock('@/api/_agenda.js', () => ({ sembrarEnMaestra: async () => ({ creados: 0, ya: false }) }))
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => {
    const q: Record<string, unknown> = {}
    q.select = () => q
    q.eq = (campo: string, valor: unknown) => (filtros.push({ metodo: 'eq', campo, valor }), q)
    q.in = (campo: string, valor: unknown) => (filtros.push({ metodo: 'in', campo, valor }), q)
    q.gte = (campo: string, valor: unknown) => (filtros.push({ metodo: 'gte', campo, valor }), q)
    q.order = () => q
    q.limit = async () => ({ data: filas, error: null })
    q.upsert = async () => (escrituras++, { data: null, error: null })
    q.delete = () => (escrituras++, q)
    return { from: () => q }
  },
}))

function resFalso() {
  const r = {
    code: 0,
    body: null as Record<string, unknown> | null,
    setHeader() {},
    status(c: number) {
      r.code = c
      return r
    },
    json(b: unknown) {
      r.body = b as Record<string, unknown>
      return r
    },
    end() {
      return r
    },
  }
  return r
}

async function llamar(metodo: 'GET' | 'POST', llave: string | undefined, query: Record<string, string>, body?: unknown) {
  const mod = await import('@/api/_solicitudes.js')
  const res = resFalso()
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (llave !== undefined) headers['x-maketa-llave'] = llave
  await (mod.default as (q: unknown, s: typeof res) => Promise<unknown>)({ method: metodo, headers, query, body }, res)
  return res
}

const login = vi.fn(async () => ({ ok: true, json: async () => ({ ok: false }) }))

beforeEach(() => {
  filtros = []
  filas = []
  escrituras = 0
  login.mockClear()
  vi.stubEnv('SUPABASE_URL', 'https://bdi.supabase.co')
  vi.stubEnv('SUPABASE_SERVICE_KEY', 'k')
  vi.stubEnv('ZATTIA_SUPABASE_URL', 'https://zattia.supabase.co')
  vi.stubEnv('ZATTIA_SUPABASE_SERVICE_KEY', 'k')
  vi.stubEnv('MAKETA_LLAVE', 'la-llave-buena')
  vi.stubGlobal('fetch', login)
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('la llave', () => {
  it('la buena entra, otra ⛔', () => {
    expect(esLlaveDeMaketa('abc', 'abc')).toBe(true)
    expect(esLlaveDeMaketa('abd', 'abc')).toBe(false)
    expect(esLlaveDeMaketa('ab', 'abc')).toBe(false)
  })

  it('🔴 sin llave configurada ⛔ entra nadie, ni la vacía', () => {
    expect(esLlaveDeMaketa('', '')).toBe(false)
    expect(esLlaveDeMaketa('algo', undefined)).toBe(false)
  })
})

describe('el handler con la llave de Maketa', () => {
  it('lee las sesiones de fotos, sin pasar por el login, y recorta desde la fecha', async () => {
    filas = [{ kind: 'sesionfotos', datos: { id: 's1', fecha: '2026-10-08', creadoPor: 'Lorena Reyes', items: [] } }]
    const res = await llamar('GET', 'la-llave-buena', { store: 'zattia', desde: '2026-10-06' })
    expect(res.code).toBe(200)
    expect(login).not.toHaveBeenCalled()
    expect(filtros).toContainEqual({ metodo: 'in', campo: 'kind', valor: ['sesionfotos', 'sesion-evento'] })
    expect(filtros).toContainEqual({ metodo: 'gte', campo: 'fecha', valor: '2026-10-06' })
    expect((res.body?.list as { id: string }[])[0]?.id).toBe('s1')
  })

  it('⛔ con la llave equivocada, 403 y ⛔ cae al login', async () => {
    const res = await llamar('GET', 'otra', { store: 'zattia' })
    expect(res.code).toBe(403)
    expect(login).not.toHaveBeenCalled()
  })

  it('🔴 ⛔ con la llave NO se escribe ni se borra', async () => {
    const guardar = await llamar('POST', 'la-llave-buena', {}, { store: 'zattia', kind: 'sesionfotos', solicitud: { id: 'x' } })
    const borrar = await llamar('POST', 'la-llave-buena', {}, { store: 'zattia', action: 'eliminar', id: 'x' })
    expect(guardar.code).toBe(405)
    expect(borrar.code).toBe(405)
    expect(escrituras).toBe(0)
  })

  it('una marca inventada da 400', async () => {
    expect((await llamar('GET', 'la-llave-buena', { store: 'otra' })).code).toBe(400)
  })

  it('sin el header, la puerta de siempre: pide login', async () => {
    const res = await llamar('GET', undefined, { store: 'zattia' })
    expect(res.code).toBe(403)
  })
})

describe('lo que viaja', () => {
  it('🔑 ⛔ salen las ventas, la verificación ni los ids de Tienda Nube', () => {
    const p = paraMaketa('zattia', 'sesionfotos', {
      id: 's1',
      fecha: '2026-10-08',
      descripcion: ' SESION EXTERIOR ',
      creadoPor: 'Sofia Facello',
      estado: 'pendiente',
      ventas: [{ cliente: 'x' }],
      verif: { a: 1 },
      items: [{ pid: '1', vid: '1_2', sku: 'RRE-1', nombre: 'TOP MIA', variante: 'S', qty: 2, origen: 'local', stockLoc: 3 }],
    })
    expect(p).toEqual({
      id: 's1',
      marca: 'zattia',
      kind: 'sesionfotos',
      fecha: '2026-10-08',
      hora: null,
      duracionMin: null,
      descripcion: 'SESION EXTERIOR',
      estado: 'pendiente',
      creadoPor: 'Sofia Facello',
      eventoId: null,
      modelo: null,
      prendas: [{ nombre: 'TOP MIA', variante: 'S', cantidad: 2, origen: 'local' }],
    })
  })
})
