import { describe, expect, it } from 'vitest'
import { anchoMinimo } from '@/components/ui/ListaTrabajo'
import { COLUMNAS } from '@/lib/erp/ventas-lista.core.js'

// La #348 de Zattia (19-oct): cada fila es su propia grilla; con `max-content` una columna `minmax(…, fr)` se estiraba
// con el nombre largo de ESA fila y corría el resto. Ahora todas miden 100% con el mínimo sumado.
describe('ListaTrabajo › anchoMinimo', () => {
  it('suma los mínimos en px + huecos + relleno', () => {
    expect(anchoMinimo(['36px', 'minmax(130px, 1.2fr)', '84px'])).toBe(36 + 130 + 84 + 2 * 10 + 16)
  })
  it('un ancho sin mínimo en px (la columna que se estira) es un error', () => {
    expect(() => anchoMinimo(['1fr'])).toThrow(/sin mínimo|no tiene mínimo/)
    expect(() => anchoMinimo(['auto'])).toThrow()
  })
  it('todas las columnas de Ventas tienen mínimo en px', () => {
    expect(() => anchoMinimo(Object.values(COLUMNAS).map((c) => c[1] as string))).not.toThrow()
  })
})
