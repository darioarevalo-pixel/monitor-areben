/**
 * La facturación del mes: lo facturado (GN + monitor, las NC restan), lo pendiente y qué ventas se
 * pueden facturar. Lo que no se ve si falla: facturar dos veces una venta que GN ya facturó.
 */
import { describe, it, expect } from 'vitest'
import { claveVenta, proponerLote, resumenDelMes, ventasParaFacturar } from '../lib/arca/mes.core.js'
import { CBTE } from '../lib/arca/arca.core.js'

const TIPOS = new Map([['Mercado Pago', 'areben'], ['Pago Nube', 'areben'], ['Transferencia', 'propia']])
const c = (venta_id: number, fecha: string, cuenta: string, monto: number, marca = 'zattia') => ({ marca, venta_id, fecha, cuenta, monto })

describe('resumenDelMes', () => {
  it('lo facturado es GN + monitor; las notas de crédito y lo no autorizado no suman', () => {
    const r = resumenDelMes({
      techo: 1000,
      facturasGN: [{ marca: 'bdi', venta_id: 1, monto: 300 }],
      facturasMonitor: [
        { marca: 'zattia', venta_id: '2', tipo: CBTE.FACTURA_B, total: 200, estado: 'autorizada' },
        { marca: 'zattia', venta_id: '2', tipo: CBTE.NC_B, total: 50, estado: 'autorizada' },
        { marca: 'zattia', venta_id: '3', tipo: CBTE.FACTURA_B, total: 999, estado: 'rechazada' },
        { marca: 'zattia', venta_id: '4', tipo: CBTE.FACTURA_B, total: 999, estado: 'reservada' },
      ],
    })
    expect(r).toEqual({ techo: 1000, facturadoGN: 300, facturadoMonitor: 150, facturado: 450, pendiente: 550 })
  })
  it('facturado de más da pendiente negativo, ⛔ cero', () => {
    expect(resumenDelMes({ techo: 100, facturasGN: [{ marca: 'bdi', venta_id: 1, monto: 130 }], facturasMonitor: [] }).pendiente).toBe(-30)
  })
})

describe('ventasParaFacturar', () => {
  it('suma lo cobrado en cuentas Areben de cada venta en el mes, ⛔ el total', () => {
    const v = ventasParaFacturar([
      c(1, '2026-10-02', 'Mercado Pago', 100), c(1, '2026-10-02', 'Transferencia', 900), c(1, '2026-10-05', 'Pago Nube', 50),
    ], TIPOS, '2026-10', new Set())
    expect(v).toEqual([{ marca: 'zattia', ventaId: '1', fecha: '2026-10-05', monto: 150, cuentas: ['Mercado Pago', 'Pago Nube'] }])
  })
  it('🔴 una venta que ya tiene factura (de GN o del monitor) ⛔ aparece', () => {
    const v = ventasParaFacturar([c(1, '2026-10-02', 'Mercado Pago', 100), c(2, '2026-10-02', 'Mercado Pago', 100, 'bdi')],
      TIPOS, '2026-10', new Set([claveVenta('zattia', 1)]))
    expect(v.map((x) => x.ventaId)).toEqual(['2'])
  })
  it('la misma venta_id en las dos marcas son dos ventas distintas', () => {
    const v = ventasParaFacturar([c(7, '2026-10-02', 'Mercado Pago', 1, 'bdi'), c(7, '2026-10-02', 'Mercado Pago', 2)], TIPOS, '2026-10', new Set())
    expect(v).toHaveLength(2)
  })
  it('cobros de otro mes y ventas que netean ≤ 0 no entran', () => {
    const v = ventasParaFacturar([c(1, '2026-09-30', 'Mercado Pago', 100), c(2, '2026-10-01', 'Mercado Pago', 100), c(2, '2026-10-03', 'Mercado Pago', -100)],
      TIPOS, '2026-10', new Set())
    expect(v).toEqual([])
  })
})

describe('proponerLote', () => {
  const v = (ventaId: string, monto: number) => ({ marca: 'zattia', ventaId, fecha: '2026-10-01', monto, cuentas: [] })
  it('las más viejas primero, sin pasarse del pendiente, y saltea la que no entra', () => {
    expect(proponerLote([v('1', 60), v('2', 50), v('3', 30)], 100).map((x) => x.ventaId)).toEqual(['1', '3'])
  })
  it('sin pendiente no propone nada', () => {
    expect(proponerLote([v('1', 1)], 0)).toEqual([])
    expect(proponerLote([v('1', 1)], -50)).toEqual([])
  })
})
