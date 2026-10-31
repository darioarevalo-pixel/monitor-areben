/**
 * «Facturar» desde la HOJA DEL PEDIDO (mayoristas, Darío §5): la factura ENTERA de la venta del pedido, a la FICHA del pedido.
 * El oráculo: la fila que reserva el lote sale `clase: 'venta'` con el `cliente_id` de la ficha (así aparece en «Facturas» de la
 * tarjeta y se manda por mail), A con el CUIT de la ficha, por el TOTAL de la venta; y ⛔ se guarda otra ficha (las de GN
 * vienen sin documento). Y «Facturado ✓ / $X de $Y» de la hoja (`facturacionDelPedido`).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { facturarPedidoPanel } from '../api/_erp-factura-mayorista.js'
import { facturacionDelPedido } from '../lib/erp/factura-mayorista.core.js'

const CUIT = '30718508181'
const PEDIDO = '0b5e7a52-6d1c-4b8e-9a51-2f6c7d8e9f10'
const VENTA = '0b5e7a52-6d1c-4b8e-9a51-2f6c7d8e9f11'
const CLIENTE = '0b5e7a52-6d1c-4b8e-9a51-2f6c7d8e9f12'
const venta = { id: VENTA, estado: 'confirmada', tipo: 'venta', total: 84000, prueba: false, marca: 'bdi', empresa_id: 'e1', facturas: [], lineas: [], ocurrida_en: '2026-10-31T15:00:00Z', detalle: {} }
const pedido = { id: PEDIDO, numero: 12, venta_id: VENTA, cliente_id: CLIENTE, anulado_en: null, total: 84000, etapa: 'preparado' }

function arcaFalso() {
  const emitidos: Array<{ total: number; docNro: number; tipo?: number }> = []
  return {
    emitidos,
    async ultimo() { return emitidos.length },
    async solicitar({ comprobantes }: { desde: number; comprobantes: Array<{ total: number; receptor: { docNro: number } }> }) {
      const detalles = comprobantes.map((c) => { emitidos.push({ total: c.total, docNro: Number(c.receptor.docNro) }); return { numero: emitidos.length, resultado: 'A', cae: '7' + emitidos.length, caeVence: '2026-11-10', observaciones: [] } })
      return { resultado: 'A', errores: [], detalles }
    },
    async consultar() { return null },
  }
}
function repoFalso() {
  const filas: Array<Record<string, unknown>> = []
  return {
    filas,
    async tomarCandado() { return true }, async soltarCandado() {},
    async reservadas() { return [] },
    async ventasFacturadas() { return new Set<string>() },
    async reservar(n: Array<Record<string, unknown>>) { filas.push(...n.map((f) => ({ ...f }))) },
    async resolver(id: string, cambios: Record<string, unknown>) { const f = filas.find((x) => x.id === id); if (f) Object.assign(f, cambios) },
  }
}
function pgFalso(ficha: Record<string, unknown>, sqls: string[]) {
  return {
    async query(sql: string) {
      sqls.push(sql)
      if (/from cliente where id/.test(sql)) return { rows: [ficha] }
      if (/from venta_ficha/.test(sql)) return { rows: [venta] }
      return { rows: [] }
    },
  }
}
const correr = (ficha: Record<string, unknown>, body: Record<string, unknown>, extra: Record<string, unknown> = {}) => {
  const arca = arcaFalso(), repo = repoFalso(), sqls: string[] = []
  const pg = pgFalso(ficha, sqls)
  const r = facturarPedidoPanel({ body: { pedidoId: PEDIDO, ...body }, usuario: 'test' }, {
    conMotor: (_m: string, _q: string, fn: (pg: unknown) => unknown) => fn(pg), prendido: true, escribir: true,
    arca, repo, sb: {}, b: {}, leerPedido: async () => ({ ok: true, pedido }), buscarFactura: async () => null, tienePartes: async () => false,
    ...extra,
  })
  return { r, arca, repo, sqls }
}

let ambienteAntes: string | undefined
beforeEach(() => { ambienteAntes = process.env.ARCA_AMBIENTE; process.env.ARCA_AMBIENTE = 'homologacion' })
afterEach(() => { if (ambienteAntes === undefined) delete process.env.ARCA_AMBIENTE; else process.env.ARCA_AMBIENTE = ambienteAntes })

describe('facturarPedidoPanel', () => {
  it('ficha RI completa ⇒ A al CUIT de la ficha, por el total de la venta, fila clase venta + cliente_id, ⛔ otra ficha', async () => {
    const { r, arca, repo, sqls } = correr({ id: CLIENTE, empresa_id: 'e1', doc: CUIT, nombre: 'X', razon_social: 'X SA', condicion_iva: 1, domicilio: 'Rosario' }, {})
    const out = await r
    expect(out).toMatchObject({ ok: true, factura: { clase: 'venta', tipo: 1, total: 84000, receptor_nombre: 'X SA' } })
    expect(arca.emitidos).toEqual([{ total: 84000, docNro: Number(CUIT) }])
    expect(repo.filas[0]).toMatchObject({ clase: 'venta', cliente_id: CLIENTE, venta_id: VENTA, tipo: 1 })
    expect(sqls.some((s) => /insert into cliente\b/i.test(s))).toBe(false)
  })
  it('ficha sin condición ⇒ 409 con falta, y ARCA ni se entera', async () => {
    const { r, arca } = correr({ id: CLIENTE, empresa_id: 'e1', doc: null, nombre: 'X' }, {})
    expect(await r).toMatchObject({ status: 409, falta: true })
    expect(arca.emitidos).toEqual([])
  })
  it('pedido anulado o sin entrar ⇒ 409 sin facturar', async () => {
    const ficha = { id: CLIENTE, empresa_id: 'e1', doc: CUIT, razon_social: 'X SA', condicion_iva: 1, domicilio: 'Rosario' }
    const a = correr(ficha, {}, { leerPedido: async () => ({ ok: true, pedido: { ...pedido, anulado_en: '2026-10-31' } }) })
    expect(await a.r).toMatchObject({ status: 409, error: expect.stringMatching(/anulado/) })
    const b = correr(ficha, {}, { leerPedido: async () => ({ ok: true, pedido: { ...pedido, venta_id: null } }) })
    expect(await b.r).toMatchObject({ status: 409 })
    expect([...a.arca.emitidos, ...b.arca.emitidos]).toEqual([])
  })
  it('la venta ya se factura por partes ⇒ frena con el motivo', async () => {
    const { r, arca } = correr({ id: CLIENTE, empresa_id: 'e1', doc: CUIT, razon_social: 'X SA', condicion_iva: 1, domicilio: 'Rosario' }, {}, { tienePartes: async () => true })
    expect(await r).toMatchObject({ status: 409, error: expect.stringMatching(/por partes/) })
    expect(arca.emitidos).toEqual([])
  })
  it('llave de escribir apagada ⇒ 409 antes de leer nada', async () => {
    const { r, sqls } = correr({}, {}, { escribir: false })
    expect(await r).toMatchObject({ status: 409 })
    expect(sqls).toEqual([])
  })
})

describe('facturacionDelPedido («Facturado ✓» de la hoja)', () => {
  it('sin facturas ⇒ queda todo', () => {
    expect(facturacionDelPedido([], 84000)).toEqual({ entera: null, partes: 0, total: 84000, facturado: 0, queda: 0 + 84000 })
  })
  it('la entera viva ⇒ Facturado ✓ con su número', () => {
    const r = facturacionDelPedido([{ id: 'f1', tipo: 1, clase: 'venta', total: 84000, pto_vta: 2, numero: 9 }], 84000)
    expect(r.entera).toMatchObject({ id: 'f1', tipo: 1, pto_vta: 2, numero: 9 })
    expect(r.queda).toBe(0)
  })
  it('la entera anulada por NC ⛔ cuenta (y una ND ⛔ es NC)', () => {
    expect(facturacionDelPedido([{ id: 'f1', tipo: 6, clase: 'venta', total: 84000 }, { id: 'n1', tipo: 8, total: 84000, asociado_id: 'f1' }], 84000).entera).toBeNull()
    expect(facturacionDelPedido([{ id: 'f1', tipo: 6, clase: null, total: 84000 }, { id: 'd1', tipo: 7, total: 100, asociado_id: 'f1' }], 84000).entera).not.toBeNull()
  })
  it('partes ⇒ Facturado $X de $Y, con lo acreditado por NC devuelto', () => {
    const r = facturacionDelPedido([
      { id: 'p1', tipo: 1, clase: 'parte', total: 30000 }, { id: 'p2', tipo: 1, clase: 'parte', total: 10000 },
      { id: 'n2', tipo: 3, total: 4000, asociado_id: 'p2' },
    ], 84000)
    expect(r).toEqual({ entera: null, partes: 2, total: 84000, facturado: 36000, queda: 48000 })
  })
})
