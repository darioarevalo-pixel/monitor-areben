import { describe, it, expect } from 'vitest'
import { nuevosPrimero } from '@/components/panel/PedidosMayoristas'

describe('nuevosPrimero (orden de modelos como la tienda mayorista)', () => {
  it('17 Pro Max arriba, 13 abajo', () => {
    const t = ['iPhone 13', 'iPhone 13 Pro', 'iPhone 14', 'iPhone 16 Pro', 'iPhone 17', 'iPhone 17 Pro', 'iPhone 17 Pro Max', null]
    expect(nuevosPrimero(t, (x) => x)).toEqual(['iPhone 17 Pro Max', 'iPhone 17 Pro', 'iPhone 17', 'iPhone 16 Pro', 'iPhone 14', 'iPhone 13 Pro', 'iPhone 13', null])
  })
})
