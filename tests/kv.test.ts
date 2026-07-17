import { describe, it, expect, vi, afterEach } from 'vitest'
import { leerMapa, leerBanco, guardarMapa, guardarBanco, MOTIVO_NO_LEIDO } from '@/lib/kv/cliente'

/**
 * Lo que se prueba acá no es que fetch funcione: es que **la invariante que
 * costó 305 clientes no se pueda romper**.
 *
 * Los casos están calcados de los modos de falla REALES del KV, verificados
 * leyendo bdi-catalogo/api/ingresos.js — no inventados:
 *  - 500 CON JSON válido (línea 32, `{error:'KV no configurado'}`) ← el que
 *    nadie veía, porque r.json() no tira y el catch nunca corre.
 *  - 200 con ok:false.
 *  - respuesta que no es JSON.
 *  - error de red.
 */

const resp = (status: number, body: unknown) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
})

const noJson = (status: number) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => {
    throw new Error('no es JSON')
  },
})

afterEach(() => vi.unstubAllGlobals())

const FALLAS = [
  ['500 con JSON válido (el modo real del KV caído)', () => Promise.resolve(resp(500, { error: 'KV no configurado' }))],
  ['200 con ok:false', () => Promise.resolve(resp(200, { ok: false }))],
  ['respuesta no-JSON (502 con HTML)', () => Promise.resolve(noJson(502))],
  ['error de red (lo único que un catch cazaba)', () => Promise.reject(new Error('network'))],
] as const

describe('leerMapa · distingue "no pude leer" de "está vacío"', () => {
  it.each(FALLAS)('%s → ok:false', async (_txt, f) => {
    vi.stubGlobal('fetch', f)
    const r = await leerMapa('crmseg', 'bdi')
    expect(r.ok).toBe(false)
  })

  it('un mapa vacío que el servidor confirmó es ÉXITO, no fallo', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve(resp(200, { ok: true, map: {} })))
    const r = await leerMapa('crmseg', 'bdi')
    expect(r).toEqual({ ok: true, dato: {} })
  })

  it('con datos devuelve el mapa', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve(resp(200, { ok: true, map: { '1': { cadencia: 'semanal' } } })))
    const r = await leerMapa('crmseg', 'bdi')
    expect(r).toEqual({ ok: true, dato: { '1': { cadencia: 'semanal' } } })
  })
})

describe('leerBanco · la clave que no existe es el caso normal', () => {
  it('sin la clave devuelve ok:true y null (hoy mensajes:bdi no existe)', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve(resp(200, { ok: true, bank: null })))
    const r = await leerBanco('bdi')
    expect(r).toEqual({ ok: true, dato: null })
  })

  it.each(FALLAS)('%s → ok:false', async (_txt, f) => {
    vi.stubGlobal('fetch', f)
    expect((await leerBanco('bdi')).ok).toBe(false)
  })
})

describe('guardarMapa · no se puede pisar lo que no se leyó', () => {
  it('con cargado:false NO llega a hacer el request', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const r = await guardarMapa({ kind: 'crmseg', store: 'bdi', mapa: {}, cargado: false })
    expect(r).toEqual({ ok: false, motivo: MOTIVO_NO_LEIDO })
    expect(fetchSpy).not.toHaveBeenCalled() // lo que importa: el POST nunca salió
  })

  it('con cargado:true postea', async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(resp(200, { ok: true, total: 1 })))
    vi.stubGlobal('fetch', fetchSpy)
    const r = await guardarMapa({ kind: 'crmseg', store: 'bdi', mapa: { '1': 'x' }, cargado: true })
    expect(r).toEqual({ ok: true, total: 1 })
    expect(fetchSpy).toHaveBeenCalledOnce()
  })

  it.each(FALLAS)('un POST que falla se detecta: %s', async (_txt, f) => {
    vi.stubGlobal('fetch', f)
    const r = await guardarMapa({ kind: 'crmseg', store: 'bdi', mapa: { '1': 'x' }, cargado: true })
    // El legacy hacía `await fetch(...)` sin mirar nada: fallaba mudo y el
    // usuario creía que había guardado.
    expect(r.ok).toBe(false)
  })
})

describe('guardarBanco · misma invariante ([] pasa la guarda del servidor)', () => {
  it('con cargado:false NO postea', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    expect((await guardarBanco({ store: 'bdi', banco: [], cargado: false })).ok).toBe(false)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('con cargado:true postea', async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(resp(200, { ok: true, total: 2 })))
    vi.stubGlobal('fetch', fetchSpy)
    expect(await guardarBanco({ store: 'bdi', banco: [{ a: 1 }, { b: 2 }], cargado: true })).toEqual({ ok: true, total: 2 })
  })
})
