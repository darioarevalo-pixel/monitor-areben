import { describe, it, expect, vi, afterEach } from 'vitest'
import { CAMPOS_INVENTARIO, CAMPOS_PRODUCTOS, claveInventario, claveProducto, diaAR, filasQueCambian, ventasRecientes } from '@/lib/erp/espejo-vivo.core.js'
import handler from '../api/_espejo-vivo.js'

describe('filasQueCambian (la vuelta de 10 minutos escribe sólo lo distinto)', () => {
  const inv = (q: number, extra = {}) => ({ product_id: 1, size_id: 2, store_name: 'Local', product_name: 'Remera', size_name: 'M', sku: 'B-1', barcode: '0779', available_quantity: q, ...extra })

  it('igual al espejo ⇒ ⛔ se escribe; otra cantidad o fila nueva ⇒ se escribe', () => {
    const espejo = [inv(3)]
    expect(filasQueCambian([inv(3)], espejo, claveInventario, CAMPOS_INVENTARIO)).toEqual([])
    expect(filasQueCambian([inv(2)], espejo, claveInventario, CAMPOS_INVENTARIO)).toEqual([inv(2)])
    const otra = inv(0, { store_name: 'Deposito ' })
    expect(filasQueCambian([inv(3), otra], espejo, claveInventario, CAMPOS_INVENTARIO)).toEqual([otra])
  })

  it('🔴 el nombre o el código que cambiaron también cuentan (⛔ sólo la cantidad)', () => {
    expect(filasQueCambian([inv(3, { product_name: 'Remera lisa' })], [inv(3)], claveInventario, CAMPOS_INVENTARIO)).toHaveLength(1)
    expect(filasQueCambian([inv(3, { sku: 'B-2' })], [inv(3)], claveInventario, CAMPOS_INVENTARIO)).toHaveLength(1)
  })

  it('un precio «12000.00» de la base es el mismo 12000; una fecha con otro formato, el mismo instante', () => {
    const motor = { id: 5, name: 'X', category: null, retailer_price: 12000, wholesaler_price: 0, unit_cost: 0, active: true, updated_at: '2026-11-23T20:00:00.000Z' }
    const espejo = { id: '5', name: 'X', category: null, retailer_price: '12000.00', wholesaler_price: 0, unit_cost: '0', active: true, updated_at: '2026-11-23T20:00:00+00:00' }
    expect(filasQueCambian([motor], [espejo], claveProducto, CAMPOS_PRODUCTOS)).toEqual([])
    expect(filasQueCambian([{ ...motor, retailer_price: 13000 }], [espejo], claveProducto, CAMPOS_PRODUCTOS)).toHaveLength(1)
  })

  it('🔴 la fecha SIN zona del espejo (`…20:00:00`) es UTC, ⛔ la hora de la máquina (los 545 de BDI «cambiaban» siempre)', () => {
    const motor = { id: 5, updated_at: '2026-10-15T17:10:33.609Z' }
    expect(filasQueCambian([motor], [{ id: 5, updated_at: '2026-10-15T17:10:33.609' }], claveProducto, ['updated_at'])).toEqual([])
    expect(filasQueCambian([motor], [{ id: 5, updated_at: '2026-10-15T17:10:34' }], claveProducto, ['updated_at'])).toHaveLength(1)
  })

  it('sin campos TIRA (⛔ «todo igual» callado)', () => {
    expect(() => filasQueCambian([], [], claveProducto, [])).toThrow(/campos/)
  })
})

describe('ventasRecientes', () => {
  const plan = {
    ventas: [
      { id: 1_000_000_001, date_sale: '2026-11-10' },  // vieja, ya está
      { id: 1_000_000_002, date_sale: '2026-11-10' },  // vieja, el espejo ⛔ la tiene
      { id: 1_000_000_003, date_sale: '2026-11-23' },  // de hoy, ya está
    ],
    detalles: [{ id: 1_000_000_010, sale_id: 1_000_000_001 }, { id: 1_000_000_011, sale_id: 1_000_000_002 }, { id: 1_000_000_012, sale_id: 1_000_000_003 }],
    sacarVentas: [1_000_000_009], sacarDetalles: [1_000_000_019], freno: null,
  }

  it('las que faltan y las de `desde` en adelante, con sus renglones; lo que se saca, entero', () => {
    const r = ventasRecientes(plan, [1_000_000_001, 1_000_000_003], '2026-11-22')
    expect(r.ventas.map((v) => v.id)).toEqual([1_000_000_002, 1_000_000_003])
    expect(r.detalles.map((d) => d.id)).toEqual([1_000_000_011, 1_000_000_012])
    expect(r.sacarVentas).toEqual([1_000_000_009])
    expect(r.sacarDetalles).toEqual([1_000_000_019])
  })

  it('diaAR: el día de Argentina (UTC−3), ⛔ el de UTC', () => {
    expect(diaAR(new Date('2026-11-24T02:00:00Z'))).toBe('2026-11-23')
    expect(diaAR(new Date('2026-11-24T02:00:00Z'), 1)).toBe('2026-11-22')
  })
})

describe('handler (lo pide el motor cuando el libro se mueve)', () => {
  afterEach(() => vi.unstubAllEnvs())
  const res = () => {
    const r = { code: 0, body: null as null | { bases: Record<string, { lineas?: string[], error?: string }> }, status(c: number) { r.code = c; return r }, json(b: unknown) { r.body = b as typeof r.body; return r } }
    return r
  }
  const req = (headers: Record<string, string>, query: Record<string, string> = {}, method = 'POST') =>
    ({ method, query: { recurso: 'espejo-vivo', tarea: 'copiar', ...query }, headers })

  it('🔴 sin llaves está CERRADO (503); otra llave 401; otra tarea o base 400 — y ⛔ copia', async () => {
    const copiar = vi.fn()
    vi.stubEnv('ERP_LLAVE_MONITOR', ''); vi.stubEnv('CRON_SECRET', '')
    const r = res(); await handler(req({ 'x-erp-llave': 'x' }), r, { copiar }); expect(r.code).toBe(503)
    vi.stubEnv('ERP_LLAVE_MONITOR', 'la-llave')
    const r2 = res(); await handler(req({ 'x-erp-llave': 'otra' }), r2, { copiar }); expect(r2.code).toBe(401)
    const r3 = res(); await handler(req({ 'x-erp-llave': 'la-llave' }, { tarea: 'otra' }), r3, { copiar }); expect(r3.code).toBe(400)
    const r4 = res(); await handler(req({ 'x-erp-llave': 'la-llave' }, { base: 'stunned' }), r4, { copiar }); expect(r4.code).toBe(400)
    expect(copiar).not.toHaveBeenCalled()
  })

  it('con la llave del motor y `base`, copia SÓLO esa base', async () => {
    vi.stubEnv('ERP_LLAVE_MONITOR', 'la-llave')
    const copiar = vi.fn(async () => ({ lineas: ['zattia', 'stunned'], freno: null }))
    const r = res(); await handler(req({ 'x-erp-llave': 'la-llave' }, { base: 'zattia' }), r, { copiar })
    expect(r.code).toBe(200)
    expect(copiar.mock.calls).toEqual([['zattia']])
  })

  it('🔴 a mano (GET con CRON_SECRET) copia las dos; una que falla da 500 y la otra se copia igual', async () => {
    vi.stubEnv('ERP_LLAVE_MONITOR', 'la-llave'); vi.stubEnv('CRON_SECRET', 'el-bueno')
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const copiar = vi.fn(async (b: string) => { if (b === 'zattia') throw new Error('motor caído'); return { lineas: ['bdi'], freno: null } })
    const r = res(); await handler(req({ authorization: 'Bearer el-bueno' }, {}, 'GET'), r, { copiar })
    expect(copiar).toHaveBeenCalledTimes(2)
    expect(r.code).toBe(500)
    expect(r.body!.bases.bdi.lineas).toEqual(['bdi'])
    expect(r.body!.bases.zattia.error).toMatch(/motor caído/)
  })

  it('un freno (p. ej. la limpieza del stock) también da 500', async () => {
    vi.stubEnv('ERP_LLAVE_MONITOR', 'la-llave')
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const r = res(); await handler(req({ 'x-erp-llave': 'la-llave' }, { base: 'bdi' }), r, { copiar: async () => ({ freno: 'sacaría 900 de 1000' }) })
    expect(r.code).toBe(500)
  })
})
