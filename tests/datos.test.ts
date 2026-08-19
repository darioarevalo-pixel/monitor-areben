import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { desdeVentas, traerDatos } from '@/lib/datos'
import { CUENTAS } from '@/lib/cuentas'
import { esVentaTecnica } from '@/lib/etl/helpers'

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
/** Los dos cortes de `AHORA`, calculados con la misma función que usa el store. */
const DESDE_ADMIN = desdeVentas(true, AHORA)
const DESDE_CORTO = desdeVentas(false, AHORA)

/** URLs pedidas, en orden. */
let pedidas: string[] = []

/**
 * Traduce un pedido a la puerta en la URL de PostgREST equivalente, y lo anota en `pedidas`.
 *
 * **Nada del ETL se le pide ya a Supabase con la anon key**: `inventario` y las tres vistas se
 * fueron en el escalón 4 de la Fase S, y `ventas`, `venta_detalles`, `productos` y
 * `variante_color_manual` en el 5. Todo va por `api/datos?recurso=espejo`, con la clave de servicio
 * y sesión. La consulta viaja igual, sólo que en el body, así que acá se reconstruye la URL
 * equivalente y **todas las aserciones de select de este archivo siguen midiendo lo mismo**. Lo que
 * cambió es el transporte, no lo que se pide, y eso es lo que este archivo tiene que seguir
 * vigilando: un select de más o de menos no rompe nada visible.
 *
 * 🔑 **Está afuera de `mockFetch` porque tres tests arman su propio doble.** Cuando vivía adentro,
 * los otros dos leían `/rest/v1/` de una URL que ya no lo tenía y medían sobre la tabla vacía.
 */
function comoPostgrest(url: string, opts?: RequestInit): string {
  pedidas.push(url)
  if (!url.includes('recurso=espejo')) return url
  const b = JSON.parse(String(opts?.body || '{}')) as { store?: string; tabla?: string; params?: string }
  const equivalente = `${b.store === 'zattia' ? CUENTAS.zattia.url : CUENTAS.bdi.url}/rest/v1/${b.tabla}?${b.params}`
  pedidas.push(equivalente)
  return equivalente
}

function mockFetch(opciones: { totalPorTabla?: Record<string, number>; filas?: (t: string, url: string) => unknown[]; falla?: (url: string) => boolean } = {}) {
  const { totalPorTabla = {}, filas = () => [], falla = () => false } = opciones

  return vi.fn(async (url: string, opts?: RequestInit) => {
    url = comoPostgrest(url, opts)

    if (url.includes('api.github.com')) {
      return new Response(JSON.stringify({ workflow_runs: [] }), { status: 200 })
    }
    if (falla(url)) {
      return new Response('column does not exist', { status: 400 })
    }

    const tabla = url.split('/rest/v1/')[1]?.split('?')[0] ?? ''
    const total = totalPorTabla[tabla] ?? 0
    return new Response(JSON.stringify(filas(tabla, url)), {
      status: 200,
      headers: { 'Content-Range': `0-0/${total}` },
    })
  })
}

/**
 * La consulta de UNA fila que saca el mínimo id de ventas, para que `venta_detalles` no tenga
 * que esperar a que baje la tabla entera. Es una segunda llamada a `ventas`, así que hay que
 * distinguirla de la de verdad — si no, `selectDe('ventas')` mide la sonda.
 */
const esSonda = (u: string) => u.includes('/rest/v1/ventas?') && u.includes('select=id&')

/** La parte de query de la URL de una tabla (la primera vez que se pide, sin contar la sonda). */
function queryDe(tabla: string): string {
  const url = pedidas.find((u) => u.includes(`/rest/v1/${tabla}?`) && !esSonda(u))
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
    await traerDatos({ marca: 'bdi', desde: DESDE_ADMIN })

    // 🔑 **Sin `unit_cost`**: el costo salió del navegador con la pieza B del escalón 3 de la Fase
    // S. Lo sirve `api/_costos.js` gateado por permiso y se mergea sobre estas mismas filas.
    expect(selectDe('productos')).toBe('id,name,category,sku,retailer_price,created_at,active')
    expect(queryDe('productos')).toContain('active=eq.1')
    expect(selectDe('inventario')).toBe('product_id,product_name,size_id,size_name,available_quantity,store_name,sku,barcode')
    expect(selectDe('ventas_por_mes')).toBe('mes,channel,cantidad_ventas,total_items,promedio_items_por_venta')
    expect(selectDe('ventas_por_categoria_mes')).toBe('mes,categoria,total_items')
    expect(selectDe('fundas_por_modelo_mes')).toBe('mes,modelo,product_id,product_name,product_created_at,total_items')
    expect(selectDe('ventas')).toBe('id,date_sale,channel,channel_id')
    expect(selectDe('venta_detalles')).toBe('sale_id,product_id,size_id,size,quantity')
  })

  it('el espejo de GN NO se le pide a Supabase con la anon key: va por la puerta', async () => {
    // 🔴 El escalón 4 de la Fase S. Con la anon key desde afuera, `inventario` entregaba 7.195
    // filas y las tres vistas la curva mensual del negocio, a cualquiera que abriera la página.
    // Que el select siga siendo el mismo lo miran los tests de arriba; lo que mira éste es **por
    // dónde sale**, que es lo único que el revoke de la base va a permitir.
    vi.stubGlobal('fetch', mockFetch())
    await traerDatos({ marca: 'bdi', desde: DESDE_ADMIN })

    for (const t of ['inventario', 'ventas_por_mes', 'ventas_por_categoria_mes', 'fundas_por_modelo_mes']) {
      expect(pedidas.some((u) => u.startsWith(CUENTAS.bdi.url) && u.includes(`/rest/v1/${t}?`))).toBe(true)
      // La URL de arriba es la reconstruida por el mock: lo que salió de verdad fue la puerta.
      expect(pedidas.filter((u) => u.includes('recurso=espejo')).length).toBeGreaterThan(0)
    }
  })

  it('BDI no pide variante_color_manual: la tabla es de Zattia', async () => {
    vi.stubGlobal('fetch', mockFetch())
    const datos = await traerDatos({ marca: 'bdi', desde: DESDE_ADMIN })

    expect(pedidas.some((u) => u.includes('variante_color_manual'))).toBe(false)
    expect(datos.colorManual).toEqual([])
  })

  it('Zattia: productos trae proveedor, ventas no trae channel_id, y no pide fundas', async () => {
    vi.stubGlobal('fetch', mockFetch())
    const datos = await traerDatos({ marca: 'zattia', desde: DESDE_ADMIN })

    expect(selectDe('productos')).toBe('id,name,category,sku,proveedor,retailer_price,created_at,active')
    expect(selectDe('ventas')).toBe('id,date_sale,channel')
    expect(selectDe('variante_color_manual')).toBe('product_name,color')
    // Zattia no vende fundas: el legacy ni pide la tabla (index.html:2081).
    expect(pedidas.some((u) => u.includes('fundas_por_modelo_mes'))).toBe(false)
    expect(datos.vmFundas).toEqual([])
  })

  it('pega a la URL de la cuenta que corresponde', async () => {
    vi.stubGlobal('fetch', mockFetch())
    await traerDatos({ marca: 'zattia', desde: DESDE_ADMIN })
    // `/api/datos?recurso=costos` es del propio monitor, no de Supabase: es la puerta por la que
    // entra `unit_cost` desde que salió del navegador.
    expect(
      pedidas.every((u) => u.startsWith(CUENTAS.zattia.url) || u.includes('api.github.com') || u.includes('/api/datos')),
    ).toBe(true)
  })

  it('el costo NO se le pide a Supabase: entra por la puerta del monitor', async () => {
    // 🔴 El test que se rompe si alguien vuelve a poner `unit_cost` en el select del ETL. Ese select
    // corre con la **anon key**, que viaja en el bundle: es exactamente lo que la pieza B cerró.
    vi.stubGlobal('fetch', mockFetch())
    await traerDatos({ marca: 'bdi', desde: DESDE_ADMIN })
    expect(pedidas.some((u) => u.includes('unit_cost'))).toBe(false)
    expect(pedidas.some((u) => u.includes('/api/datos?recurso=costos'))).toBe(true)
  })

  it('el costo que devuelve la puerta se pega a la fila del producto', async () => {
    // El camino feliz del merge. Sin esto, "no se le pide a Supabase" pasaría igual con el costo
    // perdiéndose del todo, que es la otra mitad del bug posible.
    vi.stubGlobal('fetch', vi.fn(async (url: string, opts?: RequestInit) => {
      if (url.includes('recurso=costos')) {
        pedidas.push(url)
        return new Response(JSON.stringify({ ok: true, costos: { '7': 4500 } }), { status: 200 })
      }
      url = comoPostgrest(url, opts)
      if (url.includes('api.github.com')) return new Response(JSON.stringify({ workflow_runs: [] }), { status: 200 })
      const tabla = url.split('/rest/v1/')[1]?.split('?')[0] ?? ''
      const filas = tabla === 'productos' ? [{ id: 7 }, { id: 9 }] : []
      return new Response(JSON.stringify(filas), { status: 200, headers: { 'Content-Range': '0-0/0' } })
    }))
    const datos = await traerDatos({ marca: 'bdi', desde: DESDE_ADMIN })
    expect(datos.productos.find((p) => String(p.id) === '7')?.unit_cost).toBe(4500)
    // El que la puerta no devolvió queda en `null`, que es lo que `computarDatos` lee como
    // `sinCosto` — el mismo estado que cuando GN no manda el costo.
    expect(datos.productos.find((p) => String(p.id) === '9')?.unit_cost).toBeNull()
  })

  it('si la puerta de costos se cae, la carga termina igual y todo queda sin costo', async () => {
    // El costo es un enriquecimiento opcional: quien no lo puede ver —o el día que la puerta falle—
    // igual necesita que el Monitor abra. `traerCostos` no lanza nunca.
    vi.stubGlobal('fetch', mockFetch({ falla: (u) => u.includes('recurso=costos') }))
    const datos = await traerDatos({ marca: 'bdi', desde: DESDE_ADMIN })
    expect(datos.productos.every((p) => p.unit_cost == null)).toBe(true)
  })
})

describe('desdeVentas: el corte de la ventana', () => {
  /**
   * 🔴 **La ventana cuelga del PERMISO, no del flag de admin** (18-ago-2026). Antes era
   * `rol === 'marketing' ? 35 días : todo`, y al abrirle «Por producto» y «Ventas mensuales» a
   * Marketing eso habría mostrado **35 días de ventas bajo una columna que dice 90**, sin un error.
   * Quién tiene historia completa lo decide `veVentasHistoricas` (`lib/permisos.core.js`); acá sólo
   * se prueba que el booleano se traduzca al corte.
   */
  it('con historia completa, desde el piso histórico', () => {
    expect(desdeVentas(true, AHORA)).toBe('2025-01-01')
  })

  it('sin historia completa, los últimos 35 días', () => {
    expect(desdeVentas(false, AHORA)).toBe('2026-06-11')
  })

  // La mitad que hace falta para que el test de arriba no pase por casualidad: el corto SE MUEVE
  // con el día y el largo NO. Un `desdeVentas` que devolviera siempre la misma fecha pasaría los
  // dos primeros casos.
  it('el corte corto se mueve con el día y el largo no', () => {
    const otroMes = new Date('2026-09-20T12:00:00.000Z')
    expect(desdeVentas(false, otroMes)).toBe('2026-08-16')
    expect(desdeVentas(true, otroMes)).toBe('2025-01-01')
  })
})

describe('rango de ventas, tal como se lo pide a Supabase', () => {
  it('el corte largo viaja al filtro de `ventas`', async () => {
    vi.stubGlobal('fetch', mockFetch())
    await traerDatos({ marca: 'bdi', desde: DESDE_ADMIN })
    expect(queryDe('ventas')).toContain('date_sale=gte.2025-01-01')
  })

  // No es cosmético: recorta el rango de TODO lo que el ETL computa.
  it('y el corto también', async () => {
    vi.stubGlobal('fetch', mockFetch())
    await traerDatos({ marca: 'bdi', desde: DESDE_CORTO })
    expect(queryDe('ventas')).toContain('date_sale=gte.2026-06-11')
  })
})

describe('detalles y paginación', () => {
  it('venta_detalles se filtra por el mínimo id de ventas, no por la tabla entera', async () => {
    vi.stubGlobal('fetch', mockFetch({
      filas: (t, url) => (t === 'ventas' && esSonda(url) ? [{ id: 55 }] : []),
    }))
    await traerDatos({ marca: 'bdi', desde: DESDE_ADMIN })
    expect(queryDe('venta_detalles')).toContain('sale_id=gte.55')
  })

  // El mínimo se pide con el MISMO filtro que la tabla `ventas`: si la sonda mirara otro rango,
  // traería detalles de ventas que el ETL no tiene, o le faltarían los de las que sí.
  it('la sonda del mínimo usa el mismo rango de fechas que ventas', async () => {
    vi.stubGlobal('fetch', mockFetch())
    await traerDatos({ marca: 'bdi', desde: DESDE_CORTO })

    const sonda = pedidas.find(esSonda)
    expect(sonda).toBeDefined()
    expect(decodeURIComponent(sonda!)).toContain('date_sale=gte.2026-06-11')
    expect(decodeURIComponent(sonda!)).toContain('order=id&limit=1')
  })

  it('sin ventas, detalles arranca en 0 (y no rompe)', async () => {
    vi.stubGlobal('fetch', mockFetch())
    await traerDatos({ marca: 'bdi', desde: DESDE_ADMIN })
    expect(queryDe('venta_detalles')).toContain('sale_id=gte.0')
  })

  /**
   * El motivo de que exista la sonda. `venta_detalles` es la tabla más grande, y antes se pedía
   * recién cuando habían bajado las otras ocho: su tiempo se sumaba al final en vez de solaparse.
   * El test bloquea `ventas` y exige que `venta_detalles` ya se haya pedido igual.
   */
  it('venta_detalles no espera a que baje ventas: arranca en paralelo', async () => {
    let soltarVentas = () => {}
    const ventasColgada = new Promise<void>((r) => { soltarVentas = r })

    vi.stubGlobal('fetch', vi.fn(async (url: string, opts?: RequestInit) => {
      url = comoPostgrest(url, opts)
      if (url.includes('api.github.com')) return new Response(JSON.stringify({ workflow_runs: [] }), { status: 200 })
      if (url.includes('/rest/v1/ventas?') && !esSonda(url)) await ventasColgada
      const filas = esSonda(url) ? [{ id: 55 }] : []
      return new Response(JSON.stringify(filas), { status: 200, headers: { 'Content-Range': '0-0/0' } })
    }))

    const datos = traerDatos({ marca: 'bdi', desde: DESDE_ADMIN })
    await vi.waitFor(() => expect(pedidas.some((u) => u.includes('/venta_detalles?'))).toBe(true))
    soltarVentas()
    await datos

    expect(queryDe('venta_detalles')).toContain('sale_id=gte.55')
  })

  it('más de 1000 filas: pagina de a 1000 pidiendo los offsets que faltan', async () => {
    vi.stubGlobal('fetch', mockFetch({
      totalPorTabla: { productos: 2500 },
      filas: (t) => (t === 'productos' ? Array.from({ length: 1000 }, (_, i) => ({ id: i })) : []),
    }))
    await traerDatos({ marca: 'bdi', desde: DESDE_ADMIN })

    const offsets = pedidas.filter((u) => u.includes('/productos?')).map((u) => u.match(/offset=(\d+)/)?.[1])
    expect(offsets).toEqual(['0', '1000', '2000'])
  })
})

describe('degradados: el legacy sigue andando y el port también', () => {
  // index.html:2077: algunas bases no tienen sku/barcode en inventario.
  it('si inventario no tiene sku/barcode, reintenta con el select corto', async () => {
    vi.stubGlobal('fetch', mockFetch({ falla: (u) => u.includes('/inventario?') && u.includes('barcode') }))
    const datos = await traerDatos({ marca: 'bdi', desde: DESDE_ADMIN })

    const inv = pedidas.filter((u) => u.includes('/inventario?'))
    expect(inv.some((u) => u.includes('barcode'))).toBe(true)
    expect(inv.some((u) => !u.includes('barcode'))).toBe(true)
    expect(datos.inventario).toEqual([])
  })

  // index.html:2065: el .catch(() => []) del legacy.
  it('si variante_color_manual falla, Zattia sigue sin colores', async () => {
    vi.stubGlobal('fetch', mockFetch({ falla: (u) => u.includes('variante_color_manual') }))
    const datos = await traerDatos({ marca: 'zattia', desde: DESDE_ADMIN })
    expect(datos.colorManual).toEqual([])
  })

  // Si la sonda del mínimo no contesta, se vuelve al camino viejo: el mínimo sale de las ventas
  // que ya bajaron. Se pierde el paralelismo, no los datos.
  it('si la sonda del mínimo falla, el mínimo sale de las ventas ya bajadas', async () => {
    vi.stubGlobal('fetch', mockFetch({
      falla: esSonda,
      filas: (t) => (t === 'ventas' ? [{ id: 771 }, { id: 55 }, { id: 900 }] : []),
    }))
    const datos = await traerDatos({ marca: 'bdi', desde: DESDE_ADMIN })

    expect(queryDe('venta_detalles')).toContain('sale_id=gte.55')
    expect(datos.detalles).toEqual([])
  })

  // El otro lado: si la que falla es `venta_detalles`, traerDatos tiene que lanzar como antes
  // (y no quedar en un rechazo sin dueño mientras las otras ocho tablas siguen bajando).
  it('si venta_detalles falla, traerDatos lanza', async () => {
    vi.stubGlobal('fetch', mockFetch({ falla: (u) => u.includes('/venta_detalles?') }))
    await expect(traerDatos({ marca: 'bdi', desde: DESDE_ADMIN })).rejects.toThrow('venta_detalles')
  })

  it('si GitHub no contesta, syncMeta queda null y los datos llegan igual', async () => {
    vi.stubGlobal('fetch', mockFetch({ falla: (u) => u.includes('api.github.com') }))
    const datos = await traerDatos({ marca: 'bdi', desde: DESDE_ADMIN })
    expect(datos.syncMeta).toBeNull()
    expect(datos.productos).toEqual([])
  })
})

describe('el payload tiene el contrato que espera el caché del legacy', () => {
  // saveCache (index.html:2082) guarda estas 9 claves. Si el shell escribe otras,
  // el iframe lee un caché que no entiende: dos mundos, números distintos.
  it('las 9 claves de saveCache, ni una más ni una menos', async () => {
    vi.stubGlobal('fetch', mockFetch())
    const datos = await traerDatos({ marca: 'bdi', desde: DESDE_ADMIN })

    expect(Object.keys(datos).sort()).toEqual(
      ['colorManual', 'detalles', 'inventario', 'productos', 'syncMeta', 'ventas', 'vmCat', 'vmFundas', 'vmMes'].sort(),
    )
  })
})

/**
 * El filtro de ventas técnicas no tenía ni un caso hasta acá, y es el que decide qué se cuenta
 * como venta en TODA la analítica. Las tres implementaciones que existían (esta, las vistas
 * materializadas y `canalDe` de liquidación) discrepaban justo en el canal vacío.
 */
describe('esVentaTecnica', () => {
  it('reconoce las dos formas en que llega una venta técnica', () => {
    expect(esVentaTecnica({ channel: 'Ninguno' })).toBe(true) // las dos marcas
    expect(esVentaTecnica({ channel: null, channel_id: 12 })).toBe(true) // BDI, si faltara el texto
    expect(esVentaTecnica({ channel: 'Ninguno', channel_id: 12 })).toBe(true) // como llega en BDI
  })

  it('el canal desconocido es una venta REAL, no una técnica', () => {
    // Identificar por ausencia de dato es el modo de falla que dejó 428 productos "costando cero"
    // cuando GN dejó de mandar el costo. Acá borraría ventas en silencio.
    expect(esVentaTecnica({ channel: null })).toBe(false)
    expect(esVentaTecnica({ channel: '' })).toBe(false)
    expect(esVentaTecnica({})).toBe(false)
  })

  it('los canales de venta de verdad no se tocan', () => {
    for (const c of ['Tienda Nube', 'Mi Local', 'Mayorista', 'Showroom', 'Whatsapp', 'Mercadolibre', 'Otro Canal']) {
      expect(esVentaTecnica({ channel: c })).toBe(false)
    }
  })

  it('no confunde el 12 con otros channel_id', () => {
    expect(esVentaTecnica({ channel: 'Mayorista', channel_id: 10 })).toBe(false)
    expect(esVentaTecnica({ channel: 'Otro Canal', channel_id: 13 })).toBe(false) // el canal de Cambios
  })
})
