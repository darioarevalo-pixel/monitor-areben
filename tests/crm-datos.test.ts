import { describe, it, expect, vi, afterEach } from 'vitest'
import { traerVentas, traerClientes, traerDetalles } from '@/lib/crm/datos'
import type { MapaSeguimiento } from '@/lib/crm/tipos'

/**
 * Paridad de las CONSULTAS, no de los datos: que traerVentas/traerClientes le
 * pidan a Supabase exactamente lo mismo que cargarCRM (index.html:13188-13260).
 *
 * Por qué importa tanto como la paridad de números: un `select` de más o de menos
 * no rompe nada visible — simplemente el agregado computa sobre otras columnas y
 * los totales salen distintos, sin un solo error en consola.
 *
 * Las URLs esperadas están escritas a mano, leídas del legacy. Si alguien cambia
 * la consulta del port, este test lo caza aunque los tests de core.ts sigan verdes.
 */

/**
 * Devuelve las query strings de todas las llamadas, en orden.
 *
 * `total` simula el header Content-Range de PostgREST. Por defecto vale el largo
 * del cuerpo, que es lo normal; se pasa a mano solo para forzar la paginación
 * (una página llena con un total mayor).
 */
function espiarFetch(respuestas: unknown[][] = [], total?: number) {
  let i = 0
  const urls: string[] = []
  const spy = vi.fn((url: string) => {
    urls.push(String(url))
    const body = respuestas[i++] ?? []
    const t = total ?? body.length
    return Promise.resolve({
      ok: true,
      status: 200,
      headers: { get: (h: string) => (h.toLowerCase() === 'content-range' ? `0-${Math.max(0, body.length - 1)}/${t}` : null) },
      json: async () => body,
      text: async () => JSON.stringify(body),
    })
  })
  vi.stubGlobal('fetch', spy)
  return { urls }
}

/** La parte que importa: tabla + select + filtros, sin el host ni la paginación. */
const consulta = (url: string) => decodeURIComponent(url.split('/rest/v1/')[1] || '').replace(/&?(limit|offset)=\d+/g, '')

afterEach(() => vi.unstubAllGlobals())

const SEG: MapaSeguimiento = {
  '111': { es_mayorista: true },
  '222': { es_mayorista: true },
  '333': { cadencia: 'semanal' }, // NO marcado: no debe entrar en la consulta
}

describe('traerVentas · modo Mayorista', () => {
  it('pide el canal 10 y además TODAS las ventas de los marcados ★', async () => {
    const { urls } = espiarFetch()
    await traerVentas('10', SEG)

    expect(consulta(urls[0])).toBe(
      'ventas?select=id,date_sale,total_price,client_id,channel_id,sale_state&channel_id=eq.10&client_id=not.is.null&order=date_sale.desc',
    )
    // Solo los marcados, y no el 333.
    expect(consulta(urls[1])).toBe(
      'ventas?select=id,date_sale,total_price,client_id,channel_id,sale_state&client_id=in.(111,222)&client_id=not.is.null',
    )
    expect(urls).toHaveLength(2)
  })

  it('dedupe por id: una venta que está en las dos consultas se cuenta una vez', async () => {
    const v = (id: number, client_id: number) => ({ id, client_id, date_sale: '2026-07-01', total_price: 10, channel_id: 10, sale_state: 'ok' })
    espiarFetch([
      [v(1, 111), v(2, 111)], // porCanal
      [v(2, 111), v(3, 222)], // porMarcados: el 2 se repite
    ])
    const out = await traerVentas('10', SEG)
    expect(out.map((x) => x.id).sort()).toEqual([1, 2, 3])
  })

  it('sin clientes marcados no pide el segundo lote', async () => {
    const { urls } = espiarFetch()
    await traerVentas('10', { '333': { cadencia: 'semanal' } })
    expect(urls).toHaveLength(1)
  })

  it('los marcados van en lotes de 150, como el legacy', async () => {
    const muchos: MapaSeguimiento = {}
    for (let i = 1; i <= 274; i++) muchos[String(i)] = { es_mayorista: true } // los 274 reales
    const { urls } = espiarFetch()
    await traerVentas('10', muchos)
    // 1 del canal + 2 lotes (150 + 124)
    expect(urls).toHaveLength(3)
    expect(consulta(urls[1])).toContain('client_id=in.(' + Array.from({ length: 150 }, (_, i) => i + 1).join(',') + ')')
    expect(consulta(urls[2])).toContain('client_id=in.(' + Array.from({ length: 124 }, (_, i) => i + 151).join(',') + ')')
  })
})

describe('traerVentas · modo Todos los canales', () => {
  it('es una sola consulta sin filtro de canal, y no mira los marcados', async () => {
    const { urls } = espiarFetch()
    await traerVentas('all', SEG)
    expect(consulta(urls[0])).toBe(
      'ventas?select=id,date_sale,total_price,client_id,channel_id,sale_state&client_id=not.is.null&order=date_sale.desc',
    )
    expect(urls).toHaveLength(1)
  })
})

describe('traerClientes', () => {
  it('pide los ids únicos de las ventas, en lotes de 200', async () => {
    const ventas = Array.from({ length: 250 }, (_, i) => ({ id: i, client_id: i + 1, date_sale: null, total_price: 0, channel_id: 10, sale_state: null }))
    const { urls } = espiarFetch()
    await traerClientes(ventas)
    expect(urls).toHaveLength(2)
    expect(consulta(urls[0])).toContain('clientes?select=id,name,email,phone,city,province&id=in.(1,2,')
  })

  it('ignora las ventas sin client_id y no repite ids', async () => {
    const v = (client_id: number | null) => ({ id: 1, client_id, date_sale: null, total_price: 0, channel_id: 10, sale_state: null })
    const { urls } = espiarFetch()
    await traerClientes([v(5), v(5), v(null), v(7)])
    expect(consulta(urls[0])).toContain('id=in.(5,7)')
  })
})

describe('traerDetalles', () => {
  it('pide en lotes de 150 sale_ids', async () => {
    const { urls } = espiarFetch()
    await traerDetalles(Array.from({ length: 160 }, (_, i) => i + 1))
    expect(urls).toHaveLength(2)
    expect(consulta(urls[0])).toContain('venta_detalles?select=sale_id,product_name,size,quantity,unit_price,total&sale_id=in.(1,')
  })
})

describe('todo pagina', () => {
  it('traerVentas pide la página siguiente cuando la primera vino llena', async () => {
    // PostgREST corta en 1000 sin avisar: el legacy pedía este lote sin paginar y
    // eran 445 ventas y $12,5M sin contar (f8977ca).
    const llena = Array.from({ length: 1000 }, (_, i) => ({ id: i, client_id: 111, date_sale: null, total_price: 0, channel_id: 10, sale_state: null }))
    const extra = [{ id: 9999, client_id: 111, date_sale: null, total_price: 0, channel_id: 10, sale_state: null }]
    // total=1001 con una primera página de 1000: es exactamente la forma que tiene
    // el truncado silencioso de PostgREST cuando hay más filas de las que devuelve.
    const { urls } = espiarFetch([[], llena, extra], 1001)
    const out = await traerVentas('10', { '111': { es_mayorista: true } })
    expect(urls.some((u) => u.includes('offset=1000'))).toBe(true)
    expect(out.map((v) => v.id)).toContain(9999)
  })
})
