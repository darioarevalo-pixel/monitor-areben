/**
 * **Qué se oye en cada escaneo.** La regla existe para caminar el local **sin mirar el teléfono**,
 * así que lo que se prueba acá ⛔ no es que suene: es que **cada final suene distinto del que
 * obliga a hacer algo distinto**.
 */

import { describe, expect, it } from 'vitest'
import { avisoDe, enPalabras } from '../lib/exhib/aviso'

describe('enPalabras — el número se canta, ⛔ no se lee', () => {
  it('los chicos', () => {
    expect(enPalabras(1)).toBe('uno')
    expect(enPalabras(15)).toBe('quince')
    expect(enPalabras(22)).toBe('veintidós')
  })

  /** 🔴 Un sector entero son cientos de prendas: el de Tops del Local son 400 variantes. */
  it('llega hasta los cientos, que es el tamaño real de un sector', () => {
    expect(enPalabras(31)).toBe('treinta y uno')
    expect(enPalabras(40)).toBe('cuarenta')
    expect(enPalabras(97)).toBe('noventa y siete')
    expect(enPalabras(100)).toBe('cien')
    expect(enPalabras(101)).toBe('ciento uno')
    expect(enPalabras(400)).toBe('cuatrocientos')
    expect(enPalabras(999)).toBe('novecientos noventa y nueve')
  })

  it('«cien» pelado sólo cuando es exacto', () => {
    expect(enPalabras(100)).toBe('cien')
    expect(enPalabras(115)).toBe('ciento quince')
  })

  it('arriba de 999 se dicen los dígitos, y ⛔ no se rompe', () => {
    expect(enPalabras(1200)).toBe('1200')
  })
})

describe('avisoDe', () => {
  /**
   * 🔴 **El número que se canta es el AVANCE del recorrido, y ⛔ no cuántas van de esa prenda.**
   * Bruno, 20-sep-2026: *«me interesa para saber que se escaneó correctamente sin necesidad de ver
   * el celular: cuando sabés que te dijo un número creciente, significa que escaneó bien»*.
   */
  it('el escaneo normal canta el avance del recorrido', () => {
    expect(avisoDe({ tipo: 'ok', avance: 1 })).toEqual({ aviso: 'ok', voz: 'uno' })
    expect(avisoDe({ tipo: 'ok', avance: 47 })).toEqual({ aviso: 'ok', voz: 'cuarenta y siete' })
  })

  /** 🔑 El repetido **también** hace crecer el número: es otra unidad colgada. Lo distingue el pitido. */
  it('el repetido sigue la cuenta, y se distingue por el pitido', () => {
    const r = avisoDe({ tipo: 'sumado', veces: 2, avance: 48 })
    expect(r.voz).toBe('cuarenta y ocho')
    expect(r.aviso).toBe('suma')
  })

  /** ⚠️ El número ⛔ no puede repetirse entre dos escaneos buenos: ahí se pierde la confirmación. */
  it('dos escaneos seguidos cantan números distintos y crecientes', () => {
    expect(avisoDe({ tipo: 'ok', avance: 12 }).voz).toBe('doce')
    expect(avisoDe({ tipo: 'sumado', veces: 2, avance: 13 }).voz).toBe('trece')
  })

  it('sin avance ⛔ no se inventa un número: queda sólo el pitido', () => {
    expect(avisoDe({ tipo: 'ok' }).voz).toBe('')
  })

  it('el rebote del aparato suena distinto del que contó', () => {
    const doble = avisoDe({ tipo: 'doble-lectura' })
    expect(doble.voz).toBe('repetido')
    expect(doble.aviso).not.toBe('ok')
    expect(doble.aviso).not.toBe('suma')
  })

  it('lo que no cruza suena mal, y lo dice corto', () => {
    expect(avisoDe({ tipo: 'no-cruzo' })).toEqual({ aviso: 'no', voz: 'no figura' })
    // Es el mismo hecho por las dos pantallas: ⛔ no puede sonar distinto según por dónde se entró.
    expect(avisoDe({ tipo: 'no-encontrado' })).toEqual(avisoDe({ tipo: 'no-cruzo' }))
  })

  it('la prenda en cero avisa sin sonar a error: está colgada, el stock está mal', () => {
    const cero = avisoDe({ tipo: 'stock-cero' })
    expect(cero.voz).toBe('en cero')
    expect(cero.aviso).not.toBe('no')
    expect(cero.aviso).not.toBe('ok')
  })

  /**
   * 🔴 **El caso que justifica todo el módulo.** Si «anduvo» y «elegí cuál es» suenan parecido, la
   * persona sigue caminando y deja atrás la prenda sin resolver — y ese escaneo se guarda solo como
   * «no cruzó». El tono que pide la vista ⛔ no se comparte con ningún final que ya quedó resuelto.
   */
  it('los que EXIGEN mirar la pantalla tienen un tono propio', () => {
    expect(avisoDe({ tipo: 'candidatos' }).aviso).toBe('mira')
    expect(avisoDe({ tipo: 'cruce' }).aviso).toBe('mira')
    const resueltos = ['ok', 'sumado', 'doble-lectura', 'stock-cero', 'no-cruzo'].map((tipo) => avisoDe({ tipo }).aviso)
    expect(resueltos).not.toContain('mira')
  })

  it('un final que nadie sonorizó ⛔ no rompe el recorrido', () => {
    expect(avisoDe({ tipo: 'algo-nuevo' })).toEqual({ aviso: 'ok', voz: '' })
  })
})
