import { describe, it, expect } from 'vitest'
import { buscarProd, colorPorNombre, findProd, lev, limpiarNombre, matchByFilename, norm } from '@/lib/tncat/matching'
import { nombresDeFilas } from '@/lib/tncat/excel'
import type { ProductoImg } from '@/lib/tncat/tipos'

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

describe('tncat/excel', () => {
  it('nombresDeFilas: saltea encabezado, toma columna A, limpia y deduplica', () => {
    const rows = [['Nombre'], ['Remera A'], ['  Remera B  '], [''], ['Remera A'], [null]]
    expect(nombresDeFilas(rows as unknown[][])).toEqual(['Remera A', 'Remera B'])
  })
})
