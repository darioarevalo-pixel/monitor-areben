/**
 * Stock e historial de una prenda: el nivel del libro es la SUMA de sus movimientos (inmutable) y
 * se compara con GN por depósito. Lo que no se ve si falla: un saldo que cierra en pantalla y en el
 * libro no, o el depósito de Zattia (`Deposito ` con espacio) que se pierde.
 */
import { describe, it, expect } from 'vitest'
import { depositoDe, stockDeVariante } from '../lib/erp/stock.core.js'

const m = (id: number, deposito: string, cantidad: number, ocurrido_en: string, tipo = 'venta', origen = 'gn') =>
  ({ id, deposito, cantidad, ocurrido_en, tipo, origen })

describe('depositoDe', () => {
  it('recorta el espacio del depósito de Zattia y no adivina', () => {
    expect(depositoDe('zattia', 'Deposito ')).toBe('deposito')
    expect(depositoDe('bdi', 'Deposito Minorista')).toBe('deposito_minorista')
    expect(depositoDe('bdi', 'Deposito ')).toBeNull()
    expect(depositoDe('zattia', null)).toBeNull()
  })
})

describe('stockDeVariante', () => {
  it('suma por depósito, con el saldo de cada fila y el más nuevo arriba', () => {
    const r = stockDeVariante({
      marca: 'zattia',
      movimientos: [
        m(3, 'local', -1, '2026-10-13T19:27:00Z'),
        m(1, 'local', 4, '2026-10-13T09:44:00Z', 'apertura', 'apertura'),
        m(2, 'local', 5, '2026-10-13T11:33:00Z', 'transferencia', 'repo'),
        m(4, 'deposito', 2, '2026-10-13T09:44:00Z', 'apertura', 'apertura'),
      ],
      gn: [{ store_name: 'Local', available_quantity: 4 }, { store_name: 'Deposito ', available_quantity: 2 }],
    })
    expect(r.depositos).toEqual([
      { deposito: 'deposito', libro: 2, gn: 2, diferencia: 0 },
      { deposito: 'local', libro: 8, gn: 4, diferencia: -4 },
    ])
    expect(r.historial.map((h) => [h.id, h.saldo])).toEqual([[3, 8], [2, 9], [4, 2], [1, 4]])
  })

  it('una anulación es otra fila y vuelve el saldo', () => {
    const r = stockDeVariante({
      marca: 'bdi',
      movimientos: [m(1, 'local', 1, '2026-10-13T09:00:00Z', 'apertura', 'apertura'), m(2, 'local', -1, '2026-10-13T12:00:00Z'), m(3, 'local', 1, '2026-10-13T15:00:00Z', 'anulacion')],
      gn: [{ store_name: 'Local', available_quantity: 1 }],
    })
    expect(r.depositos).toEqual([{ deposito: 'local', libro: 1, gn: 1, diferencia: 0 }])
    expect(r.historial[0]).toMatchObject({ tipo: 'anulacion', saldo: 1 })
  })

  it('un depósito sólo en GN tiene libro 0; uno desconocido se avisa, ⛔ se suma', () => {
    const r = stockDeVariante({
      marca: 'bdi', movimientos: [],
      gn: [{ store_name: 'Local', available_quantity: 3 }, { store_name: 'Showroom', available_quantity: 7 }],
    })
    expect(r.depositos).toEqual([{ deposito: 'local', libro: 0, gn: 3, diferencia: 3 }])
    expect(r.sinDeposito).toEqual(['Showroom'])
  })

  it('un depósito sólo en el libro tiene GN null (⛔ cero: GN no lo trae)', () => {
    const r = stockDeVariante({ marca: 'bdi', movimientos: [m(1, 'deposito_mayorista', 2, '2026-10-13T09:00:00Z')], gn: [] })
    expect(r.depositos).toEqual([{ deposito: 'deposito_mayorista', libro: 2, gn: null, diferencia: null }])
  })
})
