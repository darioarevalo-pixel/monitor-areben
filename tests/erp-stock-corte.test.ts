import { describe, expect, it, vi } from 'vitest'
import { refrescarStockDeCorte } from '../api/_erp-stock-corte.js'

/**
 * **Lo que entra por Ingresos en una línea cortada ⛔ espera a la madrugada** (Bruno, 3-nov): recalcula el libro en el motor y escribe en el espejo SÓLO esas variantes. Sin corte, nada.
 */
const FILAS = [
  { linea: 'bdi', product_id: 1, product_name: 'Nuevo', size_id: 11, size_name: 'S', store_name: 'Deposito Minorista', available_quantity: 5, sku: 'N-1', barcode: null },
  { linea: 'bdi', product_id: 2, product_name: 'Otro', size_id: 22, size_name: 'S', store_name: 'Local', available_quantity: 9, sku: 'O-2', barcode: null },
]
function montar({ corte = true, ok = true, tira = false }: { corte?: boolean, ok?: boolean, tira?: boolean } = {}) {
  const db = { query: vi.fn(async (sql: string) => (/erp_corte/.test(sql) ? { rows: corte ? [{ linea: 'bdi', instante: '2026-11-01T00:00:00Z' }] : [] } : { rows: FILAS })) }
  const upsert = vi.fn(async () => ({ error: null }))
  const sb = { from: vi.fn(() => ({ upsert })) }
  const registrar = vi.fn(async () => ({ cambios: 1 }))
  const fetchFn = vi.fn(async () => { if (tira) throw new Error('caído'); return { ok, status: ok ? 200 : 503 } })
  const deps = { conBase: (_m: string, fn: (d: typeof db) => unknown) => fn(db), sb, registrar, fetchFn, env: { ERP_LLAVE_MONITOR: 'm' } }
  return { db, upsert, registrar, fetchFn, deps: deps as never }
}

describe('refrescarStockDeCorte', () => {
  it('sin corte ⛔ recalcula ni escribe', async () => {
    const t = montar({ corte: false })
    expect(await refrescarStockDeCorte({ marca: 'bdi', skus: ['N-1'] }, t.deps)).toEqual({ corrio: false, motivo: 'sin_corte' })
    expect(t.fetchFn).not.toHaveBeenCalled()
    expect(t.upsert).not.toHaveBeenCalled()
  })
  it('sin códigos ⛔ abre la base', async () => {
    const t = montar()
    expect(await refrescarStockDeCorte({ marca: 'bdi', skus: [] }, t.deps)).toEqual({ corrio: false, motivo: 'nada' })
    expect(t.db.query).not.toHaveBeenCalled()
  })
  it('recalcula con la llave y escribe SÓLO esos códigos, sin la columna de la línea', async () => {
    const t = montar()
    const r = await refrescarStockDeCorte({ marca: 'bdi', skus: ['n-1 '] }, t.deps)
    expect(r).toEqual({ corrio: true, libro: true, filas: 1, unidades: 5 })
    const [url, init] = t.fetchFn.mock.calls[0] as unknown as [string, { headers: Record<string, string>, body: string }]
    expect(url).toContain('erp.arebensrl.com/api/eventos')
    expect(init.headers['x-erp-llave']).toBe('m')
    expect(JSON.parse(init.body)).toMatchObject({ tipo: 'libro', clave: 'bdi' })
    const escritas = (t.upsert.mock.calls[0] as unknown as [Array<Record<string, unknown>>])[0]
    expect(escritas.map((f) => f.sku)).toEqual(['N-1'])
    expect(escritas[0]).not.toHaveProperty('linea')
    expect(t.registrar).toHaveBeenCalledBefore(t.upsert)
  })
  it('🔴 el recálculo ⛔ contestó: se escribe lo que el libro tenga y se dice', async () => {
    for (const o of [{ ok: false }, { tira: true }]) {
      const t = montar(o)
      const r = await refrescarStockDeCorte({ marca: 'bdi', skus: ['N-1'] }, t.deps)
      expect(r).toMatchObject({ corrio: true, libro: false, filas: 1 })
    }
  })
  it('sin la llave ⛔ pide, y se dice', async () => {
    const t = montar()
    const r = await refrescarStockDeCorte({ marca: 'bdi', skus: ['N-1'] }, { ...(t.deps as object), env: {} } as never)
    expect(r).toMatchObject({ libro: false })
    expect(t.fetchFn).not.toHaveBeenCalled()
  })
  it('`recalcular: false`: sólo el espejo', async () => {
    const t = montar()
    expect(await refrescarStockDeCorte({ marca: 'bdi', skus: ['N-1'], recalcular: false }, t.deps)).toMatchObject({ libro: null, filas: 1 })
    expect(t.fetchFn).not.toHaveBeenCalled()
  })
  it('sin movimientos (el botón excepcional) ⛔ escribe', async () => {
    const t = montar()
    expect(await refrescarStockDeCorte({ marca: 'bdi', skus: ['SIN-MOV'] }, t.deps)).toMatchObject({ filas: 0, unidades: 0 })
    expect(t.upsert).not.toHaveBeenCalled()
  })
  it('🔴 lo que el espejo ⛔ tomó se dice como falla', async () => {
    const t = montar()
    t.upsert.mockResolvedValueOnce({ error: { message: 'x' } } as never)
    await expect(refrescarStockDeCorte({ marca: 'bdi', skus: ['N-1'] }, t.deps)).rejects.toThrow(/inventario/)
  })
})
