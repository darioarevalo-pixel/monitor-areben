import { describe, expect, it } from 'vitest'
import { motivoParaFrenar, planDeStock } from '@/lib/sync-tn/stock-plan.core.js'

// El freno del cron diario de stock de Stunned: lo único que separa un inventario roto de la tienda en 0.
const val = (n: number) => Array.from({ length: n }, (_, i) => ({ sku: `STU-${i}`, tn_product_id: 1, tn_variant_id: i }))
const tn = (n: number, stock = 2) => [{ variantes: Array.from({ length: n }, (_, i) => ({ sku: `STU-${i}`, stock })) }]
const inv = (skus: number[], q = 2) => skus.map((i) => ({ sku: `STU-${i}`, product_name: 'X', available_quantity: q }))

describe('planDeStock', () => {
  it('suma las ubicaciones de GN y escribe sólo lo distinto', () => {
    const p = planDeStock(val(2), [...inv([0], 1), ...inv([0], 1), ...inv([1], 5)], tn(2))
    expect(p.freno).toBeNull()
    expect(p.candidatas.map((r: { sku: string; gn: number }) => [r.sku, r.gn])).toEqual([['STU-1', 5]])
  })

  it('frena si el inventario vino vacío', () => {
    expect(planDeStock(val(20), [], tn(20)).freno).toMatch(/VACÍO/)
  })

  it('frena si un inventario a medias pondría en 0 a muchas', () => {
    const p = planDeStock(val(40), inv([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]), tn(40))
    expect(p.freno).toMatch(/Pondría en 0 30 de 40/)
  })

  it('deja pasar unas pocas agotadas en el día', () => {
    const todas = Array.from({ length: 40 }, (_, i) => i).filter((i) => i >= 5)
    expect(planDeStock(val(40), inv(todas), tn(40)).freno).toBeNull()
  })

  it('el tope es proporcional: 6 de 10 frena, 6 de 40 no', () => {
    const filas = (n: number, ceros: number) => Array.from({ length: n }, (_, i) => ({ sku: `${i}`, gn: i < ceros ? 0 : 2, tn: 2 }))
    expect(motivoParaFrenar(filas(10, 6), { filasInventario: 4 })).not.toBeNull()
    expect(motivoParaFrenar(filas(40, 6), { filasInventario: 34 })).toBeNull()
  })
})
