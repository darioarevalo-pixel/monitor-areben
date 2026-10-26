import { describe, expect, it } from 'vitest'
import { marcaDePuntoDeVenta } from '../api/_erp.js'
import { ptoVtaDe } from '../motor/arca/arca.core.js'

describe('el punto de venta sale de la marca de la VENTA', () => {
  it('una venta de Stunned (base Zattia) usa el PV de Stunned; el resto, el de su base', () => {
    expect(marcaDePuntoDeVenta('zattia', 'stunned')).toBe('stunned')
    expect(marcaDePuntoDeVenta('zattia', 'zattia')).toBe('zattia')
    expect(marcaDePuntoDeVenta('bdi', 'bdi')).toBe('bdi')
  })
  it('en producción Stunned factura con ARCA_PTOVTA_STUNNED (9), ⛔ con el 5 de Zattia', () => {
    const env = { ARCA_PTOVTA_ZATTIA: '5', ARCA_PTOVTA_STUNNED: '9' }
    expect(ptoVtaDe('produccion', marcaDePuntoDeVenta('zattia', 'stunned'), env)).toBe(9)
    expect(ptoVtaDe('produccion', marcaDePuntoDeVenta('zattia', 'zattia'), env)).toBe(5)
  })
  it('sin ARCA_PTOVTA_STUNNED en producción frena (⛔ cae en otro PV)', () => {
    expect(() => ptoVtaDe('produccion', 'stunned', { ARCA_PTOVTA_ZATTIA: '5' })).toThrow(/ARCA_PTOVTA_STUNNED/)
  })
  it('apuntar Stunned al PV de GN de Zattia (5) lo frena en producción', () => {
    expect(() => ptoVtaDe('produccion', 'stunned', { ARCA_PTOVTA_STUNNED: '5' })).toThrow(/punto de venta de GN/)
  })
})
