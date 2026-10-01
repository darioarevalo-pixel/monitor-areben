/**
 * Mapa del local: qué es una prenda del salón, cuánto entra en cada barra, dónde va cada una y qué
 * está mal pensado en el armado.
 */

import { describe, expect, it } from 'vitest'
import { acepta, alertas, barras, capacidadTotal, colorDeVariante, cupoDe, estadoDeModulo, prendasDelLocal, resumenPorTipo, ubicar } from '../lib/mapa-local/core'
import { MAPA_INICIAL } from '../lib/mapa-local/inicial'
import { proponerArmado } from '../lib/mapa-local/proponer'
import { sanearMapa } from '../lib/mapa-local/validar.core.js'
import type { MapaLocal, Nivel, Prenda } from '../lib/mapa-local/tipos'
import type { ExhibItem } from '../lib/exhib/tipos'

/** Marzo es cambio de temporada: no duerme nada, así estos tests miran sólo el llenado de barras. */
const HOY = '2026-03-15'

const item = (over: Partial<ExhibItem>): ExhibItem => ({
  barcode: '', sku: 'ZAT1', productId: 'p', name: 'TOP X', size: 'U', qty: 1, img: null,
  cat: '', cleanCats: [], tnId: null, precio: 1000, promo: null, ...over,
})
const prenda = (over: Partial<Prenda>): Prenda => ({ clave: over.clave || `${over.nombre || 'TOP X'}|`, productId: 'p', nombre: 'TOP X', color: '', tipo: 'TOP', linea: 'nc', img: null, unidades: 1, ventas30: null, ultimaVenta: null, alta: null, ritmo: null, tramo: 'vende', ...over })
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
    ], 'zattia', null)
    expect(ps.map((p) => [p.tipo, p.color, p.unidades])).toEqual([['CORSET', 'bordó', 9], ['CORSET', 'verde', 4], ['CAMPERA', '', 3]])
  })
  it('deja afuera lo que no tiene stock y lo de Stunned', () => {
    const ps = prendasDelLocal([item({ productId: '1', qty: 0 }), item({ productId: '2', sku: 'STU-9' }), item({ productId: '3' })], 'zattia', null)
    expect(ps.map((p) => p.productId)).toEqual(['3'])
  })
  it('la línea sale de la oferta vigente de Tienda Nube, y sin precio no se sabe', () => {
    const [nc, sale, nada] = prendasDelLocal([
      item({ productId: '1', precio: 1000, promo: null }),
      item({ productId: '2', precio: 1000, promo: 700 }),
      item({ productId: '3', precio: null, promo: null }),
    ], 'zattia', null)
    expect([nc.linea, sale.linea, nada.linea]).toEqual(['nc', 'sale', null])
  })
})

describe('cupoDe', () => {
  const m = { anchoCm: 75 }
  it('ancho × la densidad del tipo más grueso de la barra', () => {
    // TOP 22/m, SWEATER 10/m: manda el sweater ⇒ 0,75 × 10 = 7
    expect(cupoDe(MAPA_INICIAL, m, nivel({ tipos: ['TOP', 'SWEATER'] }), 'comodo')).toBe(7)
    expect(cupoDe(MAPA_INICIAL, m, nivel({ tipos: ['TOP'] }), 'comodo')).toBe(16)
  })
  it('el cupo puesto a mano gana, y el brazo de frente es de 2', () => {
    expect(cupoDe(MAPA_INICIAL, m, nivel({ cupo: 5 }), 'comodo')).toBe(5)
    expect(cupoDe(MAPA_INICIAL, m, nivel({ pos: 'frente' }), 'comodo')).toBe(2)
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
    const u = ubicar([prenda({ nombre: 'A', unidades: 1 }), prenda({ nombre: 'B', unidades: 5 }), prenda({ nombre: 'C', unidades: 3 })], mapa, 'comodo', HOY)
    expect(u.porBarra['D1-simple'].map((p) => p.nombre)).toEqual(['B', 'C'])
    expect(u.noEntran.map((p) => p.nombre)).toEqual(['A'])
  })
  it('llena en el orden del recorrido y pasa a la siguiente barra de su tipo', () => {
    const mapa = mapaDe([[nivel({ cupo: 1 })], [nivel({ cupo: 1 })]])
    const u = ubicar([prenda({ nombre: 'A', unidades: 2 }), prenda({ nombre: 'B' })], mapa, 'comodo', HOY)
    expect(u.porBarra['D1-simple'].map((p) => p.nombre)).toEqual(['A'])
    expect(u.porBarra['D2-simple'].map((p) => p.nombre)).toEqual(['B'])
  })
  it('separa «sin lugar» (ninguna barra la acepta) de «no se cuelga»', () => {
    const mapa = mapaDe([[nivel({})]])
    const u = ubicar([prenda({ tipo: 'BLUSA' }), prenda({ tipo: 'BOMBACHA' })], mapa, 'comodo', HOY)
    expect(u.sinLugar.map((p) => p.tipo)).toEqual(['BLUSA'])
    expect(u.noCuelgan.map((p) => p.tipo)).toEqual(['BOMBACHA'])
  })
  it('el resumen por tipo cuadra con la ubicación', () => {
    const mapa = mapaDe([[nivel({ cupo: 1, linea: 'ambas' })]])
    const ps = [prenda({ nombre: 'A', unidades: 2 }), prenda({ nombre: 'B', linea: 'sale' }), prenda({ tipo: 'BLUSA' })]
    const filas = resumenPorTipo(ps, mapa, ubicar(ps, mapa, 'comodo', HOY))
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
    expect(barras(MAPA_INICIAL, 'comodo').length).toBeGreaterThan(20)
    const cap = capacidadTotal(MAPA_INICIAL, 'comodo')
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
    const u = ubicar(ps, mapa, 'comodo', HOY)
    expect(mapa.modulos.map((m) => estadoDeModulo(mapa, m, u, 'comodo').estado)).toEqual(['desborda', 'lleno', 'vacio'])
  })
})

describe('el tope', () => {
  const m = { anchoCm: 75 }
  it('las blusas al tope son las 38 por barra que midió Bruno', () => {
    expect(cupoDe(MAPA_INICIAL, m, nivel({ tipos: ['BLUSA'] }), 'tope')).toBe(38)
    expect(cupoDe(MAPA_INICIAL, m, nivel({ tipos: ['BLUSA'] }), 'comodo')).toBe(13)
  })
  it('un tipo sin tope medido cuenta como cómodo, ⛔ no inventa más lugar', () => {
    expect(cupoDe(MAPA_INICIAL, m, nivel({ tipos: ['TOP'] }), 'tope')).toBe(16)
    // y en una barra mezclada manda el sin medir, que es el más grueso al tope
    expect(cupoDe(MAPA_INICIAL, m, nivel({ tipos: ['BLUSA', 'CAMISA'] }), 'tope')).toBe(12)
  })
  it('un tope menor que lo cómodo (un mapa viejo, una carga a mano) ⛔ achica la barra', () => {
    const tipos = [{ tipo: 'TOP', largo: 'L1' as const, perchasPorM: 22, topePorM: 5, cuelga: true }]
    expect(cupoDe({ tipos }, m, nivel({ tipos: ['TOP'] }), 'tope')).toBe(16)
  })
  it('el cupo puesto a mano vale para los dos modos', () => {
    expect(cupoDe(MAPA_INICIAL, m, nivel({ tipos: ['BLUSA'], cupo: 20 }), 'tope')).toBe(20)
  })
  it('al tope cuelgan más y quedan afuera menos', () => {
    const mapa = mapaDe([[nivel({ tipos: ['BLUSA'] })]])
    const ps = Array.from({ length: 30 }, (_, i) => prenda({ clave: `b${i}`, nombre: `BLUSA ${i}`, tipo: 'BLUSA' }))
    expect(ubicar(ps, mapa, 'comodo', HOY).noEntran.length).toBe(17)
    expect(ubicar(ps, mapa, 'tope', HOY).noEntran.length).toBe(0)
  })
  it('el saneo guarda el tope, vacío es sin medir, y rechaza un tope menor que lo cómodo', () => {
    const conTope = (topePorM: unknown) => ({ ...MAPA_INICIAL, tipos: [{ tipo: 'TOP', largo: 'L1', perchasPorM: 22, topePorM, cuelga: true }] })
    expect(sanearMapa(conTope(40))).toMatchObject({ ok: true, mapa: { tipos: [{ topePorM: 40 }] } })
    expect(sanearMapa(conTope('')).ok && (sanearMapa(conTope('')) as { mapa: MapaLocal }).mapa.tipos[0].topePorM).toBe(null)
    expect(sanearMapa(conTope(10))).toMatchObject({ ok: false })
    // un mapa guardado antes de que existiera el tope sigue pasando
    const viejo = { ...MAPA_INICIAL, tipos: [{ tipo: 'TOP', largo: 'L1', perchasPorM: 22, cuelga: true }] }
    expect(sanearMapa(viejo)).toMatchObject({ ok: true, mapa: { tipos: [{ topePorM: null }] } })
  })
})

describe('proponerArmado', () => {
  const muchas = (n: number, over: Partial<Prenda>) => Array.from({ length: n }, (_, i) => prenda({ ...over, clave: `${over.tipo}${over.linea}${i}`, nombre: `${over.tipo} ${i}` }))
  const pared = (k: number): MapaLocal => mapaDe(Array.from({ length: k }, () => [nivel({ pos: 'alta', alturaCm: 180, tipos: [] }), nivel({ pos: 'baja', alturaCm: 105, tipos: [] })]))

  it('reparte los módulos entre colección y sale según lo que pide cada una, colección adelante', () => {
    const ps = [...muchas(90, { tipo: 'TOP', linea: 'nc' }), ...muchas(30, { tipo: 'TOP', linea: 'sale' })]
    const p = proponerArmado(ps, pared(8), 'comodo', HOY)
    expect(p.modulos).toEqual({ nc: 6, sale: 2 })
    expect(p.mapa.modulos.map((m) => m.niveles[0].linea)).toEqual(['nc', 'nc', 'nc', 'nc', 'nc', 'nc', 'sale', 'sale'])
    expect(alertas(p.mapa).filter((a) => a.grave)).toEqual([])
  })
  it('⛔ no maximiza: los vestidos tienen lugar aunque los tops llenarían todo', () => {
    const ps = [...muchas(200, { tipo: 'TOP', linea: 'nc' }), ...muchas(40, { tipo: 'VESTIDO', linea: 'nc' })]
    const p = proponerArmado(ps, pared(6), 'comodo', HOY)
    const u = ubicar(ps, p.mapa, 'comodo', HOY)
    const colgados = (t: string) => Object.values(u.porBarra).flat().filter((x) => x.tipo === t).length
    expect(colgados('VESTIDO')).toBeGreaterThan(0)
    // los largos van en barra simple (no entran en doble), y nada queda tapado ni tocando el piso
    expect(p.mapa.modulos.some((m) => m.niveles.length === 1 && m.niveles[0].tipos.includes('VESTIDO'))).toBe(true)
    expect(alertas(p.mapa).filter((a) => a.grave)).toEqual([])
  })
  it('cada familia queda cubierta en una proporción parecida', () => {
    const ps = [...muchas(120, { tipo: 'TOP', linea: 'nc' }), ...muchas(60, { tipo: 'BLUSA', linea: 'nc' }), ...muchas(40, { tipo: 'MINI', linea: 'nc' })]
    const p = proponerArmado(ps, pared(6), 'comodo', HOY)
    const u = ubicar(ps, p.mapa, 'comodo', HOY)
    const cob = (t: string, total: number) => Object.values(u.porBarra).flat().filter((x) => x.tipo === t).length / total
    const cobs = [cob('TOP', 120), cob('BLUSA', 60), cob('MINI', 40)]
    expect(Math.max(...cobs) - Math.min(...cobs)).toBeLessThan(0.35)
  })
  it('la isla no se toca y lo que cuelga ahí se descuenta', () => {
    const base = pared(2)
    const isla = { codigo: 'ISLA', pared: 'isla' as const, orden: 0, anchoCm: 150, niveles: [nivel({ tipos: ['TOP'], cupo: 18 })] }
    // los 18 tops caben en la isla ⇒ lo que queda por colgar son los vestidos, y el primer módulo es para ellos
    const ps = [...muchas(18, { tipo: 'TOP', linea: 'nc' }), ...muchas(10, { tipo: 'VESTIDO', linea: 'nc' })]
    const p = proponerArmado(ps, { ...base, modulos: [isla, ...base.modulos] }, 'comodo', HOY)
    expect(p.mapa.modulos[0]).toEqual(isla)
    expect(p.mapa.modulos[1].niveles.map((n) => [n.pos, n.tipos.includes('VESTIDO')])).toEqual([['simple', true]])
  })
  it('el armado propuesto pasa el saneo del servidor', () => {
    const ps = [...muchas(50, { tipo: 'TOP', linea: 'nc' }), ...muchas(20, { tipo: 'JEAN', linea: 'sale' }), ...muchas(20, { tipo: 'SWEATER', linea: 'sale' })]
    expect(sanearMapa(proponerArmado(ps, MAPA_INICIAL, 'comodo', HOY).mapa)).toMatchObject({ ok: true })
  })
})

describe('modelos elegidos a mano', () => {
  // D1 = tops por tipo, D2 = dos modelos elegidos (1-oct-2026: D01 de Zattia por estilo).
  const mapa = mapaDe([[nivel({ cupo: 5 })], [nivel({ cupo: 3, tipos: [], modelos: ['a', 'b'] })]])
  const top = (productId: string, color = '') => prenda({ clave: `${productId}|${color}`, productId, nombre: `TOP ${productId}`, color })

  it('la barra con modelos lleva sólo esos, con todos sus colores, aunque otra barra acepte su tipo primero', () => {
    const u = ubicar([top('a', 'negro'), top('a', 'crema'), top('b'), top('z')], mapa, 'comodo', HOY)
    expect(u.porBarra['D2-simple'].map((p) => p.clave).sort()).toEqual(['a|crema', 'a|negro', 'b|'])
    expect(u.porBarra['D1-simple'].map((p) => p.clave)).toEqual(['z|'])
  })
  it('un modelo elegido que no entra en su barra sale en «No entran», ⛔ no se cuela en otra por su tipo', () => {
    const u = ubicar([top('a', '1'), top('a', '2'), top('a', '3'), top('b', '4')], mapa, 'comodo', HOY)
    expect(u.porBarra['D1-simple']).toEqual([])
    expect(u.noEntran.map((p) => p.clave)).toEqual(['b|4'])
  })
  it('un modelo elegido trabado ⛔ traba a los demás tops', () => {
    const u = ubicar([top('a', '1'), top('a', '2'), top('a', '3'), top('a', '4'), top('z')], mapa, 'comodo', HOY)
    expect(u.porBarra['D1-simple'].map((p) => p.clave)).toEqual(['z|'])
  })
  it('se guardan, y una barra sin modelos ⛔ trae el campo', () => {
    const v = sanearMapa({ ...mapa, modulos: mapa.modulos.map((m, i) => (i ? { ...m, niveles: [{ ...m.niveles[0], modelos: ['a', 'a', ' b ', 'x y', 7] }] } : m)) })
    if (!v.ok) throw new Error(v.error)
    expect(v.mapa.modulos[1].niveles[0].modelos).toEqual(['a', 'b', '7'])
    expect('modelos' in v.mapa.modulos[0].niveles[0]).toBe(false)
  })
})
