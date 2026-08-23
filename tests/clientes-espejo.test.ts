/**
 * El padrón de clientes: ficha de GN → tabla `clientes`.
 *
 * Los dos casos que motivaron el módulo están acá como test: el WhatsApp que vive en
 * `cellphone_number` (caso Belen Orellana) y el vacío que NO tiene que borrar lo que había.
 */
import { describe, expect, it } from 'vitest'
import { armarLote, cambiosDeFicha, mapearFicha } from '../scripts/lib/clientes-espejo.mjs'

describe('mapearFicha', () => {
  it('toma el WhatsApp de cellphone_number cuando el teléfono común está vacío', () => {
    // La ficha real de Belen Orellana (649338), medida el 23-ago-2026.
    const f = mapearFicha({ id: 649338, name: 'Belen Orellana', phone_number: '', cellphone_number: '3834270554' })
    expect(f.phone).toBe('3834270554')
  })

  it('prefiere el celular aunque los dos estén cargados', () => {
    // Es el número al que se le escribe. El fijo no sirve para el CRM.
    const f = mapearFicha({ id: 1, phone_number: '3415551234', cellphone_number: '3416402443' })
    expect(f.phone).toBe('3416402443')
  })

  it('cae al teléfono común si no hay celular', () => {
    const f = mapearFicha({ id: 1, phone_number: '543417183056', cellphone_number: '' })
    expect(f.phone).toBe('543417183056')
  })

  it('normaliza los nulos y los espacios a cadena vacía', () => {
    const f = mapearFicha({ id: 1, name: '  Marisa  ', email: null, city: undefined })
    expect(f).toMatchObject({ name: 'Marisa', email: '', city: '' })
  })
})

describe('cambiosDeFicha', () => {
  it('un campo vacío en GN NO borra el que ya estaba guardado', () => {
    // El bug que arreglamos: el upsert de los syncs de ventas pisaba con vacío.
    const ficha = mapearFicha({ id: 7, name: 'Marisa', phone_number: '', cellphone_number: '' })
    const patch = cambiosDeFicha(ficha, { id: 7, name: 'Marisa', phone: '3364003843' })
    expect(patch).toBeNull()
  })

  it('devuelve null cuando no hay nada que cambiar', () => {
    const ficha = mapearFicha({ id: 7, name: 'Marisa', cellphone_number: '3364003843' })
    expect(cambiosDeFicha(ficha, { id: 7, name: 'Marisa', phone: '3364003843' })).toBeNull()
  })

  it('propone sólo los campos que cambian', () => {
    const ficha = mapearFicha({ id: 7, name: 'Marisa', cellphone_number: '3364003843', city: 'Rosario' })
    const patch = cambiosDeFicha(ficha, { id: 7, name: 'Marisa', phone: null, city: 'Rosario' })
    expect(patch).toEqual({ id: 7, phone: '3364003843' })
  })

  it('trata al cliente que el espejo no conoce como alta', () => {
    const ficha = mapearFicha({ id: 9, name: 'Nuevo', cellphone_number: '111' })
    expect(cambiosDeFicha(ficha, undefined)).toEqual({ id: 9, name: 'Nuevo', phone: '111' })
  })
})

describe('armarLote', () => {
  it('deja fuera a los que no cambiaron', () => {
    const fichas = [
      mapearFicha({ id: 1, name: 'Igual', cellphone_number: '111' }),
      mapearFicha({ id: 2, name: 'Cambia', cellphone_number: '222' }),
    ]
    const porId = new Map([
      [1, { id: 1, name: 'Igual', phone: '111' }],
      [2, { id: 2, name: 'Cambia', phone: null }],
    ])
    const lote = armarLote(fichas, porId, '2026-08-23T00:00:00Z')
    expect(lote.map((f) => f.id)).toEqual([2])
  })

  it('completa las columnas que no cambian con lo que ya tenía el espejo', () => {
    // ⚠️ Todas las filas del upsert tienen que traer las mismas columnas: a la que falta,
    // PostgREST le pone NULL. Un patch parcial borraría justo lo que veníamos a proteger.
    const fichas = [mapearFicha({ id: 3, name: 'Ana', cellphone_number: '333' })]
    const porId = new Map([[3, { id: 3, name: 'Ana', phone: null, city: 'Córdoba', province: 'Córdoba' }]])
    const [fila] = armarLote(fichas, porId, '2026-08-23T00:00:00Z')
    expect(fila).toEqual({
      id: 3,
      updated_at: '2026-08-23T00:00:00Z',
      name: 'Ana',
      email: null,
      phone: '333',
      city: 'Córdoba',
      province: 'Córdoba',
      address: null,
      postal_code: null,
    })
  })
})
