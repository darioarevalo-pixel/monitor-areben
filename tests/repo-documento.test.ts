import { describe, expect, it } from 'vitest'
import { avanzarDocumento, documentarTanda, renglonesDeTanda, transferenciaEnErp, transferirEnErp } from '../api/_repo-documento.js'
import { depositosEnMotor } from '../lib/reposicion/armado.core.js'

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

describe('la línea cortada, sin GN (`erp_corte`)', () => {
  const cortes = async () => ({ stunned: '2026-10-28T23:40:27.758Z', bdi: '2026-11-16T03:00:00.000Z' })
  it('por el CORTE de la línea (`erp_corte`), ⛔ por una variable', async () => {
    const antes = process.env.TRANSFERENCIA_STUNNED_ERP
    process.env.TRANSFERENCIA_STUNNED_ERP = '1'
    try { expect(await transferenciaEnErp('zattia', { cortes })).toBe(false) } finally { if (antes === undefined) delete process.env.TRANSFERENCIA_STUNNED_ERP; else process.env.TRANSFERENCIA_STUNNED_ERP = antes }
    expect(await transferenciaEnErp('stunned', { cortes })).toBe(true)
    expect(await transferenciaEnErp('stunned', { cortes: async () => ({}) })).toBe(false)
  })
  it('pide los cortes de la base de la línea: Stunned vive en la de Zattia', async () => {
    const pedidas: string[] = []
    await transferenciaEnErp('stunned', { cortes: async (s: string) => { pedidas.push(s); return {} } })
    await transferenciaEnErp('bdi', { cortes: async (s: string) => { pedidas.push(s); return {} } })
    expect(pedidas).toEqual(['zattia', 'bdi'])
  })
  it('sin poder leer los cortes TIRA: ⛔ elige un camino a ciegas', async () => {
    await expect(transferenciaEnErp('bdi', { cortes: async () => { throw new Error('la base no contesta') } })).rejects.toThrow(/no contesta/)
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

describe('depositosEnMotor', () => {
  it('🔴 BDI repone desde `deposito_minorista`: el motor ⛔ conoce `deposito` en esa línea', () => {
    expect(depositosEnMotor('bdi', 'llevar')).toEqual(['deposito_minorista', 'local'])
    expect(depositosEnMotor('bdi', 'devolver')).toEqual(['local', 'deposito_minorista'])
    expect(depositosEnMotor('zattia', 'llevar')).toEqual(['deposito', 'local'])
    expect(depositosEnMotor('zattia', 'devolver')).toEqual(['local', 'deposito'])
  })
})
