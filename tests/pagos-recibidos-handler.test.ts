import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * El handler de Pagos recibidos, de punta a punta con una base y un Mercado Pago de mentira:
 * cargar una cuenta, cambiarla, leer un día, y que la empleada ⛔ pueda cambiar nada ni ver el total.
 */

type Fila = Record<string, unknown>
const tablas: Record<string, Fila[]> = {}

function consulta(nombre: string) {
  let filas = () => tablas[nombre] || []
  let cols: string[] | null = null
  const q = {
    select(c: string) {
      cols = c.split(',').map((x) => x.trim())
      return q
    },
    eq(k: string, v: unknown) {
      const prev = filas
      filas = () => prev().filter((f) => f[k] === v)
      return q
    },
    in(k: string, vs: unknown[]) {
      const prev = filas
      filas = () => prev().filter((f) => vs.includes(f[k]))
      return q
    },
    order(k: string) {
      const prev = filas
      filas = () => [...prev()].sort((a, b) => String(a[k]).localeCompare(String(b[k])))
      return q
    },
    recortar: (f: Fila) => (cols ? Object.fromEntries(cols.map((c) => [c, f[c]])) : f),
    then(ok: (v: unknown) => void) {
      ok({ data: filas().map(q.recortar), error: null })
    },
    maybeSingle: async () => ({ data: filas()[0] ? q.recortar(filas()[0]) : null, error: null }),
    insert: async (f: Fila) => {
      ;(tablas[nombre] ||= []).push({ desde: new Date(Date.now() + (tablas[nombre]?.length || 0)).toISOString(), ...f })
      return { error: null }
    },
    upsert: async (f: Fila) => {
      const t = (tablas[nombre] ||= [])
      const i = t.findIndex((x) => x.cuenta_id === f.cuenta_id)
      if (i >= 0) t[i] = { ...t[i], ...f }
      else t.push(f)
      return { error: null }
    },
  }
  return q
}

let perfil: Record<string, unknown> = {}
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from: consulta }) }))
vi.mock('../api/_auth.js', () => ({ exigirUsuario: async () => perfil }))

const CUENTAS: Record<string, { id: number; nickname: string; first_name: string; last_name: string }> = {
  'APP_USR-aaa-111': { id: 111, nickname: 'ZATTIA', first_name: 'Dario', last_name: 'Arevalo' },
  'APP_USR-bbb-222': { id: 222, nickname: 'OTRA', first_name: 'Bruno', last_name: 'Arevalo' },
}
const pago = (id: number, cuenta: number, monto: number) => ({
  id,
  status: 'approved',
  collector_id: cuenta,
  transaction_amount: monto,
  operation_type: 'money_transfer',
  payment_method_id: 'account_money',
  date_created: '2026-10-02T15:00:00.000-04:00',
  date_approved: '2026-10-02T15:00:00.000-04:00',
  payer: { email: 'x@y.com' },
})

vi.stubGlobal('fetch', async (url: string, opts: { headers: { Authorization: string } }) => {
  const token = opts.headers.Authorization.replace('Bearer ', '')
  const yo = CUENTAS[token]
  if (!yo) return { ok: false, status: 401, json: async () => ({}) }
  if (url.includes('/users/me')) return { ok: true, status: 200, json: async () => yo }
  return { ok: true, status: 200, json: async () => ({ results: [pago(yo.id * 10, yo.id, yo.id)] }) }
})

process.env.ZATTIA_SUPABASE_URL = 'http://x'
process.env.ZATTIA_SUPABASE_SERVICE_KEY = 'k'

const ADMIN = { name: 'Dario Arevalo', admin: true }
const LOCAL = { name: 'Local', funcion: ['local'], cuenta: 'zattia', acceso: {} }

async function llamar(method: 'GET' | 'POST', query: Fila, body?: Fila) {
  const { default: handler } = await import('../api/_pagos-recibidos.js')
  let status = 0
  let json: Record<string, unknown> = {}
  const res = {
    status(s: number) {
      status = s
      return res
    },
    json(j: Record<string, unknown>) {
      json = j
      return res
    },
    setHeader() {},
  }
  await handler({ method, query: { store: 'zattia', ...query }, body: body && { store: 'zattia', ...body } }, res)
  return { status, json }
}

beforeEach(() => {
  for (const k of Object.keys(tablas)) delete tablas[k]
})

describe('api/_pagos-recibidos.js con cuentas', () => {
  it('sin cuenta cargada: «no conectada», sin error', async () => {
    perfil = ADMIN
    const r = await llamar('GET', {})
    expect(r.status).toBe(200)
    expect(r.json.conectada).toBe(false)
  })

  it('verificar dice de quién es la llave y ⛔ guarda nada', async () => {
    perfil = ADMIN
    const r = await llamar('POST', {}, { action: 'verificar', token: 'APP_USR-aaa-111' })
    expect(r.json.nombre).toBe('ZATTIA (Dario Arevalo)')
    expect(tablas.mp_cuentas).toBeUndefined()
  })

  it('una llave que MP no reconoce no se guarda', async () => {
    perfil = ADMIN
    const r = await llamar('POST', {}, { action: 'cargar', token: 'APP_USR-zzz-999' })
    expect(r.status).toBe(400)
    expect(tablas.mp_cuentas).toBeUndefined()
  })

  it('cargar, leer, cambiar y volver: la llave ⛔ viaja nunca', async () => {
    perfil = ADMIN
    let r = await llamar('POST', {}, { action: 'cargar', token: 'APP_USR-aaa-111' })
    expect(r.status).toBe(200)
    expect(JSON.stringify(r.json)).not.toContain('APP_USR')

    r = await llamar('GET', {})
    expect(r.json.conectada).toBe(true)
    expect(r.json.total).toBe(111)
    expect(JSON.stringify(r.json)).not.toContain('APP_USR')
    expect(JSON.stringify(r.json)).not.toContain('x@y.com')

    await llamar('POST', {}, { action: 'cargar', token: 'APP_USR-bbb-222' })
    r = await llamar('GET', {})
    // El cambio fue hoy: hoy se busca en las dos.
    expect(r.json.total).toBe(333)
    expect((r.json.cuentas as { enUso: boolean; cuenta_id: number }[]).find((c) => c.enUso)?.cuenta_id).toBe(222)

    r = await llamar('POST', {}, { action: 'usar', cuenta_id: 111 })
    expect((r.json.cuentas as { enUso: boolean; cuenta_id: number }[]).find((c) => c.enUso)?.cuenta_id).toBe(111)
    expect(tablas.mp_cuenta_uso).toHaveLength(3)
  })

  it('🔴 la empleada ve los pagos, ⛔ el total ni las cuentas, y ⛔ puede cambiar nada', async () => {
    perfil = ADMIN
    await llamar('POST', {}, { action: 'cargar', token: 'APP_USR-aaa-111' })

    perfil = LOCAL
    let r = await llamar('GET', {})
    expect(r.status).toBe(200)
    expect((r.json.pagos as unknown[]).length).toBe(1)
    expect(r.json.total).toBeUndefined()
    expect(r.json.cuentas).toBeUndefined()

    r = await llamar('GET', { dia: '2026-09-01' })
    expect(r.status).toBe(403)

    r = await llamar('POST', {}, { action: 'cargar', token: 'APP_USR-bbb-222' })
    expect(r.status).toBe(403)
    expect(tablas.mp_cuentas).toHaveLength(1)
  })
})
