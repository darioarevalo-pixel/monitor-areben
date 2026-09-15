import { describe, it, expect } from 'vitest'
import { candidatosAOcultar, stockEnTienda } from '@/lib/tncat/agotados'
import type { ProductoFchk, VarianteFchk } from '@/lib/tncat/tipos'

const tn = (over: Partial<ProductoFchk>, stocks: (number | null)[]): ProductoFchk => ({
  id: 111,
  name: 'Funda A',
  sku: 'A',
  published: true,
  variantes: stocks.map((stock): VarianteFchk => ({ stock })),
  ...over,
})

describe('stockEnTienda', () => {
  it('suma las variantes', () => {
    expect(stockEnTienda(tn({}, [0, 3, 2]))).toBe(5)
  })

  it('un negativo cuenta como 0', () => {
    expect(stockEnTienda(tn({}, [-1, 0]))).toBe(0)
  })

  it('una variante sin gestión de stock (null = ilimitado) → no se sabe, ⛔ no 0', () => {
    expect(stockEnTienda(tn({}, [0, null]))).toBeNull()
  })

  it('sin variantes (payload liviano) → no se sabe', () => {
    expect(stockEnTienda({ id: 1, name: 'X' })).toBeNull()
    expect(stockEnTienda(tn({}, []))).toBeNull()
  })
})

describe('candidatosAOcultar', () => {
  it('publicado con todas las variantes en 0 → candidato, con el id de TN', () => {
    const out = candidatosAOcultar([tn({}, [0, 0])])
    expect(out).toEqual([{ tnId: 111, nombre: 'Funda A', sku: 'A', stock: 0 }])
  })

  it('con stock en UNA variante → NO es candidato (TN no oculta variantes sueltas)', () => {
    expect(candidatosAOcultar([tn({}, [0, 0, 1])])).toEqual([])
  })

  it('agotado pero ya despublicado → NO es candidato', () => {
    expect(candidatosAOcultar([tn({ published: false }, [0])])).toEqual([])
  })

  it('published undefined se asume publicado (default de TN)', () => {
    expect(candidatosAOcultar([tn({ published: undefined }, [0])])).toHaveLength(1)
  })

  it('stock sin gestionar → NO es candidato', () => {
    expect(candidatosAOcultar([tn({}, [null])])).toEqual([])
  })

  it('ordena por nombre', () => {
    const out = candidatosAOcultar([tn({ id: 2, name: 'Zeta' }, [0]), tn({ id: 1, name: 'Alfa' }, [0])])
    expect(out.map((c) => c.nombre)).toEqual(['Alfa', 'Zeta'])
  })
})
