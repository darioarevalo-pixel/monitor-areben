import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { traerDatos } from '@/lib/datos'
import { CUENTAS } from '@/lib/cuentas'

/**
 * Paridad de la capa de datos: que traerDatos le pida a Supabase EXACTAMENTE lo
 * mismo que fetchFresh (index.html:2060-2104).
 *
 * Por qué las URLs esperadas están escritas a mano acá: son las del legacy,
 * leídas de index.html. Un select de más o de menos no rompe nada visible —
 * simplemente el ETL computa sobre otras columnas y los números salen distintos
 * sin que nada falle. Este test es lo que hace ruidoso ese cambio.
 *
 * Sin red: el fetch se mockea. La paridad del ETL (etl-paridad.test.ts) sí usa
 * datos reales, pero para comparar queries alcanza con mirar qué se pide.
 */

const AHORA = new Date('2026-07-16T12:00:00.000Z')

/** URLs pedidas, en orden. */
let pedidas: string[] = []

function mockFetch(opciones: { totalPorTabla?: Record<string, number>; filas?: (t: string) => unknown[]; falla?: (url: string) => boolean } = {}) {
  const { totalPorTabla = {}, filas = () => [], falla = () => false } = opciones

  return vi.fn(async (url: string) => {
    pedidas.push(url)

    if (url.includes('api.github.com')) {
      return new Response(JSON.stringify({ workflow_runs: [] }), { status: 200 })
    }
    if (falla(url)) {
      return new Response('column does not exist', { status: 400 })
    }

    const tabla = url.split('/rest/v1/')[1]?.split('?')[0] ?? ''
    const total = totalPorTabla[tabla] ?? 0
    return new Response(JSON.stringify(filas(tabla)), {
      status: 200,
      headers: { 'Content-Range': `0-0/${total}` },
    })
  })
}

/** La parte de query de la URL de una tabla (la primera vez que se pide). */
function queryDe(tabla: string): string {
  const url = pedidas.find((u) => u.includes(`/rest/v1/${tabla}?`))
  if (!url) throw new Error(`No se pidió la tabla ${tabla}. Pedidas: ${pedidas.join(', ')}`)
  return decodeURIComponent(url.split('?')[1])
}

/**
 * El valor exacto del parámetro `select` de una tabla.
 *
 * Existe porque `toContain` sobre la query entera **no detecta columnas de más**:
 * 'select=id,date_sale' está contenido en 'select=id,date_sale,extra'. Con una
 * columna de más el ETL computa sobre datos que el legacy no ve, y nada falla.
 * Verificado con un mutante: `toContain` lo dejaba pasar, esto no.
 */
function selectDe(tabla: string): string {
  const select = new URLSearchParams(queryDe(tabla)).get('select')
  if (!select) throw new Error(`La query de ${tabla} no tiene select: ${queryDe(tabla)}`)
  return select
}

beforeEach(() => { pedidas = [] })
afterEach(() => { vi.unstubAllGlobals() })

describe('traerDatos: mismos queries que fetchFresh', () => {
  it('BDI: los selects del legacy, tal cual', async () => {
    vi.stubGlobal('fetch', mockFetch())
    await traerDatos({ marca: 'bdi', rol: 'admin', today: AHORA })

    expect(selectDe('productos')).toBe('id,name,category,sku,retailer_price,unit_cost,created_at,active')
    expect(queryDe('productos')).toContain('active=eq.1')
    expect(selectDe('inventario')).toBe('product_id,product_name,size_id,size_name,available_quantity,store_name,sku,barcode')
    expect(selectDe('ventas_por_mes')).toBe('mes,channel,cantidad_ventas,total_items,promedio_items_por_venta')
    expect(selectDe('ventas_por_categoria_mes')).toBe('mes,categoria,total_items')
    expect(selectDe('fundas_por_modelo_mes')).toBe('mes,modelo,product_id,product_name,product_created_at,total_items')
    expect(selectDe('ventas')).toBe('id,date_sale,channel,channel_id')
    expect(selectDe('venta_detalles')).toBe('sale_id,product_id,size_id,size,quantity')
  })

  it('BDI no pide variante_color_manual: la tabla es de Zattia', async () => {
    vi.stubGlobal('fetch', mockFetch())
    const datos = await traerDatos({ marca: 'bdi', rol: 'admin', today: AHORA })

    expect(pedidas.some((u) => u.includes('variante_color_manual'))).toBe(false)
    expect(datos.colorManual).toEqual([])
  })

  it('Zattia: productos trae proveedor, ventas no trae channel_id, y no pide fundas', async () => {
    vi.stubGlobal('fetch', mockFetch())
    const datos = await traerDatos({ marca: 'zattia', rol: 'admin', today: AHORA })

    expect(selectDe('productos')).toBe('id,name,category,sku,proveedor,retailer_price,unit_cost,created_at,active')
    expect(selectDe('ventas')).toBe('id,date_sale,channel')
    expect(selectDe('variante_color_manual')).toBe('product_name,color')
    // Zattia no vende fundas: el legacy ni pide la tabla (index.html:2081).
    expect(pedidas.some((u) => u.includes('fundas_por_modelo_mes'))).toBe(false)
    expect(datos.vmFundas).toEqual([])
  })

  it('pega a la URL de la cuenta que corresponde', async () => {
    vi.stubGlobal('fetch', mockFetch())
    await traerDatos({ marca: 'zattia', rol: 'admin', today: AHORA })
    expect(pedidas.every((u) => u.startsWith(CUENTAS.zattia.url) || u.includes('api.github.com'))).toBe(true)
  })
})

describe('rango de ventas por rol (index.html:2084)', () => {
  it('admin: desde 2025-01-01', async () => {
    vi.stubGlobal('fetch', mockFetch())
    await traerDatos({ marca: 'bdi', rol: 'admin', today: AHORA })
    expect(queryDe('ventas')).toContain('date_sale=gte.2025-01-01')
  })

  // No es cosmético: recorta el rango de TODO lo que el ETL computa.
  it('marketing: solo los últimos 35 días', async () => {
    vi.stubGlobal('fetch', mockFetch())
    await traerDatos({ marca: 'bdi', rol: 'marketing', today: AHORA })
    expect(queryDe('ventas')).toContain('date_sale=gte.2026-06-11')
  })
})

describe('detalles y paginación', () => {
  it('venta_detalles se filtra por el mínimo id de ventas, no por la tabla entera', async () => {
    vi.stubGlobal('fetch', mockFetch({
      totalPorTabla: { ventas: 3 },
      filas: (t) => (t === 'ventas' ? [{ id: 771 }, { id: 55 }, { id: 900 }] : []),
    }))
    await traerDatos({ marca: 'bdi', rol: 'admin', today: AHORA })
    expect(queryDe('venta_detalles')).toContain('sale_id=gte.55')
  })

  it('sin ventas, detalles arranca en 0 (y no rompe)', async () => {
    vi.stubGlobal('fetch', mockFetch())
    await traerDatos({ marca: 'bdi', rol: 'admin', today: AHORA })
    expect(queryDe('venta_detalles')).toContain('sale_id=gte.0')
  })

  it('más de 1000 filas: pagina de a 1000 pidiendo los offsets que faltan', async () => {
    vi.stubGlobal('fetch', mockFetch({
      totalPorTabla: { productos: 2500 },
      filas: (t) => (t === 'productos' ? Array.from({ length: 1000 }, (_, i) => ({ id: i })) : []),
    }))
    await traerDatos({ marca: 'bdi', rol: 'admin', today: AHORA })

    const offsets = pedidas.filter((u) => u.includes('/productos?')).map((u) => u.match(/offset=(\d+)/)?.[1])
    expect(offsets).toEqual(['0', '1000', '2000'])
  })
})

describe('degradados: el legacy sigue andando y el port también', () => {
  // index.html:2077: algunas bases no tienen sku/barcode en inventario.
  it('si inventario no tiene sku/barcode, reintenta con el select corto', async () => {
    vi.stubGlobal('fetch', mockFetch({ falla: (u) => u.includes('/inventario?') && u.includes('barcode') }))
    const datos = await traerDatos({ marca: 'bdi', rol: 'admin', today: AHORA })

    const inv = pedidas.filter((u) => u.includes('/inventario?'))
    expect(inv.some((u) => u.includes('barcode'))).toBe(true)
    expect(inv.some((u) => !u.includes('barcode'))).toBe(true)
    expect(datos.inventario).toEqual([])
  })

  // index.html:2065: el .catch(() => []) del legacy.
  it('si variante_color_manual falla, Zattia sigue sin colores', async () => {
    vi.stubGlobal('fetch', mockFetch({ falla: (u) => u.includes('variante_color_manual') }))
    const datos = await traerDatos({ marca: 'zattia', rol: 'admin', today: AHORA })
    expect(datos.colorManual).toEqual([])
  })

  it('si GitHub no contesta, syncMeta queda null y los datos llegan igual', async () => {
    vi.stubGlobal('fetch', mockFetch({ falla: (u) => u.includes('api.github.com') }))
    const datos = await traerDatos({ marca: 'bdi', rol: 'admin', today: AHORA })
    expect(datos.syncMeta).toBeNull()
    expect(datos.productos).toEqual([])
  })
})

describe('el payload tiene el contrato que espera el caché del legacy', () => {
  // saveCache (index.html:2082) guarda estas 9 claves. Si el shell escribe otras,
  // el iframe lee un caché que no entiende: dos mundos, números distintos.
  it('las 9 claves de saveCache, ni una más ni una menos', async () => {
    vi.stubGlobal('fetch', mockFetch())
    const datos = await traerDatos({ marca: 'bdi', rol: 'admin', today: AHORA })

    expect(Object.keys(datos).sort()).toEqual(
      ['colorManual', 'detalles', 'inventario', 'productos', 'syncMeta', 'ventas', 'vmCat', 'vmFundas', 'vmMes'].sort(),
    )
  })
})
