/**
 * «Qué se cuelga» (1-oct-2026): la temporada por tipo de prenda y los tramos con que se decide qué
 * queda en el salón cuando no entra todo. Las fechas van fijas: la regla ⛔ no lee el reloj.
 */

import { describe, expect, it } from 'vitest'
import { actividadDelEtl, conTemporadas, despierta, enRango, prendasDelLocal, prioridad, ritmoDe, temporadaDe, tramoDe, ubicar } from '../lib/mapa-local/core'
import { controlDeModulo, textoDestino } from '../lib/mapa-local/control'
import { MAPA_INICIAL, TEMPORADAS_INICIALES } from '../lib/mapa-local/inicial'
import { proponerArmado } from '../lib/mapa-local/proponer'
import { sanearMapa } from '../lib/mapa-local/validar.core.js'
import type { MapaLocal, Nivel, Prenda } from '../lib/mapa-local/tipos'
import type { ExhibItem } from '../lib/exhib/tipos'

const VERANO = '2026-01-15'
const INVIERNO = '2026-07-15'
const CAMBIO = '2026-10-01'

const prenda = (nombre: string, over: Partial<Prenda> = {}): Prenda => ({ clave: `${nombre}|`, productId: nombre, nombre, color: '', tipo: 'TOP', linea: 'nc', img: null, unidades: 1, ventas30: null, ultimaVenta: null, alta: null, ritmo: null, tramo: 'vende', ...over })
const nivel = (over: Partial<Nivel>): Nivel => ({ pos: 'simple', alturaCm: 160, linea: 'nc', tipos: ['TOP'], cupo: null, ...over })
const mapaDe = (niveles: Nivel[][]): MapaLocal => ({
  version: 1,
  tipos: MAPA_INICIAL.tipos,
  modulos: niveles.map((ns, i) => ({ codigo: `D${i + 1}`, pared: 'der', orden: i + 1, anchoCm: 75, niveles: ns })),
})
const item = (over: Partial<ExhibItem>): ExhibItem => ({
  barcode: '', sku: 'ZAT1', productId: 'p', name: 'TOP X', size: 'U', qty: 1, img: null,
  cat: '', cleanCats: [], tnId: null, precio: 1000, promo: null, ...over,
})

describe('la temporada', () => {
  it('un tramo normal y uno que cruza el año nuevo', () => {
    expect(enRango({ desde: '03-01', hasta: '10-15' }, '2026-07-15')).toBe(true)
    expect(enRango({ desde: '03-01', hasta: '10-15' }, '2026-10-16')).toBe(false)
    expect(enRango({ desde: '09-15', hasta: '03-31' }, '2026-01-15')).toBe(true)
    expect(enRango({ desde: '09-15', hasta: '03-31' }, '2026-12-31')).toBe(true)
    expect(enRango({ desde: '09-15', hasta: '03-31' }, '2026-06-01')).toBe(false)
    // Las dos puntas cuentan.
    expect(enRango({ desde: '09-15', hasta: '03-31' }, '2026-09-15')).toBe(true)
    expect(enRango({ desde: '09-15', hasta: '03-31' }, '2026-03-31')).toBe(true)
  })

  it('los sweaters duermen en verano, las bermudas en invierno, y en el cambio están despiertos los dos', () => {
    expect(despierta(MAPA_INICIAL, 'SWEATER', VERANO)).toBe(false)
    expect(despierta(MAPA_INICIAL, 'BERMUDA', VERANO)).toBe(true)
    expect(despierta(MAPA_INICIAL, 'SWEATER', INVIERNO)).toBe(true)
    expect(despierta(MAPA_INICIAL, 'BERMUDA', INVIERNO)).toBe(false)
    expect(despierta(MAPA_INICIAL, 'SWEATER', CAMBIO)).toBe(true)
    expect(despierta(MAPA_INICIAL, 'BERMUDA', CAMBIO)).toBe(true)
    // Lo de todo el año ⛔ no duerme nunca.
    for (const d of [VERANO, INVIERNO, CAMBIO]) expect(despierta(MAPA_INICIAL, 'TOP', d)).toBe(true)
  })

  it('un mapa guardado antes de la temporada usa las fechas y la temporada del armado inicial', () => {
    const viejo: MapaLocal = { version: 1, modulos: [], tipos: [{ tipo: 'SWEATER', largo: 'L2', perchasPorM: 10, topePorM: null, cuelga: true }] }
    expect(temporadaDe(viejo, 'SWEATER')).toBe('invierno')
    expect(despierta(viejo, 'SWEATER', VERANO)).toBe(false)
    // Un tipo que ⛔ no está en ningún lado es de todo el año.
    expect(temporadaDe(viejo, 'POLERA')).toBe('todo')
  })

  it('ubicar: lo que duerme ⛔ no pide percha y ⛔ no cuenta como «no entra»', () => {
    const mapa = mapaDe([[nivel({ tipos: ['TOP', 'SWEATER'], cupo: 1 })]])
    const u = ubicar([prenda('T'), prenda('S', { tipo: 'SWEATER', unidades: 9 })], mapa, 'comodo', VERANO)
    expect(u.durmiendo.map((p) => p.nombre)).toEqual(['S'])
    expect(u.noEntran).toEqual([])
    expect(u.porBarra['D1-simple'].map((p) => p.nombre)).toEqual(['T'])
    // El mismo stock en el cambio de temporada: compiten, y el sweater gana por unidades.
    const c = ubicar([prenda('T'), prenda('S', { tipo: 'SWEATER', unidades: 9 })], mapa, 'comodo', CAMBIO)
    expect(c.durmiendo).toEqual([])
    expect(c.noEntran.map((p) => p.nombre)).toEqual(['T'])
  })

  it('proponer: un tipo dormido ⛔ no se lleva barras aunque tenga mucho stock', () => {
    const base = mapaDe(Array.from({ length: 4 }, () => [nivel({ pos: 'alta', alturaCm: 180, tipos: ['TOP'] }), nivel({ pos: 'baja', alturaCm: 105, tipos: ['TOP'] })]))
    const ps = [
      ...Array.from({ length: 80 }, (_, i) => prenda(`S${i}`, { tipo: 'SWEATER' })),
      ...Array.from({ length: 30 }, (_, i) => prenda(`T${i}`)),
    ]
    const conAbrigos = (m: MapaLocal) => m.modulos.flatMap((x) => x.niveles).filter((n) => n.tipos.includes('SWEATER')).length
    expect(conAbrigos(proponerArmado(ps, base, 'comodo', VERANO).mapa)).toBe(0)
    expect(conAbrigos(proponerArmado(ps, base, 'comodo', INVIERNO).mapa)).toBeGreaterThan(0)
  })
})

describe('los tramos y el ritmo', () => {
  it('nueva hasta 7 días desde el alta; sin rotación sólo con cero SABIDO y a la venta hace más de 30', () => {
    expect(tramoDe('2026-09-24', 0, '2026-10-01')).toBe('nueva')
    expect(tramoDe('2026-09-23', 0, '2026-10-01')).toBe('vende')
    expect(tramoDe('2026-09-01', 0, '2026-10-01')).toBe('vende')
    expect(tramoDe('2026-08-31', 0, '2026-10-01')).toBe('sin-rotacion')
    expect(tramoDe('2026-08-31', 3, '2026-10-01')).toBe('vende')
    expect(tramoDe(null, null, '2026-10-01')).toBe('vende')
    expect(tramoDe(null, 0, '2026-10-01')).toBe('sin-rotacion')
  })

  it('el ritmo: ventas por día desde el alta, con tope en 30 días', () => {
    expect(ritmoDe('2026-09-21', 3, '2026-10-01')).toBeCloseTo(0.3)
    expect(ritmoDe('2026-01-01', 6, '2026-10-01')).toBeCloseTo(0.2)
    expect(ritmoDe(null, 6, '2026-10-01')).toBeCloseTo(0.2)
    expect(ritmoDe('2026-10-01', 2, '2026-10-01')).toBe(2)
    expect(ritmoDe('2026-01-01', null, '2026-10-01')).toBeNull()
  })

  it('el orden: nueva (la más nueva primero) · por ritmo (sin dato detrás) · sin rotación', () => {
    const ps = [
      prenda('VIEJA', { tramo: 'sin-rotacion', ventas30: 0, ritmo: 0, unidades: 50 }),
      prenda('SIN-DATO', { tramo: 'vende', ventas30: null, ritmo: null, unidades: 40 }),
      prenda('LENTA', { tramo: 'vende', ventas30: 2, ritmo: 2 / 30, unidades: 1 }),
      prenda('RAPIDA', { tramo: 'vende', ventas30: 23, ritmo: 23 / 30, unidades: 1 }),
      prenda('NUEVA-SEP', { tramo: 'nueva', alta: '2026-09-26', unidades: 1 }),
      prenda('NUEVA-OCT', { tramo: 'nueva', alta: '2026-10-01', unidades: 1 }),
    ]
    expect([...ps].sort(prioridad).map((p) => p.nombre)).toEqual(['NUEVA-OCT', 'NUEVA-SEP', 'RAPIDA', 'LENTA', 'SIN-DATO', 'VIEJA'])
  })

  it('lo que vende 23 al mes le gana a lo nuevo de 20 días que todavía no vendió (el caso medido)', () => {
    const mapa = mapaDe([[nivel({ cupo: 1 })]])
    const ps = prendasDelLocal([
      item({ productId: 'viejo', size: 'U', qty: 1 }),
      item({ productId: 'nuevo', size: 'U', qty: 9 }),
    ], 'zattia', actividadDelEtl(
      [{ pid: 'viejo', size: 'U', sales30: 23, lastSale: '2026-09-30' }, { pid: 'nuevo', size: 'U', sales30: 0, lastSale: null }],
      [{ id: 'viejo', ingresoFecha: '2026-03-01' }, { id: 'nuevo', ingresoFecha: '2026-09-11' }],
      CAMBIO,
    ))
    const u = ubicar(ps, mapa, 'comodo', CAMBIO)
    expect(u.porBarra['D1-simple'].map((p) => p.productId)).toEqual(['viejo'])
    expect(u.noEntran.map((p) => [p.productId, p.tramo])).toEqual([['nuevo', 'vende']])
  })

  it('lo nuevo de pocos días que ya vende rápido le gana a lo viejo que vende más en total', () => {
    const mapa = mapaDe([[nivel({ cupo: 1 })]])
    const u = ubicar([
      prenda('VIEJA', { ventas30: 5, ritmo: ritmoDe('2026-01-01', 5, CAMBIO), unidades: 9 }),
      prenda('NUEVA', { ventas30: 3, ritmo: ritmoDe('2026-09-21', 3, CAMBIO), alta: '2026-09-21' }),
    ], mapa, 'comodo', CAMBIO)
    expect(u.noEntran.map((p) => p.nombre)).toEqual(['VIEJA'])
  })

  it('cuando no entra todo, queda afuera lo que no rota aunque tenga más unidades', () => {
    const mapa = mapaDe([[nivel({ cupo: 2 })]])
    const u = ubicar([
      prenda('MUERTA', { tramo: 'sin-rotacion', ventas30: 0, ritmo: 0, unidades: 30 }),
      prenda('NUEVA', { tramo: 'nueva', alta: '2026-09-28', unidades: 1 }),
      prenda('VENDE', { tramo: 'vende', ventas30: 4, ritmo: 4 / 30, unidades: 2 }),
    ], mapa, 'comodo', CAMBIO)
    expect(u.noEntran.map((p) => p.nombre)).toEqual(['MUERTA'])
  })
})

describe('las ventas del ETL llevadas a la percha', () => {
  const act = actividadDelEtl(
    [
      { pid: '1', size: 'Negro - S', sales30: 3, lastSale: '2026-09-20' },
      { pid: '1', size: 'Negro - M', sales30: 2, lastSale: '2026-09-28' },
      { pid: '1', size: 'Rojo - S', sales30: 0, lastSale: '2026-06-01' },
      { pid: '2', size: 'M', sales30: 0, lastSale: null },
    ],
    [{ id: '1', ingresoFecha: '2026-03-01' }, { id: '2', ingresoFecha: '2026-09-20' }],
    '2026-10-01',
  )

  it('suma los talles del mismo color y separa los colores', () => {
    expect(act.ventas.get('1|negro')).toEqual({ ventas30: 5, ultimaVenta: '2026-09-28' })
    expect(act.ventas.get('1|rojo')).toEqual({ ventas30: 0, ultimaVenta: '2026-06-01' })
  })

  it('prendasDelLocal: cada prenda con su tramo; lo que el ETL ⛔ no conoce queda sin dato', () => {
    const ps = prendasDelLocal([
      item({ productId: '1', size: 'Negro - S', qty: 2 }),
      item({ productId: '1', size: 'Rojo - S', qty: 2 }),
      item({ productId: '2', size: 'M', qty: 1 }),
      item({ productId: '9', size: 'M', qty: 1 }),
    ], 'zattia', act)
    expect(ps.map((p) => [p.clave, p.ventas30, p.tramo])).toEqual([
      ['1|negro', 5, 'vende'],
      ['1|rojo', 0, 'sin-rotacion'],
      ['2|', 0, 'vende'],
      ['9|', null, 'vende'],
    ])
  })

  it('sin ETL todas caen en «vende» y el orden vuelve a ser por unidades', () => {
    const ps = prendasDelLocal([item({ productId: '1', size: 'Rojo - S', qty: 2 })], 'zattia', null)
    expect(ps[0]).toMatchObject({ ventas30: null, alta: null, tramo: 'vende' })
  })
})

describe('guardar las temporadas', () => {
  it('conTemporadas cambia las fechas y la temporada de un tipo, ⛔ no las barras', () => {
    const otro = conTemporadas(MAPA_INICIAL, { temporadas: { verano: { desde: '10-01', hasta: '03-15' }, invierno: TEMPORADAS_INICIALES.invierno }, porTipo: { REMERA: 'verano', POLERA: 'invierno' } })
    expect(otro.modulos).toBe(MAPA_INICIAL.modulos)
    expect(otro.temporadas?.verano).toEqual({ desde: '10-01', hasta: '03-15' })
    expect(temporadaDe(otro, 'REMERA')).toBe('verano')
    // Un tipo que el mapa ⛔ no tenía entra a la tabla con su temporada.
    expect(otro.tipos.find((t) => t.tipo === 'POLERA')).toMatchObject({ temporada: 'invierno', cuelga: true })
    expect(sanearMapa(otro)).toMatchObject({ ok: true })
  })

  it('el saneo acepta un mapa sin temporadas y rechaza fechas o temporadas que ⛔ no existen', () => {
    const sin = { ...MAPA_INICIAL, temporadas: undefined, tipos: MAPA_INICIAL.tipos.map(({ temporada: _t, ...t }) => t) }
    const r = sanearMapa(sin)
    expect(r).toMatchObject({ ok: true })
    expect(r.ok && 'temporadas' in r.mapa).toBe(false)
    expect(sanearMapa({ ...MAPA_INICIAL, temporadas: { verano: { desde: '02-30', hasta: '03-31' }, invierno: TEMPORADAS_INICIALES.invierno } })).toMatchObject({ ok: false })
    expect(sanearMapa({ ...MAPA_INICIAL, temporadas: { verano: { desde: '9-15', hasta: '03-31' }, invierno: TEMPORADAS_INICIALES.invierno } })).toMatchObject({ ok: false })
    expect(sanearMapa({ ...MAPA_INICIAL, tipos: [{ tipo: 'TOP', largo: 'L1', perchasPorM: 22, cuelga: true, temporada: 'otoño' }] })).toMatchObject({ ok: false })
    // Guardado y releído, el mapa inicial queda igual.
    const ida = sanearMapa(MAPA_INICIAL)
    expect(ida.ok && ida.mapa.temporadas).toEqual(TEMPORADAS_INICIALES)
    expect(ida.ok && temporadaDe(ida.mapa, 'SWEATER')).toBe('invierno')
  })
})

describe('el control del lector', () => {
  it('una prenda dormida que se ve colgada sale como «fuera de temporada»', () => {
    const mapa = mapaDe([[nivel({ tipos: ['TOP', 'SWEATER'] })]])
    const u = ubicar([prenda('T'), prenda('S', { tipo: 'SWEATER' })], mapa, 'comodo', VERANO)
    const esc = (pid: string) => ({ id: pid, recorrido_id: 'r', lugar: 'D1', codigo_crudo: pid, product_id: pid, size: '', product_name: pid, encontrado: true, veces: 1, escaneado_en: '2026-01-15T12:00:00Z' })
    const c = controlDeModulo(mapa, u, mapa.modulos[0], [esc('T'), esc('S')] as never)
    expect(c.sobran.map((s) => textoDestino(s.destino))).toEqual(['fuera de temporada: va a guardarse'])
  })
})
