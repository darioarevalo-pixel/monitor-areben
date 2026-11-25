import { describe, expect, it } from 'vitest'
import { gnSeSaltea } from '../lib/erp/corte.core.js'

// Zattia corta el sáb 21-nov 13:00 ART (16:00Z); Stunned cortó el 28-oct.
const STUNNED = '2026-10-28T15:00:00.000Z'
const ZATTIA = '2026-11-21T16:00:00.000Z'

describe('gnSeSaltea — los syncs dejan de leer el GN de una base', () => {
  it('Zattia sin su corte (sólo Stunned cortó) ⇒ GN se sigue leyendo', () => {
    expect(gnSeSaltea({ stunned: STUNNED }, 'zattia', new Date('2026-11-24T06:00:00Z'))).toBe(false)
  })
  it('el día de gracia: el diario del día siguiente al corte todavía lee GN', () => {
    expect(gnSeSaltea({ stunned: STUNNED, zattia: ZATTIA }, 'zattia', new Date('2026-11-22T06:00:00Z'))).toBe(false)
  })
  it('pasado el día de gracia ⇒ se saltea (antes de la baja del 24)', () => {
    expect(gnSeSaltea({ stunned: STUNNED, zattia: ZATTIA }, 'zattia', new Date('2026-11-23T06:00:00Z'))).toBe(true)
  })
  it('BDI cortó y todo está en el ERP (Bruno 22-nov) ⇒ se saltea pasado el día de gracia', () => {
    expect(gnSeSaltea({ bdi: '2026-11-14T16:12:00Z' }, 'bdi', new Date('2026-11-15T06:00:00Z'))).toBe(false)
    expect(gnSeSaltea({ bdi: '2026-11-14T16:12:00Z' }, 'bdi', new Date('2026-11-23T06:00:00Z'))).toBe(true)
  })
  it('sin los cortes TIRA (⛔ un default que olvide el corte)', () => {
    // @ts-expect-error a propósito
    expect(() => gnSeSaltea(undefined, 'zattia')).toThrow(/faltan los cortes/)
  })
})
