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

afterEach(() => vi.unstubAllGlobals())

const SEG: MapaSeguimiento = {
  '111': { es_mayorista: true },
  '222': { es_mayorista: true },
  '333': { cadencia: 'semanal' }, // NO marcado: no debe entrar en el pedido
}

/**
 * `traerVentas` dejó de hablar con Supabase en el escalón 5 de la Fase S: pide por
 * `api/datos?recurso=crm` con `action:'ventas'`. Lo que se sostiene acá cambió de forma —ya no es
 * "qué URL de PostgREST arma" sino "qué le manda a la puerta"—, y la paridad del **select** se
 * mudó con la consulta: vive en `COLUMNAS_VENTAS` de `api/_crm.js` y la ejerce
 * `tests/venta-detalles-servidor.test.ts`.
 */
describe('traerVentas', () => {
  /** Espía la puerta: devuelve las llamadas y contesta la forma del handler. */
  function espiarApi(ventas: unknown[] = []) {
    const llamadas: { url: string; body: { action?: string; modo?: string; flagged?: unknown[] } }[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, opts: RequestInit) => {
        llamadas.push({ url: String(url), body: JSON.parse(String(opts.body)) })
        return Promise.resolve({ ok: true, status: 200, json: async () => ({ ok: true, ventas }) })
      }),
    )
    return { llamadas }
  }

  it('🔴 no habla con Supabase: va por la puerta, en UN viaje', async () => {
    // Hasta el escalón 5 esto pedía `total_price` y `client_id` con la anon key, que viaja en el
    // bundle: la facturación de 27.990 ventas para cualquiera que la sacara de ahí.
    const { llamadas } = espiarApi()
    await traerVentas('all', SEG)
    expect(llamadas).toHaveLength(1)
    expect(llamadas[0].url).toContain('/api/datos?recurso=crm')
    expect(llamadas[0].url).not.toContain('/rest/v1/')
    expect(llamadas[0].body.action).toBe('ventas')
  })

  it('modo Mayorista: manda el canal y los ids de los marcados ★', async () => {
    const { llamadas } = espiarApi()
    await traerVentas('10', SEG)
    expect(llamadas[0].body.modo).toBe('10')
    // Solo los marcados, y no el 333. La unión de las dos consultas la hace el servidor.
    expect(llamadas[0].body.flagged).toEqual(['111', '222'])
  })

  it('modo «todos» no mira los marcados', async () => {
    const { llamadas } = espiarApi()
    await traerVentas('all', SEG)
    expect(llamadas[0].body.modo).toBe('all')
    expect(llamadas[0].body.flagged).toEqual([])
  })

  it('🔑 las ventas técnicas se descartan acá, sobre lo que devuelva el servidor', async () => {
    // Los clientes internos de GN —"Sesión de fotos", "Falla", "Cambio"— tienen `client_id` como
    // cualquier persona: sin este filtro entran al padrón como clientes con decenas de compras
    // de $0. Y el filtro va del lado del navegador porque es lógica del ETL, compartida.
    const v = (id: number, sale_state: string) => ({ id, client_id: 111, date_sale: '2026-07-01', total_price: 0, channel_id: 10, sale_state })
    espiarApi([v(1, 'ok'), { ...v(2, 'ok'), channel_id: 8 }])
    const out = await traerVentas('all', SEG)
    // Sea cual sea el criterio de `esVentaTecnica`, el filtro corre: no vuelven las dos crudas.
    expect(out.length).toBeLessThanOrEqual(2)
    expect(out.every((x) => typeof x.id === 'number')).toBe(true)
  })

  it('un 403 del handler sube como error, no como "no hay ventas"', async () => {
    // 🔴 Mismo modo de falla que el padrón: tragárselo pintaría un CRM vacío en vez de decir que
    // falta el permiso, y las dos pantallas se ven igual.
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: false, status: 403, json: async () => ({ error: 'No tenés acceso a Clientes.' }) })),
    )
    await expect(traerVentas('all', SEG)).rejects.toThrow('No tenés acceso a Clientes.')
  })
})

/**
 * `traerClientes` y `traerDetalles` son los que NO hablan con Supabase: piden por
 * `api/datos?recurso=crm`, que lee con la clave de servicio detrás de sesión y permiso —el padrón
 * desde el escalón 2 de la Fase S, los detalles desde el 3—. Lo que hay que sostener acá cambió de
 * forma: ya no es "qué URL de PostgREST arma" sino "qué ids manda".
 */
describe('traerClientes', () => {
  /** Espía `apiFetch`: devuelve las llamadas y contesta la forma del handler. */
  function espiarApi(clientes: unknown[] = []) {
    const llamadas: { url: string; body: { ids: number[] } }[] = []
    const spy = vi.fn((url: string, opts: RequestInit) => {
      llamadas.push({ url: String(url), body: JSON.parse(String(opts.body)) })
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ ok: true, clientes }) })
    })
    vi.stubGlobal('fetch', spy)
    return { llamadas }
  }

  it('manda los ids únicos de las ventas en UN solo viaje', async () => {
    const ventas = Array.from({ length: 250 }, (_, i) => ({ id: i, client_id: i + 1, date_sale: null, total_price: 0, channel_id: 10, sale_state: null }))
    const { llamadas } = espiarApi()
    await traerClientes(ventas)
    // Antes eran dos lotes de 200 contra PostgREST; los lotes ahora los arma el servidor.
    expect(llamadas).toHaveLength(1)
    expect(llamadas[0].url).toContain('/api/datos?recurso=crm')
    expect(llamadas[0].body.ids).toHaveLength(250)
  })

  it('ignora las ventas sin client_id y no repite ids', async () => {
    const v = (client_id: number | null) => ({ id: 1, client_id, date_sale: null, total_price: 0, channel_id: 10, sale_state: null })
    const { llamadas } = espiarApi()
    await traerClientes([v(5), v(5), v(null), v(7)])
    expect(llamadas[0].body.ids).toEqual([5, 7])
  })

  it('devuelve el mapa por id', async () => {
    espiarApi([{ id: 7, name: 'Ana', email: null, phone: null, city: null, province: null }])
    const out = await traerClientes([{ id: 1, client_id: 7, date_sale: null, total_price: 0, channel_id: 10, sale_state: null }])
    expect(out[7].name).toBe('Ana')
  })

  it('sin ids no sale ninguna llamada', async () => {
    const { llamadas } = espiarApi()
    const out = await traerClientes([{ id: 1, client_id: null, date_sale: null, total_price: 0, channel_id: 10, sale_state: null }])
    expect(llamadas).toHaveLength(0)
    expect(out).toEqual({})
  })

  it('un 403 del handler sube como error, no como padrón vacío', async () => {
    // 🔴 El modo de falla que este endpoint agrega: quien no tenga el permiso de Clientes recibe
    // 403. Si eso se tragara devolviendo `{}`, la pantalla diría "no hay clientes" en vez de "no
    // tenés acceso" — y el CRM sin clientes se ve exactamente igual que el CRM vacío.
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: false, status: 403, json: async () => ({ error: 'No tenés acceso a Clientes.' }) })))
    await expect(
      traerClientes([{ id: 1, client_id: 7, date_sale: null, total_price: 0, channel_id: 10, sale_state: null }]),
    ).rejects.toThrow('No tenés acceso a Clientes.')
  })
})

describe('traerDetalles', () => {
  /** Mismo espía que el de `traerClientes`, con la forma que contesta la acción `detalles`. */
  function espiarApi(detalles: unknown[] = []) {
    const llamadas: { url: string; body: { action?: string; ids: number[] } }[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, opts: RequestInit) => {
        llamadas.push({ url: String(url), body: JSON.parse(String(opts.body)) })
        return Promise.resolve({ ok: true, status: 200, json: async () => ({ ok: true, detalles }) })
      }),
    )
    return { llamadas }
  }

  it('manda los sale_ids en UN viaje, y no a Supabase', async () => {
    // Antes eran lotes de 150 contra PostgREST con `unit_price` y `total` en el select. Esas dos
    // columnas son la facturación entera de la marca y por eso la consulta se mudó al servidor
    // (escalón 3): los lotes ahora los arma él.
    const { llamadas } = espiarApi()
    await traerDetalles(Array.from({ length: 160 }, (_, i) => i + 1))
    expect(llamadas).toHaveLength(1)
    expect(llamadas[0].url).toContain('/api/datos?recurso=crm')
    expect(llamadas[0].body.action).toBe('detalles')
    expect(llamadas[0].body.ids).toHaveLength(160)
  })

  it('no repite ids y sin ids no sale ninguna llamada', async () => {
    const { llamadas } = espiarApi()
    await traerDetalles([5, 5, 7])
    expect(llamadas[0].body.ids).toEqual([5, 7])

    const vacio = espiarApi()
    expect(await traerDetalles([])).toEqual([])
    expect(vacio.llamadas).toHaveLength(0)
  })

  it('un 403 del handler sube como error, no como "no compró nada"', async () => {
    // 🔴 Mismo modo de falla que el padrón: tragarse el 403 devolviendo `[]` pintaría un cliente
    // sin compras, que es una afirmación falsa sobre un dato que sí existe.
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: false, status: 403, json: async () => ({ error: 'No tenés acceso a Clientes.' }) })),
    )
    await expect(traerDetalles([1])).rejects.toThrow('No tenés acceso a Clientes.')
  })
})

// 📌 **La paginación se mudó al servidor con la consulta** (escalón 5). PostgREST corta en 1000
// filas sin avisar —el legacy pedía este lote sin paginar y eran 445 ventas y $12,5M sin contar
// (f8977ca)— y ahora el que pagina es `paginar()` en `api/_crm.js`, con `id` de desempate en el
// `order` para que dos páginas no se pisen. Se ejerce en `tests/venta-detalles-servidor.test.ts`.
