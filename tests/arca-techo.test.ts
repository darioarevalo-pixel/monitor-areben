/**
 * El techo de facturación (lo cobrado en cuentas Areben en el mes). La regla es la del dashboard;
 * contra GN real dio sep-2026 = $29.903.066,32, igual al centavo que el cierre del dashboard (12-oct).
 */
import { describe, it, expect } from 'vitest'
import { cobrosDeVentaGN, techoDelMes, ventaCuenta } from '../lib/arca/techo.core.js'

const TIPOS = new Map([['Mercado Pago', 'areben'], ['Transferencia', 'propia'], ['Efectivo', 'efectivo']])
const c = (fecha: string, cuenta: string, monto: number, marca = 'zattia') => ({ marca, fecha, cuenta, monto })

describe('techoDelMes', () => {
  it('suma sólo los cobros de cuentas Areben, por la fecha del COBRO', () => {
    const t = techoDelMes([c('2026-09-30', 'Mercado Pago', 100), c('2026-10-01', 'Mercado Pago', 50), c('2026-10-02', 'Transferencia', 70)], TIPOS, '2026-10')
    expect(t.total).toBe(50)
  })
  it('una venta cobrada en dos cuentas aporta sólo la parte de Areben', () => {
    const t = techoDelMes([c('2026-10-05', 'Mercado Pago', 30), c('2026-10-05', 'Efectivo', 70)], TIPOS, '2026-10')
    expect(t.total).toBe(30)
  })
  it('suma en centavos (sin el 0,1 + 0,2)', () => {
    const t = techoDelMes([c('2026-10-01', 'Mercado Pago', 0.1), c('2026-10-01', 'Mercado Pago', 0.2)], TIPOS, '2026-10')
    expect(t.total).toBe(0.3)
  })
  it('una cuenta sin clasificar ⛔ suma, pero se nombra', () => {
    const t = techoDelMes([c('2026-10-01', 'Feria - Transferencia', 999), c('2026-10-01', '', -30)], TIPOS, '2026-10')
    expect(t.total).toBe(0)
    expect(t.sinClasificar).toEqual([
      { cuenta: 'Feria - Transferencia', monto: 999, n: 1 },
      { cuenta: '(cobro sin cuenta)', monto: -30, n: 1 },
    ])
  })
  it('separa por marca y cuenta', () => {
    const t = techoDelMes([c('2026-10-01', 'Mercado Pago', 10, 'bdi'), c('2026-10-01', 'Mercado Pago', 5)], TIPOS, '2026-10')
    expect(t.porCuenta).toEqual([{ marca: 'bdi', cuenta: 'Mercado Pago', monto: 10, n: 1 }, { marca: 'zattia', cuenta: 'Mercado Pago', monto: 5, n: 1 }])
  })
  it('sin ninguna cuenta Areben clasificada no hay techo: error, ⛔ cero', () => {
    expect(() => techoDelMes([], new Map([['X', 'propia']]), '2026-10')).toThrow(/Areben/)
  })
})

describe('cobrosDeVentaGN', () => {
  const v = { id: 7, active: true, payments: [{ date_payment: '2026-10-01', account_name: 'Mercado Pago', amount: '1500.50' }] }
  it('saca los cobros con su fecha y cuenta', () => {
    expect(cobrosDeVentaGN(v, 'bdi')).toEqual([{ marca: 'bdi', venta_id: 7, fecha: '2026-10-01', cuenta: 'Mercado Pago', monto: 1500.5 }])
  })
  it('anuladas, archivadas y presupuestos no cobran', () => {
    expect(cobrosDeVentaGN({ ...v, active: false }, 'bdi')).toEqual([])
    expect(cobrosDeVentaGN({ ...v, archived: true }, 'bdi')).toEqual([])
    expect(cobrosDeVentaGN({ ...v, budget: true }, 'bdi')).toEqual([])
    expect(ventaCuenta(null)).toBe(false)
  })
})

describe('filasDeCobros (lo que el sync guarda en ventas_cobros)', async () => {
  const { filasDeCobros } = await import('../scripts/lib/ventas-espejo.mjs')
  it('una fila por cobro, numerada dentro de la venta, con el día del cobro', () => {
    const raw = [{ id: 1, active: true, payments: [
      { date_payment: '2026-09-30 18:20:00', account_name: 'Mercado Pago', amount: '100' },
      { date_payment: '2026-10-01 09:00:00', account_name: 'Efectivo', amount: 50 },
    ] }]
    expect(filasDeCobros(raw)).toEqual([
      { venta_id: 1, n: 0, fecha: '2026-09-30', cuenta: 'Mercado Pago', monto: 100 },
      { venta_id: 1, n: 1, fecha: '2026-10-01', cuenta: 'Efectivo', monto: 50 },
    ])
  })
  it('una venta que no trajo payments ⛔ genera filas (ni se le borran)', () => {
    expect(filasDeCobros([{ id: 2, active: true }])).toEqual([])
  })
  it('una archivada trajo payments pero ⛔ cobra', () => {
    expect(filasDeCobros([{ id: 3, archived: true, payments: [{ date_payment: '2026-10-01', account_name: 'X', amount: 1 }] }])).toEqual([])
  })
})
