// LA CAJA DEL EVENTO (29-oct): el puesto (local / evento) y de qué depósito del ERP sale la venta. Puro.
import { describe, expect, it } from 'vitest'
import { errorDelPuesto, faltaColumnaDeposito, puestoDe } from '../lib/caja/puesto.core.js'
import { entradaDelMotorErp } from '../lib/caja/motor.core.js'

describe('puesto de la caja', () => {
  it('sin nada es el local; el evento sólo en Zattia (Stunned); otro ⇒ null', () => {
    expect(puestoDe(undefined, 'zattia')).toBe('local')
    expect(puestoDe('', 'bdi')).toBe('local')
    expect(puestoDe('evento', 'zattia')).toBe('evento')
    expect(puestoDe('evento', 'bdi')).toBeNull()
    expect(puestoDe('feria', 'zattia')).toBeNull()
  })
  it('en la caja del evento sólo va el ticket del ERP (Stunned)', () => {
    expect(errorDelPuesto({ deposito: 'evento' }, 'erp')).toBeNull()
    expect(errorDelPuesto({ deposito: 'evento' }, 'gn')).toMatch(/Stunned/)
    expect(errorDelPuesto({ deposito: 'local' }, 'gn')).toBeNull()
    expect(errorDelPuesto(null, 'gn')).toBeNull()
  })
  it('reconoce la falta de la columna (antes de la migración) y nada más', () => {
    expect(faltaColumnaDeposito({ message: 'column caja_turno.deposito does not exist' })).toBe(true)
    expect(faltaColumnaDeposito({ message: 'timeout' })).toBe(false)
    expect(faltaColumnaDeposito(null)).toBe(false)
  })
})

describe('de qué depósito del ERP sale la venta de la caja', () => {
  const venta = { id: 'v1', store: 'zattia', renglones: [], pagos: [], subtotal: 0, total: 0, creada_en: '2026-10-29T20:00:00Z' }
  it('del turno del evento ⇒ evento; sin dato o cualquier otro ⇒ local', () => {
    expect(entradaDelMotorErp({ ...venta, deposito: 'evento' }, { prueba: false }).deposito).toBe('evento')
    expect(entradaDelMotorErp(venta, { prueba: false }).deposito).toBe('local')
    expect(entradaDelMotorErp({ ...venta, deposito: 'deposito' }, { prueba: false }).deposito).toBe('local')
  })
})
