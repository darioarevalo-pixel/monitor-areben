import { describe, it, expect } from 'vitest'
// `.core.js` sin tipos propios: los importan los syncs y `scripts/stunned-erp-inventario.mjs`, que corren en Node pelado.
import { esFilaStunned, planDeInventario, SQL_INVENTARIO_STUNNED } from '../lib/stunned/inventario-erp.core.js'

/** El stock de Stunned del espejo es EXACTAMENTE el libro: se escribe lo del libro y se saca lo colgado de GN. */
describe('Stunned: stock del ERP en el espejo de inventario', () => {
  const k = (product_id: number, size_id: number, store_name: string, sku: string | null, available_quantity = 1) =>
    ({ product_id, size_id, store_name, sku, available_quantity })
  const skus = (filas: Array<{ sku?: string | null }>) => filas.map((r) => r.sku)

  it('esFilaStunned usa la regla de línea del monitor (prefijo STU), ⛔ toca Zattia', () => {
    expect(esFilaStunned({ sku: 'STU-REM-0015-M' })).toBe(true)
    expect(esFilaStunned({ sku: 'ZAT-0001-M' })).toBe(false)
    expect(esFilaStunned({ sku: null })).toBe(false)
  })

  it('el depósito del libro sale con el nombre de GN en Zattia: `Deposito ` CON el espacio (lo que buscan los lectores)', () => {
    expect(SQL_INVENTARIO_STUNNED).toContain("when 'deposito' then 'Deposito '")
    expect(SQL_INVENTARIO_STUNNED).toContain("when 'local' then 'Local'")
  })

  it('escribe el libro y saca las filas STU colgadas CON stock', () => {
    const libro = [k(900, 1, 'Local', 'STU-A', 3), k(900, 2, 'Deposito ', 'STU-B', 0)]
    const espejo = [k(900, 1, 'Local', 'STU-A'), k(901, 1, 'Local', 'STU-VIEJA'), k(900, 2, 'Deposito ', 'STU-B'), k(902, 1, 'Local', 'STU-C')]
    const p = planDeInventario(libro, espejo)
    expect(skus(p.upserts)).toEqual(['STU-A', 'STU-B'])
    expect(skus(p.borrar)).toEqual(['STU-VIEJA', 'STU-C'])
    expect(p.frenoLimpieza).toBeNull()
  })

  it('las colgadas EN 0 se dejan (no mienten y muestran el talle) y no cuentan para el tope', () => {
    const libro = [k(900, 1, 'Local', 'STU-A', 3)]
    const espejo = [k(900, 1, 'Local', 'STU-A'), k(901, 1, 'Local', 'STU-VIEJA', 2), k(902, 1, 'Local', 'STU-CERO', 0),
      k(903, 1, 'Deposito ', 'STU-CERO2', 0), k(904, 1, 'Local', 'STU-F'), k(905, 1, 'Local', 'STU-G')]
    const p = planDeInventario([...libro, k(904, 1, 'Local', 'STU-F'), k(905, 1, 'Local', 'STU-G')], espejo)
    expect(skus(p.borrar)).toEqual(['STU-VIEJA'])
    expect(p.frenoLimpieza).toBeNull()
  })

  it('el caso del 29-oct: la fila `Deposito` SIN espacio sale (con o sin stock) y la de GN se pisa con el libro', () => {
    const libro = [k(900, 1, 'Deposito ', 'STU-A', 2), k(900, 2, 'Local', 'STU-B', 1), k(900, 3, 'Local', 'STU-C', 1)]
    const espejo = [k(900, 1, 'Deposito ', 'STU-A', 3), k(900, 1, 'Deposito', 'STU-A', 2), k(900, 4, 'Deposito', 'STU-X', 0),
      k(900, 2, 'Local', 'STU-B'), k(900, 3, 'Local', 'STU-C')]
    const p = planDeInventario(libro, espejo)
    expect(p.upserts.find((r: { store_name: string }) => r.store_name === 'Deposito ')?.available_quantity).toBe(2)
    expect(p.borrar.map((r: { store_name: string; sku?: string | null }) => `${r.store_name}|${r.sku}`)).toEqual(['Deposito|STU-A', 'Deposito|STU-X'])
    expect(p.frenoLimpieza).toBeNull()
  })

  it('una fila del libro sin SKU no se escribe y se cuenta', () => {
    const p = planDeInventario([k(900, 1, 'Local', null), k(900, 2, 'Local', 'STU-B')], [])
    expect(p.upserts).toHaveLength(1)
    expect(p.sinSku).toBe(1)
  })

  it('⛔ no saca nada si serían más de la mitad de las filas STU con stock (libro vacío o roto)', () => {
    const espejo = [k(1, 1, 'Local', 'STU-1'), k(2, 1, 'Local', 'STU-2'), k(3, 1, 'Local', 'STU-3'), k(4, 1, 'Local', 'STU-4', 0)]
    const p = planDeInventario([], espejo)
    expect(p.borrar).toEqual([])
    expect(p.frenoLimpieza).toMatch(/3 de 3/)
  })
})
