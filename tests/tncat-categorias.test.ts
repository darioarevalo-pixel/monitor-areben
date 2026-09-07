import { describe, it, expect } from 'vitest'
import {
  buscar,
  enCategoria,
  estaOculto,
  etiquetaAntiguedad,
  itemsParaAplicar,
  nuevasCategorias,
  quedarianSinCategoria,
  tieneCategoria,
} from '@/lib/tncat/categorias'
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

/**
 * La foto y la antigüedad son lo que hace decidible «esto ya no es NEW IN». El riesgo no es
 * dibujarlas mal: es ORDENAR mal —que algo sin fecha encabece «lo más viejo»— y que el filtro de
 * texto se lleve puesto lo que ya estaba tildado para sacar.
 */
describe('tncat — mirar la categoría por dentro: orden por antigüedad y búsqueda', () => {
  const q = (id: string, name: string, created_at: string | null): ProductoCat => ({
    id,
    name,
    category_ids: ['20'],
    created_at,
  })
  const ahora = new Date('2026-09-07T12:00:00Z').getTime()
  const prods = [
    q('nuevo', 'Top Drip', '2026-09-02T14:22:29+0000'),
    q('viejo', 'Top Kaira', '2025-10-16T17:47:38+0000'),
    q('mudo', 'Top Sin Fecha', null),
  ]

  it('“más viejos primero” encabeza por el que hace más que entró', () => {
    expect(enCategoria(prods, '20', { orden: 'antiguos', ahora }).map((x) => x.id)).toEqual(['viejo', 'nuevo', 'mudo'])
  })

  it('el que no tiene fecha va al final en LOS DOS sentidos: no se hace pasar por viejo ni por nuevo', () => {
    expect(enCategoria(prods, '20', { orden: 'antiguos', ahora }).at(-1)!.id).toBe('mudo')
    expect(enCategoria(prods, '20', { orden: 'nuevos', ahora }).at(-1)!.id).toBe('mudo')
  })

  it('sin orden pedido sigue siendo alfabético (lo que veía el que ya la usaba)', () => {
    expect(enCategoria(prods, '20').map((x) => x.name)).toEqual(['Top Drip', 'Top Kaira', 'Top Sin Fecha'])
  })

  it('el buscador de adentro filtra por nombre o SKU, y NO cambia lo que hay adentro', () => {
    expect(enCategoria(prods, '20', { q: 'kaira' }).map((x) => x.id)).toEqual(['viejo'])
    // El invariante que sostiene el lote: lo que se aplica sale de la lista SIN filtrar.
    expect(enCategoria(prods, '20').length).toBe(3)
    expect(itemsParaAplicar(enCategoria(prods, '20'), '20', 'quitar').map((i) => i.id)).toEqual(['nuevo', 'viejo', 'mudo'])
  })

  it('una fecha futura no cuenta como espera negativa: queda en 0 días, adelante de todo', () => {
    const futuro = [q('futuro', 'Top Futuro', '2026-12-01T00:00:00+0000'), prods[1]]
    expect(enCategoria(futuro, '20', { orden: 'nuevos', ahora }).map((x) => x.id)).toEqual(['futuro', 'viejo'])
  })
})

describe('tncat — lo que dice la fila sobre la antigüedad', () => {
  const ahora = new Date('2026-09-07T12:00:00Z').getTime()

  it('distingue los tres casos, y “no se sabe” NO sale como 0 días', () => {
    expect(etiquetaAntiguedad('2025-10-16T17:47:38+0000', ahora)).toBe('hace 325 d')
    expect(etiquetaAntiguedad('2026-09-07T01:00:00+0000', ahora)).toBe('entró hoy')
    expect(etiquetaAntiguedad(null, ahora)).toBe('sin fecha')
    expect(etiquetaAntiguedad('no es una fecha', ahora)).toBe('sin fecha')
  })

  it('una fecha futura dice “entró hoy”, no “hace -85 d”', () => {
    expect(etiquetaAntiguedad('2026-12-01T00:00:00+0000', ahora)).toBe('entró hoy')
  })
})

/**
 * Sacar de a 91 no es sacar de a uno 91 veces: aparece un modo de falla que de a uno no existía
 * —dejar productos sin NINGUNA categoría, o sea fuera de la navegación de la tienda— y el filtro
 * que arma la tanda es el que decide a quién se le escribe.
 */
describe('tncat — sacar en tanda a los ocultos', () => {
  const p2 = (id: string, name: string, cats: string[], published?: boolean): ProductoCat => ({
    id,
    name,
    category_ids: cats,
    published,
  })
  const prods = [
    p2('1', 'Oculto con otra', ['20', '30'], false),
    p2('2', 'Oculto sin otra', ['20'], false),
    p2('3', 'Visible', ['20', '30'], true),
    p2('4', 'Sin published', ['20']),
  ]

  it('“sólo los ocultos” deja fuera al visible Y al que no dice nada (en TN eso es publicado)', () => {
    expect(enCategoria(prods, '20', { estado: 'ocultos' }).map((x) => x.id)).toEqual(['1', '2'])
    // El orden por defecto es alfabético: "Sin published" va antes que "Visible".
    expect(enCategoria(prods, '20', { estado: 'visibles' }).map((x) => x.id)).toEqual(['4', '3'])
    expect(enCategoria(prods, '20', { estado: 'todos' }).length).toBe(4)
  })

  it('el filtro se combina con la búsqueda, no la reemplaza', () => {
    expect(enCategoria(prods, '20', { estado: 'ocultos', q: 'sin otra' }).map((x) => x.id)).toEqual(['2'])
  })

  it('avisa QUIÉNES quedan sin ninguna categoría, no cuántos', () => {
    const items = itemsParaAplicar(enCategoria(prods, '20', { estado: 'ocultos' }), '20', 'quitar')
    expect(items.length).toBe(2)
    expect(quedarianSinCategoria(items)).toEqual(['Oculto sin otra'])
  })

  it('al AGREGAR nadie queda sin categoría: la lista es vacía', () => {
    const items = itemsParaAplicar([p2('9', 'Nuevo', [])], '20', 'agregar')
    expect(quedarianSinCategoria(items)).toEqual([])
  })

  it('estaOculto no confunde “no dice” con “oculto”', () => {
    expect(estaOculto(prods[1])).toBe(true)
    expect(estaOculto(prods[3])).toBe(false)
  })
})
