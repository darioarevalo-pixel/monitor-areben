// La vuelta de costos y lo que anota la lectura, en el handler: el corte decide si se escribe, sin token se saltea, y un tropiezo al anotar ⛔ rompe la lectura.
// El núcleo se prueba en el motor (`test/conexion-pg.mjs`).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const m = vi.hoisted(() => ({ correr: vi.fn(), anotar: vi.fn(), mirar: vi.fn(), cortes: {} as Record<string, Date>, conecta: true, fin: vi.fn() }))
vi.mock('pg', () => ({
  default: { Client: class { query = vi.fn(async () => ({ rows: [] })); connect = async () => { if (!m.conecta) throw Object.assign(new Error('x'), { code: 'ECONNREFUSED' }) }; end = m.fin } },
}))
vi.mock('@/motor/conexion.mjs', () => ({ correrCostos: m.correr, anotarLectura: m.anotar, mirarToken: m.mirar }))
vi.mock('@/motor/llave-corte.mjs', async () => ({
  leerCortes: async () => m.cortes,
  costoIngresosManda: (marca: string, cortes: Record<string, Date>, env: Record<string, string | undefined>) => !!cortes[marca] && env.ERP_NO_MANDA !== marca,
}))
vi.mock('@/api/_recepciones-procesar.js', () => ({ procesarEvento: vi.fn() }))
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from: () => ({ select: () => ({ like: () => ({ eq: () => ({ order: () => ({ limit: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }) }) }) }) }) }))

import handler from '@/api/_ingresos-lectura.js'

const llamar = async (query: Record<string, string>) => {
  let code = 0, cuerpo: { marcas: Record<string, { error?: string }> } = { marcas: {} }
  const res = { status(c: number) { code = c; return this }, json(b: typeof cuerpo) { cuerpo = b; return this } }
  await handler({ method: 'GET', query, headers: { authorization: 'Bearer c' } }, res)
  return { code, cuerpo }
}

beforeEach(() => {
  vi.stubEnv('CRON_SECRET', 'c'); vi.stubEnv('SUPABASE_URL', 'https://e.supabase.co'); vi.stubEnv('SUPABASE_SERVICE_KEY', 'k')
  vi.stubEnv('INGRESOS_TOKEN_ZATTIA', 'igk_z'); vi.stubEnv('INGRESOS_TOKEN_BDI', '')
  vi.stubEnv('DATABASE_URL_BDI', 'postgres://x@h/b'); vi.stubEnv('DATABASE_URL_ZATTIA', 'postgres://x@h/z')
  m.correr.mockResolvedValue({ manda: false }); m.anotar.mockResolvedValue(undefined); m.mirar.mockResolvedValue({ vence: '2027-01-31T00:00:00Z', permisos: [] })
  m.cortes = {}; m.conecta = true; m.fin.mockResolvedValue(undefined)
})
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); m.correr.mockReset(); m.anotar.mockReset(); m.mirar.mockReset(); m.fin.mockReset() })

describe('tarea=costos', () => {
  it('sin corte ⛔ manda; marca sin token se saltea', async () => {
    const r = await llamar({ tarea: 'costos' })
    expect(r.code).toBe(200)
    expect(r.cuerpo.marcas.bdi).toEqual({ sinToken: true })
    expect(m.correr).toHaveBeenCalledTimes(1)
    expect(m.correr.mock.calls[0][0]).toMatchObject({ negocio: 'zattia', token: 'igk_z', manda: false, seco: false })
  })
  it('con el corte de ESA marca, manda', async () => {
    m.cortes = { zattia: new Date('2026-11-23') }
    await llamar({ tarea: 'costos' })
    expect(m.correr.mock.calls[0][0].manda).toBe(true)
    m.correr.mockClear()
    m.cortes = { stunned: new Date('2026-10-28') }
    await llamar({ tarea: 'costos' })
    expect(m.correr.mock.calls[0][0].manda).toBe(false)
  })
  it('seco llega al núcleo', async () => {
    await llamar({ tarea: 'costos', seco: '1' })
    expect(m.correr.mock.calls[0][0].seco).toBe(true)
  })
  it('un error de una marca da 502, sin el token en la respuesta, y cierra las conexiones', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    m.correr.mockResolvedValue({ error: 'token_revoked', status: 401 })
    const r = await llamar({ tarea: 'costos' })
    expect(r.code).toBe(502)
    expect(JSON.stringify(r.cuerpo)).not.toContain('igk_z')
    expect(m.fin).toHaveBeenCalledTimes(2)
  })
  it('una base caída da 502, ⛔ tira', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    m.conecta = false
    const r = await llamar({ tarea: 'costos' })
    expect(r.code).toBe(502)
    expect(r.cuerpo.marcas.zattia.error).toBe('ECONNREFUSED')
  })
  it('otra tarea, 400', async () => expect((await llamar({ tarea: 'nada' })).code).toBe(400))
})

const respuesta = (status: number, cuerpo: unknown) => ({ ok: status < 300, status, json: async () => cuerpo })

describe('tarea=leer anota cómo salió', () => {
  it('bien: ok y hasta cuándo sirve el token', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respuesta(200, { items: [], total: 0 })))
    const r = await llamar({ tarea: 'leer' })
    expect(r.code).toBe(200)
    expect(m.anotar.mock.calls[0][1]).toMatchObject({ sistema: 'ingresos', negocio: 'zattia', ok: true, status: 200, vence: '2027-01-31T00:00:00Z' })
  })
  it('un 401 queda anotado con su code', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn(async () => respuesta(401, { code: 'token_revoked' })))
    m.mirar.mockRejectedValue(Object.assign(new Error('x'), { status: 401, code: 'token_revoked' }))
    const r = await llamar({ tarea: 'leer' })
    expect(r.code).toBe(502)
    expect(m.anotar.mock.calls[0][1]).toMatchObject({ ok: false, status: 401, code: 'token_revoked' })
  })
  it('seco ⛔ anota', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respuesta(200, { items: [], total: 0 })))
    await llamar({ tarea: 'leer', seco: '1' })
    expect(m.anotar).not.toHaveBeenCalled()
  })
  it('🔴 si anotar falla, la lectura sale igual; antes de migrar ni se avisa', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn(async () => respuesta(200, { items: [], total: 0 })))
    m.anotar.mockRejectedValue(Object.assign(new Error('sin tabla'), { code: '42P01' }))
    expect((await llamar({ tarea: 'leer' })).code).toBe(200)
    expect(err).not.toHaveBeenCalled()
    m.anotar.mockRejectedValue(Object.assign(new Error('otra'), { code: '57014' }))
    expect((await llamar({ tarea: 'leer' })).code).toBe(200)
    expect(err).toHaveBeenCalled()
  })
})
