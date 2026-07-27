import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { asegurarIndices, indicesCacheados, indicesDe, invalidarAudit, traerAudit } from '@/lib/tn-audit'
import { bustAudit } from '@/lib/tncat/cliente'
import type { TnProducto } from '@/lib/tn'

/**
 * El caché único del catálogo de TiendaNube.
 *
 * Lo que se está protegiendo acá no es un cálculo: es la CANTIDAD DE BAJADAS del catálogo
 * entero. Antes había dos caminos al mismo endpoint y `/tncat/fotos` lo bajaba dos veces, una
 * de ellas en la versión `?variantes=1`, que pesa el doble. Un bug de caché no rompe nada
 * visible — simplemente se vuelve a pagar la bajada y nadie se entera. Por eso los tests
 * cuentan URLs pedidas.
 *
 * Sin red: el fetch se mockea. En entorno node `apiFetch` sale sin credencial (no hay
 * localStorage del que leer la sesión), que para contar bajadas da igual.
 */

let pedidas: string[] = []

function mockFetch(opts: { falla?: (url: string) => boolean; demora?: (url: string) => Promise<void> } = {}) {
  const { falla = () => false, demora } = opts
  return vi.fn(async (url: string) => {
    pedidas.push(url)
    if (demora) await demora(url)
    if (falla(url)) return new Response('boom', { status: 500 })
    const conVariantes = url.includes('variantes=1')
    const products = [
      { id: 1, sku: 'ABC-1', name: 'Remera Negra', images: ['a.jpg'], ...(conVariantes ? { variantes: [{ color: 'Negro' }] } : {}) },
      { id: 2, sku: 'ABC-2', name: 'Buzo Gris', images: [], ...(conVariantes ? { variantes: [{ color: 'Gris' }] } : {}) },
    ]
    return new Response(JSON.stringify({ products }), { status: 200 })
  })
}

const delAudit = () => pedidas.filter((u) => u.includes('tiendanube-audit'))
const livianas = () => delAudit().filter((u) => !u.includes('variantes=1'))
const pesadas = () => delAudit().filter((u) => u.includes('variantes=1'))

beforeEach(() => {
  pedidas = []
  invalidarAudit('bdi')
  invalidarAudit('zattia')
})
afterEach(() => { vi.unstubAllGlobals() })

describe('una sola bajada del catálogo', () => {
  it('dos pedidos seguidos del mismo nivel bajan una vez', async () => {
    vi.stubGlobal('fetch', mockFetch())
    const [a, b] = await Promise.all([traerAudit('bdi'), traerAudit('bdi')])

    expect(delAudit()).toHaveLength(1)
    expect(a).toBe(b) // el mismo array, no dos copias
  })

  it('pedir de nuevo después de que terminó tampoco vuelve a bajar', async () => {
    vi.stubGlobal('fetch', mockFetch())
    await traerAudit('bdi')
    await traerAudit('bdi')
    expect(delAudit()).toHaveLength(1)
  })

  // El motivo de todo esto: `?variantes=1` devuelve el MISMO objeto con dos campos de más.
  it('el payload con variantes le sirve al que pide el liviano', async () => {
    vi.stubGlobal('fetch', mockFetch())
    await traerAudit('bdi', { variantes: true })
    await traerAudit('bdi')

    expect(pesadas()).toHaveLength(1)
    expect(livianas()).toHaveLength(0)
  })

  it('si el pesado está EN VUELO, el liviano lo espera en vez de pedir el suyo', async () => {
    let soltar = () => {}
    const colgado = new Promise<void>((r) => { soltar = r })
    vi.stubGlobal('fetch', mockFetch({ demora: (u) => (u.includes('variantes=1') ? colgado : Promise.resolve()) }))

    const pesado = traerAudit('bdi', { variantes: true })
    const liviano = traerAudit('bdi') // sale mientras el otro está colgado
    soltar()
    expect(await liviano).toBe(await pesado)

    expect(livianas()).toHaveLength(0)
    expect(pesadas()).toHaveLength(1)
  })

  // Al revés NO vale: el liviano no tiene el detalle por variante que la card necesita.
  it('el liviano ya bajado NO le ahorra la bajada al que pide variantes', async () => {
    vi.stubGlobal('fetch', mockFetch())
    await traerAudit('bdi')
    await traerAudit('bdi', { variantes: true })

    expect(livianas()).toHaveLength(1)
    expect(pesadas()).toHaveLength(1)
  })

  it('cada marca tiene lo suyo', async () => {
    vi.stubGlobal('fetch', mockFetch())
    await traerAudit('bdi')
    await traerAudit('zattia')

    expect(delAudit()).toHaveLength(2)
    expect(delAudit().every((u) => u.includes('store='))).toBe(true)
  })
})

describe('cuándo SÍ se vuelve a bajar', () => {
  it('refrescar saltea los dos cachés, el de acá y el de allá', async () => {
    vi.stubGlobal('fetch', mockFetch())
    await traerAudit('bdi')
    await traerAudit('bdi', { refrescar: true })

    expect(livianas()).toHaveLength(2)
    expect(livianas()[1]).toContain('refresh=1')
  })

  // Si no, un refresh del pesado dejaría al liviano sirviendo la tienda de antes de escribir.
  it('refrescar un nivel también tira el otro', async () => {
    vi.stubGlobal('fetch', mockFetch())
    await traerAudit('bdi')
    await traerAudit('bdi', { variantes: true, refrescar: true })
    pedidas = []
    await traerAudit('bdi')

    expect(livianas()).toHaveLength(0) // se sirve del pesado recién traído
  })

  it('invalidarAudit obliga a bajar de nuevo', async () => {
    vi.stubGlobal('fetch', mockFetch())
    await traerAudit('bdi')
    invalidarAudit('bdi')
    await traerAudit('bdi')

    expect(livianas()).toHaveLength(2)
  })

  // bustAudit se llama después de ESCRIBIR en la tienda: si no tirara el caché local, la
  // pantalla seguiría mostrando la tienda de antes del cambio.
  it('bustAudit tira el caché local aunque la llamada al server falle', async () => {
    vi.stubGlobal('fetch', mockFetch({ falla: (u) => u.includes('refresh=1') }))
    await traerAudit('bdi')
    await bustAudit('bdi')
    pedidas = []
    await traerAudit('bdi')

    expect(livianas()).toHaveLength(1)
  })
})

describe('degradados', () => {
  it('si el pesado en vuelo se cae, el liviano se baja igual', async () => {
    let soltar = () => {}
    const colgado = new Promise<void>((r) => { soltar = r })
    vi.stubGlobal('fetch', mockFetch({
      demora: (u) => (u.includes('variantes=1') ? colgado : Promise.resolve()),
      falla: (u) => u.includes('variantes=1'),
    }))

    const pesado = traerAudit('bdi', { variantes: true })
    const liviano = traerAudit('bdi')
    soltar()

    await expect(pesado).rejects.toThrow()
    expect(await liviano).toHaveLength(2)
    expect(livianas()).toHaveLength(1)
  })

  it('un error no queda cacheado: el próximo pedido reintenta', async () => {
    let rompe = true
    vi.stubGlobal('fetch', mockFetch({ falla: () => rompe }))
    await expect(traerAudit('bdi')).rejects.toThrow()
    rompe = false
    expect(await traerAudit('bdi')).toHaveLength(2)
  })

  it('asegurarIndices no lanza si TN se cae: índices vacíos, como el legacy', async () => {
    vi.stubGlobal('fetch', mockFetch({ falla: () => true }))
    const { fotos, promo } = await asegurarIndices('bdi')
    expect(Object.keys(fotos.bySku)).toHaveLength(0)
    expect(Object.keys(promo.bySku)).toHaveLength(0)
  })
})

describe('índices derivados', () => {
  it('fotos deja afuera a los productos sin imagen; promo los trae a todos', async () => {
    vi.stubGlobal('fetch', mockFetch())
    const { fotos, promo } = await asegurarIndices('bdi')

    expect(Object.keys(fotos.bySku)).toEqual(['abc-1'])
    expect(Object.keys(promo.bySku).sort()).toEqual(['abc-1', 'abc-2'])
  })

  // Indexar la tienda entera dos veces por cada card que lo pide no es gratis.
  it('el mismo payload no se re-indexa', async () => {
    vi.stubGlobal('fetch', mockFetch())
    const productos = await traerAudit<TnProducto>('bdi')
    expect(indicesDe(productos)).toBe(indicesDe(productos))
  })

  it('indicesCacheados es undefined hasta que el catálogo está bajado', async () => {
    vi.stubGlobal('fetch', mockFetch())
    expect(indicesCacheados('bdi')).toBeUndefined()
    await traerAudit('bdi')
    expect(indicesCacheados('bdi')?.fotos).toBeDefined()
  })
})
