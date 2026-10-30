import { describe, expect, it } from 'vitest'
import { avanzarDocumento, documentarTanda, renglonesDeTanda, transferenciaEnErp, transferirEnErp } from '../api/_repo-documento.js'

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

describe('Stunned sin GN (llave TRANSFERENCIA_STUNNED_ERP)', () => {
  const con = (v: string | undefined, fn: () => void) => {
    const antes = process.env.TRANSFERENCIA_STUNNED_ERP
    if (v === undefined) delete process.env.TRANSFERENCIA_STUNNED_ERP
    else process.env.TRANSFERENCIA_STUNNED_ERP = v
    try { fn() } finally { if (antes === undefined) delete process.env.TRANSFERENCIA_STUNNED_ERP; else process.env.TRANSFERENCIA_STUNNED_ERP = antes }
  }
  it('apagada por defecto y sólo vale para Stunned', () => {
    con(undefined, () => expect(transferenciaEnErp('stunned')).toBe(false))
    con('1', () => {
      expect(transferenciaEnErp('stunned')).toBe(true)
      expect(transferenciaEnErp('zattia')).toBe(false)
      expect(transferenciaEnErp('bdi')).toBe(false)
    })
    con('0', () => expect(transferenciaEnErp('stunned')).toBe(false))
  })
  it('sin conexión o sin prendas devuelve error, ⛔ lanza (acá el documento ES la transferencia)', async () => {
    const antes = process.env.DATABASE_URL_ZATTIA
    delete process.env.DATABASE_URL_ZATTIA
    try {
      const r = await transferirEnErp({ store: 'zattia', linea: 'stunned', armadoId: 'a', tanda: 1, prendas: { '1_2': 1 }, desde: 'deposito', hacia: 'local', recibir: 'al_armar', usuario: 'x' })
      expect(r).toMatchObject({ sinConexion: true })
      expect('error' in r && r.error).toBeTruthy()
      process.env.DATABASE_URL_ZATTIA = 'postgres://x:y@127.0.0.1:1/nada'
      expect(await transferirEnErp({ store: 'zattia', linea: 'stunned', armadoId: 'a', tanda: 1, prendas: {}, desde: 'deposito', hacia: 'local', recibir: 'al_armar', usuario: 'x' })).toMatchObject({ error: expect.any(String) })
      expect(await transferirEnErp({ store: 'zattia', linea: 'stunned', armadoId: 'a', tanda: 1, prendas: { '1_2': 1 }, desde: 'deposito', hacia: 'local', recibir: 'al_armar', usuario: 'x' })).toMatchObject({ error: expect.any(String) })
    } finally {
      if (antes === undefined) delete process.env.DATABASE_URL_ZATTIA
      else process.env.DATABASE_URL_ZATTIA = antes
    }
  })
  it('sin decir cuándo se recibe ⛔ transfiere', async () => {
    const antes = process.env.DATABASE_URL_ZATTIA
    process.env.DATABASE_URL_ZATTIA = 'postgres://x:y@127.0.0.1:1/nada'
    try {
      expect(await transferirEnErp({ store: 'zattia', linea: 'stunned', armadoId: 'a', tanda: 1, prendas: { '1_2': 1 }, desde: 'deposito', hacia: 'local', usuario: 'x' }))
        .toEqual({ error: 'Falta decir si se recibe al armar o en destino.' })
    } finally {
      if (antes === undefined) delete process.env.DATABASE_URL_ZATTIA
      else process.env.DATABASE_URL_ZATTIA = antes
    }
  })
  it('«al armar» llega a Recibida; «en destino» frena En camino; y retoma desde donde quedó', async () => {
    const hechos: string[] = []
    const paso = (n: string) => async () => { hechos.push(n); return { ok: true, avisos: [] } }
    const m = { armarTransferencia: paso('armar'), enviarTransferencia: paso('enviar'), recibirTransferencia: paso('recibir') }
    const p = { id: 'd', renglones: [], usuario: 'x' }
    expect(await avanzarDocumento(m, null, { ...p, estado: 'borrador', recibir: 'al_armar' })).toEqual({ estado: 'recibida', avisos: [] })
    expect(hechos.splice(0)).toEqual(['armar', 'enviar', 'recibir'])
    expect(await avanzarDocumento(m, null, { ...p, estado: 'borrador', recibir: 'en_destino' })).toEqual({ estado: 'en_transito', avisos: [] })
    expect(hechos.splice(0)).toEqual(['armar', 'enviar'])
    expect(await avanzarDocumento(m, null, { ...p, estado: 'en_transito', recibir: 'en_destino' })).toEqual({ estado: 'en_transito', avisos: [] })
    expect(hechos).toEqual([])
  })
})
