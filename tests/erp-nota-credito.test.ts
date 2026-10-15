/**
 * La nota de crédito de ERP › Facturación (`notaDeCredito` de api/_erp.js), con la base y ARCA simulados:
 * lo que viaja a ARCA (tipo, factura asociada, receptor, total) y que una venta lleva UNA sola NC.
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

describe('notaDeCredito', () => {
  beforeEach(() => { estado.filas = []; estado.pedidos = []; estado.factura = { ...FACTURA } })

  it('anula la factura ENTERA: NC B, asociada a esa factura, mismo receptor y total; una sola por venta', async () => {
    const { notaDeCredito } = await import('../api/_erp.js')
    const r = await notaDeCredito({ facturaId: FACTURA.id, usuario: 'Bruno' })
    expect(r).toMatchObject({ ambiente: 'homologacion', autorizada: { numero: 1, cae: '7000', total: 12100 } })
    expect(estado.pedidos[0]).toMatchObject({ tipo: CBTE.NC_B, total: 12100, ventaId: '555', asociado: { tipo: CBTE.FACTURA_B, ptoVta: 5, numero: 40, fecha: '2026-10-10' }, receptor: { docTipo: DOC.SIN_IDENTIFICAR, docNro: 0 } })
    expect(estado.filas[0]).toMatchObject({ tipo: CBTE.NC_B, pto_vta: 5, asociado_id: FACTURA.id, estado: 'autorizada' })
    const otra = await notaDeCredito({ facturaId: FACTURA.id, usuario: 'Bruno' })
    expect(otra).toMatchObject({ status: 409, error: 'La venta ya tiene nota de crédito' })
    expect(estado.pedidos).toHaveLength(1)
  })

  it('🔴 con una NC PARCIAL previa (la de un cambio) sale por lo que QUEDA; acreditada entera, ⛔ sale', async () => {
    const { notaDeCredito } = await import('../api/_erp.js')
    estado.filas = [{ id: 'nc-cambio', venta_id: 'uuid-del-cambio', tipo: CBTE.NC_B, total: '8500.00', asociado_id: FACTURA.id, estado: 'autorizada' }]
    const r = await notaDeCredito({ facturaId: FACTURA.id, usuario: 'x' })
    expect(r).toMatchObject({ autorizada: { total: 3600 } })
    expect(estado.pedidos[0]).toMatchObject({ total: 3600, ventaId: '555' })
    estado.filas = [{ id: 'nc-cambio', venta_id: 'uuid-del-cambio', tipo: CBTE.NC_B, total: '12100.00', asociado_id: FACTURA.id, estado: 'autorizada' }]
    expect(await notaDeCredito({ facturaId: FACTURA.id, usuario: 'x' })).toMatchObject({ status: 409, error: expect.stringMatching(/acreditada entera/) })
    expect(estado.pedidos).toHaveLength(1)
  })

  it('⛔ sobre una NC, una factura sin CAE ni otro ambiente', async () => {
    const { notaDeCredito } = await import('../api/_erp.js')
    estado.factura = { ...FACTURA, tipo: CBTE.NC_B }
    expect(await notaDeCredito({ facturaId: FACTURA.id, usuario: 'x' })).toMatchObject({ status: 409 })
    estado.factura = { ...FACTURA, estado: 'rechazada' }
    expect(await notaDeCredito({ facturaId: FACTURA.id, usuario: 'x' })).toMatchObject({ status: 409 })
    estado.factura = { ...FACTURA, ambiente: 'produccion' }
    expect(await notaDeCredito({ facturaId: FACTURA.id, usuario: 'x' })).toMatchObject({ status: 404 })
    expect(await notaDeCredito({ facturaId: 'x', usuario: 'x' })).toMatchObject({ status: 400 })
    expect(estado.pedidos).toHaveLength(0)
  })
})
