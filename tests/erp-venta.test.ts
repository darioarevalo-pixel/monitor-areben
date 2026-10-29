/**
 * Buscador y ficha de la venta propia (`erp › Ventas`). Lo que no se ve si falla: un número de venta
 * que se busca como cliente, el último día del rango que queda afuera, una devuelta que se lee como
 * vendida, o un anular sin motivo que llega al motor.
 */
import { describe, it, expect } from 'vitest'
import { armarFicha, cambiadasDe, estaAcreditadaEntera, cobroDelCambio, diferenciaDeCambio, diferenciaDeCambioSuelto, leerAnular, leerBusqueda, leerCambiar, leerClienteCambio, listaEnGN, puedeAnular, rangoDeDias } from '../lib/erp/venta.core.js'
import { REGLAS_INICIALES } from '../lib/caja/core.core.js'

describe('leerBusqueda', () => {
  it('un número (con o sin #) es el número de venta; texto es cliente', () => {
    expect(leerBusqueda({ q: '#123' })).toMatchObject({ numero: 123, cliente: null })
    expect(leerBusqueda({ q: ' 7 ' })).toMatchObject({ numero: 7 })
    expect(leerBusqueda({ q: '30123456' })).toMatchObject({ numero: null, cliente: '30123456' })
    expect(leerBusqueda({ q: '#30123456' })).toMatchObject({ numero: 30123456 })
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
    expect(leerAnular({ ventaId: id, motivo: ' se equivocó de talle ', devolucion: { forma: 'plata' } })).toEqual({ ventaId: id, motivo: 'se equivocó de talle', devolucion: { forma: 'plata' }, cliente: null })
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
    expect(leerCambiar({ id, ventaId: venta, devueltas: [{ lineaId: L1, cantidad: 1 }], pagos: [{ cuenta: 'x' }] }).error).toBe('Pago inválido')
    const ok = leerCambiar({ id, ventaId: venta, devueltas: [{ lineaId: L1, cantidad: 1 }], items: [{ product_id: 5, size_id: 6, cantidad: 1, precio: 20000, sku: 'Z-1' }], pagos: [{ cuenta: 12921, monto: 5000 }], total: 4300 })
    expect(ok).toEqual({
      id, modo: 'erp', ventaId: venta, gnVentaId: null, pin: null, devueltas: [{ linea_id: L1, cantidad: 1 }], nuevas: [{ product_id: 5, size_id: 6, cantidad: 1, precio: 20000, descuento: 0, rebaja: 0, importe: 20000, sku: 'Z-1' }],
      pagos: [{ cuenta: 12921 }], total: 4300, desde: null, pago: null, comprobante: null, cliente: null, saldo: 0,
    })
    // Cambio SUELTO (Bruno, 27-oct): la venta de GN viaja por número y la prenda por producto y talle; el precio ⛔ (lo pone el servidor).
    const gn = leerCambiar({ id, gnVentaId: '30982', devueltas: [{ productId: 7, sizeId: 3, cantidad: 1, precio: 1 }], pagos: [] })
    expect([gn.modo, gn.ventaId, gn.gnVentaId, gn.devueltas]).toEqual(['gn', null, '30982', [{ product_id: 7, size_id: 3, cantidad: 1, sku: null }]])
    expect(leerCambiar({ id, gnVentaId: '30982x', devueltas: [{ productId: 7, sizeId: 3, cantidad: 1 }] }).error).toMatch(/Gestión Nube/)
    // Sin ticket: el precio lo pone la cajera y el PIN es obligatorio.
    expect(leerCambiar({ id, sinTicket: true, devueltas: [{ productId: 7, sizeId: 3, cantidad: 1, precio: 15000 }] }).error).toMatch(/PIN/)
    expect(leerCambiar({ id, sinTicket: true, devueltas: [{ productId: 7, sizeId: 3, cantidad: 1 }], pin: '1234', pinPersona: 'ana' }).error).toMatch(/precio/)
    const st = leerCambiar({ id, sinTicket: true, devueltas: [{ productId: 7, sizeId: 3, cantidad: 2, precio: 15000 }], pin: '1234', pinPersona: 'ana' })
    expect([st.modo, st.pin, st.devueltas[0].precio]).toEqual(['sin_ticket', { persona: 'ana', pin: '1234' }, 15000])
    expect(diferenciaDeCambioSuelto({ devueltas: st.devueltas, nuevas: [{ importe: 45000 }] })).toBe(15000)
    // 🔑 El cambio de GN es a precio de LISTA (Bruno, 28-oct): ⛔ el descuento del efectivo prorrateado (la #30970 volvía a
    // $11.700 con lista $12.990). Las devueltas de GN (cantidad < 0) no cuentan; sin `unit_price`, el total por unidad.
    expect(listaEnGN([{ product_id: 1, size_id: 2, quantity: 1, unit_price: 12990, total: 11700 }, { product_id: 3, size_id: 4, quantity: -1, unit_price: 9000, total: -9000 }]))
      .toEqual([{ product_id: 1, size_id: 2, cantidad: 1, precio: 12990 }])
    expect(listaEnGN([{ product_id: 1, size_id: 2, quantity: 2, unit_price: null, total: 30000 }])[0].precio).toBe(15000)
    // Varios pagos: la base viaja en todos menos el último (como la Caja); el monto de la pantalla ⛔ viaja.
    expect(leerCambiar({ id, ventaId: venta, devueltas: [{ lineaId: L1, cantidad: 1 }], pagos: [{ cuenta: 12921, base: 2000 }, { cuenta: 25188, base: 1 }] }).pagos).toEqual([{ cuenta: 12921, base: 2000 }, { cuenta: 25188 }])
  })

  it('la diferencia se cobra con el descuento de la forma de pago, como la Caja (Bruno, 14-oct)', () => {
    const R = REGLAS_INICIALES
    // Efectivo 15 %: 5000 − 750 = 4250, redondeado a 100 ⇒ 4300 (lo mismo que `cobro()` de la Caja).
    expect(cobroDelCambio({ diferencia: 5000, pagos: [{ cuenta: 12921 }], reglas: R, nuevas: [] }))
      .toEqual({ pagos: [{ cuenta: 12921, base: 5000, porcentaje: 15, descuento: 750, redondeo: 50, monto: 4300 }], total: 4300, espera: 0 })
    // Transferencia: el 10 % y se ESPERA el monto con descuento.
    expect(cobroDelCambio({ diferencia: 5000, pagos: [{ cuenta: 13015 }], reglas: R, nuevas: [] })).toMatchObject({ total: 4500, espera: 4500 })
    // Lo que queda a favor ⛔ se cobra.
    expect(cobroDelCambio({ diferencia: -10, pagos: [], reglas: R, nuevas: [] })).toEqual({ pagos: [], total: 0, espera: 0 })
    expect(() => cobroDelCambio({ diferencia: 5000, pagos: [], reglas: R, nuevas: [] })).toThrow(/forma de pago/)
    expect(() => cobroDelCambio({ diferencia: 5000, pagos: [{ cuenta: 999 }], reglas: R, nuevas: [] })).toThrow(/no es una forma de pago/)
    // Con saldo a favor: va primero, sin descuento; el resto con la forma de pago (Bruno, 14-oct).
    expect(cobroDelCambio({ diferencia: 5000, pagos: [{ cuenta: 12921 }], reglas: R, nuevas: [], saldo: 3000 }))
      .toEqual({ pagos: [{ cuenta: 'saldo', base: 3000, porcentaje: 0, descuento: 0, redondeo: 0, monto: 3000 }, { cuenta: 12921, base: 2000, porcentaje: 15, descuento: 300, redondeo: 0, monto: 1700 }], total: 4700, espera: 0 })
    // El saldo alcanza: ⛔ hace falta otra forma de pago, y ⛔ se usa más que la diferencia.
    expect(cobroDelCambio({ diferencia: 5000, pagos: [], reglas: R, nuevas: [], saldo: 9000 }))
      .toEqual({ pagos: [{ cuenta: 'saldo', base: 5000, porcentaje: 0, descuento: 0, redondeo: 0, monto: 5000 }], total: 5000, espera: 0 })
    // Una prenda de feria entre lo nuevo: ⛔ se cobra acá (precio final, cuenta propia; falta decidirlo).
    expect(() => cobroDelCambio({ diferencia: 5000, pagos: [{ cuenta: 12921 }], reglas: { ...R, feriaProductos: [{ id: 7, nombre: 'x' }] }, nuevas: [{ product_id: 7 }] })).toThrow(/oferta/)
  })

  it('la clienta del saldo a favor: DNI y nombre, o nada', () => {
    expect(leerCambiar({ id, ventaId: venta, devueltas: [{ lineaId: L1, cantidad: 1 }], saldo: 100 }).error).toMatch(/DNI/)
    expect(leerClienteCambio(null)).toBeNull()
    expect(leerClienteCambio({ doc: '', nombre: '' })).toBeNull()
    expect(leerClienteCambio({ doc: '30.123.456', nombre: 'Ana Pérez', whatsapp: '+54 9 11 5555-0000' })).toEqual({ doc: '30123456', nombre: 'Ana Pérez', whatsapp: '+5491155550000', email: null })
    expect(leerClienteCambio({ doc: '123', nombre: 'Ana' })?.error).toMatch(/DNI/)
    expect(leerClienteCambio({ doc: '30123456', nombre: '' })?.error).toMatch(/nombre/)
    expect(leerClienteCambio({ doc: '30123456', nombre: 'Ana', email: 'x' })?.error).toMatch(/mail/)
  })
})

describe('estaAcreditadaEntera (caminado 16-oct, #235: con la NC de la anulación hecha, la ficha seguía ofreciendo otra)', () => {
  const F = { facturaId: 'f', tipo: 'factura' }, N1 = { facturaId: 'n1', tipo: 'nc' }, N2 = { facturaId: 'n2', tipo: 'nc' }
  it('la NC entera de la anulación ⇒ acreditada', () => {
    expect(estaAcreditadaEntera([F, N1], new Map([['f', 49300], ['n1', 49300]]))).toBe(true)
  })
  it('🔴 sólo la PARCIAL de un cambio ⇒ queda saldo: se sigue ofreciendo la NC', () => {
    expect(estaAcreditadaEntera([F, N1], new Map([['f', 49300], ['n1', 15490]]))).toBe(false)
    expect(estaAcreditadaEntera([F, N1, N2], new Map([['f', 49300], ['n1', 15490], ['n2', 33810]]))).toBe(true)
  })
  it('sin NC, sin factura o sin montos ⇒ false (el servidor decide)', () => {
    expect(estaAcreditadaEntera([F], new Map([['f', 100]]))).toBe(false)
    expect(estaAcreditadaEntera([N1], new Map([['n1', 100]]))).toBe(false)
    expect(estaAcreditadaEntera([F, N1], new Map())).toBe(false)
  })
})
