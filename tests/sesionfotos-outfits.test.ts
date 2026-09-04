/**
 * La clasificación de outfits de una sesión de fotos: qué zona ocupa cada prenda y qué le falta
 * a cada bolsa. Fija las reglas que dictó Bruno el 3-sep-2026 —**un outfit es arriba + abajo, o
 * una prenda entera**— y las que salieron de MEDIR el catálogo el 4-sep.
 *
 * 🔴 Los casos de acá ⛔ no son inventados: los nombres son los reales de Zattia y BDI, y las
 * trampas (`MINI BAG`, `BABY TEE`, `FAJA`) son las que la medición cazó.
 */
import { describe, it, expect } from 'vitest'
import { alertasDe, aplicaOutfits, catsDeGN, esPrendaDeOutfit, sinZona, zonaEfectiva, zonaSugerida, zonasDe } from '../lib/sesionfotos/outfits'
import { conZona } from '../lib/sesionfotos/core'
import type { ItemSolicitud, Solicitud } from '../lib/sesionfotos/tipos'

const item = (vid: string, nombre: string, bolsa?: number, pid = vid): ItemSolicitud => ({
  vid,
  pid,
  sid: '1',
  nombre,
  variante: 'U',
  sku: `SKU-${vid}`,
  qty: 1,
  origen: 'deposito',
  ...(bolsa == null ? {} : { bolsa }),
})

const solicitud = (items: ItemSolicitud[]): Solicitud => ({
  id: 's1',
  fecha: '2026-09-04',
  creado: 1,
  creadoPor: 'test',
  descripcion: 'sesión',
  estado: 'pendiente',
  items,
})

describe('zonaSugerida — el NOMBRE manda', () => {
  it('cada zona sale de la primera palabra, con los nombres reales del catálogo', () => {
    expect(zonaSugerida('TOP LEVEL')).toBe('arriba')
    expect(zonaSugerida('SWEATER CHELSEA')).toBe('arriba')
    expect(zonaSugerida('BLUSA MARTINA')).toBe('arriba')
    expect(zonaSugerida('SHORT HILTON')).toBe('abajo')
    expect(zonaSugerida('JEAN WIDE')).toBe('abajo')
    expect(zonaSugerida('MINI ANNE')).toBe('abajo')
    expect(zonaSugerida('VESTIDO BLAZE')).toBe('entero')
    expect(zonaSugerida('MONO ELENA')).toBe('entero')
  })

  it('las frases de dos palabras le ganan a la primera: MINI BAG es una cartera, no una pollera', () => {
    expect(zonaSugerida('MINI ANNE')).toBe('abajo')
    expect(zonaSugerida('MINI BAG DISTRICT')).toBeNull()
    expect(zonaSugerida('MINI CLUTCH')).toBeNull()
  })

  it('BABY TEE es una remera, ⛔ no ropa de bebé — son 31 productos con stock', () => {
    expect(zonaSugerida('BABY TEE ANTISOCIAL')).toBe('arriba')
    expect(zonaSugerida('LONG TEE SENSE')).toBe('arriba')
  })

  it('el bikini es un outfit: el corpiño va arriba y la bombacha abajo', () => {
    expect(zonaSugerida('CORPIÑO AYLA - CHERRY')).toBe('arriba')
    expect(zonaSugerida('CORPINO AYLA - CHERRY')).toBe('arriba') // el mismo nombre sin tilde
    expect(zonaSugerida('BOMBACHA AYLA - CHERRY')).toBe('abajo')
  })

  it('los accesorios ⛔ no son prenda de outfit y quedan sin zona a propósito', () => {
    expect(zonaSugerida('CINTO 1')).toBeNull()
    expect(zonaSugerida('FAJA BRAT')).toBeNull()
    expect(zonaSugerida('ACCESORIO NRO 1 LILA (SIN CAMBIO)')).toBeNull()
  })

  it('lo que el nombre no dice queda en null: ⛔ nunca un default a «arriba»', () => {
    expect(zonaSugerida('FADE #002')).toBeNull()
    expect(zonaSugerida('')).toBeNull()
  })

  it('en BDI ⛔ no hay zona, y eso es correcto: son fundas y cables, no ropa', () => {
    expect(zonaSugerida('FUNDA SILICONE IPHONE 15')).toBeNull()
    expect(zonaSugerida('CABLE DE CARGA TIPO C')).toBeNull()
  })
})

describe('zonaSugerida — la categoría de GN es la SEGUNDA fuente', () => {
  it('contesta cuando el nombre no dice nada y la categoría sí', () => {
    expect(zonaSugerida('FADE #002', ['NEW IN', 'DENIM'])).toBe('abajo')
    expect(zonaSugerida('FADE #002', ['TOPS Y BODIES'])).toBe('arriba')
    expect(zonaSugerida('FADE #002', ['VESTIDOS'])).toBe('entero')
  })

  it('las de campaña ⛔ no dicen la prenda y no alcanzan', () => {
    expect(zonaSugerida('FADE #002', ['NEW IN', 'SALE'])).toBeNull()
  })

  it('el nombre le gana a la categoría', () => {
    expect(zonaSugerida('TOP LEVEL', ['JEANS'])).toBe('arriba')
  })

  it('catsDeGN parte la lista separada por comas, que es como GN guarda `category`', () => {
    expect(catsDeGN('NEW IN, DAY, DENIM')).toEqual(['NEW IN', 'DAY', 'DENIM'])
    expect(catsDeGN(null)).toEqual([])
    expect(catsDeGN('')).toEqual([])
  })
})

describe('zonaEfectiva y conZona — la corrección a mano le gana a la propuesta', () => {
  it('la corrección pisa lo propuesto', () => {
    expect(zonaEfectiva('v1', 'abajo', { v1: 'entero' })).toBe('entero')
    expect(zonaEfectiva('v1', 'abajo', {})).toBe('abajo')
    expect(zonaEfectiva('v1', null, { v1: 'arriba' })).toBe('arriba')
  })

  it('conZona escribe sólo la corrección, y soltarla BORRA la clave', () => {
    const s = solicitud([item('v1', 'MINI ANNE')])
    const corregida = conZona(s, 'v1', 'entero')
    expect(corregida.clasifOutfits).toEqual({ v1: 'entero' })
    // 🔑 soltar la vuelve a la propuesta del nombre, ⛔ no la deja «decidida como nada»
    const suelta = conZona(corregida, 'v1', null)
    expect('clasifOutfits' in suelta).toBe(false)
    expect(zonasDe(suelta.items, suelta.clasifOutfits).v1).toBe('abajo')
  })

  it('⛔ no muta la solicitud original', () => {
    const s = solicitud([item('v1', 'MINI ANNE')])
    conZona(s, 'v1', 'arriba')
    expect(s.clasifOutfits).toBeUndefined()
  })
})

describe('alertasDe — «al outfit 3 le falta el abajo»', () => {
  it('una bolsa con sólo el arriba reclama el abajo, y deja de reclamar al sumárselo', () => {
    const items = [item('v1', 'TOP LEVEL', 3)]
    expect(alertasDe(items)).toEqual([{ n: 3, falta: 'abajo', texto: 'Al outfit 3 le falta el abajo' }])
    expect(alertasDe([...items, item('v2', 'JEAN WIDE', 3)])).toEqual([])
  })

  it('una bolsa con sólo el abajo reclama el arriba', () => {
    expect(alertasDe([item('v1', 'SHORT HILTON', 1)])).toEqual([
      { n: 1, falta: 'arriba', texto: 'Al outfit 1 le falta el arriba' },
    ])
  })

  it('una prenda ENTERA sola ⛔ no reclama nada: ocupa las dos ranuras', () => {
    expect(alertasDe([item('v1', 'VESTIDO BLAZE', 2)])).toEqual([])
    // y sigue completa si además lleva una campera
    expect(alertasDe([item('v1', 'VESTIDO BLAZE', 2), item('v2', 'CAMPERA OSLO', 2)])).toEqual([])
  })

  it('🔴 una bolsa sin una sola prenda clasificada ⛔ no reclama nada — es el caso de BDI', () => {
    expect(alertasDe([item('v1', 'FUNDA SILICONE', 1), item('v2', 'CABLE DE CARGA', 1)])).toEqual([])
  })

  it('un accesorio suelto en la bolsa ⛔ no la convierte en outfit incompleto', () => {
    expect(alertasDe([item('v1', 'CINTO 1', 4)])).toEqual([])
  })

  it('los ítems SIN bolsa ⛔ no son un outfit: nadie los repartió todavía', () => {
    expect(alertasDe([item('v1', 'TOP LEVEL')])).toEqual([])
  })

  it('avisa por cada bolsa incompleta, ordenadas por número', () => {
    const items = [
      item('v1', 'TOP LEVEL', 3),
      item('v2', 'SHORT HILTON', 1),
      item('v3', 'VESTIDO BLAZE', 2),
      item('v4', 'BLUSA MARTINA', 2),
    ]
    expect(alertasDe(items).map((a) => `${a.n}:${a.falta}`)).toEqual(['1:arriba', '3:abajo'])
  })

  it('la corrección a mano cambia el aviso', () => {
    const items = [item('v1', 'TOP LEVEL', 1), item('v2', 'BLUSA MARTINA', 1)]
    expect(alertasDe(items)).toEqual([{ n: 1, falta: 'abajo', texto: 'Al outfit 1 le falta el abajo' }])
    // la blusa era en realidad la pollera del mismo nombre: se corrige y el aviso se apaga
    expect(alertasDe(items, { v2: 'abajo' })).toEqual([])
  })
})

describe('esPrendaDeOutfit — «no es una prenda» ⛔ no es «no sé qué es»', () => {
  it('lo que el vocabulario conoce como accesorio ⛔ no se pide clasificar', () => {
    expect(esPrendaDeOutfit('CINTO 1')).toBe(false)
    expect(esPrendaDeOutfit('FAJA BRAT')).toBe(false)
    expect(esPrendaDeOutfit('PAÑUELO LISO')).toBe(false)
    expect(esPrendaDeOutfit('MINI BAG ZURICH')).toBe(false)
    expect(esPrendaDeOutfit('MINI CLUTCH')).toBe(false)
  })

  it('una prenda que el vocabulario ⛔ no conoce SÍ se pide clasificar', () => {
    expect(esPrendaDeOutfit('FADE #002')).toBe(true)
  })

  it('las prendas conocidas son prenda, obvio', () => {
    expect(esPrendaDeOutfit('TOP LEVEL')).toBe(true)
    expect(esPrendaDeOutfit('VESTIDO BLAZE')).toBe(true)
  })

  it('la categoría también puede decir que está fuera de alcance', () => {
    expect(esPrendaDeOutfit('FADE #002', ['ACCESORIOS'])).toBe(false)
  })
})

describe('zonasDe y sinZona — lo que hay que clasificar a mano', () => {
  it('la categoría del catálogo entra por `pid`, cuando la hay', () => {
    const items = [item('v1', 'FADE #002', 1, 'p9')]
    expect(zonasDe(items).v1).toBeNull()
    expect(zonasDe(items, undefined, { p9: catsDeGN('NEW IN, DENIM') }).v1).toBe('abajo')
  })

  it('sinZona lista lo que ninguna fuente pudo decir', () => {
    const items = [item('v1', 'TOP LEVEL', 1), item('v2', 'FADE #002', 1)]
    expect(sinZona(items).map((i) => i.vid)).toEqual(['v2'])
    expect(sinZona(items, { v2: 'abajo' })).toEqual([])
  })

  it('🔴 sinZona ⛔ no pide clasificar un cinto: son 19 de las 20 sin zona medidas en Zattia', () => {
    const items = [item('v1', 'CINTO 1', 1), item('v2', 'MINI BAG ZURICH', 1), item('v3', 'FAJA POP', 1)]
    expect(sinZona(items)).toEqual([])
  })

  it('🔴 en BDI ⛔ no queda NADA por clasificar: si nada es ropa, el módulo se calla', () => {
    // Ni el nombre ni la categoría `FUNDAS` dicen prenda, y `fueraDeAlcance` sólo conoce
    // ACCESORIOS/BAGS: sin `aplicaOutfits` esto listaba las 223 fundas de BDI como pendientes.
    const items = [item('v1', 'ZOEY CASE', 1, 'p1'), item('v2', 'CABLE DE CARGA TIPO C', 1, 'p2')]
    expect(aplicaOutfits(items)).toBe(false)
    expect(sinZona(items, undefined, { p1: catsDeGN('FUNDAS') })).toEqual([])
  })

  it('con una sola prenda de verdad, el módulo se prende y pide lo que falta', () => {
    const items = [item('v1', 'TOP LEVEL', 1), item('v2', 'FADE #002', 1)]
    expect(aplicaOutfits(items)).toBe(true)
    expect(sinZona(items).map((i) => i.vid)).toEqual(['v2'])
  })
})
