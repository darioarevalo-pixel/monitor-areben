import { describe, expect, it } from 'vitest'
import { agruparPorLugar, aEscaneo, claveEscaneo, contarEnLugar, filasExport, HEADER_EXPORT, lugaresDe, lugaresSugeridos, nuevoRecorridoId, yaEscaneado, type EscaneoLibre } from '../lib/exhib/libre'
import type { ExhibItem } from '../lib/exhib/tipos'

const it0 = (over: Partial<ExhibItem>): ExhibItem => ({ barcode: '', sku: '', productId: 'p', name: 'X', size: 'U', qty: 1, img: null, cat: 'TOPS Y BODIES', cleanCats: ['TOPS Y BODIES'], tnId: null, precio: null, promo: null, ...over })

const TOP = it0({ barcode: '779001', sku: 'ZT-TOP-01', productId: '5', name: 'Top Bianca', size: 'M', qty: 2, cleanCats: ['TOPS Y BODIES', 'NEW IN'], precio: 24990, promo: null })

describe('aEscaneo', () => {
  it('guarda la prenda con su lugar y TODAS sus categorías', () => {
    const e = aEscaneo(TOP, '779001', 'perchero tops', Date.parse('2026-09-19T15:00:00Z'))
    expect(e).toMatchObject({
      lugar: 'perchero tops',
      variante_id: '779001',
      encontrado: true,
      sku: 'ZT-TOP-01',
      product_id: '5',
      size: 'M',
      qty: 2,
      precio: 24990,
      promo: null,
      escaneado_en: '2026-09-19T15:00:00.000Z',
    })
    // 🔑 El corazón del pedido: si acá quedara `cat` (que es `cleanCats[0]`) en vez de `cleanCats`,
    // el export ⛔ no podría contestar contra qué categorías engloba TN lo que hay en el perchero.
    expect(e.cats).toEqual(['TOPS Y BODIES', 'NEW IN'])
  })

  it('el código que NO cruza se guarda igual, con el código crudo', () => {
    const e = aEscaneo(null, ' 077-9999 ', 'mesa entrada')
    expect(e.encontrado).toBe(false)
    expect(e.codigo_crudo).toBe('077-9999')
    // El '?' lo mantiene fuera del espacio de ids de variante: jamás choca con una prenda real.
    expect(e.variante_id).toBe('?779999')
    expect(e.product_name).toBeNull()
    expect(e.cats).toEqual([])
  })

  it('recorta el lugar: «perchero tops » y «perchero tops» son el mismo mueble', () => {
    expect(aEscaneo(TOP, '779001', ' perchero tops ').lugar).toBe('perchero tops')
  })
})

describe('claveEscaneo / yaEscaneado', () => {
  const enTops = aEscaneo(TOP, '779001', 'perchero tops')
  const enMesa = aEscaneo(TOP, '779001', 'mesa entrada')

  it('la misma prenda en el MISMO lugar es el mismo escaneo', () => {
    expect(yaEscaneado([enTops], claveEscaneo(aEscaneo(TOP, '779001', 'perchero tops')))).toBe(true)
  })

  /**
   * 🔴 Si la clave fuera sólo la variante, esto daría `true` y la pantalla se comería el segundo
   * escaneo — justo el caso que el modo libre existe para ver: la prenda colgada en dos lugares.
   */
  it('la misma prenda en OTRO lugar es un escaneo NUEVO, no un duplicado', () => {
    expect(yaEscaneado([enTops], claveEscaneo(enMesa))).toBe(false)
    expect(claveEscaneo(enTops)).not.toBe(claveEscaneo(enMesa))
  })
})

describe('agruparPorLugar', () => {
  const escaneos: EscaneoLibre[] = [
    aEscaneo(TOP, '779001', 'perchero tops', Date.parse('2026-09-19T15:00:00Z')),
    aEscaneo(it0({ barcode: '779002', name: 'Body Nina' }), '779002', 'mesa entrada', Date.parse('2026-09-19T15:05:00Z')),
    aEscaneo(it0({ barcode: '779003', name: 'Top Lola' }), '779003', 'perchero tops', Date.parse('2026-09-19T15:10:00Z')),
  ]

  it('respeta el orden en que se recorrió, y adentro lo último arriba', () => {
    const grupos = agruparPorLugar(escaneos)
    expect(grupos.map((g) => g.lugar)).toEqual(['perchero tops', 'mesa entrada'])
    expect(grupos[0].escaneos.map((e) => e.product_name)).toEqual(['Top Lola', 'Top Bianca'])
  })

  it('lugaresDe y contarEnLugar leen lo mismo', () => {
    expect(lugaresDe(escaneos)).toEqual(['perchero tops', 'mesa entrada'])
    expect(contarEnLugar(escaneos, 'perchero tops')).toBe(2)
    expect(contarEnLugar(escaneos, ' mesa entrada ')).toBe(1)
  })
})

describe('lugaresSugeridos', () => {
  it('primero los de este recorrido, después los viejos, sin repetir ni distinguir mayúsculas', () => {
    expect(lugaresSugeridos(['Perchero Tops', 'vidriera', ''], ['perchero tops', 'mesa entrada'])).toEqual([
      'perchero tops',
      'mesa entrada',
      'vidriera',
    ])
  })
})

describe('filasExport', () => {
  const escaneos: EscaneoLibre[] = [
    aEscaneo(TOP, '779001', 'perchero tops', Date.parse('2026-09-19T15:00:00Z')),
    aEscaneo(it0({ barcode: '779003', name: 'Blusa Vera', size: 'S', qty: 1, cleanCats: ['TOPS Y BODIES', 'BLUSAS Y CAMISAS'], precio: 39990, promo: 27993 }), '779003', 'perchero tops', Date.parse('2026-09-19T15:10:00Z')),
    aEscaneo(null, '779999', 'mesa entrada', Date.parse('2026-09-19T15:20:00Z')),
  ]
  const filas = filasExport(escaneos)

  it('el header es el acordado', () => {
    expect(filas[0]).toEqual([...HEADER_EXPORT])
  })

  it('la columna de categorías lleva TODAS, separadas por " / "', () => {
    expect(filas[2][5]).toBe('TOPS Y BODIES / BLUSAS Y CAMISAS')
  })

  it('el precio es el que hay que cobrar: gana la oferta congelada al escanear', () => {
    expect(filas[1][7]).toBe(24990)
    expect(filas[2][7]).toBe(27993)
  })

  it('el que NO cruzó entra igual, con el código y el motivo en el lugar del nombre', () => {
    expect(filas[3][0]).toBe('mesa entrada')
    expect(filas[3][1]).toBe('779999 — sin stock en el Local')
    expect(filas[3][4]).toBe('779999')
    expect(filas[3][7]).toBe('')
  })

  it('dentro del lugar el export va en orden de caminata (la pantalla lo muestra al revés)', () => {
    expect(filas.slice(1, 3).map((f) => f[1])).toEqual(['Top Bianca', 'Blusa Vera'])
  })
})

describe('nuevoRecorridoId', () => {
  it('arranca con ex y no se repite', () => {
    const a = nuevoRecorridoId()
    expect(a.startsWith('ex')).toBe(true)
    expect(a).not.toBe(nuevoRecorridoId())
  })
})
