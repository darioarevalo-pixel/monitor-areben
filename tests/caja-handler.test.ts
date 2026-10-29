// `api/_caja.js`: quién cobra, qué se le manda a GN y qué queda en `caja_venta`.
//
// La base (`createClient`) y GN (`fetch`) son falsos y ANOTAN lo que se les pide: el oráculo es el
// cuerpo que viajó a GN y la fila que quedó, ⛔ lo que contestó el handler.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { REGLAS_INICIALES } from '@/lib/caja/core.core.js'

type Fila = Record<string, unknown>

const base = {
  ventas: new Map<string, Fila>(),
  // Stunned (29-oct): las ventas del ERP que lee el turno (pedidos web cobrados en efectivo).
  erpVentas: [] as Fila[],
  config: null as Fila | null,
  inventario: [] as Fila[],
  // F5: la cuenta de MP de Pagos recibidos y lo que «entró».
  usos: [] as Fila[],
  llaves: [] as Fila[],
  mpPagos: [] as Fila[],
  // W3: el turno propio.
  turnos: [] as Fila[],
  movs: [] as Fila[],
  // A6: las promos bancarias de la Agenda (base de BDI).
  agenda: [] as Fila[],
  // La feria de Liquidación (Bruno, 11-oct).
  liqItems: [] as Fila[],
  // W6: las gift cards (`null` = falta la migración).
  giftLotes: [] as Fila[] | null,
  giftCards: [] as Fila[],
  // `caja_venta_mp` (sql/migrate-caja-cobros.sql): los pagos de una venta completada sumando cobros.
  ventaMp: [] as Fila[],
  giftChoques: 0,
  alCerrar: null as null | (() => void),
  antesDeInsertar: null as null | (() => void),
}
const gn = {
  posts: [] as Fila[],
  gets: [] as string[],
  authInventario: [] as string[],
  authPosts: [] as string[],
  respuestaPost: { status: 201, body: { data: { id: 1600001, number: 30100 } } as unknown },
  delDia: { data: [] as Fila[] },
  // Las que GN CREÓ (POST 2xx): aparecen en `ventas/obtener` como en el real (A12 las busca ahí).
  creadas: [] as Fila[],
  // W3b: `GET /ventas?account_id=…&include_payments=1` (los cobros de GN del turno).
  lista: { status: 200, body: { data: [] as Fila[], meta: { has_more_pages: false } } as unknown },
  // Cuántas `/ventas?` rebotan con 429 antes de contestar (el corte de 2 por segundo, 13-oct).
  rebotes: 0,
  // Cuántos POST de venta rebotan con 429 antes de contestar `respuestaPost` (19-oct).
  rebotesPost: 0,
}
const mp = { busquedas: 0 }
// W1: el audit de TN (bdi-catalogo). `tramos` = la respuesta de cada pedido, en orden; anota la URL y el sobre.
const tn = { pedidos: [] as Array<{ url: string; sobre?: string }>, tramos: [] as Array<{ status: number; body: unknown }> }
const mailer = { posts: [] as Array<{ body: Fila; key?: string; url: string }> }

function consulta(tabla: string) {
  const filtros: Array<(f: Fila) => boolean> = []
  let accion: { tipo: 'select' } | { tipo: 'delete' } | { tipo: 'update'; cambios: Fila } | { tipo: 'insert'; fila: Fila } = { tipo: 'select' }
  const filas = (): Fila[] => {
    const todas = tabla === 'caja_venta' ? [...base.ventas.values()] : tabla === 'caja_config' ? (base.config ? [base.config] : [])
      : tabla === 'mp_cuenta_uso' ? base.usos : tabla === 'mp_cuentas' ? base.llaves
      : tabla === 'caja_turno' ? base.turnos : tabla === 'caja_turno_mov' ? base.movs
      : tabla === 'agenda_promos' ? base.agenda : tabla === 'liquidacion_items' ? base.liqItems
      : tabla === 'caja_gift_lote' ? base.giftLotes ?? [] : tabla === 'caja_venta_mp' ? base.ventaMp : tabla === 'caja_gift_card' ? base.giftCards : tabla === 'venta' ? base.erpVentas ?? [] : base.inventario
    return todas.filter((f) => filtros.every((p) => p(f)))
  }
  const ejecutar = () => {
    if (tabla.startsWith('caja_gift') && base.giftLotes === null) return { data: null, error: { code: 'PGRST205', message: `Could not find the table 'public.${tabla}' in the schema cache` } }
    if (accion.tipo === 'delete') {
      const fuera = new Set(filas())
      if (tabla === 'caja_gift_lote') base.giftLotes = (base.giftLotes ?? []).filter((f) => !fuera.has(f))
      if (tabla === 'caja_venta_mp') base.ventaMp = base.ventaMp.filter((f) => !fuera.has(f))
      return { data: [...fuera], error: null }
    }
    if (accion.tipo === 'insert' && tabla === 'caja_gift_lote') {
      const l = { id: (base.giftLotes ?? []).length + 1, creado_en: new Date().toISOString(), ...accion.fila }
      base.giftLotes!.push(l)
      return { data: [l], error: null }
    }
    if (accion.tipo === 'insert' && tabla === 'caja_venta_mp') {
      // La PK de `mp_pago_id`: un pago repetido tira el insert ENTERO.
      const nuevas = accion.fila as unknown as Fila[]
      if (nuevas.some((n) => base.ventaMp.some((c) => c.mp_pago_id === n.mp_pago_id))) return { data: null, error: { code: '23505', message: 'duplicate key' } }
      for (const n of nuevas) base.ventaMp.push({ creado_en: new Date().toISOString(), ...n })
      return { data: nuevas, error: null }
    }
    if (accion.tipo === 'insert' && tabla === 'caja_gift_card') {
      // La clave primaria: un código repetido tira el insert ENTERO (todo o nada, como Postgres).
      const nuevas = accion.fila as unknown as Fila[]
      if (base.giftChoques > 0) { base.giftChoques--; return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "caja_gift_card_pkey"' } } }
      if (nuevas.some((n) => base.giftCards.some((c) => c.codigo === n.codigo))) return { data: null, error: { code: '23505', message: 'duplicate key' } }
      for (const n of nuevas) base.giftCards.push({ estado: 'inactiva', monto: null, saldo: null, vence_en: null, creada_en: new Date().toISOString(), ...n })
      return { data: nuevas, error: null }
    }
    // El trigger de sql/migrate-caja-auditoria.sql (A7): ⛔ entra una venta ni un movimiento a un turno cerrado.
    if (accion.tipo === 'insert' && base.antesDeInsertar) { const h = base.antesDeInsertar; base.antesDeInsertar = null; h() }
    if (accion.tipo === 'insert' && (tabla === 'caja_venta' || tabla === 'caja_turno_mov') && accion.fila.turno_id != null) {
      const turnoId = accion.fila.turno_id
      const t = base.turnos.find((x) => x.id === turnoId)
      if (t && t.cerrado_en != null) return { data: null, error: { code: 'P0001', message: 'caja_turno_cerrado: el turno ya está cerrado' } }
    }
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
      // A7: lo que pasa «mientras se cierra» (una venta que se guardó justo antes del cierre).
      if (tabla === 'caja_turno' && accion.cambios.cerrado_en && out.length && base.alCerrar) { const h = base.alCerrar; base.alCerrar = null; h() }
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
  // Números como números (`espera_monto`), fechas como texto ISO.
  const comparar = (a: unknown, b: unknown) => (typeof b === 'number' ? Number(a) - b : String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0)
  q.gte = (c: string, v: string | number) => { filtros.push((f) => f[c] != null && comparar(f[c], v) >= 0); return q }
  q.lte = (c: string, v: string | number) => { filtros.push((f) => f[c] != null && comparar(f[c], v) <= 0); return q }
  q.lt = (c: string, v: string) => { filtros.push((f) => String(f[c]) < v); return q }
  q.order = () => q
  q.limit = () => q
  q.range = () => q
  q.insert = (f: Fila) => { accion = { tipo: 'insert', fila: f }; return q }
  q.update = (c: Fila) => { accion = { tipo: 'update', cambios: c }; return q }
  q.delete = () => { accion = { tipo: 'delete' }; return q }
  q.upsert = async (f: Fila) => { if (!base.config) base.config = f; return { error: null } }
  q.maybeSingle = async () => { const r = ejecutar(); return { data: r.data ? r.data[0] ?? null : null, error: r.error } }
  q.single = async () => { const r = ejecutar(); return { data: r.data ? r.data[0] ?? null : null, error: r.error } }
  q.then = (ok: (v: unknown) => unknown) => Promise.resolve(ejecutar()).then(ok)
  return q
}

// 🪙 El aviso de «falta cambio» (Bruno, 22-oct): ⛔ sale a ningún celular, se mira a quién y qué.
const avisar = vi.fn(async () => ({ enviados: 1, fallas: 0, telefonos: 1 }))
vi.mock('../api/_push.js', () => ({ avisar }))
// El stock de Stunned del LIBRO (prueba del corte, 28-oct): ⛔ hay base en los tests.
const stockStunnedDelLibro = vi.fn(async () => ({ local: 0, deposito: 14 }) as { local: number; deposito: number } | { error: string })
vi.mock('../api/_caja-motor.js', async (orig) => ({ ...(await orig<object>()), stockStunnedDelLibro }))
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
      if (opts?.method === 'POST') {
        const cuerpo = JSON.parse(String(opts.body))
        gn.posts.push(cuerpo)
        gn.authPosts.push(String(opts?.headers?.Authorization))
        if (gn.rebotesPost > 0) { gn.rebotesPost--; return respuesta(429, { message: 'Too Many Attempts.' }) }
        const d = (gn.respuestaPost.body as { data?: Fila } | null)?.data
        if (gn.respuestaPost.status < 300 && d) gn.creadas.push({ ...d, integration_id: cuerpo.integration_id })
        return respuesta(gn.respuestaPost.status, gn.respuestaPost.body)
      }
      gn.gets.push(String(url))
      if (String(url).includes('/ventas/obtener')) return respuesta(200, { ...gn.delDia, data: [...gn.delDia.data, ...gn.creadas] })
      if (String(url).includes('/ventas?') && gn.rebotes > 0) { gn.rebotes--; return respuesta(429, { message: 'Too Many Attempts.' }) }
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
      // El aviso interno (lib/mailer/aviso.core.js) contesta a quién salió.
      if (String(url).endsWith('/api/externo/aviso')) return respuesta(200, { ok: true, enviados: (JSON.parse(String(opts?.body)).para as string[]).map((para) => ({ para })) })
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
/** A6: una promo bancaria de crédito con descuento que corre TODOS los días en el mostrador. */
const PROMO_CREDITO_HOY = { banco: 'Galicia', medio: 'credito', beneficio: { tipo: 'descuento', pct: 10 }, regla: { tipo: 'diaria' }, desde: '2026-01-01', hasta: null, canales: ['mostrador'], marcas: [], activa: true }
const TURNO_ID = '11111111-2222-4333-8444-555555555555'
const ID = '3f1c2b9e-6a4d-4c1e-9b7a-2d5e8f0a1b3c'
// $25.490 en efectivo ⇒ $21.700 (la venta #30021 del POS de GN).
const VENTA = { action: 'confirmar', id: ID, items: [{ product_id: 7, size_id: 8, cantidad: 1, precio: 25490 }], pagos: [{ cuenta: 12921 }], total: 21700, pagaCon: 22000 }

beforeEach(async () => {
  base.ventas = new Map(); base.config = null; base.inventario = []
  base.usos = [{ store: 'zattia', cuenta_id: CUENTA_MP, desde: '2026-10-01T12:00:00.000Z' }]
  base.llaves = [{ store: 'zattia', cuenta_id: CUENTA_MP, nombre: 'BDIACCESORIOS', token: 'APP_USR-llave' }]
  base.mpPagos = []; mp.busquedas = 0
  // Hay un turno abierto: las ventas de los tests de antes de W3 se cobran adentro de él.
  base.turnos = [{ id: TURNO_ID, store: 'zattia', fondo: 50000, abierto_en: '2026-10-04T12:00:00.000Z', cerrado_en: null, abierto_por: 'cajera', abierto_por_usuario: 'cajera' }]; base.movs = []
  mailer.posts = []; delete process.env.MAILER_URL; delete process.env.MAILER_TICKET_KEY
  gn.posts = []; gn.gets = []; gn.authInventario = []; gn.authPosts = []; gn.respuestaPost = { status: 201, body: { data: { id: 1600001, number: 30100 } } }; gn.delDia = { data: [] }; gn.creadas = []; base.agenda = [];
  base.giftLotes = []; base.giftCards = []; base.giftChoques = 0; base.ventaMp = []
  // Bruno, 11-oct: la cuenta de MP del test asienta en Transferencia (13015, Areben Comercial).
  base.config = { store: 'zattia', reglas: { ...REGLAS_INICIALES, transferenciaPorMp: { [CUENTA_MP]: 13015 } }, politica_cambio: null }; base.alCerrar = null; base.antesDeInsertar = null
  gn.lista = { status: 200, body: { data: [], meta: { has_more_pages: false } } }
  gn.rebotes = 0; gn.rebotesPost = 0
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
  it('una marca sin Caja ⇒ 400; BDI sin el permiso de BDI ⇒ 403 (V4)', async () => {
    conSesion(CAJERA)
    expect((await correr(req('GET', { action: 'config', store: 'mayorista' }))).code).toBe(400)
    expect((await correr(req('GET', { action: 'config', store: 'bdi' }))).code).toBe(403)
  })
  // Rediseño fase 5: la marca es configuración (`lib/caja/marcas.core.js`). Zattia tiene que quedar IDÉNTICA.
  it('la venta sale al modo Local de Zattia: local 11780, Consumidor Final 137131, canal 3', async () => {
    conSesion(CAJERA)
    const r = await correr(req('POST', {}, VENTA))
    expect(r.code).toBe(200)
    expect(gn.posts[0]).toMatchObject({ store_id: 11780, client_id: 137131, channel_id: 3 })
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
    base.agenda = [PROMO_CREDITO_HOY]
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
    const p = gn.posts[0] as { items: Fila[]; payments: Fila[]; discount_amount: number }
    expect(p.items[0]).toMatchObject({ unit_price: 10000, discount: 0 })
    expect(p.discount_amount).toBe(3900)
    expect(base.ventas.get(ID)).toMatchObject({ subtotal: 8000, total: 6100 })
    expect((base.ventas.get(ID)!.pagos as Fila[])[0]).toMatchObject({ rebaja: 800, descuento: 1080 })
  })

  it('🔑 bajadas (Bruno, 12-oct): cómo se cobra la oferta, sólo un admin y validado', async () => {
    const oferta = { efectivo: 'final', transferencia: 'final', debito: 'recargo', credito: 'recargo', recargo: 10 }
    conSesion(CAJERA)
    expect((await correr(req('POST', {}, { action: 'bajadas', oferta }))).code).toBe(403)
    conSesion(ADMIN_)
    expect((await correr(req('POST', {}, { action: 'bajadas', oferta: { ...oferta, efectivo: 'recargo' } }))).code).toBe(400)
    expect((await correr(req('POST', {}, { action: 'bajadas', oferta: { ...oferta, recargo: 90 } }))).code).toBe(400)
    const r = await correr(req('POST', {}, { action: 'bajadas', oferta }))
    expect(r.code).toBe(200)
    expect((base.config as { reglas: Fila }).reglas).toMatchObject({ oferta })
    expect((r.body?.reglas as Fila).oferta).toEqual(oferta)
  })

  it('🔑 bajadas (Bruno, 11-oct): la cuenta de GN de la transferencia es la de la cuenta de MP en uso', async () => {
    conSesion(CAJERA)
    expect((await correr(req('POST', {}, { action: 'bajadas', transferenciaPorMp: { mp: CUENTA_MP, gn: 20595 } }))).code).toBe(403)
    conSesion(ADMIN_)
    expect((await correr(req('POST', {}, { action: 'bajadas', transferenciaPorMp: { mp: CUENTA_MP, gn: 12921 } }))).code).toBe(400)
    expect((await correr(req('POST', {}, { action: 'bajadas', transferenciaPorMp: { mp: 999, gn: 20595 } }))).code).toBe(404)
    const r = await correr(req('POST', {}, { action: 'bajadas', transferenciaPorMp: { mp: CUENTA_MP, gn: 20595 } }))
    expect(r.code).toBe(200)
    expect((base.config as { reglas: Fila }).reglas).toMatchObject({ transferenciaPorMp: { [CUENTA_MP]: 20595 } })
    // La pantalla recibe la cuenta ya resuelta, y la venta por transferencia va a esa.
    expect((r.body?.reglas as Fila).transferenciaA).toBe(20595)
    conSesion(CAJERA)
    expect(((await correr(req('GET', { action: 'config' }))).body?.reglas as Fila).transferenciaA).toBe(20595)
    expect((await correr(req('POST', {}, { ...VENTA, pagos: [{ cuenta: 13015 }], total: 22900, pagaCon: null }))).code).toBe(400)
    expect((await correr(req('POST', {}, { ...VENTA, pagos: [{ cuenta: 20595 }], total: 22900, pagaCon: null }))).code).toBe(200)
  })

  it('sin mapeo para la cuenta de MP en uso, la transferencia ⛔ se cobra', async () => {
    conSesion(CAJERA)
    await correr(req('GET', { action: 'config' }))
    ;(base.config as { reglas: Fila }).reglas = { ...((base.config as { reglas: Fila }).reglas), transferenciaPorMp: {} }
    expect(((await correr(req('GET', { action: 'config' }))).body?.reglas as Fila).transferenciaA).toBeNull()
    expect((await correr(req('POST', {}, TRANSF))).code).toBe(400)
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

  it('🔑 logo por marca (Bruno, 12-oct): el de Stunned ⛔ pisa el de Zattia, y al revés', async () => {
    const z = { src: 'data:image/png;base64,WkFUVElB', ancho: 400, alto: 120 }
    const st = { src: 'data:image/png;base64,U1RVTk5FRA==', ancho: 300, alto: 300 }
    conSesion(ADMIN_)
    expect((await correr(req('POST', {}, { action: 'logo', logo: st, marca: 'otra' }))).code).toBe(400)
    expect((await correr(req('POST', {}, { action: 'logo', logo: z }))).code).toBe(200)
    const r = await correr(req('POST', {}, { action: 'logo', logo: st, marca: 'stunned' }))
    expect(r.body).toEqual({ ticket_logo: z, ticket_logo_stunned: st })
    expect((await correr(req('GET', { action: 'config' }))).body).toMatchObject({ ticket_logo: z, ticket_logo_stunned: st })
    // Eliminar el de Zattia deja el de Stunned.
    expect((await correr(req('POST', {}, { action: 'logo', logo: null }))).body).toEqual({ ticket_logo: null, ticket_logo_stunned: st })
    expect((await correr(req('GET', { action: 'config' }))).body).toMatchObject({ ticket_logo: null, ticket_logo_stunned: st })
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
    expect(mal.body).toMatchObject({ error: expect.stringMatching(/oferta/) })
    expect(gn.posts).toHaveLength(0)
    // A la de feria, precio final: $25.490 ⇒ $25.500 redondeado.
    const bien = await correr(req('POST', {}, { ...VENTA, pagos: [{ cuenta: 25867 }], total: 25500, pagaCon: 25500 }))
    expect(bien.code).toBe(200)
    expect((gn.posts[0] as { payments: Fila[] }).payments).toEqual([expect.objectContaining({ amount: 25500, account_id: 25867 })])
  })
})

describe('caja · promos (W5)', () => {
  const ADMIN_ = { name: 'admin', admin: true, cuenta: null, acceso: {}, funcion: [] }
  const pct = { id: 'p1', nombre: '20% corset', tipo: 'pct', pct: 20, desde: '2026-01-01', alcance: { tipo: 'productos', productos: [{ id: 7, nombre: 'CORSET' }] } }
  const minimo = { id: 'p2', nombre: '$2.000 desde $20.000', tipo: 'monto_minimo', minimo: 20000, pesos: 2000, desde: '2026-01-01', alcance: { tipo: 'todo' } }

  it('sólo un admin las carga, y el servidor las valida', async () => {
    conSesion(CAJERA)
    expect((await correr(req('POST', {}, { action: 'promos', promos: [pct] }))).code).toBe(403)
    conSesion(ADMIN_)
    expect((await correr(req('POST', {}, { action: 'promos', promos: [{ ...pct, pct: 0 }] }))).code).toBe(400)
    expect((await correr(req('POST', {}, { action: 'promos', promos: [pct] }))).code).toBe(200)
    expect((base.config as { reglas: Fila }).reglas).toMatchObject({ promos: [{ id: 'p1', pct: 20, activa: true, hasta: null }] })
  })

  it('🔑 el SERVIDOR aplica la promo: $25.490 −20 % = $20.392, en efectivo −15 % ⇒ $17.300', async () => {
    conSesion(ADMIN_)
    await correr(req('POST', {}, { action: 'promos', promos: [pct] }))
    conSesion(CAJERA)
    // El total de antes (sin promo) ya ⛔ coincide: 409 y ⛔ sale nada.
    expect((await correr(req('POST', {}, VENTA))).code).toBe(409)
    expect(gn.posts).toHaveLength(0)
    const r = await correr(req('POST', {}, { ...VENTA, total: 17300, pagaCon: 17300 }))
    expect(r.code).toBe(200)
    const p = gn.posts[0] as { items: Fila[]; payments: Fila[]; discount_amount: number }
    expect(p.payments).toEqual([expect.objectContaining({ amount: 17300, account_id: 12921 })])
    expect(p.items).toEqual([expect.objectContaining({ unit_price: 25490, discount: 0 })])
    expect(p.discount_amount).toBe(8190)
    expect((base.ventas.get(ID) as { renglones: Fila[] }).renglones[0]).toMatchObject({ promos: ['20% corset'], rebaja: 5098 })
  })

  it('la de compra va como descuento a la venta, y el descuento a mano la REEMPLAZA', async () => {
    conSesion(ADMIN_)
    await correr(req('POST', {}, { action: 'promos', promos: [minimo] }))
    conSesion(CAJERA)
    // $25.490 − $2.000 = $23.490 × 0,85 = $19.966,50 ⇒ $20.000
    expect((await correr(req('POST', {}, { ...VENTA, total: 20000, pagaCon: 20000 }))).code).toBe(200)
    // Con $1.000 a mano: $24.490 × 0,85 = $20.816,50 ⇒ $20.800
    const otra = { ...VENTA, id: '4f1c2b9e-6a4d-4c1e-9b7a-2d5e8f0a1b3c', descuentoVenta: { tipo: 'pesos', valor: 1000 }, total: 20800, pagaCon: 20800 }
    expect((await correr(req('POST', {}, otra))).code).toBe(200)
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
    expect(p.items[0]).toMatchObject({ unit_price: 25490, discount: 0, quantity: 1 })
    expect(p.discount_amount).toBe(3790)
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

  it('🔴 un 429 suelto se espera adentro del cobro: la venta llega con su número, ⛔ provisoria (19-oct)', async () => {
    conSesion(CAJERA)
    gn.rebotesPost = 1
    const r = await correr(req('POST', {}, VENTA))
    expect(r.code).toBe(200)
    expect(gn.posts).toHaveLength(2)
    expect(base.ventas.get(ID)).toMatchObject({ estado: 'en_gn', gn_number: 30100, intentos: 1, ultimo_error: null })
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

  it('🔑 Stunned con el libro prendido: el stock sale del ERP, ⛔ de GN (tras la venta #25 decía «ÚLTIMA» con el local en 0)', async () => {
    conSesion(CAJERA)
    vi.stubEnv('LECTURAS_STUNNED_ERP', '1')
    base.inventario = [{ product_id: 70, size_id: 80, product_name: 'REMERA OFICIAL', size_name: 'M', sku: 'STU-REM-0010-M', barcode: '777001', available_quantity: 1, store_name: 'Local' }]
    try {
      const r = await correr(req('GET', { action: 'producto', codigo: '777001' }))
      expect(r.body).toMatchObject({ stock: { local: 0, deposito: 14, fuente: 'erp' } })
      expect(stockStunnedDelLibro).toHaveBeenCalledWith('zattia', 70, 80)
      expect(gn.authInventario).toEqual([])
      // El ERP ⛔ contesta: el espejo (sus filas STU también salen del libro), y se dice por qué.
      stockStunnedDelLibro.mockResolvedValueOnce({ error: 'El ERP no está conectado' })
      const r2 = await correr(req('GET', { action: 'producto', codigo: '777001' }))
      expect(r2.body).toMatchObject({ stock: { fuente: 'espejo', motivo: 'El ERP no está conectado' } })
      // Sin la llave, Stunned sigue leyendo GN en vivo.
      vi.stubEnv('LECTURAS_STUNNED_ERP', '')
      const r3 = await correr(req('GET', { action: 'producto', codigo: '777001' }))
      expect(r3.body).toMatchObject({ stock: { fuente: 'vivo' } })
    } finally {
      vi.unstubAllEnvs()
    }
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
    expect(base.config?.politica_cambio ?? null).toBeNull()
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
    base.mpPagos = [pagoMP(1, 22700), pagoMP(2, 22900, 60_000, { status: 'pending' })]
    const r = await correr(req('POST', {}, { action: 'cruzar', id: ID }))
    expect(r.code).toBe(200)
    expect(r.body?.cruce).toEqual({ estado: 'esperando' })
    // Paso «Confirmar transferencia» (Bruno, 12-oct): los últimos pagos, sólo para mirar; el pendiente ⛔.
    expect(r.body?.recientes).toEqual([expect.objectContaining({ id: '1', monto: 22700, coincide: false })])
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
    // Una prenda de feria (A6: sin prendas de feria, la cuenta de feria ⛔ se acepta).
    await correr(req('GET', { action: 'config' }))
    ;(base.config as { reglas: Fila }).reglas = { ...((base.config as { reglas: Fila }).reglas), feriaProductos: [{ id: 7, nombre: 'FERIA' }] }
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
    expect(turno.resumen.efectivo).toEqual({ fondo: 50000, cobrado: 21700, deEspera: 0, cobradoGN: 0, cobradoERP: 0, aportes: 0, salidas: 5000, esperado: 66700 })
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
    // víspera ⛔; una venta del POS de GN (canal 3) SÍ desde el 13-oct (las dos cajas en paralelo).
    const pago = (id: number, created_at: string) => ({ id, amount: 38241, account_id: 12921, created_at })
    gn.lista = { status: 200, body: { data: [
      { number: 29981, channel_id: 16, tn_order: '7144', client_name: 'Melania', payments: [pago(1, '2026-10-04 10:15:00')] },
      { number: 29900, channel_id: 16, payments: [pago(2, '2026-10-03 18:00:00')] },
      { number: 29990, channel_id: 3, payments: [pago(3, '2026-10-04 10:30:00')] },
    ], meta: { has_more_pages: false } } }
    const t = await correr(req('GET', { action: 'turno' }))
    const turno = t.body?.turno as { resumen: { efectivo: Fila; cobrosGN: Fila[] } }
    expect(turno.resumen.efectivo).toEqual({ fondo: 50000, cobrado: 0, deEspera: 0, cobradoGN: 76482, cobradoERP: 0, aportes: 0, salidas: 0, esperado: 126482 })
    expect(turno.resumen.cobrosGN.map((c) => [c.venta, c.pos])).toEqual([[29981, false], [29990, true]])
    // Se pide por cada cuenta de efectivo, con los cobros, 45 días de ventas para atrás (19-oct: con 10 se escapó un pedido de 11).
    const pedidas = gn.gets.filter((u) => u.includes('/ventas?'))
    expect(pedidas.some((u) => u.includes('account_id=12921') && u.includes('include_payments=1') && u.includes('dateFrom=2026-08-20'))).toBe(true)

    const c = await correr(req('POST', {}, { action: 'cerrar-turno', id: TURNO_ID, contado: 126482 }))
    expect(c.code).toBe(200)
    expect(base.turnos[0]).toMatchObject({ esperado: 126482, contado: 126482 })
    expect((base.turnos[0].resumen as Fila).diferencia).toBe(0)
  })

  it('Stunned (29-oct): el pedido web cobrado en efectivo nace en el ERP ⇒ suma al esperado y entra en la foto del cierre', async () => {
    conSesion(CAJERA)
    process.env.CAJA_STUNNED_ERP = '1'
    const efectivo = [{ monto: '43795.00', cuenta: { medio: 'efectivo' } }]
    const v = (numero: number, x: Fila = {}) => ({ numero, marca: 'stunned', origen: 'tn', estado: 'confirmada', prueba: false,
      ocurrida_en: '2026-10-04T15:10:00.000Z', detalle: { tn: { numero: 135 } }, venta_pago: efectivo, ...x })
    base.erpVentas = [v(34), v(35, { prueba: true }), v(36, { ocurrida_en: '2026-10-03T15:00:00.000Z' }), v(37, { marca: 'zattia' })]
    try {
      const t = await correr(req('GET', { action: 'turno' }))
      const r = (t.body?.turno as { resumen: { efectivo: Fila; cobrosERP: Fila[] } }).resumen
      expect(r.efectivo).toMatchObject({ cobradoERP: 43795, esperado: 93795 })
      expect(r.cobrosERP.map((c) => [c.venta, c.tn])).toEqual([[34, '135']])
      const c = await correr(req('POST', {}, { action: 'cerrar-turno', id: TURNO_ID, contado: 93795 }))
      expect(c.code).toBe(200)
      expect(base.turnos[0]).toMatchObject({ esperado: 93795, contado: 93795 })
    } finally { delete process.env.CAJA_STUNNED_ERP; base.erpVentas = [] }
  })

  it('Stunned: sin la llave CAJA_STUNNED_ERP ⛔ se leen ventas del ERP (BDI y Zattia antes del corte)', async () => {
    conSesion(CAJERA)
    base.erpVentas = [{ numero: 34, marca: 'stunned', origen: 'tn', estado: 'confirmada', prueba: false, ocurrida_en: '2026-10-04T15:10:00.000Z', venta_pago: [{ monto: 1000, cuenta: { medio: 'efectivo' } }] }]
    try {
      const t = await correr(req('GET', { action: 'turno' }))
      const r = (t.body?.turno as { resumen: { efectivo: Fila; cobrosERP: Fila[] } }).resumen
      expect(r.cobrosERP).toEqual([])
      expect(r.efectivo.esperado).toBe(50000)
    } finally { base.erpVentas = [] }
  })

  it('🔴 un 429 de GN (2 consultas por segundo) se espera y se reintenta: ⛔ es «GN no contestó» (13-oct)', async () => {
    conSesion(CAJERA)
    gn.lista = { status: 200, body: { data: [
      { number: 29981, channel_id: 16, payments: [{ id: 1, amount: 1000, account_id: 12921, created_at: '2026-10-04 10:15:00' }] },
    ], meta: { has_more_pages: false } } }
    gn.rebotes = 1
    const t = await correr(req('GET', { action: 'turno' }))
    const r = (t.body?.turno as { resumen: { efectivo: Fila; cobrosGN: Fila[] | null } }).resumen
    expect(r.cobrosGN?.map((c) => c.venta)).toEqual([29981])
    expect(r.efectivo.cobradoGN).toBe(1000)
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

  it('🪙 cerrar sin cambio (Bruno, 22-oct): les llega el aviso a los admins; con cambio, ⛔ nada', async () => {
    conSesion(CAJERA)
    avisar.mockClear()
    // Fondo $50.000 ⇒ hacen falta $25.000 en billetes de $1.000 o menos; quedan 4 × $1.000 + $500 = $4.500.
    expect((await correr(req('POST', {}, { action: 'cerrar-turno', id: TURNO_ID, contado: 64500, conteo: CONTEO }))).code).toBe(200)
    expect(avisar).toHaveBeenCalledTimes(1)
    expect(avisar).toHaveBeenCalledWith(['Bruno Arevalo', 'Dario Arevalo'], expect.objectContaining({
      titulo: '🪙 Zattia: falta cambio en la caja', url: '/caja', tag: `cambio-${TURNO_ID}`,
      cuerpo: expect.stringContaining('Quedaron $4.500 en billetes de $1.000 o menos; hacen falta $25.000'),
    }))
  })

  it('🪙 cerrar con cambio ⇒ ⛔ avisa', async () => {
    conSesion(CAJERA)
    avisar.mockClear()
    // 1 × $20.000 + 25 × $1.000 + 10 × $500 = $50.000 = el fondo: queda todo ⇒ $30.000 de cambio.
    // (Con 2 × $20.000 + 25 × $1.000 el sobre se lleva 15 de $1.000: suma el fondo justo con 2 × $20.000.)
    expect((await correr(req('POST', {}, { action: 'cerrar-turno', id: TURNO_ID, contado: 50000, conteo: { 20000: 1, 1000: 25, 500: 10 } }))).code).toBe(200)
    expect(avisar).not.toHaveBeenCalled()
  })

  it('🔑 los billetes ⛔ se configuran: una lista vieja en la config ⛔ cuenta, el conteo usa los de Argentina (Bruno, 12-oct)', async () => {
    conSesion(CAJERA)
    base.config = { store: 'zattia', reglas: { cuentas: {}, medios: { transferencia: { opciones: [13015] } }, billetes: [1000, 20000] } }
    base.turnos = []
    // 3 × 20.000 + 4 × 1.000 + 1 × 500 = $64.500: el $500 vale aunque la lista vieja ⛔ lo tenga.
    expect((await correr(req('POST', {}, { action: 'abrir-turno', fondo: 64500, conteo: CONTEO }))).code).toBe(200)
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

describe('caja · auditoría 11-oct (A1, A3, A4, E, B1)', () => {
  it('🔴 A1: el MISMO id con OTRO pedido ⇒ 409 con la venta guardada, ⛔ POST a GN y la fila intacta', async () => {
    conSesion(CAJERA)
    gn.respuestaPost = { status: 503, body: null } // la primera queda pendiente, como con la respuesta perdida
    await correr(req('POST', {}, VENTA))
    const antes = JSON.stringify(base.ventas.get(ID))
    const otro = { ...VENTA, items: [...VENTA.items, { product_id: 9, size_id: 1, cantidad: 1, precio: 4990 }], total: 25900 }
    const r = await correr(req('POST', {}, otro))
    expect(r.code).toBe(409)
    expect(r.body?.yaCobrada).toBe(true)
    expect((r.body?.venta as Fila).total).toBe(21700)
    expect(r.body?.venta).not.toHaveProperty('payload')
    expect(gn.posts).toHaveLength(1)
    expect(JSON.stringify(base.ventas.get(ID))).toBe(antes)
    // El MISMO pedido sigue siendo un reintento: se manda la guardada.
    gn.respuestaPost = { status: 201, body: { data: { id: 1600002, number: 30101 } } }
    const igual = await correr(req('POST', {}, VENTA))
    expect(igual.code).toBe(200)
    expect(base.ventas.get(ID)).toMatchObject({ estado: 'en_gn', gn_number: 30101 })
  })

  it('🔴 A3: GN ⛔ contesta los cobros al cerrar ⇒ 409 y el turno sigue abierto; cerrar igual pide nota', async () => {
    conSesion(CAJERA)
    gn.lista = { status: 429, body: { message: 'x' } }
    const r = await correr(req('POST', {}, { action: 'cerrar-turno', id: TURNO_ID, contado: 50000 }))
    expect(r.code).toBe(409)
    expect(r.body?.sinCobrosGN).toBe(true)
    expect(base.turnos[0].cerrado_en).toBeNull()
    const sinNota = await correr(req('POST', {}, { action: 'cerrar-turno', id: TURNO_ID, contado: 50000, sinCobrosGN: true }))
    expect(sinNota.code).toBe(400)
    expect(base.turnos[0].cerrado_en).toBeNull()
    const ok = await correr(req('POST', {}, { action: 'cerrar-turno', id: TURNO_ID, contado: 50000, sinCobrosGN: true, nota: 'GN caído' }))
    expect(ok.code).toBe(200)
    expect(base.turnos[0]).toMatchObject({ nota: 'GN caído', esperado: 50000 })
    expect((base.turnos[0].resumen as Fila).cobrosGN).toBeNull()
  })

  it('🔴 A3: más de 5 páginas de cobros ⇒ ⛔ se lee a medias callado: el cierre frena', async () => {
    conSesion(CAJERA)
    gn.lista = { status: 200, body: { data: [], meta: { has_more_pages: true } } }
    const r = await correr(req('POST', {}, { action: 'cerrar-turno', id: TURNO_ID, contado: 50000 }))
    expect(r.code).toBe(409)
    expect(r.body?.sinCobrosGN).toBe(true)
  })

  it('🔑 A4: la venta de AYER cruza con el pago de HOY (se leen los dos días)', async () => {
    conSesion(CAJERA)
    await correr(req('POST', {}, TRANSF))
    base.ventas.get(ID)!.creada_en = new Date(Date.now() - 26 * 3600_000).toISOString()
    base.mpPagos = [pagoMP(77, 22900)]
    const r = await correr(req('POST', {}, { action: 'cruzar', id: ID }))
    // Se leen los DOS días (A4), y como el pago llegó horas después, lo elige la cajera (A5).
    expect(mp.busquedas).toBe(2)
    expect(r.body?.cruce).toMatchObject({ estado: 'elegir', candidatos: [{ id: '77' }] })
    const e = await correr(req('POST', {}, { action: 'cruzar', id: ID, pago: '77' }))
    expect(e.body?.cruce).toMatchObject({ estado: 'llego', por: 'cajera' })
  })

  it('🔑 A4: el pago de 2 h ANTES (venta re-escaneada) se ofrece, ⛔ entra solo', async () => {
    conSesion(CAJERA)
    await correr(req('POST', {}, TRANSF))
    base.mpPagos = [pagoMP(77, 22900, -2 * 3600_000)]
    const r = await correr(req('POST', {}, { action: 'cruzar', id: ID }))
    expect(r.body?.cruce).toMatchObject({ estado: 'elegir' })
    expect(gn.posts).toHaveLength(0)
  })

  it('🔑 E: reintentar-pendientes manda las viejas reintentables; ⛔ las rechazadas, ⛔ las recién tocadas, ⛔ las que esperan', async () => {
    conSesion(CAJERA)
    const vieja = new Date(Date.now() - 10 * 60_000).toISOString()
    const fila = (id: string, extra: Fila) => ({ id, store: 'zattia', estado: 'error', intentos: 1, total: 100, pagos: [], renglones: [], payload: { date_sale: '2026-10-11', id }, creada_en: vieja, actualizada_en: vieja, ...extra })
    const ids = ['a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000004']
    base.ventas.set(ids[0], fila(ids[0], { reintentable: true }))
    base.ventas.set(ids[1], fila(ids[1], { reintentable: false }))
    base.ventas.set(ids[2], fila(ids[2], { reintentable: true, actualizada_en: new Date().toISOString() }))
    base.ventas.set(ids[3], fila(ids[3], { estado: 'esperando_pago' }))
    const r = await correr(req('POST', {}, { action: 'reintentar-pendientes' }))
    expect(r.code).toBe(200)
    expect(r.body).toEqual({ intentadas: 1, llegaron: 1 })
    expect(gn.posts.map((p) => p.id)).toEqual([ids[0]])
    expect(base.ventas.get(ids[0])).toMatchObject({ estado: 'en_gn' })
  })

  it('🔴 E: una venta que ya llegó a GN ⛔ vuelve a mandarse ni a quedar en error', async () => {
    conSesion(CAJERA)
    await correr(req('POST', {}, VENTA))
    expect(base.ventas.get(ID)).toMatchObject({ estado: 'en_gn' })
    const { enviarVenta } = await import('../lib/caja/enviar.core.js')
    const { createClient } = await import('@supabase/supabase-js')
    // El envío viejo que tenía la fila en la mano (estado `error`) llega tarde.
    const vieja = { ...base.ventas.get(ID)!, estado: 'error' }
    const out = await enviarVenta(vieja, { sb: (createClient as (a: string, b: string) => unknown)('x', 'y'), gnFetch: fetch as never, base: 'https://api.gestionnube.com', token: 't' })
    expect(out.venta).toMatchObject({ estado: 'en_gn' })
    expect(gn.posts).toHaveLength(1)
  })

  it('B1: ventas devuelve las del turno abierto, sin payload, y ⛔ las de otro turno', async () => {
    conSesion(CAJERA)
    await correr(req('POST', {}, VENTA))
    base.ventas.set('otra', { id: 'otra', store: 'zattia', estado: 'en_gn', turno_id: 'otro-turno', total: 1 })
    const r = await correr(req('GET', { action: 'ventas' }))
    expect(r.code).toBe(200)
    const ventas = r.body?.ventas as Fila[]
    expect(ventas.map((v) => v.id)).toEqual([ID])
    expect(ventas[0]).not.toHaveProperty('payload')
    expect((await correr(req('GET', { action: 'ventas', turno: 'x' }))).code).toBe(400)
  })
})

describe('caja · auditoría 11-oct, fase 2 (A5–A12, B2–B5, robustez)', () => {
  const ADMIN = { name: 'bruno', admin: true, cuenta: null, acceso: {}, funcion: [] }
  const OTRA_CAJERA = { name: 'otra', admin: false, cuenta: null, acceso: { zattia: { caja: true } }, funcion: [] }
  const conConfig = async (extra: Fila) => {
    await correr(req('GET', { action: 'config' }))
    ;(base.config as { reglas: Fila }).reglas = { ...((base.config as { reglas: Fila }).reglas), ...extra }
  }

  it('🔴 A6: el −10 % de crédito sin promo HOY en la Agenda ⇒ 400 y ⛔ sale a GN', async () => {
    conSesion(CAJERA)
    const r = await correr(req('POST', {}, { ...VENTA, pagos: [{ cuenta: 25172 }], total: 22900, pagaCon: null }))
    expect(r.code).toBe(400)
    expect(String(r.body?.error)).toMatch(/promo bancaria/)
    expect(gn.posts).toHaveLength(0)
    // Una promo de OTRO medio (débito) ⛔ habilita la de crédito.
    base.agenda = [{ ...PROMO_CREDITO_HOY, medio: 'debito' }]
    expect((await correr(req('POST', {}, { ...VENTA, pagos: [{ cuenta: 25172 }], total: 22900, pagaCon: null }))).code).toBe(400)
  })

  it('🔴 A6: una pantalla vieja que manda la transferencia a la cuenta de antes ⇒ 400', async () => {
    conSesion(CAJERA)
    const r = await correr(req('POST', {}, { ...TRANSF, pagos: [{ cuenta: 20595 }] }))
    expect(r.code).toBe(400)
    expect(String(r.body?.error)).toMatch(/otra cuenta/)
    expect(base.ventas.size).toBe(0)
  })

  it('🔴 A6: 6 cuotas debajo del mínimo ⇒ 400', async () => {
    conSesion(CAJERA)
    const r = await correr(req('POST', {}, { ...VENTA, pagos: [{ cuenta: 25173 }], total: 25500, pagaCon: null }))
    expect(r.code).toBe(400)
    expect(String(r.body?.error)).toMatch(/6 cuotas/)
  })

  it('🔑 A9: la promo de monto mínimo ⛔ descuenta la prenda de feria (servidor)', async () => {
    conSesion(CAJERA)
    await conConfig({
      feriaProductos: [{ id: 1, nombre: 'TOP FERIA' }],
      promos: [{ id: 'p1', nombre: '$2000 desde 15000', tipo: 'monto_minimo', minimo: 15000, pesos: 2000, alcance: { tipo: 'todo' }, desde: '2026-01-01', hasta: null, activa: true }],
    })
    const items = [{ product_id: 1, size_id: 1, cantidad: 1, precio: 10000 }, { product_id: 7, size_id: 8, cantidad: 1, precio: 20000 }]
    // Feria $10.000 entera + (20.000 − 2.000) × 0,85 = 15.300 ⇒ $25.300.
    const r = await correr(req('POST', {}, { ...VENTA, items, pagos: [{ cuenta: 25867, base: 10000 }, { cuenta: 12921 }], total: 25300, pagaCon: null }))
    expect(r.code).toBe(200)
    const pagos = base.ventas.get(ID)!.pagos as Fila[]
    expect(pagos.map((p) => [p.cuenta, p.rebaja, p.monto])).toEqual([[25867, 0, 10000], [12921, 2000, 15300]])
  })

  it('🔴 robustez: precio 0 por `curl` ⇒ 400; pagaCon absurdo ⇒ 400', async () => {
    conSesion(CAJERA)
    expect((await correr(req('POST', {}, { ...VENTA, items: [{ product_id: 7, size_id: 8, cantidad: 1, precio: 0 }], total: 0 }))).code).toBe(400)
    expect((await correr(req('POST', {}, { ...VENTA, pagaCon: -5 }))).code).toBe(400)
    expect(base.ventas.size).toBe(0)
  })

  it('🔑 B5: el precio cambiado y el descuento a mano quedan A LA VISTA en la fila y en el turno', async () => {
    conSesion(CAJERA)
    // Etiqueta $25.490, la cajera cobra $20.000 y le hace 10 % a la venta ⇒ (20.000 − 2.000) × 0,85 = 15.300.
    const items = [{ product_id: 7, size_id: 8, cantidad: 1, precio: 20000, precioLista: 25490 }]
    const r = await correr(req('POST', {}, { ...VENTA, items, total: 15300, pagaCon: null, descuentoVenta: { tipo: 'pct', valor: 10 } }))
    expect(r.code).toBe(200)
    const v = base.ventas.get(ID)!
    expect((v.renglones as Fila[])[0]).toMatchObject({ precio: 20000, precio_lista: 25490 })
    expect(v.a_mano).toEqual({ venta: 2000, prendas: 0, precios: 5490 })
    const t = await correr(req('GET', { action: 'turno' }))
    expect((t.body?.turno as { resumen: { aMano: Fila } }).resumen.aMano).toEqual({ ventas: 1, venta: 2000, prendas: 0, precios: 5490 })
  })

  it('🔑 `liviano=1` (13-oct): la fila del turno SOLA, sin resumen y ⛔ sin una sola consulta a GN', async () => {
    conSesion(CAJERA)
    const t = await correr(req('GET', { action: 'turno', liviano: '1' }))
    expect(t.code).toBe(200)
    expect((t.body?.turno as Fila).id).toBe(TURNO_ID)
    expect((t.body?.turno as Fila).resumen).toBeUndefined()
    expect(gn.gets).toHaveLength(0)
    // La entera sigue trayendo el resumen.
    const u = await correr(req('GET', { action: 'turno' }))
    expect((u.body?.turno as Fila).resumen).toBeDefined()
  })

  it('🔴 A7: el turno se cerró entre la lectura y el insert ⇒ 409 y la venta ⛔ queda guardada', async () => {
    conSesion(CAJERA)
    // Otra pantalla cierra el turno justo antes de que la venta se inserte: el trigger lo frena.
    base.antesDeInsertar = () => { base.turnos[0].cerrado_en = new Date().toISOString() }
    const r = await correr(req('POST', {}, VENTA))
    expect(r.code).toBe(409)
    expect(r.body?.sinTurno).toBe(true)
    expect(base.ventas.size).toBe(0)
    expect(gn.posts).toHaveLength(0)
  })

  it('🔴 A7: una venta que entró mientras se cerraba ⇒ la foto se REHACE con ella', async () => {
    conSesion(CAJERA)
    base.alCerrar = () => {
      base.ventas.set('tarde', { id: 'tarde', store: 'zattia', estado: 'borrador', turno_id: TURNO_ID, total: 4200, pagos: [{ cuenta: 12921, monto: 4200 }], creada_en: new Date().toISOString() })
    }
    const c = await correr(req('POST', {}, { action: 'cerrar-turno', id: TURNO_ID, contado: 54200 }))
    expect(c.code).toBe(200)
    expect(c.body?.cambioAlCerrar).toBe(true)
    expect(base.turnos[0]).toMatchObject({ esperado: 54200 })
    expect((base.turnos[0].resumen as Fila).diferencia).toBe(0)
  })

  it('🔑 A8: la salida la carga la dueña del turno o un admin; OTRA cajera con permiso de Caja ⛔', async () => {
    conSesion(OTRA_CAJERA)
    const r = await correr(req('POST', {}, { action: 'salida', monto: 1000, motivo: 'tapar' }))
    expect(r.code).toBe(403)
    expect(base.movs).toHaveLength(0)
    conSesion(ADMIN)
    expect((await correr(req('POST', {}, { action: 'salida', monto: 1000, motivo: 'retiro' }))).code).toBe(200)
    conSesion(CAJERA)
    expect((await correr(req('POST', {}, { action: 'salida', monto: 500, motivo: 'bolsas' }))).code).toBe(200)
    expect(base.movs.map((m) => [m.usuario, m.usuario_cuenta])).toEqual([['bruno', 'bruno'], ['cajera', 'cajera']])
  })

  it('🔑 B4: el aporte suma; anular deja la fila tachada y deja de contar; la dueña ⛔ anula lo del admin', async () => {
    conSesion(CAJERA)
    await correr(req('POST', {}, { action: 'salida', tipo: 'aporte', monto: 10000, motivo: 'cambio que trajo Darío' }))
    await correr(req('POST', {}, { action: 'salida', monto: 3000, motivo: 'bolsas' }))
    let t = await correr(req('GET', { action: 'turno' }))
    expect((t.body?.turno as { resumen: { efectivo: Fila } }).resumen.efectivo).toMatchObject({ aportes: 10000, salidas: 3000, esperado: 57000 })
    conSesion(ADMIN)
    await correr(req('POST', {}, { action: 'salida', monto: 2000, motivo: 'retiro' }))
    conSesion(CAJERA)
    const deAdmin = base.movs.find((m) => m.usuario === 'bruno')!
    expect((await correr(req('POST', {}, { action: 'anular-mov', id: deAdmin.id, motivo: 'no' }))).code).toBe(403)
    expect((await correr(req('POST', {}, { action: 'anular-mov', id: base.movs[1].id, motivo: '' }))).code).toBe(400)
    expect((await correr(req('POST', {}, { action: 'anular-mov', id: base.movs[1].id, motivo: 'eran 300, no 3000' }))).code).toBe(200)
    expect(base.movs[1]).toMatchObject({ anulado_por: 'cajera', anulado_motivo: 'eran 300, no 3000' })
    t = await correr(req('GET', { action: 'turno' }))
    expect((t.body?.turno as { resumen: { efectivo: Fila } }).resumen.efectivo).toMatchObject({ aportes: 10000, salidas: 2000, esperado: 58000 })
    expect(base.movs).toHaveLength(3) // ⛔ se borra
  })

  it('🔴 A12: la venta anulada a mano en GN deja de sumar; GN ⛔ contesta ⇒ el cierre frena', async () => {
    conSesion(CAJERA)
    await correr(req('POST', {}, VENTA)) // $21.700 efectivo, en GN como 1600001
    let t = await correr(req('GET', { action: 'turno' }))
    expect((t.body?.turno as { resumen: { efectivo: Fila } }).resumen.efectivo).toMatchObject({ cobrado: 21700 })
    // La anulan en GN: deja de venir en `ventas/obtener`.
    gn.creadas = []
    ;(await import('../api/_caja.js')).olvidarCobrosGN()
    t = await correr(req('GET', { action: 'turno' }))
    const r = (t.body?.turno as { resumen: { efectivo: Fila; anuladasGN: Fila[] } }).resumen
    expect(r.efectivo).toMatchObject({ cobrado: 0, esperado: 50000 })
    expect(r.anuladasGN.map((x) => x.gn_number)).toEqual([30100])
  })

  it('🔑 B2: la RECHAZADA por GN se carga a mano (sigue sumando) o se descarta (sólo admin, deja de sumar)', async () => {
    conSesion(CAJERA)
    gn.respuestaPost = { status: 422, body: { message: 'Sin stock' } }
    await correr(req('POST', {}, VENTA))
    expect(base.ventas.get(ID)).toMatchObject({ estado: 'error', reintentable: false })
    expect((await correr(req('POST', {}, { action: 'resolver', id: ID, como: 'descartar', nota: 'se fue' }))).code).toBe(403)
    expect((await correr(req('POST', {}, { action: 'resolver', id: ID, como: 'a_mano', nota: 'cargada' }))).code).toBe(400) // sin número
    const r = await correr(req('POST', {}, { action: 'resolver', id: ID, como: 'a_mano', gn_number: 30777, nota: 'la cargué en GN' }))
    expect(r.code).toBe(200)
    expect(base.ventas.get(ID)).toMatchObject({ estado: 'en_gn', gn_number: 30777, resolucion: { tipo: 'a_mano', por: 'cajera', gn_number: 30777 } })
    // Ya resuelta ⇒ ⛔ se resuelve otra vez.
    conSesion(ADMIN)
    expect((await correr(req('POST', {}, { action: 'resolver', id: ID, como: 'descartar', nota: 'otra vez' }))).code).toBe(409)
  })

  it('🔴 B2: la que tiene error REINTENTABLE ⛔ se resuelve a mano (puede estar en GN: duplicaría)', async () => {
    conSesion(ADMIN)
    base.turnos[0].abierto_por_usuario = 'bruno'; base.turnos[0].abierto_por = 'bruno'
    gn.respuestaPost = { status: 429, body: {} }
    await correr(req('POST', {}, VENTA))
    expect(base.ventas.get(ID)).toMatchObject({ estado: 'error', reintentable: true })
    expect((await correr(req('POST', {}, { action: 'resolver', id: ID, como: 'descartar', nota: 'probando' }))).code).toBe(409)
  })

  it('🔑 B2: descartada (admin) ⇒ deja de sumar al turno y sale de Pendientes', async () => {
    conSesion(CAJERA)
    gn.respuestaPost = { status: 422, body: { message: 'Sin stock' } }
    await correr(req('POST', {}, VENTA))
    conSesion(ADMIN)
    expect((await correr(req('POST', {}, { action: 'resolver', id: ID, como: 'descartar', nota: 'la clienta se llevó la plata' }))).code).toBe(200)
    expect(base.ventas.get(ID)).toMatchObject({ estado: 'descartada', resolucion: { tipo: 'descartada', por: 'bruno' } })
    const t = await correr(req('GET', { action: 'turno' }))
    expect((t.body?.turno as { resumen: { efectivo: Fila } }).resumen.efectivo).toMatchObject({ cobrado: 0 })
    const p = await correr(req('GET', { action: 'pendientes' }))
    expect(p.body?.ventas).toEqual([])
  })

  it('🔑 B3: un admin confirma a mano la transferencia con el comprobante ⇒ sale a GN; la cajera ⛔', async () => {
    conSesion(CAJERA)
    await correr(req('POST', {}, TRANSF))
    expect((await correr(req('POST', {}, { action: 'confirmar-transferencia', id: ID, comprobante: '123456789' }))).code).toBe(403)
    conSesion(ADMIN)
    expect((await correr(req('POST', {}, { action: 'confirmar-transferencia', id: ID, comprobante: 'x' }))).code).toBe(400)
    const r = await correr(req('POST', {}, { action: 'confirmar-transferencia', id: ID, comprobante: 'op 123456789' }))
    expect(r.code).toBe(200)
    expect(base.ventas.get(ID)).toMatchObject({ estado: 'en_gn', mp_cruce: 'admin', confirmacion: { por: 'bruno', comprobante: 'op 123456789' } })
    expect(gn.posts).toHaveLength(1)
    // Otra vez ⇒ 409, ⛔ se manda dos veces.
    expect((await correr(req('POST', {}, { action: 'confirmar-transferencia', id: ID, comprobante: 'op 123456789' }))).code).toBe(409)
    expect(gn.posts).toHaveLength(1)
  })

  it('robustez: una venta VIEJA esperando el mismo monto ⛔ traba el cruce automático', async () => {
    conSesion(CAJERA)
    base.ventas.set('vieja', { id: 'vieja', store: 'zattia', estado: 'esperando_pago', espera_monto: 22900, creada_en: new Date(Date.now() - 3 * 86400_000).toISOString() })
    await correr(req('POST', {}, TRANSF))
    base.mpPagos = [pagoMP(77, 22900)]
    const r = await correr(req('POST', {}, { action: 'cruzar', id: ID }))
    expect(r.body?.cruce).toMatchObject({ estado: 'llego', por: 'solo' })
  })

  it('robustez: el SKU con guiones se encuentra tal cual', async () => {
    conSesion(CAJERA)
    base.inventario = [{ product_id: 7, product_name: 'TOP', size_id: 8, size_name: 'S', sku: 'RVE-0047-NG', barcode: '779', available_quantity: 1, store_name: 'Local' }]
    const r = await correr(req('GET', { action: 'producto', codigo: 'RVE-0047-NG' }))
    expect(r.code).toBe(200)
    expect((r.body?.variante as Fila).sku).toBe('RVE-0047-NG')
  })

  it('robustez: dos admins con las promos ⇒ el segundo, con la versión vieja, 409', async () => {
    conSesion(ADMIN)
    const c = await correr(req('GET', { action: 'config' }))
    const v0 = (c.body?.versiones as Fila).promos
    const promo = { id: 'p1', nombre: '3x2', tipo: 'nxm', lleva: 3, paga: 2, alcance: { tipo: 'todo' }, desde: '2026-01-01', hasta: null, activa: true }
    expect((await correr(req('POST', {}, { action: 'promos', promos: [promo], version: v0 }))).code).toBe(200)
    const r = await correr(req('POST', {}, { action: 'promos', promos: [], version: v0 }))
    expect(r.code).toBe(409)
    expect(((base.config as { reglas: { promos: Fila[] } }).reglas.promos)).toHaveLength(1)
  })
})

describe('caja · la feria es la de Liquidación (Bruno, 11-oct)', () => {
  const ADMIN = { name: 'bruno', admin: true, cuenta: null, acceso: {}, funcion: [] }
  it('🔑 un producto con el precio de la campaña de feria APLICADO va a precio final; uno descartado ⛔', async () => {
    base.liqItems = [
      { liq_id: 'feria', store: 'zattia', pid: '7', estado: 'aplicado', datos: { aplicacion: { precioEscrito: 4990, aplicadoEn: 1 } } },
      { liq_id: 'feria', store: 'zattia', pid: '8', estado: 'descartado' },
      { liq_id: 'otra', store: 'zattia', pid: '9', estado: 'aplicado' },
    ]
    conSesion(CAJERA)
    expect((await correr(req('POST', {}, { action: 'bajadas', feriaCampanias: ['feria'] }))).code).toBe(403)
    conSesion(ADMIN)
    const g = await correr(req('POST', {}, { action: 'bajadas', feriaCampanias: ['feria'] }))
    expect(g.code).toBe(200)
    expect((g.body?.reglas as Fila).feriaIdsCampania).toEqual([7])
    // 13-oct: el precio de la campaña viaja con la feria (manda sobre el de Tienda Nube).
    expect((g.body?.reglas as Fila).feriaPrecios).toEqual({ 7: 4990 })
    // Lo derivado ⛔ se guarda: se resuelve cada vez.
    expect((base.config as { reglas: Fila }).reglas.feriaIdsCampania).toBeUndefined()
    expect((base.config as { reglas: Fila }).reglas.feriaPrecios).toBeUndefined()
    conSesion(CAJERA)
    // $25.490 de feria en efectivo ⇒ a la de feria, sin el 15 %: $25.500 (redondeo). Con la cuenta común, 400.
    expect((await correr(req('POST', {}, VENTA))).code).toBe(400)
    const r = await correr(req('POST', {}, { ...VENTA, pagos: [{ cuenta: 25867 }], total: 25500, pagaCon: null }))
    expect(r.code).toBe(200)
  })
})

describe('caja · gift card, el lote (W6, Bruno 11-oct: tarjeta física)', () => {
  const ADMIN = { name: 'bruno', admin: true, cuenta: null, acceso: {}, funcion: [] }
  it('🔴 la cajera ⛔ genera ni descarga: 403 y ⛔ queda nada', async () => {
    conSesion(CAJERA)
    expect((await correr(req('POST', {}, { action: 'gift-lote', cantidad: 10 }))).code).toBe(403)
    expect((await correr(req('GET', { action: 'gift-lotes' }))).code).toBe(403)
    expect((await correr(req('GET', { action: 'gift-lote', lote: 1 }))).code).toBe(403)
    expect(base.giftLotes).toEqual([])
    expect(base.giftCards).toEqual([])
  })
  it('un admin genera N tarjetas INACTIVAS, sin monto, con códigos válidos y distintos; el CSV las trae todas', async () => {
    const { esCodigo } = await import('@/lib/caja/gift.core.js')
    conSesion(ADMIN)
    const r = await correr(req('POST', {}, { action: 'gift-lote', cantidad: 300, nota: '  Imprenta X  ' }))
    expect(r.code).toBe(200)
    expect(base.giftLotes).toEqual([expect.objectContaining({ id: 1, store: 'zattia', cantidad: 300, nota: 'Imprenta X', creado_por: 'bruno' })])
    expect(base.giftCards).toHaveLength(300)
    expect(base.giftCards.every((c) => c.estado === 'inactiva' && c.monto == null && c.saldo == null && c.lote_id === 1 && esCodigo(c.codigo))).toBe(true)
    expect(new Set(base.giftCards.map((c) => c.codigo)).size).toBe(300)
    const l = await correr(req('GET', { action: 'gift-lotes' }))
    expect(l.body).toMatchObject({ lotes: [{ id: 1, cantidad: 300 }] })
    const c = await correr(req('GET', { action: 'gift-lote', lote: '1' }))
    expect(c.code).toBe(200)
    const renglones = String(c.body?.csv).trim().split('\n')
    expect(renglones[0]).toBe('n,codigo,numero')
    expect(renglones.slice(1).map((x) => x.split(',')[1]).sort()).toEqual(base.giftCards.map((x) => String(x.codigo)).sort())
    expect(c.body?.nombre).toBe('gift-cards-zattia-lote-1.csv')
  })
  it('un choque de código se vuelve a sortear; tres seguidos ⇒ 500 y el lote ⛔ queda', async () => {
    conSesion(ADMIN)
    base.giftChoques = 1
    expect((await correr(req('POST', {}, { action: 'gift-lote', cantidad: 5 }))).code).toBe(200)
    expect(base.giftCards).toHaveLength(5)
    base.giftChoques = 3
    expect((await correr(req('POST', {}, { action: 'gift-lote', cantidad: 5 }))).code).toBe(500)
    expect(base.giftLotes).toHaveLength(1)
    expect(base.giftCards).toHaveLength(5)
  })
  it('cantidades fuera de rango ⇒ 400; sin la migración ⇒ 409 que lo dice', async () => {
    conSesion(ADMIN)
    for (const cantidad of [0, -1, 2.5, 2001, 'diez', null]) expect((await correr(req('POST', {}, { action: 'gift-lote', cantidad }))).code).toBe(400)
    expect((await correr(req('GET', { action: 'gift-lote', lote: 'x' }))).code).toBe(400)
    expect((await correr(req('GET', { action: 'gift-lote', lote: 9 }))).code).toBe(404)
    base.giftLotes = null
    const r = await correr(req('POST', {}, { action: 'gift-lote', cantidad: 5 }))
    expect(r.code).toBe(409)
    expect(r.body?.error).toMatch(/migrate-caja-gift-card\.sql/)
  })
})

// ─── La transferencia que ⛔ llega justa (Bruno, 12-oct, segunda tanda del POS) ─────────────────────
describe('caja · cobros sumados, otra cuenta y cambio de forma de pago (12-oct)', () => {
  it('🔑 la tolerancia: llegan $22.850 por una de $22.900 ⇒ sale sola a GN por el TOTAL, con la diferencia', async () => {
    conSesion(CAJERA)
    await correr(req('POST', {}, TRANSF))
    base.mpPagos = [pagoMP(5, 22850)]
    const r = await correr(req('POST', {}, { action: 'cruzar', id: ID }))
    expect(r.body?.cruce).toMatchObject({ estado: 'llego', por: 'solo' })
    expect(base.ventas.get(ID)).toMatchObject({ estado: 'en_gn', mp_pago_id: '5', mp_diferencia: -50 })
    expect((gn.posts[0] as { payments: Fila[] }).payments).toEqual([expect.objectContaining({ amount: 22900, account_id: 13015 })])
  })

  it('🔑 «13.300 + 100»: dos pagos que suman el total confirman la venta y quedan TOMADOS', async () => {
    conSesion(CAJERA)
    await correr(req('POST', {}, TRANSF))
    base.mpPagos = [pagoMP(1, 22000), pagoMP(2, 900, 120_000)]
    const r = await correr(req('POST', {}, { action: 'cruzar', id: ID, todos: true }))
    expect(r.body?.cruce).toEqual({ estado: 'esperando' })
    expect((r.body?.recientes as Fila[]).map((p) => p.id)).toEqual(['2', '1'])
    const ok = await correr(req('POST', {}, { action: 'confirmar-varios', id: ID, pagos: ['1', '2'] }))
    expect(ok.code).toBe(200)
    expect(base.ventas.get(ID)).toMatchObject({ estado: 'en_gn', mp_cruce: 'varios', mp_pago_id: '1', mp_diferencia: 0 })
    expect((base.ventas.get(ID)!.confirmacion as { cobros: Fila[] }).cobros.map((c) => c.id)).toEqual(['1', '2'])
    expect(base.ventaMp.map((f) => f.mp_pago_id)).toEqual(['1', '2'])
    expect((gn.posts[0] as { payments: Fila[] }).payments).toEqual([expect.objectContaining({ amount: 22900, account_id: 13015 })])
  })

  it('🔴 la suma corta ⇒ 409 diciendo cuánto falta, y ⛔ toma nada', async () => {
    conSesion(CAJERA)
    await correr(req('POST', {}, TRANSF))
    base.mpPagos = [pagoMP(1, 22000), pagoMP(2, 500, 120_000)]
    const r = await correr(req('POST', {}, { action: 'confirmar-varios', id: ID, pagos: ['1', '2'] }))
    expect(r.code).toBe(409)
    expect(r.body?.error).toMatch(/Faltan \$400/)
    expect(base.ventaMp).toHaveLength(0)
    expect(base.ventas.get(ID)!.estado).toBe('esperando_pago')
    expect(gn.posts).toHaveLength(0)
  })

  it('🔴 un pago sumado a una venta ⛔ cruza otra venta', async () => {
    conSesion(CAJERA)
    await correr(req('POST', {}, TRANSF))
    base.mpPagos = [pagoMP(1, 22000), pagoMP(2, 900, 120_000)]
    await correr(req('POST', {}, { action: 'confirmar-varios', id: ID, pagos: ['1', '2'] }))
    await correr(req('POST', {}, { ...TRANSF, id: ID2, items: [{ ...VENTA.items[0] }] }))
    base.mpPagos = [pagoMP(2, 900, 120_000)]
    base.ventas.get(ID2)!.espera_monto = 900
    const r = await correr(req('POST', {}, { action: 'cruzar', id: ID2 }))
    expect(r.body?.cruce).toEqual({ estado: 'esperando' })
    expect((await correr(req('POST', {}, { action: 'confirmar-varios', id: ID2, pagos: ['2'] }))).code).toBe(409)
  })

  it('🔑 otra cuenta nuestra: Darío ⇒ Transferencia CG (20595), sale a GN y el mail a Darío y Bruno', async () => {
    conSesion(CAJERA)
    process.env.MAILER_URL = 'https://mailer.test'
    process.env.MAILER_TICKET_KEY = 'llave'
    await correr(req('POST', {}, TRANSF))
    expect((await correr(req('POST', {}, { action: 'confirmar-otra-cuenta', id: ID, titular: 'dario', banco: '' }))).code).toBe(400)
    expect((await correr(req('POST', {}, { action: 'confirmar-otra-cuenta', id: ID, titular: 'otro', banco: 'Galicia' }))).code).toBe(400)
    const r = await correr(req('POST', {}, { action: 'confirmar-otra-cuenta', id: ID, titular: 'dario', banco: 'Galicia' }))
    expect(r.code).toBe(200)
    expect((gn.posts[0] as { payments: Fila[] }).payments).toEqual([expect.objectContaining({ amount: 22900, account_id: 20595 })])
    const v = base.ventas.get(ID)!
    expect(v).toMatchObject({ estado: 'en_gn', mp_cruce: 'otra_cuenta' })
    expect((v.pagos as Fila[])[0].cuenta).toBe(20595)
    expect(v.confirmacion).toMatchObject({ titular: 'Darío Arévalo', banco: 'Galicia', por: 'cajera', mail: { a: ['brunoarevalo@arebensrl.com', 'darioarevalo@arebensrl.com'] } })
    const aviso = mailer.posts.find((p) => p.url.endsWith('/api/externo/aviso'))!
    expect(aviso.body).toMatchObject({ para: ['brunoarevalo@arebensrl.com', 'darioarevalo@arebensrl.com'], asunto: expect.stringMatching(/Darío Arévalo/) })
    expect(String(aviso.body.texto)).toMatch(/Banco: Galicia/)
  })

  it('otra cuenta: Areben Comercial ⇒ Transferencia (13015); sin Mailer la venta sale igual y queda anotado', async () => {
    conSesion(CAJERA)
    await correr(req('POST', {}, TRANSF))
    const r = await correr(req('POST', {}, { action: 'confirmar-otra-cuenta', id: ID, titular: 'areben', banco: 'Santander' }))
    expect(r.code).toBe(200)
    expect((gn.posts[0] as { payments: Fila[] }).payments).toEqual([expect.objectContaining({ account_id: 13015 })])
    expect(base.ventas.get(ID)!.confirmacion).toMatchObject({ titular: 'Areben Comercial', mail: { error: expect.any(String) } })
  })

  it('cambiar forma de pago: cancela con motivo «cambio_pago»', async () => {
    conSesion(CAJERA)
    await correr(req('POST', {}, TRANSF))
    const r = await correr(req('POST', {}, { action: 'cancelar', id: ID, motivo: 'cambio_pago' }))
    expect(r.code).toBe(200)
    expect(base.ventas.get(ID)).toMatchObject({ estado: 'cancelada', cancelada_motivo: 'cambio_pago' })
  })
})

/**
 * V4 (Bruno, 12-oct): BDI en la Caja. Es OTRA empresa en GN ⇒ su modo Local, su token y sus cuentas; y
 * ⛔ verifica la transferencia en Mercado Pago ⇒ la venta va directo a GN. Oráculo: el cuerpo que viajó a
 * GN y con qué token, contra los ids leídos de su `GET /ventas/referencias` el 12-oct.
 */
describe('caja · BDI (V4)', () => {
  const CAJERA_BDI = { name: 'cajera', admin: false, cuenta: null, acceso: { bdi: { caja: true } }, funcion: [] }
  const ID_BDI = '7a1c2b9e-6a4d-4c1e-9b7a-2d5e8f0a1b3d'
  beforeEach(() => {
    process.env.SUPABASE_SERVICE_KEY = 'k-bdi'
    process.env.GN_TOKEN_VENTAS_BDI = 'tok-ventas-bdi'
    process.env.GN_TOKEN = 'tok-bdi'
    base.config = null
    base.turnos = [{ id: TURNO_ID, store: 'bdi', fondo: 0, abierto_en: '2026-10-04T12:00:00.000Z', cerrado_en: null, abierto_por: 'cajera', abierto_por_usuario: 'cajera' }]
  })
  afterEach(() => { delete process.env.GN_TOKEN_VENTAS_BDI; delete process.env.GN_TOKEN; delete process.env.SUPABASE_SERVICE_KEY })

  it('la config nace con las formas de pago de BDI: SUS cuentas; sin cuenta de MP, la transferencia va a la CG', async () => {
    conSesion(CAJERA_BDI)
    const r = await correr(req('GET', { action: 'config', store: 'bdi' }))
    expect(r.code).toBe(200)
    const reglas = r.body!.reglas as { medios: { efectivo: { normal: number } }; transferenciaA: number; verificarTransferencia: boolean }
    expect(reglas.medios.efectivo.normal).toBe(14685)
    expect(reglas.verificarTransferencia).toBe(true)
    expect(reglas.transferenciaA).toBe(20597)
    expect(r.body!.marca).toEqual({ store: 'bdi', nombre: 'BDI', tienda: 'bdiaccesorios.com.ar' })
  })

  it('🔑 efectivo: la venta sale al modo Local de BDI (18393, Consumidor Final 158744) con el token de BDI', async () => {
    conSesion(CAJERA_BDI)
    const r = await correr(req('POST', { store: 'bdi' }, { ...VENTA, id: ID_BDI, pagos: [{ cuenta: 14685 }] }))
    expect(r.code).toBe(200)
    expect(gn.posts[0]).toMatchObject({ store_id: 18393, client_id: 158744, channel_id: 3, sale_state_id: 6 })
    expect((gn.posts[0].payments as Fila[])[0]).toMatchObject({ account_id: 14685, amount: 21700 })
    expect(gn.authPosts[0]).toBe('Bearer tok-ventas-bdi')
    expect(base.ventas.get(ID_BDI)).toMatchObject({ store: 'bdi', estado: 'en_gn' })
  })

  it('🔑 transferencia SIN cuenta de MP: espera igual, y la cajera la confirma («Transferencia confirmada»)', async () => {
    conSesion(CAJERA_BDI)
    // $25.490 − 10 % = $22.941 ⇒ $22.900.
    const r = await correr(req('POST', { store: 'bdi' }, { ...VENTA, id: ID_BDI, pagos: [{ cuenta: 20597 }], total: 22900, pagaCon: null }))
    expect(r.code).toBe(200)
    expect(base.ventas.get(ID_BDI)).toMatchObject({ estado: 'esperando_pago', espera_monto: 22900 })
    expect(gn.posts).toHaveLength(0)
    const c = await correr(req('POST', { store: 'bdi' }, { action: 'cruzar', id: ID_BDI }))
    expect((c.body!.cruce as { estado: string }).estado).toBe('sin_cuenta')
    const ok = await correr(req('POST', { store: 'bdi' }, { action: 'confirmar-transferencia', id: ID_BDI, comprobante: '' }))
    expect(ok.code).toBe(200)
    expect(base.ventas.get(ID_BDI)).toMatchObject({ estado: 'en_gn', mp_cruce: 'cajera', confirmacion: expect.objectContaining({ sinCuentaMp: true }) })
    expect((gn.posts[0].payments as Fila[])[0]).toMatchObject({ account_id: 20597 })
    expect(mp.busquedas).toBe(0)
  })

  it('🔴 con cuenta de MP conectada, la cajera ⛔ confirma a mano: la confirma el cruce', async () => {
    conSesion(CAJERA)
    base.turnos = [{ id: TURNO_ID, store: 'zattia', fondo: 0, abierto_en: '2026-10-04T12:00:00.000Z', cerrado_en: null, abierto_por: 'cajera', abierto_por_usuario: 'cajera' }]
    base.config = { store: 'zattia', reglas: { ...REGLAS_INICIALES, transferenciaPorMp: { [CUENTA_MP]: 13015 } }, politica_cambio: null }
    await correr(req('POST', {}, { ...VENTA, pagos: [{ cuenta: 13015 }], total: 22900, pagaCon: null }))
    expect(base.ventas.get(ID)).toMatchObject({ estado: 'esperando_pago' })
    const r = await correr(req('POST', {}, { action: 'confirmar-transferencia', id: ID, comprobante: '1234' }))
    expect(r.code).toBe(403)
    expect(base.ventas.get(ID)).toMatchObject({ estado: 'esperando_pago' })
  })

  it('sin cuenta de MP, otra cuenta (⛔ la de la caja abierta) ⛔ confirma', async () => {
    conSesion({ ...CAJERA_BDI, name: 'otra' })
    base.ventas.set(ID_BDI, { id: ID_BDI, store: 'bdi', estado: 'esperando_pago', espera_monto: 22900, total: 22900, pagos: [], renglones: [], creada_en: new Date().toISOString() })
    const r = await correr(req('POST', { store: 'bdi' }, { action: 'confirmar-transferencia', id: ID_BDI }))
    expect(r.code).toBe(403)
    expect(base.ventas.get(ID_BDI)).toMatchObject({ estado: 'esperando_pago' })
  })

  it('una cuenta de Zattia en la Caja de BDI ⇒ 400 y ⛔ sale nada', async () => {
    conSesion(CAJERA_BDI)
    const r = await correr(req('POST', { store: 'bdi' }, { ...VENTA, id: ID_BDI, pagos: [{ cuenta: 12921 }] }))
    expect(r.code).toBe(400)
    expect(gn.posts).toHaveLength(0)
  })

  it('el stock vivo se lee con el token de LECTURA de BDI y de SUS depósitos', async () => {
    conSesion(CAJERA_BDI)
    base.inventario = [
      { product_id: 7, size_id: 8, product_name: 'FUNDA', size_name: 'U', sku: 'F-1', barcode: '779', available_quantity: 2, store_name: 'Local' },
      { product_id: 7, size_id: 8, product_name: 'FUNDA', size_name: 'U', sku: 'F-1', barcode: '779', available_quantity: 900, store_name: 'Deposito Mayorista' },
    ]
    const r = await correr(req('GET', { action: 'producto', codigo: '779', store: 'bdi' }))
    expect(r.code).toBe(200)
    expect(gn.authInventario[0]).toBe('Bearer tok-bdi')
  })
})
