import { describe, expect, it } from 'vitest'
import { coincideNombre, palabraParaBuscar, palabrasDelNombre } from '@/lib/crm/nombre.core.js'

describe('comparar por nombre (sólo para sugerir)', () => {
  it('saca la ciudad y los agregados', () => {
    expect(palabrasDelNombre('Martina Macri - Los Polvorines')).toEqual(['martina', 'macri'])
    expect(palabrasDelNombre('Micaela Silva mayorista')).toEqual(['micaela', 'silva'])
    expect(palabrasDelNombre('Anna Carreño (Córdoba)')).toEqual(['anna', 'carreño'])
  })

  it('coincide en cualquier orden y sin acentos', () => {
    const p = palabrasDelNombre('Martina Macri - Los Polvorines')
    expect(coincideNombre(p, 'Martina Macri')).toBe(true)
    expect(coincideNombre(p, 'macri martina')).toBe(true)
    expect(coincideNombre(palabrasDelNombre('Martin Lapuchevsky'), 'Martín Lapuchevsky')).toBe(true)
  })

  it('no coincide con otra persona del mismo nombre', () => {
    expect(coincideNombre(palabrasDelNombre('Micaela Apaza'), 'Micaela Silva')).toBe(false)
  })

  it('con una sola palabra no sugiere nada', () => {
    expect(coincideNombre(palabrasDelNombre('Martina'), 'Martina Macri')).toBe(false)
  })

  it('busca por la palabra más larga', () => {
    expect(palabraParaBuscar(['anna', 'carreño'])).toBe('carreño')
  })
})
