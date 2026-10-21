import { describe, it, expect, vi, afterEach } from 'vitest'
import { armarMail, decidir, estadoAGuardar, leerSonda } from '@/lib/vigia-erp.core.js'
import handler from '../api/_vigia-erp.js'

const T = (min: number) => new Date(Date.parse('2026-10-21T15:00:00Z') + min * 60_000)

describe('la sonda: viva es 401 sin llave', () => {
  it('401 es sana; todo lo demás, falla con su motivo', () => {
    expect(leerSonda(401).sana).toBe(true)
    expect(leerSonda(200).detalle).toMatch(/SIN LLAVE/)
    expect(leerSonda(404).detalle).toMatch(/despliegue/)
    expect(leerSonda(503)).toEqual({ sana: false, detalle: 'contestó 503' })
    expect(leerSonda(null, 'más de 10 s sin respuesta').detalle).toMatch(/no contestó \(más de 10 s/)
  })
})

describe('un mail al caer y uno al volver, ⛔ uno por corrida', () => {
  const mala = leerSonda(503)
  const buena = leerSonda(401)

  it('una falla sola (un parpadeo) ⛔ avisa; la segunda seguida, sí', () => {
    const a = decidir(null, mala, T(0))
    expect(a.mail).toBe(null)
    const b = decidir(a.estado, mala, T(15))
    expect(b.mail).toBe('cayo')
    expect(b.caidaDesde).toBe(T(0).toISOString())
    // La tercera, cuarta…: callada.
    expect(decidir(b.estado, mala, T(30)).mail).toBe(null)
  })

  it('al volver, un mail con desde cuándo estuvo caída; un parpadeo que volvió solo ⛔ manda nada', () => {
    const caida = decidir(decidir(null, mala, T(0)).estado, mala, T(15))
    const vuelta = decidir(caida.estado, buena, T(30))
    expect(vuelta).toMatchObject({ mail: 'volvio', caidaDesde: T(0).toISOString(), estado: { fallas_seguidas: 0, avisado: false } })
    expect(decidir(decidir(null, mala, T(0)).estado, buena, T(15)).mail).toBe(null)
  })

  it('🔴 si el mail ⛔ salió, ⛔ queda como avisado: la corrida siguiente lo reintenta', () => {
    const caida = decidir(decidir(null, mala, T(0)).estado, mala, T(15))
    const guardado = estadoAGuardar(caida, false)
    expect(guardado.avisado).toBe(false)
    expect(decidir(guardado, mala, T(30)).mail).toBe('cayo')
    const vuelta = decidir(estadoAGuardar(caida, true), buena, T(30))
    expect(decidir(estadoAGuardar(vuelta, false), buena, T(45)).mail).toBe('volvio')
  })

  it('el mail dice qué se corta y a dónde mirar, sin «⛔»', () => {
    const m = armarMail('cayo', { caidaDesde: T(0).toISOString(), detalle: 'contestó 503' })
    expect(m.asunto).toMatch(/no responde/)
    expect(m.texto).toMatch(/contestó 503/)
    expect(m.texto).toMatch(/dashboard/)
    expect(m.texto).toMatch(/areben-erp/)
    expect(m.texto + m.html).not.toMatch(/⛔/)
  })
})

describe('la puerta del cron', () => {
  afterEach(() => { vi.unstubAllEnvs() })
  const res = () => {
    const r = { code: 0, body: null as unknown, status(c: number) { r.code = c; return r }, json(b: unknown) { r.body = b; return r }, setHeader() {} }
    return r
  }
  const req = (auth?: string, tarea = 'mirar') => ({ method: 'GET', query: { recurso: 'vigia-erp', tarea }, headers: auth ? { authorization: auth } : {} })

  it('🔴 sin CRON_SECRET está CERRADA (503), ⛔ abierta', async () => {
    vi.stubEnv('CRON_SECRET', '')
    const r = res()
    await handler(req('Bearer cualquiera'), r)
    expect(r.code).toBe(503)
  })

  it('con otro secreto, 401; sin tarea=mirar, 400', async () => {
    vi.stubEnv('CRON_SECRET', 'el-bueno')
    const r = res()
    await handler(req('Bearer otro'), r)
    expect(r.code).toBe(401)
    const r2 = res()
    await handler(req('Bearer el-bueno', 'otra'), r2)
    expect(r2.code).toBe(400)
  })
})
