import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { revisarParams } from '@/api/_espejo.js'

/**
 * La puerta del escalón 4 de la Fase S: `inventario` y las tres vistas materializadas salen del
 * navegador. A diferencia de las piezas anteriores esta es un **pase** —reenvía la consulta de
 * PostgREST tal cual— porque tiene once lectores, así que lo que hay que probar no es una consulta
 * sino el candado: qué deja pasar y qué no.
 *
 * 🔴 **El ataque que importa es traer una tabla vecina.** PostgREST hace
 * `select=sku,productos(unit_cost)` con un `!inner` o un simple paréntesis, y del otro lado de la
 * puerta está la clave de SERVICIO: si eso pasa, el escalón 3 —que acabamos de cerrar— se reabre
 * entero por adentro, y encima con permisos de dios en vez de los de la anon key.
 */

// ── El doble de fetch: despacha por URL ────────────────────────────────────────────────────
// El handler usa `fetch` dos veces por request y son cosas distintas: `exigirUsuario` le pregunta
// al KV quién es, y después la consulta va a PostgREST. Un stub que conteste lo mismo a las dos
// haría pasar un test que no ejerce nada.
let respuestaPostgrest = { status: 200, cuerpo: '[]', rango: '0-0/0' }
let urlsPedidas: string[] = []

function stubDeRed(perfil: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      urlsPedidas.push(String(url))
      if (String(url).includes('/rest/v1/')) {
        return {
          status: respuestaPostgrest.status,
          text: async () => respuestaPostgrest.cuerpo,
          headers: { get: (h: string) => (h.toLowerCase() === 'content-range' ? respuestaPostgrest.rango : null) },
        }
      }
      return { ok: true, json: async () => ({ ok: true, perfil }) }
    }),
  )
}

function resFalso() {
  const r = {
    code: 0 as number,
    cuerpo: null as string | Record<string, unknown> | null,
    headers: {} as Record<string, string>,
    setHeader(k: string, v: string) { r.headers[k] = v },
    status(c: number) { r.code = c; return r },
    json(b: unknown) { r.cuerpo = b as Record<string, unknown>; return r },
    send(b: string) { r.cuerpo = b; return r },
    end() { return r },
  }
  return r
}

const sobre = (d: unknown) => Buffer.from(JSON.stringify(d), 'utf8').toString('base64')

const pedido = (body: Record<string, unknown>) => ({
  method: 'POST',
  headers: { 'x-monitor-auth': sobre({ user: 'Alguien', pass: 'p' }) },
  query: {},
  body,
})

async function llamar(req: unknown) {
  const mod = await import('@/api/_espejo.js')
  const res = resFalso()
  await (mod.default as (q: unknown, s: typeof res) => Promise<unknown>)(req, res)
  return res
}

const CUALQUIERA = { name: 'Alguien', acceso: { bdi: {}, zattia: {} } }

beforeEach(() => {
  urlsPedidas = []
  respuestaPostgrest = { status: 200, cuerpo: '[]', rango: '0-0/0' }
  process.env.SUPABASE_URL = 'https://bdi.supabase.co'
  process.env.SUPABASE_SERVICE_KEY = 'clave-bdi'
  process.env.ZATTIA_SUPABASE_URL = 'https://zattia.supabase.co'
  process.env.ZATTIA_SUPABASE_SERVICE_KEY = 'clave-zattia'
})
afterEach(() => vi.unstubAllGlobals())

// ═══════════════════════════════════════════════════════════════════════════════════════════
describe('revisarParams — lo que NO puede pasar', () => {
  it('🔴 un select con paréntesis es una tabla vecina y se rechaza', () => {
    // La forma exacta con la que se reabriría el escalón 3, y con la clave de servicio.
    expect(revisarParams('inventario', 'select=sku,productos(unit_cost)')).toMatch(/paréntesis/)
    expect(revisarParams('inventario', 'select=sku,productos!inner(unit_cost,wholesaler_price)')).toMatch(/paréntesis/)
    // Percent-encodeado tampoco: `URLSearchParams` decodifica antes de que mire la regla.
    expect(revisarParams('inventario', 'select=sku,productos%28unit_cost%29')).toMatch(/paréntesis/)
  })

  it('las cuatro tablas que costaron los escalones 1 a 3 no están en el catálogo', () => {
    for (const t of ['ventas', 'clientes', 'productos', 'venta_detalles']) {
      expect(revisarParams(t, 'select=id')).toMatch(/fuera del catálogo/)
    }
  })

  it('un filtro por una tabla vecina no llega: el punto no entra en un nombre de columna', () => {
    expect(revisarParams('inventario', 'select=sku&productos.unit_cost=gt.0')).toMatch(/fuera de inventario/)
  })

  it('una columna que no es de la tabla se rechaza, en el select y en el order', () => {
    expect(revisarParams('inventario', 'select=sku,unit_cost')).toMatch(/columna fuera de inventario/)
    expect(revisarParams('ventas_por_mes', 'select=mes&order=total_cost.desc')).toMatch(/order por una columna/)
    // Una vista no hereda las columnas de otra.
    expect(revisarParams('ventas_por_categoria_mes', 'select=mes,modelo')).toMatch(/columna fuera de/)
  })

  it('un `or` anidado, que es la otra forma de nombrar una tabla vecina, se rechaza', () => {
    expect(revisarParams('inventario', 'or=(sku.ilike.*x*,productos.unit_cost.gt.0)')).toMatch(/fuera de inventario/)
    expect(revisarParams('inventario', 'or=(sku.ilike.*x*,and(barcode.eq.1))')).toMatch(/anidado/)
  })

  it('limit y offset tienen que ser números', () => {
    expect(revisarParams('inventario', 'select=sku&limit=1;drop')).toMatch(/número/)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════════════════
describe('revisarParams — las once consultas reales del repo pasan', () => {
  /**
   * 🔑 **Este es el test que evita romper una pantalla.** Cada línea es, palabra por palabra, lo
   * que hoy le pide al espejo un lector del navegador. Están acá copiadas de su archivo porque
   * varias se arman con template literals y no se pueden importar.
   *
   * Un lector número doce que no esté en esta lista **no queda roto en silencio**: la puerta
   * contesta 400 diciendo qué columna sobra. Es un modo de falla visible y explicado, que es lo
   * que se puede prometer sin un espejo mentiroso.
   */
  const REALES: [string, string, string][] = [
    ['lib/datos.ts (ETL)', 'inventario', 'select=product_id,product_name,size_id,size_name,available_quantity,store_name,sku,barcode&order=product_id&limit=1000&offset=0'],
    ['lib/datos.ts (ETL, el reintento corto)', 'inventario', 'select=product_id,product_name,size_id,size_name,available_quantity,store_name&order=product_id'],
    ['lib/exhib/datos.ts', 'inventario', 'select=product_id,product_name,size_name,sku,barcode,available_quantity&store_name=eq.Local&available_quantity=gt.0'],
    ['lib/ubicaciones/cliente.ts', 'inventario', `select=product_id,product_name,sku,store_name,observation&store_name=eq.${encodeURIComponent('Deposito Minorista')}&order=product_id,size_id`],
    ['lib/reposicion/cliente.ts (BDI, con observation)', 'inventario', 'select=product_id,product_name,size_id,size_name,sku,available_quantity,store_name,observation'],
    ['lib/reposicion/cliente.ts (Zattia, sin observation)', 'inventario', 'select=product_id,product_name,size_id,size_name,sku,available_quantity,store_name'],
    ['lib/reclamos/cliente.ts', 'inventario', `select=product_id,size_id,sku&sku=in.(${encodeURIComponent('STU-REM-0001-S,STU-REM-0002-M')})`],
    ['components/ui/BuscarArticuloGN.tsx', 'inventario', 'select=product_id,product_name,size_id,size_name,sku,barcode,available_quantity&or=(sku.ilike.*vibe*,product_name.ilike.*vibe*,barcode.ilike.*vibe*)&limit=60'],
    ['components/integraciones (proponer)', 'inventario', 'select=product_id,product_name,sku,barcode,size_id&sku=ilike.STU*&order=sku'],
    ['components/integraciones (dry-run)', 'inventario', 'select=sku,product_name,available_quantity&sku=ilike.STU*'],
    ['components/canjes/SelectorModelo.tsx', 'inventario', 'select=size_name,store_name,available_quantity&size_name=ilike.iphone*&available_quantity=gt.0'],
    ['components/caducados/datosCaducados.ts', 'inventario', 'select=product_id,available_quantity,store_name'],
    ['lib/datos.ts (vmMes)', 'ventas_por_mes', 'select=mes,channel,cantidad_ventas,total_items,promedio_items_por_venta&order=mes'],
    ['lib/datos.ts (vmCat)', 'ventas_por_categoria_mes', 'select=mes,categoria,total_items&order=mes'],
    ['lib/datos.ts (vmFundas)', 'fundas_por_modelo_mes', 'select=mes,modelo,product_id,product_name,product_created_at,total_items&order=mes'],
  ]

  for (const [quien, tabla, params] of REALES) {
    it(quien, () => expect(revisarParams(tabla, params)).toBeNull())
  }
})

// ═══════════════════════════════════════════════════════════════════════════════════════════
describe('api/_espejo.js — el handler', () => {
  it('reenvía la consulta TAL CUAL y devuelve el cuerpo sin tocarlo', async () => {
    // 🔑 Que el cuerpo viaje sin re-serializar es lo que hace que `sbFetch` no cambie: del otro
    // lado espera exactamente lo que devuelve PostgREST.
    stubDeRed(CUALQUIERA)
    respuestaPostgrest = { status: 206, cuerpo: '[{"sku":"VIBE-1"}]', rango: '0-999/7195' }
    const params = 'select=sku&store_name=eq.Local&limit=1000&offset=0'
    const res = await llamar(pedido({ store: 'bdi', tabla: 'inventario', params }))

    expect(res.code).toBe(206)
    expect(res.cuerpo).toBe('[{"sku":"VIBE-1"}]')
    // El `Content-Range` es lo único que mira `sbFetchWithCount` para saber el total: sin esto,
    // `fetchAll` cree que la primera página es todo y se pierden 6.195 filas en silencio.
    expect(res.headers['Content-Range']).toBe('0-999/7195')
    expect(urlsPedidas.at(-1)).toBe(`https://bdi.supabase.co/rest/v1/inventario?${params}`)
  })

  it('la marca la elige el request y cada una va a SU base', async () => {
    stubDeRed(CUALQUIERA)
    await llamar(pedido({ store: 'zattia', tabla: 'inventario', params: 'select=sku' }))
    expect(urlsPedidas.at(-1)).toContain('https://zattia.supabase.co/')
  })

  it('una tabla fuera del catálogo corta con 400 y NO toca la base', async () => {
    stubDeRed(CUALQUIERA)
    const res = await llamar(pedido({ store: 'bdi', tabla: 'clientes', params: 'select=email' }))
    expect(res.code).toBe(400)
    expect(urlsPedidas.some((u) => u.includes('/rest/v1/'))).toBe(false)
  })

  it('sin sesión no se contesta: es todo el objetivo del escalón', async () => {
    // Hasta hoy esto lo leía cualquiera desde afuera con la key que viaja en el bundle.
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ ok: false }) })))
    const res = await llamar(pedido({ store: 'bdi', tabla: 'inventario', params: 'select=sku' }))
    expect(res.code).toBeGreaterThanOrEqual(400)
  })

  it('un GET no entra: la consulta viaja en el body', async () => {
    stubDeRed(CUALQUIERA)
    const res = await llamar({ ...pedido({}), method: 'GET' })
    expect(res.code).toBe(405)
  })
})
