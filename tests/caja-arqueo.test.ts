import { describe, expect, it } from 'vitest'
import { armarArqueo, codigoArqueo, estadoDelSobre, faltaColumnaArqueo, leerCodigo, sobreEsperado } from '@/lib/caja/arqueo.core.js'
import { BILLETES_INICIALES } from '@/lib/caja/conteo.core.js'

/**
 * **El arqueo de caja** (Bruno, 30-oct): el código del sobre, lo que tiene que traer (la MISMA cuenta del ticket del cierre)
 * y el arqueo (llegó bien / con diferencia, con la nota obligatoria).
 */
describe('el código del sobre', () => {
  it('Z-0142 / B-0031; sin número ⛔ hay código', () => {
    expect(codigoArqueo('zattia', 142)).toBe('Z-0142')
    expect(codigoArqueo('bdi', 31)).toBe('B-0031')
    expect(codigoArqueo('zattia', 12345)).toBe('Z-12345')
    expect(codigoArqueo('zattia', null)).toBeNull()
    expect(codigoArqueo('stunned', 1)).toBeNull()
  })
  it('se lee escaneado o tipeado; el de otra caja ⛔', () => {
    for (const t of ['Z-0142', 'z0142', 'Z 142', ' 142 ', '0142']) expect(leerCodigo(t, 'zattia')).toBe(142)
    expect(leerCodigo('B-0142', 'zattia')).toBeNull()
    expect(leerCodigo('Z-0000', 'zattia')).toBeNull()
    expect(leerCodigo('hola', 'zattia')).toBeNull()
    expect(leerCodigo(codigoArqueo('bdi', 7) as string, 'bdi')).toBe(7)
  })
})

describe('lo que tiene que traer el sobre', () => {
  it('sin billetes: lo contado menos el fondo (⛔ negativo)', () => {
    expect(sobreEsperado({ fondo: 50000, contado: 64500 })).toBe(14500)
    expect(sobreEsperado({ fondo: '50000', contado: '40000' })).toBe(0)
    expect(sobreEsperado({ fondo: 50000, contado: null })).toBeNull()
  })
  it('con billetes: lo que ⛔ queda de fondo (`armarSobre`)', () => {
    // $64.500 = 3×20.000 + 4×1.000 + 1×500; fondo $5.000 ⇒ quedan 4×1.000 + 1×500 + … ⇒ el sobre trae $60.000 (los de 20.000).
    const conteos = { cierre: { billetes: { 20000: 3, 1000: 4, 500: 1 } } }
    expect(sobreEsperado({ fondo: 4500, contado: 64500, conteos }, [...BILLETES_INICIALES])).toBe(60000)
    // Fondo que ⛔ se arma justo con lo que hay: va lo que sobra, ⛔ contado − fondo.
    expect(sobreEsperado({ fondo: 5000, contado: 64500, conteos }, [...BILLETES_INICIALES])).toBe(60000)
  })
})

describe('el arqueo', () => {
  it('lo esperado ⇒ bien, diferencia 0, nota opcional', () => {
    expect(armarArqueo({ esperado: 10000, contado: 10000 })).toEqual({ arqueo: { estado: 'bien', esperado: 10000, contado: 10000, diferencia: 0, nota: null } })
  })
  it('con diferencia, la nota es obligatoria; sobra + / falta −', () => {
    expect(armarArqueo({ esperado: 10000, contado: 9000 })).toHaveProperty('error')
    expect(armarArqueo({ esperado: 10000, contado: 9000, nota: '  ' })).toHaveProperty('error')
    expect(armarArqueo({ esperado: 10000, contado: 9000, nota: 'faltaba uno' })).toMatchObject({ arqueo: { estado: 'diferencia', diferencia: -1000 } })
    expect(armarArqueo({ esperado: 10000, contado: 10200.5, nota: 'x' })).toMatchObject({ arqueo: { diferencia: 200.5 } })
  })
  it('sin monto o con un monto raro ⇒ error', () => {
    for (const contado of ['', null, undefined, -1, 'abc']) expect(armarArqueo({ esperado: 1, contado })).toHaveProperty('error')
  })
  it('el estado del sobre', () => {
    expect(estadoDelSobre({ cerrado_en: null })).toBe('abierta')
    expect(estadoDelSobre({ cerrado_en: 'x', arqueo: null })).toBe('sin_recibir')
    expect(estadoDelSobre({ cerrado_en: 'x', arqueo: { estado: 'bien' } })).toBe('lista')
    expect(estadoDelSobre({ cerrado_en: 'x', arqueo: { estado: 'diferencia' } })).toBe('diferencia')
  })
  it('falta la migración = un error de COLUMNA de numero/arqueo, ⛔ cualquiera', () => {
    expect(faltaColumnaArqueo({ message: 'column caja_turno.numero does not exist' })).toBe(true)
    expect(faltaColumnaArqueo({ message: 'permission denied for table caja_turno' })).toBe(false)
    expect(faltaColumnaArqueo(null)).toBe(false)
  })
})
