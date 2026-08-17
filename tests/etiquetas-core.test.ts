import { describe, it, expect } from 'vitest'
import {
  agruparCantidades,
  construirPrecios,
  filtrarVariantes,
  nombrarSinPrecio,
  partirPorPrecio,
  resolverScan,
  secuenciaLabels,
  variantesDeCampania,
  variantesEtiquetables,
  variantesSinCodigo,
  type ProductoPrecio,
} from '@/lib/etiquetas/core'
import { indexarTn, type TnProducto } from '@/lib/tn'
import { PESTANIAS, rotuloPestania, type Pestania, type VarianteEti } from '@/lib/etiquetas/tipos'
import { PERM_CAT } from '@/lib/nav.datos'
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

describe('variantesDeCampania', () => {
  it('deja las variantes cuyo producto está en la campaña, con todos sus talles', () => {
    // El pid '1' tiene dos talles: entran los dos, porque la campaña es del producto.
    expect(variantesDeCampania(VARS, new Set(['1'])).map((x) => x.id)).toEqual(['a', 'b'])
  })
  it('sin ningún pid no devuelve nada (campaña vacía ≠ toda la marca)', () => {
    expect(variantesDeCampania(VARS, new Set())).toEqual([])
  })
  it('un pid de la campaña que no tiene variantes no inventa filas', () => {
    expect(variantesDeCampania(VARS, new Set(['1', '99'])).map((x) => x.id)).toEqual(['a', 'b'])
  })
})

describe('construirPrecios · paridad con _etiBuildPrecios (salvo la divergencia de abajo)', () => {
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

describe('construirPrecios · una promo que no baja NO es oferta (diverge del legacy a propósito)', () => {
  // El caso real: sube el precio de lista y queda la promo vieja por encima. El legacy imprimía la
  // promo —o sea, un precio MÁS CARO que el de lista— mientras el chequeo de exhibición decía que
  // la etiqueta estaba bien. Ver `ofertaVigente` en lib/tienda.core.js.
  const productos: ProductoPrecio[] = [{ id: '1', sku: 'BUZO', name: 'Buzo', retailer_price: 20000 }]

  it('promo MAYOR que la lista: se imprime la lista y no hay tachado', () => {
    const idx = indexarTn([{ id: 10, sku: 'BUZO', name: 'Buzo', price: 25000, promo_price: 29990 }])
    const { precios, promos } = construirPrecios(productos, idx)
    expect(precios['1']).toBe(25000)
    expect(promos['1']).toBeUndefined()
  })

  it('promo IGUAL a la lista tampoco es oferta', () => {
    const idx = indexarTn([{ id: 10, sku: 'BUZO', name: 'Buzo', price: 25000, promo_price: 25000 }])
    const { precios, promos } = construirPrecios(productos, idx)
    expect(precios['1']).toBe(25000)
    expect(promos['1']).toBeUndefined()
  })

  it('y en ese caso el legacy hacía lo contrario — la divergencia es real, no teórica', () => {
    const tn: TnProducto[] = [{ id: 10, sku: 'BUZO', name: 'Buzo', price: 25000, promo_price: 29990 }]
    const legacy = cargarPreciosLegacy(productos, tn)
    expect(legacy.precios['1']).toBe(29990) // el legacy imprimía el precio más caro
    expect(construirPrecios(productos, indexarTn(tn)).precios['1']).toBe(25000)
  })
})

describe('construirPrecios · fueraDeTn: el respaldo al espejo deja de ser silencioso', () => {
  const productos: ProductoPrecio[] = [
    { id: '1', sku: 'BUZO', name: 'Buzo', retailer_price: 20000 },
    { id: '3', sku: 'ZZZ', name: 'Sin TN', retailer_price: 5000 },
  ]
  const idx = indexarTn([{ id: 10, sku: 'BUZO', name: 'Buzo', price: 25000, promo_price: 18000 }])

  it('marca al que no cruzó con Tienda Nube, y sólo a ése', () => {
    const { precios, fueraDeTn } = construirPrecios(productos, idx)
    expect(precios['3']).toBe(5000)
    expect(fueraDeTn.has('3')).toBe(true)
    expect(fueraDeTn.has('1')).toBe(false)
  })

  it('un producto sin precio en ningún lado no se marca: no hay nada que advertir', () => {
    const { precios, fueraDeTn } = construirPrecios([{ id: '9', sku: 'NADA', name: 'Nada' }], idx)
    expect(precios['9']).toBe(0)
    expect(fueraDeTn.has('9')).toBe(false)
  })
})

describe('partirPorPrecio · una etiqueta de precio sin precio no se imprime', () => {
  // El dibujo decide con `precio > 0`: con cero se cae a la etiqueta de información y sale una
  // etiqueta bien impresa PERO SIN PRECIO, sin un solo aviso. La prenda queda colgada sin número.
  const conPrecio = { v: v({ id: 'a', pid: '1' }), cant: 2 }
  const sin = { v: v({ id: 'b', pid: '2', name: 'Buzo', size: 'L' }), cant: 1 }
  const precioDe = (x: VarianteEti) => (x.pid === '1' ? 12990 : 0)

  it('en modo Local aparta al que no tiene precio', () => {
    const r = partirPorPrecio([conPrecio, sin], 'loc', precioDe)
    expect(r.imprimibles.map((g) => g.v.id)).toEqual(['a'])
    expect(r.sinPrecio.map((g) => g.v.id)).toEqual(['b'])
  })

  it('los modos SIN precio no apartan a nadie: ahí un cero no es una falta', () => {
    for (const modo of ['dep', 'sku', 'promo'] as const) {
      const r = partirPorPrecio([conPrecio, sin], modo, precioDe)
      expect(r.imprimibles).toHaveLength(2)
      expect(r.sinPrecio).toHaveLength(0)
    }
  })

  it('nombrarSinPrecio los NOMBRA en vez de contarlos, y corta la lista larga', () => {
    expect(nombrarSinPrecio([sin])).toBe('Buzo · L')
    const muchos = Array.from({ length: 13 }, (_, i) => ({ v: v({ id: 's' + i, name: 'P' + i, size: 'M' }), cant: 1 }))
    const txt = nombrarSinPrecio(muchos)
    expect(txt).toContain('P0 · M')
    expect(txt).toContain('y 3 más')
    expect(txt).not.toContain('P10')
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

/**
 * El espejo entre las pestañas que existen y los sub-permisos declarados.
 *
 * 🔴 **Existe porque ya se desincronizó una vez.** `lib/nav.datos.ts` declaraba `dep · loc · sku ·
 * libre` con los nombres viejos —«Depósito», «Local», que son ubicaciones— y sin conocer ni la
 * etiqueta de precio rebajado ni la cola. Nadie se enteraba: los subs de Etiquetas están declarados
 * y **no hay un solo `puedeSub` que los consulte**, así que la desincronía no rompe nada hasta el
 * día que alguien decida ejercerlos, y ahí reparte permisos sobre pestañas que ya no se llaman así.
 */
describe('las pestañas y los sub-permisos declarados dicen lo mismo', () => {
  const subs = (PERM_CAT.find((c) => c.key === 'etiquetas')?.subs ?? []).map((s) => s.key)

  it('una pestaña, un sub-permiso — sin sobrantes ni faltantes', () => {
    expect([...subs].sort()).toEqual([...PESTANIAS].sort())
  })

  it('y se llaman igual en los dos lados', () => {
    for (const s of PERM_CAT.find((c) => c.key === 'etiquetas')?.subs ?? []) {
      expect(s.label).toBe(rotuloPestania(s.key as Pestania).nombre)
    }
  })
})
