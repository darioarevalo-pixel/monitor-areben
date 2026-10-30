import { describe, expect, it } from 'vitest'
import { lineasDeVentasGN } from '../api/_erp.js'

/** Un supabase-js de mentira: `from(t).select().in(col, ids).order().range()` contesta las filas de `t` con `col` en `ids`. */
const base = (tablas: Record<string, Record<string, unknown>[]>) => ({
  from: (t: string) => {
    let filtro: (r: Record<string, unknown>) => boolean = () => true
    const q = {
      select: () => q,
      order: () => q,
      in: (col: string, ids: unknown[]) => { const set = new Set(ids.map(String)); filtro = (r) => set.has(String(r[col])); return q },
      range: async (a: number, b: number) => ({ data: (tablas[t] || []).filter(filtro).slice(a, b + 1), error: null }),
    }
    return q
  },
})

describe('Facturación: la línea de cada venta de GN de Zattia (Bruno, 30-oct)', () => {
  it('de Stunned sólo si TODOS sus renglones son STU (o sin SKU con proveedor STUNNED); la mixta y la vacía, de Zattia', async () => {
    const b = base({
      venta_detalles: [
        { id: 1, sale_id: 10, product_id: 1 }, { id: 2, sale_id: 10, product_id: 2 }, // STU + sin SKU de STUNNED
        { id: 3, sale_id: 11, product_id: 1 }, { id: 4, sale_id: 11, product_id: 3 }, // mixta
        { id: 5, sale_id: 12, product_id: 3 },
      ],
      productos: [{ id: 1, sku: 'STU-REM-1', proveedor: null }, { id: 2, sku: null, proveedor: 'STUNNED' }, { id: 3, sku: 'ZAT-9', proveedor: 'X' }],
    })
    const m = await lineasDeVentasGN(b, [10, '11', 12, 13, 'uuid-no'])
    expect(Object.fromEntries(m)).toEqual({ 10: 'stunned', 11: 'zattia', 12: 'zattia', 13: 'zattia' })
  })
})
