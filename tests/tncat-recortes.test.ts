import { describe, it, expect } from 'vitest'
import { aplicarRecortes, categoriasDe } from '@/lib/tncat/fchk'
import { candidatosAMostrar, candidatosAOcultar, stockPorProductoTn } from '@/lib/tncat/agotados'
import { indexarTn } from '@/lib/tn'
import type { ProductoFchk } from '@/lib/tncat/tipos'
import type { Producto } from '@/lib/etl/tipos'

const prod = (id: string, over: Partial<ProductoFchk> = {}): ProductoFchk => ({ id, name: 'P' + id, image_count: 1, ...over })

/**
 * Los recortes son lo que convierte la revisión de fotos de una lista de 200 y pico en algo
 * que se puede terminar. Se prueban porque esconder de MÁS es peor que mostrar de más: un
 * producto que se arregla tarde cuesta ventas.
 */
describe('tncat — recortes de la revisión de fotos', () => {
  it('el ignorado no aparece', () => {
    const r = aplicarRecortes([prod('1'), prod('2')], { ignorados: new Set(['1']) })
    expect(r.map((p) => p.id)).toEqual(['2'])
  })

  it('sin stock se saca solo si hay dato de stock', () => {
    const stock = new Map([['1', 0], ['2', 5]])
    const r = aplicarRecortes([prod('1'), prod('2'), prod('3')], { soloConStock: true, stockPorTn: stock })
    // '3' no está en el mapa (el cruce con la tienda no lo encontró) → se muestra igual.
    expect(r.map((p) => p.id)).toEqual(['2', '3'])
  })

  it('sin el recorte de stock, el agotado sigue apareciendo', () => {
    const stock = new Map([['1', 0]])
    expect(aplicarRecortes([prod('1')], { soloConStock: false, stockPorTn: stock })).toHaveLength(1)
  })

  it('filtra por categoría exacta', () => {
    const data = [prod('1', { categories: ['Remeras', 'Sale'] }), prod('2', { categories: ['Pantalones'] }), prod('3')]
    expect(aplicarRecortes(data, { categoria: 'Sale' }).map((p) => p.id)).toEqual(['1'])
    expect(aplicarRecortes(data, { categoria: null }).map((p) => p.id)).toEqual(['1', '2', '3'])
  })

  it('los recortes se acumulan', () => {
    const data = [prod('1', { categories: ['Sale'] }), prod('2', { categories: ['Sale'] })]
    const r = aplicarRecortes(data, { categoria: 'Sale', ignorados: new Set(['2']), soloConStock: true, stockPorTn: new Map([['1', 3]]) })
    expect(r.map((p) => p.id)).toEqual(['1'])
  })

  it('categoriasDe: únicas y ordenadas', () => {
    const data = [prod('1', { categories: ['Sale', 'Remeras'] }), prod('2', { categories: ['Remeras'] })]
    expect(categoriasDe(data)).toEqual(['Remeras', 'Sale'])
  })
})

/**
 * "Mostrar con stock" es el espejo de "Ocultar agotados": el mismo cruce, al revés. Se
 * prueban juntos porque el error peligroso sería que un producto caiga en las dos listas.
 */
describe('tncat — visibilidad en los dos sentidos', () => {
  const gn = (id: string, name: string, sku: string, stock: number): Producto =>
    ({ id, name, sku, stock } as Producto)

  const idx = indexarTn([
    { id: 10, name: 'Remera Oversize', sku: 'REM-OV', published: true },
    { id: 20, name: 'Buzo Frisa', sku: 'BUZ-FR', published: false },
    { id: 30, name: 'Campera Puffer', sku: 'CAM-PU', published: false },
  ] as never)

  const productos = [
    gn('a', 'Remera Oversize', 'REM-OV', 0), // agotada y visible → ocultar
    gn('b', 'Buzo Frisa', 'BUZ-FR', 7), // con stock y oculto → mostrar
    gn('c', 'Campera Puffer', 'CAM-PU', 0), // agotada y ya oculta → ninguna
  ]

  it('ocultar agotados: solo lo agotado que sigue publicado', () => {
    expect(candidatosAOcultar(productos, idx).map((c) => c.sku)).toEqual(['REM-OV'])
  })

  it('mostrar con stock: solo lo despublicado que tiene unidades', () => {
    expect(candidatosAMostrar(productos, idx).map((c) => c.sku)).toEqual(['BUZ-FR'])
  })

  it('ningún producto cae en las dos listas', () => {
    const a = new Set(candidatosAOcultar(productos, idx).map((c) => String(c.tnId)))
    const b = candidatosAMostrar(productos, idx).map((c) => String(c.tnId))
    expect(b.filter((id) => a.has(id))).toEqual([])
  })

  it('stockPorProductoTn suma los productos GN que matchean el mismo de la tienda', () => {
    const m = stockPorProductoTn([gn('a', 'Remera Oversize', 'REM-OV', 2), gn('a2', 'Remera Oversize', 'REM-OV', 3)], idx)
    expect(m.get('10')).toBe(5)
  })
})
