import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * El registro de las ventas que el monitor crea en Gestión Nube (`gn_venta_monitor`, libro de stock,
 * 13-oct-2026). Lo que fija este archivo:
 *  - cada venta que sale de `crear-venta` queda anotada con SUS prendas, su depósito y de qué flujo salió;
 *  - si anotar falla, la venta se informa igual (GN ⛔ anula por API: un error invitaría a duplicarla);
 *  - un renglón inválido frena la venta entera (antes se descartaba callado);
 *  - la anulación se anota sólo si GN ya ⛔ tiene la venta activa.
 */

const registro = vi.hoisted(() => ({
  anotadas: [] as Record<string, unknown>[],
  anotarFalla: null as string | null,
  fila: null as Record<string, unknown> | null,
  anuladas: [] as number[],
}))

vi.mock('@/api/_ventas-monitor.js', async (original) => {
  const real = await original<typeof import('@/api/_ventas-monitor.js')>()
  return {
    ...real,
    anotar: vi.fn(async (_store: string, fila: Record<string, unknown>) => {
      if (registro.anotarFalla) return { registrada: false, error: registro.anotarFalla }
      registro.anotadas.push(fila)
      return { registrada: true }
    }),
    leer: vi.fn(async () => registro.fila),
    marcarAnulada: vi.fn(async (_store: string, id: number) => { registro.anuladas.push(id); return true }),
  }
})

function resFalso() {
  const r = {
    code: 0 as number,
    body: null as Record<string, unknown> | null,
    headers: {} as Record<string, string>,
    setHeader(k: string, v: string) { r.headers[k.toLowerCase()] = String(v) },
    status(c: number) { r.code = c; return r },
    json(b: unknown) { r.body = b as Record<string, unknown>; return r },
    end() { return r },
  }
  return r
}

const sobre = (d: unknown) => Buffer.from(JSON.stringify(d), 'utf8').toString('base64')
const URL_KV = 'https://bdi-catalogo.vercel.app/api/usuarios'
const AUTH = { 'x-monitor-auth': sobre({ user: 'Bruno', pass: 'secreta' }) }

/** GN contesta `gn` (status + cuerpo) a todo; el KV dice que la sesión es buena. */
function red(gn: { status: number; data?: unknown }) {
  const aGN: { url: string; body: unknown }[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, opts?: { body?: string }) => {
    if (String(url).startsWith(URL_KV)) return { ok: true, json: async () => ({ ok: true, perfil: { name: 'Bruno', admin: true, acceso: {}, funcion: [] } }) }
    aGN.push({ url: String(url), body: opts?.body ? JSON.parse(opts.body) : null })
    return { ok: gn.status < 400, status: gn.status, text: async () => JSON.stringify(gn.data ?? {}) }
  }))
  return aGN
}

async function handler() {
  return (await import('@/api/crear-venta.js')).default as (req: unknown, res: ReturnType<typeof resFalso>) => Promise<unknown>
}

const regaladas = {
  store: 'bdi', origen: 'deposito', proposito: 'reclamo', solicitudId: 'reclamo-5-regaladas', comments: 'x',
  items: [{ product_id: '900', size_id: '7', quantity: 2, unit_price: 1000 }],
}

beforeEach(() => {
  vi.resetModules()
  vi.stubEnv('GN_TOKEN_VENTAS', 'token-zattia')
  vi.stubEnv('GN_TOKEN_VENTAS_BDI', 'token-bdi')
  registro.anotadas = []; registro.anotarFalla = null; registro.fila = null; registro.anuladas = []
})
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

describe('crear-venta anota cada venta en el registro', () => {
  it('con las prendas, el depósito y el flujo del que salió', async () => {
    red({ status: 200, data: { data: { id: 777, number: 55 } } })
    const res = resFalso()
    await (await handler())({ method: 'POST', headers: AUTH, body: regaladas }, res)
    expect(res.code).toBe(200)
    expect(res.body).toMatchObject({ ok: true, registrada: true, venta: { id: 777, number: 55 } })
    expect(registro.anotadas).toHaveLength(1)
    expect(registro.anotadas[0]).toMatchObject({
      gn_venta_id: 777, gn_number: '55', marca: 'bdi', proposito: 'reclamo',
      ref: 'reclamo-5-regaladas-deposito', store_id: 13307, creada_por: 'Bruno',
      lineas: [{ product_id: 900, size_id: 7, quantity: 2, unit_price: 1000 }],
    })
  })

  it('🔴 si anotar falla, la venta se informa igual (registrada:false), ⛔ como error', async () => {
    red({ status: 200, data: { data: { id: 778, number: 56 } } })
    registro.anotarFalla = 'relation "gn_venta_monitor" does not exist'
    const res = resFalso()
    await (await handler())({ method: 'POST', headers: AUTH, body: regaladas }, res)
    expect(res.code).toBe(200)
    expect(res.body).toMatchObject({ ok: true, registrada: false, venta: { id: 778 } })
  })

  it('la importación de Tienda Nube de Stunned también queda anotada', async () => {
    red({ status: 200, data: { data: { id: 900, number: 3 } } })
    vi.doMock('@/api/_sync-ledger.js', () => ({
      reservar: async () => ({ ocupado: false }), confirmar: async () => ({}), liberar: async () => ({}), clienteDe: () => null,
    }))
    const res = resFalso()
    await (await handler())({ method: 'POST', headers: AUTH, body: {
      accion: 'tn_import', store: 'stunned', tn_order: '1234', origen: 'local',
      items: [{ product_id: 1, size_id: 2, quantity: 1, unit_price: 5000 }],
    } }, res)
    expect(res.code).toBe(200)
    expect(registro.anotadas[0]).toMatchObject({ marca: 'stunned', proposito: 'tn_import', ref: '1234', store_id: 11780 })
    vi.doUnmock('@/api/_sync-ledger.js')
  })
})

describe('crear-venta: entera o no se crea', () => {
  it('🔴 un renglón sin producto de GN frena la venta entera y ⛔ sale nada a GN', async () => {
    const aGN = red({ status: 200, data: { data: { id: 1 } } })
    const res = resFalso()
    await (await handler())({ method: 'POST', headers: AUTH, body: {
      ...regaladas, items: [...regaladas.items, { product_id: null, size_id: null, quantity: 1 }],
    } }, res)
    expect(res.code).toBe(400)
    expect(String(res.body?.error)).toMatch(/entera o no se crea/)
    expect(aGN).toEqual([])
  })

  it('una cantidad 0 también (sólo el reingreso admite negativas)', async () => {
    const aGN = red({ status: 200, data: { data: { id: 1 } } })
    const res = resFalso()
    await (await handler())({ method: 'POST', headers: AUTH, body: { ...regaladas, items: [{ product_id: 1, size_id: 2, quantity: 0 }] } }, res)
    expect(res.code).toBe(400)
    expect(aGN).toEqual([])
  })

  it('el reingreso con cantidad negativa sigue pasando', async () => {
    red({ status: 200, data: { data: { id: 5, number: 1 } } })
    const res = resFalso()
    await (await handler())({ method: 'POST', headers: AUTH, body: { ...regaladas, accion: 'reingreso', proposito: undefined, items: [{ product_id: 1, size_id: 2, quantity: -1, unit_price: 10 }] } }, res)
    expect(res.code).toBe(200)
    expect(registro.anotadas[0]).toMatchObject({ proposito: 'reingreso', lineas: [{ quantity: -1 }] })
  })
})

describe('crear-venta: anotar una anulación', () => {
  const anular = { accion: 'anulada', store: 'bdi', ventaId: 777 }

  it('GN ya ⛔ la tiene ⇒ queda anotada', async () => {
    registro.fila = { gn_venta_id: 777, gn_number: '55', anulada_en: null }
    red({ status: 404 })
    const res = resFalso()
    await (await handler())({ method: 'POST', headers: AUTH, body: anular }, res)
    expect(res.code).toBe(200)
    expect(registro.anuladas).toEqual([777])
  })

  it('🔴 GN todavía la tiene activa ⇒ 409 y ⛔ se anota', async () => {
    registro.fila = { gn_venta_id: 777, gn_number: '55', anulada_en: null }
    red({ status: 200, data: { data: { active: true, archived: false } } })
    const res = resFalso()
    await (await handler())({ method: 'POST', headers: AUTH, body: anular }, res)
    expect(res.code).toBe(409)
    expect(registro.anuladas).toEqual([])
  })

  it('una venta que el monitor no creó contesta 404 sin preguntarle a GN', async () => {
    const aGN = red({ status: 404 })
    const res = resFalso()
    await (await handler())({ method: 'POST', headers: AUTH, body: anular }, res)
    expect(res.code).toBe(404)
    expect(aGN).toEqual([])
  })
})

describe('propositoDe', () => {
  it('la acción manda sobre el propósito; sin ninguno es una sesión de fotos', async () => {
    const { propositoDe } = await import('@/api/_ventas-monitor.js')
    expect(propositoDe({ accion: 'cambio_real', proposito: 'cambio' })).toBe('cambio_real')
    expect(propositoDe({ proposito: 'falla' })).toBe('falla')
    expect(propositoDe({ proposito: 'cualquiera' })).toBe('fotos')
  })
})

describe('sinArticuloGN (las ventas técnicas de un reclamo, enteras o nada)', () => {
  it('nombra el primer producto sin artículo de GN', async () => {
    const { sinArticuloGN } = await import('@/lib/reclamos/cliente')
    expect(sinArticuloGN([{ item: { product_id: '1', size_id: '2', producto: 'A' } }])).toBeNull()
    expect(sinArticuloGN([
      { item: { product_id: '1', size_id: '2', producto: 'A' } },
      { item: { product_id: null, size_id: null, producto: 'TOP CANDELA' } },
    ])).toBe('«TOP CANDELA»')
  })
})
