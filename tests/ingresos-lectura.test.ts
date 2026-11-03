// La traducción de la API de Ingresos a la forma del aviso, contra el normalizador real: es lo que garantiza que una OC
// leída se guarde igual que una avisada. Y el handler: autorización, marcas sin token, seco, y que una falla ⛔ avance.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { aProcesar, aReleer, contadasDe, desdeDe, eventoDeOc, idDeEvento, idDeRelectura, LECTURA_DESDE, mismaForma, RELECTURA_MAX } from '@/lib/recepciones/lectura.core.js'
import { normalizarEvento } from '@/lib/recepciones/webhook.core.js'

const linea = (id: number, o: Record<string, unknown> = {}) => ({
  id, product_id: 1, sku: `S-${id}`, barcode: `B-${id}`, name: `P ${id}`, supplier_code: null, size: 'M', color: 'NEGRO',
  image_url: 'https://x.test/a.jpg', thumbnail_url: 'https://x.test/a-t.jpg', quantity_ordered: 5, quantity_counted: 5,
  difference: 0, notes: null, is_new_product: false, is_new_variant: false, confirmed_at: '2026-10-29T12:06:07Z', ...o,
})
const oc = (o: Record<string, unknown> = {}) => ({
  id: 3050, code: 'OC-3050', number: 116, status: 'confirmed', purchase_date: null, arrival_date: '2026-10-28',
  confirmed_at: '2026-10-29T12:06:07.717723Z', updated_at: '2026-10-29T12:06:07.717723Z', notes: null,
  supplier: { id: 6, name: 'CONTAMINA', entry_type: null }, business: { id: 1, name: 'Zattia', slug: 'zattia' },
  totals: { products: 1, lines: 2, units_ordered: 10, units_counted: 10, units_difference: 0, lines_with_difference: 0, new_products: 0 },
  lines: [linea(11), linea(10)], ...o,
})

describe('eventoDeOc', () => {
  it('entra al normalizador real, con la misma marca, OC, proveedor y totales', () => {
    const n = normalizarEvento(eventoDeOc(oc()))
    expect(n.ok).toBe(true)
    expect(n.store).toBe('zattia')
    expect(n.oc).toMatchObject({ id: 'zattia:3050', oc_label: 'OC-3050', oc_estado: 'confirmada', proveedor_id: 6, proveedor_nombre: 'CONTAMINA', unidades_contadas: 10, totales_coinciden: true, fecha_ingreso: '2026-10-28' })
    expect(n.oc?.confirmada_at).toBe('2026-10-29T12:06:07.717723Z')
  })
  it('ordena las líneas por su id: la clave del libro sale de la posición', () => {
    const n = normalizarEvento(eventoDeOc(oc()))
    expect(n.lineas.map((l: { id: string; sku: string }) => [l.id, l.sku])).toEqual([['zattia:3050:0', 'S-10'], ['zattia:3050:1', 'S-11']])
  })
  it('sin conteo o sin confirmar ⛔ es stock: lo pedido no es lo recibido', () => {
    const n = normalizarEvento(eventoDeOc(oc({ lines: [linea(1, { quantity_counted: null }), linea(2, { confirmed_at: null }), linea(3, { quantity_counted: 4 })] })))
    expect(n.lineas.map((l: { cantidad_contada: number }) => l.cantidad_contada)).toEqual([0, 0, 4])
  })
  it('una parcial toma la hora de su última línea confirmada', () => {
    const e = eventoDeOc(oc({ status: 'partial', confirmed_at: null, lines: [linea(1, { confirmed_at: '2026-10-29T10:00:00Z' }), linea(2, { confirmed_at: '2026-10-29T11:00:00Z' }), linea(3, { confirmed_at: null })] }))
    expect(e.data.orden_compra.estado).toBe('parcial')
    expect(e.data.orden_compra.confirmada_at).toBe('2026-10-29T11:00:00.000Z')
  })
  it('una marca que ⛔ es de las tablas (Stunned) se ignora', () => {
    expect(normalizarEvento(eventoDeOc(oc({ business: { id: 3, name: 'Stunned', slug: 'stunned' } })))).toMatchObject({ ok: false, motivo: 'store' })
  })
})

describe('qué se lee', () => {
  it('sólo confirmadas y parciales, de la que cambió antes a la que cambió después', () => {
    const r = aProcesar([
      { id: 3, status: 'confirmed', updated_at: '2026-10-29T11:00:00Z' },
      { id: 2, status: 'partial', updated_at: '2026-10-29T12:00:00Z' },
      { id: 1, status: 'confirmed', updated_at: '2026-10-29T10:00:00Z' },
      { id: 9, status: 'draft', updated_at: '2026-10-29T09:00:00Z' },
      { id: 8, status: 'cancelled', updated_at: '2026-10-29T09:00:00Z' },
    ])
    expect(r.map((x: { id: number }) => x.id)).toEqual([1, 3, 2])
  })
  it('sin lectura previa arranca después del último aviso; con lectura, un minuto antes de la última', () => {
    expect(desdeDe(null)).toBe(LECTURA_DESDE)
    expect(desdeDe('2026-11-02T12:00:00+00:00')).toBe('2026-11-02T11:59:00.000Z')
  })
  it('el evento cambia con la OC y ⛔ cambia al releerla igual', () => {
    expect(idDeEvento('bdi', { id: 1, updated_at: 'a' })).toBe('api:bdi:1:a')
    expect(idDeEvento('bdi', { id: 1, updated_at: 'a' })).not.toBe(idDeEvento('bdi', { id: 1, updated_at: 'b' }))
  })
})

describe('mismaForma: lo que se relee ⛔ duplica stock', () => {
  const r = (sku: string) => ({ sku, codigo_barras: `B${sku}` })
  it('mismos renglones en las mismas posiciones: pasa, aunque cambie el conteo', () => {
    expect(mismaForma([r('A'), r('B')], [{ ...r('A'), cantidad_contada: 9 }, r('B')])).toBe(true)
  })
  it('sin SKU compara por código de barras', () => {
    expect(mismaForma([{ sku: null, codigo_barras: 'X' }], [{ sku: '', codigo_barras: 'X' }])).toBe(true)
  })
  it('dos talles juntados en un renglón (OC-3031) ⛔ pasan', () => {
    expect(mismaForma([r('A-S'), r('B'), r('A-M')], [r('A'), r('B')])).toBe(false)
  })
  it('otro SKU en la misma posición (OC-3035) ⛔ pasa', () => {
    expect(mismaForma([r('RMU-1')], [r('RBLU-1')])).toBe(false)
  })
  it('los mismos SKU en otro orden ⛔ pasan', () => {
    expect(mismaForma([r('A'), r('B')], [r('B'), r('A')])).toBe(false)
  })
})

const procesar = vi.fn()
const anotar = vi.fn()
let eventos: { webhook_id: string; estado: string }[] = []
let guardadas: { sku: string; codigo_barras: string }[] = []
let ocs: Record<string, unknown>[] = []
vi.mock('@/api/_recepciones-procesar.js', () => ({ procesarEvento: (x: unknown) => procesar(x) }))
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (tabla: string) => {
      const q: Record<string, unknown> = {
        select: () => q, like: () => q, eq: () => q, order: () => q, limit: () => q, gte: () => q,
        maybeSingle: async () => ({ data: null, error: null }),
        in: async () => ({ data: eventos, error: null }),
        upsert: async (x: unknown) => { anotar(x); return { error: null } },
        then: (ok: (v: unknown) => unknown) => ok({ data: tabla === 'recepcion_oc' ? ocs : tabla === 'recepcion_evento' ? [] : guardadas, error: null }),
      }
      return q
    },
  }),
}))

type Cuerpo = { marcas: Record<string, { error: string; pendientes: string[] }> }
function res() {
  const r = { code: 0, body: null as Cuerpo | null, status(c: number) { r.code = c; return r }, json(b: Cuerpo) { r.body = b; return r } }
  return r
}
const pedido = (query: Record<string, string> = { tarea: 'leer' }, auth = 'Bearer c') => ({ method: 'GET', query, headers: { authorization: auth } })
const resp = (b: unknown, status = 200) => ({ ok: status < 400, status, json: async () => b })

describe('la relectura: lo que contó menos de lo pedido', () => {
  it('lo contado usa la misma regla con que se guarda', () => {
    expect(contadasDe(oc({ lines: [linea(1, { quantity_counted: null }), linea(2, { confirmed_at: null }), linea(3, { quantity_counted: 4 })] }))).toBe(4)
  })
  it('sólo lo que contó de menos, la más nueva primero, con tope', () => {
    const f = (oc_id: number, c: number, d: string) => ({ oc_id, unidades_pedidas: 10, unidades_contadas: c, confirmada_at: d })
    expect(aReleer([f(1, 10, '2026-11-01'), f(2, 0, '2026-10-01'), f(3, 5, '2026-11-02')]).map((o: { oc_id: number }) => o.oc_id)).toEqual([3, 2])
    expect(aReleer(Array.from({ length: 40 }, (_, i) => f(i + 1, 0, '2026-11-01')))).toHaveLength(RELECTURA_MAX)
    expect(aReleer([f(1, 0, '2026-11-01')], new Set([1]))).toEqual([])
  })
  it('el id cambia con lo contado, ⛔ con releer lo mismo', () => {
    const a = oc({ lines: [linea(1, { quantity_counted: null })] }); const b = oc({ lines: [linea(1, { quantity_counted: 5 })] })
    expect(idDeRelectura('bdi', a)).not.toBe(idDeRelectura('bdi', b))
    expect(idDeRelectura('bdi', b)).toBe(idDeRelectura('bdi', oc({ lines: [linea(1, { quantity_counted: 5 })] })))
  })
})

describe('el handler', () => {
  async function llamar(req = pedido()) {
    const mod = await import('@/api/_ingresos-lectura.js')
    const r = res()
    await (mod.default as (q: unknown, s: typeof r) => Promise<unknown>)(req, r)
    return r
  }
  let fetchMock: ReturnType<typeof vi.fn>
  beforeEach(() => {
    vi.resetModules(); procesar.mockReset(); procesar.mockResolvedValue({ oc: 'x', lineas: 2 }); anotar.mockReset(); eventos = []; guardadas = []; ocs = []
    vi.stubEnv('CRON_SECRET', 'c'); vi.stubEnv('SUPABASE_URL', 'https://e.supabase.co'); vi.stubEnv('SUPABASE_SERVICE_KEY', 'k')
    vi.stubEnv('INGRESOS_TOKEN_ZATTIA', 'igk_z'); vi.stubEnv('INGRESOS_TOKEN_BDI', '')
    fetchMock = vi.fn(async (url: string) => (url.includes('/purchase-orders/3050')
      ? resp(oc())
      : resp({ items: [{ id: 3050, code: 'OC-3050', status: 'confirmed', updated_at: '2026-10-29T12:06:07Z' }], total: 1 })))
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

  it('sin el secreto del cron ⛔ lee', async () => {
    expect((await llamar(pedido({ tarea: 'leer' }, 'Bearer otro'))).code).toBe(401)
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('guarda la OC, sin seguir redirecciones, y la marca sin token ⛔ es una falla', async () => {
    const r = await llamar()
    expect(r.code).toBe(200)
    expect(r.body?.marcas.bdi).toEqual({ sinToken: true })
    expect(procesar).toHaveBeenCalledTimes(1)
    expect(procesar.mock.calls[0][0].idEvento).toBe('api:zattia:3050:2026-10-29T12:06:07.717723Z')
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ redirect: 'manual' })
    expect(fetchMock.mock.calls[0][0]).not.toContain('igk_')
  })
  it('en seco dice qué leería y ⛔ escribe', async () => {
    const r = await llamar(pedido({ tarea: 'leer', seco: '1' }))
    expect(r.body?.marcas.zattia.pendientes).toEqual(['OC-3050'])
    expect(procesar).not.toHaveBeenCalled()
  })
  it('lo ya procesado ⛔ se vuelve a pedir; lo que quedó en error, sí', async () => {
    eventos = [{ webhook_id: 'api:zattia:3050:2026-10-29T12:06:07Z', estado: 'procesado' }]
    await llamar()
    expect(procesar).not.toHaveBeenCalled()
    eventos = [{ webhook_id: 'api:zattia:3050:2026-10-29T12:06:07Z', estado: 'error' }]
    await llamar()
    expect(procesar).toHaveBeenCalledTimes(1)
  })
  it('una OC ya guardada que cambió de forma ⛔ se pisa, y queda anotada para no volver a pedirla', async () => {
    guardadas = [{ sku: 'S-10', codigo_barras: 'B-10' }, { sku: 'S-99', codigo_barras: 'B-99' }, { sku: 'S-11', codigo_barras: 'B-11' }]
    const r = await llamar()
    expect(procesar).not.toHaveBeenCalled()
    expect(anotar.mock.calls[0][0]).toMatchObject({ estado: 'ignorado', webhook_id: 'api:zattia:3050:2026-10-29T12:06:07.717723Z' })
    expect(r.code).toBe(200)
    expect(JSON.stringify(r.body)).toContain('para no duplicar stock')
  })
  it('una OC ya guardada con los mismos renglones se vuelve a guardar: el libro ajusta el conteo', async () => {
    guardadas = [{ sku: 'S-10', codigo_barras: 'B-10' }, { sku: 'S-11', codigo_barras: 'B-11' }]
    await llamar()
    expect(procesar).toHaveBeenCalledTimes(1)
    expect(anotar).not.toHaveBeenCalled()
  })
  it('la OC guardada con de menos y `updated_at` quieto se relee, y entra con su conteo', async () => {
    guardadas = [{ sku: 'S-10', codigo_barras: 'B-10' }, { sku: 'S-11', codigo_barras: 'B-11' }]
    ocs = [{ oc_id: 3050, unidades_pedidas: 10, unidades_contadas: 0, confirmada_at: '2026-10-29' }]
    fetchMock.mockImplementation(async (url: string) => (url.includes('/purchase-orders/3050') ? resp(oc()) : resp({ items: [], total: 0 })))
    const r = await llamar()
    expect(procesar).toHaveBeenCalledTimes(1)
    expect(procesar.mock.calls[0][0].idEvento).toBe('api:zattia:3050:2026-10-29T12:06:07.717723Z:c10')
    expect(JSON.stringify(r.body)).toContain('"antes":0')
  })
  it('si lo contado es lo mismo ⛔ se toca; en seco lo dice y ⛔ escribe', async () => {
    ocs = [{ oc_id: 3050, unidades_pedidas: 20, unidades_contadas: 10, confirmada_at: '2026-10-29' }]
    fetchMock.mockImplementation(async (url: string) => (url.includes('/purchase-orders/3050') ? resp(oc()) : resp({ items: [], total: 0 })))
    await llamar()
    expect(procesar).not.toHaveBeenCalled()
    ocs = [{ oc_id: 3050, unidades_pedidas: 20, unidades_contadas: 3, confirmada_at: '2026-10-29' }]
    const r = await llamar(pedido({ tarea: 'leer', seco: '1' }))
    expect(procesar).not.toHaveBeenCalled()
    expect(JSON.stringify(r.body)).toContain('"ahora":10')
  })
  it('una OC que ya ⛔ está en Ingresos ⛔ traba la lectura', async () => {
    ocs = [{ oc_id: 3050, unidades_pedidas: 10, unidades_contadas: 0, confirmada_at: '2026-10-29' }]
    fetchMock.mockImplementation(async (url: string) => (url.includes('/purchase-orders/3050') ? resp({ code: 'not_found' }, 404) : resp({ items: [], total: 0 })))
    const r = await llamar()
    expect(r.code).toBe(200)
    expect(procesar).not.toHaveBeenCalled()
  })
  it('la relectura que cambió de forma ⛔ se guarda y queda anotada', async () => {
    guardadas = [{ sku: 'OTRO', codigo_barras: 'B' }, { sku: 'S-11', codigo_barras: 'B-11' }]
    ocs = [{ oc_id: 3050, unidades_pedidas: 10, unidades_contadas: 0, confirmada_at: '2026-10-29' }]
    fetchMock.mockImplementation(async (url: string) => (url.includes('/purchase-orders/3050') ? resp(oc()) : resp({ items: [], total: 0 })))
    await llamar()
    expect(procesar).not.toHaveBeenCalled()
    expect(anotar.mock.calls[0][0]).toMatchObject({ estado: 'ignorado', webhook_id: 'api:zattia:3050:2026-10-29T12:06:07.717723Z:c10' })
  })
  it('sin tiempo corta sin perder: la más vieja se guarda, y la otra queda para la vuelta siguiente', async () => {
    const lista = [{ id: 3050, code: 'OC-3050', status: 'confirmed', updated_at: '2026-10-29T12:00:00Z' }, { id: 3051, code: 'OC-3051', status: 'confirmed', updated_at: '2026-10-29T13:00:00Z' }]
    fetchMock.mockImplementation(async (url: string) => (url.includes('/purchase-orders/305') ? resp(oc({ id: Number(url.slice(-4)), code: `OC-${url.slice(-4)}` })) : resp({ items: lista, total: 2 })))
    const reloj = Date.now()
    procesar.mockImplementationOnce(async () => { vi.spyOn(Date, 'now').mockReturnValue(reloj + 60_000); return { oc: 'x', lineas: 2 } })
    const r = await llamar()
    vi.restoreAllMocks()
    expect(procesar).toHaveBeenCalledTimes(1)
    expect(procesar.mock.calls[0][0].payload.data.orden_compra.id).toBe(3050)
    expect(JSON.stringify(r.body)).toContain('"corto":true')
    expect(r.code).toBe(200)
    // La vuelta siguiente: la primera ya está procesada, y entra la otra.
    procesar.mockClear(); eventos = [{ webhook_id: `api:zattia:3050:${oc().updated_at}`, estado: 'procesado' }, { webhook_id: 'api:zattia:3050:2026-10-29T12:00:00Z', estado: 'procesado' }]
    await llamar()
    expect(procesar.mock.calls.map((c) => c[0].payload.data.orden_compra.id)).toEqual([3051])
  })
  it('un token rechazado contesta 502 con el código, ⛔ con el token', async () => {
    fetchMock.mockResolvedValue(resp({ status: 401, code: 'token_expired', detail: 'x' }, 401))
    const r = await llamar()
    expect(r.code).toBe(502)
    expect(r.body?.marcas.zattia.error).toContain('token_expired')
    expect(JSON.stringify(r.body)).not.toContain('igk_z')
  })
  it('un token de otro negocio ⛔ guarda nada', async () => {
    fetchMock.mockImplementation(async (url: string) => (url.includes('/purchase-orders/3050')
      ? resp(oc({ business: { id: 2, name: 'BDI', slug: 'bdi' } }))
      : resp({ items: [{ id: 3050, code: 'OC-3050', status: 'confirmed', updated_at: 'z' }], total: 1 })))
    fetchMock.mockClear()
    const r = await llamar()
    expect(r.code).toBe(502)
    expect(procesar).not.toHaveBeenCalled()
  })
})
