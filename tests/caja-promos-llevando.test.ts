import { describe, expect, it } from 'vitest'
import { aplicarPromos, normalizarPromos } from '@/lib/caja/promos.core.js'
import { REGLAS_INICIALES, cobro, renglones } from '@/lib/caja/core.core.js'

/**
 * Caja · la promo «% llevando otro producto», Bruno 10-nov-2026: «llevando una funda 15 % de
 * descuento en el templado, esa es la oferta vigente, que la hacen manual».
 *
 * 🔑 El oráculo se escribió A MANO antes del código (`~/Documents/cyber-2026/mensaje-sesion-caja-templado.md`):
 * - 1 funda $14.990 + templado 9D PREMIUM $8.990 ⇒ −$1.348,50 ⇒ $22.631,50
 * - 3 fundas + 1 templado ⇒ escalera −$11.242,50 + templado −$1.348,50 ⇒ $41.369 (el mensaje decía
 *   $42.389: error de suma; 44.970 + 8.990 − 12.591 = 41.369, y los dos descuentos coinciden)
 * - templado solo ⇒ $8.990 · 1 funda + 2 templados ⇒ un solo descuento (el más caro)
 *
 * La escalera es la que está CARGADA en BDI (`bdi-escalera-nov26`, leída de prod el 10-nov), y los
 * ids son los de la Caja.
 */
const HOY = '2026-11-12'
const SIN_FERIA = new Set<number>()
const T9D_PREMIUM = 679953
const EXCLUIDOS = [
  { id: 679953, nombre: 'TEMPLADO 9D PREMIUM' },
  { id: 1010589, nombre: 'VIDRIO TEMPLADO PREMIUM CON COLOCADOR' },
  { id: 237791, nombre: 'TEMPLADO CAMARA COMPLETO' },
  { id: 1010444, nombre: 'PROTECTOR CAMARA BRILLO' },
]
const ESCALERA = {
  id: 'bdi-escalera-nov26',
  nombre: 'Fundas: más llevás, más ahorrás',
  tipo: 'cantidad' as const,
  escalones: [
    { desde: 2, pct: 15 },
    { desde: 3, pct: 25 },
    { desde: 4, pct: 30 },
  ],
  alcance: { tipo: 'categorias' as const, categorias: ['FUNDAS'], excluidos: EXCLUIDOS },
  desde: '2026-11-10',
  hasta: '2026-11-26',
  activa: true,
}
const TEMPLADO = {
  id: 'bdi-templado',
  nombre: 'Templado 15 % llevando funda',
  tipo: 'llevando' as const,
  pct: 15,
  alcance: { tipo: 'categorias' as const, categorias: ['VIDRIOS TEMPLADOS'] },
  requiere: { tipo: 'categorias' as const, categorias: ['FUNDAS'], excluidos: EXCLUIDOS },
  desde: '2026-11-10',
  hasta: null,
  activa: true,
}
const PROMOS = [ESCALERA, TEMPLADO]

let n = 0
type Item = { product_id: number; size_id: number; cantidad: number; precio: number; categorias: string[]; rebaja?: { tipo: 'pct' | 'pesos'; valor: number } | null }
const funda = (precio = 14990, extra: Partial<Item> = {}): Item => ({ product_id: 100 + ++n, size_id: 1, cantidad: 1, precio, categorias: ['FUNDAS', 'iPhone 15'], ...extra })
// Como en TN: el templado vive TAMBIÉN en FUNDAS.
const templado = (precio = 8990, extra: Partial<Item> = {}): Item => ({ product_id: T9D_PREMIUM, size_id: ++n, cantidad: 1, precio, categorias: ['FUNDAS', 'ACCESORIOS', 'VIDRIOS TEMPLADOS'], ...extra })

const correr = (items: Item[], promos: unknown[] = PROMOS, feriaIds = SIN_FERIA) => {
  const r = aplicarPromos({ items, promos: normalizarPromos(promos), feriaIds, hoy: HOY })
  return { r, sub: cobro({ filas: renglones(r.items), pagos: [{ cuenta: 12921 }], reglas: REGLAS_INICIALES, descuentoVenta: null }).subtotal }
}
const rebajas = (r: ReturnType<typeof aplicarPromos>) => r.items.map((it) => (it.rebaja && it.rebaja.tipo === 'pesos' ? it.rebaja.valor : 0))

describe('llevando una funda, 15 % en el templado — el oráculo', () => {
  it('🔑 1 funda + templado 9D PREMIUM ⇒ −$1.348,50 ⇒ $22.631,50', () => {
    const { r, sub } = correr([funda(), templado()])
    expect(rebajas(r)).toEqual([0, 1348.5])
    expect(sub).toBe(22631.5)
    expect(r.aplicadas).toEqual([{ id: 'bdi-templado', nombre: TEMPLADO.nombre, pesos: 1348.5 }])
  })

  it('🔴 3 fundas + 1 templado ⇒ escalera −$11.242,50 + templado −$1.348,50 ⇒ $41.369 (la escalera ⛔ se gasta las fundas)', () => {
    const { r, sub } = correr([funda(), funda(), funda(), templado()])
    expect(rebajas(r)).toEqual([3747.5, 3747.5, 3747.5, 1348.5])
    expect(sub).toBe(41369)
  })

  it('templado solo, sin funda ⇒ $8.990', () => {
    expect(correr([templado()]).sub).toBe(8990)
  })

  it('🔑 1 funda + 2 templados ⇒ un solo descuento, el del más caro', () => {
    const { r } = correr([funda(), templado(6990), templado(8990)])
    expect(rebajas(r)).toEqual([0, 0, 1348.5])
  })

  it('2 fundas + 2 templados en UN renglón de cantidad 2 ⇒ los dos con 15 % (y la escalera en las fundas)', () => {
    const { r } = correr([funda(), funda(), templado(8990, { cantidad: 2 })])
    expect(rebajas(r)).toEqual([2248.5, 2248.5, 2697])
  })

  it('una funda de cantidad 2 habilita dos templados', () => {
    const { r } = correr([funda(14990, { cantidad: 2 }), templado(), templado()])
    expect(rebajas(r).slice(1)).toEqual([1348.5, 1348.5])
  })
})

describe('llevando — quién habilita', () => {
  it('🔴 un templado ⛔ se habilita a sí mismo aunque esté en FUNDAS y ⛔ en los excluidos (TEMPLADO 9D, despublicado)', () => {
    const t9d = templado(7990, { product_id: 555 })
    expect(rebajas(correr([t9d]).r)).toEqual([0])
    expect(rebajas(correr([t9d, templado()]).r)).toEqual([0, 0])
  })

  it('un protector excluido (PROTECTOR CAMARA BRILLO) ⛔ habilita', () => {
    const protector = funda(5990, { product_id: 1010444 })
    expect(rebajas(correr([protector, templado()]).r)).toEqual([0, 0])
  })

  it('🔴 la funda de oferta y la de descuento a mano SÍ habilitan', () => {
    const deOferta = funda()
    expect(rebajas(correr([deOferta, templado()], PROMOS, new Set([deOferta.product_id])).r)).toEqual([0, 1348.5])
    expect(rebajas(correr([funda(14990, { rebaja: { tipo: 'pct', valor: 10 } }), templado()]).r)).toEqual([0, 1348.5])
  })

  it('el templado con descuento a mano o de oferta ⛔ lleva la promo', () => {
    const mano = templado(8990, { rebaja: { tipo: 'pct', valor: 5 } })
    expect(correr([funda(), mano]).r.items[1]).toBe(mano)
    expect(rebajas(correr([funda(), templado()], PROMOS, new Set([T9D_PREMIUM])).r)).toEqual([0, 0])
  })

  it('fuera de fecha ⛔ aplica', () => {
    const r = aplicarPromos({ items: [funda(), templado()], promos: normalizarPromos([{ ...TEMPLADO, desde: '2026-11-13' }]), feriaIds: SIN_FERIA, hoy: HOY })
    expect(r.aplicadas).toEqual([])
  })

  it('🔑 se suma al % de la forma de pago: funda + templado en efectivo (−15 %, a $100)', () => {
    const r = aplicarPromos({ items: [funda(), templado()], promos: normalizarPromos(PROMOS), feriaIds: SIN_FERIA, hoy: HOY })
    const c = cobro({ filas: renglones(r.items), pagos: [{ cuenta: 12921 }], reglas: REGLAS_INICIALES, descuentoVenta: null })
    // 22.631,50 × 0,85 = 19.236,775 → a $100: 19.200
    expect(c.subtotal).toBe(22631.5)
    expect(c.total).toBe(19200)
  })
})

describe('normalizarPromos — llevando', () => {
  const crudo = { id: 't', nombre: 'Templado', tipo: 'llevando', pct: '15', desde: '2026-11-10', alcance: { tipo: 'categorias', categorias: ['vidrios templados'] }, requiere: { tipo: 'categorias', categorias: ['fundas'], excluidos: [{ id: '679953', nombre: 'T' }] } }

  it('guarda el % y el «requiere» limpio', () => {
    const [p] = normalizarPromos([crudo])
    expect(p.pct).toBe(15)
    expect(p.requiere).toEqual({ tipo: 'categorias', categorias: ['FUNDAS'], excluidos: [{ id: 679953, nombre: 'T' }] })
  })

  it.each([
    [{ requiere: undefined }, /qué productos hay que llevar/],
    [{ requiere: { tipo: 'categorias', categorias: [] } }, /al menos una categoría/],
    [{ pct: 0 }, /1 a 100/],
  ])('rechaza %o', (cambio, msg) => {
    expect(() => normalizarPromos([{ ...crudo, ...cambio }])).toThrow(msg)
  })

  it('las otras promos ⛔ guardan «requiere»', () => {
    const [p] = normalizarPromos([{ id: 'y', nombre: 'P', tipo: 'pct', pct: 10, desde: '2026-10-01', alcance: { tipo: 'todo' }, requiere: { tipo: 'todo' } }])
    expect(p.requiere).toBeUndefined()
  })
})
