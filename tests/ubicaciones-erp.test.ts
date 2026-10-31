/**
 * UBICACIONES AL ERP (motor sql/066; erp-stunned §8.5, diseño aprobado por Bruno 31-oct). Lo que no se ve si falla:
 * - una línea cortada que sigue mostrando la ubicación vieja de GN (o la de otra línea de la misma base);
 * - una línea cortada que igual escribe en GN, o que da «guardado» sin que el ERP guarde;
 * - una línea sin cortar que deja de escribir GN, o que frena la carga porque el ERP falló;
 * - no saber si la línea cortó y elegir un camino igual.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { conUbicacionErp } from '../lib/ubicaciones/erp.core.js'

const fila = (product_id: number, size_id: number, sku: string, store_name: string, observation: string | null) =>
  ({ product_id, size_id, sku, store_name, observation })

describe('conUbicacionErp (la mezcla de los lectores)', () => {
  const filas = [
    fila(1, 11, 'TOP-S', 'Deposito ', '1-1'),        // Zattia (sin cortar): queda la de GN
    fila(2, 21, 'STU-1', 'Deposito ', '9-9'),        // Stunned (cortó): la del ERP
    fila(2, 22, 'STU-2', 'Deposito ', '9-9'),        // Stunned sin fila en el ERP: null, ⛔ la vieja
    fila(2, 21, 'STU-1', 'Local', 'viejo'),          // otro depósito: la del ERP de ESE depósito (no hay) ⇒ null
  ]
  const erp = { lineas: ['stunned'], filas: [{ deposito: 'deposito', product_id: 2, size_id: 21, texto: '4-4' }] }

  it('pisa sólo las filas de las líneas cortadas, por depósito × variante', () => {
    expect(conUbicacionErp(filas, 'zattia', erp).map((f) => f.observation)).toEqual(['1-1', '4-4', null, null])
  })
  it('ninguna línea cortada ⇒ las filas como vinieron (mismo array)', () => {
    expect(conUbicacionErp(filas, 'zattia', { lineas: [], filas: [] })).toBe(filas)
  })
  it('sin lo del ERP TIRA (⛔ un default que muestre GN callado)', () => {
    // @ts-expect-error a propósito
    expect(() => conUbicacionErp(filas, 'zattia', undefined)).toThrow()
  })
  it('BDI: el Depósito Minorista', () => {
    const r = conUbicacionErp([fila(5, 1, 'BDI-1', 'Deposito Minorista', 'x')], 'bdi',
      { lineas: ['bdi'], filas: [{ deposito: 'deposito_minorista', product_id: 5, size_id: 1, texto: '2-3' }] })
    expect(r[0].observation).toBe('2-3')
  })
})

// ── El handler que escribe (api/_observaciones.js) ──
const estado = vi.hoisted(() => ({ cortes: {} as Record<string, string>, linea: 'zattia', guardar: vi.fn(), cortesFalla: false }))
vi.mock('../api/_auth.js', () => ({ exigirUsuario: async () => ({ name: 'lorena', admin: true }), soloMismoOrigen: () => false }))
vi.mock('../api/_gn.js', () => ({ GN_TOKENS: { bdi: 't', zattia: 't' } }))
vi.mock('../lib/permisos.core.js', () => ({ puedeVerAlguna: () => true }))
vi.mock('../api/_erp-corte.js', () => ({
  conBase: async (_b: string, fn: (db: unknown) => unknown) => fn({ query: async () => ({ rows: [{ size_id: 13 }] }) }),
  cortesDe: async () => { if (estado.cortesFalla) throw new Error('base caída'); return estado.cortes },
  lineasDeProductos: async () => new Map([[1001, estado.linea]]),
}))
vi.mock('../motor/stock/ubicacion.mjs', () => ({ guardarUbicacion: (...a: unknown[]) => estado.guardar(...a) }))

const llamar = async (body: Record<string, unknown>) => {
  const { default: handler } = await import('../api/_observaciones.js')
  const out: { status?: number; body?: Record<string, unknown> } = {}
  const res = { status(s: number) { out.status = s; return this }, json(b: Record<string, unknown>) { out.body = b; return this }, setHeader() {} }
  await handler({ method: 'POST', body, headers: {} } as never, res as never)
  return out
}

describe('api/_observaciones.js: escritura doble y corte por línea', () => {
  let gn: ReturnType<typeof vi.fn>
  beforeEach(() => {
    estado.cortes = {}; estado.linea = 'zattia'; estado.cortesFalla = false
    estado.guardar = vi.fn(async () => ({ ok: true, variantes: 3, cambiadas: 3 }))
    let leido = ''
    gn = vi.fn(async (_url: string, opts?: RequestInit) => {
      if (opts?.method === 'PATCH') { leido = JSON.parse(String(opts.body)).observation ?? ''; return new Response('{}') }
      return new Response(JSON.stringify({ variantes: [{ size_name: 'S', stock_por_tienda: [{ inventory_id: 7, store_name: 'Deposito ', observation: leido }] }] }))
    })
    vi.stubGlobal('fetch', gn)
    vi.useFakeTimers({ shouldAdvanceTime: true, advanceTimeDelta: 1000 })
  })

  it('línea SIN cortar: escribe GN y también el ERP (con las variantes del espejo)', async () => {
    const r = await llamar({ marca: 'zattia', productId: 1001, observation: '3-4' })
    expect(r.body).toMatchObject({ ok: true, total: 1, erp: { linea: 'zattia', ok: true } })
    expect(gn.mock.calls.some(([, o]) => o?.method === 'PATCH')).toBe(true)
    expect(estado.guardar).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ linea: 'zattia', deposito: 'deposito', product_id: 1001, texto: '3-4', usuario: 'lorena', size_ids: [13] }))
  })
  it('línea SIN cortar y el ERP falla: GN igual se escribe y la carga da ok', async () => {
    estado.guardar = vi.fn(async () => { throw new Error('permission denied for table ubicacion') })
    const r = await llamar({ marca: 'zattia', productId: 1001, observation: '3-4' })
    expect(r.body).toMatchObject({ ok: true, erp: { ok: false } })
  })
  it('línea CORTADA (Stunned): sólo el ERP, ⛔ toca GN', async () => {
    estado.linea = 'stunned'; estado.cortes = { stunned: '2026-10-28T23:40:27.759Z' }
    const r = await llamar({ marca: 'zattia', productId: 1001, observation: '3-4' })
    expect(r.body).toMatchObject({ ok: true, total: 3, erp: { linea: 'stunned', soloErp: true } })
    expect(gn).not.toHaveBeenCalled()
  })
  it('línea CORTADA y el ERP ⛔ guarda: ok false (⛔ «guardado»)', async () => {
    estado.linea = 'stunned'; estado.cortes = { stunned: '2026-10-28T23:40:27.759Z' }
    estado.guardar = vi.fn(async () => ({ ok: false, error: { codigo: 'SIN_MIGRACION', mensaje: 'Falta la 066' } }))
    const r = await llamar({ marca: 'zattia', productId: 1001, observation: '3-4' })
    expect(r.body).toMatchObject({ ok: false, reintentable: true })
    expect(gn).not.toHaveBeenCalled()
  })
  it('un corte FUTURO todavía escribe GN', async () => {
    estado.linea = 'bdi'; estado.cortes = { bdi: '2099-01-01T00:00:00Z' }
    await llamar({ marca: 'bdi', productId: 1001, observation: '' })
    expect(gn).toHaveBeenCalled()
  })
  it('sin saber si cortó: 503 y ⛔ toca GN ni el ERP', async () => {
    estado.cortesFalla = true
    const r = await llamar({ marca: 'zattia', productId: 1001, observation: '3-4' })
    expect(r.status).toBe(503)
    expect(gn).not.toHaveBeenCalled()
    expect(estado.guardar).not.toHaveBeenCalled()
  })
})
