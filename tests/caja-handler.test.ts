// `api/_caja.js`: quién cobra, qué se le manda a GN y qué queda en `caja_venta`.
//
// La base (`createClient`) y GN (`fetch`) son falsos y ANOTAN lo que se les pide: el oráculo es el
// cuerpo que viajó a GN y la fila que quedó, ⛔ lo que contestó el handler.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

type Fila = Record<string, unknown>

const base = {
  ventas: new Map<string, Fila>(),
  config: null as Fila | null,
  inventario: [] as Fila[],
}
const gn = {
  posts: [] as Fila[],
  gets: [] as string[],
  authInventario: [] as string[],
  respuestaPost: { status: 201, body: { data: { id: 1600001, number: 30100 } } as unknown },
  delDia: { data: [] as Fila[] },
}

function consulta(tabla: string) {
  const filtros: Array<(f: Fila) => boolean> = []
  let accion: { tipo: 'select' } | { tipo: 'update'; cambios: Fila } | { tipo: 'insert'; fila: Fila } = { tipo: 'select' }
  const filas = (): Fila[] => {
    const todas = tabla === 'caja_venta' ? [...base.ventas.values()] : tabla === 'caja_config' ? (base.config ? [base.config] : []) : base.inventario
    return todas.filter((f) => filtros.every((p) => p(f)))
  }
  const ejecutar = () => {
    if (accion.tipo === 'insert') {
      const f = accion.fila
      if (base.ventas.has(String(f.id))) return { data: null, error: { code: '23505', message: 'duplicate key' } }
      base.ventas.set(String(f.id), { intentos: 0, ...f })
      return { data: [base.ventas.get(String(f.id))], error: null }
    }
    if (accion.tipo === 'update') {
      const out = filas().map((f) => Object.assign(f, accion.tipo === 'update' ? accion.cambios : {}))
      return { data: out, error: null }
    }
    return { data: filas(), error: null }
  }
  const q: Record<string, unknown> = {}
  q.select = () => q
  q.eq = (c: string, v: unknown) => { filtros.push((f) => String(f[c]) === String(v)); return q }
  q.neq = (c: string, v: unknown) => { filtros.push((f) => f[c] !== v); return q }
  q.ilike = (c: string, v: string) => { filtros.push((f) => String(f[c] || '').toLowerCase() === v.toLowerCase()); return q }
  q.order = () => q
  q.limit = () => q
  q.insert = (f: Fila) => { accion = { tipo: 'insert', fila: f }; return q }
  q.update = (c: Fila) => { accion = { tipo: 'update', cambios: c }; return q }
  q.upsert = async (f: Fila) => { if (!base.config) base.config = f; return { error: null } }
  q.maybeSingle = async () => { const r = ejecutar(); return { data: r.data ? r.data[0] ?? null : null, error: r.error } }
  q.single = async () => { const r = ejecutar(); return { data: r.data ? r.data[0] ?? null : null, error: r.error } }
  q.then = (ok: (v: unknown) => unknown) => Promise.resolve(ejecutar()).then(ok)
  return q
}

vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from: (t: string) => consulta(t) }) }))

function resFalso() {
  const r = {
    code: 0 as number,
    body: null as Record<string, unknown> | null,
    setHeader() {},
    status(c: number) { r.code = c; return r },
    json(b: unknown) { r.body = b as Record<string, unknown>; return r },
    end() { return r },
  }
  return r
}

const sobre = (d: unknown) => Buffer.from(JSON.stringify(d), 'utf8').toString('base64')
const CAJERA = { name: 'cajera', admin: false, cuenta: null, acceso: { zattia: { caja: true } }, funcion: [] }
const OTRA = { name: 'otra', admin: false, cuenta: null, acceso: { zattia: { exhib: true } }, funcion: [] }

const respuesta = (status: number, body: unknown) => ({
  ok: status >= 200 && status < 300, status, headers: { get: () => null },
  text: async () => JSON.stringify(body), json: async () => body,
})

function conSesion(perfil: unknown) {
  vi.stubGlobal('fetch', vi.fn(async (url: string, opts?: { method?: string; body?: string; headers?: Record<string, string> }) => {
    if (String(url).includes('gestionnube.com')) {
      if (opts?.method === 'POST') { gn.posts.push(JSON.parse(String(opts.body))); return respuesta(gn.respuestaPost.status, gn.respuestaPost.body) }
      gn.gets.push(String(url))
      if (String(url).includes('/ventas/obtener')) return respuesta(200, gn.delDia)
      if (String(url).includes('/ventas/referencias')) return respuesta(200, { cuentas: [{ id: 12921, name: 'Efectivo', balance: 114084283.83 }, { id: 99, name: 'Mercado Pago', balance: 5 }] })
      if (String(url).includes('/inventario/')) gn.authInventario.push(String(opts?.headers?.Authorization))
      if (String(url).includes('/inventario/')) return respuesta(200, { product_id: 7, variantes: [{ size_id: 8, stock_por_tienda: [{ store_id: 11780, available_quantity: 1 }, { store_id: 18210, available_quantity: 4 }] }] })
      return respuesta(404, {})
    }
    return { ok: true, json: async () => ({ ok: true, perfil }) }
  }))
}

async function correr(req: Record<string, unknown>) {
  const { default: handler } = await import('../api/_caja.js')
  const res = resFalso()
  await (handler as (q: unknown, s: unknown) => Promise<void>)(req, res)
  return res
}
const req = (method: 'GET' | 'POST', query: Record<string, unknown>, body?: Record<string, unknown>) => ({
  method, headers: { 'x-monitor-auth': sobre({ user: 'x', pass: 'p' }) }, query, body,
})

const ID = '3f1c2b9e-6a4d-4c1e-9b7a-2d5e8f0a1b3c'
// $25.490 en efectivo ⇒ $21.700 (la venta #30021 del POS de GN).
const VENTA = { action: 'confirmar', id: ID, items: [{ product_id: 7, size_id: 8, cantidad: 1, precio: 25490 }], pagos: [{ cuenta: 12921 }], total: 21700, pagaCon: 22000 }

beforeEach(() => {
  base.ventas = new Map(); base.config = null; base.inventario = []
  gn.posts = []; gn.gets = []; gn.authInventario = []; gn.respuestaPost = { status: 201, body: { data: { id: 1600001, number: 30100 } } }; gn.delDia = { data: [] }
  process.env.ZATTIA_SUPABASE_URL = 'https://x.supabase.co'
  process.env.ZATTIA_SUPABASE_SERVICE_KEY = 'k'
  process.env.GN_TOKEN_VENTAS = 'tok-ventas'
  process.env.GN_TOKEN_ZATTIA = 'tok-zattia'
})
afterEach(() => { vi.unstubAllGlobals() })

describe('caja · permiso', () => {
  it('sin el permiso `caja` ⇒ 403 y ⛔ sale nada a GN', async () => {
    conSesion(OTRA)
    const r = await correr(req('POST', {}, VENTA))
    expect(r.code).toBe(403)
    expect(gn.posts).toHaveLength(0)
    expect(base.ventas.size).toBe(0)
  })
  it('otra marca ⇒ 400', async () => {
    conSesion(CAJERA)
    expect((await correr(req('GET', { action: 'config', store: 'bdi' }))).code).toBe(400)
  })
})

describe('caja · confirmar', () => {
  it('guarda, manda a GN el descuento en pesos y queda en_gn con su número', async () => {
    conSesion(CAJERA)
    const r = await correr(req('POST', {}, VENTA))
    expect(r.code).toBe(200)
    expect(gn.posts).toHaveLength(1)
    const p = gn.posts[0] as { items: Fila[]; payments: Fila[]; integration_id: string; discount_amount: number }
    expect(p.integration_id).toBe(ID)
    expect(p.items[0]).toMatchObject({ unit_price: 25490, discount: 3790, quantity: 1 })
    expect(p.discount_amount).toBe(0)
    expect(p.payments).toEqual([expect.objectContaining({ amount: 21700, account_id: 12921 })])
    const fila = base.ventas.get(ID)!
    expect(fila).toMatchObject({ estado: 'en_gn', gn_sale_id: 1600001, gn_number: 30100, total: 21700, paga_con: 22000, usuario: 'cajera', intentos: 1 })
    // la configuración se sembró con la del POS de GN
    expect(base.config).toBeTruthy()
  })

  it('🔑 el total de la pantalla ⛔ coincide ⇒ 409 y ⛔ sale nada a GN', async () => {
    conSesion(CAJERA)
    const r = await correr(req('POST', {}, { ...VENTA, total: 21666.5 }))
    expect(r.code).toBe(409)
    expect(r.body?.total).toBe(21700)
    expect(gn.posts).toHaveLength(0)
    expect(base.ventas.size).toBe(0)
  })

  it('🔑 GN contesta 409 ⇒ «ya está»: la busca entre las del día y guarda su número', async () => {
    conSesion(CAJERA)
    gn.respuestaPost = { status: 409, body: { message: 'Ya existe una venta con esa referencia de integracion' } }
    gn.delDia = { data: [{ id: 1, number: 2, integration_id: 'otra' }, { id: 1600002, number: 30101, integration_id: ID }] }
    const r = await correr(req('POST', {}, VENTA))
    expect(r.code).toBe(200)
    expect(base.ventas.get(ID)).toMatchObject({ estado: 'en_gn', gn_number: 30101 })
    expect(gn.gets.some((u) => /ventas\/obtener\?from=\d{4}-\d{2}-\d{2}&to=\d{4}-\d{2}-\d{2}/.test(u))).toBe(true)
  })

  it('GN corta (429) ⇒ queda en error reintentable, guardada', async () => {
    conSesion(CAJERA)
    gn.respuestaPost = { status: 429, body: { message: 'Too Many Attempts.' } }
    const r = await correr(req('POST', {}, VENTA))
    expect(r.code).toBe(200)
    expect(r.body?.reintentable).toBe(true)
    expect(base.ventas.get(ID)).toMatchObject({ estado: 'error' })
    expect(String(base.ventas.get(ID)!.ultimo_error)).toMatch(/429/)
  })

  it('🔴 el error guardado ⛔ lleva el token', async () => {
    conSesion(CAJERA)
    gn.respuestaPost = { status: 500, body: { message: 'Unauthenticated: Bearer tok-ventas' } }
    await correr(req('POST', {}, VENTA))
    expect(String(base.ventas.get(ID)!.ultimo_error)).not.toContain('tok-ventas')
  })

  it('confirmar dos veces la MISMA venta ⇒ un solo POST si ya está en GN', async () => {
    conSesion(CAJERA)
    await correr(req('POST', {}, VENTA))
    const r = await correr(req('POST', {}, VENTA))
    expect(r.code).toBe(200)
    expect(gn.posts).toHaveLength(1)
  })

  it('Feria TC (recargo) ⇒ 400, ⛔ se manda', async () => {
    conSesion(CAJERA)
    const r = await correr(req('POST', {}, { ...VENTA, pagos: [{ cuenta: 25869 }] }))
    expect(r.code).toBe(400)
    expect(gn.posts).toHaveLength(0)
  })
})

describe('caja · reintentar', () => {
  it('manda el payload GUARDADO tal cual, aunque la configuración haya cambiado', async () => {
    conSesion(CAJERA)
    gn.respuestaPost = { status: 503, body: null }
    await correr(req('POST', {}, VENTA))
    const primero = JSON.stringify(gn.posts[0])
    // Alguien cambió el efectivo a 20 % en el medio.
    base.config = { store: 'zattia', reglas: { redondeo: 100, cuentas: { 12921: { nombre: 'Efectivo', descuento: 20 } } } }
    gn.respuestaPost = { status: 201, body: { data: { id: 1600003, number: 30102 } } }
    const r = await correr(req('POST', {}, { action: 'reintentar', id: ID }))
    expect(r.code).toBe(200)
    expect(JSON.stringify(gn.posts[1])).toBe(primero)
    expect(base.ventas.get(ID)).toMatchObject({ estado: 'en_gn', gn_number: 30102, intentos: 2 })
  })
})

describe('caja · lecturas', () => {
  it('🔴 referencias ⛔ manda el saldo de las cuentas, y marca cuáles se cobran', async () => {
    conSesion(CAJERA)
    const r = await correr(req('GET', { action: 'referencias' }))
    expect(JSON.stringify(r.body)).not.toContain('balance')
    expect(JSON.stringify(r.body)).not.toContain('114084283')
    const cuentas = r.body?.cuentas as Array<{ id: number; regla: unknown }>
    expect(cuentas.find((c) => c.id === 12921)?.regla).toMatchObject({ descuento: 15 })
    expect(cuentas.find((c) => c.id === 99)?.regla).toBeNull()
  })

  it('producto: del código a la variante, con stock en vivo de Local y Depósito', async () => {
    conSesion(CAJERA)
    base.inventario = [{ product_id: 7, size_id: 8, product_name: 'CORSET FRANK', size_name: 'S', sku: 'CF-S', barcode: '692479', available_quantity: 3, store_name: 'Local' }]
    const r = await correr(req('GET', { action: 'producto', codigo: '692479' }))
    expect(r.code).toBe(200)
    expect(r.body).toMatchObject({ variante: { product_id: 7, size_id: 8 }, stock: { local: 1, deposito: 4, fuente: 'vivo' } })
    // 🔴 el stock se lee con el token de Zattia: con el de ventas, en producción caía siempre al espejo
    expect(gn.authInventario).toEqual(['Bearer tok-zattia'])
  })

  it('producto que ⛔ está ⇒ 404', async () => {
    conSesion(CAJERA)
    expect((await correr(req('GET', { action: 'producto', codigo: 'nada' }))).code).toBe(404)
  })
})
