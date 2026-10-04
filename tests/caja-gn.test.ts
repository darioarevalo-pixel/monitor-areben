import { describe, expect, it } from 'vitest'
import { buscarPorIntegracion, fechaLocal, leerRespuestaVenta, normCode, sinSecretos } from '@/lib/caja/gn.core.js'

/**
 * Caja ↔ GN: cómo se lee la respuesta de `POST /ventas`. Los casos salen de lo medido el 3-oct-2026:
 * el 409 de un `integration_id` repetido (#30047 reintentada), el 422 de la validación, y que
 * `ventas/obtener` del día trae `integration_id`.
 */
describe('caja · respuesta de POST /ventas', () => {
  it('2xx con id y número ⇒ en GN (con o sin `data`)', () => {
    expect(leerRespuestaVenta(201, { data: { id: 1501201, number: 30047 } })).toEqual({ estado: 'en_gn', gn_sale_id: 1501201, gn_number: 30047 })
    expect(leerRespuestaVenta(200, { id: 1501201, number: 30047 })).toEqual({ estado: 'en_gn', gn_sale_id: 1501201, gn_number: 30047 })
  })

  it('2xx sin número ⇒ se busca, ⛔ se da por hecha sin número', () => {
    expect(leerRespuestaVenta(200, { ok: true })).toEqual({ estado: 'buscar' })
  })

  it('🔑 409 = «ya está en GN», ⛔ un error', () => {
    expect(leerRespuestaVenta(409, { message: 'Ya existe una venta con esa referencia de integracion' })).toEqual({ estado: 'buscar' })
  })

  it('429 y 5xx ⇒ error reintentable', () => {
    for (const s of [429, 500, 503]) {
      const r = leerRespuestaVenta(s, null)
      expect(r).toMatchObject({ estado: 'error', reintentable: true })
    }
  })

  it('otro 4xx ⇒ error NO reintentable, con lo que dijo GN', () => {
    const r = leerRespuestaVenta(422, { message: 'The given data was invalid.', errors: { client_id: ['El campo client id es obligatorio.'] } })
    expect(r).toMatchObject({ estado: 'error', reintentable: false })
    expect('error' in r && r.error).toMatch(/422.*client_id: El campo client id es obligatorio/)
  })

  it('🔴 el error que se guarda ⛔ lleva el token', () => {
    const tok = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.eyJhdWQiOiIxIiwianRpIjoiYWJj'
    const r = leerRespuestaVenta(500, { message: `fallo con Bearer ${tok}` })
    expect('error' in r && r.error).not.toContain(tok)
    expect(sinSecretos(`https://x/api?token=abc123&q=1`)).toBe('https://x/api?token=***&q=1')
    expect(sinSecretos(`id ${tok}`)).not.toContain(tok)
    // un uuid de la Caja ⛔ es un secreto: se tiene que poder leer en el error
    expect(sinSecretos('venta 3f1c2b9e-6a4d-4c1e-9b7a-2d5e8f0a1b3c')).toContain('3f1c2b9e-6a4d-4c1e-9b7a-2d5e8f0a1b3c')
  })
})

describe('caja · buscar la venta del 409', () => {
  const dia = { data: [{ id: 1, number: 30001, integration_id: null }, { id: 1501201, number: 30047, integration_id: 'caja-abc' }] }
  it('la encuentra por integration_id entre las del día', () => {
    expect(buscarPorIntegracion(dia, 'caja-abc')).toEqual({ gn_sale_id: 1501201, gn_number: 30047 })
  })
  it('si ⛔ está, null (⛔ inventa una)', () => {
    expect(buscarPorIntegracion(dia, 'otra')).toBeNull()
    expect(buscarPorIntegracion(null, 'caja-abc')).toBeNull()
  })
})

describe('caja · piezas', () => {
  it('fechaLocal: la venta de las 22 h de Argentina es de ese día (en UTC ya es mañana)', () => {
    expect(fechaLocal(new Date('2026-10-04T01:30:00Z'))).toBe('2026-10-03')
    expect(fechaLocal(new Date('2026-10-04T03:30:00Z'))).toBe('2026-10-04')
  })
  it('normCode: como el chequeo de exhibición', () => {
    expect(normCode(' 00-7790 123 ')).toBe('7790123')
    expect(normCode('ZT-Corset')).toBe('ztcorset')
  })
})
