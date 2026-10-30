import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Liquidación → ERP → Tienda Nube (Stunned), **ejercido contra el handler**: que un producto Stunned ⛔ le pegue a Gestión
 * Nube, que el pedido quede anotado en el ítem SIN cambiarle el estado, y que `releer-erp` lo pase recién con la relectura
 * de TN. Las bases del motor van por `api/_liquidacion-erp.js`, que acá es un doble.
 * Mismo patrón de mock que `tests/liquidacion-colgadas-handler.test.ts`.
 */

let filasPorTabla: Record<string, unknown[]> = {}
const consultas: { tabla: string; pasos: string[] }[] = []

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from(tabla: string) {
      const registro = { tabla, pasos: [] as string[] }
      consultas.push(registro)
      const q: Record<string, unknown> = {}
      for (const m of ['select', 'in', 'eq', 'order', 'limit', 'insert', 'update', 'upsert']) {
        q[m] = (...args: unknown[]) => {
          registro.pasos.push(`${m}(${args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join('|')})`)
          return q
        }
      }
      const unaFila = () => Promise.resolve({ data: (filasPorTabla[tabla] || [])[0] ?? null, error: null })
      q.single = unaFila
      q.maybeSingle = unaFila
      q.range = (desde: number) => Promise.resolve({ data: desde === 0 ? filasPorTabla[tabla] || [] : [], error: null })
      q.then = (ok: (v: unknown) => unknown) =>
        Promise.resolve({ data: filasPorTabla[tabla] || [], error: null }).then(ok)
      return q
    },
  }),
}))

function resFalso() {
  const r = {
    code: 0 as number,
    body: null as Record<string, unknown> | null,
    setHeader() {},
    status(c: number) { r.code = c; return r },
    json(b: unknown) { r.body = b as Record<string, unknown>; return r },
    send(b: string) { r.body = JSON.parse(b) as Record<string, unknown>; return r },
    end() { return r },
  }
  return r
}

const sobre = (d: unknown) => Buffer.from(JSON.stringify(d), 'utf8').toString('base64')
const cabecera = { 'x-monitor-auth': sobre({ user: 'Alguien', pass: 'p' }) }
const ADMIN = { name: 'Bruno', admin: true, cuenta: null, acceso: { zattia: { liquidacion: true } }, funcion: [] }

const pedidosFetch: string[] = []
function sesionDe(perfil: unknown) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => (pedidosFetch.push(String(url)), { ok: true, json: async () => ({ ok: true, perfil }) })))
}

const pedirAlErp = vi.fn()
const eventosDePrecio = vi.fn()
vi.mock('../api/_liquidacion-erp.js', () => ({
  pedirAlErp: (...a: unknown[]) => pedirAlErp(...a),
  eventosDePrecio: (...a: unknown[]) => eventosDePrecio(...a),
  lineasDe: async (_s: unknown, _st: unknown, pids: string[]) => new Map(pids.map((p) => [p, p === '7' ? 'stunned' : 'zattia'])),
}))

async function llamar(req: unknown) {
  const mod = await import(/* @vite-ignore */ '@/api/_liquidacion.js')
  const res = resFalso()
  await (mod.default as (q: unknown, s: typeof res) => Promise<unknown>)(req, res)
  return res
}


const post = (body: Record<string, unknown>) => ({ method: 'POST', query: { store: 'zattia' }, headers: cabecera, body: { store: 'zattia', id: 'c1', ...body } })
const item = (estado: string, aplicacion: Record<string, unknown> = {}) => ({
  pid: '7', estado,
  datos: { foto: { nombre: 'BUZO FLECK', sku: 'STU-FLECK-M', precioNormal: 45990, promoPrevia: null }, decision: { precioSale: 31990 }, aplicacion: { aplicadoEn: null, ...aplicacion } },
})
const pasosDe = (tabla: string, verbo: string) => consultas.filter((c) => c.tabla === tabla && c.pasos.some((p) => p.startsWith(verbo)))

beforeEach(() => {
  filasPorTabla = {}
  consultas.length = 0
  pedidosFetch.length = 0
  pedirAlErp.mockReset()
  eventosDePrecio.mockReset()
  process.env.ZATTIA_SUPABASE_URL = 'https://zattia.supabase.co'
  process.env.ZATTIA_SUPABASE_SERVICE_KEY = 'clave'
  process.env.GN_TOKEN_ZATTIA = 'token-gn'
  sesionDe(ADMIN)
})
afterEach(() => vi.unstubAllGlobals())

describe('aplicar: Stunned va por el ERP', () => {
  it('🔴 ⛔ le pega a Gestión Nube: carga en el ERP, anota el pedido y el ítem sigue confirmado', async () => {
    filasPorTabla = { liquidacion_items: [item('confirmado')], liquidaciones: [{ nombre: 'CYBER STUNNED · Drop 2' }], liquidacion_bitacora: [] }
    pedirAlErp.mockResolvedValue({ pedidoEn: '2026-11-01T10:00:00.000Z', resultados: [{ pid: '7', ok: true, valor: 31990, quiere: 31990 }] })
    const res = await llamar(post({ action: 'aplicar', pids: ['7'], modo: 'poner' }))
    expect(res.code).toBe(200)
    expect(res.body?.resultados).toEqual([{ pid: '7', ok: true, pendiente: true, precio: 31990 }])
    expect(pedidosFetch.filter((u) => !u.includes('/api/'))).toEqual([])
    expect(pedidosFetch.some((u) => /gestionnube|api\.gn/i.test(u))).toBe(false)
    expect(pedirAlErp.mock.calls[0][0]).toMatchObject({ liqId: 'c1', liqNombre: 'CYBER STUNNED · Drop 2', modo: 'poner', items: [{ pid: '7', precioSale: 31990 }] })
    const upd = pasosDe('liquidacion_items', 'update')[0].pasos.find((p) => p.startsWith('update'))!
    expect(upd).toContain('"erp":{"modo":"poner","valor":31990,"quiere":31990,"pedidoEn":"2026-11-01T10:00:00.000Z","por":"Bruno"}')
    expect(upd).toMatch(/^update\(\{"datos":/)
    expect(upd).not.toContain('"estado":"aplicado"')
    expect(pasosDe('liquidacion_bitacora', 'insert')).toHaveLength(0)
  })
})

describe('releer-erp: recién con la relectura de TN', () => {
  const pedido = { erp: { modo: 'poner', valor: 31990, quiere: 31990, pedidoEn: '2026-11-01T10:00:00.000Z', por: 'Bruno' } }
  it('quedó: bitácora + aplicado + el pedido se borra', async () => {
    filasPorTabla = { liquidacion_items: [item('confirmado', pedido)], liquidaciones: [{ nombre: 'CYBER' }], liquidacion_bitacora: [] }
    eventosDePrecio.mockResolvedValue([{ id: 3, estado: 'hecho', tomado_en: '2026-11-01T10:00:40.000Z', error: null, resultado: { campanias: { 7: { campania: 'c1', quiere: 31990, tn: [31990], ok: true } } } }])
    const res = await llamar(post({ action: 'releer-erp' }))
    expect(res.body).toMatchObject({ ok: true, quedaron: [{ pid: '7' }], esperando: [], fallos: [] })
    expect(pasosDe('liquidacion_bitacora', 'insert')).toHaveLength(1)
    const upd = pasosDe('liquidacion_items', 'update')[0].pasos.find((p) => p.startsWith('update'))!
    expect(upd).toContain('"estado":"aplicado"')
    expect(upd).toContain('"erp":null')
  })
  it('🔴 TN todavía ⛔ lo muestra: ⛔ bitácora ni estado', async () => {
    filasPorTabla = { liquidacion_items: [item('confirmado', pedido)], liquidaciones: [{ nombre: 'CYBER' }], liquidacion_bitacora: [] }
    eventosDePrecio.mockResolvedValue([{ id: 3, estado: 'hecho', tomado_en: '2026-11-01T10:00:40.000Z', error: null, resultado: { campanias: { 7: { campania: 'c1', quiere: 31990, tn: [null], ok: false } } } }])
    const res = await llamar(post({ action: 'releer-erp' }))
    expect(res.body).toMatchObject({ quedaron: [], esperando: ['7'] })
    expect(pasosDe('liquidacion_bitacora', 'insert')).toHaveLength(0)
    expect(pasosDe('liquidacion_items', 'update')).toHaveLength(0)
  })
})
