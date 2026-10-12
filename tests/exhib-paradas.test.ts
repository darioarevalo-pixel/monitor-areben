/**
 * Los percheros del chequeo con mapa (`lib/exhib/paradas.ts`, Darío 12-oct-2026): el orden FIJO del
 * recorrido (I → ISLA → D), del mapa sólo los nombres, y lo frontal ⛔ es duplicado.
 */
import { describe, expect, it } from 'vitest'
import { claveLugar, esFrontal, lugarDeParada, percheroDe, percherosDelChequeo, percherosPendientes, siguienteLugar } from '../lib/exhib/paradas'

const mod = (orden: number, codigo: string, anchoCm: number, pos: string[]) => ({ orden, codigo, anchoCm, niveles: pos.map((p) => ({ pos: p })) })
// El mapa guardado de Zattia al 12-oct, con su `orden` de clienta (ISLA primero, I01 en el medio).
const MAPA = {
  modulos: [mod(1, 'ISLA', 185, ['simple']), mod(2, 'D01', 75, ['alta', 'baja']), mod(3, 'D02', 75, ['alta', 'baja']), mod(6, 'I01', 75, ['frente', 'baja']), mod(7, 'I02', 75, ['frente']), mod(10, 'D07', 150, ['alta', 'baja'])],
} as never
const P = percherosDelChequeo(MAPA)
const esc = (...lugares: string[]) => lugares.map((lugar) => ({ lugar }))

describe('percherosDelChequeo', () => {
  it('el orden del RECORRIDO (I, ISLA, D) y ⛔ el del mapa; el doble largo con los dos números', () => {
    expect(P.map((p) => p.nombre)).toEqual(['I01', 'I02', 'ISLA', 'D01', 'D02', 'D07-08'])
    expect(percherosDelChequeo(null)).toEqual([])
  })
})

describe('lugares', () => {
  const d01 = P.find((p) => p.codigo === 'D01')!
  it('arriba, abajo, frontal; la isla sin altura', () => {
    expect(lugarDeParada(d01, 'alta')).toBe('D01 arriba')
    expect(lugarDeParada(d01, 'frontal')).toBe('D01 frontal')
    expect(lugarDeParada(P.find((p) => p.isla)!, 'simple')).toBe('ISLA')
  })
  it('frontal se reconoce y sigue siendo del perchero', () => {
    expect(esFrontal('D07-08 frontal')).toBe(true)
    expect(esFrontal('D01 arriba')).toBe(false)
    expect(percheroDe('D07-08 frontal')).toBe('D07')
    expect(claveLugar('d7 frontal')).toBe(claveLugar('D07-08 frontal'))
    expect(claveLugar('D7 abajo')).toBe(claveLugar('D07-08 abajo'))
    expect(claveLugar('  Vidriera ')).toBe('vidriera')
  })
})

describe('siguienteLugar', () => {
  it('sin lugar, el primero del recorrido', () => {
    expect(siguienteLugar(P, '', [])).toBe('I01 arriba')
  })
  it('de arriba a abajo del mismo perchero; después, el próximo sin escanear', () => {
    expect(siguienteLugar(P, 'D01 arriba', esc('D01 arriba'))).toBe('D01 abajo')
    expect(siguienteLugar(P, 'D01 abajo', esc('ISLA', 'D01 arriba', 'D01 abajo', 'D02 frontal'))).toBe('D07-08 arriba')
  })
  it('al final vuelve al salteado; con todo hecho, ninguno', () => {
    expect(siguienteLugar(P, 'D07-08 abajo', esc('I01 arriba', 'ISLA', 'D01 abajo', 'D02 arriba', 'D07-08 abajo'))).toBe('I02')
    expect(siguienteLugar(P, 'D07-08 abajo', esc('I01 frontal', 'I02', 'ISLA', 'D01 abajo', 'D02 arriba', 'D07 abajo'))).toBeNull()
  })
  it('cuenta los percheros que faltan', () => {
    expect(percherosPendientes(P, esc('I01 frontal', 'ISLA'))).toBe(4)
  })
})
