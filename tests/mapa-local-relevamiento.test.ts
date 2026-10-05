/**
 * Chequeo de exhibición + mapa: el relevamiento (`lib/mapa-local/relevamiento.ts`).
 *
 * El oráculo es lo escaneado, armado a mano: qué prenda pasó por qué barra. El mapa que sale tiene que
 * colgar esas mismas prendas en esas mismas barras cuando lo lee `ubicar`, que es la otra punta y ⛔
 * comparte código con el relevamiento.
 */

import { describe, expect, it } from 'vitest'
import { prendasDelLocal, ubicar, idNivel } from '../lib/mapa-local/core'
import { MAPA_INICIAL, TIPOS_INICIALES } from '../lib/mapa-local/inicial'
import { armarRelevamiento, cierreDelRelevamiento, leerEspacio, lugarDe, mapaDesdeRelevamiento } from '../lib/mapa-local/relevamiento'
import { sanearMapa } from '../lib/mapa-local/validar.core.js'
import type { EscaneoLibre } from '../lib/exhib/libre'
import type { ExhibItem } from '../lib/exhib/tipos'
import type { MapaLocal } from '../lib/mapa-local/tipos'

const HOY = '2026-03-15'

const esc = (lugar: string, pid: string | null, size = 'M', over: Partial<EscaneoLibre> = {}): EscaneoLibre =>
  ({ lugar, variante_id: `${pid}|${size}`, encontrado: !!pid, codigo_crudo: 'x', barcode: null, sku: 'ZA1', product_id: pid, product_name: `TOP ${pid}`, size, cats: [], qty: 1, precio: 1000, promo: null, escaneado_en: '2026-10-05T12:00:00Z', ...over }) as EscaneoLibre

const item = (pid: string, size = 'M', qty = 1, over: Partial<ExhibItem> = {}): ExhibItem =>
  ({ barcode: `${pid}${size}`, sku: 'ZA1', productId: pid, name: `TOP ${pid}`, size, qty, img: null, cat: '', cleanCats: [], tnId: null, precio: 1000, promo: null, ...over }) as ExhibItem

describe('leerEspacio', () => {
  it('lee el módulo y la altura escritos de cualquier forma', () => {
    expect(leerEspacio('D01 arriba')).toMatchObject({ codigo: 'D01', pared: 'der', numero: 1, pos: 'alta' })
    expect(leerEspacio('d1 abajo')).toMatchObject({ codigo: 'D01', pos: 'baja' })
    expect(leerEspacio('D01 ALTA')).toMatchObject({ codigo: 'D01', pos: 'alta' })
    expect(leerEspacio(' i 3  baja ')).toMatchObject({ codigo: 'I03', pared: 'izq', pos: 'baja' })
    expect(leerEspacio('D12')).toMatchObject({ codigo: 'D12', pos: 'simple' })
    expect(leerEspacio('isla')).toMatchObject({ codigo: 'ISLA', pared: 'isla', pos: 'simple' })
  })
  it('doble largo: «D07-08» es el módulo D07 que sigue en el D08', () => {
    expect(leerEspacio('D07-08 arriba')).toMatchObject({ codigo: 'D07', numero: 7, pos: 'alta', largo: true })
    expect(leerEspacio('d7-8')).toMatchObject({ codigo: 'D07', pos: 'simple', largo: true })
    expect(leerEspacio('D07+D08 abajo')).toMatchObject({ codigo: 'D07', pos: 'baja', largo: true })
    expect(leerEspacio('D07 arriba')).toMatchObject({ largo: false })
    expect(lugarDe({ pared: 'der', numero: 9, pos: 'baja', largo: true })).toBe('D09-10 abajo')
    // Un perchero ocupa dos lugares SEGUIDOS: lo demás ⛔ es un espacio.
    for (const s of ['D07-09', 'D07-06', 'D07-07 arriba']) expect(leerEspacio(s)).toBeNull()
  })

  it('lo que ⛔ es un espacio del mapa da null', () => {
    for (const s of ['vidriera', 'mesa 1', '', 'D0', 'D', 'perchero tops', 'D01 al costado', 'X01']) expect(leerEspacio(s)).toBeNull()
  })
  it('lo que escriben los botones se vuelve a leer igual', () => {
    for (const pos of ['alta', 'baja', 'simple'] as const) {
      const l = lugarDe({ pared: 'der', numero: 7, pos })
      expect(leerEspacio(l)).toMatchObject({ codigo: 'D07', pos })
    }
    expect(lugarDe({ pared: 'der', numero: 7, pos: 'alta' })).toBe('D07 arriba')
    expect(lugarDe({ pared: 'izq', numero: 2, pos: 'simple' })).toBe('I02')
  })
})

describe('armarRelevamiento', () => {
  it('doble cuando se caminó alguna altura, simple cuando no', () => {
    const r = armarRelevamiento([esc('D01 arriba', 'A'), esc('D01 abajo', 'B'), esc('D02', 'C')])
    expect(r.modulos.map((m) => [m.codigo, m.estructura])).toEqual([['D01', 'doble'], ['D02', 'simple']])
    const d01 = r.modulos[0]
    expect(d01.barras.map((b) => [b.pos, b.modelos])).toEqual([['alta', ['A']], ['baja', ['B']]])
  })

  it('🔴 la altura que nadie caminó ⛔ se da por vacía: queda «sin relevar»', () => {
    const r = armarRelevamiento([esc('D01 arriba', 'A')])
    expect(r.modulos[0].barras.map((b) => [b.pos, b.relevada])).toEqual([['alta', true], ['baja', false]])
  })

  it('una percha es producto × color: dos talles del mismo color son UNA', () => {
    const r = armarRelevamiento([esc('D01', 'A', 'Negro - S'), esc('D01', 'A', 'Negro - M'), esc('D01', 'A', 'Blanco - S')])
    expect(r.modulos[0].barras[0].prendas).toHaveLength(2)
  })

  it('los lugares escritos a mano ⛔ son módulos: van aparte', () => {
    const r = armarRelevamiento([esc('vidriera', 'A'), esc('D01', 'B')])
    expect(r.otrosLugares).toEqual(['vidriera'])
    expect(r.modulos.map((m) => m.codigo)).toEqual(['D01'])
  })

  it('un modelo en dos barras queda en la que más se lo vio, y se dice', () => {
    const r = armarRelevamiento([esc('D01 arriba', 'A', 'Negro - S'), esc('D02', 'A', 'Rojo - S'), esc('D02', 'A', 'Azul - S')])
    expect(r.enDosBarras).toEqual([expect.objectContaining({ productId: 'A', queda: 'D02 simple' })])
    expect(r.modulos.find((m) => m.codigo === 'D01')!.barras[0].modelos).toEqual([])
    expect(r.modulos.find((m) => m.codigo === 'D02')!.barras[0].modelos).toEqual(['A'])
  })

  it('el mismo módulo como simple y como doble se toma doble y se marca dudoso', () => {
    const r = armarRelevamiento([esc('D01', 'A'), esc('D01 arriba', 'B')])
    expect(r.dudosos).toEqual(['D01'])
    expect(r.modulos[0].estructura).toBe('doble')
    expect(r.modulos[0].barras.flatMap((b) => b.modelos)).toEqual(['B'])
  })

  it('lo que ⛔ cruzó y lo de Stunned ⛔ van a ninguna barra', () => {
    const r = armarRelevamiento([esc('D01', null), esc('D01', 'S', 'M', { sku: 'STU123' }), esc('D01', 'A')])
    expect(r.modulos[0].barras[0].modelos).toEqual(['A'])
  })

  it('la línea de la barra sale de los precios escaneados', () => {
    const sale = { precio: 1000, promo: 600 }
    expect(armarRelevamiento([esc('D01', 'A'), esc('D01', 'B')]).modulos[0].barras[0].linea).toBe('nc')
    expect(armarRelevamiento([esc('D01', 'A', 'M', sale)]).modulos[0].barras[0].linea).toBe('sale')
    expect(armarRelevamiento([esc('D01', 'A'), esc('D01', 'B', 'M', sale)]).modulos[0].barras[0].linea).toBe('ambas')
  })
})

describe('cierreDelRelevamiento', () => {
  const mapa = { modulos: [{ codigo: 'D01' }, { codigo: 'D02' }] } as MapaLocal

  it('falta exhibir: con stock y ⛔ escaneado en NINGÚN lugar, por color y ⛔ por talle', () => {
    const items = [item('A', 'Negro - S'), item('A', 'Negro - M'), item('A', 'Rojo - S', 2), item('A', 'Rojo - M', 3), item('B')]
    const c = cierreDelRelevamiento([esc('D01', 'A', 'Negro - M'), esc('vidriera', 'B')], items, mapa)
    // Negro se vio en otro talle; B está en la vidriera: lo único que falta es el rojo.
    expect(c.faltaExhibir.map((f) => [f.clave, f.unidades])).toEqual([['A|rojo', 5]])
  })

  it('sobra: lo escaneado sin stock, y la misma prenda en dos lugares', () => {
    const items = [item('A'), item('B')]
    const c = cierreDelRelevamiento([esc('D01', 'A'), esc('D02', 'A'), esc('D01', 'B'), esc('D01', 'Z')], items, mapa)
    expect(c.sobran.map((s) => [s.clave, s.motivo, s.lugares])).toEqual([
      ['A|', 'dos-lugares', ['D01', 'D02']],
      ['Z|', 'sin-stock', ['D01']],
    ])
  })

  it('🔴 sin relevar: los módulos del mapa que nadie caminó, y la altura que quedó sin caminar', () => {
    expect(cierreDelRelevamiento([esc('D01 arriba', 'A')], [], mapa).sinRelevar).toEqual(['D02', 'D01 abajo'])
    expect(cierreDelRelevamiento([esc('d1 arriba', 'A'), esc('D01 abajo', 'A'), esc('D2', 'B')], [], mapa).sinRelevar).toEqual([])
    expect(cierreDelRelevamiento([esc('D01', 'A')], [], null).sinRelevar).toBeNull()
  })

  it('Stunned ⛔ falta ni sobra: es otra tienda', () => {
    const c = cierreDelRelevamiento([esc('D01', 'S', 'M', { sku: 'STU1' })], [item('T', 'M', 1, { sku: 'STU2' })], mapa)
    expect(c.faltaExhibir).toEqual([])
    expect(c.sobran).toEqual([])
  })
})

describe('mapaDesdeRelevamiento', () => {
  const escaneos = [esc('D01 arriba', 'A'), esc('D01 arriba', 'B'), esc('D01 abajo', 'C'), esc('D14', 'E')]
  const items = ['A', 'B', 'C', 'E', 'F'].map((p) => item(p))
  const base = MAPA_INICIAL

  it('el mapa que sale pasa el saneo del servidor', () => {
    const { mapa } = mapaDesdeRelevamiento(armarRelevamiento(escaneos), base, TIPOS_INICIALES)
    const s = sanearMapa(mapa)
    expect(s.ok).toBe(true)
  })

  it('🔑 cada barra cuelga EXACTAMENTE lo escaneado ahí, y lo que nadie escaneó ⛔ entra a esas barras', () => {
    const { mapa } = mapaDesdeRelevamiento(armarRelevamiento(escaneos), base, TIPOS_INICIALES)
    const u = ubicar(prendasDelLocal(items, 'zattia', null), mapa, 'comodo', HOY)
    const d01 = mapa.modulos.find((m) => m.codigo === 'D01')!
    const en = (pos: string) => (u.porBarra[idNivel(d01, { pos } as never)] || []).map((p) => p.productId).sort()
    expect(en('alta')).toEqual(['A', 'B'])
    expect(en('baja')).toEqual(['C'])
    const d14 = mapa.modulos.find((m) => m.codigo === 'D14')!
    expect((u.porBarra[idNivel(d14, d14.niveles[0])] || []).map((p) => p.productId)).toEqual(['E'])
  })

  it('🔴 el orden del recorrido es el del mapa (la isla primero, I01 entre D04 y D05): ⛔ se reordena por lado', () => {
    const conOrden: MapaLocal = {
      ...base,
      modulos: ['ISLA', 'D01', 'D02', 'I01', 'D05'].map((codigo, i) => ({ ...(base.modulos.find((m) => m.codigo === codigo) ?? base.modulos[0]), codigo, orden: i + 1 })),
    }
    const { mapa } = mapaDesdeRelevamiento(armarRelevamiento([esc('D03', 'A'), esc('D09', 'B'), esc('I02 arriba', 'C'), esc('D01 arriba', 'E')]), conOrden, TIPOS_INICIALES)
    expect(mapa.modulos.map((m) => m.codigo)).toEqual(['ISLA', 'D01', 'D02', 'D03', 'I01', 'I02', 'D05', 'D09'])
    expect(mapa.modulos.map((m) => m.orden)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
  })

  it('un módulo nuevo entra en orden; los ⛔ caminados quedan como estaban', () => {
    const { mapa, cambios } = mapaDesdeRelevamiento(armarRelevamiento(escaneos), base, TIPOS_INICIALES)
    expect(mapa.modulos.map((m) => m.codigo)).toEqual(['I01', 'I02', 'ISLA', 'D01', 'D02', 'D03', 'D04', 'D05', 'D06', 'D07', 'D08', 'D09', 'D10', 'D11', 'D12', 'D14'])
    expect(mapa.modulos.map((m) => m.orden)).toEqual(mapa.modulos.map((_, i) => i + 1))
    expect(mapa.modulos.find((m) => m.codigo === 'D05')).toEqual({ ...base.modulos.find((m) => m.codigo === 'D05'), orden: 8 })
    expect(cambios.find((c) => c.codigo === 'D14')?.que).toBe('nuevo')
    expect(mapa.temporadas).toEqual(base.temporadas)
  })

  it('el cupo es lo que había colgado', () => {
    const { mapa } = mapaDesdeRelevamiento(armarRelevamiento(escaneos), base, TIPOS_INICIALES)
    const d01 = mapa.modulos.find((m) => m.codigo === 'D01')!
    expect(d01.niveles.map((n) => [n.pos, n.cupo])).toEqual([['alta', 2], ['baja', 1]])
  })

  it('🔑 el cupo son las PERCHAS (cada talle colgado), ⛔ los colores', () => {
    // A en tres talles del mismo color + un código que ⛔ cruzó: 4 perchas, 1 color. A escaneada dos veces = 1 percha.
    const r = armarRelevamiento([esc('D02', 'A', 'S'), esc('D02', 'A', 'M'), esc('D02', 'A', 'L'), esc('D02', 'A', 'L'), esc('D02', null, 'M', { variante_id: '?ZZ9' })])
    const b = r.modulos[0].barras[0]
    expect([b.perchas, b.prendas.length]).toEqual([4, 1])
    const { mapa } = mapaDesdeRelevamiento(r, base, TIPOS_INICIALES)
    expect(mapa.modulos.find((m) => m.codigo === 'D02')!.niveles.map((n) => n.cupo)).toEqual([4])
  })

  it('🔑 un perchero DOBLE LARGO queda como UN módulo del doble de ancho y el siguiente desaparece', () => {
    const r = armarRelevamiento([esc('D07-08 arriba', 'A'), esc('D07-08 abajo', 'B'), esc('D09', 'C')])
    expect(r.modulos.find((m) => m.codigo === 'D07')).toMatchObject({ largo: true, estructura: 'doble' })
    const { mapa, cambios } = mapaDesdeRelevamiento(r, base, TIPOS_INICIALES)
    const cods = mapa.modulos.map((m) => m.codigo)
    expect(cods).toContain('D07')
    expect(cods).not.toContain('D08')
    expect(mapa.modulos.find((m) => m.codigo === 'D07')!.anchoCm).toBe(150)
    expect(mapa.modulos.find((m) => m.codigo === 'D09')!.anchoCm).toBe(base.modulos.find((m) => m.codigo === 'D09')!.anchoCm)
    expect(cambios).toContainEqual(expect.objectContaining({ codigo: 'D08', texto: 'D08 pasa a ser parte de D07 (perchero doble largo)' }))
    // Y caminado de nuevo como un módulo, vuelve a uno (el D08 ⛔ reaparece solo: nadie lo caminó).
    const vuelta = mapaDesdeRelevamiento(armarRelevamiento([esc('D07 arriba', 'A')]), mapa, TIPOS_INICIALES).mapa
    expect(vuelta.modulos.find((m) => m.codigo === 'D07')!.anchoCm).toBe(75)
  })

  it('🔴 la isla conserva su ancho: ⛔ es un largo que se deshace', () => {
    const conIsla = { ...base, modulos: base.modulos.map((m) => (m.pared === 'isla' ? { ...m, anchoCm: 185 } : m)) }
    const { mapa } = mapaDesdeRelevamiento(armarRelevamiento([esc('ISLA', 'A')]), conIsla, TIPOS_INICIALES)
    expect(mapa.modulos.find((m) => m.pared === 'isla')!.anchoCm).toBe(185)
  })

  it('el cierre ⛔ da «sin relevar» al módulo que quedó dentro de un largo', () => {
    const c = cierreDelRelevamiento([esc('D07-08 arriba', 'A'), esc('D07-08 abajo', 'B')], [], base)
    expect(c.sinRelevar).not.toContain('D08')
    expect(c.sinRelevar).toContain('D09')
  })

  it('🔴 la altura sin relevar queda como estaba en el mapa', () => {
    const { mapa, cambios } = mapaDesdeRelevamiento(armarRelevamiento([esc('D01 arriba', 'A')]), base, TIPOS_INICIALES)
    const baja = mapa.modulos.find((m) => m.codigo === 'D01')!.niveles.find((n) => n.pos === 'baja')
    expect(baja).toEqual(base.modulos.find((m) => m.codigo === 'D01')!.niveles.find((n) => n.pos === 'baja'))
    expect(cambios.find((c) => c.codigo === 'D01' && c.que === 'barras')?.texto).toContain('abajo sin relevar')
  })

  it('simple → doble se anuncia como cambio de estructura', () => {
    const { cambios } = mapaDesdeRelevamiento(armarRelevamiento([esc('D06 arriba', 'A'), esc('D06 abajo', 'B')]), base, TIPOS_INICIALES)
    expect(cambios).toContainEqual(expect.objectContaining({ codigo: 'D06', que: 'estructura', texto: 'D06 pasa a doble' }))
  })

  it('sin mapa guardado sale sólo lo relevado, con la tabla del armado inicial', () => {
    const { mapa } = mapaDesdeRelevamiento(armarRelevamiento(escaneos), null, TIPOS_INICIALES)
    expect(mapa.modulos.map((m) => m.codigo)).toEqual(['D01', 'D14'])
    expect(mapa.tipos).toBe(TIPOS_INICIALES)
  })
})
