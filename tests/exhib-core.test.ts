import { describe, expect, it } from 'vitest'
import { agruparPDF, armarProdMap, buscarItem, candidatosPorCodigo, coincidencias, catsDeItem, construirItems, contarSinMarcar, esCruce, exhibId, faltantes, filtrarPorCat, limpiarCats, normCode, ordenarCats, perteneceA, precioDeGondola, sospechososNoExhibidos, tnAdminUrl } from '../lib/exhib/core'
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
    const items = [it0({ cleanCats: ['Collares'] }), it0({ cleanCats: [] }), it0({ cleanCats: ['Anillos'] })]
    expect(ordenarCats(items)).toEqual(['Anillos', 'Collares', SIN_CATEGORIA])
  })

  /**
   * 🔴 El pendiente 1, medido el 19-sep-2026: la lista salía de `cat` (que es `cleanCats[0]`), así
   * que una categoría que nunca es primera **⛔ no existía en el desplegable**. Con datos reales,
   * BLUSAS, SHORTS y BERMUDAS mostraban CERO y se leía como «no hay nada que chequear».
   */
  it('lista TODAS las categorías de cada prenda, no sólo la primera', () => {
    const items = [it0({ cat: 'TOPS Y BODIES', cleanCats: ['TOPS Y BODIES', 'BLUSAS Y CAMISAS'] })]
    expect(ordenarCats(items)).toEqual(['BLUSAS Y CAMISAS', 'TOPS Y BODIES'])
  })

  it('las dos grafías del mismo nombre son UNA sola opción', () => {
    const items = [it0({ cleanCats: ['SHORTS, MINIS y FALDAS'] }), it0({ cleanCats: ['SHORTS, MINIS Y FALDAS'] })]
    expect(ordenarCats(items)).toEqual(['SHORTS, MINIS y FALDAS'])
  })
})

describe('catsDeItem / perteneceA', () => {
  it('sin categorías TN la prenda vive en (Sin categoría) y se puede recorrer', () => {
    expect(catsDeItem(it0({ cleanCats: [] }))).toEqual([SIN_CATEGORIA])
    expect(perteneceA(it0({ cleanCats: [] }), SIN_CATEGORIA)).toBe(true)
  })
  it('la misma categoría escrita distinto es la misma', () => {
    expect(perteneceA(it0({ cleanCats: ['SHORTS, MINIS y FALDAS'] }), 'SHORTS, MINIS Y FALDAS')).toBe(true)
    expect(perteneceA(it0({ cleanCats: ['JEANS'] }), '  jeans  ')).toBe(true)
  })
  it('y una ajena sigue siendo ajena', () => {
    expect(perteneceA(it0({ cleanCats: ['JEANS'] }), 'BERMUDAS')).toBe(false)
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
  /**
   * 🔴 El cruce falso: en el catálogo conviven `SHORTS, MINIS y FALDAS` (41 variantes) y
   * `SHORTS, MINIS Y FALDAS` (23). Comparando letra por letra, la mitad del perchero se acusaba de
   * estar mal colgada.
   */
  it('⛔ no es cruce por la grafía: son la misma categoría', () => {
    expect(esCruce(it0({ cleanCats: ['SHORTS, MINIS y FALDAS'] }), 'SHORTS, MINIS Y FALDAS')).toBe(false)
  })
  it('y la prenda de varias categorías ⛔ no cruza en ninguna de ellas', () => {
    expect(esCruce(it0({ cat: 'TOPS Y BODIES', cleanCats: ['TOPS Y BODIES', 'BLUSAS Y CAMISAS'] }), 'BLUSAS Y CAMISAS')).toBe(false)
  })
})

/**
 * Los códigos son los **reales** del primer día de uso (19-sep-2026): 2 de 97 escaneos ⛔ no
 * cruzaron y los dos eran lecturas a medias, ⛔ no problemas de stock.
 */
describe('candidatosPorCodigo', () => {
  const local = [
    it0({ productId: '1', name: 'CORPIÑO AYLA - CHERRY', sku: 'BKC-0001-CH-M', barcode: '1296698' }),
    it0({ productId: '2', name: 'TOP HADES', sku: 'RTO-0049-MA', barcode: '1123698' }),
    it0({ productId: '3', name: 'TOP ZOE', sku: 'RTO-0150-NG', barcode: 'RTO0150NG' }),
    it0({ productId: '4', name: 'TOP EMBER', sku: 'RTO-0013-BL', barcode: '703517' }),
  ]

  it('«0150NG» encuentra a TOP ZOE, que es RTO-0150-NG sin prefijo ni guiones', () => {
    expect(candidatosPorCodigo(local, '0150NG').map((x) => x.productId)).toEqual(['3'])
  })

  it('«698», un pedazo de código de barras, devuelve los DOS parecidos y ⛔ no elige', () => {
    expect(candidatosPorCodigo(local, '698').map((x) => x.productId).sort()).toEqual(['1', '2'])
  })

  it('un código completo ⛔ no necesita candidatos: `buscarItem` ya lo engancha exacto', () => {
    expect(buscarItem(local, 'RTO-0150-NG')?.productId).toBe('3')
  })

  it('menos de 3 caracteres ⛔ no propone nada: «NG» da 440 sobre el Local real', () => {
    expect(candidatosPorCodigo(local, 'NG')).toEqual([])
    expect(candidatosPorCodigo(local, '')).toEqual([])
  })

  /**
   * 🔴 8 grupos / 20 variantes con stock comparten SKU (`4008` es TOP MIA BLANCO y CHOCOLATE).
   * `buscarItem` se queda con la primera; el recorrido libre pregunta con `coincidencias`.
   */
  it('un SKU compartido engancha las DOS, y quedarse con la primera es mentir callado', () => {
    const mia = [
      it0({ productId: 'bl', name: 'TOP MIA BLANCO', sku: '4008', barcode: 'RTO0391BL' }),
      it0({ productId: 'ct', name: 'TOP MIA CHOCOLATE', sku: '4008', barcode: 'RTO0391CT' }),
    ]
    expect(coincidencias(mia, '4008').map((x) => x.productId)).toEqual(['bl', 'ct'])
    expect(buscarItem(mia, '4008')?.productId).toBe('bl')
    // Con el lector ⛔ no pasa: el barcode es distinto y engancha una sola.
    expect(coincidencias(mia, 'RTO0391CT').map((x) => x.productId)).toEqual(['ct'])
  })

  it('el barcode gana sobre el SKU, y ⛔ no se mezclan los dos escalones', () => {
    const items = [it0({ productId: 'a', barcode: '4008', sku: 'ZZ-1' }), it0({ productId: 'b', barcode: '9999', sku: '4008' })]
    expect(coincidencias(items, '4008').map((x) => x.productId)).toEqual(['a'])
  })

  it('el más parecido primero: el código más corto es el que sobra menos', () => {
    // `0150` matchea el barcode de TOP ZOE (9) y el SKU de TOP EMBER (RTO-0013-BL no; usamos 015).
    const mixto = [it0({ productId: 'largo', sku: '', barcode: '9999901509999' }), it0({ productId: 'corto', sku: '', barcode: '0150' })]
    expect(candidatosPorCodigo(mixto, '0150').map((x) => x.productId)).toEqual(['corto', 'largo'])
  })
})

describe('filtrado / triage', () => {
  const items = [it0({ productId: 'a', cat: 'Anillos', cleanCats: ['Anillos'] }), it0({ productId: 'b', cat: 'Collares', cleanCats: ['Collares'] })]
  it('filtrarPorCat vacío = todos', () => {
    expect(filtrarPorCat(items, '')).toHaveLength(2)
    expect(filtrarPorCat(items, 'Anillos')).toHaveLength(1)
  })

  /** 🔴 El caso de los 17 invisibles de «TOPS Y BODIES»: la prenda aparece en las DOS. */
  it('una prenda de dos categorías se recorre en las dos', () => {
    const dos = [it0({ productId: 'c', cat: 'TOPS Y BODIES', cleanCats: ['TOPS Y BODIES', 'BLUSAS Y CAMISAS'] })]
    expect(filtrarPorCat(dos, 'TOPS Y BODIES')).toHaveLength(1)
    expect(filtrarPorCat(dos, 'BLUSAS Y CAMISAS')).toHaveLength(1)
  })

  it('y las dos grafías del mismo nombre filtran juntas', () => {
    const grafias = [it0({ productId: 'd', cleanCats: ['SHORTS, MINIS y FALDAS'] }), it0({ productId: 'e', cleanCats: ['SHORTS, MINIS Y FALDAS'] })]
    expect(filtrarPorCat(grafias, 'SHORTS, MINIS Y FALDAS')).toHaveLength(2)
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
  const gn = [{ id: 5, name: 'Anillo Sol', sku: 'AN-01' }]
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
    const gn2 = [...gn, { id: 6, name: 'Prenda que no está en la tienda', sku: 'ZZ-99' }]
    const inv2 = [...inv, { product_id: 6, product_name: 'Prenda que no está en la tienda', size_name: 'M', sku: 'ZZ-99', barcode: 780, available_quantity: 1 }]
    expect(ordenarCats(construirItems(inv2, armarProdMap(gn2, tn), {}))).toEqual(['Anillos', SIN_CATEGORIA])
  })
})
