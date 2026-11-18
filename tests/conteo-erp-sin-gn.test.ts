import { describe, expect, it } from 'vitest'
import { ajustableEnVivo, partirExcel } from '@/lib/erp/conteo-erp.core.js'
import { agruparVivo, calcularAjuste, conParteErp, filasExcel, separarYaAjustados } from '@/lib/conteo-deposito/core'

/* eslint-disable @typescript-eslint/no-explicit-any */
// Una prenda NACIDA en el ERP (⛔ existe en GN ⇒ sin `inventory_id`), y lo mismo para TODAS desde la baja de GN de Zattia (24-nov).
const delErp = (pid: number, sid: number, libro: number): any => ({ inventory_id: null, product_id: pid, product_name: `P${pid}`, size_id: sid, size_name: 'M', store_name: 'Deposito ', sku: `STU-X-${pid}`, barcode: '', available_quantity: libro, fuente: 'erp', linea: 'stunned' })
const deGn = (pid: number, sid: number, inv: number, q: number): any => ({ inventory_id: inv, product_id: pid, product_name: `P${pid}`, size_id: sid, size_name: 'M', store_name: 'Deposito ', sku: `RMI-${pid}`, barcode: 'b', available_quantity: q, fuente: 'vivo' })

/** El estado de un conteo terminado: `contado` por vid, contra el vivo de cuando se abrió. */
function contado(vivo: Record<string, any>, cuentas: Record<string, number>): any {
  const state: any = {}
  for (const [vid, n] of Object.entries(cuentas)) {
    const r = vivo[vid]
    const pid = String(r.product_id)
    state[pid] ||= { estado: 'terminado', contado: {}, snap: {}, dif: {} }
    state[pid].contado[vid] = n
    state[pid].snap[vid] = r.available_quantity
    state[pid].dif[vid] = n - r.available_quantity
  }
  return state
}

describe('conteo de una prenda sin `inventory_id` de GN (nacida en el ERP o después de la baja)', () => {
  it('ajustableEnVivo: la del libro siempre; la de GN sólo con inventory_id', () => {
    expect(ajustableEnVivo(delErp(1, 1, 3))).toBe(true)
    expect(ajustableEnVivo(delErp(1, 1, 3), { inventory_id: null })).toBe(true)
    expect(ajustableEnVivo(deGn(2, 1, 77, 3), { inventory_id: 77 })).toBe(true)
    expect(ajustableEnVivo({ ...deGn(2, 1, 77, 3), inventory_id: null, fuente: 'espejo' })).toBe(false)
    expect(ajustableEnVivo(deGn(2, 1, 77, 3), { inventory_id: null })).toBe(false)
  })

  it('va al AJUSTE DEL ERP con su variante, ⛔ a «revisar a mano» ni al Excel', () => {
    const vivo = { '1_1': delErp(1, 1, 3), '5_1': delErp(5, 1, 0), '2_1': deGn(2, 1, 77, 4) }
    const prods = agruparVivo(vivo)
    const state = contado(vivo, { '1_1': 1, '5_1': 2, '2_1': 6 })
    const pv = conParteErp(calcularAjuste(prods, state, vivo, 'Deposito ', 'zattia', null), vivo, 'ref-12345678')
    expect(pv.missing).toEqual([])
    expect(pv.erp?.renglones.map((r: any) => [r.product_id, r.size_id, r.dif])).toEqual([[1, 1, -2], [5, 1, 2]])
    expect(filasExcel(pv).map((r) => r.inventory_id)).toEqual([77])
  })

  it('partirExcel encuentra la fila por variante aunque ⛔ tenga inventory_id', () => {
    const vivo = { '1_1': delErp(1, 1, 3) }
    const r = partirExcel([{ inventory_id: null, product_id: 1, size_id: 1, dif: -1 }], vivo)
    expect(r.excel).toEqual([])
    expect(r.erp).toEqual([{ product_id: 1, size_id: 1, sku: 'STU-X-1', barcode: null, dif: -1, linea: 'stunned' }])
  })

  it('«ya ajustado» de UNA del ERP ⛔ se lleva a las demás sin inventory_id', () => {
    const vivo = { '1_1': delErp(1, 1, 3), '5_1': delErp(5, 1, 0) }
    const prods = agruparVivo(vivo)
    const state = contado(vivo, { '1_1': 1, '5_1': 2 })
    const pv = calcularAjuste(prods, state, vivo, 'Deposito ', 'zattia', null)
    // La 1 ya quedó en lo contado (el vivo de ahora = 1); la 5 ⛔.
    const ahora = { ...pv, rows: pv.rows.map((r) => (r.product_id === 1 ? { ...r, vivo: 1 } : r)) }
    const sep = separarYaAjustados(ahora)
    expect(sep.yaAjustados?.map((r) => r.product_id)).toEqual([1])
    expect(sep.rows.map((r) => r.product_id)).toEqual([5])
  })
})
