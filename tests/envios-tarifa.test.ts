import { describe, expect, it } from 'vitest'
import { kmLeido, localDe, LOCALES, precioPorKm, tarifaDePunto } from '../lib/envios/tarifa.core.js'

/**
 * La tarifa de Jorge (cartel del 10-nov-2026, cargada el 15-nov). Los bordes son lo que se paga:
 * el cartel dice «0 a 1.9», «2 a 3.9»… y «12 a 14», leído con UN decimal como lo lee el cadete.
 */
describe('precioPorKm — las franjas del cartel, con sus bordes', () => {
  it.each([
    [0, 5000], [1.9, 5000], [2, 5500], [3.9, 5500], [4, 6000], [5.9, 6000], [6, 6500],
    [7.9, 6500], [8, 7000], [9.9, 7000], [10, 7500], [11.9, 7500], [12, 8000], [14, 8000],
  ])('%s km ⇒ $%s', (km, precio) => {
    expect(precioPorKm(km)).toBe(precio)
  })

  it('🔴 más de 14 km NO tiene precio (el cartel no dice): se tipea', () => {
    expect(precioPorKm(14.1)).toBeNull()
    expect(precioPorKm(30)).toBeNull()
  })

  it('sin km, sin precio', () => {
    expect(precioPorKm(null)).toBeNull()
    expect(precioPorKm(NaN)).toBeNull()
  })
})

describe('kmLeido — los metros del ruteador, con un decimal', () => {
  it('redondea como el mapa: 1.949 m es 1,9 y 1.950 m es 2,0 (otra franja)', () => {
    expect(kmLeido(1949)).toBe(1.9)
    expect(kmLeido(1950)).toBe(2)
    expect(precioPorKm(kmLeido(1949))).toBe(5000)
    expect(precioPorKm(kmLeido(1950))).toBe(5500)
  })

  it('🔴 `null` del ruteador sigue siendo `null`, ⛔ nunca 0 km (sería la franja más barata)', () => {
    expect(kmLeido(null)).toBeNull()
    expect(kmLeido(undefined)).toBeNull()
  })
})

describe('localDe — de qué local sale la moto', () => {
  it('BDI sale de Santa Fe 1671 y Zattia de Santa Fe 1435', () => {
    expect(localDe('bdi')).toBe(LOCALES.bdi)
    expect(localDe('zattia')).toBe(LOCALES.zattia)
  })
  it('Stunned (línea de Zattia) y sin marca salen del local de Zattia', () => {
    expect(localDe('stunned')).toBe(LOCALES.zattia)
    expect(localDe(null)).toBe(LOCALES.zattia)
  })
})

describe('tarifaDePunto — localidad fija afuera, km en Rosario', () => {
  const p = (localidad: string) => ({ lat: -32.95, lng: -60.66, localidad })

  it.each([
    ['Funes', 12000],
    ['Villa Gobernador Gálvez', 8500],
    ['Granadero Baigorria', 10000],
    ['Pérez', 10000],
    ['Ibarlucea', 10000],
  ])('%s ⇒ $%s, sin mirar los km', (loc, precio) => {
    expect(tarifaDePunto(p(loc), { km: 1 })).toMatchObject({ estado: 'sugerido', precio })
  })

  it('la localidad se compara sin tildes ni mayúsculas (Georef no siempre las trae igual)', () => {
    expect(tarifaDePunto(p('VILLA GOBERNADOR GALVEZ'))).toMatchObject({ precio: 8500 })
  })

  it('Rosario a más de 14 km: `muy_lejos`, sin precio pero con los km a la vista', () => {
    expect(tarifaDePunto(p('Rosario'), { km: 15.2 })).toMatchObject({ estado: 'muy_lejos', precio: null, km: 15.2 })
  })
})
