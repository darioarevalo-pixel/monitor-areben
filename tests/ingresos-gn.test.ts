import { describe, it, expect } from 'vitest'
import { indiceNombresGN, productoEnGN } from '@/lib/ingresos/gn'

/**
 * El ✓ "ya está en GN" de la columna de diseño. Lo que se prueba acá no es el cruce feliz sino
 * la conservadora: cuándo NO tiene que aparecer. Un ✓ de más manda a nadie a cargar el producto.
 */
describe('ingresos/gn', () => {
  const espejo = [
    { name: 'Funda Corazón Rosa', sku: 'FCR-01' },
    { name: '  Funda   Ola  ', sku: 'FO-02' },
    { name: '', sku: 'VACIO' },
    { name: null, sku: 'NULO' },
  ]

  it('encuentra el producto por nombre exacto, sin mirar mayúsculas, acentos ni espacios de más', () => {
    const i = indiceNombresGN(espejo)
    expect(productoEnGN('Funda Corazón Rosa', i)?.sku).toBe('FCR-01')
    expect(productoEnGN('funda corazon rosa', i)?.sku).toBe('FCR-01')
    expect(productoEnGN('  FUNDA   CORAZÓN ROSA ', i)?.sku).toBe('FCR-01')
    // el que viene sucio del espejo también se normaliza al indexar
    expect(productoEnGN('funda ola', i)?.sku).toBe('FO-02')
  })

  it('no matchea por parecido: una letra distinta ya no es el mismo producto', () => {
    const i = indiceNombresGN(espejo)
    expect(productoEnGN('Funda Corazón Rosas', i)).toBeNull()
    expect(productoEnGN('Funda Corazon', i)).toBeNull()
    expect(productoEnGN('Corazón Rosa', i)).toBeNull()
  })

  it('un diseño sin nombre nunca matchea, ni contra los productos sin nombre del espejo', () => {
    const i = indiceNombresGN(espejo)
    expect(productoEnGN('', i)).toBeNull()
    expect(productoEnGN('   ', i)).toBeNull()
    expect(productoEnGN(null, i)).toBeNull()
    expect(productoEnGN(undefined, i)).toBeNull()
  })

  it('sin espejo el índice queda vacío y no se afirma nada', () => {
    expect(productoEnGN('Funda Corazón Rosa', indiceNombresGN(null))).toBeNull()
    expect(productoEnGN('Funda Corazón Rosa', indiceNombresGN(undefined))).toBeNull()
    expect(productoEnGN('Funda Corazón Rosa', indiceNombresGN([]))).toBeNull()
  })

  it('con dos productos de igual nombre gana el primero: la pregunta es si existe, no cuál', () => {
    const i = indiceNombresGN([
      { name: 'Repetido', sku: 'A' },
      { name: 'repetido', sku: 'B' },
    ])
    expect(i.size).toBe(1)
    expect(productoEnGN('REPETIDO', i)?.sku).toBe('A')
  })
})
