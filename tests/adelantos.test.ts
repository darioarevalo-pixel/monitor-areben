import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { adelantosPorEmpleado, nombreDelMes } from '@/lib/adelantos/core'
import type { Compromiso } from '@/lib/compromisos/core'

/**
 * Adelantos de sueldo (28-sep-2026). Lo que se fija:
 *
 *  1. La puerta que llama el dashboard (`adelantos-puente`) no pide sesión sino el SOBRE, y falla
 *     cerrada: sin secreto configurado no entra nadie.
 *  2. Devuelve sólo los confirmados de ese empleado, con el día en que entró la transferencia.
 *  3. La pantalla cruza con lo aplicado que manda el dashboard, y sin dashboard no inventa.
 */

// ── La puerta ────────────────────────────────────────────────────────────────
let filas: Record<string, unknown>[] = []
let filtros: Record<string, unknown> = {}
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => {
      const api: Record<string, unknown> = {
        select: () => api,
        eq: (c: string, v: unknown) => { filtros[c] = v; return api },
        then: (ok: (r: unknown) => void) => ok({
          data: filas.filter((f) => Object.entries(filtros).every(([c, v]) => f[c] === v)),
          error: null,
        }),
      }
      return api
    },
  }),
}))

function resFalso() {
  const r = {
    code: 0, body: null as Record<string, unknown> | null,
    setHeader() { return r }, status(c: number) { r.code = c; return r },
    json(b: unknown) { r.body = b as Record<string, unknown>; return r }, end() { return r },
  }
  return r
}

const SECRETO = 's'.repeat(40)
const EMP = '11111111-2222-3333-4444-555555555555'

async function llamar(headers: Record<string, string>, query: Record<string, string> = { empleado_id: EMP }) {
  const { default: handler } = await import('../api/_adelantos-puente.js')
  const res = resFalso()
  await handler({ method: 'GET', headers, query } as never, res as never)
  return res
}

beforeEach(() => {
  process.env.DASHBOARD_PUENTE_SECRET = SECRETO
  filtros = {}
  filas = [
    { origen: 'empleado', acreedor_id: EMP, estado: 'confirmado', operacion_id: 'op-1', monto_confirmado: '100000.00', fecha_acreditado: '2026-09-10', mes_sueldo: '2026-09', cliente_nombre: 'Nazarena', cliente_id: '9' },
    { origen: 'empleado', acreedor_id: EMP, estado: 'prometido', operacion_id: 'op-2', monto_confirmado: null, fecha_acreditado: null, mes_sueldo: '2026-09', cliente_nombre: 'Otra', cliente_id: null },
    { origen: 'dashboard', acreedor_id: EMP, estado: 'confirmado', operacion_id: 'op-3', monto_confirmado: 5, fecha_acreditado: null, mes_sueldo: null, cliente_nombre: 'X', cliente_id: null },
  ]
})
afterEach(() => { delete process.env.DASHBOARD_PUENTE_SECRET })

describe('la puerta que llama el dashboard', () => {
  it('sin sobre no entra', async () => {
    expect((await llamar({})).code).toBe(401)
  })

  it('con un sobre equivocado no entra', async () => {
    expect((await llamar({ 'x-puente-auth': 'z'.repeat(40) })).code).toBe(401)
  })

  it('⛔ falla cerrada: sin secreto configurado no entra ni el sobre vacío', async () => {
    delete process.env.DASHBOARD_PUENTE_SECRET
    expect((await llamar({ 'x-puente-auth': '' })).code).toBe(401)
  })

  it('devuelve sólo los adelantos confirmados de ese empleado, con el día y el mes', async () => {
    const res = await llamar({ 'x-puente-auth': SECRETO })
    expect(res.code).toBe(200)
    expect(res.body?.adelantos).toEqual([
      { id: 'op-1', monto: 100000, fecha: '2026-09-10', mes: '2026-09', cliente_nombre: 'Nazarena', cliente_id: '9' },
    ])
  })

  it('sin un id de empleado válido no consulta', async () => {
    expect((await llamar({ 'x-puente-auth': SECRETO }, { empleado_id: 'cualquiera' })).code).toBe(400)
  })
})

// ── Las cuentas de la pantalla ───────────────────────────────────────────────
const comp = (x: Partial<Compromiso>): Compromiso => ({
  id: 'c', origen: 'empleado', objetivo_id: null, acreedor_id: 'emp-1', acreedor_nombre: 'Candela Luis',
  cuenta_alias: null, cuenta_cbu: null, cuenta_banco: null, cuenta_titular: null,
  cliente_id: null, cliente_store: 'bdi', cliente_nombre: 'Nazarena', cliente_telefono: null,
  monto: 100000, monto_confirmado: null, estado: 'prometido', fecha_prometida: null, notas: null,
  operacion_id: 'op', pagos_dashboard: null, viene_de: null, creado_en: '2026-09-01', creado_por: null,
  confirmado_en: null, confirmado_por: null, mes_sueldo: '2026-09', fecha_acreditado: null, ...x,
})

describe('adelantosPorEmpleado', () => {
  const compromisos = [
    comp({ id: 'a', estado: 'confirmado', monto_confirmado: 100000, operacion_id: 'op-a', fecha_acreditado: '2026-09-10' }),
    comp({ id: 'b', estado: 'confirmado', monto_confirmado: 80000, operacion_id: 'op-b', fecha_acreditado: '2026-09-18' }),
    comp({ id: 'c', estado: 'prometido', monto: 50000 }),
    comp({ id: 'd', estado: 'cancelado', monto: 999 }),
    comp({ id: 'e', origen: 'dashboard', acreedor_id: 'ac', estado: 'confirmado', monto_confirmado: 1 }),
  ]

  it('antes de liquidar: todo lo confirmado está sin liquidar, y lo pedido va aparte', () => {
    const [g] = adelantosPorEmpleado(compromisos, [])
    expect(g.nombre).toBe('Candela Luis')
    expect(g.pendiente).toBe(180000)
    expect(g.pedido).toBe(50000)
    // El más reciente arriba.
    expect(g.lineas.map((l) => l.compromiso.id)).toEqual(['b', 'a'])
  })

  it('después de liquidar: lo aplicado sale del dashboard, y lo que sobró queda pendiente', () => {
    const [g] = adelantosPorEmpleado(compromisos, [
      { adelanto_id: 'op-a', monto: 100000, mes: '2026-09' },
      { adelanto_id: 'op-b', monto: 30000, mes: '2026-09' },
    ])
    expect(g.pendiente).toBe(50000)
    const b = g.lineas.find((l) => l.compromiso.id === 'b')!
    expect(b.aplicado).toBe(30000)
    expect(b.pendiente).toBe(50000)
    expect(b.meses).toEqual(['2026-09'])
  })

  it('los acreedores y las cuentas manuales no entran', () => {
    expect(adelantosPorEmpleado([comp({ origen: 'dashboard' })], [])).toEqual([])
  })
})

describe('los meses', () => {
  it('el nombre lleva el año sólo si no es el de hoy', () => {
    expect(nombreDelMes('2026-09', '2026-09-28')).toBe('septiembre')
    expect(nombreDelMes('2027-01', '2026-12-31')).toBe('enero 2027')
  })
})
