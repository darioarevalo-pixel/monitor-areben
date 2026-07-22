import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { claveCache, guardarCache, leerCache, type PayloadCache } from '@/lib/cache'
import type { Marca } from '@/lib/nav.generated'

/**
 * El sello de marca del caché (lib/cache.ts). Cierra el bug de una entrada de una
 * marca servida bajo la clave de otra (BDI mostrándose en Zattia): la lectura valida
 * que el payload pertenezca a la marca pedida, y descarta las entradas sin sello
 * (viejas / del legacy) para que se rebajen limpias.
 *
 * El env de vitest es 'node' (sin DOM): se stubbea un localStorage con un Map.
 */
const store = new Map<string, string>()
beforeEach(() => {
  store.clear()
  ;(globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: () => null,
    length: 0,
  } as Storage
})
afterEach(() => {
  delete (globalThis as unknown as { localStorage?: Storage }).localStorage
})

const payloadVacio = (): PayloadCache => ({
  productos: [], inventario: [], vmMes: [], vmCat: [], vmFundas: [], colorManual: [], ventas: [],
  detalles: [], syncMeta: null,
})

describe('cache — sello de marca', () => {
  it('guardarCache estampa la marca y leerCache la devuelve para la misma marca', () => {
    guardarCache('zattia', payloadVacio(), Date.now())
    const e = leerCache('zattia')
    expect(e).not.toBeNull()
    expect(e!.marca).toBe('zattia')
  })

  it('descarta una entrada de otra marca escrita bajo la clave pedida (el bug BDI→Zattia)', () => {
    // Simula el envenenamiento: payload sellado 'bdi' guardado en la clave de Zattia.
    store.set(claveCache('zattia'), JSON.stringify({ timestamp: Date.now(), data: payloadVacio(), marca: 'bdi' as Marca }))
    expect(leerCache('zattia')).toBeNull()
    expect(leerCache('zattia', true)).toBeNull() // ni siquiera ignorando el vencimiento
  })

  it('descarta una entrada sin sello (legacy / versión vieja)', () => {
    store.set(claveCache('zattia'), JSON.stringify({ timestamp: Date.now(), data: payloadVacio() }))
    expect(leerCache('zattia')).toBeNull()
  })

  it('las marcas no colisionan: cada una lee lo suyo', () => {
    guardarCache('bdi', payloadVacio(), Date.now())
    guardarCache('zattia', payloadVacio(), Date.now())
    expect(leerCache('bdi')!.marca).toBe('bdi')
    expect(leerCache('zattia')!.marca).toBe('zattia')
  })
})
