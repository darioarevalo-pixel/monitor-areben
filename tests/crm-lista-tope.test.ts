import { describe, it, expect, vi, afterEach } from 'vitest'
import { LOTE_IDS, traerPorFiltro } from '@/lib/crm/panel'
import { TOPE_IDS_LISTA } from '../api/_crm.js'
import type { MapaSeguimiento, Seguimiento } from '@/lib/crm/tipos'

/**
 * 🔴 **El techo que cortaba en silencio.**
 *
 * `action:'lista'` acepta 300 ids. Hasta el 29-ago-2026 hacía `.slice(0, 300)`: al que se pasaba no
 * le llegaba un error, le llegaba **una lista del día con gente faltante**, sin nada que mirar. El
 * docblock del handler decía "hoy se piden ~90"; medido ese día se pedían **236**, a 64 del techo —
 * y con las 327 temperaturas perdidas el 27-ago todavía sin recargar, o sea que al recargarlas se
 * pasaba. Cada cliente que se marca 🧊 suma un id al pedido.
 *
 * Los filtros por tipo lo vuelven seguro pedir de más: 🧊 son 378 y "todos" 773. De ahí las dos
 * mitades del arreglo, y las dos se prueban acá:
 *
 *  1. el servidor **rechaza** en vez de recortar (probado por el contrato de los dos números);
 *  2. el cliente **nunca le manda más de un lote**, así que nadie llega a ver ese error.
 */

const HOY = new Date('2026-08-23T12:00:00')
const seg = (p: Partial<Seguimiento> = {}): Seguimiento => ({ notas: [], ...p })

describe('el lote del cliente contra el techo del servidor', () => {
  it('🔴 un lote entra siempre en un pedido', () => {
    // Si alguien sube `LOTE_IDS` por arriba de `TOPE_IDS_LISTA`, el panel empieza a comerse un 400
    // en cada filtro grande. Es la única relación entre los dos archivos y no la ve el compilador.
    expect(LOTE_IDS).toBeLessThanOrEqual(TOPE_IDS_LISTA)
  })
})

describe('traerPorFiltro · pide de a tandas', () => {
  afterEach(() => vi.unstubAllGlobals())

  /** 400 fríos vencidos: más que el techo del servidor, y menos de lo que hay en producción. */
  const mapa: MapaSeguimiento = {}
  for (let i = 1; i <= 400; i++) mapa[i] = seg({ proximo_manual: '2026-08-20', temperatura: 'frio' })

  it('🔴 ningún pedido se pasa del techo, y no se pierde ningún cliente', async () => {
    const tamanos: number[] = []
    vi.stubGlobal('fetch', (_u: string, init?: RequestInit) => {
      const ids: number[] = JSON.parse(String(init?.body)).ids
      tamanos.push(ids.length)
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ ok: true, clientes: ids.map((id) => ({ id, name: 'C' + id, phone: '3834270554', total_amount: id })) }),
      })
    })

    const r = await traerPorFiltro(mapa, HOY, 'frio')
    expect(r.ok).toBe(true)
    if (!r.ok) return

    expect(tamanos.length).toBeGreaterThan(1)
    for (const n of tamanos) expect(n).toBeLessThanOrEqual(TOPE_IDS_LISTA)
    // 🔑 Lo que importa: los 400 están. Antes se pedían los 400 de un saque y volvían 300.
    expect(r.filas).toHaveLength(400)
    expect(tamanos.reduce((a, b) => a + b, 0)).toBe(400)
  })

  it('los 🧊 salen por lo que compraron, que es el orden de la sección', async () => {
    vi.stubGlobal('fetch', (_u: string, init?: RequestInit) => {
      const ids: number[] = JSON.parse(String(init?.body)).ids
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ ok: true, clientes: ids.map((id) => ({ id, name: 'C' + id, phone: '3834270554', total_amount: id })) }),
      })
    })
    const r = await traerPorFiltro(mapa, HOY, 'frio')
    expect(r.ok && r.filas[0].total).toBe(400)
  })

  it('🔑 para los que NO son fríos no pide los totales: es la parte cara y no se muestra', async () => {
    const pedidos: Array<boolean | undefined> = []
    vi.stubGlobal('fetch', (_u: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body))
      pedidos.push(body.totales)
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ ok: true, clientes: body.ids.map((id: number) => ({ id, name: 'C' + id, phone: '', total_amount: 0 })) }),
      })
    })

    const calientes: MapaSeguimiento = { 1: seg({ proximo_manual: '2026-08-20', temperatura: 'caliente' }) }
    await traerPorFiltro(calientes, HOY, 'caliente')
    expect(pedidos).toEqual([false])
  })

  it('si un pedido falla, falla entero: media lista es peor que un error', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve({ ok: false, status: 500, json: async () => ({ error: 'se cayó' }) }))
    const r = await traerPorFiltro(mapa, HOY, 'frio')
    expect(r.ok).toBe(false)
  })
})
