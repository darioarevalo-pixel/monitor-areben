/**
 * La nota de DÉBITO de ERP › Facturación (`notaDeDebito` de api/_erp.js), con la base y ARCA simulados:
 * lo que viaja a ARCA (tipo ND de la clase de la factura, factura asociada, receptor, el monto pedido) y que una factura puede llevar VARIAS.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CBTE, COND_IVA, DOC } from '../motor/arca/arca.core.js'

const FACTURA = {
  id: '11111111-1111-4111-8111-111111111111', ambiente: 'homologacion', marca: 'zattia', venta_id: '555', tipo: CBTE.FACTURA_B,
  pto_vta: 5, numero: 40, fecha: '2026-10-10', total: '12100.00', doc_tipo: DOC.SIN_IDENTIFICAR, doc_nro: 0, cond_iva: COND_IVA.CONSUMIDOR_FINAL, estado: 'autorizada',
}
const estado = { filas: [] as Array<Record<string, unknown>>, pedidos: [] as Array<Record<string, unknown>>, factura: { ...FACTURA } as Record<string, unknown> }

vi.mock('../api/_facturacion.js', () => ({
  // El certificado está (el cliente de ARCA lo pone el mock de abajo): sin él, la puerta contesta 409 antes.
  arcaConectado: () => true, SIN_ARCA: 'sin certificado',
  baseFacturacion: () => ({
    // `maybeSingle` = la factura; como lista (`.in().neq()`) = las NC ya asociadas a ella (lo que lleva acreditado).
    from: () => {
      const q = {
        select: () => q, eq: () => q, in: () => q, neq: () => q, maybeSingle: async () => ({ data: estado.factura, error: null }),
        then: (r: (x: unknown) => unknown) => r({ data: estado.filas.filter((f) => f.asociado_id === FACTURA.id && f.estado !== 'rechazada'), error: null }),
      }
      return q
    },
  }),
  clienteArcaDelEntorno: () => ({
    arca: {
      ultimo: async () => 0,
      solicitar: async ({ desde, comprobantes }: { desde: number, comprobantes: Array<Record<string, unknown>> }) => {
        estado.pedidos.push(...comprobantes)
        return { resultado: 'A', errores: [], detalles: comprobantes.map((_, j) => ({ numero: desde + j, resultado: 'A', cae: '7000', caeVence: '2026-10-24', observaciones: [] })) }
      },
      consultar: async () => null,
    },
  }),
  repoFacturas: () => ({
    tomarCandado: async () => true, soltarCandado: async () => {}, reservadas: async () => [],
    ventasFacturadas: async ({ nc, ventaIds }: { nc: boolean, ventaIds: string[] }) => new Set(estado.filas.filter((f) => nc === [3, 8].includes(Number(f.tipo)) && ventaIds.includes(String(f.venta_id))).map((f) => String(f.venta_id))),
    reservar: async (fs: Array<Record<string, unknown>>) => { estado.filas.push(...fs) },
    resolver: async (id: string, cambios: Record<string, unknown>) => { Object.assign(estado.filas.find((f) => f.id === id) || {}, cambios) },
  }),
}))

describe('notaDeDebito', () => {
  beforeEach(() => { estado.filas = []; estado.pedidos = []; estado.factura = { ...FACTURA } })

  it('SUMA el monto a la factura: ND B asociada a ella, mismo receptor; una factura puede llevar varias', async () => {
    const { notaDeDebito } = await import('../api/_erp.js')
    const r = await notaDeDebito({ facturaId: FACTURA.id, monto: '1500.50', usuario: 'Bruno' })
    expect(r).toMatchObject({ ambiente: 'homologacion', autorizada: { numero: 1, cae: '7000', total: 1500.5 } })
    expect(estado.pedidos[0]).toMatchObject({ tipo: CBTE.ND_B, total: 1500.5, ventaId: '555', asociado: { tipo: CBTE.FACTURA_B, ptoVta: 5, numero: 40, fecha: '2026-10-10' }, receptor: { docTipo: DOC.SIN_IDENTIFICAR, docNro: 0, condicionIva: COND_IVA.CONSUMIDOR_FINAL } })
    expect(estado.filas[0]).toMatchObject({ tipo: CBTE.ND_B, pto_vta: 5, asociado_id: FACTURA.id, estado: 'autorizada' })
    const otra = await notaDeDebito({ facturaId: FACTURA.id, monto: 200, usuario: 'Bruno' })
    expect(otra).toMatchObject({ autorizada: { total: 200 } })
    expect(estado.pedidos).toHaveLength(2)
  })

  it('una factura A lleva ND A', async () => {
    const { notaDeDebito } = await import('../api/_erp.js')
    estado.factura = { ...FACTURA, tipo: CBTE.FACTURA_A, doc_tipo: DOC.CUIT, doc_nro: 30718508181, cond_iva: COND_IVA.RESPONSABLE_INSCRIPTO }
    await notaDeDebito({ facturaId: FACTURA.id, monto: 100, usuario: 'x' })
    expect(estado.pedidos[0]).toMatchObject({ tipo: CBTE.ND_A, asociado: { tipo: CBTE.FACTURA_A } })
  })

  it('⛔ sin importe, sobre una NC o una ND, una factura sin CAE, de otro ambiente o de una venta del ERP', async () => {
    const { notaDeDebito } = await import('../api/_erp.js')
    for (const monto of [0, -5, 'abc', '', 1e9]) expect(await notaDeDebito({ facturaId: FACTURA.id, monto, usuario: 'x' })).toMatchObject({ status: 400 })
    for (const tipo of [CBTE.NC_B, CBTE.ND_B]) {
      estado.factura = { ...FACTURA, tipo }
      expect(await notaDeDebito({ facturaId: FACTURA.id, monto: 100, usuario: 'x' })).toMatchObject({ status: 409 })
    }
    estado.factura = { ...FACTURA, estado: 'rechazada' }
    expect(await notaDeDebito({ facturaId: FACTURA.id, monto: 100, usuario: 'x' })).toMatchObject({ status: 409 })
    estado.factura = { ...FACTURA, ambiente: 'produccion' }
    expect(await notaDeDebito({ facturaId: FACTURA.id, monto: 100, usuario: 'x' })).toMatchObject({ status: 404 })
    estado.factura = { ...FACTURA, venta_id: '907d03ec-1a95-4185-b880-289529893d6c' }
    expect(await notaDeDebito({ facturaId: FACTURA.id, monto: 100, usuario: 'x' })).toMatchObject({ status: 409 })
    expect(await notaDeDebito({ facturaId: 'x', monto: 100, usuario: 'x' })).toMatchObject({ status: 400 })
    expect(estado.pedidos).toHaveLength(0)
  })
})
