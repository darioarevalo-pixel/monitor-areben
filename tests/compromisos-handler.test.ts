import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * `confirmar` es el único verbo del monitor que escribe plata en OTRO sistema. Lo que se fija acá:
 *
 *  1. Anotar y confirmar son permisos distintos. Quien puede prometer no puede, por eso solo,
 *     mover un peso.
 *  2. `estado` no es una puerta de atrás a `confirmado`: si lo fuera, se saltearían el permiso de
 *     confirmar Y la escritura en el dashboard, y la promesa diría "listo" sin que exista el pago.
 *  3. Se manda el `operacion_id` DEL COMPROMISO y no uno nuevo. Es la mitad de la idempotencia:
 *     un reintento tiene que llegar con el mismo número o el dashboard escribe los pagos de nuevo.
 *  4. Si el dashboard rechaza, acá no se marca nada. Un compromiso confirmado sin pago atrás es
 *     peor que uno sin confirmar: dice que la deuda bajó cuando no bajó.
 *  5. Si entró menos de lo prometido, lo que falta queda anotado como una promesa nueva.
 */

const filas: Record<string, Record<string, unknown>> = {}
const insertados: Record<string, unknown>[] = []

/** Un Supabase de mentira, con lo justo que usa el handler. */
function tabla() {
  const q: Record<string, unknown> = {}
  const api: Record<string, unknown> = {
    select: () => api,
    eq: (_c: string, v: string) => { q.id = v; return api },
    order: () => api,
    limit: () => Promise.resolve({ data: Object.values(filas), error: null }),
    single: () => Promise.resolve({ data: filas[q.id as string] ?? null, error: filas[q.id as string] ? null : { message: 'no está' } }),
    insert: (row: Record<string, unknown>) => {
      const id = `nueva-${insertados.length + 1}`
      const creada = { ...row, id, operacion_id: 'op-nueva' }
      insertados.push(creada)
      filas[id] = creada
      q.id = id            // para que el `.select().single()` de después devuelva la recién creada
      return api
    },
    update: (cambios: Record<string, unknown>) => {
      const api2: Record<string, unknown> = {
        eq: (_c: string, v: string) => { q.id = v; Object.assign(filas[v] ?? {}, cambios); return api2 },
        select: () => api2,
        single: () => Promise.resolve({ data: filas[q.id as string], error: null }),
      }
      return api2
    },
  }
  return api
}

vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from: () => tabla() }) }))

function resFalso() {
  const r = {
    code: 0 as number,
    body: null as Record<string, unknown> | null,
    setHeader() { return r },
    status(c: number) { r.code = c; return r },
    json(b: unknown) { r.body = b as Record<string, unknown>; return r },
    end() { return r },
  }
  return r
}

const sobre = (d: unknown) => Buffer.from(JSON.stringify(d), 'utf8').toString('base64')

let alDashboard: { url: string; body: Record<string, unknown> }[] = []

function escenario(perfil: unknown, puerta: { ok: boolean; status?: number; body?: unknown }) {
  alDashboard = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: { body?: string }) => {
    if (String(url).includes('bdi-catalogo.vercel.app/api/usuarios')) {
      return { ok: true, json: async () => ({ ok: true, perfil }) }
    }
    alDashboard.push({ url: String(url), body: JSON.parse(init?.body ?? '{}') })
    return { ok: puerta.ok, status: puerta.status ?? (puerta.ok ? 200 : 409), json: async () => puerta.body }
  }) as unknown as typeof fetch)
}

const pedido = (body: Record<string, unknown>) => ({
  method: 'POST',
  headers: { 'x-monitor-auth': sobre({ user: 'A', pass: 'p' }) },
  query: {},
  body,
})

async function llamar(req: unknown) {
  const { default: handler } = await import('../api/_compromisos.js')
  const res = resFalso()
  await handler(req as never, res as never)
  return res
}

const ADMIN = { name: 'Dario', admin: true }
// Ve la sección y puede prometer, pero NO confirmar.
const SOLO_PROMETE = {
  name: 'Alguien', admin: false,
  acceso: { bdi: { acreedores: true, 'acreedores.prometer': true } },
}

const COMPROMISO = {
  id: 'c1', acreedor_id: 'ac-1', acreedor_nombre: 'Contador', cliente_id: 'cli-9',
  cliente_store: 'bdi', cliente_nombre: 'Nazarena', titular_real: 'Nazarena Luciani',
  monto: 500000, estado: 'prometido', operacion_id: 'op-del-compromiso', creado_en: '2026-09-01',
  cuenta_alias: null, cuenta_cbu: null, cuenta_banco: null, cuenta_titular: null,
  monto_confirmado: null, fecha_prometida: null, notas: null, pagos_dashboard: null, viene_de: null,
}

beforeEach(() => {
  process.env.DASHBOARD_PUENTE_SECRET = 'x'.repeat(64)
  for (const k of Object.keys(filas)) delete filas[k]
  insertados.length = 0
  Object.assign(filas, { c1: { ...COMPROMISO } })
})
afterEach(() => { vi.unstubAllGlobals(); delete process.env.DASHBOARD_PUENTE_SECRET })

describe('anotar y confirmar son permisos distintos', () => {
  it('quien puede prometer NO puede confirmar', async () => {
    escenario(SOLO_PROMETE, { ok: true, body: {} })
    const res = await llamar(pedido({ action: 'confirmar', id: 'c1' }))
    expect(res.code).toBe(403)
    expect(String(res.body?.error)).toMatch(/no tenés permiso para confirmar/i)
    expect(alDashboard).toHaveLength(0)  // ni se golpeó la puerta
  })

  it('pero sí puede anotar una promesa', async () => {
    escenario(SOLO_PROMETE, { ok: true, body: {} })
    const res = await llamar(pedido({
      action: 'crear',
      compromiso: { acreedor_id: 'ac-1', acreedor_nombre: 'Contador', cliente_nombre: 'Nazarena', monto: 1000 },
    }))
    expect(res.code).toBe(200)
  })
})

describe('`estado` no es una puerta de atrás', () => {
  it('no deja llegar a confirmado sin escribir el pago', async () => {
    escenario(ADMIN, { ok: true, body: {} })
    const res = await llamar(pedido({ action: 'estado', id: 'c1', estado: 'confirmado' }))
    expect(res.code).toBe(400)
    expect(alDashboard).toHaveLength(0)
    expect(filas.c1.estado).toBe('prometido')
  })

  it('un confirmado no vuelve atrás', async () => {
    filas.c1.estado = 'confirmado'
    escenario(ADMIN, { ok: true, body: {} })
    const res = await llamar(pedido({ action: 'estado', id: 'c1', estado: 'prometido' }))
    expect(res.code).toBe(409)
    expect(String(res.body?.error)).toMatch(/ya impactó en el dashboard/)
  })
})

describe('confirmar', () => {
  it('manda el operacion_id DEL COMPROMISO, no uno nuevo', async () => {
    escenario(ADMIN, { ok: true, body: { pagos: [{ pago_id: 'p1' }], imputado: 500000 } })
    await llamar(pedido({ action: 'confirmar', id: 'c1', monto_real: 500000, fecha: '2026-09-02' }))
    expect(alDashboard).toHaveLength(1)
    expect(alDashboard[0].body.operacion_id).toBe('op-del-compromiso')
    expect(alDashboard[0].body.monto).toBe(500000)
  })

  /**
   * 🔑 **Los DOS nombres, no uno** (Darío, 3-sep-2026). La deuda es de un cliente; la transferencia
   * la puede mandar otro. Antes viajaba `titular_real || cliente_nombre`, así que si transfería un
   * tercero el pago del ledger quedaba con el nombre del tercero y sólo el ID de la clienta — y el
   * dashboard no resuelve ids de Gestión Nube, o sea que de quién era la deuda no se podía leer.
   */
  it('manda de quién era la deuda Y a nombre de quién vino, separados', async () => {
    escenario(ADMIN, { ok: true, body: { pagos: [] } })
    await llamar(pedido({
      action: 'confirmar', id: 'c1', monto_real: 500000, fecha: '2026-09-02',
      titular_real: 'Juan Pérez',
    }))
    const pagador = alDashboard[0].body.pagador as { cliente_id: string; nombre: string; titular: string | null }
    expect(pagador.cliente_id).toBe('cli-9')
    expect(pagador.nombre).toBe('Nazarena')      // el cliente: de quién era la deuda
    expect(pagador.titular).toBe('Juan Pérez')   // el extracto: de quién es el movimiento
  })

  it('si transfirió el cliente, el titular va NULL y no repetido', async () => {
    // Repetir el nombre obligaría a comparar las dos columnas para saber si hubo un tercero, y
    // "hubo un tercero" es justo lo que se quiere ver de un vistazo.
    filas.c1 = { ...COMPROMISO, titular_real: null }
    escenario(ADMIN, { ok: true, body: { pagos: [] } })
    await llamar(pedido({ action: 'confirmar', id: 'c1', monto_real: 500000, fecha: '2026-09-02' }))
    const pagador = alDashboard[0].body.pagador as { nombre: string; titular: string | null }
    expect(pagador.nombre).toBe('Nazarena')
    expect(pagador.titular).toBeNull()
  })

  it('lo que se lee del extracto pisa lo que se había adivinado al prometer', async () => {
    // La promesa decía "Nazarena Luciani"; en el banco vino a nombre del socio.
    escenario(ADMIN, { ok: true, body: { pagos: [] } })
    await llamar(pedido({
      action: 'confirmar', id: 'c1', monto_real: 500000, fecha: '2026-09-02', titular_real: 'Luciani SRL',
    }))
    expect((alDashboard[0].body.pagador as { titular: string }).titular).toBe('Luciani SRL')
    expect(filas.c1.titular_real).toBe('Luciani SRL')
  })

  it('⛔ el resto de una promesa parcial NO hereda el titular: es otra transferencia', async () => {
    escenario(ADMIN, { ok: true, body: { pagos: [] } })
    await llamar(pedido({
      action: 'confirmar', id: 'c1', monto_real: 200000, fecha: '2026-09-02', titular_real: 'Juan Pérez',
    }))
    expect(insertados[0]).toMatchObject({ monto: 300000, titular_real: null })
  })

  it('si el dashboard rechaza, acá NO se marca nada', async () => {
    escenario(ADMIN, { ok: false, status: 409, body: { error: 'El mes 2026-05 ya está cerrado' } })
    const res = await llamar(pedido({ action: 'confirmar', id: 'c1', monto_real: 500000 }))
    expect(res.code).toBe(409)
    expect(String(res.body?.error)).toMatch(/ya está cerrado/)
    expect(filas.c1.estado).toBe('prometido')   // 🔑 sigue sin confirmar
    expect(filas.c1.monto_confirmado).toBeFalsy()
  })

  it('sin la credencial del dashboard avisa, y no marca nada', async () => {
    delete process.env.DASHBOARD_PUENTE_SECRET
    escenario(ADMIN, { ok: true, body: {} })
    const res = await llamar(pedido({ action: 'confirmar', id: 'c1' }))
    expect(res.code).toBe(503)
    expect(filas.c1.estado).toBe('prometido')
  })

  it('confirmar dos veces avisa en vez de volver a escribir', async () => {
    filas.c1.estado = 'confirmado'
    escenario(ADMIN, { ok: true, body: {} })
    const res = await llamar(pedido({ action: 'confirmar', id: 'c1' }))
    expect(res.code).toBe(409)
    expect(alDashboard).toHaveLength(0)
  })
})

describe('cuando entra menos de lo prometido', () => {
  it('se confirma por lo que entró y lo que falta queda como una promesa nueva', async () => {
    escenario(ADMIN, { ok: true, body: { pagos: [{ pago_id: 'p1' }], imputado: 300000 } })
    const res = await llamar(pedido({ action: 'confirmar', id: 'c1', monto_real: 300000 }))
    expect(res.code).toBe(200)
    expect(filas.c1.estado).toBe('confirmado')
    expect(filas.c1.monto_confirmado).toBe(300000)

    const nueva = insertados.at(-1)!
    expect(nueva.monto).toBe(200000)
    expect(nueva.viene_de).toBe('c1')
    expect(nueva.acreedor_id).toBe('ac-1')
    expect(nueva.cliente_nombre).toBe('Nazarena')
    expect(String(nueva.notas)).toMatch(/faltó/)
  })

  it('si entró todo, no se anota ninguna promesa nueva', async () => {
    escenario(ADMIN, { ok: true, body: { pagos: [{ pago_id: 'p1' }], imputado: 500000 } })
    await llamar(pedido({ action: 'confirmar', id: 'c1', monto_real: 500000 }))
    expect(insertados).toHaveLength(0)
  })
})

/**
 * Reenganchar una promesa que se anotó antes de que el cliente existiera en Gestión Nube.
 *
 * 🔑 El caso lo levantó Darío el 3-sep-2026: el mayorista nuevo compra por WhatsApp y se carga al
 * ERP recién cuando se arma el pedido, pero el cobro se arregla en esa charla. La promesa nace sin
 * `cliente_id` y con el teléfono del chat; cuando el cliente aparece, esto le pone el id.
 */
describe('vincular una promesa al cliente que recién ahora existe', () => {
  it('le pone el id y el nombre de verdad', async () => {
    filas.c1 = { ...COMPROMISO, cliente_id: null, cliente_nombre: 'la chica de Resistencia', cliente_telefono: '5493624667485' }
    escenario(ADMIN, { ok: true, body: {} })
    const res = await llamar(pedido({ action: 'vincular', id: 'c1', cliente_id: '77', cliente_nombre: 'Leire Veron' }))
    expect(res.code).toBe(200)
    expect(filas.c1.cliente_id).toBe('77')
    expect(filas.c1.cliente_nombre).toBe('Leire Veron')
    // El teléfono NO se borra: es lo que permitió el cruce y sirve para abrir el chat.
    expect(filas.c1.cliente_telefono).toBe('5493624667485')
  })

  it('⛔ no toca una que ya está confirmada: el pago del dashboard quedaría apuntando a otro lado', async () => {
    filas.c1 = { ...COMPROMISO, cliente_id: null, estado: 'confirmado' }
    escenario(ADMIN, { ok: true, body: {} })
    const res = await llamar(pedido({ action: 'vincular', id: 'c1', cliente_id: '77', cliente_nombre: 'Leire Veron' }))
    expect(res.code).toBe(409)
    expect(filas.c1.cliente_id).toBeNull()
  })

  it('no repisa una que ya tiene cliente', async () => {
    escenario(ADMIN, { ok: true, body: {} })
    const res = await llamar(pedido({ action: 'vincular', id: 'c1', cliente_id: '77', cliente_nombre: 'Otro' }))
    expect(res.code).toBe(409)
    expect(filas.c1.cliente_id).toBe('cli-9')
  })

  it('pide permiso de prometer', async () => {
    filas.c1 = { ...COMPROMISO, cliente_id: null }
    escenario({ name: 'Mirón', admin: false, acceso: { bdi: { acreedores: true } } }, { ok: true, body: {} })
    const res = await llamar(pedido({ action: 'vincular', id: 'c1', cliente_id: '77', cliente_nombre: 'Leire' }))
    expect(res.code).toBe(403)
  })
})

describe('la promesa de alguien que todavía no está en el ERP', () => {
  it('se guarda sin cliente_id y con el teléfono del chat', async () => {
    escenario(ADMIN, { ok: true, body: {} })
    const res = await llamar(pedido({
      action: 'crear',
      compromiso: {
        acreedor_id: 'ac-1', acreedor_nombre: 'Contador', cliente_nombre: 'la chica de Resistencia',
        cliente_telefono: '5493624667485', monto: 1000,
      },
    }))
    expect(res.code).toBe(200)
    expect(insertados[0]).toMatchObject({ cliente_id: null, cliente_telefono: '5493624667485' })
  })

  it('⚠️ el resto de una promesa parcial hereda el teléfono, o nace huérfano', async () => {
    filas.c1 = { ...COMPROMISO, cliente_id: null, cliente_telefono: '5493624667485' }
    escenario(ADMIN, { ok: true, body: { pagos: [] } })
    const res = await llamar(pedido({ action: 'confirmar', id: 'c1', monto_real: 200000, fecha: '2026-09-03' }))
    expect(res.code).toBe(200)
    expect(insertados[0]).toMatchObject({ cliente_telefono: '5493624667485', monto: 300000 })
  })
})
