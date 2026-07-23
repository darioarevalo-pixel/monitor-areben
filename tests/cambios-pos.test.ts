import { describe, expect, it } from 'vitest'
import { calcularTotalCambio, detalleCambioTexto, faltantesParaVenta, numeroReclamo, type CambioItem } from '@/lib/cambios/tipos'

const item = (precio: number, cantidad = 1, extra: Partial<CambioItem> = {}): CambioItem => ({ producto: 'x', precio, cantidad, ...extra })

describe('numeroReclamo', () => {
  it('correlativo con padding a 4', () => {
    expect(numeroReclamo(45)).toBe('C-0045')
    expect(numeroReclamo(472)).toBe('C-0472')
    expect(numeroReclamo(12345)).toBe('C-12345')
  })
  it('sin id → "nuevo"', () => {
    expect(numeroReclamo(null)).toBe('nuevo')
    expect(numeroReclamo(undefined)).toBe('nuevo')
  })
})

describe('calcularTotalCambio con descuento manual', () => {
  it('descuento manual en $ reduce el subtotal', () => {
    const t = calcularTotalCambio({ devueltos: [item(1000)], nuevos: [item(2000)], descuentoManual: 200 })
    expect(t.diferencia).toBe(1000)
    expect(t.descuentoManual).toBe(200)
    expect(t.descuento).toBe(200)
    expect(t.total).toBe(800)
  })
  it('la forma de pago aplica sobre lo que queda tras el descuento manual', () => {
    const t = calcularTotalCambio({ devueltos: [item(1000)], nuevos: [item(2000)], forma: 'transferencia', descuentoManual: 200 })
    // base tras manual = 800; 10% de 800 = 80; descuento total = 280
    expect(t.descuentoForma).toBe(80)
    expect(t.descuento).toBe(280)
    expect(t.total).toBe(720)
  })
  it('descuento manual se topea al subtotal (no lo pasa a negativo)', () => {
    const t = calcularTotalCambio({ devueltos: [item(1000)], nuevos: [item(1500)], descuentoManual: 9999 })
    expect(t.descuentoManual).toBe(500) // topeado a la diferencia
    expect(t.total).toBe(0)
  })
  it('sin subtotal a cobrar, no aplica descuento manual', () => {
    const t = calcularTotalCambio({ devueltos: [item(2000)], nuevos: [item(1000)], descuentoManual: 300 })
    expect(t.descuentoManual).toBe(0)
    expect(t.total).toBe(-1000)
  })
})

describe('faltantesParaVenta', () => {
  const completo = {
    cliente: 'Juan', orden_tn: '1234',
    items_devueltos: [item(1000)], items_nuevos: [item(2000, 1, { product_id: 'p1', size_id: 's1' })],
    forma_pago: 'transferencia' as const, via: 'andreani' as const, envio_paga: 'cliente' as const,
  }
  it('completo → sin faltantes', () => {
    expect(faltantesParaVenta(completo)).toEqual([])
  })
  it('sin producto que se lleva linkeado a GN → falta', () => {
    const f = faltantesParaVenta({ ...completo, items_nuevos: [item(2000)] })
    expect(f).toContain('producto que se lleva (de GN)')
  })
  it('sin forma de pago → falta', () => {
    expect(faltantesParaVenta({ ...completo, forma_pago: null })).toContain('forma de pago')
  })
  it('sin devuelto → falta', () => {
    expect(faltantesParaVenta({ ...completo, items_devueltos: [] })).toContain('producto que devuelve')
  })
})

describe('detalleCambioTexto', () => {
  it('arma el texto para el cliente con total', () => {
    const txt = detalleCambioTexto({
      id: 45, cliente: 'Juan',
      items_devueltos: [item(19990, 1, { producto: 'Jean Torino' })],
      items_nuevos: [item(19990, 2, { producto: 'Falda Honey' })],
      forma_pago: 'transferencia', via: 'andreani', envio_costo: 2500, envio_paga: 'cliente',
    })
    expect(txt).toContain('*CAMBIO C-0045*')
    expect(txt).toContain('Devolvés: 1× Jean Torino')
    expect(txt).toContain('Te llevás: 2× Falda Honey')
    expect(txt).toContain('Forma de pago: Transferencia (−10%)')
    expect(txt).toMatch(/\*Total a pagar:/)
  })
})
