/**
 * El corte por límite de solicitudes de Gestión Nube.
 *
 * El caso real (12-ago-2026): el sync de inventario moría en la página 7 con
 * «Demasiadas solicitudes. Intenta nuevamente en un minuto.», los `gnFetch` sólo
 * reintentaban `status >= 500`, y el inventario de Zattia quedó congelado tres días
 * — con 41 productos recién cargados en GN que no aparecían en Etiquetas.
 */
import { describe, expect, it } from 'vitest'
import { esRateLimit, esperaRateLimit, MAX_RATE_LIMIT } from '../scripts/lib/gn-rate-limit.mjs'

const resp = (status: number, retryAfter?: string) => ({
  status,
  headers: { get: (h: string) => (h.toLowerCase() === 'retry-after' && retryAfter ? retryAfter : null) },
})

describe('esRateLimit', () => {
  it('reconoce el mensaje exacto que devuelve GN', () => {
    // Este es el texto del log del run 31619245356, tal cual.
    expect(esRateLimit(resp(400), { message: 'Demasiadas solicitudes. Intenta nuevamente en un minuto.' })).toBe(true)
  })

  it('reconoce el 429 aunque el cuerpo no diga nada', () => {
    expect(esRateLimit(resp(429), null)).toBe(true)
    expect(esRateLimit(resp(429), {})).toBe(true)
  })

  it('acepta el mensaje en `error` y en inglés', () => {
    expect(esRateLimit(resp(400), { error: 'Too Many Requests' })).toBe(true)
    expect(esRateLimit(resp(400), { message: 'rate limit exceeded' })).toBe(true)
  })

  it('NO se traga otros errores: un 500 o un token vencido siguen su propio camino', () => {
    expect(esRateLimit(resp(500), { message: 'Error interno' })).toBe(false)
    expect(esRateLimit(resp(401), { message: 'Token inválido' })).toBe(false)
    expect(esRateLimit(resp(404), null)).toBe(false)
  })
})

describe('esperaRateLimit', () => {
  it('respeta el Retry-After de GN si viene', () => {
    expect(esperaRateLimit(resp(429, '30'), 1)).toBe(30_000)
  })

  it('sin Retry-After espera el minuto que pide el mensaje, y va subiendo', () => {
    expect(esperaRateLimit(resp(429), 1)).toBe(60_000)
    expect(esperaRateLimit(resp(429), 2)).toBe(120_000)
    expect(esperaRateLimit(resp(429), 3)).toBe(180_000)
  })

  it('topea en 5 minutos para que el sync no quede colgado', () => {
    expect(esperaRateLimit(resp(429), 99)).toBe(300_000)
    expect(esperaRateLimit(resp(429, '99999'), 1)).toBe(300_000)
  })

  it('el presupuesto total de esperas cabe en el run: menos de 20 minutos', () => {
    let total = 0
    for (let i = 1; i <= MAX_RATE_LIMIT; i++) total += esperaRateLimit(resp(429), i)
    expect(total).toBeLessThan(20 * 60_000)
  })
})
