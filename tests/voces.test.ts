/** Qué voz habla (`lib/voces.ts`): la mejor en español, o la elegida si sigue instalada. */
import { describe, expect, it } from 'vitest'
import { calidadDe, elegirVoz, nombreDeVoz, ordenarVoces, type VozInfo } from '../lib/voces'

const voz = (voiceURI: string, name: string, lang: string): VozInfo => ({ voiceURI, name, lang, localService: true })
// Como las devuelve un iPhone con una voz premium bajada.
const IPHONE = [
  voz('com.apple.eloquence.es-ES.Eddy', 'Eddy', 'es-ES'),
  voz('com.apple.voice.compact.es-MX.Paulina', 'Paulina', 'es-MX'),
  voz('com.apple.voice.compact.es-ES.Monica', 'Mónica', 'es-ES'),
  voz('com.apple.voice.premium.es-MX.Paulina', 'Paulina (Premium)', 'es-MX'),
  voz('com.apple.voice.compact.en-US.Samantha', 'Samantha', 'en-US'),
  voz('com.apple.speech.synthesis.voice.Grandma', 'Grandma', 'es-ES'),
]

describe('voces', () => {
  it('lee la calidad del id', () => {
    expect(calidadDe(IPHONE[3])).toBe('premium')
    expect(calidadDe(voz('com.apple.voice.enhanced.es-AR.Diego', 'Diego (Mejorada)', 'es-AR'))).toBe('mejorada')
    expect(calidadDe(IPHONE[0])).toBe('juguete')
    expect(calidadDe(IPHONE[5])).toBe('juguete')
  })

  it('premium primero, las de fantasía al final, ⛔ las que no son en español', () => {
    const orden = ordenarVoces(IPHONE).map((v) => v.voiceURI)
    expect(orden[0]).toBe('com.apple.voice.premium.es-MX.Paulina')
    expect(orden).not.toContain('com.apple.voice.compact.en-US.Samantha')
    // Las de fantasía ⛔ se ofrecen si hay otras.
    expect(orden.some((u) => /eloquence|speech\.synthesis/.test(u))).toBe(false)
  })

  it('en Chrome (el id es el nombre) también reconoce las de fantasía', () => {
    const chrome = [voz('Eddy (español (México))', 'Eddy (español (México))', 'es-MX'), voz('Paulina', 'Paulina', 'es-MX'), voz('Grandma (español (España))', 'Grandma (español (España))', 'es-ES')]
    expect(ordenarVoces(chrome).map((v) => v.name)).toEqual(['Paulina'])
    // Sin otra cosa, quedan: mejor una voz rara que ninguna.
    expect(ordenarVoces([chrome[0]])).toHaveLength(1)
  })

  it('entre dos iguales gana el acento de acá', () => {
    const orden = ordenarVoces([voz('a', 'Mónica', 'es-ES'), voz('b', 'Diego', 'es-AR'), voz('c', 'Paulina', 'es-MX')])
    expect(orden.map((v) => v.voiceURI)).toEqual(['b', 'c', 'a'])
  })

  it('la elegida gana si sigue instalada; si se borró, la mejor', () => {
    expect(elegirVoz(IPHONE, 'com.apple.voice.compact.es-ES.Monica')?.name).toBe('Mónica')
    expect(elegirVoz(IPHONE, 'ya-no-existe')?.voiceURI).toBe('com.apple.voice.premium.es-MX.Paulina')
    expect(elegirVoz([], null)).toBeNull()
  })

  it('se lee en criollo', () => {
    expect(nombreDeVoz(IPHONE[3])).toBe('Paulina · México · premium')
    expect(nombreDeVoz(IPHONE[2])).toBe('Mónica · España')
  })
})
