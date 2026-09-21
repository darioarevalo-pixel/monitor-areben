/**
 * **Qué se oye en cada escaneo.** La regla existe para caminar el local **sin mirar el teléfono**,
 * así que lo que se prueba acá ⛔ no es que suene: es que **cada final suene distinto del que
 * obliga a hacer algo distinto**.
 */

import { describe, expect, it } from 'vitest'
import { avisoDe, enPalabras } from '../lib/exhib/aviso'

describe('enPalabras', () => {
  it('canta el número en vez de leerlo', () => {
    expect(enPalabras(1)).toBe('uno')
    expect(enPalabras(3)).toBe('tres')
  })
  it('arriba de diez se dice el número, y ⛔ no se rompe', () => {
    expect(enPalabras(11)).toBe('11')
  })
})

describe('avisoDe', () => {
  it('el escaneo normal dice cuántas van, empezando por «uno»', () => {
    expect(avisoDe({ tipo: 'ok' })).toEqual({ aviso: 'ok', voz: 'uno' })
    expect(avisoDe({ tipo: 'sumado', veces: 2 })).toEqual({ aviso: 'suma', voz: 'dos' })
    expect(avisoDe({ tipo: 'sumado', veces: 3 }).voz).toBe('tres')
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
