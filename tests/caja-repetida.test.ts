import { describe, it, expect } from 'vitest'
import { exigirDevolucion, limpiarRepetida, registrarRespuesta, repetida } from '@/lib/caja/repetida.core.js'

/**
 * La prenda repetida (Bruno, 14-oct-2026): en GN se escaneó dos veces la prenda devuelta y se descontó de
 * más. La venta PREGUNTA; el cambio con ticket BLOQUEA lo que esa venta ⛔ vendió.
 */

describe('repetida (venta)', () => {
  it('la primera ⛔ pregunta', () => {
    expect(repetida({ enPedido: 0, local: 3 })).toBeNull()
  })
  it('la segunda pregunta, y avisa si el local ⛔ tiene otra', () => {
    expect(repetida({ enPedido: 1, local: 3 })).toEqual({ enPedido: 1, quedaria: 2, superaStock: false })
    expect(repetida({ enPedido: 1, local: 1 })).toEqual({ enPedido: 1, quedaria: 2, superaStock: true })
  })
  it('sin stock leído ⛔ afirma que lo supera', () => {
    expect(repetida({ enPedido: 2, local: null })?.superaStock).toBe(false)
  })
})

describe('registrarRespuesta y limpiarRepetida', () => {
  const t = new Date('2026-10-14T18:00:00.000Z')
  it('cuenta los sí y los no, con la hora', () => {
    const r = registrarRespuesta(registrarRespuesta(null, 'no', t), 'si', t)
    expect(r).toEqual({ si: 1, no: 1, en: ['no@2026-10-14T18:00:00.000Z', 'si@2026-10-14T18:00:00.000Z'] })
    expect(limpiarRepetida(r)).toEqual(r)
  })
  it('el servidor ⛔ guarda texto libre ni un registro vacío', () => {
    expect(limpiarRepetida({ si: 1, no: 0, en: ['<script>', 'si@2026-10-14T18:00:00.000Z'] })).toEqual({ si: 1, no: 0, en: ['si@2026-10-14T18:00:00.000Z'] })
    expect(limpiarRepetida({ si: 0, no: 0, en: [] })).toBeNull()
    expect(limpiarRepetida('hola')).toBeNull()
  })
})

describe('exigirDevolucion (cambio con ticket)', () => {
  const jean = { product_id: 10, size_id: 3, cantidad: 1, nombre: 'Jean Mom', talle: '38' }
  const top = { product_id: 11, size_id: 2, cantidad: 2, nombre: 'Top Lino', talle: 'M' }

  it('deja devolver lo que la venta vendió', () => {
    expect(() => exigirDevolucion({ vendidas: [jean, top], devuelve: [jean, { ...top, cantidad: 2 }] })).not.toThrow()
  })
  it('BLOQUEA la prenda devuelta escaneada dos veces (el caso del 14-oct)', () => {
    expect(() => exigirDevolucion({ vendidas: [jean], devuelve: [jean, jean] })).toThrow(/Jean Mom talle 38: la venta tiene 1 y se están devolviendo 2/)
  })
  it('BLOQUEA lo que ya se devolvió en un cambio anterior', () => {
    expect(() => exigirDevolucion({ vendidas: [top], yaDevueltas: [{ ...top, cantidad: 2 }], devuelve: [{ ...top, cantidad: 1 }] })).toThrow(/ya se devolvieron 2/)
  })
  it('BLOQUEA una prenda que esa venta ⛔ vendió', () => {
    expect(() => exigirDevolucion({ vendidas: [top], devuelve: [jean] })).toThrow(/no está en esa venta/)
  })
})
