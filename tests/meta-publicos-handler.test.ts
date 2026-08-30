import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * El HANDLER de `?recurso=publicos` — fría vs remarketing.
 *
 * 🔑 **Existe por la lección que dejó el respaldo del Embudo esta misma mañana**: probar el núcleo
 * ⛔ no prueba ninguna de las decisiones de quien lo llama. Acá el handler decide tres cosas que
 * `publicos.core.js` ⛔ no puede ver:
 *
 * 1. **Qué pasa cuando Graph ⛔ no contesta.** Es el único recurso de lectura que NECESITA el token
 *    —el público vive en el `targeting` y la foto ⛔ no lo guarda—, y la respuesta correcta ⛔ no es
 *    un 500 ni un reparto vacío: es el gasto de la ventana (que sí es un hecho) + el motivo.
 * 2. **Que una cuenta caída ⛔ no deje un censo A MEDIAS.** Los conjuntos de esa cuenta caerían en
 *    «sin clasificar» y se leerían como «pausados y archivados», que es otra cosa y manda a mirar a
 *    otro lado.
 * 3. **La cobertura**, que es lo que cambia cómo se lee todo lo demás.
 *
 * Y el gate: la línea la elige **el request**, así que se prueba que el servidor corte.
 */

type Fila = Record<string, unknown>
let FOTO: Fila[] = []
let ERROR_FOTO: string | null = null

function consulta(tabla: string) {
  const filtros: [string, unknown][] = []
  const resolver = async () => {
    if (tabla !== 'meta_ads_snapshot_dia') return { data: [], error: null }
    if (ERROR_FOTO) return { data: null, error: { message: ERROR_FOTO } }
    let f = FOTO
    for (const [col, val] of filtros) f = f.filter((x) => String(x[col]) === String(val))
    return { data: f, error: null }
  }
  const q: Record<string, unknown> = {}
  const igual = () => q
  Object.assign(q, {
    select: igual, gte: igual, lte: igual, order: igual, limit: igual,
    eq: (c: string, v: unknown) => { filtros.push([c, v]); return q },
    in: (c: string, v: unknown[]) => { filtros.push([c, (v || [])[0]]); return q },
    range: () => resolver(),
    then: (ok: (v: unknown) => unknown, no: (e: unknown) => unknown) => resolver().then(ok, no),
  })
  return q
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: (tabla: string) => consulta(tabla) }),
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
const ADMIN = { name: 'Bruno', admin: true, cuenta: null, acceso: {}, funcion: [] }
/** Clavado a Zattia: del lado del servidor la línea la elige el request, así que puede pedir `bdi`. */
const SOLO_ZATTIA = { name: 'Alguien', admin: false, cuenta: 'zattia', acceso: { zattia: { 'meta-ads': true } }, funcion: [] }

const TOKEN_VENCIDO = {
  status: 400,
  body: { error: { code: 190, message: 'Error validating access token: Session has expired' } },
}

function red(perfil: unknown, graph: (url: string) => { status: number; body: unknown }) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const u = String(url)
    if (u.includes('/api/usuarios')) return { ok: true, json: async () => ({ ok: true, perfil }) }
    const r = graph(u)
    return { ok: r.status >= 200 && r.status < 300, status: r.status, headers: { get: () => null }, json: async () => r.body }
  }))
}

async function llamar(query: Record<string, unknown> = {}) {
  const mod = await import('@/api/meta-ads.js')
  const res = resFalso()
  await (mod.default as (q: unknown, s: typeof res) => Promise<unknown>)({
    method: 'GET',
    headers: { 'x-monitor-auth': sobre({ user: 'Bruno', pass: 'p' }) },
    query: { recurso: 'publicos', linea: 'bdi', ...query },
    body: {},
  }, res)
  return res
}

const hace = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10)

const conjunto = (id: string, o: Fila = {}) => ({
  fecha: hace(1), nivel: 'conjunto', objeto_id: id, campaign_id: 'c1', nombre: `CJ ${id}`,
  linea: 'bdi', estado_efectivo: 'ACTIVE', capturado_at: `${hace(0)}T09:00:00Z`,
  spend: 100000, impresiones: 20000, clicks: 500, compras: 10, revenue: 400000, ...o,
})

/** El censo de Graph: dos cuentas, y los adsets con su targeting. */
const graphSano = (adsets: Record<string, unknown[]>) => (u: string) => {
  if (u.includes('me/adaccounts')) return { status: 200, body: { data: [{ account_id: '111' }] } }
  if (u.includes('act_111/adsets')) return { status: 200, body: { data: adsets['111'] || [] } }
  return { status: 200, body: { data: [] } }
}

const conLista = (id: string) => ({ id, targeting: { custom_audiences: [{ id: 'aud' }] } })
const excluyendo = (id: string) => ({ id, targeting: { excluded_custom_audiences: [{ id: 'aud' }] } })
const abierto = (id: string) => ({ id, targeting: { geo_locations: { countries: ['AR'] } } })

beforeEach(() => {
  vi.resetModules()
  FOTO = []
  ERROR_FOTO = null
  for (const v of ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY']) vi.stubEnv(v, 'https://ejemplo.supabase.co')
  vi.stubEnv('META_ADS_TOKEN', 'un-token-vivo')
})
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks() })

describe('el reparto por público, punta a punta', () => {
  it('cruza el targeting de Graph con la plata de la foto', async () => {
    FOTO = [conjunto('a'), conjunto('b', { spend: 300000 }), conjunto('c')]
    red(ADMIN, graphSano({ 111: [conLista('a'), abierto('b'), excluyendo('c')] }))

    const res = await llamar()

    expect(res.code).toBe(200)
    expect(res.body).toMatchObject({ ok: true, clasificado: true, total: 500000, hasta: hace(1) })
    const partes = res.body!.partes as { publico: string; spend: number; parte: number }[]
    const de = (k: string) => partes.find((p) => p.publico === k)!
    expect(de('abierta').spend).toBe(300000)
    expect(de('remarketing').spend).toBe(100000)
    expect(de('fria').spend).toBe(100000)
    // 🔴 Con la mayoría en abierto, el veredicto es que la pregunta ⛔ no se puede contestar.
    expect((res.body!.veredicto as { clase: string }).clase).toBe('no-se-puede-partir')
  })

  it('🔴 con el token vencido ⛔ NO rompe: contesta el gasto de la ventana y dice por qué', async () => {
    FOTO = [conjunto('a'), conjunto('b')]
    red(ADMIN, () => TOKEN_VENCIDO)

    const res = await llamar()

    expect(res.code).toBe(200)
    expect(res.body).toMatchObject({ ok: true, clasificado: false, total: 200000 })
    expect(res.body!.partes).toBeNull()
    expect(String(res.body!.motivo)).toContain('cuentas de Meta')
    expect(String(res.body!.motivo)).toContain('Session has expired')
  })

  it('sin token configurado, lo mismo y el motivo habla del token', async () => {
    FOTO = [conjunto('a')]
    vi.stubEnv('META_ADS_TOKEN', '')
    red(ADMIN, () => { throw new Error('LLEGÓ A GRAPH — sin token ⛔ no tiene que salir a la red') })

    const res = await llamar()

    expect(res.body).toMatchObject({ clasificado: false, total: 100000 })
    expect(String(res.body!.motivo)).toContain('token')
  })

  it('🔴 una cuenta caída ⛔ NO deja un censo a medias: sus conjuntos se leerían como archivados', async () => {
    FOTO = [conjunto('a')]
    red(ADMIN, (u) => {
      if (u.includes('me/adaccounts')) return { status: 200, body: { data: [{ account_id: '111' }, { account_id: '222' }] } }
      if (u.includes('act_111/adsets')) return { status: 200, body: { data: [conLista('a')] } }
      return TOKEN_VENCIDO
    })

    const res = await llamar()

    expect(res.body!.clasificado).toBe(false)
    expect(String(res.body!.motivo)).toContain('222')
  })

  it('la cobertura dice cuántos gastaron sin público leído — cambia cómo se lee el reparto', async () => {
    FOTO = [conjunto('a'), conjunto('zombi')]
    red(ADMIN, graphSano({ 111: [conLista('a')] }))

    const res = await llamar()

    expect(res.body!.cobertura).toMatchObject({ conjuntosEnMeta: 1, conGastoEnLaVentana: 2, sinPublicoLeido: 1 })
    const partes = res.body!.partes as { publico: string; parte: number }[]
    // Su plata queda aparte y ⛔ no infla a los otros tres.
    expect(partes.find((p) => p.publico === 'sin-clasificar')!.parte).toBe(0.5)
  })

  it('un conjunto sin targeting legible queda AFUERA del reparto, y se cuenta aparte', async () => {
    FOTO = [conjunto('a')]
    red(ADMIN, graphSano({ 111: [conLista('a'), { id: 'x' }] }))

    const res = await llamar()

    expect(res.body!.cobertura).toMatchObject({ sinTargeting: 1 })
  })

  it('sin ningún día cerrado lo dice, y ⛔ no dibuja un reparto de un día a medias', async () => {
    FOTO = [conjunto('a', { capturado_at: `${hace(1)}T09:00:00Z` })]
    red(ADMIN, graphSano({ 111: [conLista('a')] }))

    const res = await llamar()

    expect(res.body).toMatchObject({ clasificado: false })
    expect(String(res.body!.motivo)).toContain('ningún día cerrado')
  })

  it('la foto ilegible corta con 502 en vez de un reparto vacío', async () => {
    ERROR_FOTO = 'connection reset'
    red(ADMIN, graphSano({ 111: [] }))

    const res = await llamar()

    expect(res.code).toBe(502)
    expect(String(res.body!.detalle)).toContain('connection reset')
  })
})

describe('el gate: la línea la elige el REQUEST', () => {
  it('🔴 con cuenta fija a Zattia, pedir «bdi» a mano da 403 — en la pantalla no se ve nunca', async () => {
    red(SOLO_ZATTIA, graphSano({ 111: [] }))
    expect((await llamar({ linea: 'bdi' })).code).toBe(403)
  })

  it('y su propia línea pasa', async () => {
    FOTO = [conjunto('a', { linea: 'zattia' })]
    red(SOLO_ZATTIA, graphSano({ 111: [conLista('a')] }))
    expect((await llamar({ linea: 'zattia' })).code).toBe(200)
  })

  it('sin línea, 400 nombrando lo que falta — ⛔ no un reparto de las tres juntas', async () => {
    red(ADMIN, graphSano({ 111: [] }))
    const res = await llamar({ linea: '' })
    expect(res.code).toBe(400)
    expect(String(res.body!.error)).toContain('linea')
  })

  it('una ventana que el servidor ⛔ no sabe contestar es 400, ⛔ no un default en silencio', async () => {
    red(ADMIN, graphSano({ 111: [] }))
    expect((await llamar({ dias: '5' })).code).toBe(400)
  })
})
