/**
 * Buscador y ficha de la venta propia (`erp › Ventas`). Lo que no se ve si falla: un número de venta
 * que se busca como cliente, el último día del rango que queda afuera, una devuelta que se lee como
 * vendida, o un anular sin motivo que llega al motor.
 */
import { describe, it, expect } from 'vitest'
import { armarFicha, cambiadasDe, diferenciaDeCambio, leerAnular, leerBusqueda, leerCambiar, puedeAnular, rangoDeDias } from '../lib/erp/venta.core.js'

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

describe('el cambio (erp › Caja)', () => {
  const L1 = '11111111-1111-4111-8111-111111111111'
  const L2 = '22222222-2222-4222-8222-222222222222'
  const id = '33333333-3333-4333-8333-333333333333'
  const venta = '44444444-4444-4444-8444-444444444444'
  const lineas = [{ id: L1, cantidad: 2, importe: 30000 }, { id: L2, cantidad: 1, importe: 9000 }]

  it('la diferencia: lo devuelto al precio que se PAGÓ (por unidad), lo nuevo con su importe', () => {
    expect(diferenciaDeCambio({ lineas, devueltas: [{ lineaId: L1, cantidad: 1 }], nuevas: [{ importe: 20000 }] })).toBe(5000)
    expect(diferenciaDeCambio({ lineas, devueltas: [{ lineaId: L1, cantidad: 2 }], nuevas: [{ importe: 20000 }] })).toBe(-10000)
    expect(diferenciaDeCambio({ lineas, devueltas: [{ lineaId: L2, cantidad: 1 }], nuevas: [{ importe: 9000 }] })).toBe(0)
  })

  it('lo ya cambiado sale de las líneas negativas de los cambios', () => {
    const m = cambiadasDe([{ linea_origen_id: L1, cantidad: -1 }, { linea_origen_id: L1, cantidad: -1 }, { linea_origen_id: null, cantidad: 1 }])
    expect(m.get(L1)).toBe(2)
    expect(armarFicha({ id: venta, numero: 1, lineas: [{ id: L1, product_id: 1, size_id: 2, cantidad: 2, precio: 15000, importe: 30000 }], pagos: [] }, { cambiadas: m }).lineas[0].cambiado).toBe(2)
  })

  it('valida lo que manda la pantalla y arma lo nuevo con `renglones` de la Caja', () => {
    expect(leerCambiar({ ventaId: venta, devueltas: [{ lineaId: L1, cantidad: 1 }] }).error).toMatch(/número del cambio/)
    expect(leerCambiar({ id, ventaId: venta, devueltas: [] }).error).toMatch(/devuelve/)
    expect(leerCambiar({ id, ventaId: venta, devueltas: [{ lineaId: L1, cantidad: 0 }] }).error).toBeTruthy()
    expect(leerCambiar({ id, ventaId: venta, devueltas: [{ lineaId: L1, cantidad: 1 }], items: [{ product_id: 5, size_id: 6, cantidad: 1, precio: 0 }] }).error).toMatch(/precio/)
    expect(leerCambiar({ id, ventaId: venta, devueltas: [{ lineaId: L1, cantidad: 1 }], pagos: [{ cuenta: 'x', monto: 1 }] }).error).toBe('Pago inválido')
    const ok = leerCambiar({ id, ventaId: venta, devueltas: [{ lineaId: L1, cantidad: 1 }], items: [{ product_id: 5, size_id: 6, cantidad: 1, precio: 20000, sku: 'Z-1' }], pagos: [{ cuenta: 12921, monto: 5000 }] })
    expect(ok).toEqual({ id, ventaId: venta, devueltas: [{ linea_id: L1, cantidad: 1 }], nuevas: [{ product_id: 5, size_id: 6, cantidad: 1, precio: 20000, descuento: 0, rebaja: 0, importe: 20000, sku: 'Z-1' }], pagos: [{ cuenta: 12921, monto: 5000 }] })
  })
})
