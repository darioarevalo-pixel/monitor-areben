import { describe, it, expect } from 'vitest'
// `.core.js` sin tipos propios: los importan `api/_memo.js`, `api/_norte.js` y `api/_stunned-erp.js`, que corren en Node pelado.
import { normalizarDetalles, normalizarVentas, sqlDetalles, sqlSkus, sqlVentas, sumarVentasDelErp } from '../lib/stunned/ventas-erp.core.js'
import { ventaPorLinea } from '../lib/memo/foto.core.js'
import { ventasDelErp } from '../api/_stunned-erp.js'

/**
 * Las ventas de Stunned que nacen en el ERP se SUMAN a las de GN con su misma forma, y el memo las cuenta en la
 * línea `stunned` sin tocar el núcleo. El oráculo es el núcleo del memo (`ventaPorLinea`), no el merge.
 */
describe('Stunned: ventas del ERP con la forma de GN', () => {
  const gn = {
    ventas: [{ id: 10, date_sale: '2026-11-02', channel: 'Mi Local' }],
    detalles: [{ sale_id: 10, product_id: 1, quantity: 2, total: 20000 }],
    skuPor: new Map([['1', 'ZAT-0001-M']]),
  }
  const erp = {
    ventas: normalizarVentas([{ id: '1000000001', date_sale: '2026-11-02', channel: 'Mi Local', discount: '0', shipping_cost: '0', total_cost: '3000', total_price: '45990' }]),
    detalles: normalizarDetalles([{ sale_id: '1000000001', product_id: '900', quantity: '1', total: '45990' }]),
    skuPor: new Map([['900', 'STU-REM-0015-M']]),
  }

  it('se prende por el corte de la línea, en el SQL: sólo lo nacido en el ERP DESPUÉS del corte, real y confirmado', () => {
    for (const q of [sqlVentas(['bdi']), sqlDetalles(['bdi'])]) {
      expect(q).toContain("v.marca in ('bdi')")
      expect(q).toContain('exists (select 1 from erp_corte c where c.linea = v.marca and v.ocurrida_en >= c.instante)')
      expect(q).toContain('v.gn_sale_id is null')
      expect(q).toContain('not v.prueba')
    }
    expect(sqlVentas(['zattia', 'stunned'])).toContain("v.marca in ('zattia', 'stunned')")
    expect(sqlSkus(['bdi'])).toContain("m.id in ('bdi')")
  })

  it('suma ventas, renglones y SKUs, ordenados por id, y no pisa el SKU que GN ya conoce', () => {
    const s = sumarVentasDelErp({ ...gn }, { ...erp, skuPor: new Map([...erp.skuPor, ['1', 'OTRO']]) })
    expect(s.ventas.map((v: { id: number }) => v.id)).toEqual([10, 1000000001])
    expect(s.detalles).toHaveLength(2)
    expect(s.skuPor?.get('1')).toBe('ZAT-0001-M')
    expect(s.skuPor?.get('900')).toBe('STU-REM-0015-M')
  })

  it('el memo cuenta la venta del ERP en la línea stunned y la de GN en zattia', () => {
    const s = sumarVentasDelErp({ ...gn }, erp)
    const v = ventaPorLinea({ store: 'zattia', ventas: s.ventas, detalles: s.detalles, skuPor: s.skuPor, desde: '2026-11-02', hasta: '2026-11-02' })
    const json = JSON.stringify(v)
    expect(json).toContain('45990')
    expect(json).toContain('20000')
    // sin el empalme, Stunned queda en cero: lo que pasaba al cortar
    const sin = ventaPorLinea({ store: 'zattia', ventas: gn.ventas, detalles: gn.detalles, skuPor: gn.skuPor, desde: '2026-11-02', hasta: '2026-11-02' })
    expect(JSON.stringify(sin)).not.toContain('45990')
  })

  it.each([['bdi', /DATABASE_URL_BDI/], ['zattia', /DATABASE_URL_ZATTIA/]])('sin la conexión de %s AVISA, ⛔ calla', async (base, falta) => {
    const r = (await ventasDelErp(base as 'bdi' | 'zattia', '2026-11-01', '2026-11-02', {})) as { activa: boolean; error?: string }
    expect(r.activa).toBe(true)
    expect(r.error).toMatch(/NO están sumadas/)
    expect(r.error).toMatch(falta)
  })
})
