import { describe, expect, it } from 'vitest'
import { armarCobro, armarContraentrega } from '../lib/erp/cobros.core.js'

/** **Desde cada cobro se abre su venta (Bruno, 9-nov).** El oráculo: la fila lleva el id real de la venta, y null cuando no hay venta. */
describe('el cobro sabe de qué venta es', () => {
  const base = { id: '1', origen: 'venta', en: '2026-11-09T12:00:00Z', fecha: '2026-11-09', clase: 'plata', monto: 100, linea: 'stunned' }
  it('un cobro de venta lleva su id', () => {
    expect(armarCobro({ ...base, venta: { id: 'v1', numero: 83, origen: 'caja' } }).ventaId).toBe('v1')
  })
  it('un pago a cuenta ⛔ inventa venta', () => {
    expect(armarCobro({ ...base, origen: 'pago_a_cuenta', venta: null }).ventaId).toBeNull()
  })
  it('una contraentrega lleva la venta', () => {
    expect(armarContraentrega({ venta_id: 'v2', en: '2026-11-09T12:00:00Z', monto: 10, numero: 9, origen: 'tn', linea: 'bdi' }).ventaId).toBe('v2')
  })
})
