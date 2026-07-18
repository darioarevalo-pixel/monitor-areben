import { describe, it, expect } from 'vitest'
import {
  agruparCantidades,
  construirPrecios,
  filtrarVariantes,
  resolverScan,
  secuenciaLabels,
  variantesEtiquetables,
  variantesSinCodigo,
  type ProductoPrecio,
} from '@/lib/etiquetas/core'
import { indexarTn, type TnProducto } from '@/lib/tn'
import type { VarianteEti } from '@/lib/etiquetas/tipos'
import { cargarPreciosLegacy, cargarVariantesLegacy } from './legacy-etiquetas'

function v(over: Partial<VarianteEti> = {}): VarianteEti {
  return { id: 'v1', pid: '1', name: 'Remera', size: 'M', sku: 'REM-M', barcode: '779001', stock: 5, ...over }
}

const VARS: VarianteEti[] = [
  v({ id: 'a', pid: '1', name: 'Buzo', size: 'L', sku: 'BUZO-L', barcode: '779010', stock: 3 }),
  v({ id: 'b', pid: '1', name: 'Buzo', size: 'M', sku: 'BUZO-M', barcode: '779011', stock: 0 }),
  v({ id: 'c', pid: '2', name: 'Remera', size: 'S', sku: 'REM-S', barcode: '', stock: 4 }), // sin código
  v({ id: 'd', pid: '2', name: 'Remera', size: 'XL', sku: 'REM-XL', barcode: '00779012', stock: 2 }),
]

describe('variantesEtiquetables · paridad con _etiVariantes', () => {
  it('filtra por barcode y ordena por nombre+talle, igual que el legacy', () => {
    const port = variantesEtiquetables(VARS)
    const legacy = cargarVariantesLegacy(VARS) as VarianteEti[]
    expect(port.map((x) => x.id)).toEqual((legacy as VarianteEti[]).map((x) => x.id))
    expect(port.map((x) => x.id)).toEqual(['a', 'b', 'd']) // 'c' descartada (sin barcode)
  })
})

describe('variantesSinCodigo', () => {
  it('activos con stock pero sin código', () => {
    expect(variantesSinCodigo(VARS).map((x) => x.id)).toEqual(['c']) // 'c' tiene stock 4 y sin barcode
  })
})

describe('construirPrecios · paridad con _etiBuildPrecios', () => {
  const productos: ProductoPrecio[] = [
    { id: '1', sku: 'BUZO', name: 'Buzo', retailer_price: 20000 },
    { id: '2', sku: 'REM', name: 'Remera', retailer_price: 12000 },
    { id: '3', sku: 'ZZZ', name: 'Sin TN', retailer_price: 5000 }, // no está en TN → respaldo GN
  ]
  const tnProducts: TnProducto[] = [
    { id: 10, sku: 'BUZO', name: 'Buzo', price: 25000, promo_price: 18000 }, // promo real
    { id: 11, sku: 'REM', name: 'Remera', price: 12000, promo_price: 0 }, // sin promo → precio normal
  ]

  it('precios y promos byte-idénticos al legacy', () => {
    const idx = indexarTn(tnProducts)
    const port = construirPrecios(productos, idx)
    const legacy = cargarPreciosLegacy(productos, tnProducts)
    expect(port.precios).toEqual(legacy.precios)
    expect(port.promos).toEqual(legacy.promos)
  })

  it('valores esperados: promo gana, respaldo GN si no está en TN', () => {
    const idx = indexarTn(tnProducts)
    const { precios, promos } = construirPrecios(productos, idx)
    expect(precios['1']).toBe(18000) // promo
    expect(precios['2']).toBe(12000) // normal
    expect(precios['3']).toBe(5000) // respaldo GN
    expect(promos['1']).toEqual({ normal: 25000, promo: 18000 })
    expect(promos['2']).toBeUndefined()
  })
})

describe('filtrarVariantes', () => {
  it('cruza nombre, SKU y código', () => {
    const lista = variantesEtiquetables(VARS)
    expect(filtrarVariantes(lista, 'buzo').map((x) => x.id).sort()).toEqual(['a', 'b'])
    expect(filtrarVariantes(lista, 'rem-xl').map((x) => x.id)).toEqual(['d'])
    expect(filtrarVariantes(lista, '779010').map((x) => x.id)).toEqual(['a'])
  })
})

describe('resolverScan', () => {
  const lista = variantesEtiquetables(VARS)
  it('por código exacto', () => {
    expect(resolverScan(lista, '779010')?.id).toBe('a')
  })
  it('por código sin ceros a la izquierda', () => {
    expect(resolverScan(lista, '779012')?.id).toBe('d') // barcode real es 00779012
  })
  it('por SKU', () => {
    expect(resolverScan(lista, 'buzo-m')?.id).toBe('b')
  })
  it('no encontrado → null', () => {
    expect(resolverScan(lista, 'nada')).toBeNull()
    expect(resolverScan(lista, '')).toBeNull()
  })
})

describe('agruparCantidades y secuenciaLabels', () => {
  const varsById: Record<string, VarianteEti> = { a: v({ id: 'a', sku: 'A' }), b: v({ id: 'b', sku: '' }), z: v({ id: 'z', sku: 'Z' }) }
  it('agrupa salteando ids sin variante y (en sku) sin SKU', () => {
    const cant = { a: 2, b: 3, x: 9 } // 'x' no existe
    expect(agruparCantidades(cant, varsById, 'dep').map((g) => [g.v.id, g.cant])).toEqual([['a', 2], ['b', 3]])
    expect(agruparCantidades(cant, varsById, 'sku').map((g) => g.v.id)).toEqual(['a']) // 'b' sin sku
  })

  it('secuencia con separador (dep): un null entre variantes', () => {
    const grupos = [{ v: varsById.a, cant: 2 }, { v: varsById.z, cant: 1 }]
    const seq = secuenciaLabels(grupos, { sep: true, conFP: false })
    expect(seq).toEqual([varsById.a, varsById.a, null, varsById.z])
  })

  it('secuencia con formas de pago (loc): un __fp tras cada copia', () => {
    const grupos = [{ v: varsById.a, cant: 2 }]
    const seq = secuenciaLabels(grupos, { sep: false, conFP: true })
    expect(seq).toEqual([varsById.a, { __fp: true }, varsById.a, { __fp: true }])
  })

  it('sin opciones: solo las copias', () => {
    expect(secuenciaLabels([{ v: varsById.a, cant: 3 }], { sep: false, conFP: false })).toEqual([varsById.a, varsById.a, varsById.a])
  })
})
