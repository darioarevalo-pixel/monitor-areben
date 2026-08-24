import { describe, it, expect, vi, afterEach } from 'vitest'
import { leerMapa, guardarMapa, guardarLista, leerLista, MOTIVO_NO_LEIDO, _olvidarVistas } from '@/lib/kv/cliente'

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

afterEach(() => {
  vi.unstubAllGlobals()
  // La cuenta de "cuántos había" es de módulo: sin esto se arrastra de un caso al otro.
  _olvidarVistas()
})

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

/**
 * La segunda guarda: **no puede encoger de golpe**.
 *
 * `cargado` cubre "no pude leer". Lo que faltaba cubrir es el otro caso, el que no avisa: la
 * lectura sale BIEN y vuelve vacía —porque la clave se borró o venció del otro lado—, y el
 * guardado siguiente escribe un mapa de un cliente encima de los 771. El servidor no protege:
 * su única guarda es `typeof map === 'object'`, y `{}` es un objeto.
 */
describe('guardarMapa · no puede encoger de golpe', () => {
  /** 30 clientes: cualquier cosa por encima del piso de 20. */
  const muchos = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [String(i), { cadencia: 'semanal' }]))

  const leer = async (map: Record<string, unknown>) => {
    vi.stubGlobal('fetch', () => Promise.resolve(resp(200, { ok: true, map })))
    return leerMapa('crmseg', 'bdi')
  }

  it('🔴 leyó 30 y va a guardar 1: NO postea y explica qué pasó', async () => {
    await leer(muchos)
    const post = vi.fn(() => Promise.resolve(resp(200, { ok: true, total: 1 })))
    vi.stubGlobal('fetch', post)
    const r = await guardarMapa({ kind: 'crmseg', store: 'bdi', mapa: { '1': {} }, cargado: true })
    expect(r.ok).toBe(false)
    expect(post).not.toHaveBeenCalled()
    if (!r.ok) {
      expect(r.motivo).toContain('1')
      expect(r.motivo).toContain('30')
    }
  })

  it('🔴 el caso que abría el agujero: la lectura vuelve VACÍA y después se guarda uno', async () => {
    await leer(muchos)
    // La clave se borró del otro lado: la lectura sale bien, con cero adentro.
    const vacia = await leer({})
    expect(vacia).toEqual({ ok: true, dato: {} })
    // Y la pantalla, sin saberlo, guarda el cliente que se acaba de tocar.
    const post = vi.fn(() => Promise.resolve(resp(200, { ok: true, total: 1 })))
    vi.stubGlobal('fetch', post)
    const r = await guardarMapa({ kind: 'crmseg', store: 'bdi', mapa: { '1': {} }, cargado: true })
    expect(r.ok).toBe(false)
    expect(post).not.toHaveBeenCalled()
  })

  it('borrar unos pocos sigue siendo posible: no es una alarma de humo', async () => {
    await leer(muchos)
    const post = vi.fn(() => Promise.resolve(resp(200, { ok: true, total: 25 })))
    vi.stubGlobal('fetch', post)
    const menos = Object.fromEntries(Object.entries(muchos).slice(0, 25))
    const r = await guardarMapa({ kind: 'crmseg', store: 'bdi', mapa: menos, cargado: true })
    expect(r.ok).toBe(true)
    expect(post).toHaveBeenCalled()
  })

  it('una clave chica no se vigila: 5 pueden pasar a 1 con toda razón', async () => {
    await leer({ a: {}, b: {}, c: {}, d: {}, e: {} })
    vi.stubGlobal('fetch', () => Promise.resolve(resp(200, { ok: true, total: 1 })))
    const r = await guardarMapa({ kind: 'crmseg', store: 'bdi', mapa: { a: {} }, cargado: true })
    expect(r.ok).toBe(true)
  })

  it('🔑 una clave que de VERDAD está vacía se tiene que poder escribir', async () => {
    // Marca nueva, sección recién estrenada: nunca se vio nada, así que no hay nada que cuidar.
    vi.stubGlobal('fetch', () => Promise.resolve(resp(200, { ok: true, total: 1 })))
    const r = await guardarMapa({ kind: 'crmseg', store: 'zattia', mapa: { '1': {} }, cargado: true })
    expect(r.ok).toBe(true)
  })

  it('la cuenta es POR CLAVE: los teléfonos no se miden con la vara del seguimiento', async () => {
    await leer(muchos)
    vi.stubGlobal('fetch', () => Promise.resolve(resp(200, { ok: true, total: 1 })))
    const r = await guardarMapa({ kind: 'crmtel', store: 'bdi', mapa: { '1': 'x' }, cargado: true })
    expect(r.ok).toBe(true)
  })

  it('vale igual para las listas (historial de fotos, solicitudes internas)', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve(resp(200, { ok: true, list: Array.from({ length: 40 }, (_, i) => i) })))
    await leerLista('sesionfotos', 'bdi')
    const post = vi.fn(() => Promise.resolve(resp(200, { ok: true, total: 1 })))
    vi.stubGlobal('fetch', post)
    const r = await guardarLista({ kind: 'sesionfotos', store: 'bdi', lista: [1], cargado: true })
    expect(r.ok).toBe(false)
    expect(post).not.toHaveBeenCalled()
  })
})
