import { describe, expect, it } from 'vitest'
import { coincide, filtrarPorNombre, listasPorStock, ordenParaLaBase, palabrasDeBusqueda } from '@/lib/caja/buscar.core.js'

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
