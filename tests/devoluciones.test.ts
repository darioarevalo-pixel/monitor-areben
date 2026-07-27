import { describe, it, expect } from 'vitest'
import {
  calcularMonto, compensacionesDe, convieneRetorno, correccionesMalArmado, costoDelCaso, cuentaDescuento,
  destinoDe, estadoEnCriollo, faltantesParaCerrar, hayEnvio, laFallaDescuentaStock, numeroReclamo,
  pagadoPorItem, pideSeguimiento, puedeVolverLaPrenda,
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

/**
 * Una orden REAL de BDI (#20700, 4-jul-2026), traída del endpoint en producción. Está acá porque
 * fue la que encontró el bug: TN manda `price` y `quantity` como **texto**, no como número, y el
 * cálculo devolvía 0 para toda orden de verdad mientras los tests sintéticos pasaban.
 *
 * Dos fundas de $8.990 = $17.980 de subtotal, 15% de descuento por transferencia = $2.697, más
 * $5.929 de envío. Cierra exacto contra el total que informa TN: 17.980 − 2.697 + 5.929 = 21.212.
 */
const ORDEN_REAL: OrdenTN = {
  id: 2010920738, number: 20700,
  cliente: 'Carla florencia Ietta',
  subtotal: 17980, descuento_total: 2697, descuento_cupon: null, descuento_pago: 0,
  cupon: '606AD3', envio_costo_cliente: 5929, pago_metodo: 'wire_transfer', pago_gateway: 'pago-nube',
  products: [
    { product_id: 294663910, variant_id: '1316406298', name: 'WEAVE CASE CHERRY (iPhone 11)', sku: 'F-0026-11-CH', quantity: '1', price: '8990.00' },
    { product_id: 329546668, variant_id: '1466347481', name: 'ICONIC GREEN (iPhone 11)', sku: 'F-0111', quantity: '1', price: '8990.00' },
  ],
}

describe('contra una orden real de producción (#20700)', () => {
  const items: ItemDevolucion[] = (ORDEN_REAL.products || []).map((p) => ({
    producto: p.name || '', sku: p.sku, cantidad: p.quantity ?? 1, precio: p.price,
  }))

  // Los precios de TN son strings: si el cálculo los ignorara, esto daría 0.
  it('devolver UNA funda: se devuelve lo pagado, no el precio de lista', () => {
    expect(pagadoPorItem(items[0], ORDEN_REAL)).toBe(7641.5)
  })

  it('sin prorratear se le devolverían $1.348,50 de más', () => {
    expect(8990 - pagadoPorItem(items[0], ORDEN_REAL)).toBe(1348.5)
  })

  it('devolver la orden entera cierra contra lo que TN dice que se pagó', () => {
    const m = calcularMonto(items, ORDEN_REAL, { devolverEnvio: true })
    expect(m.producto).toBe(15283) // 17.980 − 2.697
    expect(m.envio).toBe(5929)
    expect(m.total).toBe(21212) // el `total` de la orden en TN
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

/**
 * La regla más delicada del módulo. Equivocarla no rompe ninguna pantalla: deja el stock mal por
 * una unidad hasta el próximo conteo, que es cuando alguien descubre que falta algo y no sabe por qué.
 */
describe('laFallaDescuentaStock', () => {
  it('si se le devolvió la plata, la falla descuenta: la venta se anuló y la unidad volvió al stock', () => {
    expect(laFallaDescuentaStock('plata_total')).toBe(true)
    expect(laFallaDescuentaStock('plata_parcial')).toBe(true)
    expect(laFallaDescuentaStock('cupon')).toBe(true)
    expect(laFallaDescuentaStock('ninguna')).toBe(true)
  })

  // El único caso en que NO descuenta, y es el que se presta a error.
  it('si se le mandó otra unidad igual, NO descuenta: esa prenda ya salió con la venta original', () => {
    expect(laFallaDescuentaStock('otra_unidad')).toBe(false)
  })

  it('sin decidir todavía, se asume que descuenta (el caso más común)', () => {
    expect(laFallaDescuentaStock(null)).toBe(true)
    expect(laFallaDescuentaStock(undefined)).toBe(true)
  })
})

describe('qué salidas se ofrecen según lo que pasó', () => {
  // Ofrecer "le mandamos otra igual" en un arrepentimiento invita a resolver mal.
  it('arrepentimiento: plata o cupón, nunca reponer', () => {
    const c = compensacionesDe('arrepentimiento')
    expect(c).toContain('plata_total')
    expect(c).toContain('plata_parcial')
    expect(c).not.toContain('otra_unidad')
    expect(c).not.toContain('reenvio')
  })

  it('falla: es la que más opciones tiene, incluida reponerla', () => {
    expect(compensacionesDe('falla')).toContain('otra_unidad')
    expect(compensacionesDe('falla')).toContain('plata_parcial')
  })

  // Si nunca salió no hay prenda que negociar: o se manda o se devuelve la plata.
  it('faltante y sin stock: reenviar o devolver, sin descuento parcial', () => {
    for (const m of ['faltante', 'sin_stock'] as const) {
      expect(compensacionesDe(m)).toContain('reenvio')
      expect(compensacionesDe(m)).not.toContain('plata_parcial')
    }
  })

  it('no llegó nunca: solo reponer o devolver', () => {
    expect(compensacionesDe('no_llego')).toEqual(['reenvio', 'plata_total'])
  })
})

describe('el destino de la prenda sale del motivo', () => {
  it('faltante y sin stock: nunca salió', () => {
    expect(destinoDe('faltante', false)).toBe('no_salio')
    expect(destinoDe('sin_stock', false)).toBe('no_salio')
  })

  it('no llegó nunca: se perdió en el camino, ni vuelve ni está', () => {
    expect(destinoDe('no_llego', false)).toBe('perdida')
  })

  it('falla: va al ledger de Fallas, vuelva o no', () => {
    expect(destinoDe('falla', true)).toBe('falla')
    expect(destinoDe('falla', false)).toBe('falla')
  })

  it('arrepentimiento: vuelve a stock si vuelve', () => {
    expect(destinoDe('arrepentimiento', true)).toBe('stock')
  })

  it('sin prenda que pueda volver, media pantalla sobra', () => {
    expect(puedeVolverLaPrenda('faltante')).toBe(false)
    expect(puedeVolverLaPrenda('no_llego')).toBe(false)
    expect(puedeVolverLaPrenda('falla')).toBe(true)
  })
})

/**
 * El caso más enredado del módulo: hay DOS productos y dos posibles descuadres. Equivocarse acá
 * deja el stock mal en dos lugares a la vez, que es exactamente lo que se quería evitar.
 */
describe('pedido mal armado: qué stock hay que corregir', () => {
  it('vuelve el equivocado y se manda el correcto: no hay nada que corregir', () => {
    const c = correccionesMalArmado({ equivocadoVuelve: true, seEnviaElCorrecto: true })
    expect(c.descontarEnviadoPorError).toBe(false)
    expect(c.anularVentaOriginal).toBe(false)
    expect(c.nota).toContain('cuadra solo')
  })

  // Se lo queda: esa unidad salió del depósito y GN nunca se enteró.
  it('se queda el equivocado: hay que descontarlo', () => {
    const c = correccionesMalArmado({ equivocadoVuelve: false, seEnviaElCorrecto: true })
    expect(c.descontarEnviadoPorError).toBe(true)
    expect(c.anularVentaOriginal).toBe(false)
  })

  // El correcto quedó descontado por la venta original y nunca salió: hay que devolverlo al stock.
  it('no se envía el correcto: hay que anular su venta', () => {
    const c = correccionesMalArmado({ equivocadoVuelve: true, seEnviaElCorrecto: false })
    expect(c.anularVentaOriginal).toBe(true)
    expect(c.descontarEnviadoPorError).toBe(false)
  })

  it('el peor caso: se queda uno y no se manda el otro → las dos correcciones', () => {
    const c = correccionesMalArmado({ equivocadoVuelve: false, seEnviaElCorrecto: false })
    expect(c.descontarEnviadoPorError).toBe(true)
    expect(c.anularVentaOriginal).toBe(true)
  })
})

describe('cómo vuelve la prenda', () => {
  it('correo y andreani tienen seguimiento; cadete y presencial no', () => {
    expect(pideSeguimiento('andreani')).toBe(true)
    expect(pideSeguimiento('correo')).toBe(true)
    expect(pideSeguimiento('cadete')).toBe(false)
    expect(pideSeguimiento('presencial')).toBe(false)
    expect(pideSeguimiento(null)).toBe(false)
  })

  // Si la trae al local no hay etiqueta que pagar: pedir un costo ahí sería inventar un gasto.
  it('presencial no tiene envío; el resto sí', () => {
    expect(hayEnvio('presencial')).toBe(false)
    expect(hayEnvio('cadete')).toBe(true)
    expect(hayEnvio('andreani')).toBe(true)
    expect(hayEnvio(null)).toBe(false)
  })

  // "En camino de vuelta" es mentira cuando no hay nada viajando: hay alguien que no vino todavía.
  it('el estado se lee distinto si la trae al local', () => {
    expect(estadoEnCriollo({ estado: 'en_transito', via_retorno: 'presencial' })).toBe('Esperando que la traiga')
    expect(estadoEnCriollo({ estado: 'en_transito', via_retorno: 'andreani' })).toBe('En camino de vuelta')
    expect(estadoEnCriollo({ estado: 'recibido', via_retorno: 'presencial' })).toBe('Recibido')
  })
})

/**
 * El descuento para retener. Es donde una regla mal puesta cuesta miles por unidad, y donde la
 * intuición falla: parece que el techo debería ser el envío, y en una falla es muchísimo más.
 */
describe('cuentaDescuento', () => {
  // El caso real de BDI que motivó todo esto.
  const funda = item(12000, 1, { costo: 2000, pvp_feria: 3500 })

  it('fallada: el techo incluye la depreciación, no solo el envío', () => {
    const c = cuentaDescuento({ items: [funda], fallada: true, envioVuelta: 6000 })
    expect(c.techo).toBe(14500) // 8500 que se deprecia + 6000 de envío
    expect(c.seePierdeSiVuelve).toBe(14500)
  })

  // Lo contraintuitivo: el techo supera el precio, así que regalarla sale más barato que pedirla.
  it('fallada barata: avisa que conviene regalarla', () => {
    const c = cuentaDescuento({ items: [funda], fallada: true, envioVuelta: 6000 })
    expect(c.convieneRegalar).toBe(true)
    expect(c.motivo).toContain('regalarla')
  })

  // Una prenda sana vuelve a stock y se revende: lo único que se pierde es la logística.
  it('sana: el techo es solo lo que se ahorra en logística', () => {
    const c = cuentaDescuento({ items: [funda], fallada: false, envioVuelta: 6000 })
    expect(c.techo).toBe(6000)
    expect(c.convieneRegalar).toBe(false)
  })

  it('el sugerido es la mitad del techo: el techo es el límite, no la oferta', () => {
    expect(cuentaDescuento({ items: [funda], fallada: false, envioVuelta: 6000 }).sugerido).toBe(3000)
  })

  it('el sugerido nunca supera el precio del producto', () => {
    const c = cuentaDescuento({ items: [funda], fallada: true, envioVuelta: 20000 })
    expect(c.sugerido).toBeLessThanOrEqual(12000)
  })

  it('el costo operativo también se ahorra y sube el techo', () => {
    const c = cuentaDescuento({ items: [funda], fallada: false, envioVuelta: 6000, costoOperativo: 1500 })
    expect(c.techo).toBe(7500)
  })

  // Sin el PVP de feria no se puede saber cuánto se deprecia: mejor decirlo que inventar un número.
  it('fallada sin PVP de feria: avisa en vez de calcular cualquier cosa', () => {
    const c = cuentaDescuento({ items: [item(12000)], fallada: true, envioVuelta: 6000 })
    expect(c.techo).toBe(0)
    expect(c.motivo).toContain('PVP de feria')
  })

  it('una prenda cara y fallada: el techo NO llega a regalarla', () => {
    const cara = item(90000, 1, { pvp_feria: 45000 })
    const c = cuentaDescuento({ items: [cara], fallada: true, envioVuelta: 6000 })
    expect(c.techo).toBe(51000)
    expect(c.convieneRegalar).toBe(false)
  })
})

describe('costoDelCaso con los DOS envíos', () => {
  // El de la falla que vuelve y el del reemplazo que va: los dos los pagamos nosotros.
  it('la falla con cambio suma ida y vuelta', () => {
    const c = costoDelCaso({
      montoDevuelto: 0, envioVuelta: 6000, envioReemplazo: 6500,
      items: [item(12000, 1, { costo: 2000 })], destino: 'falla',
    })
    expect(c).toBe(14500) // 6000 + 6500 + 2000 de la unidad que se pierde
  })

  it('sin reemplazo, solo cuenta el de vuelta', () => {
    const c = costoDelCaso({ montoDevuelto: 8000, envioVuelta: 6000, items: [item(12000)], destino: 'stock' })
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
