import { describe, it, expect } from 'vitest'
// `.core.js` sin tipos propios: los importan los syncs y `scripts/stunned-erp-inventario.mjs`, que corren en Node pelado.
import { esFilaStunned, planDeInventario } from '../lib/stunned/inventario-erp.core.js'

/** El stock de Stunned del espejo es EXACTAMENTE el libro: se escribe lo del libro y se saca lo colgado de GN. */
describe('Stunned: stock del ERP en el espejo de inventario', () => {
  const k = (product_id: number, size_id: number, store_name: string, sku: string | null, available_quantity = 1) =>
    ({ product_id, size_id, store_name, sku, available_quantity })

  it('esFilaStunned usa la regla de línea del monitor (prefijo STU), ⛔ toca Zattia', () => {
    expect(esFilaStunned({ sku: 'STU-REM-0015-M' })).toBe(true)
    expect(esFilaStunned({ sku: 'ZAT-0001-M' })).toBe(false)
    expect(esFilaStunned({ sku: null })).toBe(false)
  })

  it('escribe el libro y saca las filas STU que el libro ya no tiene', () => {
    const libro = [k(900, 1, 'Local', 'STU-A', 3), k(900, 2, 'Deposito', 'STU-B', 0)]
    const espejo = [k(900, 1, 'Local', 'STU-A'), k(901, 1, 'Local', 'STU-VIEJA'), k(900, 2, 'Deposito', 'STU-B'), k(902, 1, 'Local', 'STU-C')]
    const p = planDeInventario(libro, espejo)
    expect(p.upserts.map((r: { sku: string }) => r.sku)).toEqual(['STU-A', 'STU-B'])
    expect(p.borrar.map((r: { sku?: string | null }) => r.sku)).toEqual(['STU-VIEJA', 'STU-C'])
    expect(p.frenoBorrado).toBeNull()
  })

  it('una fila del libro sin SKU no se escribe y se cuenta', () => {
    const p = planDeInventario([k(900, 1, 'Local', null), k(900, 2, 'Local', 'STU-B')], [])
    expect(p.upserts).toHaveLength(1)
    expect(p.sinSku).toBe(1)
  })

  it('⛔ no borra si habría que sacar más de la mitad de las filas STU (libro vacío o roto)', () => {
    const espejo = [k(1, 1, 'Local', 'STU-1'), k(2, 1, 'Local', 'STU-2'), k(3, 1, 'Local', 'STU-3')]
    const p = planDeInventario([], espejo)
    expect(p.borrar).toEqual([])
    expect(p.frenoBorrado).toMatch(/3 de 3/)
  })
})
