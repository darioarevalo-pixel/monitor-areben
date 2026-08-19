import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { almacenMemoria, usarAlmacen, type Almacen } from '@/lib/almacen'
import {
  CLAVES_LS_LEGACY,
  claveCache,
  guardarCache,
  leerCache,
  limpiarCacheLegacy,
  TTL_MS,
  type PayloadCache,
} from '@/lib/cache'
import type { Marca } from '@/lib/nav.datos'

/**
 * El caché del ETL (lib/cache.ts). Cubre el sello de marca —que cierra el bug de una entrada
 * de una marca servida bajo la clave de otra (BDI mostrándose en Zattia)—, el TTL, y las dos
 * garantías que dejó el paso a IndexedDB: que NO hay tope de tamaño (el tope de 8 MB hacía
 * que BDI, de ~15 MB, no guardara nunca y sin avisar) y que un guardado fallido se ve.
 *
 * El env de vitest es `node` y ahí no hay IndexedDB: los tests inyectan el backend de
 * memoria con `usarAlmacen`, que es para lo que existe ese seam.
 */
let mem: Almacen
beforeEach(() => {
  mem = almacenMemoria()
  usarAlmacen(mem)
})
afterEach(() => usarAlmacen(null))

const payloadVacio = (): PayloadCache => ({
  productos: [], inventario: [], vmMes: [], vmCat: [], vmFundas: [], colorManual: [], ventas: [],
  detalles: [], syncMeta: null,
})

/**
 * 🔴 **El sello de VENTANA (18-ago-2026).** Desde que la ventana de ventas cuelga del permiso y no
 * del flag de admin, dos usuarios de la misma máquina pueden tener cortes distintos sobre **la
 * misma clave** —que es sólo la marca—. Sin este sello, la entrada corta de uno se le sirve al
 * siguiente y «Ventas 90 d» muestra 35 días con el rótulo de 90: **sin un error, sin un log, y con
 * la pantalla entera pareciendo sana**. Es el mismo modo de falla que ya cerró el sello de marca.
 */
describe('cache — sello de ventana', () => {
  it('guarda el corte y devuelve la entrada cuando coincide', async () => {
    expect(await guardarCache('bdi', payloadVacio(), Date.now(), '2025-01-01')).toEqual({ ok: true })
    const e = await leerCache('bdi', false, '2025-01-01')
    expect(e).not.toBeNull()
    expect(e!.desde).toBe('2025-01-01')
  })

  it('🔴 descarta la entrada CORTA cuando se pide la larga', async () => {
    await guardarCache('bdi', payloadVacio(), Date.now(), '2026-07-14')
    expect(await leerCache('bdi', false, '2025-01-01')).toBeNull()
  })

  // La otra dirección, que no es simétrica en el daño pero sí en la regla: servirle una entrada
  // larga a quien no ve el análisis le deja en el navegador historia que no le corresponde.
  it('🔴 y descarta la LARGA cuando se pide la corta', async () => {
    await guardarCache('bdi', payloadVacio(), Date.now(), '2025-01-01')
    expect(await leerCache('bdi', false, '2026-07-14')).toBeNull()
  })

  it('una entrada vieja, sin sello de ventana, tampoco vale', async () => {
    await mem.guardar(claveCache('bdi'), { timestamp: Date.now(), data: payloadVacio(), marca: 'bdi' as Marca })
    expect(await leerCache('bdi', false, '2025-01-01')).toBeNull()
  })

  /**
   * ⚠️ **Sin pedir ventana sigue valiendo cualquier entrada, y es a propósito**: Gerencial lee lo
   * que haya en el disco (`cargarETL`) porque mira agregados que las dos ventanas contestan igual,
   * y exigirle el sello lo mandaría a bajar 14,7 MB por marca cada vez que el usuario de al lado
   * dejó una entrada más corta.
   */
  it('el llamador que no pide ventana recibe la entrada igual', async () => {
    await guardarCache('bdi', payloadVacio(), Date.now(), '2026-07-14')
    const e = await leerCache('bdi', true)
    expect(e).not.toBeNull()
  })

  // El sello de ventana NO reemplaza al de marca: los dos tienen que seguir cortando.
  it('el sello de marca sigue cortando aunque la ventana coincida', async () => {
    await mem.guardar(claveCache('zattia'), { timestamp: Date.now(), data: payloadVacio(), marca: 'bdi' as Marca, desde: '2025-01-01' })
    expect(await leerCache('zattia', false, '2025-01-01')).toBeNull()
  })
})

describe('cache — sello de marca', () => {
  it('guardarCache estampa la marca y leerCache la devuelve para la misma marca', async () => {
    expect(await guardarCache('zattia', payloadVacio(), Date.now())).toEqual({ ok: true })
    const e = await leerCache('zattia')
    expect(e).not.toBeNull()
    expect(e!.marca).toBe('zattia')
  })

  it('descarta una entrada de otra marca escrita bajo la clave pedida (el bug BDI→Zattia)', async () => {
    // Simula el envenenamiento: payload sellado 'bdi' guardado en la clave de Zattia.
    await mem.guardar(claveCache('zattia'), { timestamp: Date.now(), data: payloadVacio(), marca: 'bdi' as Marca })
    expect(await leerCache('zattia')).toBeNull()
    expect(await leerCache('zattia', true)).toBeNull() // ni siquiera ignorando el vencimiento
  })

  it('descarta una entrada sin sello (legacy / versión vieja)', async () => {
    await mem.guardar(claveCache('zattia'), { timestamp: Date.now(), data: payloadVacio() })
    expect(await leerCache('zattia')).toBeNull()
  })

  it('las marcas no colisionan: cada una lee lo suyo', async () => {
    await guardarCache('bdi', payloadVacio(), Date.now())
    await guardarCache('zattia', payloadVacio(), Date.now())
    expect((await leerCache('bdi'))!.marca).toBe('bdi')
    expect((await leerCache('zattia'))!.marca).toBe('zattia')
  })
})

describe('cache — vencimiento', () => {
  it('una entrada vencida no se sirve, salvo que se ignore el vencimiento', async () => {
    // Es lo que sostiene el stale-while-revalidate del store: mostrar lo viejo y refrescar atrás.
    const viejo = Date.now() - TTL_MS - 1000
    await mem.guardar(claveCache('bdi'), { timestamp: viejo, data: payloadVacio(), marca: 'bdi' as Marca })
    expect(await leerCache('bdi')).toBeNull()
    const e = await leerCache('bdi', true)
    expect(e).not.toBeNull()
    expect(e!.timestamp).toBe(viejo)
  })

  it('una entrada al filo del TTL todavía sirve', async () => {
    await mem.guardar(claveCache('bdi'), { timestamp: Date.now() - TTL_MS + 5000, data: payloadVacio(), marca: 'bdi' as Marca })
    expect(await leerCache('bdi')).not.toBeNull()
  })
})

describe('cache — sin tope de tamaño', () => {
  it('guarda un payload grande y lo devuelve entero', async () => {
    // ⚠️ La regresión que este test existe para impedir: había un `if (payload.length < 8 MB)`
    // que hacía que el payload de BDI (~15 MB) NO se guardara nunca, sin avisar — así que se
    // pagaban ~20 s de bajada en cada entrada en vez de cada 6 horas. Si alguien vuelve a
    // meter un chequeo de tamaño, esto se pone en rojo.
    // (Se genera acá: tests/fixtures/ está gitignoreado y no se puede depender de él.)
    const data = payloadVacio()
    data.detalles = Array.from({ length: 120_000 }, (_, i) => ({
      sale_id: 500_000 + i,
      product_id: i % 900,
      size_id: i % 400,
      size: 'Talle ' + (i % 12),
      quantity: 1,
    }))
    expect(await guardarCache('bdi', data, Date.now())).toEqual({ ok: true })
    const e = await leerCache('bdi')
    expect(e!.data.detalles).toHaveLength(120_000)
    expect(e!.data.detalles[119_999].sale_id).toBe(619_999)
  })
})

describe('cache — un guardado que falla se ve', () => {
  it('devuelve ok:false con el motivo y no lanza', async () => {
    // La contracara del `catch {}` vacío que se comía el QuotaExceededError.
    const err = new Error('cuota agotada')
    err.name = 'QuotaExceededError'
    usarAlmacen({
      leer: async () => null,
      guardar: async () => {
        throw err
      },
      borrar: async () => {},
    })
    const r = await guardarCache('bdi', payloadVacio(), Date.now())
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.motivo).toContain('QuotaExceededError')
  })
})

describe('cache — limpieza del localStorage viejo', () => {
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

  it('borra las claves v4 y no toca las demás', () => {
    // El acotamiento importa: lib/fundas/persistencia.ts documenta un incidente en que el
    // legacy nukeaba `monitor_v*` con comodín y se llevaba puestas las simulaciones.
    for (const k of CLAVES_LS_LEGACY) store.set(k, 'payload viejo')
    store.set('monitor_sim_bdi', 'simulaciones de fundas')
    limpiarCacheLegacy()
    for (const k of CLAVES_LS_LEGACY) expect(store.has(k)).toBe(false)
    expect(store.get('monitor_sim_bdi')).toBe('simulaciones de fundas')
  })

  it('leerCache limpia de paso, sin que nadie tenga que acordarse', async () => {
    for (const k of CLAVES_LS_LEGACY) store.set(k, 'payload viejo')
    await leerCache('bdi')
    for (const k of CLAVES_LS_LEGACY) expect(store.has(k)).toBe(false)
  })

  it('sin localStorage no tira', () => {
    delete (globalThis as unknown as { localStorage?: Storage }).localStorage
    expect(() => limpiarCacheLegacy()).not.toThrow()
  })
})
