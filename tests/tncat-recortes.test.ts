import { describe, it, expect } from 'vitest'
import { candidatosAMostrar, candidatosAOcultar, stockPorProductoTn, ventas90PorProductoTn } from '@/lib/tncat/agotados'
import { indexarTn } from '@/lib/tn'
import type { Producto } from '@/lib/etl/tipos'
import type { ProductoFchk } from '@/lib/tncat/tipos'

/**
 * "Mostrar con stock" es el espejo de "Ocultar agotados": la misma regla, al revés. Se
 * prueban juntos porque el error peligroso sería que un producto caiga en las dos listas.
 */
describe('tncat — visibilidad en los dos sentidos', () => {
  const tienda = (id: number, name: string, sku: string, published: boolean, stocks: number[]): ProductoFchk => ({
    id,
    name,
    sku,
    published,
    variantes: stocks.map((stock) => ({ stock })),
  })

  const catalogo = [
    tienda(10, 'Remera Oversize', 'REM-OV', true, [0, 0]), // agotada y visible → ocultar
    tienda(20, 'Buzo Frisa', 'BUZ-FR', false, [0, 7]), // con stock y oculto → mostrar
    tienda(30, 'Campera Puffer', 'CAM-PU', false, [0]), // agotada y ya oculta → ninguna
    tienda(40, 'Star Case', 'STAR', true, [932]), // con stock y visible → ninguna
  ]

  it('ocultar agotados: solo lo agotado que sigue publicado', () => {
    expect(candidatosAOcultar(catalogo).map((c) => c.sku)).toEqual(['REM-OV'])
  })

  it('mostrar con stock: solo lo despublicado que tiene unidades en la tienda', () => {
    expect(candidatosAMostrar(catalogo).map((c) => [c.sku, c.stock])).toEqual([['BUZ-FR', 7]])
  })

  it('ningún producto cae en las dos listas', () => {
    const a = new Set(candidatosAOcultar(catalogo).map((c) => String(c.tnId)))
    const b = candidatosAMostrar(catalogo).map((c) => String(c.tnId))
    expect(b.filter((id) => a.has(id))).toEqual([])
  })

  const gn = (id: string, name: string, sku: string, stock: number): Producto =>
    ({ id, name, sku, stock } as Producto)

  const idx = indexarTn([{ id: 10, name: 'Remera Oversize', sku: 'REM-OV', published: true }])

  it('stockPorProductoTn suma los productos GN que matchean el mismo de la tienda', () => {
    const m = stockPorProductoTn([gn('a', 'Remera Oversize', 'REM-OV', 2), gn('a2', 'Remera Oversize', 'REM-OV', 3)], idx)
    expect(m.get('10')).toBe(5)
  })

  it('ventas90PorProductoTn suma igual que el stock', () => {
    // Es lo que hace manejable la auditoría de fotos en Zattia: 288 productos con color en la
    // variante no se revisan a ojo nunca; los que se venden, sí.
    const conVentas = (id: string, sku: string, sales90: number) =>
      ({ id, name: 'Remera Oversize', sku, sales90 }) as Producto
    const m = ventas90PorProductoTn([conVentas('a', 'REM-OV', 4), conVentas('b', 'REM-OV', 6)], idx)
    expect(m.get('10')).toBe(10)
  })
})
