import { describe, expect, it, vi } from 'vitest'
import { pideCuentaReal } from '@/lib/erp/cobro-destino.core.js'
import { cobrarCuentaErp, cobrarVentaErp } from '../api/_erp-ventas.js'

const R = '00000000-0000-0000-0000-00000000aaaa'
const C = '00000000-0000-0000-0000-0000000000c1'
const V = '00000000-0000-0000-0000-0000000000b1'
const abierta = { marca: 'bdi', canal: 'mayorista', medio: 'transferencia', cuenta_real_id: null, desde: '2026-11-08T03:00:00Z' }
const reales = [{ id: R, titular: 'areben', nombre: 'CC', banco: 'Galicia' }]
const transf = { medio: 'transferencia', nombre: 'Transferencia Mayorista' }

describe('¿Hay que preguntar a qué cuenta entró?', () => {
  const p = { cuenta: transf, rutas: [abierta], cuentasReales: reales, marca: 'bdi', canal: 'mayorista', fecha: '2026-11-16' }
  it('sí con la ruta abierta', () => expect(pideCuentaReal(p)).toBe(true))
  it('no si la ruta ya tiene cuenta (el motor lo rechazaría)', () => expect(pideCuentaReal({ ...p, rutas: [{ ...abierta, cuenta_real_id: R }] })).toBe(false))
  it('no antes de que la ruta exista', () => expect(pideCuentaReal({ ...p, fecha: '2026-11-07' })).toBe(false))
  it('no sin cuentas para elegir ni cuenta elegida', () => {
    expect(pideCuentaReal({ ...p, cuentasReales: [] })).toBe(false)
    expect(pideCuentaReal({ ...p, cuenta: null })).toBe(false)
  })
  it('Mercado Pago, que GN guarda como «otro», sale por el nombre', () => {
    expect(pideCuentaReal({ ...p, cuenta: { medio: 'otro', nombre: 'Mercado Pago 2' }, rutas: [{ ...abierta, medio: 'mp' }] })).toBe(true)
  })
})

describe('El servidor le pasa la cuenta elegida al motor', () => {
  const motor = () => ({ registrarPagoACuenta: vi.fn(async (_db: unknown, _e: Record<string, unknown>) => ({ ok: true, pago: {}, cuenta: {} })) })
  const base = { clienteId: C, linea: 'bdi', monto: 100, cuenta: '7', ref: 'abcdef12', prueba: false }
  it('cobrar a la cuenta', async () => {
    const m = motor()
    await cobrarCuentaErp({ marca: 'bdi', body: { ...base, cuentaReal: R }, usuario: 'x' }, { cuenta: m, db: {} })
    expect(m.registrarPagoACuenta.mock.calls[0][1]).toMatchObject({ cuenta_real: R, prueba: false })
  })
  it('cobrar una venta', async () => {
    const m = motor()
    await cobrarVentaErp({ marca: 'bdi', body: { ...base, ventaId: V, saldo: 100, cuentaReal: R }, usuario: 'x' }, { cuenta: m, db: {} })
    expect(m.registrarPagoACuenta.mock.calls[0][1]).toMatchObject({ cuenta_real: R })
  })
  it('sin elección no manda el campo', async () => {
    const m = motor()
    await cobrarCuentaErp({ marca: 'bdi', body: base, usuario: 'x' }, { cuenta: m, db: {} })
    expect(m.registrarPagoACuenta.mock.calls[0][1]).not.toHaveProperty('cuenta_real')
  })
  it('una cuenta inválida frena antes del motor', async () => {
    const m = motor()
    const r = await cobrarCuentaErp({ marca: 'bdi', body: { ...base, cuentaReal: 'x' }, usuario: 'x' }, { cuenta: m, db: {} })
    expect(r.status).toBe(400)
    expect(m.registrarPagoACuenta).not.toHaveBeenCalled()
  })
})
