import { describe, expect, it } from 'vitest'
import { contadoresDe } from '@/lib/erp/contadores-erp'

describe('contadores rojos del ERP', () => {
  it('cuenta negativos en Stock y productos sin costo en Productos, en el menú y en la pestaña', () => {
    expect(contadoresDe(10, 4)).toEqual({ stock: 10, 'stock/stock': 10, productos: 4, 'productos/productos': 4 })
  })
  it('sin nada para hacer no hay contador (⛔ un 0 rojo) y lo que no se leyó tampoco', () => {
    expect(contadoresDe(0, 0)).toEqual({})
    expect(contadoresDe(undefined, 3)).toEqual({ productos: 3, 'productos/productos': 3 })
  })
})
