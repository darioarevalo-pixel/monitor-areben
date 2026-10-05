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
  // F5: la cuenta de MP de Pagos recibidos y lo que «entró».
  usos: [] as Fila[],
  llaves: [] as Fila[],
  mpPagos: [] as Fila[],
  // W3: el turno propio.
  turnos: [] as Fila[],
  movs: [] as Fila[],
}
const gn = {
  posts: [] as Fila[],
  gets: [] as string[],
  authInventario: [] as string[],
  respuestaPost: { status: 201, body: { data: { id: 1600001, number: 30100 } } as unknown },
  delDia: { data: [] as Fila[] },
  // W3b: `GET /ventas?account_id=…&include_payments=1` (los cobros de GN del turno).
  lista: { status: 200, body: { data: [] as Fila[], meta: { has_more_pages: false } } as unknown },
}
const mp = { busquedas: 0 }
// W1: el audit de TN (bdi-catalogo). `tramos` = la respuesta de cada pedido, en orden; anota la URL y el sobre.
const tn = { pedidos: [] as Array<{ url: string; sobre?: string }>, tramos: [] as Array<{ status: number; body: unknown }> }
const mailer = { posts: [] as Array<{ body: Fila; key?: string; url: string }> }

function consulta(tabla: string) {
  const filtros: Array<(f: Fila) => boolean> = []
  let accion: { tipo: 'select' } | { tipo: 'update'; cambios: Fila } | { tipo: 'insert'; fila: Fila } = { tipo: 'select' }
  const filas = (): Fila[] => {
    const todas = tabla === 'caja_venta' ? [...base.ventas.values()] : tabla === 'caja_config' ? (base.config ? [base.config] : [])
      : tabla === 'mp_cuenta_uso' ? base.usos : tabla === 'mp_cuentas' ? base.llaves
      : tabla === 'caja_turno' ? base.turnos : tabla === 'caja_turno_mov' ? base.movs : base.inventario
    return todas.filter((f) => filtros.every((p) => p(f)))
  }
  const ejecutar = () => {
    if (accion.tipo === 'insert' && tabla === 'caja_turno') {
      const nuevo = accion.fila
      // El índice único parcial: un solo turno abierto por marca.
      if (base.turnos.some((t) => t.store === nuevo.store && t.cerrado_en == null)) return { data: null, error: { code: '23505', message: 'duplicate key' } }
      const t = { id: `0000000${base.turnos.length + 1}-0000-4000-8000-000000000000`.slice(-36), abierto_en: new Date().toISOString(), cerrado_en: null, ...accion.fila }
      base.turnos.push(t)
      return { data: [t], error: null }
    }
    if (accion.tipo === 'insert' && tabla === 'mp_cuenta_uso') {
      const u = { desde: new Date().toISOString(), ...accion.fila }
      base.usos.push(u)
      return { data: [u], error: null }
    }
    if (accion.tipo === 'insert' && tabla === 'caja_turno_mov') {
      const m = { id: `m${base.movs.length + 1}`, creado_en: new Date().toISOString(), ...accion.fila }
      base.movs.push(m)
      return { data: [m], error: null }
    }
    if (accion.tipo === 'insert') {
      const f = accion.fila
      if (base.ventas.has(String(f.id))) return { data: null, error: { code: '23505', message: 'duplicate key' } }
      base.ventas.set(String(f.id), { intentos: 0, creada_en: new Date().toISOString(), ...f })
      return { data: [base.ventas.get(String(f.id))], error: null }
    }
    if (accion.tipo === 'update') {
      // El índice único de `mp_pago_id` (sql/migrate-caja-transferencia.sql).
      const pid = accion.cambios.mp_pago_id
      if (pid != null && [...base.ventas.values()].some((f) => f.mp_pago_id === pid)) return { data: null, error: { code: '23505', message: 'duplicate key' } }
      const out = filas().map((f) => Object.assign(f, accion.tipo === 'update' ? accion.cambios : {}))
      return { data: out, error: null }
    }
    return { data: filas(), error: null }
  }
  const q: Record<string, unknown> = {}
  q.select = () => q
  q.eq = (c: string, v: unknown) => { filtros.push((f) => String(f[c]) === String(v)); return q }
  q.neq = (c: string, v: unknown) => { filtros.push((f) => f[c] !== v); return q }
  // Como Postgres: `%` es comodín, `\%` y `\_` son literales; ⛔ ignora tildes.
  q.ilike = (c: string, v: string) => {
    const re = new RegExp('^' + v.split(/(\\.|%)/).map((t) => (t === '%' ? '.*' : t.replace(/^\\/, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))).join('') + '$', 'is')
    filtros.push((f) => re.test(String(f[c] || '')))
    return q
  }
  q.is = (c: string, v: unknown) => { filtros.push((f) => (v === null ? f[c] == null : f[c] === v)); return q }
  q.in = (c: string, v: unknown[]) => { filtros.push((f) => v.map(String).includes(String(f[c]))); return q }
  q.not = (c: string, op: string, v: unknown) => { filtros.push((f) => (op === 'is' && v === null ? f[c] != null : true)); return q }
  q.gte = (c: string, v: string) => { filtros.push((f) => String(f[c]) >= v); return q }
  q.lt = (c: string, v: string) => { filtros.push((f) => String(f[c]) < v); return q }
  q.order = () => q
  q.limit = () => q
  q.range = () => q
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
      if (String(url).includes('/ventas?')) return respuesta(gn.lista.status, gn.lista.body)
      if (String(url).includes('/ventas/referencias')) return respuesta(200, { cuentas: [{ id: 12921, name: 'Efectivo', balance: 114084283.83 }, { id: 99, name: 'Mercado Pago', balance: 5 }] })
      if (String(url).includes('/inventario/')) gn.authInventario.push(String(opts?.headers?.Authorization))
      if (String(url).includes('/inventario/')) return respuesta(200, { product_id: 7, variantes: [{ size_id: 8, stock_por_tienda: [{ store_id: 11780, available_quantity: 1 }, { store_id: 18210, available_quantity: 4 }] }] })
      return respuesta(404, {})
    }
    if (String(url).includes('tiendanube-audit')) {
      tn.pedidos.push({ url: String(url), sobre: opts?.headers?.['x-monitor-auth'] })
      const t = tn.tramos[tn.pedidos.length - 1] || { status: 200, body: { ok: true, ordenes: [], total_en_rango: 0 } }
      return respuesta(t.status, t.body)
    }
    if (String(url).startsWith('https://api.mercadopago.com/v1/payments/search')) {
      mp.busquedas++
      return respuesta(200, { results: base.mpPagos })
    }
    if (String(url).startsWith('https://mailer.test')) {
      mailer.posts.push({ url: String(url), body: JSON.parse(String(opts?.body)), key: opts?.headers?.['x-ticket-key'] })
      return respuesta(200, { encolado: true, runId: 'r1' })
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

const CUENTA_MP = 136578181
const TURNO_ID = '11111111-2222-4333-8444-555555555555'
const ID = '3f1c2b9e-6a4d-4c1e-9b7a-2d5e8f0a1b3c'
// $25.490 en efectivo ⇒ $21.700 (la venta #30021 del POS de GN).
const VENTA = { action: 'confirmar', id: ID, items: [{ product_id: 7, size_id: 8, cantidad: 1, precio: 25490 }], pagos: [{ cuenta: 12921 }], total: 21700, pagaCon: 22000 }

beforeEach(async () => {
  base.ventas = new Map(); base.config = null; base.inventario = []
  base.usos = [{ store: 'zattia', cuenta_id: CUENTA_MP, desde: '2026-10-01T12:00:00.000Z' }]
  base.llaves = [{ cuenta_id: CUENTA_MP, token: 'APP_USR-llave' }]
  base.mpPagos = []; mp.busquedas = 0
  // Hay un turno abierto: las ventas de los tests de antes de W3 se cobran adentro de él.
  base.turnos = [{ id: TURNO_ID, store: 'zattia', fondo: 50000, abierto_en: '2026-10-04T12:00:00.000Z', cerrado_en: null, abierto_por: 'cajera', abierto_por_usuario: 'cajera' }]; base.movs = []
  mailer.posts = []; delete process.env.MAILER_URL; delete process.env.MAILER_TICKET_KEY
  gn.posts = []; gn.gets = []; gn.authInventario = []; gn.respuestaPost = { status: 201, body: { data: { id: 1600001, number: 30100 } } }; gn.delDia = { data: [] }
  gn.lista = { status: 200, body: { data: [], meta: { has_more_pages: false } } }
  process.env.ZATTIA_SUPABASE_URL = 'https://x.supabase.co'
  process.env.ZATTIA_SUPABASE_SERVICE_KEY = 'k'
  process.env.GN_TOKEN_VENTAS = 'tok-ventas'
  process.env.GN_TOKEN_ZATTIA = 'tok-zattia'
  // Después de las variables: `_gn.js` lee los tokens al cargarse.
  ;(await import('../api/_caja.js')).olvidarCobrosGN()
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

describe('caja · formas de pago y descuentos a mano (Bruno, 4-oct)', () => {
  const ADMIN_ = { name: 'admin', admin: true, cuenta: null, acceso: {}, funcion: [] }

  it('una cuenta que ⛔ está detrás de ninguna forma de pago ⇒ 400 y ⛔ sale a GN', async () => {
    conSesion(CAJERA)
    const r = await correr(req('POST', {}, { ...VENTA, pagos: [{ cuenta: 13014 }], total: 25500 }))
    expect(r.code).toBe(400)
    expect(String(r.body?.error)).toMatch(/forma de pago/)
    expect(gn.posts).toHaveLength(0)
  })

  it('la fila guarda el MEDIO, ⛔ el nombre de la cuenta de GN', async () => {
    conSesion(CAJERA)
    const r = await correr(req('POST', {}, { ...VENTA, pagos: [{ cuenta: 25172 }], total: 22900, pagaCon: null }))
    expect(r.code).toBe(200)
    expect((base.ventas.get(ID)!.pagos as Fila[])[0]).toMatchObject({ cuenta: 25172, nombre: 'Tarjeta de crédito' })
  })

  it('el descuento a la venta se rearma en el servidor: el total de la pantalla tiene que coincidir', async () => {
    conSesion(CAJERA)
    const items = [{ product_id: 7, size_id: 8, cantidad: 1, precio: 10000, rebaja: { tipo: 'pct', valor: 20 } }]
    const mal = await correr(req('POST', {}, { ...VENTA, items, total: 6800, descuentoVenta: { tipo: 'pct', valor: 10 } }))
    expect(mal.code).toBe(409)
    expect(gn.posts).toHaveLength(0)
    const r = await correr(req('POST', {}, { ...VENTA, items, total: 6100, pagaCon: 6100, descuentoVenta: { tipo: 'pct', valor: 10 } }))
    expect(r.code).toBe(200)
    const p = gn.posts[0] as { items: Fila[]; payments: Fila[] }
    expect(p.items[0]).toMatchObject({ unit_price: 10000, discount: 3900 })
    expect(base.ventas.get(ID)).toMatchObject({ subtotal: 8000, total: 6100 })
    expect((base.ventas.get(ID)!.pagos as Fila[])[0]).toMatchObject({ rebaja: 800, descuento: 1080 })
  })

  it('bajadas: sólo admin; la transferencia va sólo a una cuenta de transferencias', async () => {
    conSesion(CAJERA)
    expect((await correr(req('POST', {}, { action: 'bajadas', transferenciaA: 20595 }))).code).toBe(403)
    conSesion(ADMIN_)
    expect((await correr(req('POST', {}, { action: 'bajadas', transferenciaA: 12921 }))).code).toBe(400)
    const r = await correr(req('POST', {}, { action: 'bajadas', transferenciaA: 20595, feria: true }))
    expect(r.code).toBe(200)
    expect((base.config as { reglas: Fila }).reglas).toMatchObject({ transferenciaA: 20595, feria: true })
  })

  it('cuenta de MP donde se detectan las transferencias: la MISMA de Pagos recibidos; cambiarla, sólo admin', async () => {
    base.llaves = [{ cuenta_id: CUENTA_MP, token: 'APP_USR-llave', nombre: 'BDIACCESORIOS', store: 'zattia' }, { cuenta_id: 999, token: 'APP_USR-otra', nombre: 'AREBEN', store: 'zattia' }]
    conSesion(CAJERA)
    const c = await correr(req('GET', { action: 'cuentas-mp' }))
    expect(c.body).toEqual({ enUso: { cuenta_id: CUENTA_MP, nombre: 'BDIACCESORIOS' } })
    expect(JSON.stringify(c.body)).not.toContain('APP_USR')
    expect((await correr(req('POST', {}, { action: 'usar-mp', cuenta_id: 999 }))).code).toBe(403)
    conSesion(ADMIN_)
    expect((await correr(req('GET', { action: 'cuentas-mp' }))).body).toMatchObject({ cuentas: [{ cuenta_id: CUENTA_MP }, { cuenta_id: 999, nombre: 'AREBEN' }] })
    expect((await correr(req('POST', {}, { action: 'usar-mp', cuenta_id: 12345 }))).code).toBe(404)
    const r = await correr(req('POST', {}, { action: 'usar-mp', cuenta_id: 999 }))
    expect(r.body).toEqual({ enUso: { cuenta_id: 999, nombre: 'AREBEN' } })
    expect(base.usos.at(-1)).toMatchObject({ store: 'zattia', cuenta_id: 999 })
  })

  it('logo del ticket: sólo admin, PNG o JPG, y vuelve en la configuración', async () => {
    const logo = { src: 'data:image/png;base64,iVBORw0KGgo=', ancho: 400, alto: 120 }
    conSesion(CAJERA)
    expect((await correr(req('POST', {}, { action: 'logo', logo }))).code).toBe(403)
    conSesion(ADMIN_)
    expect((await correr(req('POST', {}, { action: 'logo', logo: { ...logo, src: 'data:text/html;base64,PHNjcmlwdD4=' } }))).code).toBe(400)
    expect((await correr(req('POST', {}, { action: 'logo', logo: { ...logo, ancho: 0 } }))).code).toBe(400)
    expect((await correr(req('POST', {}, { action: 'logo', logo }))).code).toBe(200)
    expect((await correr(req('GET', { action: 'config' }))).body).toMatchObject({ ticket_logo: logo })
    expect((await correr(req('POST', {}, { action: 'logo', logo: null }))).code).toBe(200)
    expect((await correr(req('GET', { action: 'config' }))).body).toMatchObject({ ticket_logo: null })
  })

  it('🔴 productos de feria trabados: un admin los marca y el servidor EXIGE la cuenta de feria', async () => {
    conSesion(CAJERA)
    expect((await correr(req('POST', {}, { action: 'bajadas', feriaProductos: [{ id: 7, nombre: 'CORSET' }] }))).code).toBe(403)
    conSesion(ADMIN_)
    expect((await correr(req('POST', {}, { action: 'bajadas', feriaProductos: [{ id: 'x' }] }))).code).toBe(400)
    const r = await correr(req('POST', {}, { action: 'bajadas', feriaProductos: [{ id: 7, nombre: 'CORSET' }, { id: 7, nombre: 'CORSET' }] }))
    expect(r.code).toBe(200)
    expect((base.config as { reglas: Fila }).reglas).toMatchObject({ feriaProductos: [{ id: 7, nombre: 'CORSET' }] })
    conSesion(CAJERA)
    // A la cuenta de efectivo normal, con su −15 %: ⛔.
    const mal = await correr(req('POST', {}, VENTA))
    expect(mal.code).toBe(400)
    expect(mal.body).toMatchObject({ error: expect.stringMatching(/feria/) })
    expect(gn.posts).toHaveLength(0)
    // A la de feria, precio final: $25.490 ⇒ $25.500 redondeado.
    const bien = await correr(req('POST', {}, { ...VENTA, pagos: [{ cuenta: 25867 }], total: 25500, pagaCon: 25500 }))
    expect(bien.code).toBe(200)
    expect((gn.posts[0] as { payments: Fila[] }).payments).toEqual([expect.objectContaining({ amount: 25500, account_id: 25867 })])
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

  it('F4: con mail, ya en GN, pide el ticket al mailer (llave en el header) y el nombre ⛔ viaja a GN', async () => {
    conSesion(CAJERA)
    process.env.MAILER_URL = 'https://mailer.test'
    process.env.MAILER_TICKET_KEY = 'llave'
    const items = [{ ...VENTA.items[0], nombre: 'CORSET FRANK', talle: 'S', foto: 'https://cdn.test/f.jpg' }]
    const r = await correr(req('POST', {}, { ...VENTA, items, email: 'Clienta@Ejemplo.com' }))
    expect(r.code).toBe(200)
    expect(JSON.stringify(gn.posts[0])).not.toContain('CORSET FRANK')
    expect(mailer.posts).toHaveLength(1)
    expect(mailer.posts[0]).toMatchObject({ url: 'https://mailer.test/api/externo/ticket', key: 'llave' })
    const t = mailer.posts[0].body as { email: string; ticket: { numero: number; total: number; vuelto: number; renglones: Fila[]; pagos: Fila[] } }
    expect(t.email).toBe('clienta@ejemplo.com')
    expect(t.ticket).toMatchObject({ numero: 30100, total: 21700, vuelto: 300 })
    expect(t.ticket.renglones[0]).toMatchObject({ nombre: 'CORSET FRANK', talle: 'S', foto: 'https://cdn.test/f.jpg', importe: 25490 })
    expect(t.ticket.pagos[0]).toMatchObject({ cuenta: 'Efectivo', monto: 21700 })
    expect(base.ventas.get(ID)).toMatchObject({ ticket_mail: 'encolado' })
  })

  it('F4: sin mail ⛔ se llama al mailer', async () => {
    conSesion(CAJERA)
    process.env.MAILER_URL = 'https://mailer.test'
    process.env.MAILER_TICKET_KEY = 'llave'
    expect((await correr(req('POST', {}, VENTA))).code).toBe(200)
    expect(mailer.posts).toHaveLength(0)
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

  describe('producto por nombre y talle (Bruno, 4-oct)', () => {
    const fila = (pid: number, sid: number, nombre: string, talle: string, local: number, barcode = `${pid}${sid}`) =>
      [{ product_id: pid, size_id: sid, product_name: nombre, size_name: talle, sku: null, barcode, available_quantity: local, store_name: 'Local' },
        { product_id: pid, size_id: sid, product_name: nombre, size_name: talle, sku: null, barcode, available_quantity: 9, store_name: 'Deposito' }]

    it('varias que coinciden ⇒ la lista, primero las que hay en el local, con su stock del LOCAL', async () => {
      conSesion(CAJERA)
      base.inventario = [...fila(1, 1, 'CORSET FRANK Verde', 'M', 0), ...fila(1, 2, 'CORSET FRANK Verde', 'S', 2), ...fila(2, 1, 'TOP EVA', 'S', 5)]
      const r = await correr(req('GET', { action: 'producto', codigo: 'corset frank' }))
      expect(r.code).toBe(200)
      const candidatos = r.body?.candidatos as Array<{ size_name: string; local: number }>
      expect(candidatos.map((c) => `${c.size_name}:${c.local}`)).toEqual(['S:2', 'M:0'])
    })

    it('una sola ⇒ entra derecho con el stock en vivo; el orden de las palabras ⛔ importa', async () => {
      conSesion(CAJERA)
      base.inventario = [...fila(7, 8, 'CORSET FRANK Verde', 'S', 3), ...fila(7, 9, 'CORSET FRANK Verde', 'M', 3)]
      const r = await correr(req('GET', { action: 'producto', codigo: 's verde corset' }))
      expect(r.body).toMatchObject({ variante: { product_id: 7, size_id: 8 }, stock: { fuente: 'vivo' } })
    })

    it('elegir de la lista trae la variante EXACTA aunque el barcode lo compartan dos', async () => {
      conSesion(CAJERA)
      base.inventario = [...fila(7, 8, 'CORSET FRANK', 'S', 3, '000001'), ...fila(5, 5, 'TOP EVA', 'S', 3, '000001')]
      expect((await correr(req('GET', { action: 'producto', codigo: '000001' }))).body?.candidatos).toHaveLength(2)
      const r = await correr(req('GET', { action: 'producto', product_id: '7', size_id: '8' }))
      expect(r.body).toMatchObject({ variante: { product_id: 7, size_id: 8 } })
    })

    it('buscar (mientras se escribe): POR PRODUCTO, con y sin stock en el LOCAL, ⛔ pega a GN', async () => {
      conSesion(CAJERA)
      base.inventario = [...fila(1, 1, 'CORSET FRANK Verde', 'M', 0), ...fila(1, 2, 'CORSET FRANK Verde', 'S', 2), ...fila(2, 1, 'TOP EVA', 'S', 5)]
      const llamadas = gn.gets.length
      const r = await correr(req('GET', { action: 'buscar', q: 'frank' }))
      expect(r.code).toBe(200)
      // Un producto, con la variante del local primero y la que ⛔ hay después (el modal la muestra aparte).
      expect(r.body).toMatchObject({ conStock: [{ product_id: 1, local: 2, variantes: [{ size_name: 'S', local: 2 }, { size_name: 'M', local: 0 }] }], sinStock: [], masCon: 0, masSin: 0 })
      expect(gn.gets.length).toBe(llamadas)
      expect((await correr(req('GET', { action: 'buscar', q: '000001' }))).body).toMatchObject({ conStock: [], sinStock: [] })
      expect((await correr(req('GET', { action: 'buscar', q: 'zzz' }))).body).toMatchObject({ conStock: [], sinStock: [] })
    })

    it('un número que ⛔ es código ⇒ 404, ⛔ se busca por nombre', async () => {
      conSesion(CAJERA)
      base.inventario = fila(1, 1, 'BABY TEE 38', 'U', 1)
      expect((await correr(req('GET', { action: 'producto', codigo: '38' }))).code).toBe(404)
    })
  })

  it('producto que ⛔ está ⇒ 404', async () => {
    conSesion(CAJERA)
    expect((await correr(req('GET', { action: 'producto', codigo: 'nada' }))).code).toBe(404)
  })
})

describe('caja · política de cambio del ticket', () => {
  const ADMIN = { name: 'bruno', admin: true, cuenta: null, acceso: {}, funcion: [] }
  it('🔴 la cajera ⛔ la cambia: 403 y la fila queda igual', async () => {
    conSesion(CAJERA)
    const r = await correr(req('POST', {}, { action: 'politica', texto: 'Sin cambios' }))
    expect(r.code).toBe(403)
    expect(base.config).toBeNull()
  })
  it('un admin la guarda (sembrando la fila si ⛔ estaba) y config la devuelve', async () => {
    conSesion(ADMIN)
    const r = await correr(req('POST', {}, { action: 'politica', texto: '  Cambios dentro de los 30 días con ticket.  ' }))
    expect(r.code).toBe(200)
    expect(base.config).toMatchObject({ politica_cambio: 'Cambios dentro de los 30 días con ticket.' })
    const c = await correr(req('GET', { action: 'config' }))
    expect(c.body).toMatchObject({ politica_cambio: 'Cambios dentro de los 30 días con ticket.' })
  })
  it('vacía ⇒ null (el ticket sale sin política, ⛔ con un renglón en blanco)', async () => {
    conSesion(ADMIN)
    await correr(req('POST', {}, { action: 'politica', texto: '   ' }))
    expect(base.config).toMatchObject({ politica_cambio: null })
  })
})

// ─── F5: la transferencia que se confirma sola ───────────────────────────────────────────────────
// $25.490 por Transferencia (−10 %) ⇒ $22.941 ⇒ redondeo ⇒ $22.900.
const ID2 = '7a2d4c6e-1b3f-4a5c-8d7e-9f0a1b2c3d4e'
const TRANSF = { ...VENTA, pagos: [{ cuenta: 13015 }], total: 22900, pagaCon: null }
/** Un pago de MP como lo devuelve `/v1/payments/search`, aprobado `dentroDe` ms desde ahora. */
const pagoMP = (id: number, monto: number, dentroDe = 60_000, extra: Fila = {}) => {
  const t = new Date(Date.now() + dentroDe).toISOString()
  return { id, status: 'approved', collector_id: CUENTA_MP, transaction_amount: monto, operation_type: 'money_transfer', payment_method_id: 'account_money', payment_type_id: 'account_money', date_created: t, date_approved: t, ...extra }
}

describe('caja · F5 transferencia', () => {
  it('🔑 por Transferencia la venta ESPERA: ⛔ sale a GN, ⛔ mail, y guarda el monto a esperar', async () => {
    conSesion(CAJERA)
    process.env.MAILER_URL = 'https://mailer.test'
    process.env.MAILER_TICKET_KEY = 'llave'
    const r = await correr(req('POST', {}, { ...TRANSF, email: 'a@b.com' }))
    expect(r.code).toBe(200)
    expect(gn.posts).toHaveLength(0)
    expect(mailer.posts).toHaveLength(0)
    expect(base.ventas.get(ID)).toMatchObject({ estado: 'esperando_pago', espera_monto: 22900, total: 22900 })
    expect((r.body?.venta as Fila).estado).toBe('esperando_pago')
    expect(r.body?.venta).not.toHaveProperty('payload')
  })

  it('🔴 confirmar otra vez, reintentar ⇒ ⛔ la mandan a GN sin el pago', async () => {
    conSesion(CAJERA)
    await correr(req('POST', {}, TRANSF))
    expect((await correr(req('POST', {}, TRANSF))).code).toBe(200)
    expect((await correr(req('POST', {}, { action: 'reintentar', id: ID }))).code).toBe(409)
    expect(gn.posts).toHaveLength(0)
    expect(base.ventas.get(ID)!.estado).toBe('esperando_pago')
  })

  it('🔴 el respaldo de la cola ⛔ la manda: `enviarVenta` se niega', async () => {
    const { enviarVenta } = await import('../lib/caja/enviar.core.js')
    const nada = { from: () => { throw new Error('⛔ debería tocar la base') } }
    await expect(enviarVenta({ id: ID, estado: 'esperando_pago', payload: {} }, { sb: nada, gnFetch: async () => { throw new Error('⛔ GN') }, base: 'x', token: 't' })).rejects.toThrow(/esperando la transferencia/)
  })

  it('sin la transferencia en MP ⇒ sigue esperando y ⛔ sale a GN', async () => {
    conSesion(CAJERA)
    await correr(req('POST', {}, TRANSF))
    base.mpPagos = [pagoMP(1, 22800), pagoMP(2, 22900, 60_000, { status: 'pending' })]
    const r = await correr(req('POST', {}, { action: 'cruzar', id: ID }))
    expect(r.code).toBe(200)
    expect(r.body?.cruce).toEqual({ estado: 'esperando' })
    expect(mp.busquedas).toBe(1)
    expect(gn.posts).toHaveLength(0)
  })

  it('🔑 llega el monto exacto ⇒ toma el pago, la manda a GN y queda en_gn', async () => {
    conSesion(CAJERA)
    await correr(req('POST', {}, TRANSF))
    base.mpPagos = [pagoMP(77, 22900)]
    const r = await correr(req('POST', {}, { action: 'cruzar', id: ID }))
    expect(r.code).toBe(200)
    expect(r.body?.cruce).toMatchObject({ estado: 'llego', por: 'solo', pago: { id: '77' } })
    expect(gn.posts).toHaveLength(1)
    expect((gn.posts[0] as { payments: Fila[] }).payments).toEqual([expect.objectContaining({ amount: 22900, account_id: 13015 })])
    expect(base.ventas.get(ID)).toMatchObject({ estado: 'en_gn', gn_number: 30100, mp_pago_id: '77', mp_cruce: 'solo' })
    // Preguntar otra vez ⇒ «ya», ⛔ otro POST (la otra pantalla ⛔ imprime de nuevo).
    const otra = await correr(req('POST', {}, { action: 'cruzar', id: ID }))
    expect(otra.body?.cruce).toEqual({ estado: 'ya' })
    expect(gn.posts).toHaveLength(1)
  })

  it('🔴 un pago confirma UNA venta: la segunda del mismo monto sigue esperando', async () => {
    conSesion(CAJERA)
    await correr(req('POST', {}, TRANSF))
    base.mpPagos = [pagoMP(77, 22900)]
    await correr(req('POST', {}, { action: 'cruzar', id: ID }))
    await correr(req('POST', {}, { ...TRANSF, id: ID2 }))
    const r = await correr(req('POST', {}, { action: 'cruzar', id: ID2 }))
    expect(r.body?.cruce).toEqual({ estado: 'esperando' })
    // ...ni eligiéndolo a mano.
    const a = await correr(req('POST', {}, { action: 'cruzar', id: ID2, pago: '77' }))
    expect(a.body?.cruce).toMatchObject({ estado: 'invalido' })
    expect(base.ventas.get(ID2)!.estado).toBe('esperando_pago')
    expect(gn.posts).toHaveLength(1)
  })

  it('🔑 dos ventas esperando el mismo monto ⇒ elige la cajera, y recién ahí sale', async () => {
    conSesion(CAJERA)
    await correr(req('POST', {}, TRANSF))
    await correr(req('POST', {}, { ...TRANSF, id: ID2 }))
    base.mpPagos = [pagoMP(77, 22900)]
    const r = await correr(req('POST', {}, { action: 'cruzar', id: ID }))
    expect(r.body?.cruce).toMatchObject({ estado: 'elegir', candidatos: [{ id: '77', monto: 22900 }] })
    expect(gn.posts).toHaveLength(0)
    const e = await correr(req('POST', {}, { action: 'cruzar', id: ID2, pago: '77' }))
    expect(e.body?.cruce).toMatchObject({ estado: 'llego', por: 'cajera' })
    expect(base.ventas.get(ID2)).toMatchObject({ estado: 'en_gn', mp_pago_id: '77', mp_cruce: 'cajera' })
    expect(base.ventas.get(ID)!.estado).toBe('esperando_pago')
  })

  it('el candidato ⛔ trae datos de quien pagó', async () => {
    conSesion(CAJERA)
    await correr(req('POST', {}, TRANSF))
    await correr(req('POST', {}, { ...TRANSF, id: ID2 }))
    base.mpPagos = [pagoMP(77, 22900, 60_000, { payer: { email: 'quien@paga.com', identification: { number: '27123456789' } } })]
    const r = await correr(req('POST', {}, { action: 'cruzar', id: ID }))
    expect(JSON.stringify(r.body)).not.toMatch(/quien@paga|27123456789|APP_USR/)
  })

  it('pago y Efectivo juntos: espera SÓLO la parte de la transferencia', async () => {
    conSesion(CAJERA)
    // $25.490: $10.000 en efectivo (−15 % ⇒ $8.500) y $15.490 por transferencia (−10 % ⇒ $13.941 ⇒ $13.900).
    const r = await correr(req('POST', {}, { ...VENTA, pagos: [{ cuenta: 12921, base: 10000 }, { cuenta: 13015 }], total: 22400, pagaCon: 8500 }))
    expect(r.code).toBe(200)
    expect(base.ventas.get(ID)).toMatchObject({ estado: 'esperando_pago', espera_monto: 13900, total: 22400 })
  })

  it('dos pagos por transferencia en una venta ⇒ se espera UNA por la suma (Bruno, 5-oct)', async () => {
    conSesion(CAJERA)
    // $10.000 −10 % = $9.000; $15.490 −10 % = $13.941 ⇒ $13.900. Una transferencia de $22.900.
    const r = await correr(req('POST', {}, { ...VENTA, pagos: [{ cuenta: 13015, base: 10000 }, { cuenta: 13015 }], total: 22900 }))
    expect(r.code).toBe(200)
    expect(base.ventas.get(ID)).toMatchObject({ estado: 'esperando_pago', espera_monto: 22900 })
    expect(gn.posts).toHaveLength(0)
  })

  it('🔴 la de feria (25868) también espera: ⛔ va directo a GN', async () => {
    conSesion(CAJERA)
    const r = await correr(req('POST', {}, { ...VENTA, pagos: [{ cuenta: 25868 }], total: 25500, pagaCon: null }))
    expect(r.code).toBe(200)
    expect(base.ventas.get(ID)).toMatchObject({ estado: 'esperando_pago', espera_monto: 25500 })
    expect(gn.posts).toHaveLength(0)
  })

  it('sin cuenta de MP conectada ⇒ lo dice y sigue esperando', async () => {
    conSesion(CAJERA)
    await correr(req('POST', {}, TRANSF))
    base.usos = []
    const r = await correr(req('POST', {}, { action: 'cruzar', id: ID }))
    expect(r.body?.cruce).toMatchObject({ estado: 'sin_cuenta' })
    expect(mp.busquedas).toBe(0)
  })

  it('cancelar ⇒ cancelada, ⛔ sale nunca, y ⛔ aparece en pendientes', async () => {
    conSesion(CAJERA)
    await correr(req('POST', {}, TRANSF))
    const c = await correr(req('POST', {}, { action: 'cancelar', id: ID }))
    expect(c.code).toBe(200)
    expect(base.ventas.get(ID)).toMatchObject({ estado: 'cancelada', cancelada_por: 'cajera' })
    base.mpPagos = [pagoMP(77, 22900)]
    expect((await correr(req('POST', {}, { action: 'cruzar', id: ID }))).body?.cruce).toEqual({ estado: 'cancelada' })
    expect((await correr(req('POST', {}, { action: 'reintentar', id: ID }))).code).toBe(409)
    expect(gn.posts).toHaveLength(0)
    expect((await correr(req('GET', { action: 'pendientes' }))).body?.ventas).toEqual([])
  })

  it('🔴 ⛔ se cancela una venta cuyo pago ya llegó', async () => {
    conSesion(CAJERA)
    await correr(req('POST', {}, TRANSF))
    base.mpPagos = [pagoMP(77, 22900)]
    await correr(req('POST', {}, { action: 'cruzar', id: ID }))
    const c = await correr(req('POST', {}, { action: 'cancelar', id: ID }))
    expect(c.code).toBe(409)
    expect(base.ventas.get(ID)!.estado).toBe('en_gn')
  })

  it('pendientes trae la que espera (para el cartel ámbar)', async () => {
    conSesion(CAJERA)
    await correr(req('POST', {}, TRANSF))
    const r = await correr(req('GET', { action: 'pendientes' }))
    expect((r.body?.ventas as Fila[]).map((v) => v.estado)).toEqual(['esperando_pago'])
  })
})

describe('caja · pedidos web sin armar (W1)', () => {
  const orden = (number: number, envio_estado: string, sku: string, extra: Fila = {}) => ({
    number, estado_pago: 'paid', estado_orden: 'open', envio_estado, cancelada: false,
    fecha: '2026-10-03T21:05:48+0000', pagado_en: '2026-10-03T21:05:48+0000', products: [{ sku, name: 'X', quantity: 1 }], ...extra,
  })
  beforeEach(async () => {
    tn.pedidos = []; tn.tramos = []
    const { olvidarPedidosWeb } = await import('../api/_caja.js')
    olvidarPedidosWeb()
  })

  it('lee TRES tramos de 3 días, reenviando la sesión, y devuelve sólo los por empaquetar', async () => {
    conSesion(CAJERA)
    tn.tramos = [
      { status: 200, body: { ok: true, ordenes: [orden(7153, 'unpacked', 'RVE-0022-RO'), orden(7140, 'unshipped', 'RTO-1'), orden(7152, 'unpacked', 'RTO-2', { estado_pago: 'pending', estado_orden: 'cancelled', cancelada: true })], total_en_rango: 3 } },
      { status: 200, body: { ok: true, ordenes: [orden(6984, 'unpacked', 'RTO-0149-BL', { pagado_en: '2026-09-28T02:45:00+0000' })], total_en_rango: 1 } },
      { status: 200, body: { ok: true, ordenes: [], total_en_rango: 0 } },
    ]
    const r = await correr(req('GET', { action: 'pedidos-web' }))
    expect(r.code).toBe(200)
    expect(tn.pedidos).toHaveLength(3)
    expect(tn.pedidos.every((p) => p.sobre === sobre({ user: 'x', pass: 'p' }))).toBe(true)
    expect(tn.pedidos.every((p) => p.url.includes('store=zattia') && p.url.includes('limite=200'))).toBe(true)
    expect((r.body?.pedidos as Fila[]).map((p) => p.numero)).toEqual([6984, 7153])
    expect(Object.keys(r.body?.porSku as Fila).sort()).toEqual(['RTO-0149-BL', 'RVE-0022-RO'])
    expect(r.body?.noLeidas).toBe(0)
  })

  it('🔴 el corte del audit (240 en el rango, 200 leídas) se CUENTA: ⛔ callado', async () => {
    conSesion(CAJERA)
    tn.tramos = [{ status: 200, body: { ok: true, ordenes: [orden(1, 'unpacked', 'A')], total_en_rango: 41 } }]
    const r = await correr(req('GET', { action: 'pedidos-web' }))
    expect(r.body?.noLeidas).toBe(40)
  })

  it('TN caído ⇒ 502 con el motivo, ⛔ una lista vacía que diga «no hay pedidos»', async () => {
    conSesion(CAJERA)
    tn.tramos = [{ status: 200, body: { ok: false, error: 'rate limit' } }]
    const r = await correr(req('GET', { action: 'pedidos-web' }))
    expect(r.code).toBe(502)
    expect(String(r.body?.error)).toMatch(/rate limit/)
  })

  it('dos pantallas en el mismo minuto ⇒ UNA lectura a TN', async () => {
    conSesion(CAJERA)
    await correr(req('GET', { action: 'pedidos-web' }))
    await correr(req('GET', { action: 'pedidos-web' }))
    expect(tn.pedidos).toHaveLength(3)
  })

  it('sin el permiso de la Caja ⛔ lee pedidos', async () => {
    conSesion(OTRA)
    const r = await correr(req('GET', { action: 'pedidos-web' }))
    expect(r.code).toBe(403)
    expect(tn.pedidos).toHaveLength(0)
  })
})

describe('caja · turno propio (v2, W3)', () => {
  it('sin turno abierto ⛔ se cobra: 409 y ⛔ sale nada a GN ni a la base', async () => {
    conSesion(CAJERA)
    base.turnos = []
    const r = await correr(req('POST', {}, VENTA))
    expect(r.code).toBe(409)
    expect(r.body?.sinTurno).toBe(true)
    expect(gn.posts).toHaveLength(0)
    expect(base.ventas.size).toBe(0)
  })

  it('la venta queda en el turno abierto', async () => {
    conSesion(CAJERA)
    expect((await correr(req('POST', {}, VENTA))).code).toBe(200)
    expect(base.ventas.get(ID)!.turno_id).toBe(TURNO_ID)
  })

  it('abrir con un turno ya abierto ⇒ 409 (el índice único); sin fondo válido ⇒ 400', async () => {
    conSesion(CAJERA)
    expect((await correr(req('POST', {}, { action: 'abrir-turno', fondo: 1000 }))).code).toBe(409)
    base.turnos = []
    expect((await correr(req('POST', {}, { action: 'abrir-turno', fondo: -1 }))).code).toBe(400)
    expect((await correr(req('POST', {}, { action: 'abrir-turno', fondo: 'x' }))).code).toBe(400)
    const r = await correr(req('POST', {}, { action: 'abrir-turno', fondo: 51900 }))
    expect(r.code).toBe(200)
    expect(base.turnos).toHaveLength(1)
    expect(base.turnos[0]).toMatchObject({ fondo: 51900, abierto_por: 'cajera', cerrado_en: null })
  })

  it('el ciclo: venta en efectivo + salida ⇒ el cierre guarda esperado, contado, la foto y la diferencia', async () => {
    conSesion(CAJERA)
    await correr(req('POST', {}, VENTA)) // $21.700 en efectivo
    expect((await correr(req('POST', {}, { action: 'salida', monto: 5000, motivo: '' }))).code).toBe(400)
    expect((await correr(req('POST', {}, { action: 'salida', monto: 0, motivo: 'x' }))).code).toBe(400)
    expect((await correr(req('POST', {}, { action: 'salida', monto: 5000, motivo: 'Retiro para gerencia' }))).code).toBe(200)
    const t = await correr(req('GET', { action: 'turno' }))
    const turno = t.body?.turno as { resumen: { efectivo: Fila } }
    expect(turno.resumen.efectivo).toEqual({ fondo: 50000, cobrado: 21700, cobradoGN: 0, salidas: 5000, esperado: 66700 })
    expect(JSON.stringify(t.body)).not.toMatch(/balance|114084283/)

    expect((await correr(req('POST', {}, { action: 'cerrar-turno', id: TURNO_ID }))).code).toBe(400)
    const c = await correr(req('POST', {}, { action: 'cerrar-turno', id: TURNO_ID, contado: 66500, nota: 'faltan 200' }))
    expect(c.code).toBe(200)
    expect(base.turnos[0]).toMatchObject({ contado: 66500, esperado: 66700, cerrado_por: 'cajera', nota: 'faltan 200' })
    expect((base.turnos[0].resumen as Fila).diferencia).toBe(-200)
    expect(base.turnos[0].cerrado_en).toBeTruthy()
    // Cerrado: ⛔ se cierra dos veces, ⛔ se saca efectivo y ⛔ se cobra.
    expect((await correr(req('POST', {}, { action: 'cerrar-turno', id: TURNO_ID, contado: 1 }))).code).toBe(409)
    expect((await correr(req('POST', {}, { action: 'salida', monto: 1, motivo: 'x' }))).code).toBe(409)
    expect((await correr(req('POST', {}, { ...VENTA, id: '9f1c2b9e-6a4d-4c1e-9b7a-2d5e8f0a1b3c' }))).code).toBe(409)
    // Y queda en los últimos cerrados.
    const u = await correr(req('GET', { action: 'turno' }))
    expect(u.body?.turno).toBeNull()
    expect((u.body?.ultimos as Fila[]).map((x) => x.id)).toEqual([TURNO_ID])
  })

  it('W3b: el efectivo cobrado EN GN durante el turno suma al esperado y entra en la foto del cierre', async () => {
    conSesion(CAJERA)
    // El turno abrió el 4-oct a las 9:00 (Argentina). Un pedido web cobrado a las 10:15 entra; uno de la
    // víspera ⛔; una venta del POS de GN (canal 3) ⛔.
    const pago = (id: number, created_at: string) => ({ id, amount: 38241, account_id: 12921, created_at })
    gn.lista = { status: 200, body: { data: [
      { number: 29981, channel_id: 16, tn_order: '7144', client_name: 'Melania', payments: [pago(1, '2026-10-04 10:15:00')] },
      { number: 29900, channel_id: 16, payments: [pago(2, '2026-10-03 18:00:00')] },
      { number: 29990, channel_id: 3, payments: [pago(3, '2026-10-04 10:30:00')] },
    ], meta: { has_more_pages: false } } }
    const t = await correr(req('GET', { action: 'turno' }))
    const turno = t.body?.turno as { resumen: { efectivo: Fila; cobrosGN: Fila[] } }
    expect(turno.resumen.efectivo).toEqual({ fondo: 50000, cobrado: 0, cobradoGN: 38241, salidas: 0, esperado: 88241 })
    expect(turno.resumen.cobrosGN.map((c) => c.venta)).toEqual([29981])
    // Se pide por cada cuenta de efectivo, con los cobros, 10 días de ventas para atrás.
    const pedidas = gn.gets.filter((u) => u.includes('/ventas?'))
    expect(pedidas.some((u) => u.includes('account_id=12921') && u.includes('include_payments=1') && u.includes('dateFrom=2026-09-24'))).toBe(true)

    const c = await correr(req('POST', {}, { action: 'cerrar-turno', id: TURNO_ID, contado: 88241 }))
    expect(c.code).toBe(200)
    expect(base.turnos[0]).toMatchObject({ esperado: 88241, contado: 88241 })
    expect((base.turnos[0].resumen as Fila).diferencia).toBe(0)
  })

  it('W3b: GN ⛔ contesta ⇒ el turno se ve igual, sin los cobros de GN, y lo dice', async () => {
    conSesion(CAJERA)
    gn.lista = { status: 500, body: { message: 'x' } }
    const t = await correr(req('GET', { action: 'turno' }))
    expect(t.code).toBe(200)
    const r = (t.body?.turno as { resumen: { efectivo: Fila; cobrosGN: unknown } }).resumen
    expect(r.cobrosGN).toBeNull()
    expect(r.efectivo.esperado).toBe(50000)
  })

  it('sin el permiso `caja` ⇒ 403', async () => {
    conSesion(OTRA)
    expect((await correr(req('POST', {}, { action: 'contar', id: TURNO_ID, conteo: { 1000: 1 } }))).code).toBe(403)
    expect((await correr(req('POST', {}, { action: 'abrir-turno', fondo: 1 }))).code).toBe(403)
    expect((await correr(req('GET', { action: 'turno' }))).code).toBe(403)
  })
})

describe('caja · calculadora de billetes (fase B)', () => {
  // El oráculo, a mano: 3 × $20.000 + 4 × $1.000 + 1 × $500 = $64.500.
  const CONTEO = { 20000: 3, 1000: 4, 500: 1 }
  const CON_MAIL = { ...CAJERA, email: 'cajera@zattia.test' }

  it('🔑 abrir con el conteo: el servidor lo rearma, ⛔ coincide con el fondo ⇒ 400 y ⛔ se abre nada', async () => {
    conSesion(CON_MAIL)
    base.turnos = []
    const mal = await correr(req('POST', {}, { action: 'abrir-turno', fondo: 64000, conteo: CONTEO }))
    expect(mal.code).toBe(400)
    expect(String(mal.body?.error)).toMatch(/64\.500.*64\.000/)
    expect(base.turnos).toHaveLength(0)
    expect((await correr(req('POST', {}, { action: 'abrir-turno', fondo: 1000, conteo: { 1000: -1 } }))).code).toBe(400)
    expect(base.turnos).toHaveLength(0)

    const r = await correr(req('POST', {}, { action: 'abrir-turno', fondo: 64500, conteo: { ...CONTEO, 50: 9 } }))
    expect(r.code).toBe(200)
    const t = base.turnos[0]
    expect(t).toMatchObject({ fondo: 64500, abierto_por: 'cajera', abierto_por_usuario: 'cajera@zattia.test' })
    // El billete de $50 ⛔ está en la lista: ⛔ se guarda ni suma.
    expect((t.conteos as { apertura: Fila }).apertura).toMatchObject({ total: 64500, por: 'cajera', billetes: { 20000: 3, 10000: 0, 2000: 0, 1000: 4, 500: 1, 200: 0, 100: 0 } })
  })

  it('abrir sin conteo sigue andando (el input a mano); sin mail en el padrón queda el nombre', async () => {
    conSesion(CAJERA)
    base.turnos = []
    expect((await correr(req('POST', {}, { action: 'abrir-turno', fondo: 51900 }))).code).toBe(200)
    expect(base.turnos[0].conteos).toBeUndefined()
    expect(base.turnos[0].abierto_por_usuario).toBe('cajera')
    base.turnos = []
    // Antes, `Number('')` = 0 abría un turno con fondo cero.
    expect((await correr(req('POST', {}, { action: 'abrir-turno', fondo: '' }))).code).toBe(400)
  })

  it('🔑 contar: guarda el conteo con lo que tenía que haber y la diferencia; ⛔ cierra ni mueve plata', async () => {
    conSesion(CAJERA)
    await correr(req('POST', {}, VENTA)) // $21.700 en efectivo ⇒ tiene que haber $71.700
    const r = await correr(req('POST', {}, { action: 'contar', id: TURNO_ID, conteo: { 20000: 3, 10000: 1, 1000: 1, 500: 1 } }))
    expect(r.code).toBe(200)
    const t = base.turnos[0]
    expect(t.cerrado_en).toBeNull()
    expect(t.contado).toBeUndefined()
    expect(base.movs).toHaveLength(0)
    const [i] = (t.conteos as { intermedios: Fila[] }).intermedios
    expect(i).toMatchObject({ total: 71500, esperado: 71700, diferencia: -200 })
    expect(((r.body?.turno as Fila).conteos as { intermedios: Fila[] }).intermedios).toHaveLength(1)
    // El segundo se suma, ⛔ pisa al primero.
    await correr(req('POST', {}, { action: 'contar', id: TURNO_ID, conteo: { 20000: 3, 10000: 1, 1000: 1, 500: 1, 200: 1 } }))
    expect((base.turnos[0].conteos as { intermedios: Fila[] }).intermedios.map((x) => x.diferencia)).toEqual([-200, 0])
  })

  it('contar: sin conteo o con una cantidad mal ⇒ 400; turno cerrado u otro id ⇒ 409', async () => {
    conSesion(CAJERA)
    expect((await correr(req('POST', {}, { action: 'contar', id: TURNO_ID }))).code).toBe(400)
    expect((await correr(req('POST', {}, { action: 'contar', id: TURNO_ID, conteo: { 1000: 1.5 } }))).code).toBe(400)
    expect((await correr(req('POST', {}, { action: 'contar', id: 'x', conteo: { 1000: 1 } }))).code).toBe(400)
    expect((await correr(req('POST', {}, { action: 'contar', id: ID, conteo: { 1000: 1 } }))).code).toBe(409)
    base.turnos[0].cerrado_en = '2026-10-04T20:00:00.000Z'
    expect((await correr(req('POST', {}, { action: 'contar', id: TURNO_ID, conteo: { 1000: 1 } }))).code).toBe(409)
    expect(base.turnos[0].conteos).toBeUndefined()
  })

  it('🔑 cerrar con el conteo: ⛔ coincide con el contado ⇒ 400 y el turno sigue abierto; si coincide, queda junto a los intermedios', async () => {
    conSesion(CAJERA)
    base.turnos[0].conteos = { apertura: { total: 50000 }, intermedios: [{ total: 1 }] }
    const mal = await correr(req('POST', {}, { action: 'cerrar-turno', id: TURNO_ID, contado: 50000, conteo: CONTEO }))
    expect(mal.code).toBe(400)
    expect(base.turnos[0].cerrado_en).toBeNull()
    const r = await correr(req('POST', {}, { action: 'cerrar-turno', id: TURNO_ID, contado: 64500, conteo: CONTEO }))
    expect(r.code).toBe(200)
    expect(base.turnos[0]).toMatchObject({ contado: 64500, esperado: 50000 })
    const conteos = base.turnos[0].conteos as Record<string, Fila>
    expect(conteos.cierre).toMatchObject({ total: 64500, esperado: 50000, diferencia: 14500 })
    expect(conteos.apertura).toEqual({ total: 50000 })
    expect(conteos.intermedios).toEqual([{ total: 1 }])
  })

  it('bajadas: un admin cambia los billetes (ordenados); uno de $0 ⇒ 400; el conteo usa la lista nueva', async () => {
    conSesion({ ...CAJERA, admin: true })
    base.config = { store: 'zattia', reglas: { cuentas: {}, medios: { transferencia: { opciones: [13015] } } } }
    expect((await correr(req('POST', {}, { action: 'bajadas', billetes: [0, 100] }))).code).toBe(400)
    const r = await correr(req('POST', {}, { action: 'bajadas', billetes: [1000, 20000] }))
    expect(r.code).toBe(200)
    expect((base.config.reglas as Fila).billetes).toEqual([20000, 1000])
    base.turnos = []
    // $500 ya ⛔ es billete: 3 × 20.000 + 4 × 1.000 = $64.000.
    expect((await correr(req('POST', {}, { action: 'abrir-turno', fondo: 64000, conteo: CONTEO }))).code).toBe(200)
    conSesion(CAJERA)
    expect((await correr(req('POST', {}, { action: 'bajadas', billetes: [1000] }))).code).toBe(403)
  })
})

describe('caja · el POS es de la cuenta que abrió la caja (fase C)', () => {
  const OTRA_CAJERA = { ...CAJERA, name: 'otra cajera', email: 'otra@zattia.test' }

  it('🔑 otra cuenta con permiso de Caja ⛔ cobra: 403, ⛔ se guarda ni sale a GN', async () => {
    conSesion(OTRA_CAJERA)
    const r = await correr(req('POST', {}, VENTA))
    expect(r.code).toBe(403)
    expect(String(r.body?.error)).toContain('cajera')
    expect(base.ventas.size).toBe(0)
    expect(gn.posts).toHaveLength(0)
  })

  it('🔴 ni un admin', async () => {
    conSesion({ ...OTRA_CAJERA, admin: true })
    expect((await correr(req('POST', {}, VENTA))).code).toBe(403)
  })

  it('otra cuenta ⛔ cuenta billetes, pero SÍ cierra la caja (Bruno: «desde los dos lados»)', async () => {
    conSesion(OTRA_CAJERA)
    expect((await correr(req('POST', {}, { action: 'contar', id: TURNO_ID, conteo: { 1000: 1 } }))).code).toBe(403)
    expect(base.turnos[0].conteos).toBeUndefined()
    const c = await correr(req('POST', {}, { action: 'cerrar-turno', id: TURNO_ID, contado: 50000 }))
    expect(c.code).toBe(200)
    expect(base.turnos[0].cerrado_por).toBe('otra cajera')
  })

  it('el mismo mail con otra capitalización es la misma cuenta; quien abre queda dueño', async () => {
    conSesion(OTRA_CAJERA)
    base.turnos = []
    await correr(req('POST', {}, { action: 'abrir-turno', fondo: 1000 }))
    expect(base.turnos[0].abierto_por_usuario).toBe('otra@zattia.test')
    conSesion({ ...OTRA_CAJERA, email: 'Otra@Zattia.test' })
    expect((await correr(req('POST', {}, VENTA))).code).toBe(200)
  })
})
