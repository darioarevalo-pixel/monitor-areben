/**
 * La factura ENTERA de una venta que ya se factura POR PARTES (mayoristas, Darío §5): la puerta la frena con el motivo
 * ANTES de pedir el CAE. Si la consulta de partes se saca, la entera llega a ARCA y la frena recién la base con un error
 * crudo (`facturas_no_pasarse`): este test se pone rojo.
 */
import { describe, it, expect } from 'vitest'
import { facturarVentaPropia } from '../api/_erp.js'

const ID = '0b5e7a52-6d1c-4b8e-9a51-2f6c7d8e9f01'
const venta = { id: ID, estado: 'confirmada', tipo: 'venta', total: 50000, prueba: false, marca: 'bdi', facturas: [], lineas: [], ocurrida_en: '2026-10-31T15:00:00Z', detalle: {} }
const db = { query: async () => ({ rows: [venta] }) }
const sinArca = { arca: null }

function deps(tienePartes: boolean, pedidas: string[]) {
  return {
    db, b: {}, repo: {}, buscarFactura: async () => null,
    tienePartes: async (k: string) => { pedidas.push(k); return tienePartes },
    ...sinArca,
  }
}

describe('facturarVentaPropia · venta con partes', () => {
  it('con partes ⇒ 409 con el motivo, y pregunta por la clave de la venta', async () => {
    const pedidas: string[] = []
    const r = await facturarVentaPropia({ marca: 'bdi', body: { ventaId: ID }, usuario: 'test' }, deps(true, pedidas))
    expect(r).toMatchObject({ status: 409, error: expect.stringMatching(/por partes/) })
    expect(pedidas).toEqual([ID])
  })
  it('sin partes ⇒ sigue de largo (acá frena después, por la falta de ARCA)', async () => {
    const r = await facturarVentaPropia({ marca: 'bdi', body: { ventaId: ID }, usuario: 'test' }, deps(false, []))
    expect(r.error || '').not.toMatch(/por partes/)
  })
})
