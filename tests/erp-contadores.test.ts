import { describe, expect, it } from 'vitest'
import { contadoresDe, contar } from '@/lib/erp/contadores-erp'

describe('contadores rojos del ERP', () => {
  it('cuenta negativos en Stock y productos sin costo en Productos, en el menú y en la pestaña', () => {
    expect(contadoresDe(10, 4)).toEqual({ stock: 10, 'stock/stock': 10, productos: 4, 'productos/productos': 4 })
  })
  it('sin nada para hacer no hay contador (⛔ un 0 rojo) y lo que no se leyó tampoco', () => {
    expect(contadoresDe(0, 0)).toEqual({})
    expect(contadoresDe(undefined, 3)).toEqual({ productos: 3, 'productos/productos': 3 })
  })
})

describe('contar por línea (la misma cuenta que la pantalla a la que lleva)', () => {
  const st = (linea: string, negativo: boolean) => ({ linea, negativo, disponible: negativo ? -1 : 1, estanteria: 0, enPedidos: 0, deps: { local: 0 }, nombre: 'x', talleNombre: 'x', sku: null, barcode: null })
  const pr = (linea: string, costo: number | null) => ({ linea, costo, disponible: 1, tn: 'ok', precios: { mayorista: 1 }, proveedor: 'p', sinBarra: false, nombre: 'x', categoria: null, variantes: [] })
  const crudo = {
    filasStock: [st('zattia', true), st('stunned', true), st('stunned', true), st('stunned', false)],
    filasProductos: [pr('zattia', null), pr('stunned', null), pr('stunned', 5)],
  } as unknown as Parameters<typeof contar>[0]
  it('Zattia y Stunned no se suman: cada línea ve lo suyo', () => {
    expect(contar(crudo, 'zattia')).toEqual({ stock: 1, 'stock/stock': 1, productos: 1, 'productos/productos': 1 })
    expect(contar(crudo, 'stunned')).toEqual({ stock: 2, 'stock/stock': 2, productos: 1, 'productos/productos': 1 })
  })
  it('sin línea (BDI) cuenta todo', () => {
    expect(contar(crudo, '').stock).toBe(3)
  })
})
