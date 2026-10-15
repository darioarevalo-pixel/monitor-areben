/**
 * La factura a pedido de `erp › Caja`. Lo que no se ve si falla: una factura A sin CUIT que llega a ARCA, la
 * misma venta facturada dos veces (por la Caja con el uuid y por la masiva con el id de GN), una venta de
 * prueba facturada en producción, o un PDF cuyos renglones ⛔ suman lo facturado.
 */
import { describe, it, expect } from 'vitest'
import { armarFacturaDelCambio, claveDeFactura, clavesDeFactura, distintaDeLaPedida, leerFacturar, mesDeVenta, opcionDeCondicion, puedeFacturar, puedeFacturarCambio, puedeHacerNC, renglonesDeVenta } from '../lib/erp/factura.core.js'
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
  it('A pide CUIT válido, condición y razón social', () => {
    const rs = { razonSocial: 'Moda Sur SRL' }
    expect(leerFacturar({ ventaId: ID, clase: 'A', doc: CUIT, condicion: 'ri', ...rs })).toMatchObject({ tipo: CBTE.FACTURA_A, receptor: { docTipo: DOC.CUIT, condicionIva: COND_IVA.RESPONSABLE_INSCRIPTO } })
    expect(leerFacturar({ ventaId: ID, clase: 'A', doc: CUIT, condicion: 'monotributo', ...rs }).receptor?.condicionIva).toBe(COND_IVA.MONOTRIBUTO)
    expect(leerFacturar({ ventaId: ID, clase: 'A', doc: '30123456', condicion: 'ri', ...rs }).error).toBeTruthy()
    expect(leerFacturar({ ventaId: ID, clase: 'A', doc: '30718508182', condicion: 'ri', ...rs }).error).toBeTruthy()
    expect(leerFacturar({ ventaId: ID, clase: 'A', doc: CUIT, ...rs }).error).toBeTruthy()
  })
  it('A sin razón social ⛔ sale: es el nombre de la ficha y va impreso', () => {
    expect(leerFacturar({ ventaId: ID, clase: 'A', doc: CUIT, condicion: 'ri' }).error).toMatch(/razón social/)
    expect(leerFacturar({ ventaId: ID, clase: 'A', doc: CUIT, condicion: 'ri', razonSocial: '   ' }).error).toMatch(/razón social/)
  })
  it('A devuelve la ficha a guardar, con espacios limpios y el domicilio opcional', () => {
    expect(leerFacturar({ ventaId: ID, clase: 'A', doc: CUIT, condicion: 'ri', razonSocial: '  Moda   Sur SRL ', domicilio: ' Av. Rivadavia  1234 ' }).cliente)
      .toEqual({ razonSocial: 'Moda Sur SRL', domicilio: 'Av. Rivadavia 1234' })
    expect(leerFacturar({ ventaId: ID, clase: 'A', doc: CUIT, condicion: 'ri', razonSocial: 'Moda Sur SRL' }).cliente).toEqual({ razonSocial: 'Moda Sur SRL', domicilio: '' })
    expect(leerFacturar({ ventaId: ID, doc: '30123456' }).cliente).toBeUndefined()
  })
  it('la condición de la ficha vuelve a la opción de la pantalla', () => {
    expect(opcionDeCondicion(COND_IVA.RESPONSABLE_INSCRIPTO)).toBe('ri')
    expect(opcionDeCondicion(COND_IVA.MONOTRIBUTO)).toBe('monotributo')
    expect(opcionDeCondicion(COND_IVA.CONSUMIDOR_FINAL)).toBeNull()
    expect(opcionDeCondicion(null)).toBeNull()
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
    expect(r.reduce((a: number, x: { importe: number }) => a + x.importe, 0)).toBe(25500)
  })
  it('sin nombre usa el SKU; sin diferencia, sin renglón extra', () => {
    expect(renglonesDeVenta({ total: 100, lineas: [{ product_id: 2, size_id: 1, cantidad: 1, importe: 100, sku: 'ABC' }] })).toEqual([{ descripcion: 'ABC', cantidad: 1, unitario: 100, importe: 100 }])
  })
})

describe('puedeHacerNC', () => {
  it('sólo una venta ANULADA con factura (una NC atada puede ser la parcial de un cambio: lo decide notaDeCredito)', () => {
    expect(puedeHacerNC({ estado: 'anulada', facturas: [{ tipo: 'factura' }] })).toBeNull()
    expect(puedeHacerNC({ estado: 'confirmada', facturas: [{ tipo: 'factura' }] })).toMatch(/anula/)
    expect(puedeHacerNC({ estado: 'anulada', facturas: [] })).toMatch(/no tiene factura/)
    expect(puedeHacerNC({ estado: 'anulada', facturas: [{ tipo: 'factura' }, { tipo: 'nc' }] })).toBeNull()
  })
})

describe('clavesDeFactura y distintaDeLaPedida', () => {
  it('busca por la de GN del detalle, la de la columna y el uuid, sin repetir', () => {
    expect(clavesDeFactura({ id: ID, gn_sale_id: 5, detalle: { gn_sale_id: 7 } })).toEqual(['7', '5', ID])
    expect(clavesDeFactura({ id: ID, gn_sale_id: 7, detalle: { gn_sale_id: 7 } })).toEqual(['7', ID])
    expect(clavesDeFactura({ id: ID })).toEqual([ID])
  })
  it('la misma clase y receptor ⇒ la misma; otra ⇒ dice cuál tiene y que va con NC', () => {
    const ya = { tipo: 6, doc_tipo: 99, doc_nro: 0, pto_vta: 1, numero: 16 }
    expect(distintaDeLaPedida(ya, leerFacturar({ ventaId: ID }) as never)).toBeNull()
    expect(distintaDeLaPedida(ya, leerFacturar({ ventaId: ID, clase: 'A', doc: CUIT, condicion: 'ri' }) as never)).toMatch(/factura B 1-16 \(sin identificar\).*nota de crédito/)
    expect(distintaDeLaPedida(ya, leerFacturar({ ventaId: ID, doc: '30123456' }) as never)).toBeTruthy()
  })
})

describe('el CAMBIO facturado: NC por lo devuelto + factura por lo nuevo', () => {
  // La original: 2 prendas por $25.500, cobradas en efectivo con 15 % ⇒ $21.675 facturados (k = 0,85).
  const original = { subtotal: 25500, total: 21675 }
  const facturaOriginal = { total: 21675, estado: 'autorizada', ambiente: 'homologacion' }
  const dev = (importe: number, n = 1) => ({ product_id: 1, size_id: 1, cantidad: -n, importe: -importe })
  const nueva = (importe: number, n = 1) => ({ product_id: 2, size_id: 1, cantidad: n, importe })
  const suma = (r: Array<{ importe: number }>) => Math.round(r.reduce((a, x) => a + x.importe * 100, 0)) / 100

  it('a pagar: lo devuelto al valor FACTURADO, lo nuevo = el crédito usado + lo cobrado hoy', () => {
    // Devuelve $10.000, se lleva $12.000: diferencia $2.000, en efectivo con 15 % ⇒ cobró $1.700.
    const r = armarFacturaDelCambio({ cambio: { total: 1700, lineas: [dev(10000), nueva(12000)] }, original, facturaOriginal })
    if ('error' in r) throw new Error(r.error)
    expect(r.nc?.total).toBe(8500)
    expect(r.factura?.total).toBe(10200)
    // Lo facturado neto = lo que entró de plata: 21.675 − 8.500 + 10.200 = 21.675 + 1.700.
    expect(21675 - (r.nc?.total ?? 0) + (r.factura?.total ?? 0)).toBe(21675 + 1700)
    expect(suma(r.nc!.renglones)).toBe(8500)
    expect(suma(r.factura!.renglones)).toBe(10200)
    expect(r.nc!.renglones[0]).toMatchObject({ cantidad: 1, importe: 10000 })
    expect(r.nc!.renglones.at(-1)).toMatchObject({ descripcion: 'Descuento', importe: -1500 })
  })
  it('a favor: lo nuevo hasta lo devuelto; lo que sobra ⛔ entra en la factura (queda como saldo)', () => {
    const r = armarFacturaDelCambio({ cambio: { total: 0, lineas: [dev(15500), nueva(10000)] }, original, facturaOriginal })
    if ('error' in r) throw new Error(r.error)
    expect([r.nc?.total, r.factura?.total]).toEqual([13175, 8500])
  })
  it('sólo devuelve (sin nada nuevo): NC y ninguna factura', () => {
    const r = armarFacturaDelCambio({ cambio: { total: 0, lineas: [dev(10000)] }, original, facturaOriginal })
    if ('error' in r) throw new Error(r.error)
    expect(r.nc?.total).toBe(8500)
    expect(r.factura).toBeNull()
  })
  it('sin descuento en la original, k = 1', () => {
    const r = armarFacturaDelCambio({ cambio: { total: 2000, lineas: [dev(10000), nueva(12000)] }, original: { subtotal: 25500, total: 25500 }, facturaOriginal: { total: 25500 } })
    if ('error' in r) throw new Error(r.error)
    expect([r.nc?.total, r.factura?.total]).toEqual([10000, 12000])
  })
  it('🔴 nunca acredita más de lo que a la factura original le queda (otro cambio ya devolvió)', () => {
    // Devolver $15.500 acredita $13.175: con $8.500 ya acreditados queda JUSTO eso (pasa); un centavo más, ⛔.
    const devolver = (acreditado: number) => armarFacturaDelCambio({ cambio: { total: 0, lineas: [dev(15500)] }, original, facturaOriginal, acreditado })
    expect(devolver(8500)).toMatchObject({ nc: { total: 13175 } })
    const r = devolver(8500.01)
    expect('error' in r ? r.error : '').toMatch(/le queda sin acreditar \(\$13174\.99\)/)
  })
  it('puedeFacturarCambio: sólo un cambio confirmado, con factura en la original, y ⛔ de prueba en producción', () => {
    const c = { tipo: 'cambio', estado: 'confirmada', prueba: true }
    const ok = { ambiente: 'homologacion', facturaOriginal }
    expect(puedeFacturarCambio(c, original, ok)).toBeNull()
    expect(puedeFacturarCambio({ ...c, tipo: 'venta' }, original, ok)).toMatch(/no es un cambio/)
    expect(puedeFacturarCambio({ ...c, estado: 'anulada' }, original, ok)).toMatch(/anulado/)
    expect(puedeFacturarCambio(c, original, { ambiente: 'homologacion', facturaOriginal: null })).toMatch(/original no tiene factura/)
    expect(puedeFacturarCambio(c, original, { ambiente: 'produccion', facturaOriginal: { ...facturaOriginal, ambiente: 'produccion' } })).toMatch(/PRUEBA/)
    expect(puedeFacturarCambio(c, original, { ambiente: 'produccion', facturaOriginal })).toMatch(/PRUEBA/)
    expect(puedeFacturarCambio({ ...c, prueba: false }, original, { ambiente: 'produccion', facturaOriginal })).toMatch(/no está autorizada en este ambiente/)
  })
})
