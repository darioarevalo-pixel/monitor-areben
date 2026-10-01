/**
 * Mapa del local, F4: el control de un módulo con el lector.
 *
 * El oráculo es el mapa mismo: lo que `ubicar` pone en el módulo es lo que debería pasar por el
 * lector parado ahí. Falta = esperada que ⛔ no pasó acá; sobra = pasó acá y el mapa la pone en otro
 * lado. Los escaneos se arman a mano, por otro camino que `prendasDelLocal`.
 */

import { describe, expect, it } from 'vitest'
import { ubicar } from '../lib/mapa-local/core'
import { claveDeEscaneo, controlDelRecorrido, controlDeModulo, moduloDelLugar, textoDestino } from '../lib/mapa-local/control'
import { MAPA_INICIAL } from '../lib/mapa-local/inicial'
import type { EscaneoLibre } from '../lib/exhib/libre'
import type { MapaLocal, Nivel, Prenda } from '../lib/mapa-local/tipos'

const prenda = (pid: string, over: Partial<Prenda> = {}): Prenda => ({ clave: `${pid}|`, productId: pid, nombre: pid, color: '', tipo: 'TOP', linea: 'nc', img: null, unidades: 1, ...over })
const nivel = (over: Partial<Nivel>): Nivel => ({ pos: 'simple', alturaCm: 160, linea: 'nc', tipos: ['TOP'], cupo: null, ...over })
const mapaDe = (niveles: Nivel[][]): MapaLocal => ({
  version: 1,
  tipos: MAPA_INICIAL.tipos,
  modulos: niveles.map((ns, i) => ({ codigo: `D0${i + 1}`, pared: 'der', orden: i + 1, anchoCm: 75, niveles: ns })),
})
const esc = (lugar: string, pid: string | null, size = 'M', over: Partial<EscaneoLibre> = {}): EscaneoLibre =>
  ({ lugar, variante_id: `${pid}|${size}`, encontrado: !!pid, codigo_crudo: 'x', barcode: null, sku: null, product_id: pid, product_name: pid, size, cats: [], qty: 1, precio: null, promo: null, escaneado_en: '2026-10-01T12:00:00Z', ...over }) as EscaneoLibre

describe('moduloDelLugar', () => {
  const mapa = mapaDe([[nivel({})], [nivel({})]])
  it('reconoce el código escrito de cualquier forma', () => {
    for (const s of ['D01', 'd01', 'D1', ' d 1 ', 'D001']) expect(moduloDelLugar(mapa, s)?.codigo).toBe('D01')
  })
  it('un lugar que ⛔ no es un módulo da null', () => {
    for (const s of ['vidriera', 'perchero tops', '', 'D3', 'D10']) expect(moduloDelLugar(mapa, s)).toBeNull()
  })
})

describe('claveDeEscaneo', () => {
  it('es la misma clave que arma prendasDelLocal: producto × color, sin el talle', () => {
    expect(claveDeEscaneo(esc('D01', 'P1', 'Bordó - S'))).toBe('P1|bordó')
    expect(claveDeEscaneo(esc('D01', 'P1', 'M'))).toBe('P1|')
  })
  it('un código que ⛔ no cruzó no tiene prenda', () => {
    expect(claveDeEscaneo(esc('D01', null))).toBeNull()
  })
})

describe('controlDeModulo', () => {
  // D01 tops (cupo 2), D02 tops (cupo 1), D03 sweaters (cupo 1). Prioridad por unidades.
  const mapa = mapaDe([[nivel({ cupo: 2 })], [nivel({ cupo: 1 })], [nivel({ tipos: ['SWEATER'], cupo: 1 })]])
  const prendas = [
    prenda('A', { unidades: 9 }),
    prenda('B', { unidades: 8 }),
    prenda('C', { unidades: 7 }),
    prenda('E', { unidades: 1 }), // no entra: va al depósito
    prenda('S', { tipo: 'SWEATER' }),
    prenda('V', { tipo: 'VESTIDO' }), // ninguna barra lo acepta
  ]
  const u = ubicar(prendas, mapa, 'comodo')
  const d01 = mapa.modulos[0]

  it('el fixture cae como se espera (si no, el resto ⛔ no prueba nada)', () => {
    expect(u.porBarra['D01-simple'].map((p) => p.productId).sort()).toEqual(['A', 'B'])
    expect(u.porBarra['D02-simple'].map((p) => p.productId)).toEqual(['C'])
    expect(u.noEntran.map((p) => p.productId)).toEqual(['E'])
    expect(u.sinLugar.map((p) => p.productId)).toEqual(['V'])
  })

  it('todo lo esperado escaneado y nada de más: sin faltas ni sobras', () => {
    const c = controlDeModulo(mapa, u, d01, [esc('D01', 'A'), esc('D01', 'B', 'S'), esc('D01', 'B', 'L')])
    expect(c).toMatchObject({ codigo: 'D01', esperadas: 2, bien: 2, faltan: [], sobran: [], sinJuzgar: 0 })
  })

  it('falta lo que ⛔ no pasó acá, y dice dónde se la vio en el recorrido', () => {
    const c = controlDeModulo(mapa, u, d01, [esc('D01', 'A'), esc('vidriera', 'B'), esc('D02', 'B')])
    expect(c.bien).toBe(1)
    expect(c.faltan.map((f) => [f.prenda.productId, f.vistaEn])).toEqual([['B', ['D02', 'vidriera']]])
  })

  it('sobra lo que pasó acá y el mapa pone en otro lado, con su destino', () => {
    const c = controlDeModulo(mapa, u, d01, [esc('D01', 'A'), esc('D01', 'B'), esc('D01', 'C'), esc('D01', 'E'), esc('D01', 'S'), esc('D01', 'V'), esc('D01', 'Z')])
    const dest = Object.fromEntries(c.sobran.map((s) => [s.nombre, textoDestino(s.destino)]))
    expect(dest).toEqual({
      C: 'va en D02',
      E: 'no entra: va al depósito',
      S: 'va en D03',
      V: 'ninguna barra acepta su tipo',
      Z: 'el sistema no le da stock: no está en el mapa',
    })
  })

  it('dos talles de la misma sobra son UNA percha, y lo que ⛔ no cruzó se cuenta aparte', () => {
    const c = controlDeModulo(mapa, u, d01, [esc('D01', 'C', 'S'), esc('D01', 'C', 'M'), esc('D01', null), esc('D01', null)])
    expect(c.sobran.map((s) => s.nombre)).toEqual(['C'])
    expect(c.sinJuzgar).toBe(2)
  })

  it('«acá» es el módulo escrito como sea, y los escaneos de otro lugar ⛔ suman acá', () => {
    const c = controlDeModulo(mapa, u, d01, [esc('D01 ', 'A'), esc('d1', 'B'), esc('D02', 'C')])
    expect(c.bien).toBe(2)
    expect(c.sobran).toEqual([])
  })
})

describe('controlDelRecorrido', () => {
  const mapa = mapaDe([[nivel({ cupo: 2 })], [nivel({ cupo: 1 })], [nivel({ tipos: ['SWEATER'], cupo: 1 })]])
  const u = ubicar([prenda('A', { unidades: 9 }), prenda('B', { unidades: 8 }), prenda('C', { unidades: 7 }), prenda('S', { tipo: 'SWEATER' })], mapa, 'comodo')

  it('junta sólo los módulos caminados, en el orden del mapa, y nombra los que ⛔ se caminaron', () => {
    const r = controlDelRecorrido(mapa, u, [esc('D03', 'S'), esc('d1', 'A'), esc('vidriera', 'B')])
    expect(r.modulos.map((c) => c.codigo)).toEqual(['D01', 'D03'])
    expect(r.noCaminados).toEqual(['D02'])
    // D01 espera A y B (B se vio en la vidriera); D03 espera S. D02 ⛔ suma su C como faltante.
    expect(r).toMatchObject({ esperadas: 3, bien: 2, faltan: 1, sobran: 0 })
  })

  it('un módulo cuenta como caminado aunque lo escaneado ⛔ haya cruzado', () => {
    const r = controlDelRecorrido(mapa, u, [esc('D02', null)])
    expect(r.modulos.map((c) => c.codigo)).toEqual(['D02'])
    expect(r).toMatchObject({ esperadas: 1, bien: 0, faltan: 1 })
  })

  it('la misma prenda sobrando en dos módulos es UNA percha para mover', () => {
    const r = controlDelRecorrido(mapa, u, [esc('D01', 'C'), esc('D03', 'C'), esc('D03', 'A')])
    expect(r.modulos.map((c) => c.sobran.length)).toEqual([1, 2])
    expect(r.sobran).toBe(2)
  })

  it('sin ningún módulo caminado ⛔ hay nada que juntar', () => {
    const r = controlDelRecorrido(mapa, u, [esc('vidriera', 'A')])
    expect(r.modulos).toEqual([])
    expect(r.noCaminados).toEqual(['D01', 'D02', 'D03'])
    expect(r).toMatchObject({ esperadas: 0, bien: 0, faltan: 0, sobran: 0 })
  })
})
