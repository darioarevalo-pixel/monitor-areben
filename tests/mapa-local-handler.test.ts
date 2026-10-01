// `api/_mapa-local.js`: quién puede guardar el mapa, qué queda escrito y que ⛔ no se pisa lo de otro.
//
// El `createClient` está mockeado con una base falsa que ANOTA lo que se le pide: el oráculo es la
// fila que se le mandó a la base, ⛔ no lo que contestó el handler.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MAPA_INICIAL } from '../lib/mapa-local/inicial'

type Fila = Record<string, unknown>

const base = {
  fila: null as Fila | null,
  sinTabla: false,
  escrituras: [] as Fila[],
}

const FALTA = { code: 'PGRST205', message: "Could not find the table 'public.mapa_local' in the schema cache" }

function consulta() {
  const q: Record<string, unknown> = {}
  for (const m of ['select', 'eq'] as const) q[m] = () => q
  q.maybeSingle = async () => (base.sinTabla ? { data: null, error: FALTA } : { data: base.fila, error: null })
  q.upsert = async (f: Fila) => {
    base.escrituras.push(f)
    base.fila = f
    return { error: null }
  }
  return q
}

vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from: () => consulta() }) }))

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
const QUE_MIRA = { name: 'camila', admin: false, cuenta: null, acceso: { zattia: { 'mapa-local': true } }, funcion: [] }
const DEL_LOCAL = { name: 'vendedora', admin: false, cuenta: null, acceso: { zattia: { exhib: true } }, funcion: [] }
const NADA = { name: 'otra', admin: false, cuenta: null, acceso: { zattia: { ventas: true } }, funcion: [] }
const QUE_EDITA = { name: 'Bruno Arevalo', admin: false, cuenta: null, acceso: { zattia: { 'mapa-local': true, 'mapa-local.editar': true } }, funcion: [] }

function sesionDe(perfil: unknown) {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ ok: true, perfil }) })))
}

async function correr(req: Record<string, unknown>) {
  const { default: handler } = await import('../api/_mapa-local.js')
  const res = resFalso()
  await (handler as (q: unknown, s: unknown) => Promise<void>)(req, res)
  return res
}

const req = (method: 'GET' | 'POST', body?: Record<string, unknown>, store = 'zattia') => ({
  method,
  headers: { 'x-monitor-auth': sobre({ user: 'x', pass: 'p' }) },
  query: { store },
  body,
})
const copia = () => JSON.parse(JSON.stringify(MAPA_INICIAL))

beforeEach(() => {
  base.fila = null
  base.sinTabla = false
  base.escrituras = []
  process.env.ZATTIA_SUPABASE_URL = 'https://x.supabase.co'
  process.env.ZATTIA_SUPABASE_SERVICE_KEY = 'k'
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('leer', () => {
  it('sin nada guardado devuelve mapa null, y dice si puede editar', async () => {
    sesionDe(QUE_MIRA)
    const r = await correr(req('GET'))
    expect(r.code).toBe(200)
    expect(r.body).toMatchObject({ ok: true, mapa: null, puede: { editar: false } })
  })
  it('sin la tabla (falta la migración) se puede mirar igual', async () => {
    sesionDe(QUE_EDITA)
    base.sinTabla = true
    const r = await correr(req('GET'))
    expect(r.code).toBe(200)
    expect(r.body).toMatchObject({ ok: true, mapa: null, sinTabla: true, puede: { editar: true } })
  })
  it('lo lee quien camina el Chequeo de exhibición (F4), y quien ⛔ no ve ninguna de las dos ⛔ no lo lee', async () => {
    sesionDe(DEL_LOCAL)
    const r = await correr(req('GET'))
    expect(r.code).toBe(200)
    expect(r.body).toMatchObject({ ok: true, puede: { editar: false } })
    sesionDe(NADA)
    expect((await correr(req('GET'))).code).toBe(403)
  })
  it('es sólo de Zattia', async () => {
    sesionDe(QUE_EDITA)
    expect((await correr(req('GET', undefined, 'bdi'))).code).toBe(400)
  })
})

describe('guardar', () => {
  it('quien sólo mira ⛔ no guarda', async () => {
    sesionDe(QUE_MIRA)
    const r = await correr(req('POST', { action: 'guardar', mapa: copia(), base: null }))
    expect(r.code).toBe(403)
    expect(base.escrituras).toHaveLength(0)
  })
  it('quien sólo ve el Chequeo de exhibición ⛔ no guarda', async () => {
    sesionDe(DEL_LOCAL)
    expect((await correr(req('POST', { action: 'guardar', mapa: copia(), base: null }))).code).toBe(403)
    expect(base.escrituras).toHaveLength(0)
  })
  it('guarda el mapa saneado, firmado con la sesión y ⛔ no con el body', async () => {
    sesionDe(QUE_EDITA)
    const m = copia()
    m.modulos[0].extra = 'basura'
    const r = await correr(req('POST', { action: 'guardar', mapa: m, base: null, actualizado_por: 'otro' }))
    expect(r.code).toBe(200)
    expect(base.escrituras).toHaveLength(1)
    const f = base.escrituras[0] as { store: string; mapa: { modulos: Fila[] }; actualizado_por: string }
    expect(f.store).toBe('zattia')
    expect(f.actualizado_por).toBe('Bruno Arevalo')
    expect(f.mapa.modulos[0]).not.toHaveProperty('extra')
  })
  it('un mapa roto ⛔ no se escribe', async () => {
    sesionDe(QUE_EDITA)
    const m = copia()
    m.modulos[3].niveles[0].alturaCm = 50
    const r = await correr(req('POST', { action: 'guardar', mapa: m, base: null }))
    expect(r.code).toBe(400)
    expect(base.escrituras).toHaveLength(0)
  })
  it('si otro guardó en el medio contesta 409 y ⛔ no pisa', async () => {
    sesionDe(QUE_EDITA)
    base.fila = { store: 'zattia', mapa: MAPA_INICIAL, actualizado_en: '2026-09-30T20:00:00.000Z' }
    const viejo = await correr(req('POST', { action: 'guardar', mapa: copia(), base: null }))
    expect(viejo.code).toBe(409)
    const alDia = await correr(req('POST', { action: 'guardar', mapa: copia(), base: '2026-09-30T20:00:00+00:00' }))
    expect(alDia.code).toBe(200)
    expect(base.escrituras).toHaveLength(1)
  })
  it('sin la tabla ⛔ no guarda, y lo dice', async () => {
    sesionDe(QUE_EDITA)
    base.sinTabla = true
    const r = await correr(req('POST', { action: 'guardar', mapa: copia(), base: null }))
    expect(r.code).toBe(503)
    expect(base.escrituras).toHaveLength(0)
  })
})
