import { describe, it, expect } from 'vitest'
import {
  calcularMonto, convieneRetorno, costoDelCaso, faltantesParaCerrar, numeroReclamo, pagadoPorItem,
  type DevolucionRow, type ItemDevolucion, type OrdenTN,
} from '@/lib/devoluciones/tipos'

/**
 * La matemática de Devoluciones.
 *
 * Lo que se protege acá es plata que sale de la caja: cuánto se le devuelve a cada persona y si
 * conviene pagar un envío para recuperar la prenda. Un error no rompe ninguna pantalla —se ve
 * recién en la caja o en el stock—, así que es el único lugar del módulo con tests exhaustivos.
 */

const ORDEN_LIMPIA: OrdenTN = { id: 1, number: 1234, subtotal: 10000, descuento_total: 0, envio_costo_cliente: 3000 }
// Orden de $10.000 con 20% de descuento: se pagaron $8.000 + envío.
const ORDEN_CON_CUPON: OrdenTN = { id: 2, number: 1235, subtotal: 10000, descuento_total: 2000, descuento_cupon: 2000, envio_costo_cliente: 3000 }

const item = (precio: number, cantidad = 1, extra: Partial<ItemDevolucion> = {}): ItemDevolucion =>
  ({ producto: 'Remera', cantidad, precio, ...extra })

describe('pagadoPorItem: lo que la persona realmente pagó', () => {
  it('sin descuentos, es el precio por la cantidad', () => {
    expect(pagadoPorItem(item(2500, 2), ORDEN_LIMPIA)).toBe(5000)
  })

  // El caso que hoy Cambios calcula mal: devolver a precio de lista un ítem que se pagó con cupón.
  it('con cupón, descuenta la parte proporcional', () => {
    expect(pagadoPorItem(item(10000), ORDEN_CON_CUPON)).toBe(8000)
  })

  it('un ítem de varios: el descuento se reparte a prorrata, no entero', () => {
    // De los $10.000 de la orden, este ítem es $2.500 → le tocan $500 de los $2.000 de descuento.
    expect(pagadoPorItem(item(2500), ORDEN_CON_CUPON)).toBe(2000)
  })

  it('sin orden (o con una vieja, sin los campos de plata) devuelve el bruto y no rompe', () => {
    expect(pagadoPorItem(item(2500, 2), null)).toBe(5000)
    expect(pagadoPorItem(item(2500, 2), { id: 1, number: 1 })).toBe(5000)
  })

  it('un descuento mayor al subtotal no deja el pagado en negativo', () => {
    const rara: OrdenTN = { id: 3, number: 1, subtotal: 1000, descuento_total: 99999 }
    expect(pagadoPorItem(item(1000), rara)).toBe(0)
  })

  it('sin precio, es 0 (no NaN)', () => {
    expect(pagadoPorItem({ precio: null, cantidad: 2 }, ORDEN_CON_CUPON)).toBe(0)
  })
})

describe('calcularMonto: cuánto se le devuelve', () => {
  it('solo el producto: el envío no se devuelve si no se tilda', () => {
    const m = calcularMonto([item(10000)], ORDEN_CON_CUPON)
    expect(m).toEqual({ producto: 8000, envio: 0, total: 8000 })
  })

  it('con el envío tildado, se suma lo que pagó de envío', () => {
    const m = calcularMonto([item(10000)], ORDEN_CON_CUPON, { devolverEnvio: true })
    expect(m).toEqual({ producto: 8000, envio: 3000, total: 11000 })
  })

  it('varios ítems se suman ya prorrateados', () => {
    expect(calcularMonto([item(2500), item(2500, 2)], ORDEN_CON_CUPON).producto).toBe(6000)
  })

  // "Quedátela con un 30% menos": manda lo acordado, no la cuenta.
  it('el monto acordado le gana al calculado', () => {
    const m = calcularMonto([item(10000)], ORDEN_CON_CUPON, { montoAcordado: 3000 })
    expect(m.total).toBe(3000)
    expect(m.producto).toBe(8000) // la cuenta sigue a la vista
  })

  it('un acordado de 0 es válido: se le da cupón y no plata', () => {
    expect(calcularMonto([item(10000)], ORDEN_CON_CUPON, { montoAcordado: 0 }).total).toBe(0)
  })

  it('si el ítem ya trae `pagado`, se respeta y no se recalcula', () => {
    expect(calcularMonto([item(10000, 1, { pagado: 7777 })], ORDEN_CON_CUPON).producto).toBe(7777)
  })
})

describe('convieneRetorno: el caso de la funda', () => {
  // El ejemplo real: una funda barata que en feria se vende por menos que el envío de vuelta.
  it('fallada y barata: NO conviene pedirla', () => {
    const r = convieneRetorno([item(12000, 1, { costo: 2000, pvp_feria: 3500 })], { fallada: true, envioVuelta: 6000 })
    expect(r.conviene).toBe(false)
    expect(r.recuperable).toBe(3500) // el PVP de feria, NO el precio de lista
  })

  it('fallada pero cara: conviene, aunque el envío no sea gratis', () => {
    const r = convieneRetorno([item(90000, 1, { costo: 30000, pvp_feria: 45000 })], { fallada: true, envioVuelta: 6000 })
    expect(r.conviene).toBe(true)
  })

  // Una prenda sana vuelve a stock y se revende a precio completo: casi siempre conviene.
  it('sana: se mide contra el precio de venta, no contra el PVP de feria', () => {
    const r = convieneRetorno([item(12000, 1, { costo: 2000, pvp_feria: 3500 })], { fallada: false, envioVuelta: 6000 })
    expect(r.conviene).toBe(true)
    expect(r.recuperable).toBe(12000)
  })

  it('el piso duro gana aunque la cuenta dé', () => {
    const r = convieneRetorno([item(9000, 1, { pvp_feria: 8000 })], { fallada: true, envioVuelta: 1000, piso: 10000 })
    expect(r.conviene).toBe(false)
    expect(r.motivo).toContain('piso')
  })

  it('dos unidades del mismo producto suman y pueden dar vuelta la decisión', () => {
    const uno = convieneRetorno([item(12000, 1, { pvp_feria: 3500 })], { fallada: true, envioVuelta: 6000 })
    const dos = convieneRetorno([item(12000, 2, { pvp_feria: 3500 })], { fallada: true, envioVuelta: 6000 })
    expect(uno.conviene).toBe(false)
    expect(dos.conviene).toBe(true) // 7000 recuperables contra 6000 de envío
  })

  it('sin PVP de feria cargado, avisa en vez de sugerir cualquier cosa', () => {
    const r = convieneRetorno([item(12000, 1, {})], { fallada: true, envioVuelta: 6000 })
    expect(r.conviene).toBe(false)
    expect(r.motivo).toContain('falta')
  })
})

describe('costoDelCaso', () => {
  it('si la prenda vuelve a stock, la unidad no se perdió', () => {
    const c = costoDelCaso({ montoDevuelto: 8000, envioVuelta: 6000, items: [item(12000, 1, { costo: 2000 })], destino: 'stock' })
    expect(c).toBe(14000)
  })

  it('si el cliente se la queda, se suma el costo de la unidad regalada', () => {
    const c = costoDelCaso({ montoDevuelto: 8000, envioVuelta: 0, items: [item(12000, 1, { costo: 2000 })], destino: 'falla' })
    expect(c).toBe(10000)
  })

  it('el caso de "se vendió sin stock" no pierde unidad: nunca salió', () => {
    const c = costoDelCaso({ montoDevuelto: 8000, items: [item(12000, 1, { costo: 2000 })], destino: 'no_salio' })
    expect(c).toBe(8000)
  })

  it('suma los dos envíos cuando además se manda un reemplazo', () => {
    const c = costoDelCaso({ montoDevuelto: 0, envioVuelta: 6000, envioReemplazo: 6000, items: [item(12000, 1, { costo: 2000 })], destino: 'falla' })
    expect(c).toBe(14000)
  })
})

describe('numeroReclamo', () => {
  it('formatea como D-0007', () => {
    expect(numeroReclamo(7)).toBe('D-0007')
    expect(numeroReclamo(1234)).toBe('D-1234')
  })
})

describe('faltantesParaCerrar', () => {
  const base: DevolucionRow = {
    id: 1, store: 'bdi', numero: 'D-0001', motivo: 'falla', estado: 'recibido', items: [],
    stock_estado: 'no_aplica', reintegro_estado: 'no_aplica', tn_stock_estado: 'no_aplica',
  }

  it('sin pendientes, no falta nada', () => {
    expect(faltantesParaCerrar(base)).toEqual([])
  })

  it('enumera los tres pendientes en criollo', () => {
    const f = faltantesParaCerrar({ ...base, stock_estado: 'pendiente', reintegro_estado: 'pendiente', tn_stock_estado: 'pendiente' })
    expect(f).toHaveLength(3)
    expect(f.join(' ')).toContain('devolver la plata')
  })

  // Regalar mercadería sin una sola foto es justo el caso que no hay que poder cerrar.
  it('si la prenda se la queda el cliente, exige foto', () => {
    expect(faltantesParaCerrar({ ...base, destino_prenda: 'falla' })).toContain('al menos una foto del producto')
    expect(faltantesParaCerrar({ ...base, destino_prenda: 'falla', fotos: [{ url: 'u', at: 'x' }] })).toEqual([])
  })

  it('si la prenda tenía que volver y no llegó, lo dice', () => {
    expect(faltantesParaCerrar({ ...base, destino_prenda: 'stock', estado: 'en_transito' })).toContain('recibir la prenda')
  })
})
