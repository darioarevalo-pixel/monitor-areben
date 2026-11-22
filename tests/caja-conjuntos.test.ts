import { describe, expect, it } from 'vitest'
import { conjuntosConPieza, detalleDeConjuntos, exigirConjuntos, repartirDescuento } from '@/lib/caja/conjuntos.core.js'
import { aplicarPromos } from '@/lib/caja/promos.core.js'
import { renglones } from '@/lib/caja/core.core.js'
import { entradaDelMotor } from '@/lib/caja/motor.core.js'
import { lineasParaMostrar } from '@/motor/venta/conjuntos.mjs'
import { ticketDeVenta } from '@/lib/caja/ticket'

// Bikini MADDIE · Camo: corpiño (100) S=1/M=2, bombacha (200) S=1/M=2. $49.990 repartido 30.000 / 19.990.
const bikini = (vid: number, cs: number, bs: number) => ({
  variant_id: vid, nombre: 'Bikini MADDIE · Camo', precio: 49990,
  piezas: [
    { n: 1, product_id: 100, size_id: cs, cantidad: 1, precio: 30000, nombre: 'CORPIÑO MADDIE CAMO · S' },
    { n: 2, product_id: 200, size_id: bs, cantidad: 1, precio: 19990, nombre: 'BOMBACHA MADDIE CAMO · M' },
  ],
})
const catalogo = [bikini(901, 1, 1), bikini(902, 1, 2), bikini(903, 2, 1), bikini(904, 2, 2)]
const parte = (vid: number, n: number, pid: number, sid: number, precio: number, cantidad = 1) =>
  ({ product_id: pid, size_id: sid, cantidad, precio, conjunto: { variant_id: vid, n, nombre: 'Bikini MADDIE · Camo' } })
const remera = { product_id: 300, size_id: 1, cantidad: 1, precio: 20000 }

describe('caja · las bikinis (conjuntos, Bruno 21/22-nov)', () => {
  it('una parte escaneada ofrece las bikinis que la llevan', () => {
    expect(conjuntosConPieza(catalogo, 100, 1).map((c) => c.variant_id)).toEqual([901, 902])
    expect(conjuntosConPieza(catalogo, 300, 1)).toEqual([])
    expect(conjuntosConPieza(null, 100, 1)).toEqual([])
  })

  it('el servidor exige la bikini entera, a su precio, y ninguna parte suelta', () => {
    expect(() => exigirConjuntos([parte(902, 1, 100, 1, 30000), parte(902, 2, 200, 2, 19990), remera], catalogo)).not.toThrow()
    expect(() => exigirConjuntos([{ product_id: 100, size_id: 1, cantidad: 1, precio: 30000 }], catalogo)).toThrow(/se vende sólo con la otra parte/)
    expect(() => exigirConjuntos([parte(902, 1, 100, 1, 30000)], catalogo)).toThrow(/faltan partes/)
    expect(() => exigirConjuntos([parte(902, 1, 100, 1, 30000, 2), parte(902, 2, 200, 2, 19990)], catalogo)).toThrow(/faltan partes/)
    expect(() => exigirConjuntos([parte(902, 1, 100, 1, 1), parte(902, 2, 200, 2, 19990)], catalogo)).toThrow(/no se cambia/)
    expect(() => exigirConjuntos([parte(902, 1, 100, 2, 30000), parte(902, 2, 200, 2, 19990)], catalogo)).toThrow(/no es esa parte/)
    expect(() => exigirConjuntos([parte(999, 1, 100, 1, 30000)], catalogo)).toThrow(/ya no está en Tienda Nube/)
  })

  it('en las promos la bikini cuenta UNA (2x1: bikini + remera ⇒ gratis la remera, la más barata)', () => {
    const promos = [{ id: 'p', nombre: '2x1', tipo: 'nxm' as const, lleva: 2, paga: 1, alcance: { tipo: 'todo' as const }, desde: '2026-01-01', hasta: null, activa: true }]
    const items = [parte(902, 1, 100, 1, 30000), parte(902, 2, 200, 2, 19990), remera]
    const r = aplicarPromos({ items, promos, feriaIds: new Set(), hoy: '2026-11-25' })
    expect(r.items[0].rebaja).toBeUndefined()
    expect(r.items[1].rebaja ?? null).toBeNull()
    expect(r.items[2].rebaja).toEqual({ tipo: 'pesos', valor: 20000 })
    // Dos bikinis solas: una gratis, repartida entre sus partes (las dos partes de la más barata, que empatan ⇒ la segunda).
    const dos = aplicarPromos({ items: [parte(902, 1, 100, 1, 30000), parte(902, 2, 200, 2, 19990), parte(903, 1, 100, 2, 30000), parte(903, 2, 200, 1, 19990)], promos, feriaIds: new Set(), hoy: '2026-11-25' })
    expect(dos.items.map((x: any) => x.rebaja?.valor ?? 0)).toEqual([0, 0, 30000, 19990])
  })

  it('por cantidad: dos bikinis son 2 unidades, ⛔ 4', () => {
    const promos = [{ id: 'c', nombre: 'Escalera', tipo: 'cantidad' as const, escalones: [{ desde: 2, pct: 10 }, { desde: 4, pct: 30 }], alcance: { tipo: 'todo' as const }, desde: '2026-01-01', hasta: null, activa: true }]
    const r = aplicarPromos({ items: [parte(902, 1, 100, 1, 30000), parte(902, 2, 200, 2, 19990), parte(903, 1, 100, 2, 30000), parte(903, 2, 200, 1, 19990)], promos, feriaIds: new Set(), hoy: '2026-11-25' })
    expect(r.items.map((x: any) => x.rebaja.valor)).toEqual([3000, 1999, 3000, 1999])
  })

  it('el descuento repartido cierra al centavo', () => {
    const c = repartirDescuento(1001, [{ cantidad: 1, precio: 30000 }, { cantidad: 1, precio: 19990 }])
    expect(c.reduce((s, x) => s + x, 0)).toBe(1001)
  })

  it('la venta guardada lleva al motor qué renglones son cada bikini, y el ticket la junta en UNA línea', () => {
    const filas = renglones([parte(902, 1, 100, 1, 30000, 2), parte(902, 2, 200, 2, 19990, 2), remera])
    expect(filas[0].conjunto).toEqual({ variant_id: 902, n: 1, nombre: 'Bikini MADDIE · Camo' })
    expect(filas[2].conjunto).toBeUndefined()
    const e = entradaDelMotor({ id: 'x', store: 'zattia', renglones: filas, pagos: [], subtotal: 0, total: 0, creada_en: '2026-11-25' })
    expect(e.detalle.conjuntos).toEqual([{ variant_id: 902, nombre: 'Bikini MADDIE · Camo', cantidad: 2, piezas: [{ product_id: 100, size_id: 1, cantidad: 1 }, { product_id: 200, size_id: 2, cantidad: 1 }] }])
    const lineas = lineasParaMostrar(filas, detalleDeConjuntos(filas))
    expect(lineas.map((l: any) => [l.conjunto, l.cantidad, l.importe])).toEqual([[true, 2, 99980], [false, 1, 20000]])
  })
  it('el ticket de la venta: la bikini en UNA línea con el talle de cada parte', () => {
    const filas = renglones([parte(902, 1, 100, 1, 30000), parte(902, 2, 200, 2, 19990), remera]).map((f, i) => ({ ...f, nombre: ['CORPIÑO MADDIE CAMO', 'BOMBACHA MADDIE CAMO', 'REMERA'][i], talle: ['S', 'M', 'U'][i] }))
    const t = ticketDeVenta({ id: 'x', renglones: filas, subtotal: 69990, pagos: [], total: 69990, paga_con: null, email: null } as any, null, () => '')
    expect(t.renglones.map((r) => [r.nombre, r.talle, r.cantidad, r.precio, r.importe])).toEqual([
      ['Bikini MADDIE · Camo', 'Corpiño S / Bombacha M', 1, 49990, 49990],
      ['REMERA', 'U', 1, 20000, 20000],
    ])
  })
})
