import { describe, expect, it } from 'vitest'
import { aplicarPromos, normalizarPromos } from '@/lib/caja/promos.core.js'
import { combosDeHoy } from '@/lib/caja/totem'
import type { Reglas } from '@/lib/caja/cliente'

/**
 * Caja · la promo «$ fijo llevando otro producto» (`llevando_precio`), Bruno 26-nov-2026: el combo de la colección de bikinis
 * 2027 —«short de baño $44.990 solo → $34.990 con CUALQUIER bikini»—, que en Tienda Nube cobra Resorty (`combos.mts`) y en la
 * Caja ⛔ existía. Oráculo a mano:
 * - bikini $49.990 + short $44.990 ⇒ short −$10.000 ⇒ $84.980
 * - short solo ⇒ $44.990 · 1 bikini + 2 shorts ⇒ uno solo a $34.990 (el más caro)
 * - en BF el short está a $38.290 (campaña) ⇒ con una bikini sigue a $34.990 (−$3.300): el precio es FIJO, ⛔ un %
 * - un short que ya vale menos que $34.990 ⛔ se toca (⛔ se sube)
 * La bikini va como en la Caja: sus dos partes con la marca de conjunto (cuenta 1).
 */
const HOY = '2026-11-26'
const SIN_FERIA = new Set<number>()
const CORPINO = 1000000074, BOMBACHA = 1000000070, SHORT = 1000000222
const bikini = (n = 1) => [
  { product_id: CORPINO, size_id: 1, cantidad: n, precio: 21917.24, conjunto: { variant_id: 77, n: 1 } },
  { product_id: BOMBACHA, size_id: 2, cantidad: n, precio: 28072.76, conjunto: { variant_id: 77, n: 2 } },
]
const short = (precio = 44990, cantidad = 1) => ({ product_id: SHORT, size_id: 3, cantidad, precio })
const COMBO = normalizarPromos([{
  id: 'combo', nombre: 'Short con bikini', tipo: 'llevando_precio', precio: 34990, desde: '2026-11-25', hasta: null,
  alcance: { tipo: 'productos', productos: [{ id: SHORT, nombre: 'SHORT MADDIE VICHY' }] },
  requiere: { tipo: 'productos', productos: [{ id: CORPINO, nombre: 'CORPIÑO MADDIE SKY' }] },
}])
const ahorro = (items: object[]) => aplicarPromos({ items: items as never, promos: COMBO, feriaIds: SIN_FERIA, hoy: HOY })

describe('promo «$ fijo llevando otro producto» (26-nov)', () => {
  it('🔑 bikini + short ⇒ el short a $34.990', () => {
    const r = ahorro([...bikini(), short()])
    expect(r.items[2]).toMatchObject({ rebaja: { tipo: 'pesos', valor: 10000 }, promos: ['Short con bikini'] })
    expect(r.items[0].rebaja).toBeUndefined()
  })

  it('short solo ⇒ sin promo', () => {
    expect(ahorro([short()]).items[0].rebaja).toBeUndefined()
  })

  it('1 bikini + 2 shorts ⇒ uno solo a $34.990', () => {
    expect(ahorro([...bikini(), short(44990, 2)]).items[2]).toMatchObject({ rebaja: { valor: 10000 } })
  })

  it('🖤 en BF (short a $38.290) sigue a $34.990: es un precio, ⛔ un %', () => {
    expect(ahorro([...bikini(), short(38290)]).items[2]).toMatchObject({ rebaja: { valor: 3300 } })
  })

  it('un short que ya vale menos ⛔ se sube', () => {
    expect(ahorro([...bikini(), short(30000)]).items[2].rebaja).toBeUndefined()
  })

  it('se valida: sin precio o sin qué llevar ⛔ se guarda', () => {
    const base = { id: 'x', nombre: 'Combo', tipo: 'llevando_precio', desde: HOY, alcance: { tipo: 'todo' } }
    expect(() => normalizarPromos([{ ...base, requiere: { tipo: 'todo' } }])).toThrow(/precio/)
    expect(() => normalizarPromos([{ ...base, precio: 34990 }])).toThrow(/llevar/)
  })
})

describe('el combo en el tótem', () => {
  const reglas = { promos: COMBO } as unknown as Reglas
  const kits = [{ variant_id: 77, nombre: 'Bikini MADDIE · Sky', precio: 49990, piezas: bikini().map((p, i) => ({ ...p, n: i + 1, cantidad: 1 })) }]
  it('la bikini ⇒ «Sumale el short a $34.990»; el short ⇒ «Con una bikini: $34.990»', () => {
    expect(combosDeHoy(reglas, HOY, [CORPINO, BOMBACHA], [], kits as never)).toEqual([{ texto: 'Sumale el short a {PRECIO}', precio: 34990 }])
    expect(combosDeHoy(reglas, HOY, [SHORT], [], kits as never)).toEqual([{ texto: 'Con una bikini: {PRECIO}', precio: 34990 }])
    expect(combosDeHoy(reglas, HOY, [5], [], kits as never)).toEqual([])
    expect(combosDeHoy(reglas, '2026-11-24', [SHORT], [], kits as never)).toEqual([])
  })
})
