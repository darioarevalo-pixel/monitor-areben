import { describe, it, expect } from 'vitest'
// `.core.js` sin tipos propios: lo importan los syncs y `scripts/erp-inventario-espejo.mjs`, que corren en Node pelado.
import { esDeLineas, planInventarioErp, SQL_INVENTARIO_LINEAS } from '../lib/erp/inventario-espejo.core.js'

const k = (product_id: number, size_id: number, store_name: string, sku: string | null, available_quantity = 1, linea?: string) =>
  ({ product_id, size_id, store_name, sku, available_quantity, ...(linea ? { linea } : {}) })

describe('ERP: stock de las líneas cortadas en el espejo de inventario', () => {
  it('la línea de una fila la dice `lineaDe`: en BDI toda fila es BDI (con o sin código), en Zattia separa `STU`', () => {
    expect(esDeLineas('bdi', ['bdi'], { sku: null })).toBe(true)
    expect(esDeLineas('bdi', ['bdi'], { sku: 'FUNDA-1' })).toBe(true)
    expect(esDeLineas('bdi', [], { sku: 'FUNDA-1' })).toBe(false)
    expect(esDeLineas('zattia', ['stunned'], { sku: 'STU-A' })).toBe(true)
    expect(esDeLineas('zattia', ['stunned'], { sku: 'ZAT-A' })).toBe(false)
    expect(esDeLineas('zattia', ['stunned'], { sku: null })).toBe(false)
    expect(esDeLineas('zattia', ['zattia', 'stunned'], { sku: null })).toBe(true)
  })

  it('el SQL pide las líneas por parámetro y trae la línea de cada fila', () => {
    expect(SQL_INVENTARIO_LINEAS).toContain('m.linea = any($1::text[])')
    expect(SQL_INVENTARIO_LINEAS).toContain('m.linea as linea')
    expect(SQL_INVENTARIO_LINEAS).toContain("when 'deposito_minorista' then 'Deposito Minorista'")
  })

  it('⛔ sin la lista de líneas cortadas tira (⛔ un default callado)', () => {
    // @ts-expect-error a propósito
    expect(() => planInventarioErp('bdi', undefined, [], [])).toThrow(/líneas cortadas/)
  })

  it('BDI: escribe también las filas SIN código (en BDI son BDI) y sin la columna `linea`', () => {
    const libro = [k(1, 1, 'Local', null, 2, 'bdi'), k(1, 2, 'Deposito Minorista', 'F-2', 5, 'bdi')]
    const p = planInventarioErp('bdi', ['bdi'], libro, [])
    expect(p.upserts).toHaveLength(2)
    expect(p.sinSku).toBe(0)
    expect(p.upserts.every((r: Record<string, unknown>) => !('linea' in r))).toBe(true)
  })

  it('Zattia con Stunned cortada: ⛔ toca una fila de Zattia del espejo, aunque tenga stock y el libro no la traiga', () => {
    const libro = [k(900, 1, 'Local', 'STU-A', 3, 'stunned')]
    const espejo = [k(900, 1, 'Local', 'STU-A'), k(5, 1, 'Local', 'ZAT-A', 4), k(6, 1, 'Local', null, 2), k(901, 1, 'Local', 'STU-VIEJA', 1)]
    const p = planInventarioErp('zattia', ['stunned'], libro, espejo)
    expect(p.borrar.map((r) => r.sku)).toEqual(['STU-VIEJA'])
    expect(p.espejoDeLineas).toBe(2)
  })

  it('Zattia con las dos cortadas: una fila del libro de Stunned SIN código ⛔ se escribe (en el espejo diría Zattia)', () => {
    const libro = [k(900, 1, 'Local', null, 3, 'stunned'), k(5, 1, 'Local', null, 1, 'zattia')]
    const p = planInventarioErp('zattia', ['zattia', 'stunned'], libro, [])
    expect(p.upserts).toEqual([k(5, 1, 'Local', null, 1)])
    expect(p.sinSku).toBe(1)
  })

  it('una fila del libro de una línea que NO cortó ⛔ se escribe', () => {
    const p = planInventarioErp('zattia', ['stunned'], [k(5, 1, 'Local', 'ZAT-A', 1, 'zattia')], [])
    expect(p.upserts).toEqual([])
  })

  it('⛔ no saca nada si serían más de la mitad de las filas con stock de esas líneas', () => {
    const espejo = [k(1, 1, 'Local', 'A', 2), k(2, 1, 'Local', 'B', 2), k(3, 1, 'Local', 'C', 2)]
    const p = planInventarioErp('bdi', ['bdi'], [k(1, 1, 'Local', 'A', 2, 'bdi')], espejo)
    expect(p.borrar).toEqual([])
    expect(p.frenoLimpieza).toMatch(/sacaría 2 de 3/)
  })
})
