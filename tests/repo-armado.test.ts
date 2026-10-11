// El armado de Reposición con el lector: lo puro (`armado.core.js`, `armado.ts`) y el handler que
// hace la transferencia en Gestión Nube (`api/_repo-armado.js`).
//
// 🔴 Lo que más importa acá es que **la transferencia no salga dos veces** y que **sólo lleve lo
// escaneado, nunca más de lo pedido**: mueve stock real en GN.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { itemsTransferencia, sanearEscaneos, sanearPedido } from '@/lib/reposicion/armado.core.js'
import { frase, leerCodigo, type LineaPedido } from '@/lib/reposicion/armado'

const L = (x: Partial<LineaPedido>): LineaPedido => ({ vid: '1_1', pid: '1', sid: '1', sku: 'RTO-1-NG', barcode: '779001', name: 'TOP ZOE', size: 'S', cant: 2, exhibir: false, ...x })

describe('lo puro', () => {
  it('sanea el pedido: un renglón por variante, sin cantidades raras', () => {
    const p = sanearPedido([
      { pid: '1', sid: '1', cant: 2, name: 'A' },
      { pid: '1', sid: '1', cant: 1, name: 'A' },
      { pid: '2', sid: '1', cant: 0 },
      { pid: '', sid: '1', cant: 3 },
      { pid: '3', sid: '9', cant: 5000, exhibir: 'sí' },
    ])
    expect(p.map((l: LineaPedido) => [l.vid, l.cant, l.exhibir])).toEqual([
      ['1_1', 3, false],
      ['3_9', 999, false],
    ])
  })

  it('🔴 lo escaneado se corta en lo pedido y sólo de variantes pedidas', () => {
    const pedido = [L({ vid: '1_1', cant: 2 }), L({ vid: '2_1', pid: '2', cant: 1 })]
    expect(sanearEscaneos({ '1_1': 5, '2_1': 1, '9_9': 4 }, pedido)).toEqual({ '1_1': 2, '2_1': 1 })
  })

  it('la transferencia va por producto y talle, sin lo que quedó en 0', () => {
    const pedido = [L({ vid: '10_3', pid: '10', sid: '3' }), L({ vid: '11_3', pid: '11', sid: '3' })]
    expect(itemsTransferencia(pedido, { '10_3': 2 })).toEqual([{ vid: '10_3', item: { product_id: 10, size_id: 3, quantity: 2 } }])
  })

  it('suma, avisa la primera para exhibir y frena lo que sobra', () => {
    const pedido = [L({ exhibir: true })]
    const a = leerCodigo(pedido, {}, '779001', [])
    expect(a).toMatchObject({ tipo: 'suma', n: 1, faltan: 1, exhibir: true })
    expect(frase(a as Extract<typeof a, { tipo: 'suma' }>)).toBe('Para exhibir. TOP ZOE, S. Faltan 1')
    expect(leerCodigo(pedido, { '1_1': 1 }, '779001', [])).toMatchObject({ tipo: 'suma', n: 2, faltan: 0, exhibir: false })
    expect(leerCodigo(pedido, { '1_1': 2 }, '779001', []).tipo).toBe('sobra')
  })

  it('lo que no se pidió se nombra, y lo desconocido se dice', () => {
    const inv = [{ barcode: '555', sku: 'X', name: 'BODY LIA', size: 'M' }]
    expect(leerCodigo([L({})], {}, '555', inv)).toEqual({ tipo: 'no-pedida', nombre: 'BODY LIA M' })
    expect(leerCodigo([L({})], {}, '000', inv).tipo).toBe('desconocido')
  })

  it('por SKU también engancha (con o sin guiones)', () => {
    expect(leerCodigo([L({})], {}, 'rto1ng', []).tipo).toBe('suma')
  })
})

// ─── El handler ────────────────────────────────────────────────────────────────────────────────

type Fila = Record<string, unknown>
const tabla: Fila[] = []

function consulta() {
  const filtros: ((f: Fila) => boolean)[] = []
  let cambios: Fila | null = null
  const filas = () => tabla.filter((f) => filtros.every((p) => p(f)))
  const resolver = () => {
    if (cambios) {
      const tocadas = filas()
      for (const f of tocadas) Object.assign(f, cambios)
      return { data: tocadas.map((f) => ({ id: f.id })), error: null }
    }
    return { data: filas(), error: null }
  }
  const q: Record<string, unknown> = {}
  q.select = () => q
  q.order = () => q
  q.limit = () => q
  q.eq = (c: string, v: unknown) => (filtros.push((f) => f[c] === v), q)
  q.neq = (c: string, v: unknown) => (filtros.push((f) => f[c] !== v), q)
  q.in = (c: string, vs: unknown[]) => (filtros.push((f) => vs.includes(f[c])), q)
  q.maybeSingle = async () => ({ data: filas()[0] ?? null, error: null })
  q.update = (c: Fila) => ((cambios = c), q)
  q.insert = async (f: Fila) => (tabla.push({ ...f }), { error: null })
  q.then = (ok: (v: unknown) => unknown) => ok(resolver())
  return q
}
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from: () => consulta() }) }))

const LORENA = { name: 'lorena', admin: false, cuenta: null, acceso: { zattia: { reposicion: true } }, funcion: [] }
const sobre = (d: unknown) => Buffer.from(JSON.stringify(d), 'utf8').toString('base64')

let llamadasGN: { url: string; body: Record<string, unknown> }[] = []
let respuestaGN: () => { status: number; body: unknown } = () => ({ status: 201, body: { executed: true, transfer_id: 7800, movement_id: 1 } })

beforeEach(() => {
  tabla.length = 0
  llamadasGN = []
  process.env.ZATTIA_SUPABASE_URL = 'https://x.supabase.co'
  process.env.ZATTIA_SUPABASE_SERVICE_KEY = 'k'
  process.env.GN_TOKEN_ZATTIA = 'tok'
  vi.resetModules()
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: { body?: string }) => {
      if (String(url).includes('gestionnube')) {
        llamadasGN.push({ url: String(url), body: JSON.parse(init?.body || '{}') })
        const r = respuestaGN()
        return { ok: r.status < 300, status: r.status, headers: { get: () => null }, json: async () => r.body }
      }
      return { ok: true, json: async () => ({ ok: true, perfil: LORENA }) }
    }),
  )
})
afterEach(() => vi.unstubAllGlobals())

async function correr(body: Record<string, unknown>) {
  const { default: handler } = await import('../api/_repo-armado.js')
  const res = { code: 0, body: null as Record<string, unknown> | null, setHeader() {}, status(c: number) { res.code = c; return res }, json(b: unknown) { res.body = b as Record<string, unknown>; return res }, end() { return res } }
  await (handler as (q: unknown, s: unknown) => Promise<void>)({ method: 'POST', headers: { 'x-monitor-auth': sobre({ user: 'lorena', pass: 'p' }) }, query: {}, body: { store: 'zattia', ...body } }, res)
  return res
}

const PEDIDO = [
  { pid: '10', sid: '3', name: 'TOP ZOE', size: 'S', cant: 2 },
  { pid: '11', sid: '4', name: 'BODY LIA', size: 'M', cant: 1 },
]
const abrir = () => correr({ action: 'abrir', id: 'ra1', linea: 'zattia', sentido: 'llevar', pedido: PEDIDO })

describe('api/_repo-armado.js', () => {
  it('abre con la firma del servidor, no la del body', async () => {
    const r = await correr({ action: 'abrir', id: 'ra1', linea: 'zattia', sentido: 'llevar', pedido: PEDIDO, persona: 'otra' })
    expect(r.code).toBe(200)
    expect(tabla[0]).toMatchObject({ persona: 'lorena', estado: 'en_curso' })
  })

  it('transfiere depósito → local sólo lo escaneado, cortado en lo pedido', async () => {
    await abrir()
    const r = await correr({ action: 'transferir', id: 'ra1', escaneos: { '10_3': 7 }, faltantes: { '11_4': 'no-estaba' } })
    expect(r.code).toBe(200)
    expect(llamadasGN).toHaveLength(1)
    expect(llamadasGN[0].body).toMatchObject({ from_store_id: 18210, to_store_id: 11780, items: [{ product_id: 10, size_id: 3, quantity: 2 }] })
    expect(tabla[0]).toMatchObject({ estado: 'transferido', faltantes: { '11_4': 'no-estaba' } })
  })

  it('🔴 un segundo «transferir» no vuelve a llamar a Gestión Nube', async () => {
    await abrir()
    await correr({ action: 'transferir', id: 'ra1', escaneos: { '10_3': 1 } })
    const r = await correr({ action: 'transferir', id: 'ra1', escaneos: { '10_3': 1 } })
    expect(r.code).toBe(409)
    expect(llamadasGN).toHaveLength(1)
  })

  it('422 de GN: no movió nada, vuelve a en curso y dice qué renglón', async () => {
    await abrir()
    respuestaGN = () => ({ status: 422, body: { executed: false, items: [{ status: 'ok' }, { status: 'error', reason: 'stock_insuficiente' }] } })
    const r = await correr({ action: 'transferir', id: 'ra1', escaneos: { '10_3': 2, '11_4': 1 } })
    expect(r.code).toBe(422)
    expect(r.body?.rechazados).toEqual([{ vid: '11_4', reason: 'stock_insuficiente' }])
    expect(tabla[0].estado).toBe('en_curso')
  })

  it('🔴 un 500 de GN deja el armado para revisar (puede haberse hecho) y no se reintenta', async () => {
    await abrir()
    respuestaGN = () => ({ status: 500, body: { message: 'boom' } })
    const r = await correr({ action: 'transferir', id: 'ra1', escaneos: { '10_3': 1 } })
    expect(r.code).toBe(502)
    expect(llamadasGN).toHaveLength(1)
    expect(tabla[0].estado).toBe('revisar')
    respuestaGN = () => ({ status: 201, body: { executed: true, transfer_id: 1 } })
  })

  it('sin nada escaneado no llama a GN', async () => {
    await abrir()
    const r = await correr({ action: 'transferir', id: 'ra1', escaneos: {} })
    expect(r.code).toBe(400)
    expect(llamadasGN).toHaveLength(0)
    expect(tabla[0].estado).toBe('en_curso')
  })
})
