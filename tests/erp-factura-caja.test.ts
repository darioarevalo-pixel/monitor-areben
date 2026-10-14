/**
 * La factura a pedido de `erp › Caja`. Lo que no se ve si falla: una factura A sin CUIT que llega a ARCA, la
 * misma venta facturada dos veces (por la Caja con el uuid y por la masiva con el id de GN), una venta de
 * prueba facturada en producción, o un PDF cuyos renglones ⛔ suman lo facturado.
 */
import { describe, it, expect } from 'vitest'
import { claveDeFactura, leerFacturar, mesDeVenta, puedeFacturar, renglonesDeVenta } from '../lib/erp/factura.core.js'
import { CBTE, COND_IVA, DOC } from '../motor/arca/arca.core.js'

const ID = '0b5e7a52-6d1c-4b8e-9a51-2f6c7d8e9f01'
const CUIT = '30718508181' // el de Areben: válido

describe('leerFacturar', () => {
  it('B sin documento = consumidor final sin identificar', () => {
    expect(leerFacturar({ ventaId: ID })).toEqual({ ventaId: ID, tipo: CBTE.FACTURA_B, receptor: { docTipo: DOC.SIN_IDENTIFICAR, docNro: 0, condicionIva: COND_IVA.CONSUMIDOR_FINAL } })
  })
  it('B con DNI (con puntos) o con CUIT', () => {
    expect(leerFacturar({ ventaId: ID, clase: 'b', doc: '30.123.456' }).receptor).toEqual({ docTipo: DOC.DNI, docNro: 30123456, condicionIva: COND_IVA.CONSUMIDOR_FINAL })
    expect(leerFacturar({ ventaId: ID, doc: '30-71850818-1' }).receptor).toMatchObject({ docTipo: DOC.CUIT, docNro: 30718508181 })
  })
  it('A pide CUIT válido y condición', () => {
    expect(leerFacturar({ ventaId: ID, clase: 'A', doc: CUIT, condicion: 'ri' })).toMatchObject({ tipo: CBTE.FACTURA_A, receptor: { docTipo: DOC.CUIT, condicionIva: COND_IVA.RESPONSABLE_INSCRIPTO } })
    expect(leerFacturar({ ventaId: ID, clase: 'A', doc: CUIT, condicion: 'monotributo' }).receptor?.condicionIva).toBe(COND_IVA.MONOTRIBUTO)
    expect(leerFacturar({ ventaId: ID, clase: 'A', doc: '30123456', condicion: 'ri' }).error).toBeTruthy()
    expect(leerFacturar({ ventaId: ID, clase: 'A', doc: '30718508182', condicion: 'ri' }).error).toBeTruthy()
    expect(leerFacturar({ ventaId: ID, clase: 'A', doc: CUIT }).error).toBeTruthy()
  })
  it('frena la venta inválida, la clase C y un documento de largo raro', () => {
    expect(leerFacturar({ ventaId: '123' }).error).toBeTruthy()
    expect(leerFacturar({ ventaId: ID, clase: 'C' }).error).toBeTruthy()
    expect(leerFacturar({ ventaId: ID, doc: '123456789' }).error).toBeTruthy()
    expect(leerFacturar({ ventaId: ID, doc: '30718508182' }).error).toBeTruthy()
  })
})

describe('claveDeFactura', () => {
  it('la venta de GN si la hay (la masiva la ve con ese id), si no el uuid del motor', () => {
    expect(claveDeFactura({ id: ID, detalle: { gn_sale_id: 987654 } })).toBe('987654')
    expect(claveDeFactura({ id: ID, gn_sale_id: 55, detalle: {} })).toBe('55')
    expect(claveDeFactura({ id: ID, detalle: { gn_sale_id: null } })).toBe(ID)
    expect(claveDeFactura({ id: ID })).toBe(ID)
  })
})

describe('mesDeVenta', () => {
  it('es el mes argentino: las 23 h del 31 siguen siendo ese mes', () => {
    expect(mesDeVenta('2026-11-01T02:30:00.000Z')).toBe('2026-10')
    expect(mesDeVenta('2026-11-01T03:00:00.000Z')).toBe('2026-11')
  })
})

describe('puedeFacturar', () => {
  const v = { estado: 'confirmada', tipo: 'venta', total: 1000, prueba: true }
  it('una venta de prueba sale en homologación y ⛔ en producción', () => {
    expect(puedeFacturar(v, { ambiente: 'homologacion', facturada: false })).toBeNull()
    expect(puedeFacturar(v, { ambiente: 'produccion', facturada: false })).toMatch(/PRUEBA/)
    expect(puedeFacturar({ ...v, prueba: false }, { ambiente: 'produccion', facturada: false })).toBeNull()
  })
  it('frena la anulada, el cambio, la de $0 y la ya facturada', () => {
    const h = { ambiente: 'homologacion', facturada: false }
    expect(puedeFacturar(null, h)).toMatch(/no existe/)
    expect(puedeFacturar({ ...v, estado: 'anulada' }, h)).toMatch(/anulada/)
    expect(puedeFacturar({ ...v, tipo: 'cambio' }, h)).toMatch(/cambio/i)
    expect(puedeFacturar({ ...v, total: 0 }, h)).toMatch(/importe/)
    expect(puedeFacturar(v, { ...h, facturada: true })).toBe('La venta ya tiene factura.')
  })
})

describe('renglonesDeVenta', () => {
  const nombres = new Map([['1/10', { nombre: 'Remera', talle: 'M' }]])
  it('las prendas y el descuento de la forma de pago aparte: suman lo facturado', () => {
    const r = renglonesDeVenta({ total: 25500, lineas: [{ product_id: 1, size_id: 10, cantidad: 2, importe: 30000 }] }, nombres)
    expect(r).toEqual([
      { descripcion: 'Remera - M', cantidad: 2, unitario: 15000, importe: 30000 },
      { descripcion: 'Descuento', cantidad: 1, unitario: -4500, importe: -4500 },
    ])
    expect(r.reduce((a, x) => a + x.importe, 0)).toBe(25500)
  })
  it('sin nombre usa el SKU; sin diferencia, sin renglón extra', () => {
    expect(renglonesDeVenta({ total: 100, lineas: [{ product_id: 2, size_id: 1, cantidad: 1, importe: 100, sku: 'ABC' }] })).toEqual([{ descripcion: 'ABC', cantidad: 1, unitario: 100, importe: 100 }])
  })
})
