/**
 * La lista de «Descripción y medidas», y el caso que la escribió.
 *
 * 🔴 **2-sep-2026, reportado por Bruno desde el local**: *«están queriendo poner descripción y
 * medidas, pero cuando seleccionan una opción del desplegable se le cierra y no guarda»* — el
 * usuario de Camila Quintana. Medido contra la base de Zattia antes de tocar nada: ese mediodía
 * hubo **cuatro productos con UN solo atributo cargado** (`tela`, el primer desplegable de la
 * ficha), a un minuto uno del otro, y ninguno siguió. Estaba **todo guardado**: lo que se cerraba
 * era la pantalla, porque con el filtro «Sin ficha cargada» puesto la fila dejaba de cumplirlo en
 * el mismo gesto que la guardaba.
 *
 * ⇒ lo que estos tests amarran es que **el filtro decide qué se EMPIEZA a mirar, ⛔ no qué se
 * puede terminar de cargar**.
 */
import { describe, expect, it } from 'vitest'
import { cumpleFiltro, familiaDeProducto, listaDe, sinFicha, ultimasTandas, type FilaLista, type ProductoLista } from '../lib/tn-desc/lista.core'
import type { Cargados } from '../lib/tn-desc/atributos'

const prod = (o: Partial<ProductoLista> = {}): ProductoLista => ({
  id: '1',
  name: 'PANTALON ASH',
  created_at: '2026-05-19T10:00:00Z',
  published: true,
  prosa: { banda: 'ok', largo: 121 },
  familia: 'pantalon',
  ...o,
})

const opciones = (o: Partial<Parameters<typeof listaDe>[1]> = {}) => ({
  filtro: 'sin-ficha' as const,
  cola: {} as Record<string, FilaLista | undefined>,
  atributos: {} as Record<string, Cargados | undefined>,
  tandas: new Set<string>(),
  abierto: null as string | null,
  ...o,
})

describe('🔴 la fila ABIERTA no se va de la lista aunque deje de cumplir el filtro', () => {
  const p = prod({ id: '345200035' })

  it('el caso real: con «Sin ficha cargada», guardar la tela la sacaba de la lista en el mismo gesto', () => {
    const conLaTela = opciones({ atributos: { '345200035': { tela: 'hilo' } } })
    // El filtro, solo, dice la verdad: ya no está sin ficha.
    expect(cumpleFiltro(p, { filtro: 'sin-ficha', cola: conLaTela.cola, atributos: conLaTela.atributos, tandas: conLaTela.tandas })).toBe(false)
    // Y sin `abierto`, la fila desaparece — eso es lo que se leía como «se cierra y no guarda».
    expect(listaDe([p], conLaTela)).toEqual([])
    // Con la fila abierta, se queda: alguien la está cargando.
    expect(listaDe([p], { ...conLaTela, abierto: '345200035' })).toEqual([p])
  })

  it('al cerrarla recién ahí se va: el filtro vuelve a mandar', () => {
    const o = opciones({ atributos: { '345200035': { tela: 'hilo' } }, abierto: '345200035' })
    expect(listaDe([p], o)).toHaveLength(1)
    expect(listaDe([p], { ...o, abierto: null })).toHaveLength(0)
  })

  it('la excepción es de UNA fila: las otras que dejan de cumplir sí se van', () => {
    const otro = prod({ id: '2', name: 'SHORT LEXA' })
    const o = opciones({
      atributos: { '345200035': { tela: 'hilo' }, '2': { tela: 'lycra' } },
      abierto: '345200035',
    })
    expect(listaDe([p, otro], o).map((x) => x.id)).toEqual(['345200035'])
  })

  it('⛔ y no resucita a un despublicado: `abierto` no es una llave maestra', () => {
    const baja = prod({ id: '9', published: false })
    expect(listaDe([baja], opciones({ filtro: 'todos', abierto: '9' }))).toEqual([])
  })
})

describe('sin ficha = se sabe qué prenda es y no hay ni un dato', () => {
  it('con la familia de la tienda y la ficha vacía, sí', () => {
    expect(sinFicha(prod(), undefined, undefined)).toBe(true)
    expect(sinFicha(prod(), undefined, {})).toBe(true)
  })

  it('con un solo atributo cargado, ya no', () => {
    expect(sinFicha(prod(), undefined, { tela: 'hilo' })).toBe(false)
  })

  it('⛔ sin familia NO cuenta: falta la categoría en la tienda, no la ficha', () => {
    expect(sinFicha(prod({ familia: null }), undefined, {})).toBe(false)
  })

  it('la familia elegida a mano alcanza para que cuente', () => {
    expect(sinFicha(prod({ familia: null }), { familia: 'tops', estado: 'borrador' }, {})).toBe(true)
  })
})

describe('🔑 la categoría de TiendaNube gana sobre la elegida a mano', () => {
  it('si mañana alguien se la pone en la tienda, la familia se corrige sola', () => {
    expect(familiaDeProducto(prod({ familia: 'vestidos' }), { familia: 'tops', estado: 'borrador' })).toBe('vestidos')
  })

  it('y sin categoría manda la de la cola', () => {
    expect(familiaDeProducto(prod({ familia: null }), { familia: 'tops', estado: 'borrador' })).toBe('tops')
    expect(familiaDeProducto(prod({ familia: null }), undefined)).toBe(null)
  })
})

describe('los filtros', () => {
  const cola: Record<string, FilaLista | undefined> = {
    '1': { familia: 'pantalon', estado: 'aprobado' },
    '2': { familia: 'tops', estado: 'falla' },
  }
  const base = { cola, atributos: {} as Record<string, Cargados | undefined>, tandas: new Set(['2026-08-12']) }

  it('«últimas 2 tandas» mira la FECHA de alta, no los días que pasaron', () => {
    expect(cumpleFiltro(prod({ created_at: '2026-08-12T09:00:00Z' }), { ...base, filtro: 'ultimas-tandas' })).toBe(true)
    expect(cumpleFiltro(prod({ created_at: '2026-05-19T09:00:00Z' }), { ...base, filtro: 'ultimas-tandas' })).toBe(false)
  })

  it('«sin descripción» y «corta» salen de la prosa', () => {
    expect(cumpleFiltro(prod({ prosa: { banda: 'nada', largo: 0 } }), { ...base, filtro: 'sin-desc' })).toBe(true)
    expect(cumpleFiltro(prod({ prosa: { banda: 'corta', largo: 40 } }), { ...base, filtro: 'corta' })).toBe(true)
    expect(cumpleFiltro(prod(), { ...base, filtro: 'sin-desc' })).toBe(false)
  })

  it('«en la tienda» incluye la que falló al publicar: es donde está su cartel', () => {
    expect(cumpleFiltro(prod({ id: '2' }), { ...base, filtro: 'en-la-tienda' })).toBe(true)
    expect(cumpleFiltro(prod({ id: '1' }), { ...base, filtro: 'aprobados' })).toBe(true)
    expect(cumpleFiltro(prod({ id: '1' }), { ...base, filtro: 'en-la-tienda' })).toBe(false)
  })

  it('«todos» no filtra nada', () => {
    expect(cumpleFiltro(prod({ id: '99' }), { ...base, filtro: 'todos' })).toBe(true)
  })
})

describe('el orden: primero los mudos, y estable mientras se carga', () => {
  it('ordena por largo de prosa y desempata por nombre', () => {
    const mudo = prod({ id: 'a', name: 'ZAPA', prosa: { banda: 'nada', largo: 0 } })
    const corto = prod({ id: 'b', name: 'ALFA', prosa: { banda: 'corta', largo: 40 } })
    expect(listaDe([corto, mudo], opciones({ filtro: 'todos' })).map((p) => p.id)).toEqual(['a', 'b'])
  })

  it('🔑 cargar un atributo NO mueve la fila de lugar: el orden no mira la ficha', () => {
    const uno = prod({ id: 'a', name: 'ALFA', prosa: { banda: 'corta', largo: 40 } })
    const dos = prod({ id: 'b', name: 'BETA', prosa: { banda: 'corta', largo: 90 } })
    const o = opciones({ filtro: 'todos' })
    expect(listaDe([uno, dos], o).map((p) => p.id)).toEqual(['a', 'b'])
    expect(listaDe([uno, dos], { ...o, atributos: { a: { tela: 'hilo' } } }).map((p) => p.id)).toEqual(['a', 'b'])
  })
})

describe('las últimas tandas', () => {
  it('son las 2 FECHAS de alta más nuevas, aunque estén lejos en el calendario', () => {
    const ps = [
      prod({ id: '1', created_at: '2026-08-12T10:00:00Z' }),
      prod({ id: '2', created_at: '2026-08-13T10:00:00Z' }),
      prod({ id: '3', created_at: '2026-05-19T10:00:00Z' }),
    ]
    expect([...ultimasTandas(ps)].sort()).toEqual(['2026-08-12', '2026-08-13'])
  })
})
