/**
 * Buscador y ficha de la venta propia (`erp › Ventas`). Lo que no se ve si falla: un número de venta
 * que se busca como cliente, el último día del rango que queda afuera, una devuelta que se lee como
 * vendida, o un anular sin motivo que llega al motor.
 */
import { describe, it, expect } from 'vitest'
import { armarFicha, leerAnular, leerBusqueda, puedeAnular, rangoDeDias } from '../lib/erp/venta.core.js'

describe('leerBusqueda', () => {
  it('un número (con o sin #) es el número de venta; texto es cliente', () => {
    expect(leerBusqueda({ q: '#123' })).toMatchObject({ numero: 123, cliente: null })
    expect(leerBusqueda({ q: ' 7 ' })).toMatchObject({ numero: 7 })
    expect(leerBusqueda({ q: 'Pérez, Ana' })).toMatchObject({ numero: null, cliente: 'Pérez  Ana' })
    expect(leerBusqueda({ q: '' })).toMatchObject({ numero: null, cliente: null })
  })
  it('frena lo corto y las fechas que no son fechas o están al revés', () => {
    expect(leerBusqueda({ q: 'an' }).error).toBeTruthy()
    expect(leerBusqueda({ desde: '14/10/2026' }).error).toBeTruthy()
    expect(leerBusqueda({ desde: '2026-10-15', hasta: '2026-10-14' }).error).toBeTruthy()
  })
})

describe('rangoDeDias', () => {
  it('es el día argentino y «hasta» incluye el día entero', () => {
    expect(rangoDeDias('2026-10-14', '2026-10-14')).toEqual({ desde: '2026-10-14T03:00:00.000Z', hasta: '2026-10-15T03:00:00.000Z' })
    expect(rangoDeDias(null, null)).toEqual({ desde: null, hasta: null })
  })
})

const fila = (extra = {}) => ({
  id: 'v1', numero: '3', marca: 'zattia', tipo: 'venta', estado: 'confirmada', origen: 'caja', canal: 'local', deposito: 'local',
  subtotal: '70000', total: '70000', prueba: true, ocurrida_en: '2026-10-14T15:00:00Z', registrada_en: '2026-10-14T15:00:01Z',
  usuario: 'cajera', origen_ref: 'caja-1', gn_sale_id: null, venta_original_id: null, cliente: null, tiene_cambio: false,
  lineas: [
    { id: 'l1', n: 1, product_id: 1, size_id: 10, sku: 'A1', cantidad: 2, precio: '30000', descuento: '0', rebaja: '0', importe: '60000', linea_origen_id: null },
    { id: 'l2', n: 2, product_id: 2, size_id: 10, sku: null, cantidad: -1, precio: '10000', descuento: '0', rebaja: '0', importe: '-10000', linea_origen_id: 'x' },
  ],
  pagos: [{ cuenta: 'Efectivo', medio: 'efectivo', monto: '70000', base: '70000', porcentaje: '0' }],
  anulacion: null, facturas: [],
  ...extra,
})

describe('armarFicha', () => {
  it('pone el nombre de cada prenda, marca la devuelta y pasa los números a número', () => {
    const f = armarFicha(fila(), { nombres: new Map([['1/10', { nombre: 'Remera', talle: 'M' }]]) })
    expect(f.venta).toMatchObject({ numero: 3, total: 70000, prueba: true })
    expect(f.lineas[0]).toMatchObject({ nombre: 'Remera', talleNombre: 'M', cantidad: 2, importe: 60000, devuelta: false })
    expect(f.lineas[1]).toMatchObject({ nombre: null, devuelta: true, importe: -10000 })
    expect(f.pagos[0]).toMatchObject({ cuenta: 'Efectivo', monto: 70000 })
    expect(f.facturada).toBe(false)
    expect(f.puedeAnular).toBeNull()
  })
  it('una nota de crédito sola ⛔ es «facturada»', () => {
    expect(armarFicha(fila({ facturas: [{ factura_id: 'f', tipo: 'nc' }] })).facturada).toBe(false)
    expect(armarFicha(fila({ facturas: [{ factura_id: 'f', tipo: 'factura' }] })).facturada).toBe(true)
  })
})

describe('anular', () => {
  it('⛔ se ofrece si ya está anulada o tiene un cambio', () => {
    expect(puedeAnular({ estado: 'anulada' })).toBeTruthy()
    expect(puedeAnular({ estado: 'confirmada', tiene_cambio: true })).toBeTruthy()
    expect(puedeAnular({ estado: 'confirmada', tiene_cambio: false })).toBeNull()
  })
  it('pide motivo de verdad y un id de venta', () => {
    const id = '0b6f1c0e-1111-4222-8333-944455556666'
    expect(leerAnular({ ventaId: id, motivo: '  x ' }).error).toBeTruthy()
    expect(leerAnular({ ventaId: 'v1', motivo: 'se equivocó de talle' }).error).toBeTruthy()
    expect(leerAnular({ ventaId: id, motivo: ' se equivocó de talle ' })).toEqual({ ventaId: id, motivo: 'se equivocó de talle' })
  })
})
