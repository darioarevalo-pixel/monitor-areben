import { describe, it, expect } from 'vitest'
import { buscarProd, colorPorNombre, findProd, lev, limpiarNombre, matchByFilename, norm } from '@/lib/tncat/matching'
import { coloresConFoto, coloresSinFoto, filtrar, problema, sinFoto, sinVincular } from '@/lib/tncat/fchk'
import { nombresDeFilas } from '@/lib/tncat/excel'
import type { ProductoFchk, ProductoImg } from '@/lib/tncat/tipos'

const PRODS: ProductoImg[] = [
  { id: 1, name: 'Funda Silicona iPhone 15', sku: 'FSI15', colores: ['Rosa', 'Negro'] },
  { id: 2, name: 'Funda Transparente iPhone 16', sku: 'FTI16', colores: [] },
  { id: 3, name: 'Vidrio Templado', sku: 'VT', colores: [] },
]

describe('tncat/matching', () => {
  it('norm: minúsculas, sin acentos, espacios colapsados', () => {
    expect(norm('  Rosá   Pálido ')).toBe('rosa palido')
    expect(norm('NEGRO')).toBe('negro')
  })

  it('lev: distancia de edición', () => {
    expect(lev('gato', 'gato')).toBe(0)
    expect(lev('gato', 'pato')).toBe(1)
    expect(lev('', 'abc')).toBe(3)
  })

  it('limpiarNombre: saca extensión, numeración y sufijos', () => {
    // Quirk fiel del legacy: el strip de "número final" también recorta el "15" de
    // "iPhone 15". No rompe el match: buscarProd cae al prefijo (el nombre del
    // producto empieza con lo limpiado). Ver el test de matchByFilename.
    expect(limpiarNombre('Funda Silicona iPhone 15.jpg')).toBe('Funda Silicona iPhone')
    expect(limpiarNombre('Vidrio Templado (2).png')).toBe('Vidrio Templado')
    expect(limpiarNombre('Vidrio Templado copia.jpeg')).toBe('Vidrio Templado')
    expect(limpiarNombre('producto-3.webp')).toBe('producto')
  })

  it('buscarProd: exacto → prefijo → typo único', () => {
    expect(buscarProd(PRODS, 'vidrio templado')?.id).toBe(3) // exacto
    expect(buscarProd(PRODS, 'funda silicona iphone 15 rosa')?.id).toBe(1) // el texto empieza con el nombre
    expect(buscarProd(PRODS, 'vidrio templd')?.id).toBe(3) // typo (lev<=2)
    expect(buscarProd(PRODS, '')).toBeNull()
  })

  it('matchByFilename: limpia el archivo y matchea', () => {
    expect(matchByFilename(PRODS, 'Vidrio Templado (1).jpg')?.id).toBe(3)
    expect(matchByFilename(PRODS, 'Funda Silicona iPhone 15.png')?.id).toBe(1)
  })

  it('findProd: "Nombre (SKU)" exacto o búsqueda general', () => {
    expect(findProd(PRODS, 'Funda Silicona iPhone 15 (FSI15)')?.id).toBe(1)
    expect(findProd(PRODS, 'vidrio templado')?.id).toBe(3)
    expect(findProd(PRODS, '')).toBeNull()
  })

  it('colorPorNombre: detecta el color entre los del producto', () => {
    expect(colorPorNombre(PRODS[0], 'algo rosa.jpg')).toBe('Rosa')
    expect(colorPorNombre(PRODS[0], 'sin color.jpg')).toBe('')
    expect(colorPorNombre(PRODS[1], 'cualquiera.jpg')).toBe('') // sin colores
    expect(colorPorNombre(null, 'x.jpg')).toBe('')
  })
})

const fchkProd = (over: Partial<ProductoFchk>): ProductoFchk => ({ id: 1, name: 'P', image_count: 2, variantes: [], imagenes: [], ...over })

describe('tncat/fchk', () => {
  it('coloresSinFoto: colores cuyas variantes no tienen foto (ignora sin color)', () => {
    const p = fchkProd({
      variantes: [
        { color: 'Rosa', image_url: 'x.jpg' },
        { color: 'Negro', image_url: null },
        { color: null, image_url: null }, // single: se ignora
      ],
    })
    expect(coloresSinFoto(p)).toEqual(['Negro'])
  })

  it('sinFoto / sinVincular / problema', () => {
    expect(sinFoto(fchkProd({ image_count: 0 }))).toBe(true)
    expect(sinFoto(fchkProd({ image_count: 3 }))).toBe(false)
    const desvinc = fchkProd({ image_count: 2, variantes: [{ color: 'Rosa', image_url: null }] })
    expect(sinVincular(desvinc)).toBe(true)
    expect(problema(desvinc)).toBe(true)
    const ok = fchkProd({ image_count: 2, variantes: [{ color: 'Rosa', image_url: 'x.jpg' }] })
    expect(problema(ok)).toBe(false)
  })

  it('filtrar: aplica predicado + búsqueda + orden', () => {
    const data = [
      fchkProd({ id: 1, name: 'Beta', image_count: 0 }),
      fchkProd({ id: 2, name: 'Alfa', image_count: 2, variantes: [{ color: 'Rosa', image_url: null }] }),
      fchkProd({ id: 3, name: 'Gamma', image_count: 3, variantes: [{ color: 'Rosa', image_url: 'x.jpg' }] }),
    ]
    const problemas = filtrar(data, 'problema', '')
    expect(problemas.map((p) => p.name)).toEqual(['Alfa', 'Beta']) // sin Gamma (ok), ordenado
    expect(filtrar(data, 'sinfoto', '').map((p) => p.id)).toEqual([1])
    expect(filtrar(data, 'problema', 'alf').map((p) => p.id)).toEqual([2])
  })

  it('coloresConFoto: cada color con su foto o null', () => {
    const p = fchkProd({ variantes: [{ color: 'Rosa', image_url: 'r.jpg' }, { color: 'Negro', image_url: null }] })
    expect(coloresConFoto(p)).toEqual([{ color: 'Rosa', foto: 'r.jpg' }, { color: 'Negro', foto: null }])
  })
})

describe('tncat/excel', () => {
  it('nombresDeFilas: saltea encabezado, toma columna A, limpia y deduplica', () => {
    const rows = [['Nombre'], ['Remera A'], ['  Remera B  '], [''], ['Remera A'], [null]]
    expect(nombresDeFilas(rows as unknown[][])).toEqual(['Remera A', 'Remera B'])
  })
})
