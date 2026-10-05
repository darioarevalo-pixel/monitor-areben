import { describe, expect, it } from 'vitest'
import { coincide, filtrarPorNombre, listasPorStock, ordenParaLaBase, palabrasDeBusqueda, productosPorStock } from '@/lib/caja/buscar.core.js'

/** Caja: buscar una prenda por nombre y talle cuando no se escanea (Bruno, 4-oct-2026). */
describe('caja · buscar por nombre', () => {
  const corsetS = { product_name: 'CORSET FRANK Verde', size_name: 'S' }

  it('cada palabra como COMIENZO de una del nombre, en cualquier orden', () => {
    expect(coincide(corsetS, palabrasDeBusqueda('cors fran'))).toBe(true)
    expect(coincide(corsetS, palabrasDeBusqueda('verde corset'))).toBe(true)
    expect(coincide(corsetS, palabrasDeBusqueda('corset rojo'))).toBe(false)
  })

  it('el talle va ENTERO: la «s» ⛔ cae adentro de «corSet»', () => {
    expect(coincide(corsetS, palabrasDeBusqueda('frank s'))).toBe(true)
    expect(coincide({ ...corsetS, size_name: 'M' }, palabrasDeBusqueda('frank s'))).toBe(false)
    expect(coincide({ product_name: 'TOP EVA', size_name: 'Variante Única' }, palabrasDeBusqueda('eva unica'))).toBe(true)
  })

  it('sin letras ⛔ es búsqueda por nombre (es un código)', () => {
    expect(palabrasDeBusqueda('000001')).toEqual([])
    expect(palabrasDeBusqueda('  Córset  FRANK ')).toEqual(['corset', 'frank'])
  })

  it('a la base se le pregunta por la más larga primero', () => {
    expect(ordenParaLaBase(['s', 'corset', 'eva', 'corset'])).toEqual(['corset', 'eva', 's'])
  })

  it('el tope corta la lista y cuenta las que quedaron afuera', () => {
    const g = Array.from({ length: 30 }, (_, i) => ({ variante: { product_name: `TOP ${i}`, size_name: 'S' }, espejo: { local: 1, deposito: 0 } }))
    const r = filtrarPorNombre(g, ['top'])
    expect([r.grupos.length, r.mas]).toEqual([24, 6])
  })

  it('la lista dinámica separa con stock en el LOCAL de sin stock (el Depósito ⛔ cuenta)', () => {
    const g = (talle: string, local: number, deposito = 0) => ({ variante: { product_name: 'CORSET FRANK Verde', size_name: talle }, espejo: { local, deposito } })
    const otra = { variante: { product_name: 'TOP EVA', size_name: 'S' }, espejo: { local: 3, deposito: 0 } }
    const r = listasPorStock([g('S', 2), g('M', 0, 9), g('L', 1), g('XL', 0), g('XS', 0), otra], ['frank'])
    expect(r.conStock.map((x: { variante: { size_name: string } }) => x.variante.size_name)).toEqual(['L', 'S'])
    expect(r.sinStock.map((x: { variante: { size_name: string } }) => x.variante.size_name)).toEqual(['M', 'XL', 'XS'])
    expect([r.masCon, r.masSin]).toEqual([0, 0])
  })

  it('cada lista tiene su tope y cuenta las que quedaron afuera', () => {
    const g = Array.from({ length: 30 }, (_, i) => ({ variante: { product_name: `TOP ${i}`, size_name: 'S' }, espejo: { local: i % 2, deposito: 0 } }))
    const r = listasPorStock(g, ['top'], 10)
    expect([r.conStock.length, r.masCon, r.sinStock.length, r.masSin]).toEqual([10, 5, 10, 5])
  })
})

/** El POS por producto (Bruno, 5-oct): la tarjeta es el producto y la variante se elige en el modal. */
describe('caja · productosPorStock', () => {
  const v = (product_id: number, product_name: string, size_name: string, local: number) => ({ variante: { product_id, size_id: product_id * 100 + local + size_name.length, product_name, size_name }, espejo: { local, deposito: 0 } })
  const grupos = [
    v(1, 'CORSET FRANK', 'Verde - S', 3),
    v(1, 'CORSET FRANK', 'Bordó - M', 0),
    v(1, 'CORSET FRANK', 'Bordó - S', 5),
    v(2, 'CORSET FRANK SE', 'Gris - U', 0),
    v(3, 'TOP EVA', 'S', 2),
  ]

  it('🔑 agrupa por producto, con las variantes del local primero y el resto después', () => {
    const r = productosPorStock(grupos, palabrasDeBusqueda('frank'))
    expect(r.conStock.map((p: { product_id: number }) => p.product_id)).toEqual([1])
    expect(r.conStock[0].local).toBe(8)
    expect(r.conStock[0].variantes.map((x: { size_name: string }) => x.size_name)).toEqual(['Bordó - S', 'Verde - S', 'Bordó - M'])
    // El producto sin ninguna variante en el local va aparte (tras «Mostrar sin stock»).
    expect(r.sinStock.map((p: { product_id: number }) => p.product_id)).toEqual([2])
  })

  it('el tope cuenta PRODUCTOS, ⛔ variantes', () => {
    const muchos = Array.from({ length: 30 }, (_, i) => v(10, 'TOP MIL', `C${i}`, 1))
    const r = productosPorStock([...muchos, v(11, 'TOP DOS', 'S', 1)], palabrasDeBusqueda('top'), 2)
    expect(r.conStock).toHaveLength(2)
    expect(r.conStock.find((p: { product_id: number }) => p.product_id === 10).variantes).toHaveLength(30)
    expect(r.masCon).toBe(0)
  })
})

