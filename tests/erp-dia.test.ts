import { describe, expect, it } from 'vitest'
import { leerFecha } from '../lib/erp/dia.core.js'

describe('leerFecha', () => {
  it('vacía = el último día; si no, YYYY-MM-DD', () => {
    expect(leerFecha('')).toEqual({ fecha: null })
    expect(leerFecha('2026-10-14')).toEqual({ fecha: '2026-10-14' })
    expect(leerFecha('14/10').error).toBeTruthy()
  })
})
