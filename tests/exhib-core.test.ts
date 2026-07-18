import { describe, expect, it } from 'vitest'
import { agruparPDF, buscarItem, construirItems, contarSinMarcar, esCruce, exhibId, faltantes, filtrarPorCat, limpiarCats, normCode, ordenarCats, tnAdminUrl } from '../lib/exhib/core'
import { SIN_CATEGORIA, type ExhibErrores, type ExhibEstados, type ExhibItem } from '../lib/exhib/tipos'

const it0 = (over: Partial<ExhibItem>): ExhibItem => ({ barcode: '', sku: '', productId: 'p', name: 'X', size: 'U', qty: 1, img: null, cat: 'Anillos', cleanCats: ['Anillos'], tnId: null, ...over })

describe('exhibId', () => {
  it('usa barcode si hay, si no productId|talle', () => {
    expect(exhibId(it0({ barcode: '779000' }))).toBe('779000')
    expect(exhibId(it0({ barcode: '', productId: '12', size: 'M' }))).toBe('12|M')
  })
})

describe('limpiarCats', () => {
  it('descarta genéricas, promos, modelo y fundas; conserva el resto en orden', () => {
    expect(limpiarCats(['Productos', 'SALE', 'iPhone 15', 'Fundas', 'Anillos', 'Collares'])).toEqual(['Anillos', 'Collares'])
  })
  it('tolera null', () => {
    expect(limpiarCats(null)).toEqual([])
  })
})

describe('construirItems', () => {
  const inv = [{ product_id: 5, product_name: 'Anillo Sol', size_name: 'Único', sku: 'AN-01', barcode: 779, available_quantity: 3 }]
  const prodMap = { '5': { img: 'http://img', tnCats: ['Anillos', 'SALE'], tnId: 99 } }
  it('cruza inventario con TN y limpia categorías', () => {
    const [it] = construirItems(inv, prodMap, {})
    expect(it).toMatchObject({ productId: '5', sku: 'AN-01', barcode: '779', qty: 3, img: 'http://img', tnId: 99, cat: 'Anillos', cleanCats: ['Anillos'] })
  })
  it('un error de categoría reasigna la cat y la agrega a cleanCats', () => {
    const errores: ExhibErrores = { '5': { name: 'Anillo Sol', sku: 'AN-01', tnId: 99, catTN: 'Anillos', catCorrecta: 'Dijes' } }
    const [it] = construirItems(inv, prodMap, errores)
    expect(it.cat).toBe('Dijes')
    expect(it.cleanCats).toContain('Dijes')
  })
  it('sin match TN queda (Sin categoría)', () => {
    const [it] = construirItems(inv, {}, {})
    expect(it.cat).toBe(SIN_CATEGORIA)
    expect(it.img).toBeNull()
  })
})

describe('ordenarCats', () => {
  it('alfabético con (Sin categoría) al final', () => {
    const items = [it0({ cat: 'Collares' }), it0({ cat: SIN_CATEGORIA }), it0({ cat: 'Anillos' })]
    expect(ordenarCats(items)).toEqual(['Anillos', 'Collares', SIN_CATEGORIA])
  })
})

describe('normCode / buscarItem', () => {
  const items = [it0({ productId: 'a', barcode: '77912345', sku: 'AN-01' }), it0({ productId: 'b', barcode: '', sku: 'RCA-0035-NG' })]
  it('normaliza guiones, espacios y ceros a la izquierda', () => {
    expect(normCode(' 007-79 ')).toBe('779')
  })
  it('match por barcode exacto', () => {
    expect(buscarItem(items, '77912345')?.productId).toBe('a')
  })
  it('match por SKU normalizado (etiqueta con guiones)', () => {
    expect(buscarItem(items, 'rca0035ng')?.productId).toBe('b')
  })
  it('sin match devuelve null', () => {
    expect(buscarItem(items, 'nope')).toBeNull()
  })
})

describe('esCruce', () => {
  it('true si la cat recorrida no está en cleanCats', () => {
    expect(esCruce(it0({ cleanCats: ['Anillos'] }), 'Collares')).toBe(true)
    expect(esCruce(it0({ cleanCats: ['Anillos'] }), 'Anillos')).toBe(false)
  })
  it('nunca es cruce con "Todas" ni "(Sin categoría)"', () => {
    expect(esCruce(it0({}), '')).toBe(false)
    expect(esCruce(it0({}), SIN_CATEGORIA)).toBe(false)
  })
})

describe('filtrado / triage', () => {
  const items = [it0({ productId: 'a', cat: 'Anillos' }), it0({ productId: 'b', cat: 'Collares' })]
  it('filtrarPorCat vacío = todos', () => {
    expect(filtrarPorCat(items, '')).toHaveLength(2)
    expect(filtrarPorCat(items, 'Anillos')).toHaveLength(1)
  })
  it('faltantes = los no exhibido', () => {
    const estados: ExhibEstados = { [exhibId(items[0])]: 'exhibido' }
    expect(faltantes(items, estados).map((x) => x.productId)).toEqual(['b'])
  })
  it('contarSinMarcar cuenta los que no tienen estado de triage', () => {
    const estados: ExhibEstados = { [exhibId(items[0])]: 'solucionado' }
    expect(contarSinMarcar(items, estados)).toBe(1) // b sin marcar
  })
})

describe('agruparPDF', () => {
  it('agrupa por estado; sin estado va a sin-marcar', () => {
    const items = [it0({ productId: 'a' }), it0({ productId: 'b' }), it0({ productId: 'c' })]
    const estados: ExhibEstados = { [exhibId(items[0])]: 'exhibido', [exhibId(items[1])]: 'no-encuentra' }
    const g = agruparPDF(items, estados)
    expect(g.exhibido).toHaveLength(1)
    expect(g['no-encuentra']).toHaveLength(1)
    expect(g['sin-marcar']).toHaveLength(1)
  })
})

describe('tnAdminUrl', () => {
  it('arma el link al admin de TN por marca', () => {
    expect(tnAdminUrl(99, 'zattia')).toBe('https://zattiaco.mitiendanube.com/admin/products/99')
    expect(tnAdminUrl(99, 'bdi')).toBe('https://bdiaccesorios4.mitiendanube.com/admin/products/99')
    expect(tnAdminUrl(null, 'bdi')).toBeNull()
  })
})
