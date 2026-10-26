import { describe, expect, it } from 'vitest'
import { ejemploDeRedondeo, filasDeRedondeo, leerRedondeoDePantalla, textoDeRedondeo, CANALES_DE_REDONDEO } from '@/lib/erp/redondeo.core.js'

describe('textoDeRedondeo', () => {
  it('lo dice como se habla', () => {
    expect(textoDeRedondeo({ paso: 100, modo: 'cercano' })).toBe('Al $100 más cercano')
    expect(textoDeRedondeo({ paso: 1000, modo: 'abajo' })).toBe('Hacia abajo, al $1.000')
    expect(textoDeRedondeo({ paso: 10, modo: 'arriba' })).toBe('Hacia arriba, al $10')
    expect(textoDeRedondeo(null)).toBe('Sin redondeo')
  })
})

describe('ejemploDeRedondeo (el del motor)', () => {
  it('cada modo y sin redondeo', () => {
    expect(ejemploDeRedondeo(12345.67, { paso: 100, modo: 'cercano' })).toBe(12300)
    expect(ejemploDeRedondeo(12345.67, { paso: 100, modo: 'abajo' })).toBe(12300)
    expect(ejemploDeRedondeo(12345.67, { paso: 100, modo: 'arriba' })).toBe(12400)
    expect(ejemploDeRedondeo(12350, { paso: 100, modo: 'cercano' })).toBe(12400)
    expect(ejemploDeRedondeo(12345.67, null)).toBe(12345.67)
  })
})

describe('leerRedondeoDePantalla', () => {
  const lineas = ['zattia', 'stunned']
  it('la línea sale de la marca de la pantalla; sin línea, la marca', () => {
    expect(leerRedondeoDePantalla({ canal: 'mayorista', paso: '100', modo: 'cercano' }, { marca: 'zattia', lineas }))
      .toEqual({ redondeo: { marca: 'zattia', canal: 'mayorista', paso: 100, modo: 'cercano' } })
    expect(leerRedondeoDePantalla({ linea: 'stunned', canal: 'local', paso: 10, modo: 'abajo' }, { marca: 'zattia', lineas }).redondeo)
      .toMatchObject({ marca: 'stunned', paso: 10, modo: 'abajo' })
  })
  it('lo que no corresponde se dice, con el campo', () => {
    const err = (b: object, marca = 'zattia', ls = lineas) => leerRedondeoDePantalla(b, { marca, lineas: ls })
    expect(err({ linea: 'stunned', canal: 'local', paso: 100, modo: 'cercano' }, 'bdi', ['bdi'])).toMatchObject({ error: 'Línea inválida', campo: 'linea' })
    expect(err({ canal: 'web', paso: 100, modo: 'cercano' })).toMatchObject({ campo: 'canal' })
    expect(err({ canal: 'local', paso: 50, modo: 'cercano' })).toMatchObject({ campo: 'paso' })
    expect(err({ canal: 'local', paso: 100, modo: 'redondo' })).toMatchObject({ campo: 'modo' })
    expect(err(null)).toMatchObject({ error: 'Falta el redondeo' })
  })
  it('un `desde` viaja sólo si viene', () => {
    expect(leerRedondeoDePantalla({ canal: 'local', paso: 100, modo: 'cercano' }, { marca: 'bdi', lineas: ['bdi'] }).redondeo).not.toHaveProperty('desde')
    expect(leerRedondeoDePantalla({ canal: 'local', paso: 100, modo: 'cercano', desde: '2026-11-01T03:00:00.000Z' }, { marca: 'bdi', lineas: ['bdi'] }).redondeo?.desde).toBe('2026-11-01T03:00:00.000Z')
  })
})

describe('filasDeRedondeo', () => {
  it('siempre una fila por canal, en orden; los que ⛔ tienen fila, sin redondeo', () => {
    const f = filasDeRedondeo([{ canal: 'mayorista', vigente: { paso: 100, modo: 'cercano', desde: 'x' }, proximo: null }])
    expect(f.map((x) => x.canal)).toEqual(CANALES_DE_REDONDEO)
    expect(f.find((x) => x.canal === 'mayorista')?.vigente).toMatchObject({ paso: 100 })
    expect(f.find((x) => x.canal === 'local')).toEqual({ canal: 'local', vigente: null, proximo: null })
  })
  it('un canal nuevo del motor ⛔ se pierde', () => {
    expect(filasDeRedondeo([{ canal: 'feria', vigente: null, proximo: null }]).map((x) => x.canal)).toEqual([...CANALES_DE_REDONDEO, 'feria'])
  })
})
