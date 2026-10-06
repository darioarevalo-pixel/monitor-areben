import { describe, expect, it } from 'vitest'
import { aplicarPromos, normalizarPromos, promosVigentes } from '@/lib/caja/promos.core.js'
import { REGLAS_INICIALES, cobro, renglones } from '@/lib/caja/core.core.js'

/**
 * Caja · W5, las promos (Bruno, 4 y 5-oct-2026). Los oráculos se hicieron a mano, antes:
 * - 3x2 sobre $10.000 + $8.000 + $5.000 ⇒ gratis la más barata ⇒ −$5.000 ⇒ $18.000.
 * - Eso en efectivo (−15 %, redondeo a $100): $18.000 × 0,85 = $15.300.
 * - 2x1 sobre $10.000, $9.000, $8.000, $7.000 ⇒ grupos (10.000, 9.000) y (8.000, 7.000) ⇒ −$16.000.
 * - 2ª unidad al 50 % sobre $10.000 + $6.000 ⇒ −$3.000 sobre la de $6.000.
 */
const HOY = '2026-10-06'
const SIN_FERIA = new Set<number>()
const base = { desde: '2026-10-01', hasta: null, activa: true }
const todo = { tipo: 'todo' as const }
const p3x2 = { ...base, id: 'a', nombre: '3x2', tipo: 'nxm' as const, lleva: 3, paga: 2, alcance: todo }
const p2x1 = { ...base, id: 'b', nombre: '2x1', tipo: 'nxm' as const, lleva: 2, paga: 1, alcance: todo }
const pSegunda = { ...base, id: 'c', nombre: '2ª al 50', tipo: 'segunda_unidad' as const, pct: 50, alcance: todo }
const p20 = { ...base, id: 'd', nombre: '20% todo', tipo: 'pct' as const, pct: 20, alcance: todo }
const pMinimo = { ...base, id: 'e', nombre: '$5.000 desde $50.000', tipo: 'monto_minimo' as const, minimo: 50000, pesos: 5000, alcance: todo }

let n = 0
const item = (precio: number, extra: Record<string, unknown> = {}) => ({ product_id: 100 + ++n, size_id: 1, cantidad: 1, precio, ...extra })
const rebajas = (r: ReturnType<typeof aplicarPromos>) => r.items.map((it) => (it.rebaja && it.rebaja.tipo === 'pesos' ? it.rebaja.valor : 0))

describe('aplicarPromos — cada tipo', () => {
  it('🔑 3x2: sale gratis la más barata (−$5.000), y en efectivo da $15.300', () => {
    const r = aplicarPromos({ items: [item(10000), item(8000), item(5000)], promos: [p3x2], feriaIds: SIN_FERIA, hoy: HOY })
    expect(rebajas(r)).toEqual([0, 0, 5000])
    expect(r.items[2].promos).toEqual(['3x2'])
    expect(r.items[0].promos).toBeUndefined()
    const c = cobro({ filas: renglones(r.items), pagos: [{ cuenta: 12921 }], reglas: REGLAS_INICIALES, descuentoVenta: null })
    expect(c.subtotal).toBe(18000)
    expect(c.total).toBe(15300)
  })

  it('2x1 con cuatro prendas: dos grupos, −$16.000', () => {
    const r = aplicarPromos({ items: [item(7000), item(10000), item(8000), item(9000)], promos: [p2x1], feriaIds: SIN_FERIA, hoy: HOY })
    expect(rebajas(r)).toEqual([7000, 0, 0, 9000])
    expect(r.aplicadas).toEqual([{ id: 'b', nombre: '2x1', pesos: 16000 }])
  })

  it('2x1 en UN renglón de cantidad 2: −$10.000 en ese renglón', () => {
    const r = aplicarPromos({ items: [item(10000, { cantidad: 2 })], promos: [p2x1], feriaIds: SIN_FERIA, hoy: HOY })
    expect(rebajas(r)).toEqual([10000])
  })

  it('3x2 con dos prendas: ⛔ alcanza, ⛔ descuenta', () => {
    const r = aplicarPromos({ items: [item(10000), item(8000)], promos: [p3x2], feriaIds: SIN_FERIA, hoy: HOY })
    expect(rebajas(r)).toEqual([0, 0])
    expect(r.aplicadas).toEqual([])
  })

  it('2ª unidad al 50 %: −$3.000 sobre la más barata', () => {
    const r = aplicarPromos({ items: [item(6000), item(10000)], promos: [pSegunda], feriaIds: SIN_FERIA, hoy: HOY })
    expect(rebajas(r)).toEqual([3000, 0])
  })

  it('% por categoría de TN: entra la que la tiene (sin importar mayúsculas ni espacios)', () => {
    const jeans = { ...base, id: 'j', nombre: '20% jeans', tipo: 'pct' as const, pct: 20, alcance: { tipo: 'categorias' as const, categorias: ['JEANS'] } }
    const r = aplicarPromos({ items: [item(10000, { categorias: [' jeans '] }), item(10000, { categorias: ['REMERAS'] }), item(10000)], promos: [jeans], feriaIds: SIN_FERIA, hoy: HOY })
    expect(rebajas(r)).toEqual([2000, 0, 0])
  })

  it('% por producto: entra sólo ese producto', () => {
    const a = item(10000), b = item(10000)
    const pr = { ...base, id: 'p', nombre: '10% uno', tipo: 'pct' as const, pct: 10, alcance: { tipo: 'productos' as const, productos: [{ id: a.product_id, nombre: 'A' }] } }
    expect(rebajas(aplicarPromos({ items: [a, b], promos: [pr], feriaIds: SIN_FERIA, hoy: HOY }))).toEqual([1000, 0])
  })
})

describe('aplicarPromos — las decisiones de Bruno (5-oct)', () => {
  it('🔑 una promo por prenda, la mejor: 3x2 (−$10.000) le gana a 20 % (−$6.000)', () => {
    const r = aplicarPromos({ items: [item(10000), item(10000), item(10000)], promos: [p20, p3x2], feriaIds: SIN_FERIA, hoy: HOY })
    expect(rebajas(r)).toEqual([0, 0, 10000])
    expect(r.aplicadas.map((a) => a.id)).toEqual(['a'])
  })

  it('las prendas que usó el 3x2 ⛔ entran en otra; la que sobra sí (20 %)', () => {
    const jeans = { ...p3x2, alcance: { tipo: 'categorias' as const, categorias: ['JEANS'] } }
    const j = { categorias: ['JEANS'] }
    const r = aplicarPromos({ items: [item(10000, j), item(10000, j), item(10000, j), item(10000)], promos: [p20, jeans], feriaIds: SIN_FERIA, hoy: HOY })
    expect(rebajas(r)).toEqual([0, 0, 10000, 2000])
  })

  it('🔴 feria ⛔ entra: el 2x1 se arma sólo con las que no son de feria', () => {
    const f = item(10000)
    const r = aplicarPromos({ items: [f, item(9000), item(8000)], promos: [p2x1], feriaIds: new Set([f.product_id]), hoy: HOY })
    expect(rebajas(r)).toEqual([0, 0, 8000])
  })

  it('🔴 el descuento a mano REEMPLAZA a la promo: esa prenda sale como vino', () => {
    const mano = item(10000, { rebaja: { tipo: 'pct', valor: 10 } })
    const r = aplicarPromos({ items: [mano, item(9000), item(8000)], promos: [p2x1], feriaIds: SIN_FERIA, hoy: HOY })
    expect(r.items[0]).toBe(mano)
    expect(rebajas(r)).toEqual([0, 0, 8000])
    // y el `descuento` % viejo cuenta como a mano también
    const viejo = item(10000, { descuento: 5 })
    expect(aplicarPromos({ items: [viejo], promos: [p20], feriaIds: SIN_FERIA, hoy: HOY }).items[0]).toBe(viejo)
  })
})

describe('aplicarPromos — la de compra (monto mínimo)', () => {
  it('🔑 desde $50.000: −$5.000 a la venta; ⛔ toca los renglones', () => {
    const r = aplicarPromos({ items: [item(30000), item(30000)], promos: [pMinimo], feriaIds: SIN_FERIA, hoy: HOY })
    expect(r.venta).toEqual({ id: 'e', nombre: '$5.000 desde $50.000', pesos: 5000 })
    expect(rebajas(r)).toEqual([0, 0])
  })

  it('el mínimo se mide DESPUÉS de las promos de prenda y SIN la feria', () => {
    // 2x1 sobre 30.000 + 25.000 ⇒ quedan 30.000 < 50.000
    expect(aplicarPromos({ items: [item(30000), item(25000)], promos: [pMinimo, p2x1], feriaIds: SIN_FERIA, hoy: HOY }).venta).toBeNull()
    const f = item(30000)
    expect(aplicarPromos({ items: [f, item(30000)], promos: [pMinimo], feriaIds: new Set([f.product_id]), hoy: HOY }).venta).toBeNull()
  })

  it('justo en el mínimo vale; con dos, la que más descuenta', () => {
    const otra = { ...pMinimo, id: 'f', nombre: '$8.000', pesos: 8000 }
    expect(aplicarPromos({ items: [item(50000)], promos: [pMinimo, otra], feriaIds: SIN_FERIA, hoy: HOY }).venta?.id).toBe('f')
    expect(aplicarPromos({ items: [item(49999)], promos: [pMinimo], feriaIds: SIN_FERIA, hoy: HOY }).venta).toBeNull()
  })
})

describe('promosVigentes', () => {
  it('desde ≤ hoy ≤ hasta, y activa', () => {
    const lista = [
      { ...p20, id: '1' },
      { ...p20, id: '2', desde: '2026-10-07' },
      { ...p20, id: '3', hasta: '2026-10-05' },
      { ...p20, id: '4', hasta: HOY },
      { ...p20, id: '5', activa: false },
    ]
    expect(promosVigentes(lista, HOY).map((p) => p.id)).toEqual(['1', '4'])
  })

  it('sin fecha de hoy, error', () => {
    expect(() => promosVigentes([], '')).toThrow(/fecha/)
  })
})

describe('normalizarPromos', () => {
  it('una válida pasa limpia (categorías en mayúscula, hasta vacío ⇒ null)', () => {
    const [p] = normalizarPromos([{ id: 'x1', nombre: ' 3x2 jeans ', tipo: 'nxm', lleva: 3, paga: 2, desde: '2026-10-01', hasta: '', alcance: { tipo: 'categorias', categorias: ['jeans', 'JEANS '] } }])
    expect(p).toEqual({ id: 'x1', nombre: '3x2 jeans', tipo: 'nxm', lleva: 3, paga: 2, desde: '2026-10-01', hasta: null, activa: true, alcance: { tipo: 'categorias', categorias: ['JEANS'] } })
  })

  it.each([
    [{ tipo: 'nxm', lleva: 2, paga: 2 }, /mayor que/],
    [{ tipo: 'pct', pct: 0 }, /1 a 100/],
    [{ tipo: 'monto_minimo', minimo: 5000, pesos: 5000 }, /menor que el mínimo/],
    [{ tipo: 'pct', pct: 10, hasta: '2026-09-30' }, /anterior/],
    [{ tipo: 'pct', pct: 10, alcance: { tipo: 'categorias', categorias: [] } }, /categoría/],
    [{ tipo: 'otro' }, /tipo/],
  ])('rechaza %o', (extra, msg) => {
    expect(() => normalizarPromos([{ id: 'x', nombre: 'P', desde: '2026-10-01', alcance: todo, ...extra }])).toThrow(msg)
  })

  it('ids repetidos, error', () => {
    const p = { id: 'x', nombre: 'P', tipo: 'pct', pct: 10, desde: '2026-10-01', alcance: todo }
    expect(() => normalizarPromos([p, p])).toThrow(/repetido/)
  })
})
