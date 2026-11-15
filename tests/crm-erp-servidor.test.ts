import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * `api/_crm.js` desde el corte de BDI lee del ERP (Bruno 15-nov: «no podemos depender de los espejos»): lo elige `erp_corte`,
 * ⛔ una variable; Supabase ⛔ se toca; la respuesta tiene la MISMA forma que la del espejo; y sin saber si cortó, TIRA.
 * La lectura misma (la regla de la vista) la prueba el motor contra Postgres (`test/crm-lectura-pg.mjs`).
 */
let cortes: Record<string, string> | Error = {}
vi.mock('../api/_caja-corte.js', () => ({
  cortesDeCaja: async () => {
    if (cortes instanceof Error) throw cortes
    return cortes
  },
}))
const conexiones: string[] = []
vi.mock('../api/_erp-corte.js', () => ({
  conBase: async (store: string, fn: (db: unknown) => unknown) => (conexiones.push(store), fn({ falsa: true })),
}))
const llamadas: string[] = []
const NUEVA = 1_000_000_123 // un cliente nacido en el ERP
vi.mock('../motor/crm/lectura.mjs', () => ({
  ventasDelCrm: async (_db: unknown, marca: string, o: { canal: number | null; marcados: number[] }) => {
    llamadas.push(`ventasDelCrm ${marca} ${o.canal} [${o.marcados}]`)
    return [{ id: 1_000_000_900, date_sale: '2026-11-15', total_price: 250000, client_id: NUEVA, channel_id: 10, sale_state: 'Cerrado', channel: 'Mayorista' }]
  },
  ventasDeClientes: async (_db: unknown, _m: string, ids: number[], o: { canales: number[] | null }) => {
    llamadas.push(`ventasDeClientes [${ids}] ${o.canales ? `[${o.canales}]` : '-'}`)
    return ids.includes(NUEVA) ? [{ id: 1_000_000_900, date_sale: '2026-11-15', total_price: 250000, client_id: NUEVA, channel_id: 10, sale_state: 'Cerrado', channel: 'Mayorista' }] : []
  },
  detallesDeVentas: async (_db: unknown, _m: string, ids: number[]) => ids.map((id) => ({ sale_id: id, product_name: 'FUNDA', size: '15', quantity: 2, unit_price: 125000, total: 250000 })),
  clientesPorId: async (_db: unknown, ids: number[]) => ids.filter((id) => id === NUEVA).map((id) => ({ id, name: 'Nueva del ERP', email: null, phone: '5493412222222', city: 'Funes', province: 'Santa Fe' })),
  telefonosDelPadron: async () => [{ id: NUEVA, phone: '5493412222222' }],
  clientesPorNombre: async (_db: unknown, patrones: string[]) => (llamadas.push(`porNombre ${patrones}`), [{ id: NUEVA, name: 'Nueva del ERP', city: 'Funes', phone: '5493412222222' }]),
}))
const supabaseTocado: string[] = []
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from: (t: string) => { supabaseTocado.push(t); throw new Error('⛔ el espejo') } }) }))

function resFalso() {
  const r = {
    code: 0 as number,
    body: null as Record<string, unknown> | null,
    setHeader() {},
    status(c: number) { r.code = c; return r },
    json(b: unknown) { r.body = b as Record<string, unknown>; return r },
    send(b: string) { r.body = JSON.parse(b) as Record<string, unknown>; return r },
  }
  return r
}
const sobre = (d: unknown) => Buffer.from(JSON.stringify(d), 'utf8').toString('base64')
const perfil = { name: 'Darío', acceso: { bdi: { clientes: true } } }
async function llamar(body: Record<string, unknown>) {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ ok: true, perfil }) })))
  const mod = await import('@/api/_crm.js')
  const res = resFalso()
  await mod.default({ method: 'POST', headers: { 'x-monitor-auth': sobre({ user: 'Darío', pass: 'p' }) }, query: {}, body }, res)
  return res
}

beforeEach(() => {
  cortes = { bdi: '2026-11-14T16:12:57.801Z' }
  conexiones.length = 0
  llamadas.length = 0
  supabaseTocado.length = 0
  process.env.SUPABASE_URL = 'https://ejemplo.supabase.co'
  process.env.SUPABASE_SERVICE_KEY = 'clave-de-servicio'
})
afterEach(() => vi.unstubAllGlobals())

describe('api/_crm.js con BDI cortado: lee del ERP', () => {
  it('ventas del modo Mayorista: del ERP, con los marcados, y con las columnas de siempre (⛔ `channel`)', async () => {
    const res = await llamar({ action: 'ventas', modo: '10', flagged: [5, 5, 'x'] })
    expect(res.code).toBe(200)
    expect(llamadas).toEqual(['ventasDelCrm bdi 10 [5]'])
    expect(res.body?.ventas).toEqual([{ id: 1_000_000_900, date_sale: '2026-11-15', total_price: 250000, client_id: NUEVA, channel_id: 10, sale_state: 'Cerrado' }])
    expect(conexiones).toEqual(['bdi'])
    expect(supabaseTocado).toEqual([])
  })
  it('el panel de WhatsApp encuentra por teléfono a un cliente NACIDO en el ERP, con su compra y su detalle', async () => {
    const res = await llamar({ action: 'panel', tel: '+54 9 341 222-2222' })
    expect(res.code).toBe(200)
    expect(res.body).toMatchObject({ encontrado: true, cliente: { id: NUEVA, city: 'Funes' } })
    expect((res.body?.ventas as unknown[]).length).toBe(1)
    expect((res.body?.detalles as unknown[]).length).toBe(1)
    expect(supabaseTocado).toEqual([])
  })
  it('lista del día: total y última compra del ERP', async () => {
    const res = await llamar({ action: 'lista', ids: [NUEVA] })
    expect(res.body?.clientes).toEqual([{ id: NUEVA, name: 'Nueva del ERP', phone: '5493412222222', total_amount: 250000, ultima_compra: '2026-11-15' }])
  })
  it('buscar por nombre: candidatos del ERP, filtrados por canal Mayorista o Whatsapp', async () => {
    const res = await llamar({ action: 'buscar', q: 'nueva erp' })
    expect(llamadas).toEqual(['porNombre %n__v_%,%_rp%', `ventasDeClientes [${NUEVA}] [10,8]`])
    expect(res.body?.clientes).toEqual([{ id: NUEVA, name: 'Nueva del ERP', city: 'Funes', phone: '5493412222222' }])
  })
  it('padrón y detalles: del ERP', async () => {
    expect((await llamar({ ids: [NUEVA, 7] })).body?.clientes).toHaveLength(1)
    expect((await llamar({ action: 'detalles', ids: [9] })).body?.detalles).toHaveLength(1)
    expect(supabaseTocado).toEqual([])
  })
  it('sin corte de BDI (Zattia cortada no cuenta): el espejo de siempre', async () => {
    cortes = { zattia: '2026-11-21T12:00:00Z' }
    const res = await llamar({ action: 'detalles', ids: [9] })
    expect(conexiones).toEqual([])
    expect(supabaseTocado).toEqual(['venta_detalles'])
    expect(res.code).toBe(500) // el supabase falso tira: lo que importa es que fue a él
  })
  it('🔴 sin saber si BDI cortó: TIRA (⛔ elige camino a ciegas)', async () => {
    cortes = new Error('la base no contesta')
    const res = await llamar({ action: 'ventas', modo: 'all' })
    expect(res.code).toBe(500)
    expect(res.body?.error).toMatch(/no contesta/)
    expect(supabaseTocado).toEqual([])
    expect(conexiones).toEqual([])
  })
})
