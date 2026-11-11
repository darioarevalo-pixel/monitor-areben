import { describe, expect, it } from 'vitest'

import { ordenarModelo, ordenarTalle } from '@/lib/reposicion/grupos'

describe('orden de talles (Darío 11-nov: del S al XL)', () => {
  it('ropa de chico a grande', () => {
    expect(['L', 'M', 'S', 'XL'].sort(ordenarModelo)).toEqual(['S', 'M', 'L', 'XL'])
    expect(['XXL', 'XS', 'L', '2XL'].sort(ordenarTalle)).toEqual(['XS', 'L', 'XXL', '2XL'])
  })
  it('números de menor a mayor', () => {
    expect(['40', '36', '38'].sort(ordenarModelo)).toEqual(['36', '38', '40'])
  })
  it('lo que no es talle queda como vino', () => {
    expect(['Negro', 'Azul', 'Rojo'].sort(ordenarModelo)).toEqual(['Negro', 'Azul', 'Rojo'])
  })
  it('los iPhone siguen igual', () => {
    expect(['iPhone 15 Pro', 'iPhone 13', 'iPhone 15'].sort(ordenarModelo)).toEqual(['iPhone 13', 'iPhone 15', 'iPhone 15 Pro'])
  })
})
