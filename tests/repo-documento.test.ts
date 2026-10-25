import { describe, expect, it } from 'vitest'
// @ts-expect-error módulo JS sin tipos
import { documentarTanda, renglonesDeTanda } from '../api/_repo-documento.js'

describe('Reposición → documento del motor (en sombra)', () => {
  it('arma los renglones desde { product_id_size_id: n } y deja afuera lo inválido', () => {
    expect(renglonesDeTanda({ '12_34': 2, '5_6': 0, 'x_1': 3, '7_8': 1.5, '9_10': 1 })).toEqual([
      { product_id: 12, size_id: 34, cantidad: 2 },
      { product_id: 9, size_id: 10, cantidad: 1 },
    ])
    expect(renglonesDeTanda(null)).toEqual([])
  })
  it('sin DATABASE_URL de la marca no hace nada y ⛔ lanza', async () => {
    const antes = process.env.DATABASE_URL_ZATTIA
    delete process.env.DATABASE_URL_ZATTIA
    try {
      expect(await documentarTanda({ store: 'zattia', linea: 'zattia', armadoId: 'a', tanda: 1, prendas: { '1_2': 1 }, desde: 'deposito', hacia: 'local', usuario: 'x' })).toEqual({ sinConexion: true })
    } finally {
      if (antes !== undefined) process.env.DATABASE_URL_ZATTIA = antes
    }
  })
  it('una conexión rota devuelve el error, ⛔ lanza', async () => {
    const antes = process.env.DATABASE_URL_ZATTIA
    process.env.DATABASE_URL_ZATTIA = 'postgres://x:y@127.0.0.1:1/nada'
    try {
      const r = await documentarTanda({ store: 'zattia', linea: 'zattia', armadoId: 'a', tanda: 1, prendas: { '1_2': 1 }, desde: 'deposito', hacia: 'local', usuario: 'x' })
      expect(r.error).toBeTruthy()
    } finally {
      if (antes === undefined) delete process.env.DATABASE_URL_ZATTIA
      else process.env.DATABASE_URL_ZATTIA = antes
    }
  })
})
