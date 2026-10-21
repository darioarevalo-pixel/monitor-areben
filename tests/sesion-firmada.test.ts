import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { abrirSesion, firmarSesion, SESION_FRESCA_MS, SESION_VENCE_MS } from '@/lib/sesion-firmada.core.js'
import { exigirUsuario, CABECERA_SESION } from '@/api/_auth.js'

/**
 * El login propio (fase Bases, paso 3, 21-oct-2026). El oráculo de la auditoría
 * (`auditoria-2026-10-20.md` § Verificación): **con bdi-catalogo bloqueado, la Caja sigue
 * respondiendo a una sesión ya iniciada**. Y el otro lado, que es el que se puede romper sin que
 * nadie lo note: una BAJA o un cambio de clave se tiene que seguir cortando.
 */

const SECRETO = 'secreto-de-prueba'
const PERFIL = { name: 'Local', admin: false, acceso: { zattia: { caja: true } }, funcion: [] }
const sobre = (d: unknown) => Buffer.from(JSON.stringify(d), 'utf8').toString('base64')
const req = (d: unknown) => ({ headers: { 'x-monitor-auth': sobre(d) } })

function resFalso() {
  const r = {
    code: 0 as number,
    body: null as unknown,
    headers: {} as Record<string, string>,
    setHeader(k: string, v: string) { r.headers[k.toLowerCase()] = String(v) },
    status(c: number) { r.code = c; return r },
    json(b: unknown) { r.body = b; return r },
  }
  return r
}

/** bdi-catalogo: dice que sí, dice que no, o no contesta (tira). */
const kv = {
  si: () => vi.stubGlobal('fetch', vi.fn(async () => ({ status: 200, json: async () => ({ ok: true, perfil: PERFIL }) }))),
  no: () => vi.stubGlobal('fetch', vi.fn(async () => ({ status: 200, json: async () => ({ ok: false }) }))),
  caido: () => vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNREFUSED') })),
}
const llamadasAlKv = () => (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.length

beforeEach(() => { process.env.MONITOR_SESION_SECRETO = SECRETO })
afterEach(() => {
  delete process.env.MONITOR_SESION_SECRETO
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('la firma', () => {
  it('abre lo que firmó, fresca al nacer', () => {
    const t = firmarSesion(PERFIL, SECRETO, 1_000)!
    expect(abrirSesion(t, SECRETO, 1_000)).toEqual({ perfil: PERFIL, iat: 1_000, fresca: true })
  })

  it('deja de ser fresca a los 10 minutos y vence a las 12 horas', () => {
    const t = firmarSesion(PERFIL, SECRETO, 0)!
    expect(abrirSesion(t, SECRETO, SESION_FRESCA_MS)!.fresca).toBe(false)
    expect(abrirSesion(t, SECRETO, SESION_VENCE_MS - 1)).not.toBeNull()
    expect(abrirSesion(t, SECRETO, SESION_VENCE_MS)).toBeNull()
  })

  it('⛔ abre una firma tocada, de otro secreto, del futuro o rota', () => {
    const t = firmarSesion(PERFIL, SECRETO, 0)!
    const [cuerpo, sello] = t.split('.')
    const admin = Buffer.from(JSON.stringify({ p: { ...PERFIL, admin: true }, iat: 0, exp: SESION_VENCE_MS })).toString('base64url')
    expect(abrirSesion(`${admin}.${sello}`, SECRETO, 0)).toBeNull()
    expect(abrirSesion(t, 'otro', 0)).toBeNull()
    expect(abrirSesion(firmarSesion(PERFIL, SECRETO, 10 * 60_000)!, SECRETO, 0)).toBeNull()
    for (const roto of ['', 'x', `${cuerpo}.`, `${t}.mas`, 'a.b']) expect(abrirSesion(roto, SECRETO, 0)).toBeNull()
  })

  it('sin secreto no firma ni abre: el Monitor sigue como antes', () => {
    expect(firmarSesion(PERFIL, '', 0)).toBeNull()
    expect(abrirSesion(firmarSesion(PERFIL, SECRETO, 0)!, '', 0)).toBeNull()
  })
})

describe('exigirUsuario con la sesión propia', () => {
  it('bdi-catalogo dice que sí ⇒ la respuesta lleva la firma', async () => {
    kv.si()
    const res = resFalso()
    expect(await exigirUsuario(req({ user: 'Local', pass: 'p' }), res)).toEqual(PERFIL)
    expect(abrirSesion(res.headers[CABECERA_SESION], SECRETO)!.perfil).toEqual(PERFIL)
  })

  it('con la firma fresca ⛔ le pregunta a bdi-catalogo', async () => {
    kv.si()
    const sesion = firmarSesion(PERFIL, SECRETO)
    expect(await exigirUsuario(req({ user: 'Local', pass: 'p', sesion }), resFalso())).toEqual(PERFIL)
    expect(llamadasAlKv()).toBe(0)
  })

  it('🔑 bdi-catalogo CAÍDO y la firma vieja (< 12 h) ⇒ la Caja sigue', async () => {
    kv.caido()
    const sesion = firmarSesion(PERFIL, SECRETO, Date.now() - 3 * 60 * 60 * 1000)
    const res = resFalso()
    expect(await exigirUsuario(req({ user: 'Local', pass: 'p', sesion }), res)).toEqual(PERFIL)
    expect(res.code).toBe(0)
  })

  it('🔴 bdi-catalogo dice NO (baja, clave cambiada) ⇒ 403 aunque la firma siga viva', async () => {
    kv.no()
    const sesion = firmarSesion(PERFIL, SECRETO, Date.now() - SESION_FRESCA_MS - 1)
    const res = resFalso()
    expect(await exigirUsuario(req({ user: 'Local', pass: 'vieja', sesion }), res)).toBeNull()
    expect(res.code).toBe(403)
  })

  it('⛔ la firma sola, pasados los 10 minutos, no alcanza aunque bdi-catalogo esté caído', async () => {
    kv.caido()
    const sesion = firmarSesion(PERFIL, SECRETO, Date.now() - SESION_FRESCA_MS - 1)
    expect(await exigirUsuario(req({ sesion }), resFalso())).toBeNull()
  })

  it('⛔ una firma de OTRA persona que la del sobre', async () => {
    kv.caido()
    const sesion = firmarSesion({ ...PERFIL, name: 'Bruno', admin: true }, SECRETO)
    expect(await exigirUsuario(req({ user: 'Local', pass: 'p', sesion }), resFalso())).toBeNull()
  })

  it('bdi-catalogo caído y la firma vencida ⇒ 403', async () => {
    kv.caido()
    const sesion = firmarSesion(PERFIL, SECRETO, Date.now() - SESION_VENCE_MS - 1)
    expect(await exigirUsuario(req({ user: 'Local', pass: 'p', sesion }), resFalso())).toBeNull()
  })

  it('sin MONITOR_SESION_SECRETO: igual que antes (pregunta siempre, ⛔ firma)', async () => {
    delete process.env.MONITOR_SESION_SECRETO
    kv.si()
    const res = resFalso()
    const sesion = firmarSesion(PERFIL, SECRETO)
    expect(await exigirUsuario(req({ user: 'Local', pass: 'p', sesion }), res)).toEqual(PERFIL)
    expect(llamadasAlKv()).toBe(1)
    expect(res.headers[CABECERA_SESION]).toBeUndefined()
  })
})
