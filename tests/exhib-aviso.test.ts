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

describe('avisoDe — son DOS avisos, y eso es todo lo que se oye', () => {
  /**
   * 🔴 Bruno, 20-sep-2026: *«necesito que esta chica sólo escanee: si detecta un producto que diga
   * el número de escaneo, y si no, que le diga que vuelva a escanear porque no lo detectó; lo
   * repetido y demás entra en el balance»*.
   */
  it('la detectó ⇒ el número del recorrido, que crece', () => {
    expect(avisoDe({ tipo: 'ok', avance: 12 })).toEqual({ aviso: 'ok', voz: 'doce' })
    expect(avisoDe({ tipo: 'ok', avance: 47 }).voz).toBe('cuarenta y siete')
  })

  /**
   * 🔑 **Los cuatro casos «detectada» suenan IGUAL.** La prenda repetida y la que el sistema tiene
   * en cero son hallazgos **del balance**: cantárselos a quien camina le pide entender —y recordar—
   * palabras distintas para cosas sobre las que ⛔ no puede hacer nada en ese momento.
   */
  it('la repetida y la que está en cero suenan igual que cualquier escaneo bueno', () => {
    const normal = avisoDe({ tipo: 'ok', avance: 48 })
    expect(avisoDe({ tipo: 'sumado', veces: 2, avance: 48 })).toEqual(normal)
    expect(avisoDe({ tipo: 'stock-cero', avance: 48 })).toEqual(normal)
  })

  /** ⚠️ El rebote del aparato **detectó** la prenda: lo único que ⛔ no pasó es que contara otra. */
  it('el rebote del lector suena como uno bueno, con el número sin moverse', () => {
    expect(avisoDe({ tipo: 'doble-lectura', avance: 48 })).toEqual({ aviso: 'ok', voz: 'cuarenta y ocho' })
  })

  /**
   * 🔴 **Una sola causa audible: «⛔ no la detecté».** Código cortado, SKU que comparten dos prendas
   * o prenda que ⛔ no figura son causas distintas con **la misma acción**: pasarla de nuevo.
   */
  it('⛔ no la detectó ⇒ «de nuevo», siempre lo mismo', () => {
    expect(avisoDe({ tipo: 'no-cruzo' })).toEqual({ aviso: 'no', voz: 'de nuevo' })
    expect(avisoDe({ tipo: 'no-cruzo', parecidos: 2 })).toEqual({ aviso: 'no', voz: 'de nuevo' })
    // El mismo hecho por las dos pantallas: ⛔ no puede sonar distinto según por dónde se entró.
    expect(avisoDe({ tipo: 'no-encontrado' })).toEqual(avisoDe({ tipo: 'no-cruzo' }))
  })

  it('los dos avisos ⛔ no se parecen entre sí', () => {
    expect(avisoDe({ tipo: 'ok', avance: 3 }).aviso).not.toBe(avisoDe({ tipo: 'no-cruzo' }).aviso)
  })

  it('sin avance ⛔ no se inventa un número: queda sólo el pitido', () => {
    expect(avisoDe({ tipo: 'ok' }).voz).toBe('')
  })

  it('un final que nadie sonorizó ⛔ no rompe el recorrido', () => {
    expect(avisoDe({ tipo: 'algo-nuevo' })).toEqual({ aviso: 'ok', voz: '' })
  })
})
