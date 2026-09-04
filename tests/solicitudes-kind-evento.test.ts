import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * **El `kind` nuevo `sesion-evento` en la puerta del cajón** (Fase 2 del octavo, 4-sep-2026).
 *
 * Tres cosas que ⛔ ningún test del núcleo puede ver, porque pasan en el handler:
 *
 * 1. 🔴 **El GET sin `kind` tiene que seguir devolviendo lo que devolvía**: sólo solicitudes. Ese
 *    llamado siempre significó «todo el historial de la marca», y un evento ⛔ no tiene `items` —
 *    el que lo recibiera como solicitud se rompe en el primer `s.items.length`. Hoy ⛔ ningún
 *    llamador lo omite, y por eso el guard va con test: el día que alguien lo omita, ⛔ no va a
 *    leer este comentario.
 * 2. **Un evento se guarda, y desde la Fase 5 (4-sep-2026) SIEMBRA él** — antes ⛔ no sembraba
 *    nadie por el evento y lo hacía cada hija. Acá va sólo que la puerta lo deja pasar y que **sin
 *    origen ⛔ no siembra**; la regla entera —la hija que ⛔ no repite, la clave nueva, la hora en
 *    el título— vive en `tests/solicitudes-siembra.test.ts`, que es donde se prueba la siembra.
 * 3. La lista blanca sigue siendo una lista blanca: un kind inventado sigue dando 400.
 */

const sembrados: unknown[] = []
vi.mock('@/api/_agenda.js', () => ({
  sembrarEnMaestra: async (opts: unknown) => {
    sembrados.push(opts)
    return { creados: 9, ya: false }
  },
}))

/** Lo que la consulta fue filtrando, para poder preguntarle al final por qué kinds pidió. */
type Filtro = { metodo: 'eq' | 'in'; campo: string; valor: unknown }
let filtros: Filtro[] = []
const upserts: Record<string, unknown>[][] = []

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => {
    const q: Record<string, unknown> = {}
    q.select = () => q
    q.eq = (campo: string, valor: unknown) => {
      filtros.push({ metodo: 'eq', campo, valor })
      return q
    }
    q.in = (campo: string, valor: unknown) => {
      filtros.push({ metodo: 'in', campo, valor })
      return q
    }
    q.order = () => q
    q.limit = async () => ({ data: [], error: null })
    q.upsert = async (filas: Record<string, unknown>[]) => {
      upserts.push(filas)
      return { data: null, error: null }
    }
    q.delete = () => q
    return { from: () => q }
  },
}))

function resFalso() {
  const r = {
    code: 0 as number,
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

const sobre = (d: unknown) => Buffer.from(JSON.stringify(d), 'utf8').toString('base64')
const ADMIN = { name: 'Sofia Facello', admin: true, cuenta: null, acceso: {}, funcion: [] }

async function llamar(metodo: 'GET' | 'POST', query: Record<string, string>, body?: unknown) {
  const mod = await import('@/api/_solicitudes.js')
  const res = resFalso()
  await (mod.default as (q: unknown, s: typeof res) => Promise<unknown>)(
    {
      method: metodo,
      headers: { 'x-monitor-auth': sobre({ user: 'sofi', pass: 'p' }), 'content-type': 'application/json' },
      query,
      body,
    },
    res,
  )
  return res
}

const evento = {
  id: 'ev1',
  fecha: '2026-09-12',
  creado: 1_780_000_000_000,
  creadoPor: 'Sofia Facello',
  descripcion: 'Primavera-verano',
  estado: 'planificado',
}

beforeEach(() => {
  sembrados.length = 0
  upserts.length = 0
  filtros = []
  vi.stubEnv('SUPABASE_URL', 'https://bdi.supabase.co')
  vi.stubEnv('SUPABASE_SERVICE_KEY', 'k')
  vi.stubEnv('ZATTIA_SUPABASE_URL', 'https://zattia.supabase.co')
  vi.stubEnv('ZATTIA_SUPABASE_SERVICE_KEY', 'k')
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ ok: true, perfil: ADMIN }) })))
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('🔴 el GET sin `kind` sigue significando «las solicitudes», ⛔ no «todo»', () => {
  it('sin kind, filtra por los DOS kinds de solicitud y ⛔ no trae eventos', async () => {
    const res = await llamar('GET', { store: 'bdi' })
    expect(res.code).toBe(200)
    const porKind = filtros.filter((f) => f.campo === 'kind')
    expect(porKind).toEqual([{ metodo: 'in', campo: 'kind', valor: ['sesionfotos', 'solicitudesinternas'] }])
  })

  it('con kind, filtra por ese y nada más', async () => {
    await llamar('GET', { store: 'bdi', kind: 'sesion-evento' })
    expect(filtros.filter((f) => f.campo === 'kind')).toEqual([{ metodo: 'eq', campo: 'kind', valor: 'sesion-evento' }])
  })

  it('los dos kinds viejos siguen entrando', async () => {
    for (const k of ['sesionfotos', 'solicitudesinternas']) {
      filtros = []
      const res = await llamar('GET', { store: 'bdi', kind: k })
      expect(res.code).toBe(200)
      expect(filtros.filter((f) => f.campo === 'kind')).toEqual([{ metodo: 'eq', campo: 'kind', valor: k }])
    }
  })

  it('la lista blanca sigue siendo blanca', async () => {
    const res = await llamar('GET', { store: 'bdi', kind: 'sesion-eventos' })
    expect(res.code).toBe(400)
  })
})

describe('guardar un evento', () => {
  it('entra por la misma puerta, con el mismo permiso', async () => {
    const res = await llamar('POST', {}, { store: 'bdi', kind: 'sesion-evento', solicitud: evento })
    expect(res.code).toBe(200)
    expect(upserts).toHaveLength(1)
    expect(upserts[0][0]).toMatchObject({ id: 'ev1', store: 'bdi', kind: 'sesion-evento', estado: 'planificado', fecha: '2026-09-12' })
    // El documento entero viaja en `datos`: por eso hora, duración y modelo ⛔ no necesitan columna.
    expect(upserts[0][0].datos).toEqual(evento)
  })

  it('🆕 con origen SIEMBRA él (Fase 5), y con la clave de su propio espacio de nombres', async () => {
    await llamar('POST', {}, { store: 'bdi', kind: 'sesion-evento', solicitud: { ...evento, disparador: 'campania' } })
    expect(sembrados).toHaveLength(1)
    expect(sembrados[0]).toMatchObject({ clave: 'sesion-fotos·evento:ev1', marca: 'bdi', eje: 'campania' })
  })

  it('🔴 sin origen ⛔ no siembra, y el evento se guarda igual', async () => {
    // El alta ofrece «Sin definir» a propósito: de dónde viene la sesión decide de quién es cada
    // paso, así que sembrar «igual» deja nueve renglones con la dueña equivocada.
    const res = await llamar('POST', {}, { store: 'bdi', kind: 'sesion-evento', solicitud: evento })
    expect(res.code).toBe(200)
    expect(sembrados).toEqual([])
    expect(upserts).toHaveLength(1)
  })

  it('un kind inventado no guarda nada', async () => {
    const res = await llamar('POST', {}, { store: 'bdi', kind: 'sesion-evento-x', solicitud: evento })
    expect(res.code).toBe(400)
    expect(upserts).toEqual([])
  })
})
