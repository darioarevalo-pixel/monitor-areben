/**
 * Las paradas del chequeo con mapa (`lib/exhib/paradas.ts`, Darío 12-oct-2026). El mapa es el
 * guardado de Zattia al 12-oct: ISLA, D01-D06 dobles, I01/I02, D07 y D09 de doble largo.
 */
import { describe, expect, it } from 'vitest'
import { claveLugar, lugaresHechos, paradasDelMapa, siguienteParada } from '../lib/exhib/paradas'

const mod = (orden: number, codigo: string, anchoCm: number, pos: string[]) => ({ orden, codigo, anchoCm, niveles: pos.map((p) => ({ pos: p })) })
const MAPA = {
  modulos: [mod(3, 'D02', 75, ['alta', 'baja']), mod(1, 'ISLA', 185, ['simple']), mod(2, 'D01', 75, ['alta', 'baja']), mod(4, 'I02', 75, ['frente']), mod(5, 'D07', 150, ['alta', 'baja'])],
} as never

describe('paradasDelMapa', () => {
  it('en el orden del local, arriba y abajo de cada doble, y el doble largo con los dos números', () => {
    expect(paradasDelMapa(MAPA).map((p) => p.lugar)).toEqual(['ISLA', 'D01 arriba', 'D01 abajo', 'D02 arriba', 'D02 abajo', 'I02', 'D07-08 arriba', 'D07-08 abajo'])
    expect(paradasDelMapa(null)).toEqual([])
  })
})

describe('claveLugar', () => {
  it('distintas formas de escribir la misma barra son la misma', () => {
    expect(claveLugar('D7 abajo')).toBe(claveLugar('D07-08 abajo'))
    expect(claveLugar('d07 baja')).toBe(claveLugar('D07 abajo'))
    expect(claveLugar('D07 arriba')).not.toBe(claveLugar('D07 abajo'))
    expect(claveLugar('  Vidriera ')).toBe('vidriera')
  })
})

describe('siguienteParada', () => {
  const P = paradasDelMapa(MAPA)
  it('la próxima sin escanear, salteando las hechas', () => {
    const hechos = lugaresHechos([{ lugar: 'ISLA' }, { lugar: 'D01 arriba' }, { lugar: 'D02 arriba' }])
    expect(siguienteParada(P, 'D01 arriba', hechos)?.lugar).toBe('D01 abajo')
    expect(siguienteParada(P, 'D01 abajo', hechos)?.lugar).toBe('D02 abajo')
  })
  it('al final vuelve a la que se salteó; con todo hecho, ninguna', () => {
    const hechos = lugaresHechos(P.filter((p) => p.lugar !== 'D01 abajo'))
    expect(siguienteParada(P, 'D07-08 abajo', hechos)?.lugar).toBe('D01 abajo')
    expect(siguienteParada(P, 'D07-08 abajo', lugaresHechos(P))).toBeNull()
  })
  it('sin lugar todavía, la primera sin hacer', () => {
    expect(siguienteParada(P, '', new Set())?.lugar).toBe('ISLA')
  })
})
