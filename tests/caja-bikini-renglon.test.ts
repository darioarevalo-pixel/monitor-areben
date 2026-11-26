import { describe, expect, it } from 'vitest'
import { gruposDelPedido, parteDe, rebajaDeBikini, rebajaEnPartes } from '@/lib/caja/conjuntos.core.js'
import { aplicarPromos } from '@/lib/caja/promos.core.js'
import { renglones, subtotal } from '@/lib/caja/core.core.js'

// La prueba del local del 26-nov (fotos de Bruno, sin cobrar): Bikini SERENA · Watermelon $49.990 = corpiño $22.319,16 + bombacha $27.670,84.
const NOMBRE = 'Bikini SERENA · Watermelon'
const parte = (vid: number, n: number, pid: number, sid: number, precio: number, cantidad = 1) =>
  ({ product_id: pid, size_id: sid, cantidad, precio, conjunto: { variant_id: vid, n, nombre: NOMBRE } })
const remera = { product_id: 300, size_id: 1, cantidad: 2, precio: 20000, conjunto: null }

describe('caja · la bikini en UN renglón en pantalla (Bruno 26-nov)', () => {
  it('junta las partes de cada bikini, con el precio de la bikini, en el orden en que entraron', () => {
    const carrito = [remera, parte(901, 2, 200, 2, 27670.84), parte(901, 1, 100, 1, 22319.16), parte(902, 1, 100, 2, 22319.16), parte(902, 2, 200, 1, 27670.84)]
    const g = gruposDelPedido(carrito)
    expect(g.map((x) => x.indices)).toEqual([[0], [2, 1], [3, 4]]) // corpiño primero
    expect(g[0].bikini).toBeNull()
    expect(g[1].bikini).toEqual({ variant_id: 901, nombre: NOMBRE, cantidad: 1, precio: 49990 })
    expect(g[2].bikini?.precio).toBe(49990)
    // «Pedido · 4 productos» con 2 bikinis ⛔: 2 remeras + 2 bikinis = 4; antes contaba 6.
    expect(g.reduce((s, x) => s + (x.bikini ? x.bikini.cantidad : carrito[x.indices[0]].cantidad), 0)).toBe(4)
  })

  it('con 2 unidades de la misma bikini, el precio sigue siendo el de UNA', () => {
    const g = gruposDelPedido([parte(901, 1, 100, 1, 22319.16, 2), parte(901, 2, 200, 2, 27670.84, 2)])
    expect(g[0].bikini).toMatchObject({ cantidad: 2, precio: 49990 })
  })

  it('la promo (2 → 10%) da el importe de la bikini entera, sin centavos sueltos de las partes', () => {
    const items = [parte(901, 1, 100, 1, 22319.16), parte(901, 2, 200, 2, 27670.84), parte(902, 1, 100, 2, 22319.16), parte(902, 2, 200, 1, 27670.84)]
    const promos = [{ id: 'p', nombre: 'Promo bikinis', tipo: 'cantidad' as const, activa: true, desde: '2026-11-25', hasta: '2026-11-26', alcance: { tipo: 'productos' as const, productos: [{ id: 100, nombre: 'CORPIÑO SERENA WATERMELON' }] }, escalones: [{ desde: 2, pct: 10 }, { desde: 3, pct: 15 }] }]
    const conPromo = aplicarPromos({ items, promos, feriaIds: new Set(), hoy: '2026-11-26' })
    const filas = renglones(conPromo.items as never)
    const g = gruposDelPedido(items)
    const importes = g.map(({ indices }) => Math.round(indices.reduce((t, j) => t + Math.round(filas[j].importe * 100), 0)) / 100)
    // Lo que se muestra por bikini suma lo mismo que el subtotal del núcleo (⛔ se pierde ni se inventa un centavo).
    expect(importes).toEqual([44991, 44991]) // 49.990 × 0,9, la de la foto
    expect(Math.round(importes.reduce((a, b) => a + b, 0) * 100) / 100).toBe(subtotal(filas))
  })

  it('el descuento a mano de la bikini se reparte en las partes y vuelve igual', () => {
    const partes = [parte(901, 1, 100, 1, 22319.16), parte(901, 2, 200, 2, 27670.84)]
    expect(rebajaEnPartes(null, partes)).toEqual([null, null])
    const pct = rebajaEnPartes({ tipo: 'pct', valor: 20 }, partes)
    expect(pct).toEqual([{ tipo: 'pct', valor: 20 }, { tipo: 'pct', valor: 20 }])
    expect(rebajaDeBikini(partes.map((p, i) => ({ ...p, rebaja: pct[i] })))).toEqual({ tipo: 'pct', valor: 20 })
    const pesos = rebajaEnPartes({ tipo: 'pesos', valor: 5000 }, partes)
    expect(pesos.reduce((s, r) => s + Math.round((r?.valor ?? 0) * 100), 0)).toBe(500000) // centavos exactos
    expect(pesos[0]?.valor).toBeCloseTo(2232.36, 2) // por lo que vale cada parte
    expect(rebajaDeBikini(partes.map((p, i) => ({ ...p, rebaja: pesos[i] })))).toEqual({ tipo: 'pesos', valor: 5000 })
    expect(rebajaDeBikini(partes.map((p) => ({ ...p, rebaja: null })))).toBeNull()
  })

  it('la parte se nombra por su primera palabra (para el talle «Corpiño S / Bombacha M»)', () => {
    expect(parteDe('CORPIÑO SERENA WATERMELON')).toBe('Corpiño')
    expect(parteDe(null)).toBe('')
  })
})
