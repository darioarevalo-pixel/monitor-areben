// El handler de lectura de Ingresos: qué manda y, sobre todo, QUÉ NO MANDA.
//
// 🔴 El motivo de este archivo es una sola regla: **el proveedor no viaja para quien no lo puede
// ver**. Esconder la columna en el componente no esconde nada — el nombre sigue en la respuesta y
// se lee abriendo la pestaña de red del navegador, que es un gesto que hace cualquiera. Por eso el
// oráculo es el CUERPO de la respuesta serializado, y ⛔ no lo que dibuja la pantalla.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

type Fila = Record<string, unknown>

const base = { tablas: {} as Record<string, Fila[]> }

function consulta(tabla: string) {
  const q: Record<string, unknown> = {}
  const filas = () => base.tablas[tabla] ?? []
  for (const m of ['select', 'order', 'gte', 'limit', 'eq', 'in'] as const) q[m] = () => q
  q.then = (resolve: (v: { data: Fila[]; error: null }) => unknown) => resolve({ data: filas(), error: null })
  q.maybeSingle = async () => ({ data: filas()[0] ?? null, error: null })
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
const sesionDe = (perfil: unknown) =>
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ ok: true, perfil }) })))

/** Marketing: ve la sección, ⛔ no los proveedores. Es el caso que motivó el permiso. */
const MARKETING = { name: 'Candela', admin: false, cuenta: null, acceso: { bdi: { recepciones: true } }, funcion: ['marketing'] }
/** Compras con el sub tildado a mano. ⚠️ La función NO lo trae: por eso va en `acceso`. */
const CON_PROVEEDORES = { name: 'Lorena', admin: false, cuenta: null, acceso: { bdi: { recepciones: true, 'recepciones.proveedores': true } }, funcion: [] }
const ADMIN = { name: 'Bruno', admin: true, cuenta: null, acceso: {}, funcion: ['direccion'] }

const OC = {
  id: 'bdi:801', store: 'bdi', oc_id: 801, oc_label: 'OC-0801', oc_estado: 'confirmada',
  fecha_compra: null, fecha_ingreso: null, confirmada_at: '2026-09-01T14:00:00Z',
  proveedor_id: 7, proveedor_nombre: 'EFFIE', unidades_pedidas: 55, unidades_contadas: 55,
  recibido_en: '2026-09-01T14:41:00Z',
}

beforeEach(() => {
  base.tablas = { recepcion_oc: [OC], recepcion_linea: [], recepcion_evento: [] }
  process.env.SUPABASE_URL = 'https://x.supabase.co'
  process.env.SUPABASE_SERVICE_KEY = 'k'
})
afterEach(() => { vi.unstubAllGlobals() })

async function correr(query: Record<string, unknown> = { store: 'bdi' }) {
  const { default: handler } = await import('../api/_recepciones.js')
  const res = resFalso()
  await (handler as (q: unknown, s: unknown) => Promise<void>)(
    { method: 'GET', headers: { 'x-monitor-auth': sobre({ user: 'x', pass: 'p' }) }, query, body: {} },
    res,
  )
  return res
}

describe('el proveedor no viaja para quien no lo puede ver', () => {
  it('🔴 a MARKETING no le llega el nombre del proveedor NI en el JSON', () => {
    sesionDe(MARKETING)
    return correr().then((res) => {
      expect(res.code).toBe(200)
      const texto = JSON.stringify(res.body)
      // El oráculo es el cuerpo entero: si el nombre está en cualquier lado, se puede leer.
      expect(texto).not.toContain('EFFIE')
      expect(texto).not.toContain('proveedor_nombre')
      // 🔑 Y también se va el id: solo, ya agrupa las órdenes por proveedor.
      expect(texto).not.toContain('proveedor_id')
      expect(res.body?.puede).toEqual({ proveedores: false })
    })
  })

  it('lo demás de la orden le llega igual: la sección se ve entera', async () => {
    sesionDe(MARKETING)
    const res = await correr()
    const fila = (res.body?.recepciones as Fila[])[0]
    expect(fila.oc_label).toBe('OC-0801')
    expect(fila.unidades_contadas).toBe(55)
    expect(fila.confirmada_at).toBe('2026-09-01T14:00:00Z')
  })

  it('con el sub tildado a mano, sí le llega', async () => {
    sesionDe(CON_PROVEEDORES)
    const res = await correr()
    expect((res.body?.recepciones as Fila[])[0].proveedor_nombre).toBe('EFFIE')
    expect(res.body?.puede).toEqual({ proveedores: true })
  })

  it('🔑 el ADMIN lo ve sin tildarse nada', async () => {
    sesionDe(ADMIN)
    const res = await correr()
    expect((res.body?.recepciones as Fila[])[0].proveedor_nombre).toBe('EFFIE')
  })

  it('⚠️ la FUNCIÓN no alcanza: marketing ve la sección y no el sub', async () => {
    // Un sub nunca lo hereda la función (ver `puedeSub`). Si esto se rompiera, alcanzaría con estar
    // en un área para destapar los proveedores, que es justo lo que el permiso evita.
    sesionDe({ ...MARKETING, funcion: ['direccion'] })
    const res = await correr()
    expect(res.body?.puede).toEqual({ proveedores: false })
  })

  it('🔴 y tampoco viaja al ABRIR una orden: la puerta está en los dos caminos', async () => {
    sesionDe(MARKETING)
    const res = await correr({ store: 'bdi', oc: 'bdi:801' })
    expect(res.code).toBe(200)
    expect(JSON.stringify(res.body)).not.toContain('EFFIE')
    expect(res.body?.puede).toEqual({ proveedores: false })
  })
})
