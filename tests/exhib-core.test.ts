import { describe, expect, it } from 'vitest'
import { agruparPDF, armarProdMap, buscarItem, construirItems, contarSinMarcar, esCruce, exhibId, faltantes, filtrarPorCat, limpiarCats, normCode, ordenarCats, precioDeGondola, sospechososNoExhibidos, tnAdminUrl } from '../lib/exhib/core'
import { SIN_CATEGORIA, type ExhibErrores, type ExhibEstados, type ExhibItem } from '../lib/exhib/tipos'

const it0 = (over: Partial<ExhibItem>): ExhibItem => ({ barcode: '', sku: '', productId: 'p', name: 'X', size: 'U', qty: 1, img: null, cat: 'Anillos', cleanCats: ['Anillos'], tnId: null, precio: null, promo: null, ...over })

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
    // Sin cruce con TN no se sabe el precio, y eso NO es cero: la pantalla lo dice como "no se sabe".
    expect(it.precio).toBeNull()
    expect(it.promo).toBeNull()
  })

  it('trae los dos precios de TN', () => {
    const [it] = construirItems(inv, { '5': { img: null, tnCats: [], tnId: 99, precio: 20490, promo: 12290 } }, {})
    expect(it.precio).toBe(20490)
    expect(it.promo).toBe(12290)
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

describe('precioDeGondola — qué tiene que decir la etiqueta', () => {
  it('en oferta, se cobra la promo y el de lista queda como explicación', () => {
    expect(precioDeGondola(it0({ precio: 20490, promo: 12290 }))).toEqual({
      aCobrar: 12290, lista: 20490, enOferta: true, pct: 40,
    })
  })

  it('sin oferta, se cobra el de lista y no hay porcentaje que mostrar', () => {
    expect(precioDeGondola(it0({ precio: 20490, promo: null }))).toEqual({
      aCobrar: 20490, lista: 20490, enOferta: false, pct: null,
    })
  })

  // 🔑 El caso que manda a reimprimir de más: sube el precio de lista y la promo vieja queda
  // arriba. Tratarla como oferta pondría un descuento negativo en pantalla y haría cambiar una
  // etiqueta que está bien. La tienda cobra el de lista, y eso es lo que se muestra.
  it('una promo que NO es menor que el precio de lista no es una oferta', () => {
    expect(precioDeGondola(it0({ precio: 20490, promo: 24990 }))).toMatchObject({ aCobrar: 20490, enOferta: false, pct: null })
    expect(precioDeGondola(it0({ precio: 20490, promo: 20490 }))).toMatchObject({ aCobrar: 20490, enOferta: false })
  })

  // Un 0 en TN es "no hay promo cargada", no "vale cero".
  it('una promo en 0 se ignora', () => {
    expect(precioDeGondola(it0({ precio: 20490, promo: 0 }))).toMatchObject({ aCobrar: 20490, enOferta: false })
  })

  it('sin ningún precio contesta "no se sabe", no cero', () => {
    expect(precioDeGondola(it0({ precio: null, promo: null }))).toEqual({ aCobrar: null, lista: null, enOferta: false, pct: null })
    expect(precioDeGondola(it0({ precio: 0, promo: null }))).toMatchObject({ aCobrar: null })
  })

  // Raro pero posible si TN no devolvió el precio normal: una promo suelta sigue siendo el mejor
  // número disponible, y decir "no se sabe" teniendo uno sería peor.
  it('con promo pero sin precio de lista, muestra la promo sin llamarla oferta', () => {
    expect(precioDeGondola(it0({ precio: null, promo: 12290 }))).toMatchObject({ aCobrar: 12290, enOferta: false, pct: null })
  })
})

/**
 * El enganche con la cola de reetiquetado (`sinEtiquetar` en `lib/etiquetas/cola.core.js`).
 *
 * Lo que se fija acá es que la sospecha **se cruce** con el recorrido en vez de listarse suelta: la
 * cola no descarta lo que quedó con stock y sin etiquetar, lo deriva, y lo que informa de verdad es
 * el producto que además no apareció en el salón.
 */
describe('sospechososNoExhibidos', () => {
  const faltante = it0({ productId: '10', barcode: '779010', name: 'JEAN' })
  const otroTalle = it0({ productId: '10', barcode: '779011', name: 'JEAN', size: '38' })
  const ajeno = it0({ productId: '20', barcode: '779020', name: 'TOP' })

  it('marca los faltantes cuyo producto lleva días sin etiquetar', () => {
    expect(sospechososNoExhibidos([faltante, ajeno], ['10']).map((i) => i.barcode)).toEqual(['779010'])
  })

  it('🔴 un producto sospechoso marca TODAS sus variantes faltantes: la prenda que no está no está en ningún talle', () => {
    expect(sospechososNoExhibidos([faltante, otroTalle], ['10'])).toHaveLength(2)
  })

  it('sin sospechas no devuelve nada, y un pid que no falta tampoco entra', () => {
    expect(sospechososNoExhibidos([faltante, ajeno], [])).toEqual([])
    expect(sospechososNoExhibidos([ajeno], ['10'])).toEqual([])
  })

  it('cruza aunque los pid vengan como número de un lado y texto del otro', () => {
    expect(sospechososNoExhibidos([faltante], [10 as unknown as string])).toHaveLength(1)
  })
})


/**
 * 🔴 **El caso del 7-sep-2026: el catálogo del ETL llega TARDE.**
 *
 * En el teléfono, el Chequeo de exhibición mostraba **dos** opciones en «Categoría a recorrer»
 * —«Todas» y «(Sin categoría)»— con 870 prendas cargadas. No era Tienda Nube ni el inventario: los
 * dos contestaban bien. Era que el cruce se hacía **una sola vez**, al montar la pantalla, cuando
 * `allProductos` del store todavía era `[]`; el mapa salía vacío y nada lo volvía a armar cuando el
 * ETL publicaba. Un mapa vacío ⛔ no da error: da todo en «(Sin categoría)», sin foto y sin precio.
 *
 * Estos casos fijan la mitad pura: **el mapa vale lo que valga `productos` en el momento en que se
 * arma**, así que el que lo llame tiene que derivarlo, ⛔ no guardarlo.
 */
describe('armarProdMap — el cruce GN ↔ TN', () => {
  const tn = [{ id: 99, sku: 'AN-01', name: 'Anillo Sol', images: ['http://img'], categories: ['Anillos', 'SALE'], price: 1000, promo_price: 800 }]
  const gn = [{ id: 5, name: 'Anillo Sol', sku: 'AN-01' }] as Parameters<typeof armarProdMap>[0]
  const inv = [{ product_id: 5, product_name: 'Anillo Sol', size_name: 'Único', sku: 'AN-01', barcode: 779, available_quantity: 3 }]

  it('con el catálogo del ETL cargado, la prenda llega con categoría, foto y los dos precios', () => {
    const [it] = construirItems(inv, armarProdMap(gn, tn), {})
    expect(it).toMatchObject({ cat: 'Anillos', img: 'http://img', tnId: 99, precio: 1000, promo: 800 })
    expect(ordenarCats(construirItems(inv, armarProdMap(gn, tn), {}))).toEqual(['Anillos'])
  })

  it('🔴 sin el catálogo del ETL el mapa sale VACÍO y todo cae en (Sin categoría): el desplegable queda con una sola', () => {
    const items = construirItems(inv, armarProdMap([], tn), {})
    expect(ordenarCats(items)).toEqual([SIN_CATEGORIA])
    expect(items[0].img).toBeNull()
    expect(items[0].precio).toBeNull()
  })

  it('el producto que no cruza con TN queda sin categoría, pero los que cruzan no se pierden', () => {
    const gn2 = [...gn, { id: 6, name: 'Prenda que no está en la tienda', sku: 'ZZ-99' }] as typeof gn
    const inv2 = [...inv, { product_id: 6, product_name: 'Prenda que no está en la tienda', size_name: 'M', sku: 'ZZ-99', barcode: 780, available_quantity: 1 }]
    expect(ordenarCats(construirItems(inv2, armarProdMap(gn2, tn), {}))).toEqual(['Anillos', SIN_CATEGORIA])
  })
})
