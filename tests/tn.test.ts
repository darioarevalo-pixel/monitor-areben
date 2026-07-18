import { describe, it, expect } from 'vitest'
import { imagenDe, imagenesDe, indexarTn, matchTn, type TnProducto } from '@/lib/tn'

const CATALOGO: TnProducto[] = [
  { id: 1, sku: 'REM-NG', name: 'Remera Boxy Negra', images: ['a.jpg', 'b.jpg'], promo_price: 1000 },
  { id: 2, sku: 'BUZ-GR', name: 'Buzo Oversize Gris', images: ['c.jpg'], promo_price: 0 },
  { id: 3, sku: 'SIN-FOTO', name: 'Producto Sin Foto', images: [] },
]

describe('indexarTn', () => {
  it('soloConImagenes descarta los productos sin foto', () => {
    const idx = indexarTn(CATALOGO, { soloConImagenes: true })
    expect(idx.bySku['sin-foto']).toBeUndefined()
    expect(idx.bySku['rem-ng']).toBeDefined()
  })
  it('sin la opción indexa todos (para el precio promo)', () => {
    const idx = indexarTn(CATALOGO)
    expect(idx.bySku['sin-foto']).toBeDefined()
  })
  it('las claves van en lower+trim', () => {
    const idx = indexarTn([{ sku: '  Rem-NG  ', name: '  Hola Mundo  ' }])
    expect(idx.bySku['rem-ng']).toBeDefined()
    expect(idx.byName['hola mundo']).toBeDefined()
  })
})

describe('matchTn · SKU → nombre exacto → palabras', () => {
  const idx = indexarTn(CATALOGO, { soloConImagenes: true })

  it('matchea por SKU exacto (case-insensitive)', () => {
    expect(matchTn({ sku: 'rem-ng', name: 'otra cosa' }, idx)?.id).toBe(1)
  })
  it('cae a nombre exacto si el SKU no matchea', () => {
    expect(matchTn({ sku: 'XX', name: 'Buzo Oversize Gris' }, idx)?.id).toBe(2)
  })
  it('cae a "todas las palabras ≥3 letras contenidas"', () => {
    expect(matchTn({ sku: null, name: 'Boxy Negra' }, idx)?.id).toBe(1)
  })
  it('ignora palabras de menos de 3 letras en el fallback', () => {
    // "Buzo Gris" → buzo, gris (ambas ≥3) contenidas en "buzo oversize gris"
    expect(matchTn({ sku: null, name: 'Buzo Gris' }, idx)?.id).toBe(2)
  })
  it('sin match → null', () => {
    expect(matchTn({ sku: 'ZZZ', name: 'Campera Inexistente' }, idx)).toBeNull()
  })
})

describe('imagenDe / imagenesDe', () => {
  const idx = indexarTn(CATALOGO, { soloConImagenes: true })
  it('imagenDe = primera foto del match', () => {
    expect(imagenDe({ sku: 'REM-NG', name: '' }, idx)).toBe('a.jpg')
  })
  it('imagenesDe = todas las fotos', () => {
    expect(imagenesDe({ sku: 'REM-NG', name: '' }, idx)).toEqual(['a.jpg', 'b.jpg'])
  })
  it('sin match → null / []', () => {
    expect(imagenDe({ sku: 'ZZZ', name: 'nada' }, idx)).toBeNull()
    expect(imagenesDe({ sku: 'ZZZ', name: 'nada' }, idx)).toEqual([])
  })
})
