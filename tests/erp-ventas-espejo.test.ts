import { describe, it, expect } from 'vitest'
import { ID_DESDE_ERP, planVentasErp, SQL_VENTAS_ERP, SQL_DETALLES_ERP } from '../lib/erp/ventas-espejo.core.js'
import { sumarVentasDelErp } from '../lib/stunned/ventas-erp.core.js'
import { ventaPorLinea } from '../lib/memo/foto.core.js'

const COLS = { ventas: ['id', 'date_sale', 'total_price', 'channel'], venta_detalles: ['id', 'sale_id', 'product_id', 'quantity', 'total'] }
const E = (n: number) => ID_DESDE_ERP + n

describe('ventas del ERP al espejo: el plan', () => {
  it('copia las del ERP recortadas a las columnas que tiene la tabla del espejo (Zattia tiene menos)', () => {
    const p = planVentasErp(
      { ventas: [{ id: E(1), date_sale: '2026-11-16', total_price: '45990', channel: 'Mi Local', profit: null }], detalles: [{ id: E(10), sale_id: E(1), product_id: 9, quantity: 1, total: '45990', product_name: 'X' }] },
      { ventas: [], detalles: [] }, COLS)
    expect(p.ventas).toEqual([{ id: E(1), date_sale: '2026-11-16', total_price: '45990', channel: 'Mi Local' }])
    expect(p.detalles).toEqual([{ id: E(10), sale_id: E(1), product_id: 9, quantity: 1, total: '45990' }])
    expect(p.freno).toBeNull()
  })

  it('saca del espejo la del ERP que ya ⛔ está (anulada) con sus renglones, y ⛔ toca un id de GN', () => {
    const p = planVentasErp({ ventas: [{ id: E(1) }], detalles: [{ id: E(10), sale_id: E(1) }] },
      { ventas: [E(1), E(2), 555], detalles: [E(10), E(20), 777] }, COLS)
    expect(p.sacarVentas).toEqual([E(2)])
    expect(p.sacarDetalles).toEqual([E(20)])
  })

  it('FRENA si sacaría más del tope: una lectura rara del motor ⛔ vacía el espejo', () => {
    const espejo = { ventas: Array.from({ length: 300 }, (_, i) => E(i)), detalles: [] as number[] }
    const p = planVentasErp({ ventas: [], detalles: [] }, espejo, COLS)
    expect(p.freno).toMatch(/300/)
    expect(p.sacarVentas).toEqual([])
  })

  it('⛔ escribe nada si el motor devuelve un id del rango de GN (pisaría una venta de GN)', () => {
    expect(() => planVentasErp({ ventas: [{ id: 1560001 }], detalles: [] }, { ventas: [], detalles: [] }, COLS)).toThrow(/id de GN/)
  })

  it('sin columnas ⛔ adivina', () => {
    expect(() => planVentasErp({ ventas: [], detalles: [] }, { ventas: [], detalles: [] }, { ventas: [], venta_detalles: [] })).toThrow(/columnas/)
  })

  it('la consulta pide sólo las nacidas en el ERP DESPUÉS del corte de su línea', () => {
    for (const q of [SQL_VENTAS_ERP, SQL_DETALLES_ERP]) {
      expect(q).toMatch(/v\.gn_sale_id is null/)
      expect(q).toMatch(/c\.linea = v\.marca/)
      expect(q).toMatch(/v\.ocurrida_en >= c\.instante/)
      expect(q).toMatch(/c\.instante <= now\(\)/)
    }
  })
})

describe('⛔ se cuentan dos veces: la venta copiada al espejo y la sumada al leer', () => {
  it('memo: una venta de Stunned del ERP que YA está en el espejo cuenta UNA vez', () => {
    const v = { id: E(1), date_sale: '2026-11-02', channel: 'Mi Local' }
    const d = { sale_id: E(1), product_id: 900, quantity: 1, total: 45990 }
    const skuPor = new Map([['900', 'STU-REM-0015-M']])
    const suma = sumarVentasDelErp({ ventas: [v], detalles: [d], skuPor }, { ventas: [v], detalles: [d], skuPor })
    expect(suma.ventas).toHaveLength(1)
    expect(suma.detalles).toHaveLength(1)
    const solo = sumarVentasDelErp({ ventas: [], detalles: [], skuPor }, { ventas: [v], detalles: [d], skuPor })
    const linea = (s: { ventas: unknown[], detalles: unknown[], skuPor: unknown }) => ventaPorLinea({ store: 'zattia', ventas: s.ventas, detalles: s.detalles, skuPor: s.skuPor, desde: '2026-11-02', hasta: '2026-11-02' })
    expect(linea(suma)).toEqual(linea(solo))
  })
})
