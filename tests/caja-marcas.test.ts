import { describe, expect, it } from 'vitest'
import { MARCAS_CAJA, MARCA_POR_DEFECTO, marcaDeCaja } from '@/lib/caja/marcas.core.js'
import { MODO_LOCAL_ZATTIA } from '@/lib/caja/core.core.js'

/**
 * Rediseño de la Caja, fase 5 (V4): la marca es CONFIGURACIÓN. Oráculo: los ids que la Caja tenía
 * fijos en `api/_caja.js` hasta el 5-oct (Local 11780, Depósito 18210, el modo Local de Zattia).
 */
describe('marcas de la Caja', () => {
  it('Zattia, con los mismos ids que estaban fijos', () => {
    expect(marcaDeCaja('zattia')).toMatchObject({ store: 'zattia', nombre: 'Zattia', local: 11780, deposito: 18210 })
    expect(marcaDeCaja('ZATTIA')?.modoLocal).toBe(MODO_LOCAL_ZATTIA)
    expect(MARCA_POR_DEFECTO).toBe('zattia')
  })

  it('BDI todavía ⛔ está habilitada, y un nombre raro tampoco', () => {
    expect(marcaDeCaja('bdi')).toBeNull()
    expect(marcaDeCaja('toString')).toBeNull()
    expect(marcaDeCaja(null)).toBeNull()
    expect(Object.keys(MARCAS_CAJA)).toEqual(['zattia'])
  })
})
