import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ESTADOS_ABIERTOS } from '@/lib/reclamos/casos.core.js'

/**
 * **Los dos topes que se cortaban callados** (D12 de la auditoría del 28-ago-2026).
 *
 * 🔴 El aviso del sidebar bajaba **las 200 filas más nuevas de todas** —cerradas incluidas— y el
 * front las filtraba con `estaAbierto`. **Lo cerrado crece para siempre y lo abierto no**: con 200
 * reclamos por mes, al segundo mes el corte se come reclamos abiertos y el que duerme **deja de
 * contar en el badge**, que es exactamente para lo que la alerta existe. Y el listado hacía lo
 * mismo, con las tres pestañas filtrando en el cliente sobre lo que bajó.
 *
 * 🔑 Lo que se fija acá es **qué le pide el handler a la base** —el `.in`, el orden y el tope— y
 * **que un corte se diga**. La base es de mentira, así que el `.in` ⛔ no filtra nada: por eso el
 * oráculo es la llamada, ⛔ no el resultado.
 */

/** Lo que la base va a contestar, y lo que el handler le pidió. */
const mundo = {
  filas: [] as Record<string, unknown>[],
  pedido: { in: null as [string, unknown] | null, order: null as [string, unknown] | null, limit: 0 },
}

function fakeSupabase() {
  const desde = () => {
    const api: Record<string, unknown> = {
      select: () => api,
      eq: () => api,
      or: () => api,
      in: (col: string, vals: unknown) => { mundo.pedido.in = [col, vals]; return api },
      order: (col: string, o: unknown) => { mundo.pedido.order = [col, o]; return api },
      limit: (n: number) => { mundo.pedido.limit = n; return Promise.resolve({ data: mundo.filas, error: null }) },
      maybeSingle: async () => ({ data: null, error: null }),
      single: async () => ({ data: null, error: null }),
      then: (ok: (v: unknown) => unknown, mal: (e: unknown) => unknown) =>
        Promise.resolve({ data: mundo.filas, error: null }).then(ok, mal),
    }
    return api
  }
  return { from: desde }
}

vi.mock('@supabase/supabase-js', () => ({ createClient: () => fakeSupabase() }))

function resFalso() {
  const r = {
    code: 0 as number,
    body: null as Record<string, unknown> | null,
    setHeader() { /* no importa acá */ },
    status(c: number) { r.code = c; return r },
    json(b: unknown) { r.body = b as Record<string, unknown>; return r },
    end() { return r },
  }
  return r
}

const sobre = (d: unknown) => Buffer.from(JSON.stringify(d), 'utf8').toString('base64')
const ADMIN = { name: 'Bruno', admin: true, cuenta: null, acceso: {}, funcion: ['administracion'] }

async function pedir(query: Record<string, string>) {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ ok: true, perfil: ADMIN }) })))
  const { default: handler } = await import('../api/_reclamos.js')
  const res = resFalso()
  await handler({ method: 'GET', headers: { 'x-monitor-auth': sobre({ user: 'x', pass: 'y' }) }, query: { store: 'bdi', ...query }, body: null }, res)
  return res
}

const fila = (i: number) => ({ id: i, estado: 'esperando_cliente', motivo: 'falla', created_at: '2026-08-01T00:00:00Z', historial: [] })

beforeEach(() => {
  mundo.filas = []
  mundo.pedido = { in: null, order: null, limit: 0 }
  vi.stubEnv('SUPABASE_URL', 'https://ejemplo.supabase.co')
  vi.stubEnv('SUPABASE_KEY', 'llave-de-mentira')
})
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

describe('el aviso del sidebar', () => {
  /**
   * 🔑 **La lista sale del núcleo, ⛔ no de un literal al lado del `select`.** Copiarla acá —o su
   * complemento— es la segunda copia de la regla, y el precio sería un `anulado` con un pendiente
   * viejo avisando para siempre de algo que ya no existe.
   */
  it('🔴 le pide a la base SÓLO los abiertos, con la lista del núcleo', async () => {
    await pedir({ vista: 'avisos' })
    expect(mundo.pedido.in?.[0]).toBe('estado')
    expect(mundo.pedido.in?.[1]).toEqual(ESTADOS_ABIERTOS)
  })

  /**
   * 🔴 **El orden estaba al revés de para qué sirve esto.** Descendente, el corte se lleva **los
   * más viejos** — justo los que pueden estar durmiendo. Ascendente, lo que queda afuera son los
   * recién abiertos, que ⛔ todavía no pueden tener alerta y entran solos al envejecer.
   */
  it('🔴 y los pide del MÁS VIEJO al más nuevo', async () => {
    await pedir({ vista: 'avisos' })
    expect(mundo.pedido.order?.[0]).toBe('created_at')
    expect(mundo.pedido.order?.[1]).toEqual({ ascending: true })
  })

  it('sin corte, contesta lo que hay y `hayMas` en false', async () => {
    const { TOPE_AVISOS } = await import('../api/_reclamos.js')
    mundo.filas = Array.from({ length: TOPE_AVISOS }, (_, i) => fila(i))
    const res = await pedir({ vista: 'avisos' })
    expect((res.body?.devoluciones as unknown[]).length).toBe(TOPE_AVISOS)
    expect(res.body?.hayMas).toBe(false)
  })

  /**
   * 🔑 **Pide UNO MÁS que el tope, y por eso puede distinguir.** Contar `data.length === TOPE`
   * ⛔ no separa «entraron justos» de «se cortó», y ese empate es exactamente el caso en que el
   * aviso se callaría de más.
   */
  it('🔴 con una fila más que el tope, lo DICE y ⛔ no devuelve la de más', async () => {
    const { TOPE_AVISOS } = await import('../api/_reclamos.js')
    expect(mundo.pedido.limit).toBe(0)
    mundo.filas = Array.from({ length: TOPE_AVISOS + 1 }, (_, i) => fila(i))
    const res = await pedir({ vista: 'avisos' })
    expect(mundo.pedido.limit).toBe(TOPE_AVISOS + 1)
    expect(res.body?.hayMas).toBe(true)
    expect((res.body?.devoluciones as unknown[]).length).toBe(TOPE_AVISOS)
  })
})

describe('el listado', () => {
  it('🔴 con más filas que el tope pedido, lo dice y corta en el tope', async () => {
    mundo.filas = Array.from({ length: 4 }, (_, i) => fila(i))
    const res = await pedir({ limit: '3' })
    expect(mundo.pedido.limit).toBe(4) // el tope + 1
    expect(res.body?.hayMas).toBe(true)
    expect((res.body?.devoluciones as unknown[]).length).toBe(3)
  })

  it('justo en el tope ⛔ no miente: `hayMas` en false', async () => {
    mundo.filas = Array.from({ length: 3 }, (_, i) => fila(i))
    const res = await pedir({ limit: '3' })
    expect(res.body?.hayMas).toBe(false)
    expect((res.body?.devoluciones as unknown[]).length).toBe(3)
  })

  /** ⚠️ El listado sí baja lo cerrado: la pestaña «Todos» existe. El `.in` es del aviso, ⛔ no de acá. */
  it('⛔ el listado ⛔ NO filtra por estado abierto', async () => {
    mundo.filas = [fila(1)]
    await pedir({})
    expect(mundo.pedido.in).toBeNull()
  })
})
