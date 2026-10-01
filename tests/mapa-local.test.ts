/**
 * Mapa del local: qué es una prenda del salón, cuánto entra en cada barra, dónde va cada una y qué
 * está mal pensado en el armado.
 */

import { describe, expect, it } from 'vitest'
import { acepta, alertas, barras, capacidadTotal, colorDeVariante, cupoDe, estadoDeModulo, prendasDelLocal, resumenPorTipo, ubicar } from '../lib/mapa-local/core'
import { MAPA_INICIAL } from '../lib/mapa-local/inicial'
import { sanearMapa } from '../lib/mapa-local/validar.core.js'
import type { MapaLocal, Nivel, Prenda } from '../lib/mapa-local/tipos'
import type { ExhibItem } from '../lib/exhib/tipos'

const item = (over: Partial<ExhibItem>): ExhibItem => ({
  barcode: '', sku: 'ZAT1', productId: 'p', name: 'TOP X', size: 'U', qty: 1, img: null,
  cat: '', cleanCats: [], tnId: null, precio: 1000, promo: null, ...over,
})
const prenda = (over: Partial<Prenda>): Prenda => ({ clave: over.clave || `${over.nombre || 'TOP X'}|`, productId: 'p', nombre: 'TOP X', color: '', tipo: 'TOP', linea: 'nc', img: null, unidades: 1, ...over })
const nivel = (over: Partial<Nivel>): Nivel => ({ pos: 'simple', alturaCm: 160, linea: 'nc', tipos: ['TOP'], cupo: null, ...over })
const mapaDe = (niveles: Nivel[][], tipos = MAPA_INICIAL.tipos): MapaLocal => ({
  version: 1,
  tipos,
  modulos: niveles.map((ns, i) => ({ codigo: `D${i + 1}`, pared: 'der', orden: i + 1, anchoCm: 75, niveles: ns })),
})

describe('colorDeVariante', () => {
  it('saca el talle y deja el color, venga el color antes o después', () => {
    expect(colorDeVariante('Bordó - S')).toBe('bordó')
    expect(colorDeVariante('S - NEGRO')).toBe('negro')
    expect(colorDeVariante('Negro foil')).toBe('negro foil')
  })
  it('una variante que es sólo talle no tiene color', () => {
    for (const s of ['M', 'XXXL', '38', 'Variante Única', 'Único', '']) expect(colorDeVariante(s)).toBe('')
  })
})

describe('prendasDelLocal', () => {
  it('una prenda por producto×color: los talles del mismo color suman, los colores separan', () => {
    const ps = prendasDelLocal([
      item({ productId: '1', name: 'CORSET FRANK', size: 'Bordó - S', qty: 4 }),
      item({ productId: '1', name: 'CORSET FRANK', size: 'Bordó - M', qty: 5 }),
      item({ productId: '1', name: 'CORSET FRANK', size: 'Verde - S', qty: 4 }),
      item({ productId: '2', name: 'CAMPERA ROCK - VIOLETA', size: 'M', qty: 1 }),
      item({ productId: '2', name: 'CAMPERA ROCK - VIOLETA', size: 'L', qty: 2 }),
    ], 'zattia')
    expect(ps.map((p) => [p.tipo, p.color, p.unidades])).toEqual([['CORSET', 'bordó', 9], ['CORSET', 'verde', 4], ['CAMPERA', '', 3]])
  })
  it('deja afuera lo que no tiene stock y lo de Stunned', () => {
    const ps = prendasDelLocal([item({ productId: '1', qty: 0 }), item({ productId: '2', sku: 'STU-9' }), item({ productId: '3' })], 'zattia')
    expect(ps.map((p) => p.productId)).toEqual(['3'])
  })
  it('la línea sale de la oferta vigente de Tienda Nube, y sin precio no se sabe', () => {
    const [nc, sale, nada] = prendasDelLocal([
      item({ productId: '1', precio: 1000, promo: null }),
      item({ productId: '2', precio: 1000, promo: 700 }),
      item({ productId: '3', precio: null, promo: null }),
    ], 'zattia')
    expect([nc.linea, sale.linea, nada.linea]).toEqual(['nc', 'sale', null])
  })
})

describe('cupoDe', () => {
  const m = { anchoCm: 75 }
  it('ancho × la densidad del tipo más grueso de la barra', () => {
    // TOP 22/m, SWEATER 10/m: manda el sweater ⇒ 0,75 × 10 = 7
    expect(cupoDe(MAPA_INICIAL, m, nivel({ tipos: ['TOP', 'SWEATER'] }))).toBe(7)
    expect(cupoDe(MAPA_INICIAL, m, nivel({ tipos: ['TOP'] }))).toBe(16)
  })
  it('el cupo puesto a mano gana, y el brazo de frente es de 2', () => {
    expect(cupoDe(MAPA_INICIAL, m, nivel({ cupo: 5 }))).toBe(5)
    expect(cupoDe(MAPA_INICIAL, m, nivel({ pos: 'frente' }))).toBe(2)
  })
})

describe('acepta', () => {
  it('tipo y línea; la barra de ambas acepta las dos; sin línea conocida entra en cualquiera', () => {
    expect(acepta(nivel({ linea: 'nc' }), prenda({ linea: 'sale' }))).toBe(false)
    expect(acepta(nivel({ linea: 'ambas' }), prenda({ linea: 'sale' }))).toBe(true)
    expect(acepta(nivel({ linea: 'sale' }), prenda({ linea: null }))).toBe(true)
    expect(acepta(nivel({ tipos: ['BLUSA'] }), prenda({}))).toBe(false)
  })
})

describe('ubicar', () => {
  it('nunca pasa el cupo: lo que sobra sale como «no entra», con las de más unidades adentro', () => {
    const mapa = mapaDe([[nivel({ cupo: 2 })]])
    const u = ubicar([prenda({ nombre: 'A', unidades: 1 }), prenda({ nombre: 'B', unidades: 5 }), prenda({ nombre: 'C', unidades: 3 })], mapa)
    expect(u.porBarra['D1-simple'].map((p) => p.nombre)).toEqual(['B', 'C'])
    expect(u.noEntran.map((p) => p.nombre)).toEqual(['A'])
  })
  it('llena en el orden del recorrido y pasa a la siguiente barra de su tipo', () => {
    const mapa = mapaDe([[nivel({ cupo: 1 })], [nivel({ cupo: 1 })]])
    const u = ubicar([prenda({ nombre: 'A', unidades: 2 }), prenda({ nombre: 'B' })], mapa)
    expect(u.porBarra['D1-simple'].map((p) => p.nombre)).toEqual(['A'])
    expect(u.porBarra['D2-simple'].map((p) => p.nombre)).toEqual(['B'])
  })
  it('separa «sin lugar» (ninguna barra la acepta) de «no se cuelga»', () => {
    const mapa = mapaDe([[nivel({})]])
    const u = ubicar([prenda({ tipo: 'BLUSA' }), prenda({ tipo: 'BOMBACHA' })], mapa)
    expect(u.sinLugar.map((p) => p.tipo)).toEqual(['BLUSA'])
    expect(u.noCuelgan.map((p) => p.tipo)).toEqual(['BOMBACHA'])
  })
  it('el resumen por tipo cuadra con la ubicación', () => {
    const mapa = mapaDe([[nivel({ cupo: 1, linea: 'ambas' })]])
    const ps = [prenda({ nombre: 'A', unidades: 2 }), prenda({ nombre: 'B', linea: 'sale' }), prenda({ tipo: 'BLUSA' })]
    const filas = resumenPorTipo(ps, mapa, ubicar(ps, mapa))
    const top = filas.find((f) => f.tipo === 'TOP')!
    const blusa = filas.find((f) => f.tipo === 'BLUSA')!
    expect([top.total, top.nc, top.sale, top.ubicadas, top.noEntran]).toEqual([2, 1, 1, 1, 1])
    expect(blusa.sinLugar).toBe(1)
  })
})

describe('alertas', () => {
  const textos = (m: MapaLocal) => alertas(m).map((a) => `${a.codigo}:${a.pos}:${a.grave ? 'G' : 'l'}`)
  it('la barra de arriba con prendas medias tapa a la de abajo si no les da el hueco', () => {
    // BLUSA es L2 (90 cm): con 75 cm de hueco cae sobre la barra de abajo — lo de las fotos.
    const m = mapaDe([[nivel({ pos: 'alta', alturaCm: 180, tipos: ['BLUSA'] }), nivel({ pos: 'baja', alturaCm: 105, tipos: ['TOP'] })]])
    expect(textos(m)).toEqual(['D1:alta:G'])
    const ok = mapaDe([[nivel({ pos: 'alta', alturaCm: 180, tipos: ['TOP'] }), nivel({ pos: 'baja', alturaCm: 105, tipos: ['BLUSA'] })]])
    expect(textos(ok)).toEqual([])
  })
  it('lo largo en una barra baja toca el piso', () => {
    expect(textos(mapaDe([[nivel({ alturaCm: 120, tipos: ['VESTIDO'] })]]))).toEqual(['D1:simple:G'])
  })
  it('una barra simple con prendas cortas desperdicia la mitad de abajo', () => {
    expect(textos(mapaDe([[nivel({ alturaCm: 165, tipos: ['SHORT'] })]]))).toEqual(['D1:simple:l'])
  })
  it('avisa del sale antes que la colección y del tipo que no está en la tabla', () => {
    const m = mapaDe([[nivel({ linea: 'sale', alturaCm: 110 })], [nivel({ linea: 'nc', tipos: ['TOP', 'KIMONO'] })]])
    expect(textos(m)).toEqual(['D2:simple:l', 'D1:null:l'])
  })
  it('el mapa inicial no tiene alertas graves', () => {
    expect(alertas(MAPA_INICIAL).filter((a) => a.grave)).toEqual([])
  })
})

describe('el mapa inicial', () => {
  it('son los 14 módulos de pared + la isla, y entran ~300 perchas cómodas', () => {
    expect(MAPA_INICIAL.modulos.map((m) => m.codigo)).toHaveLength(15)
    expect(barras(MAPA_INICIAL).length).toBeGreaterThan(20)
    const cap = capacidadTotal(MAPA_INICIAL)
    expect(cap).toBeGreaterThan(250)
    expect(cap).toBeLessThan(420)
  })
  it('pasa el saneo del servidor sin cambios', () => {
    const r = sanearMapa(MAPA_INICIAL)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.mapa).toEqual(MAPA_INICIAL)
  })
})

describe('sanearMapa', () => {
  const base = () => JSON.parse(JSON.stringify(MAPA_INICIAL))
  it('rechaza un módulo repetido, una alta por debajo de la baja y una simple con alta', () => {
    const rep = base(); rep.modulos[1].codigo = 'I01'
    expect(sanearMapa(rep)).toMatchObject({ ok: false })
    const dada = base(); dada.modulos[3].niveles[0].alturaCm = 90
    expect(sanearMapa(dada)).toMatchObject({ ok: false })
    const mezcla = base(); mezcla.modulos[3].niveles.push({ pos: 'simple', alturaCm: 160, linea: 'nc', tipos: [], cupo: null })
    expect(sanearMapa(mezcla)).toMatchObject({ ok: false })
  })
  it('normaliza los tipos y descarta los campos que no son del mapa', () => {
    const m = base(); m.modulos[0].niveles[0].tipos = [' top ', 'TOP', 'baby  tee']; m.modulos[0].extra = 'x'
    const r = sanearMapa(m)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.mapa.modulos[0].niveles[0].tipos).toEqual(['TOP', 'BABY TEE'])
      expect(r.mapa.modulos[0]).not.toHaveProperty('extra')
    }
  })
})

describe('estadoDeModulo', () => {
  it('lleno sin sobrantes de lo suyo es «lleno»; con sobrantes, «desborda»; poco, «vacio»', () => {
    const mapa = mapaDe([[nivel({ cupo: 1 })], [nivel({ cupo: 1, tipos: ['BLUSA'] })], [nivel({ cupo: 4, tipos: ['SHORT'] })]])
    const ps = [prenda({ nombre: 'A', unidades: 2 }), prenda({ nombre: 'B' }), prenda({ tipo: 'BLUSA' }), prenda({ tipo: 'SHORT' })]
    const u = ubicar(ps, mapa)
    expect(mapa.modulos.map((m) => estadoDeModulo(mapa, m, u).estado)).toEqual(['desborda', 'lleno', 'vacio'])
  })
})
