import { describe, expect, it } from 'vitest'
import { aplicarPromos, normalizarPromos, pctPorCantidad } from '@/lib/caja/promos.core.js'
import { REGLAS_INICIALES, cobro, renglones } from '@/lib/caja/core.core.js'

/**
 * Caja · la promo «por cantidad» (escalera), Bruno 10-nov-2026. Es la regla que cobra la web de BDI
 * desde el 10-nov (Resorty, grupo `post-cyber-bdi-2026`, modo `todo`, `acumula:false`).
 *
 * 🔑 El oráculo NO sale de este código: salió de `calcularDescuento` de Resorty con la foto real
 * (`~/Documents/cyber-2026/bdi/2026-11-10-post-cyber/carritos.mts`) y coincide con el pedido real
 * #22518 de la web (2 × $14.990 → −$4.497). Sin forma de pago:
 * - fundas a $14.990: 1 → $14.990 · 2 → $25.483 · 3 → $33.727,5 · 4 → $41.972
 * - $13.990 + $14.990 + $16.990 → $34.477,5
 * - 2 fundas + 1 templado de $6.990 (dentro de FUNDAS en TN, pero excluido) → −$4.497 sólo a las fundas
 */
const HOY = '2026-11-17'
const SIN_FERIA = new Set<number>()
const TEMPLADO = 9001
const BDI = {
  id: 'bdi',
  nombre: 'Llevá más, pagá menos',
  tipo: 'cantidad' as const,
  escalones: [
    { desde: 2, pct: 15 },
    { desde: 3, pct: 25 },
    { desde: 4, pct: 30 },
  ],
  alcance: { tipo: 'categorias' as const, categorias: ['FUNDAS'], excluidos: [{ id: TEMPLADO, nombre: 'TEMPLADO 9D PREMIUM' }] },
  desde: '2026-11-16',
  hasta: '2026-11-26',
  activa: true,
}

let n = 0
const funda = (precio: number, extra: Record<string, unknown> = {}) => ({ product_id: 100 + ++n, size_id: 1, cantidad: 1, precio, categorias: ['FUNDAS'], ...extra })
const subtotal = (items: ReturnType<typeof funda>[], promos = [BDI]) => {
  const r = aplicarPromos({ items, promos, feriaIds: SIN_FERIA, hoy: HOY })
  return { r, sub: cobro({ filas: renglones(r.items), pagos: [{ cuenta: 12921 }], reglas: REGLAS_INICIALES, descuentoVenta: null }).subtotal }
}
const rebajas = (r: ReturnType<typeof aplicarPromos>) => r.items.map((it) => (it.rebaja && it.rebaja.tipo === 'pesos' ? it.rebaja.valor : 0))

describe('promo por cantidad — el oráculo de la web de BDI', () => {
  it.each([
    [1, 14990],
    [2, 25483],
    [3, 33727.5],
    [4, 41972],
    [6, 62958], // 6 × 14.990 × 0,70: «4 o más» sigue en 30 %
  ])('🔑 %i fundas de $14.990 → $%d', (cant, esperado) => {
    expect(subtotal(Array.from({ length: cant }, () => funda(14990))).sub).toBe(esperado)
  })

  it('las mismas 3 fundas en UN renglón de cantidad 3 dan lo mismo', () => {
    expect(subtotal([funda(14990, { cantidad: 3 })]).sub).toBe(33727.5)
  })

  it('🔑 precios distintos: cada una sobre SU precio → $34.477,5', () => {
    const { r, sub } = subtotal([funda(13990), funda(14990), funda(16990)])
    expect(sub).toBe(34477.5)
    expect(rebajas(r)).toEqual([3497.5, 3747.5, 4247.5])
    expect(r.items.map((it) => (it as { promos?: string[] }).promos)).toEqual([[BDI.nombre], [BDI.nombre], [BDI.nombre]])
  })

  it('🔴 2 fundas + 1 templado excluido: −$4.497 sólo a las fundas, y el templado ⛔ cuenta para el escalón', () => {
    const { r, sub } = subtotal([funda(14990), funda(14990), funda(6990, { product_id: TEMPLADO })])
    expect(rebajas(r)).toEqual([2248.5, 2248.5, 0])
    expect(r.aplicadas).toEqual([{ id: 'bdi', nombre: BDI.nombre, pesos: 4497 }])
    expect(sub).toBe(14990 * 2 + 6990 - 4497)
  })

  it('lo que ⛔ es de la categoría ⛔ cuenta ni descuenta', () => {
    const { r } = subtotal([funda(14990), funda(14990), funda(9000, { categorias: ['CARGADORES'] })])
    expect(rebajas(r)).toEqual([2248.5, 2248.5, 0])
  })
})

describe('promo por cantidad — con las reglas que ya tenía la Caja', () => {
  it('🔴 la funda con descuento a mano sale como vino y ⛔ cuenta: 3 fundas, 1 a mano ⇒ las otras 2 al 15 %', () => {
    const mano = funda(14990, { rebaja: { tipo: 'pct', valor: 10 } })
    const r = aplicarPromos({ items: [funda(14990), funda(14990), mano], promos: [BDI], feriaIds: SIN_FERIA, hoy: HOY })
    expect(r.items[2]).toBe(mano)
    expect(rebajas(r)).toEqual([2248.5, 2248.5, 0])
  })

  it('🔴 la de feria ⛔ cuenta ni descuenta', () => {
    const f = funda(14990)
    const r = aplicarPromos({ items: [f, funda(14990), funda(14990)], promos: [BDI], feriaIds: new Set([f.product_id]), hoy: HOY })
    expect(rebajas(r)).toEqual([0, 2248.5, 2248.5])
  })

  it('una promo por prenda, la mejor: con 2 fundas «2ª al 30 %» empata (−$4.497) y con 3 gana la escalera', () => {
    const segunda = { ...BDI, id: 's', nombre: '2ª al 30', tipo: 'segunda_unidad' as const, pct: 30, escalones: undefined }
    const tres = aplicarPromos({ items: [funda(14990), funda(14990), funda(14990)], promos: [segunda, BDI], feriaIds: SIN_FERIA, hoy: HOY })
    expect(tres.aplicadas.map((a) => a.id)).toEqual(['bdi'])
    expect(tres.aplicadas[0].pesos).toBe(11242.5)
  })

  it('🔑 se suma al % de la forma de pago: 2 fundas en efectivo (−15 %, redondeo a $100)', () => {
    const r = aplicarPromos({ items: [funda(14990), funda(14990)], promos: [BDI], feriaIds: SIN_FERIA, hoy: HOY })
    const c = cobro({ filas: renglones(r.items), pagos: [{ cuenta: 12921 }], reglas: REGLAS_INICIALES, descuentoVenta: null })
    expect(c.subtotal).toBe(25483)
    // 25.483 × 0,85 = 21.660,55 → a $100: 21.700
    expect(c.total).toBe(21700)
  })

  it('fuera de fecha ⛔ aplica (el 15 y el 27-nov)', () => {
    for (const hoy of ['2026-11-15', '2026-11-27']) {
      expect(aplicarPromos({ items: [funda(14990), funda(14990)], promos: [BDI], feriaIds: SIN_FERIA, hoy }).aplicadas).toEqual([])
    }
  })
})

describe('pctPorCantidad', () => {
  it('el escalón más alto alcanzado, ⛔ la suma', () => {
    expect([0, 1, 2, 3, 4, 9].map((k) => pctPorCantidad(BDI.escalones, k))).toEqual([0, 0, 15, 25, 30, 30])
  })
})

describe('normalizarPromos — por cantidad y excluidos', () => {
  const crudo = { id: 'x', nombre: 'Escalera', tipo: 'cantidad', desde: '2026-11-16', alcance: { tipo: 'categorias', categorias: ['fundas'], excluidos: [{ id: '302', nombre: 'T' }, { id: 302 }] } }

  it('ordena los escalones y limpia los excluidos', () => {
    const [p] = normalizarPromos([{ ...crudo, escalones: [{ desde: 4, pct: 30 }, { desde: '2', pct: '15' }, { desde: 3, pct: 25 }] }])
    expect(p.escalones).toEqual(BDI.escalones)
    expect(p.alcance).toEqual({ tipo: 'categorias', categorias: ['FUNDAS'], excluidos: [{ id: 302, nombre: 'T' }] })
  })

  it('sin excluidos ⛔ guarda la clave (las promos viejas quedan iguales)', () => {
    const [p] = normalizarPromos([{ id: 'y', nombre: 'P', tipo: 'pct', pct: 10, desde: '2026-10-01', alcance: { tipo: 'todo' } }])
    expect(p.alcance).toEqual({ tipo: 'todo' })
  })

  it('los excluidos también restan de «todo el local»', () => {
    const [p] = normalizarPromos([{ id: 'y', nombre: 'P', tipo: 'pct', pct: 10, desde: '2026-10-01', alcance: { tipo: 'todo', excluidos: [{ id: 5, nombre: 'Gift' }] } }])
    const r = aplicarPromos({ items: [{ product_id: 5, size_id: 1, cantidad: 1, precio: 1000 }, { product_id: 6, size_id: 1, cantidad: 1, precio: 1000 }], promos: [p], feriaIds: SIN_FERIA, hoy: '2026-10-02' })
    expect(rebajas(r)).toEqual([0, 100])
  })

  it.each([
    [undefined, /al menos un escalón/],
    [[], /al menos un escalón/],
    [[{ desde: 1, pct: 10 }], /2 unidades o más/],
    [[{ desde: 2, pct: 0 }], /1 a 100/],
    [[{ desde: 2, pct: 10 }, { desde: 2, pct: 20 }], /misma cantidad/],
    [[{ desde: 2, pct: 20 }, { desde: 3, pct: 10 }], /tiene que ser mayor/],
  ])('rechaza escalones %o', (escalones, msg) => {
    expect(() => normalizarPromos([{ ...crudo, escalones }])).toThrow(msg)
  })
})
