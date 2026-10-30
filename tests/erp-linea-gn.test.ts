import { describe, expect, it } from 'vitest'
import { lineasDeVenta, SQL_RENGLON_STU, sqlVentaDeLinea } from '../lib/erp/linea-gn.core.js'
import { esStunned, skuParaLinea } from '../lib/lineas.core.js'

describe('la línea de una venta del espejo de GN (linea-gn.core.js)', () => {
  it('lista: la mixta sale en las dos; la sin renglones es de Zattia', () => {
    expect(lineasDeVenta(['STU-REM-1', 'ZAT-1'], 'lista')).toEqual(['zattia', 'stunned'])
    expect(lineasDeVenta(['STU-REM-1'], 'lista')).toEqual(['stunned'])
    expect(lineasDeVenta(['ZAT-1', null], 'lista')).toEqual(['zattia'])
    expect(lineasDeVenta([], 'lista')).toEqual(['zattia'])
  })

  it('factura: de Stunned sólo si TODOS los renglones son STU', () => {
    expect(lineasDeVenta(['STU-1', 'stu-2'], 'factura')).toEqual(['stunned'])
    expect(lineasDeVenta(['STU-1', 'ZAT-1'], 'factura')).toEqual(['zattia'])
    expect(lineasDeVenta([], 'factura')).toEqual(['zattia'])
  })

  it('el SKU sin cargar con proveedor STUNNED cuenta como Stunned (el drop del 7-sep), igual que skuParaLinea', () => {
    const sku = skuParaLinea({ sku: null, proveedor: 'STUNNED' })
    expect(esStunned(sku)).toBe(true)
    expect(lineasDeVenta([sku], 'factura')).toEqual(['stunned'])
    // El espejo en SQL dice lo mismo: SKU vacío ⇒ manda el proveedor; SKU cargado ⇒ manda el SKU.
    expect(SQL_RENGLON_STU).toContain("coalesce(p.sku, '') ilike 'stu%'")
    expect(SQL_RENGLON_STU).toContain("coalesce(p.sku, '') = '' and upper(trim(coalesce(p.proveedor, ''))) = 'STUNNED'")
  })

  it('las condiciones de cada línea son complementarias en factura y una línea desconocida frena', () => {
    expect(sqlVentaDeLinea('zattia', 'factura')).toBe(`not ${sqlVentaDeLinea('stunned', 'factura')}`)
    expect(() => sqlVentaDeLinea('bdi' as never, 'lista')).toThrow()
    expect(() => sqlVentaDeLinea('stunned', 'otro' as never)).toThrow()
  })
})
