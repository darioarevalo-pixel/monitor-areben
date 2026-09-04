import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * **`comparativa()` del handler del PRM: las DOS marcas se preguntan a la vez.**
 *
 * Lo que se prueba acá ⛔ no es la cuenta —esa vive en `lib/prm/movimiento.ts` y tiene su archivo—:
 * son las tres cosas que se rompen solas el día que alguien vuelva a escribir ese bloque con un
 * `for … await`.
 *
 *  1. 🔴 **Las dos bases se consultan EN PARALELO.** Son dos proyectos de Supabase distintos, sin
 *     nada que uno espere del otro, y cada uno se baja de a mil filas. Encadenarlos hacía que la
 *     pantalla esperara la SUMA. Medido en prod el 3-sep-2026: el pedido tardaba **2.681 ms** y las
 *     ventas eran la mayor parte (5.311 renglones sólo de BDI).
 *  2. 🔴 **Que una marca no conteste ⛔ no puede voltear a la otra.** El `catch` va adentro del
 *     `map`: afuera del `Promise.all` cortaría con la primera que falle y la pantalla se quedaría
 *     sin NINGUNA columna medida, que es peor que quedarse sin una.
 *  3. 🔴 **El orden del resultado ⛔ no puede depender de cuál conteste primero.** Con `Promise.all`
 *     la tentación es empujar al array desde adentro de cada promesa, y ahí `marcasMudas` y
 *     `ventasPorProducto` salen en el orden en que respondió la red: distinto en cada carga, y un
 *     cartel que cambia de texto solo.
 */

const cfg: Record<string, { url: string | null; key: string | null }> = {}
/** `store → cuánto tarda su consulta de ventas`, para poder ver si se superponen. */
const demora: Record<string, number> = {}
/** `store → [empezó, terminó]` en ms desde el arranque de la corrida. */
let ventana: Record<string, [number, number]>
let rompe: string | null
/** La OC cuyo `lineas_recibidas` dice MÁS de lo que trae el embed: PostgREST recortó. */
let recorta: string | null

vi.mock('@/api/_recepciones-base.js', () => ({
  cfgDelMonitor: () => ({ url: 'u-monitor', key: 'k-monitor' }),
  cfgDeMarca: (store: string) => cfg[store] ?? { url: null, key: null },
}))
vi.mock('@/api/_auth.js', () => ({ exigirUsuario: async () => ({ user: 'x' }), soloMismoOrigen: () => false }))
vi.mock('@/api/_georef.js', () => ({ geocodificarEnEscalera: async () => new Map() }))

/**
 * El cliente de una marca. Se identifica por la URL que le pasaron a `createClient`, que es lo
 * único que `comparativa()` le da: así el fake sabe de qué store son las ventas que le piden.
 */
vi.mock('@supabase/supabase-js', () => ({
  createClient: (url: string) => {
    const store = Object.keys(cfg).find((s) => cfg[s].url === url) ?? '?'
    const api: Record<string, unknown> = {
      select: () => api,
      in: () => api,
      gte: () => api,
      order: () => api,
      not: () => api,
      limit: () => api,
      range: async () => {
        const a = Date.now()
        await new Promise((r) => setTimeout(r, demora[store] ?? 0))
        ventana[store] = [a - T0, Date.now() - T0]
        if (rompe === store) throw new Error(`la base de ${store} no contesta`)
        return { data: [{ product_id: 7, quantity: 3, ventas: { date_sale: '2026-09-01' } }], error: null }
      },
    }
    return { from: () => api }
  },
}))

let T0 = 0

/** El cliente del MONITOR, que `comparativa()` recibe como argumento. */
function monitor() {
  const tabla = (t: string) => {
    const api: Record<string, unknown> = {
      select: () => api,
      in: () => api,
      not: () => api,
      order: () => api,
      limit: () => api,
      range: async () => {
        if (t === 'proveedor_local') return { data: [{ id: 'L1', nombre: 'UNO', proveedor_id_ingresos: 11 }], error: null }
        // ⚠️ Los renglones vienen EMBEBIDOS en la orden, que es como los pide el handler desde el
        // 3-sep-2026: una consulta en vez de dos encadenadas.
        if (t === 'recepcion_oc')
          return {
            data: [
              {
                id: 'o-bdi',
                store: 'bdi',
                proveedor_id: 11,
                confirmada_at: '2026-08-01T00:00:00Z',
                lineas_recibidas: recorta === 'o-bdi' ? 2 : 1,
                recepcion_linea: [{ oc_ref: 'o-bdi', store: 'bdi', producto_id: '7', cantidad_contada: 5 }],
              },
              {
                id: 'o-zat',
                store: 'zattia',
                proveedor_id: 11,
                confirmada_at: '2026-08-01T00:00:00Z',
                lineas_recibidas: 1,
                recepcion_linea: [{ oc_ref: 'o-zat', store: 'zattia', producto_id: '7', cantidad_contada: 5 }],
              },
            ],
            error: null,
          }
        return { data: [], error: null }
      },
    }
    return api
  }
  return { from: tabla }
}

const { comparativa } = await import('@/api/_prm.js')

beforeEach(() => {
  for (const k of Object.keys(cfg)) delete cfg[k]
  for (const k of Object.keys(demora)) delete demora[k]
  ventana = {}
  rompe = null
  recorta = null
  T0 = Date.now()
})

describe('comparativa · las dos marcas', () => {
  it('🔴 las consulta EN PARALELO: la segunda arranca antes de que termine la primera', async () => {
    cfg.bdi = { url: 'u-bdi', key: 'k' }
    cfg.zattia = { url: 'u-zat', key: 'k' }
    demora.bdi = 120
    demora.zattia = 120

    const r = await comparativa(monitor(), 30)

    expect(r.marcasMudas).toEqual([])
    // El oráculo es el SOLAPE, ⛔ no el total: un total bajo también lo daría una base rápida.
    // ⚠️ Con margen: en la versión secuencial la segunda arranca EXACTO cuando termina la primera
    // (124 contra 124) y un `<` pelado sale cara o cruz. Las dos tardan 120 ms, así que en paralelo
    // la segunda arranca cerca de 0 y en fila arranca cerca de 120.
    const [ini1, fin1] = ventana.bdi
    const [ini2] = ventana.zattia
    expect(ini2).toBeLessThan(fin1 - 60)
    expect(Math.abs(ini2 - ini1)).toBeLessThan(60)
  })

  it('🔴 una marca sin credencial sale MUDA y ⛔ no se lleva puesta a la otra', async () => {
    cfg.bdi = { url: 'u-bdi', key: 'k' }
    cfg.zattia = { url: null, key: null }

    const r = await comparativa(monitor(), 30)

    expect(r.marcasMudas).toEqual(['zattia'])
    expect(r.ventasPorProducto).toEqual([{ store: 'bdi', producto_id: '7', unidades: 3 }])
  })

  it('🔴 una marca que TIRA sale muda, y la otra devuelve sus números igual', async () => {
    cfg.bdi = { url: 'u-bdi', key: 'k' }
    cfg.zattia = { url: 'u-zat', key: 'k' }
    rompe = 'zattia'

    const r = await comparativa(monitor(), 30)

    expect(r.marcasMudas).toEqual(['zattia'])
    expect(r.ventasPorProducto).toEqual([{ store: 'bdi', producto_id: '7', unidades: 3 }])
  })

  /**
   * 🔴 **El corte de mil filas de PostgREST existe TAMBIÉN adentro del embed, y es callado.** Sin
   * este guard, un proveedor aparece comprando menos de lo que compró y ⛔ nada falla: es el modo
   * de falla caro de siempre, mudado al lugar nuevo. `lineas_recibidas` lo escribe el mismo webhook
   * que guardó los renglones, así que decir cuántos guardó ⛔ no cuesta un viaje.
   */
  it('🔴 si el embed trae MENOS renglones de los que la OC guardó, TIRA', async () => {
    cfg.bdi = { url: 'u-bdi', key: 'k' }
    cfg.zattia = { url: 'u-zat', key: 'k' }
    recorta = 'o-bdi'

    await expect(comparativa(monitor(), 30)).rejects.toThrow(/o-bdi guardó 2 renglones y el embed trajo 1/)
  })

  it('🔴 el orden del resultado ⛔ no depende de cuál conteste primero', async () => {
    cfg.bdi = { url: 'u-bdi', key: 'k' }
    cfg.zattia = { url: 'u-zat', key: 'k' }
    // La que va primera en la lista es la que MÁS tarda: si el resultado se armara con el orden de
    // llegada, `bdi` saldría segunda.
    demora.bdi = 120
    demora.zattia = 10

    const r = await comparativa(monitor(), 30)

    expect(r.ventasPorProducto.map((v) => v.store)).toEqual(['bdi', 'zattia'])
  })
})
