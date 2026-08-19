import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * La cola de Redacción tiene DOS niveles de permiso, y la línea está donde está el costo:
 * cargar el **insumo** («gasa, botones nacarados») lo hace el local y sólo pide la sección;
 * escribir y **aprobar** un borrador pide el sub `publicar`, porque de ahí en adelante el
 * texto sale a la tienda en vivo.
 *
 * Es una regla que no se ve en ninguna pantalla —las dos personas ven la misma— y que se
 * rompe sola en cuanto alguien mueve un `if`. Por eso está acá.
 */

const llamadas: string[] = []
/** Lo último que se mandó a escribir. Es lo que permite mirar QUÉ quedó, no sólo que no falló. */
let escrito: Record<string, unknown> | null = null
/** Lo que la base contesta al buscar la fila. `null` = la fila existe pero sin borrador. */
let filaGuardada: Record<string, unknown> | null = { borrador: { parrafo: 'x', bullets: [] } }

function tabla() {
  const q: Record<string, unknown> = {
    select: () => q, eq: () => q, order: () => q,
    maybeSingle: async () => ({ data: filaGuardada, error: null }),
    upsert: async (fila: Record<string, unknown>) => { llamadas.push('upsert'); escrito = fila; return { error: null } },
    update: (fila: Record<string, unknown>) => { llamadas.push('update'); escrito = fila; return q },
    delete: () => { llamadas.push('delete'); return q },
    then: (r: (v: unknown) => void) => r({ data: [], error: null }),
  }
  return q
}

vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from: () => tabla() }) }))

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

/** Alguien del local: ve Redacción en Zattia, pero NO puede aprobar. */
const LOCAL = { name: 'Local', admin: false, cuenta: null, acceso: { zattia: { 'gen-desc': true } }, funcion: [] }
/**
 * Marketing: la misma sección, más el sub que habilita publicar.
 * 🔑 Los subs se guardan PLANOS (`gen-desc.publicar`), no anidados — `puedeSub` es
 * literalmente `puedeVer(perfil, marca, 'key.sub')`. Anidarlo deja la sección visible y el
 * sub apagado, que es un modo de falla silencioso y verosímil.
 */
const MKT = {
  name: 'Marta', admin: false, cuenta: null,
  acceso: { zattia: { 'gen-desc': true, 'gen-desc.publicar': true } },
  funcion: [],
}

const post = (body: Record<string, unknown>) => ({
  method: 'POST',
  headers: { 'x-monitor-auth': sobre({ user: 'x', pass: 'p' }) },
  query: {},
  body: { recurso: 'tn-desc', store: 'zattia', tn_id: '123', ...body },
})

async function llamar(req: unknown) {
  const mod = await import('@/api/_tn-desc.js')
  const res = resFalso()
  await (mod.default as (q: unknown, s: typeof res) => Promise<unknown>)(req, res)
  return res
}

beforeEach(() => {
  llamadas.length = 0
  escrito = null
  filaGuardada = { borrador: { parrafo: 'x', bullets: [] } }
  vi.resetModules()
  vi.stubEnv('ZATTIA_SUPABASE_URL', 'https://x.supabase.co')
  vi.stubEnv('ZATTIA_SUPABASE_SERVICE_KEY', 'no-es-un-jwt-asi-que-no-se-opina')
})
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks() })

describe('el local carga el insumo sin poder publicar', () => {
  it('🔑 `insumo` NO pide el permiso de aprobar: es la tarea del local', async () => {
    sesionDe(LOCAL)
    const res = await llamar(post({ op: 'insumo', insumo: 'gasa, botones nacarados' }))
    expect(res.code).toBe(200)
    expect(llamadas).toContain('upsert')
  })

  it('pero NO puede escribir el borrador, ni aprobarlo, ni sacar la fila', async () => {
    for (const op of ['borrador', 'aprobar', 'quitar']) {
      sesionDe(LOCAL)
      const res = await llamar(post({ op, borrador: { parrafo: 'x', bullets: [] } }))
      expect(res.code, `op ${op}`).toBe(403)
    }
    // ⛔ Y ninguna de las tres llegó a escribir: el 403 sale ANTES de tocar la base.
    expect(llamadas).toEqual([])
  })
})

describe('marketing sí', () => {
  it('con el sub `publicar` escribe el borrador y aprueba', async () => {
    sesionDe(MKT)
    expect((await llamar(post({ op: 'borrador', borrador: { parrafo: 'x', bullets: [] } }))).code).toBe(200)
    sesionDe(MKT)
    expect((await llamar(post({ op: 'aprobar' }))).code).toBe(200)
  })

  it('un borrador que no tiene la forma esperada se rechaza en la frontera', async () => {
    sesionDe(MKT)
    const res = await llamar(post({ op: 'borrador', borrador: 'un texto suelto' }))
    expect(res.code).toBe(400)
    expect(llamadas).toEqual([])
  })

  it('una op desconocida muere en 400 y no escribe nada', async () => {
    sesionDe(MKT)
    const res = await llamar(post({ op: 'publicar-en-tn' }))
    expect(res.code).toBe(400)
    expect(String(res.body?.error)).toContain('op desconocida')
    expect(llamadas).toEqual([])
  })

  it('🔑 un borrador NUEVO desaprueba el anterior', async () => {
    // Si no, quedaría «aprobado» un texto que nadie leyó, con la firma y la fecha de quien
    // aprobó el que estaba antes — y esa fila diría «listo para publicar» mintiendo.
    sesionDe(MKT)
    await llamar(post({ op: 'borrador', borrador: { parrafo: 'otro', bullets: [] } }))
    expect(escrito?.estado).toBe('borrador')
    expect(escrito?.aprobado_por).toBeNull()
    expect(escrito?.aprobado_at).toBeNull()
  })

  it('🔑 la firma sale del PERFIL, no del body', async () => {
    // Si saliera del POST, el rastro de quién aprobó un texto que salió a la tienda se podría
    // firmar con el nombre de otro cambiando un campo. Es el molde de `api/_canjes.js`.
    sesionDe(MKT)
    await llamar(post({ op: 'insumo', insumo: 'gasa', usuario: 'Otro Cualquiera', insumo_por: 'Otro Cualquiera' }))
    expect(escrito?.insumo_por).toBe('Marta')
    sesionDe(MKT)
    await llamar(post({ op: 'aprobar', usuario: 'Otro Cualquiera', aprobado_por: 'Otro Cualquiera' }))
    expect(escrito?.aprobado_por).toBe('Marta')
  })

  it('⛔ no se aprueba lo que no está: sin borrador guardado, 400 y sin sellar', async () => {
    // Sin esto la fila quedaría en «aprobado», con firma y fecha, sobre un campo vacío — o sea
    // diciendo «listo para publicar» de algo que nadie escribió.
    filaGuardada = { borrador: null }
    sesionDe(MKT)
    const res = await llamar(post({ op: 'aprobar' }))
    expect(res.code).toBe(400)
    expect(llamadas).not.toContain('update')
  })

  it('sin tn_id no hace nada', async () => {
    sesionDe(MKT)
    const res = await llamar({ ...post({ op: 'insumo' }), body: { recurso: 'tn-desc', store: 'zattia', op: 'insumo' } })
    expect(res.code).toBe(400)
    expect(llamadas).toEqual([])
  })
})
