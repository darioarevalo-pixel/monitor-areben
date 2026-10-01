/**
 * Mapa del local, F3: qué hay que mover cuando cambia el armado, y la hoja que se lleva al perchero.
 *
 * El oráculo de `estabilizar` es físico: con el mismo stock, un cambio de armado sólo mueve las
 * prendas que el cambio obliga a mover. Y lo que entra y lo que no, ⛔ no lo decide `estabilizar`.
 */

import { describe, expect, it } from 'vitest'
import { acepta, barras, estabilizar, movimientos, ubicar, type Ubicacion } from '../lib/mapa-local/core'
import { hojaDeModulo, nombreBarra } from '../lib/mapa-local/hoja'
import { MAPA_INICIAL } from '../lib/mapa-local/inicial'
import type { MapaLocal, Nivel, Prenda } from '../lib/mapa-local/tipos'

/** Marzo es cambio de temporada: no duerme nada, así estos tests miran sólo el llenado de barras. */
const HOY = '2026-03-15'

const prenda = (nombre: string, over: Partial<Prenda> = {}): Prenda => ({ clave: `${nombre}|`, productId: nombre, nombre, color: '', tipo: 'TOP', linea: 'nc', img: null, unidades: 1, ventas30: null, ultimaVenta: null, alta: null, ritmo: null, tramo: 'vende', ...over })
const nivel = (over: Partial<Nivel>): Nivel => ({ pos: 'simple', alturaCm: 160, linea: 'nc', tipos: ['TOP'], cupo: null, ...over })
const mapaDe = (niveles: Nivel[][]): MapaLocal => ({
  version: 1,
  tipos: MAPA_INICIAL.tipos,
  modulos: niveles.map((ns, i) => ({ codigo: `D${i + 1}`, pared: 'der', orden: i + 1, anchoCm: 75, niveles: ns })),
})
const nombres = (u: Ubicacion, id: string) => (u.porBarra[id] || []).map((p) => p.nombre).sort()
const colgadas = (u: Ubicacion) => Object.values(u.porBarra).flat().map((p) => p.clave).sort()

/** El cambio de armado con el mismo stock, como lo hace la pantalla. */
function cambio(prendas: Prenda[], antes: MapaLocal, despues: MapaLocal) {
  const previa = ubicar(prendas, antes, 'comodo', HOY)
  const cruda = ubicar(prendas, despues, 'comodo', HOY)
  const u = estabilizar(cruda, previa, despues, 'comodo')
  return { previa, cruda, u, movs: movimientos(previa, u) }
}

describe('estabilizar', () => {
  // Tres tops colgados en D2 y D3; D1 es de sweaters y le suman TOP.
  const tops = ['A', 'B', 'C'].map((n, i) => prenda(n, { unidades: 10 - i }))
  const sweater = prenda('S', { tipo: 'SWEATER' })
  const antes = mapaDe([[nivel({ tipos: ['SWEATER'], cupo: 3 })], [nivel({ cupo: 2 })], [nivel({ cupo: 2 })]])
  const despues = mapaDe([[nivel({ tipos: ['SWEATER', 'TOP'], cupo: 3 })], [nivel({ cupo: 2 })], [nivel({ cupo: 2 })]])

  it('sumarle TOP a la primera barra ⛔ no mueve ningún top que ya estaba colgado', () => {
    const { cruda, previa, u, movs } = cambio([...tops, sweater], antes, despues)
    // Sin estabilizar, el llenado en orden se los lleva a la primera barra: el test no es trivial.
    expect(movimientos(previa, cruda).length).toBeGreaterThan(0)
    expect(movs).toEqual([])
    expect(nombres(u, 'D2-simple')).toEqual(['A', 'B'])
    expect(nombres(u, 'D3-simple')).toEqual(['C'])
  })

  it('⛔ no cambia qué entra y qué no, ni pasa un cupo, ni cuelga algo donde no va', () => {
    // Un stock más grande que el lugar, con tipos y líneas mezclados, y tres cambios de armado.
    const ps: Prenda[] = []
    for (let i = 0; i < 40; i++) ps.push(prenda(`P${i}`, { tipo: ['TOP', 'SWEATER', 'VESTIDO'][i % 3], linea: i % 4 ? 'nc' : 'sale', unidades: (i * 7) % 11 }))
    const a = mapaDe([
      [nivel({ pos: 'alta', alturaCm: 180, tipos: ['TOP'], cupo: 4 }), nivel({ pos: 'baja', alturaCm: 105, tipos: ['SWEATER'], cupo: 4 })],
      [nivel({ tipos: ['VESTIDO', 'TOP'], cupo: 5 })],
      [nivel({ tipos: ['TOP', 'SWEATER'], linea: 'sale', cupo: 4 })],
    ])
    const variantes: MapaLocal[] = [
      mapaDe([
        [nivel({ pos: 'alta', alturaCm: 180, tipos: ['TOP', 'SWEATER'], cupo: 4 }), nivel({ pos: 'baja', alturaCm: 105, tipos: ['SWEATER'], cupo: 2 })],
        [nivel({ tipos: ['TOP'], cupo: 6 })],
        [nivel({ tipos: ['VESTIDO', 'SWEATER'], linea: 'ambas', cupo: 4 })],
      ]),
      mapaDe([[nivel({ tipos: ['TOP', 'SWEATER', 'VESTIDO'], linea: 'ambas', cupo: 9 })], [nivel({ tipos: ['TOP'], cupo: 3 })]]),
      a,
    ]
    for (const b of variantes) {
      const { cruda, u } = cambio(ps, a, b)
      expect(colgadas(u)).toEqual(colgadas(cruda))
      expect(u.noEntran).toEqual(cruda.noEntran)
      for (const barra of barras(b, 'comodo')) {
        const en = u.porBarra[barra.id]
        expect(en.length).toBeLessThanOrEqual(barra.cupo)
        for (const p of en) expect(acepta(barra.nivel, p)).toBe(true)
      }
    }
  })

  it('si la barra de antes está llena, la cambia por una que tampoco estaba en su lugar', () => {
    // A y B estaban en D2. Con el armado nuevo D1 también acepta tops: el llenado en orden
    // pone A en D1 y deja B y C (nueva) en D2. Lo estable es A y B quietas en D2, y C en D1.
    const antes2 = mapaDe([[nivel({ tipos: ['SWEATER'], cupo: 1 })], [nivel({ cupo: 2 })]])
    const despues2 = mapaDe([[nivel({ tipos: ['TOP'], cupo: 1 })], [nivel({ cupo: 2 })]])
    const ps = [prenda('A', { unidades: 9 }), prenda('B', { unidades: 8 })]
    const previa = ubicar(ps, antes2, 'comodo', HOY)
    const conC = [...ps, prenda('C', { unidades: 1 })]
    const cruda = ubicar(conC, despues2, 'comodo', HOY)
    expect(nombres(cruda, 'D1-simple')).toEqual(['A'])
    const u = estabilizar(cruda, previa, despues2, 'comodo')
    expect(nombres(u, 'D2-simple')).toEqual(['A', 'B'])
    expect(nombres(u, 'D1-simple')).toEqual(['C'])
  })

  it('sin cambio de armado no mueve nada', () => {
    const ps = [...Array(12)].map((_, i) => prenda(`P${i}`, { unidades: i }))
    const { movs } = cambio(ps, MAPA_INICIAL, MAPA_INICIAL)
    expect(movs).toEqual([])
  })
})

describe('ubicar hace lugar', () => {
  it('⛔ no manda al depósito lo que entra corriendo otra prenda a una barra suya', () => {
    // D1 acepta tops y sweaters; D2 sólo tops. Los tops llegan primero y llenan D1.
    const mapa = mapaDe([[nivel({ tipos: ['TOP', 'SWEATER'], cupo: 2 })], [nivel({ cupo: 2 })]])
    const u = ubicar([prenda('A', { unidades: 9 }), prenda('B', { unidades: 8 }), prenda('S', { tipo: 'SWEATER' })], mapa, 'comodo', HOY)
    expect(u.noEntran).toEqual([])
    expect(nombres(u, 'D1-simple')).toContain('S')
  })
  it('en cadena: corre una de D1 a D2 y otra de D2 a D3', () => {
    const mapa = mapaDe([[nivel({ tipos: ['TOP', 'SWEATER'], cupo: 1 })], [nivel({ tipos: ['TOP', 'VESTIDO'], cupo: 1 })], [nivel({ tipos: ['VESTIDO'], cupo: 1 })]])
    const u = ubicar([prenda('T', { unidades: 9 }), prenda('V', { tipo: 'VESTIDO', unidades: 8 }), prenda('S', { tipo: 'SWEATER' })], mapa, 'comodo', HOY)
    expect(u.noEntran).toEqual([])
    expect([nombres(u, 'D1-simple'), nombres(u, 'D2-simple'), nombres(u, 'D3-simple')]).toEqual([['S'], ['T'], ['V']])
  })
  it('que no entre una de sale ⛔ deja afuera a las de colección del mismo tipo', () => {
    const mapa = mapaDe([[nivel({ cupo: 1 })], [nivel({ linea: 'sale', cupo: 1 })]])
    const u = ubicar([prenda('S1', { linea: 'sale', unidades: 9 }), prenda('S2', { linea: 'sale', unidades: 8 }), prenda('N', { unidades: 1 })], mapa, 'comodo', HOY)
    expect(u.noEntran.map((p) => p.nombre)).toEqual(['S2'])
    expect(nombres(u, 'D1-simple')).toEqual(['N'])
  })
  it('cuando no entran todas, siguen quedando afuera las de menos unidades', () => {
    const mapa = mapaDe([[nivel({ tipos: ['TOP', 'SWEATER'], cupo: 1 })], [nivel({ cupo: 1 })]])
    const u = ubicar([prenda('A', { unidades: 9 }), prenda('B', { unidades: 8 }), prenda('S', { tipo: 'SWEATER', unidades: 1 })], mapa, 'comodo', HOY)
    expect(u.noEntran.map((p) => p.nombre)).toEqual(['S'])
  })
})

describe('movimientos', () => {
  it('dice de dónde a dónde: del depósito, al depósito o de una barra a otra, y el depósito al final', () => {
    // D1 era de tops; pasa a ser de sweaters, y D2 de tops con lugar para uno solo.
    const antes = mapaDe([[nivel({ cupo: 2 })], [nivel({ tipos: ['SWEATER'], cupo: 1 })]])
    const despues = mapaDe([[nivel({ tipos: ['SWEATER'], cupo: 2 })], [nivel({ cupo: 1 })]])
    const ps = [prenda('A', { unidades: 5 }), prenda('B', { unidades: 4 }), prenda('S1', { tipo: 'SWEATER', unidades: 3 }), prenda('S2', { tipo: 'SWEATER', unidades: 2 })]
    const { movs } = cambio(ps, antes, despues)
    const de = Object.fromEntries(movs.map((m) => [m.prenda.nombre, [m.de, m.a]]))
    expect(de).toEqual({ A: ['D1-simple', 'D2-simple'], B: ['D1-simple', null], S1: ['D2-simple', 'D1-simple'], S2: [null, 'D1-simple'] })
    expect(movs.at(-1)!.a).toBeNull()
    expect(movs.map((m) => m.a)).toEqual(['D1-simple', 'D1-simple', 'D2-simple', null])
  })
})

describe('hojaDeModulo', () => {
  it('barra por barra en el orden en que se mira, con lo que entra marcado y lo que sale con destino', () => {
    // Las barras van guardadas al revés de como se miran: la hoja las tiene que dar vuelta.
    const antes = mapaDe([[nivel({ pos: 'baja', alturaCm: 105, tipos: ['SWEATER'], cupo: 1 }), nivel({ pos: 'alta', alturaCm: 180, cupo: 1 })]])
    const despues = mapaDe([[nivel({ pos: 'baja', alturaCm: 105, cupo: 2 }), nivel({ pos: 'alta', alturaCm: 180, tipos: ['SWEATER'], cupo: 1 })]])
    const ps = [prenda('A', { unidades: 5 }), prenda('S', { tipo: 'SWEATER' }), prenda('N')]
    const { u, movs } = cambio(ps, antes, despues)
    const h = hojaDeModulo(despues, despues.modulos[0], u, movs, 'comodo')
    expect(h.barras.map((b) => b.id)).toEqual(['D1-alta', 'D1-baja'])
    const [alta, baja] = h.barras
    expect(alta.prendas).toEqual([{ prenda: ps[1], viene: 'D1-baja' }])
    expect(alta.salen).toEqual([{ prenda: ps[0], a: 'D1-baja' }])
    expect(baja.prendas).toEqual([
      { prenda: ps[0], viene: 'D1-alta' },
      { prenda: ps[2], viene: null },
    ])
    expect(baja.salen).toEqual([{ prenda: ps[1], a: 'D1-alta' }])
  })

  it('sin cambio es la hoja de armar: nada marcado como nuevo ni para sacar', () => {
    const mapa = mapaDe([[nivel({ cupo: 2 })]])
    const u = ubicar([prenda('A'), prenda('B')], mapa, 'comodo', HOY)
    const h = hojaDeModulo(mapa, mapa.modulos[0], u, null, 'comodo')
    expect(h.barras[0].prendas.every((r) => !('viene' in r))).toBe(true)
    expect(h.barras[0].salen).toEqual([])
    expect(h.barras[0].detalle).toContain('2 de 2 perchas')
  })

  it('nombra las barras como se dicen en el local', () => {
    expect(nombreBarra('D03-alta')).toBe('D03 arriba')
    expect(nombreBarra('ISLA-simple')).toBe('ISLA barra simple')
    expect(nombreBarra(null)).toBe('depósito')
  })
})
