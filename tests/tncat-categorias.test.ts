import { describe, it, expect } from 'vitest'
import { buscar, enCategoria, itemsParaAplicar, nuevasCategorias, tieneCategoria } from '@/lib/tncat/categorias'
import { agruparPorCategoria, SIN_CATEGORIA, type GrupoSinStock } from '@/lib/tncat/variantes-sin-stock'
import type { ProductoCat } from '@/lib/tncat/tipos'

const p = (id: string, name: string, cats: (string | number)[] = [], sku?: string): ProductoCat => ({
  id,
  name,
  sku,
  category_ids: cats,
})

/**
 * TiendaNube no tiene "quitar categoría": se manda el conjunto COMPLETO. Todo el riesgo está
 * en calcular mal ese array — de más borra categorías que nadie tocó, de menos no hace nada.
 */
describe('tncat — agregar y quitar categorías', () => {
  const prods = [p('1', 'Remera', ['10', '20']), p('2', 'Buzo', ['20'], 'BUZ'), p('3', 'Campera', [])]

  it('enCategoria devuelve lo que está adentro hoy, ordenado', () => {
    expect(enCategoria(prods, '20').map((x) => x.name)).toEqual(['Buzo', 'Remera'])
    expect(enCategoria(prods, '99')).toEqual([])
  })

  it('quitar saca SOLO esa categoría y conserva las demás', () => {
    expect(nuevasCategorias(prods[0], '10', 'quitar')).toEqual(['20'])
  })

  it('agregar suma sin duplicar ni perder las que ya tenía', () => {
    expect(nuevasCategorias(prods[1], '10', 'agregar')).toEqual(['20', '10'])
  })

  it('si no hay nada que cambiar devuelve null (no se escribe al pedo)', () => {
    expect(nuevasCategorias(prods[0], '10', 'agregar')).toBeNull() // ya la tiene
    expect(nuevasCategorias(prods[2], '10', 'quitar')).toBeNull() // no la tiene
  })

  it('itemsParaAplicar arma el lote y descarta lo que no cambia', () => {
    const items = itemsParaAplicar(prods, '20', 'quitar')
    expect(items.map((i) => i.id)).toEqual(['1', '2']) // la Campera no la tenía
    expect(items[0].nuevas).toEqual(['10'])
  })

  it('el buscador excluye lo que ya está en la categoría y matchea por nombre o SKU', () => {
    expect(buscar(prods, 'bu', '20').map((x) => x.id)).toEqual([]) // el Buzo ya está en la 20
    expect(buscar(prods, 'bu', '10').map((x) => x.id)).toEqual(['2'])
    expect(buscar(prods, 'BUZ', '10').map((x) => x.id)).toEqual(['2']) // por SKU
    expect(buscar(prods, '', '10')).toEqual([]) // sin texto no lista todo
  })

  it('tieneCategoria compara como texto (los ids llegan como número o string)', () => {
    expect(tieneCategoria(p('1', 'X', [10]), '10')).toBe(true)
  })
})

describe('tncat — variantes sin stock agrupadas por categoría', () => {
  const g = (nombre: string, categorias: string[]): GrupoSinStock =>
    ({ tnId: nombre, nombre, tnNombre: nombre, sku: null, enteroAgotado: false, categorias, variantes: [] })

  it('un producto en dos categorías aparece en las dos', () => {
    const r = agruparPorCategoria([g('Remera', ['Verano', 'Sale'])])
    expect(r.map((x) => x.categoria)).toEqual(['Sale', 'Verano'])
  })

  it('los que no tienen categoría van juntos al final, no desaparecen', () => {
    const r = agruparPorCategoria([g('A', []), g('B', ['Verano'])])
    expect(r.map((x) => x.categoria)).toEqual(['Verano', SIN_CATEGORIA])
    expect(r[1].grupos.map((x) => x.nombre)).toEqual(['A'])
  })
})
