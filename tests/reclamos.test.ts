import { describe, it, expect } from 'vitest'
import {
  alertasDe, calcularCambio, calcularMonto, compensacionesDe, conAlerta, convieneRetorno,
  correccionesMalArmado,
  costoDelCaso, cuentaDescuento,
  destinoDe, esCambio, estadoEnCriollo, etiquetaEM, faltantesParaCerrar, faltantesParaProcesar,
  hayEnvio, laFallaDescuentaStock, numeroEM, numeroReclamo,
  pagadoPorItem, pideSeguimiento, puedeVolverLaPrenda, repartirSeguimiento, tokenVencido,
  PERFIL_MOTIVO, MOTIVOS_VIGENTES, MOTIVOS_CAMBIO, NUNCA_SALIO, EXPECTATIVA_LABEL,
  ayudaDeMotivo, decideElCliente, devuelveElEnvioDeIda, expectativaLabel, expectativasDe,
  hayUnidadFisica, ofreceRetencion, pideFotos, sobreLaVentaCompleta, tituloExpectativa,
  admiteDevolucionParcial, itemsQueFaltaron, pvpFeriaSugerido, resumenDeLoDecidido,
  type ReclamoRow, type ItemReclamo, type OrdenTN,
} from '@/lib/reclamos/tipos'

/**
 * La matemática de Devoluciones.
 *
 * Lo que se protege acá es plata que sale de la caja: cuánto se le devuelve a cada persona y si
 * conviene pagar un envío para recuperar el producto. Un error no rompe ninguna pantalla —se ve
 * recién en la caja o en el stock—, así que es el único lugar del módulo con tests exhaustivos.
 */

const ORDEN_LIMPIA: OrdenTN = { id: 1, number: 1234, subtotal: 10000, descuento_total: 0, envio_costo_cliente: 3000 }
// Orden de $10.000 con 20% de descuento: se pagaron $8.000 + envío.
const ORDEN_CON_CUPON: OrdenTN = { id: 2, number: 1235, subtotal: 10000, descuento_total: 2000, descuento_cupon: 2000, envio_costo_cliente: 3000 }

const item = (precio: number, cantidad = 1, extra: Partial<ItemReclamo> = {}): ItemReclamo =>
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
  const items: ItemReclamo[] = (ORDEN_REAL.products || []).map((p) => ({
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
  it('fallada y barata: NO conviene pedirlo', () => {
    const r = convieneRetorno([item(12000, 1, { costo: 2000, pvp_feria: 3500 })], { fallada: true, envioVuelta: 6000 })
    expect(r.conviene).toBe(false)
    expect(r.recuperable).toBe(3500) // el PVP de feria, NO el precio de lista
  })

  it('fallada pero cara: conviene, aunque el envío no sea gratis', () => {
    const r = convieneRetorno([item(90000, 1, { costo: 30000, pvp_feria: 45000 })], { fallada: true, envioVuelta: 6000 })
    expect(r.conviene).toBe(true)
  })

  // Un producto sano vuelve a stock y se revende a precio completo: casi siempre conviene.
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
  it('si el producto vuelve a stock, la unidad no se perdió', () => {
    const c = costoDelCaso({ montoDevuelto: 8000, envioVuelta: 6000, items: [item(12000, 1, { costo: 2000 })], destino: 'stock' })
    expect(c).toBe(14000)
  })

  it('si el cliente se lo queda, se suma el costo de la unidad regalada', () => {
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
  it('si se le mandó otra unidad igual, NO descuenta: ese producto ya salió con la venta original', () => {
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

  // Si nunca salió no hay producto que negociar: o se manda o se devuelve la plata.
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

/**
 * El perfil de cada motivo: la tabla de la que sale todo lo demás.
 *
 * Antes cada una de estas respuestas era un `includes` suelto en un archivo distinto, y por eso se
 * contradecían: la lista de "qué espera el cliente" era fija y no dependía del motivo, el mensaje
 * de apertura pedía fotos siempre, y el checkbox del envío se podía tildar en cualquier caso.
 */
describe('el perfil del motivo', () => {
  const TODOS = MOTIVOS_VIGENTES

  it('los ocho vigentes tienen perfil y ayuda', () => {
    for (const m of TODOS) {
      expect(PERFIL_MOTIVO[m], m).toBeTruthy()
      expect(ayudaDeMotivo(m).length, m).toBeGreaterThan(20)
    }
  })

  describe('hayUnidadFisica: lo que separa faltante de sin stock', () => {
    // Los dos "nunca salieron", pero el movimiento de stock es OPUESTO. Es el error más fácil de
    // cometer acá: en faltante el producto está en el depósito y hay que REINGRESARLO en GN; en
    // sin stock no existe y hay que DARLO DE BAJA.
    it('en faltante la unidad está; en sin stock no existe', () => {
      expect(NUNCA_SALIO).toContain('faltante')
      expect(NUNCA_SALIO).toContain('sin_stock')
      expect(hayUnidadFisica('faltante')).toBe(true)
      expect(hayUnidadFisica('sin_stock')).toBe(false)
    })
  })

  describe('devuelveElEnvioDeIda: sólo si no recibió nada', () => {
    it('no llegó y sin stock: se devuelve producto + envío', () => {
      expect(devuelveElEnvioDeIda('no_llego')).toBe(true)
      expect(devuelveElEnvioDeIda('sin_stock')).toBe(true)
    })

    // El envío se prestó: el paquete llegó. Devolverlo es regalar plata.
    it('en los otros seis, la devolución es del producto únicamente', () => {
      for (const m of TODOS.filter((x) => x !== 'no_llego' && x !== 'sin_stock')) {
        expect(devuelveElEnvioDeIda(m), m).toBe(false)
      }
    })
  })

  describe('pideFotos: la foto sirve para ver en qué estado vuelve', () => {
    it('falla y mal armado: siempre, la foto es la prueba', () => {
      for (const m of ['falla', 'mal_armado'] as const) {
        expect(pideFotos(m, 'plata'), m).toBe(true)
        expect(pideFotos(m, 'otro_producto'), m).toBe(true)
      }
    })

    // Si lo quiere cambiar lo trae al mostrador y se ve en persona: pedirle fotos es fricción
    // por nada.
    it('talle y arrepentimiento: sólo si quiere la plata', () => {
      for (const m of ['talle', 'arrepentimiento', 'no_esperaba'] as const) {
        expect(pideFotos(m, 'plata'), m).toBe(true)
        expect(pideFotos(m, 'otro_producto'), m).toBe(false)
      }
    })

    it('no llegó y sin stock: nunca, no hay nada que fotografiar', () => {
      for (const m of ['no_llego', 'sin_stock'] as const) {
        for (const e of ['plata', 'otro_producto', 'completar'] as const) {
          expect(pideFotos(m, e), `${m}/${e}`).toBe(false)
        }
      }
    })
  })

  describe('sobreLaVentaCompleta: cuándo no se pueden destildar productos', () => {
    // El problema es de la venta y el inconveniente de un producto: si después se decide devolver
    // todo, tiene que devolverse TODO, no sólo el que se tildó.
    it('no llegó y sin stock van sobre la venta entera', () => {
      expect(sobreLaVentaCompleta('no_llego')).toBe(true)
      expect(sobreLaVentaCompleta('sin_stock')).toBe(true)
      expect(sobreLaVentaCompleta('falla')).toBe(false)
    })
  })

  describe('expectativasDe: qué se le puede ofrecer', () => {
    it('depende del motivo, no es una lista fija', () => {
      expect(expectativasDe('no_llego')).toEqual(['completar', 'plata'])
      expect(expectativasDe('sin_stock')).toEqual(['otro_producto', 'plata'])
      expect(expectativasDe('falla')).toContain('mismo_producto')
    })

    // Ofrecer "el mismo producto en buen estado" en un arrepentimiento no significa nada.
    it('sólo la falla ofrece el mismo producto', () => {
      for (const m of TODOS.filter((x) => x !== 'falla')) {
        expect(expectativasDe(m), m).not.toContain('mismo_producto')
      }
    })

    it('ninguna queda vacía: siempre hay algo que ofrecerle', () => {
      for (const m of TODOS) expect(expectativasDe(m).length, m).toBeGreaterThan(0)
    })
  })

  describe('las etiquetas se leen distinto según el caso', () => {
    it('en un pedido que nunca llegó no se dice "lo que falta"', () => {
      expect(expectativaLabel('completar', 'no_llego')).toBe('Que le mandemos el pedido de nuevo')
      expect(expectativaLabel('completar', 'faltante')).toContain('el producto que faltó')
    })

    // El cliente no sabe que hay un problema: no "esperaba" nada, eligió cuando se le avisó.
    it('en sin stock la pregunta es qué eligió, no qué esperaba', () => {
      expect(tituloExpectativa('sin_stock')).toBe('¿Qué eligió?')
      expect(tituloExpectativa('falla')).toBe('¿Qué esperaba?')
    })

    it('sin motivo cae a la etiqueta genérica', () => {
      expect(expectativaLabel('plata', null)).toBe(EXPECTATIVA_LABEL.plata)
    })
  })

  describe('ofreceRetencion: intentar que se lo quede', () => {
    // Sólo tiene sentido si el producto está en su poder. Si nunca salió, no hay nada que quedarse.
    it('los cuatro casos donde el cliente tiene el producto', () => {
      for (const m of ['talle', 'arrepentimiento', 'no_esperaba', 'falla'] as const) {
        expect(ofreceRetencion(m), m).toBe(true)
      }
      for (const m of ['faltante', 'mal_armado', 'no_llego', 'sin_stock'] as const) {
        expect(ofreceRetencion(m), m).toBe(false)
      }
    })
  })

  describe('decideElCliente', () => {
    // En todos los demás el cliente pide la plata y nosotros evaluamos con la evidencia.
    it('sin stock es el caso donde la decisión es suya y no hay nada que evaluar', () => {
      expect(decideElCliente('sin_stock')).toBe(true)
      expect(decideElCliente('falla')).toBe(false)
      expect(decideElCliente('mal_armado')).toBe(false)
    })
  })

  describe('MOTIVOS_CAMBIO: qué entra por el mostrador', () => {
    // Lo demás implica una decisión nuestra o una gestión: entra por Reclamos, con expediente.
    it('sólo los tres en que no hay nada que evaluar', () => {
      expect(MOTIVOS_CAMBIO).toEqual(['talle', 'arrepentimiento', 'no_esperaba'])
    })

    it('ninguno de los que necesitan evaluación', () => {
      for (const m of ['falla', 'faltante', 'mal_armado', 'no_llego', 'sin_stock'] as const) {
        expect(MOTIVOS_CAMBIO, m).not.toContain(m)
      }
    })

    it('todos son motivos vigentes', () => {
      for (const m of MOTIVOS_CAMBIO) expect(MOTIVOS_VIGENTES).toContain(m)
    })
  })
})

/**
 * La devolución parcial de "no tenemos stock".
 *
 * El reclamo cubre la venta entera pero el inconveniente es de un producto: si el cliente pide que
 * le devuelvan todo, hay que devolver TODO. Antes "devolver todo" devolvía sólo el producto que se
 * había tildado, aunque el pedido tuviera dos.
 */
describe('qué se devuelve cuando falta un producto de varios', () => {
  const faltante = item(8990, 1, { producto: 'Funda que no tenemos', falto: true })
  const sale = item(6000, 1, { producto: 'La que sí sale' })

  it('sin marcar nada, son todos: el reclamo cubre la venta entera', () => {
    expect(itemsQueFaltaron([item(1000), item(2000)])).toHaveLength(2)
  })

  it('con uno marcado, sólo ése', () => {
    expect(itemsQueFaltaron([faltante, sale]).map((i) => i.producto)).toEqual(['Funda que no tenemos'])
  })

  describe('admiteDevolucionParcial: cuándo hay algo que partir', () => {
    it('sí, si falta uno de dos', () => {
      expect(admiteDevolucionParcial([faltante, sale])).toBe(true)
    })

    // Con un solo producto no hay parcial que valga: o se devuelve o no.
    it('no, con un solo producto', () => {
      expect(admiteDevolucionParcial([faltante])).toBe(false)
    })

    // Si no salió NADA, la parcial y la total son lo mismo.
    it('no, si faltan todos', () => {
      expect(admiteDevolucionParcial([faltante, { ...sale, falto: true }])).toBe(false)
    })

    it('no, si no hay ninguno marcado', () => {
      expect(admiteDevolucionParcial([item(1000), item(2000)])).toBe(false)
    })
  })

  describe('la plata de cada alcance', () => {
    const orden: OrdenTN = { id: 9, number: 99, subtotal: 14990, descuento_total: 0, envio_costo_cliente: 5000 }

    // El resto del pedido SÍ se despacha, así que el envío se prestó: devolverlo sería regalarlo.
    it('parcial: sólo el faltante, sin envío', () => {
      const m = calcularMonto(itemsQueFaltaron([faltante, sale]), orden, { devolverEnvio: false })
      expect(m.producto).toBe(8990)
      expect(m.envio).toBe(0)
      expect(m.total).toBe(8990)
    })

    // No recibió absolutamente nada: se le devuelve el pedido entero y también lo que pagó de envío.
    it('total: los dos productos MÁS el envío', () => {
      const m = calcularMonto([faltante, sale], orden, { devolverEnvio: true })
      expect(m.producto).toBe(14990)
      expect(m.envio).toBe(5000)
      expect(m.total).toBe(19990)
    })
  })
})

/**
 * El PVP de feria es lo ÚNICO que se recupera de un producto fallado, y es lo que mueve toda la
 * cuenta de la retención. Hasta ahora se tipeaba a mano sin ninguna referencia.
 */
describe('la gravedad da el PVP de feria de arranque', () => {
  const funda = item(10000, 1)

  it('una que se puede usar vale más en feria que una que no', () => {
    expect(pvpFeriaSugerido([funda], 'util')).toBeGreaterThan(pvpFeriaSugerido([funda], 'inutil'))
  })

  it('es POR UNIDAD, no por el total de la línea', () => {
    expect(pvpFeriaSugerido([item(10000, 3)], 'util')).toBe(pvpFeriaSugerido([item(10000, 1)], 'util'))
  })

  it('sin precio de lista no inventa un número', () => {
    expect(pvpFeriaSugerido([item(0)], 'util')).toBe(0)
    expect(pvpFeriaSugerido([], 'util')).toBe(0)
  })

  // Es lo que hace que la sugerencia sirva: alimenta directamente el techo de la oferta.
  it('el techo de la retención se mueve con la gravedad', () => {
    const conFeria = (g: 'util' | 'inutil') =>
      cuentaDescuento({
        items: [{ ...funda, pvp_feria: pvpFeriaSugerido([funda], g) }],
        fallada: true,
        envioVuelta: 2000,
      }).techo
    // Cuanto menos se recupera, más se pierde si vuelve, y más se puede ofrecer para que se quede.
    expect(conFeria('inutil')).toBeGreaterThan(conFeria('util'))
  })
})

describe('el resumen de lo decidido', () => {
  const base: ReclamoRow = {
    id: 7, store: 'bdi', numero: 'R-0007', motivo: 'falla', estado: 'en_revision', items: [],
    stock_estado: 'no_aplica', reintegro_estado: 'no_aplica', tn_stock_estado: 'no_aplica',
  }
  const texto = (d: ReclamoRow) => resumenDeLoDecidido(d).map((r) => `${r.que}: ${r.valor}`).join(' | ')

  // Existe porque la fila era puro botón: para saber qué se había resuelto había que deducirlo de
  // qué botones quedaban.
  it('sin decisión, lo dice y no inventa', () => {
    expect(texto(base)).toContain('Todavía sin decidir')
    expect(texto(base)).not.toContain('Se le devuelve')
  })

  it('decidido, cuenta qué recibe, qué pasa con el producto y cuánto costó', () => {
    const t = texto({ ...base, compensacion: 'plata_total', monto_total: 8000, destino_prenda: 'falla', costo_caso: 12000 })
    expect(t).toContain('Se le devuelve todo')
    expect(t).toContain('$8.000')
    expect(t).toContain('no se revende')
    expect(t).toContain('$12.000')
  })

  // Se guarda lo que sugirió la cuenta ADEMÁS de lo que se hizo: sirve para ver cuándo se va en
  // contra y si valió la pena.
  it('marca cuándo se fue en contra de la cuenta', () => {
    const t = texto({ ...base, compensacion: 'plata_total', retorno_sugerido: false, retorno_decidido: true, via_retorno: 'andreani' })
    expect(t).toContain('en contra de lo que sugería la cuenta')
    const ok = texto({ ...base, compensacion: 'plata_total', retorno_sugerido: true, retorno_decidido: true })
    expect(ok).not.toContain('en contra')
  })

  it('la expectativa se lee con la etiqueta del caso', () => {
    const t = texto({ ...base, motivo: 'sin_stock', expectativa: 'otro_producto' })
    expect(t).toContain('Cambiarlo por otro producto')
  })
})

describe('el destino de el producto sale del motivo', () => {
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

  it('sin producto que pueda volver, media pantalla sobra', () => {
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

describe('cómo vuelve el producto', () => {
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
    expect(estadoEnCriollo({ estado: 'en_transito', via_retorno: 'presencial' })).toBe('Esperando que lo traiga')
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

  // Lo contraintuitivo: el techo supera el precio, así que regalarlo sale más barato que pedirlo.
  it('fallada barata: avisa que conviene regalarlo', () => {
    const c = cuentaDescuento({ items: [funda], fallada: true, envioVuelta: 6000 })
    expect(c.convieneRegalar).toBe(true)
    expect(c.motivo).toContain('regalarlo')
  })

  // Un producto sano vuelve a stock y se revende: lo único que se pierde es la logística.
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

  it('un producto cara y fallada: el techo NO llega a regalarlo', () => {
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
  // Un solo prefijo para todo el post-venta: antes convivían D- (Devoluciones) y C- (Cambios), y
  // Administración tenía que seguir dos colas para lo mismo.
  it('formatea como R-0007', () => {
    expect(numeroReclamo(7)).toBe('R-0007')
    expect(numeroReclamo(1234)).toBe('R-1234')
  })
})

describe('tokenVencido', () => {
  // El portal devuelve el MISMO 404 para un token vencido que para uno inválido, así que del lado
  // del cliente las dos cosas se ven igual ("este link ya no está disponible"). Por eso hay que
  // detectar el vencimiento acá y regenerar el link antes de copiarlo.
  const enDias = (d: number) => new Date(Date.now() + d * 86400000).toISOString()

  it('vencido si la fecha ya pasó', () => {
    expect(tokenVencido(enDias(-1))).toBe(true)
  })

  it('vigente si falta', () => {
    expect(tokenVencido(enDias(5))).toBe(false)
  })

  // Los reclamos anteriores a que existiera el vencimiento no tienen la fecha: tratarlos como
  // vencidos regeneraría el token de cualquier reclamo viejo sin motivo.
  it('sin fecha NO cuenta como vencido', () => {
    expect(tokenVencido(null)).toBe(false)
    expect(tokenVencido(undefined)).toBe(false)
    expect(tokenVencido('')).toBe(false)
  })

  // Una fecha corrupta da NaN, y `NaN < Date.now()` es false: no se rompe, no regenera de más.
  it('una fecha ilegible no rompe', () => {
    expect(tokenVencido('mañana')).toBe(false)
  })
})

describe('faltantesParaCerrar', () => {
  // `compensacion` es lo que marca que el caso YA se decidió. Sin eso, el único pendiente es
  // decidir (ver el bloque de abajo), así que los pendientes operativos se prueban sobre un
  // reclamo decidido — que es cuando existen de verdad.
  const base: ReclamoRow = {
    id: 1, store: 'bdi', numero: 'R-0001', motivo: 'falla', estado: 'recibido', items: [],
    compensacion: 'plata_total',
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

  /**
   * ⚠️ `tn_stock_estado` se llama así por historia y **ya no tiene nada que ver con Tienda Nube**:
   * hoy es la traza de dar de baja en Gestión Nube la unidad que no existe.
   *
   * Escribir stock en TN no servía: TN está conectada a GN y el stock de GN pisa el de TN en la
   * próxima sincronización, así que la corrección se deshacía sola. Este test está para que el
   * nombre de la columna no vuelva a arrastrar a nadie al comportamiento viejo.
   */
  it('el pendiente de stock habla de Gestión Nube, no de Tienda Nube', () => {
    const f = faltantesParaCerrar({ ...base, tn_stock_estado: 'pendiente' })
    expect(f).toEqual(['dar de baja el producto en Gestión Nube'])
    expect(f.join(' ')).not.toContain('Tienda Nube')
  })

  /**
   * Un pendiente que aparece antes de la decisión que lo justifica es un pendiente inventado, y
   * es la forma más rápida de que la gente aprenda a no mirar la columna.
   *
   * Antes el reclamo NACÍA con `stock_estado` y `reintegro_estado` en 'pendiente', así que desde
   * el minuto cero decía "anular la venta original en Gestión Nube · devolver la plata" — cuando
   * en la mitad de los casos la respuesta termina siendo que no hay que anular ni devolver nada.
   */
  describe('antes de decidir, el único pendiente es decidir', () => {
    const sinDecidir: ReclamoRow = { ...base, compensacion: undefined, estado: 'en_revision' }

    it('lo dice, y no inventa los de plata ni stock', () => {
      expect(faltantesParaCerrar(sinDecidir)).toEqual(['decidir qué se hace'])
    })

    it('tampoco los inventa si la fila viniera con ellos en pendiente', () => {
      const f = faltantesParaCerrar({ ...sinDecidir, stock_estado: 'pendiente', reintegro_estado: 'pendiente' })
      expect(f.join(' ')).not.toContain('anular la venta')
      expect(f.join(' ')).not.toContain('devolver la plata')
    })

    // Estos dos NO esperan a la decisión: se saben desde que se abre el caso y son plata o stock
    // que se pierde si nadie los persigue.
    it('el reclamo al transportista y la baja en GN sí corren en paralelo', () => {
      const f = faltantesParaCerrar({ ...sinDecidir, reclamo_correo_estado: 'pendiente', tn_stock_estado: 'pendiente' })
      expect(f).toContain('presentar el reclamo al transportista')
      expect(f).toContain('dar de baja el producto en Gestión Nube')
    })

    it('un reclamo anulado no pide decidir nada', () => {
      expect(faltantesParaCerrar({ ...sinDecidir, estado: 'anulado' })).toEqual([])
    })
  })

  // Regalar mercadería sin una sola foto es justo el caso que no hay que poder cerrar.
  it('si el producto se lo queda el cliente, exige foto', () => {
    expect(faltantesParaCerrar({ ...base, destino_prenda: 'falla' })).toContain('al menos una foto del producto')
    expect(faltantesParaCerrar({ ...base, destino_prenda: 'falla', fotos: [{ url: 'u', at: 'x' }] })).toEqual([])
  })

  it('si el producto tenía que volver y no llegó, lo dice', () => {
    expect(faltantesParaCerrar({ ...base, destino_prenda: 'stock', estado: 'en_transito' })).toContain('recibir el producto')
  })

  /**
   * El hueco que dejaba todo cambio trabado sin poder cerrarse: se le exigían las dos condiciones
   * de una devolución, y en un cambio ninguna de las dos corresponde.
   */
  describe('un cambio no cierra con las condiciones de una devolución', () => {
    const cambio: ReclamoRow = {
      ...base, motivo: 'talle', compensacion: 'otro_producto',
      // El estado en que queda un cambio recién procesado, con los pendientes que traía antes.
      stock_estado: 'pendiente', reintegro_estado: 'pendiente',
      reingreso_estado: 'no_aplica', cobro_estado: 'no_aplica',
    }

    it('no pide anular la venta original: el cliente se queda con la compra', () => {
      expect(faltantesParaCerrar(cambio).join(' ')).not.toContain('anular la venta')
    })

    it('no pide devolver plata cuando la diferencia la paga el cliente', () => {
      expect(faltantesParaCerrar({ ...cambio, diferencia: 2000 }).join(' ')).not.toContain('devolver')
    })

    it('sí pide devolverla cuando la cuenta quedó a favor del cliente', () => {
      expect(faltantesParaCerrar({ ...cambio, diferencia: -2000 })).toContain('devolverle la diferencia')
    })

    // GN no acepta una venta negativa por API: el producto que vuelve se reingresa a mano o el stock
    // queda corto para siempre.
    it('exige reingresar a mano el producto devuelto', () => {
      expect(faltantesParaCerrar({ ...cambio, reingreso_estado: 'pendiente' })).toContain('reingresar en Gestión Nube el producto devuelto')
    })

    it('exige cobrar la diferencia si quedó pendiente', () => {
      expect(faltantesParaCerrar({ ...cambio, cobro_estado: 'pendiente' })).toContain('cobrar la diferencia')
    })

    it('con todo hecho, cierra', () => {
      expect(faltantesParaCerrar({ ...cambio, diferencia: 2000, reingreso_estado: 'hecho', cobro_estado: 'cobrado' })).toEqual([])
    })
  })
})

/**
 * El envío del cambio. No es logística: si lo paga el cliente hay que cobrárselo en el mostrador,
 * y el motor nuevo directamente no lo contemplaba — el POS viejo sí.
 */
describe('calcularCambio: el envío', () => {
  it('si lo paga el cliente, se suma al total', () => {
    const c = calcularCambio({ devueltos: [item(10000)], nuevos: [item(12000)], orden: ORDEN_LIMPIA, envioCosto: 6000, envioPaga: 'cliente' })
    expect(c.diferencia).toBe(2000)
    expect(c.envioACobrar).toBe(6000)
    expect(c.total).toBe(8000)
  })

  it('si lo pagamos nosotros, no toca el total', () => {
    const c = calcularCambio({ devueltos: [item(10000)], nuevos: [item(12000)], orden: ORDEN_LIMPIA, envioCosto: 6000, envioPaga: 'nosotros' })
    expect(c.envioACobrar).toBe(0)
    expect(c.total).toBe(2000)
  })

  // El caso que confunde: la diferencia va a favor del cliente pero el envío se lo cobramos, así
  // que le devolvemos menos de lo que parece.
  it('sobre una diferencia a favor, el envío achica lo que se le devuelve', () => {
    const c = calcularCambio({ devueltos: [item(12000)], nuevos: [item(10000)], orden: ORDEN_LIMPIA, envioCosto: 500, envioPaga: 'cliente' })
    expect(c.diferencia).toBe(-2000)
    expect(c.total).toBe(-1500)
    expect(c.quienPaga).toBe('nosotros')
  })

  // El orden importa: primero el descuento manual, después el % sobre lo que queda, y el envío
  // recién al final — sobre el envío no se descuenta nada.
  it('el envío no recibe el descuento por forma de pago', () => {
    const c = calcularCambio({
      devueltos: [item(10000)], nuevos: [item(20000)], orden: ORDEN_LIMPIA,
      formaPago: 'transferencia', envioCosto: 1000, envioPaga: 'cliente',
    })
    expect(c.diferencia).toBe(10000)
    expect(c.descuentoForma).toBe(1000) // 10% de 10.000
    expect(c.total).toBe(10000 - 1000 + 1000)
  })
})

describe('esCambio', () => {
  // Un cambio no es un tipo de reclamo: es un reclamo cuya salida es otro producto.
  it('la única condición es que la salida sea otro producto', () => {
    expect(esCambio({ compensacion: 'otro_producto' })).toBe(true)
    expect(esCambio({ compensacion: 'otra_unidad' })).toBe(false)
    expect(esCambio({ compensacion: null })).toBe(false)
  })
})

describe('faltantesParaProcesar: el gate para facturar el cambio', () => {
  const completo = {
    orden_tn: '20700',
    items: [{ producto: 'Devuelto', cantidad: 1, precio: 10000 }],
    items_nuevos: [{ producto: 'Nuevo', cantidad: 1, precio: 12000, product_id: 'p1', size_id: 's1' }],
    forma_pago: 'transferencia' as const,
    via_retorno: 'andreani' as const,
    envio_paga: 'cliente' as const,
    solicitud_envio: '1234',
  }

  it('completo, no falta nada', () => {
    expect(faltantesParaProcesar(completo)).toEqual([])
  })

  // Sin los ids de GN la venta no puede descontar stock: un nombre suelto no alcanza.
  it('exige que lo que se lleva esté linkeado a Gestión Nube', () => {
    const sinIds = { ...completo, items_nuevos: [{ producto: 'Nuevo', cantidad: 1, precio: 12000 }] }
    expect(faltantesParaProcesar(sinIds)).toContain('el producto que se lleva (de Gestión Nube)')
  })

  it('la solicitud EM solo es obligatoria en las vías con seguimiento', () => {
    expect(faltantesParaProcesar({ ...completo, solicitud_envio: null })).toContain('la solicitud de envío (EM)')
    expect(faltantesParaProcesar({ ...completo, solicitud_envio: null, via_retorno: 'cadete' })).toEqual([])
  })
})

describe('numeroEM: el bug del "EM EM1234"', () => {
  it('guarda solo el número, venga como venga', () => {
    expect(numeroEM('EM1234')).toBe('1234')
    expect(numeroEM('em 1234')).toBe('1234')
    expect(numeroEM('1234')).toBe('1234')
  })

  it('el prefijo lo pone la pantalla, una sola vez', () => {
    expect(etiquetaEM('EM1234')).toBe('EM 1234')
    expect(etiquetaEM('1234')).toBe('EM 1234')
    expect(etiquetaEM('')).toBe('')
  })
})

describe('repartirSeguimiento', () => {
  it('un código va a la ida', () => {
    expect(repartirSeguimiento('ABC123')).toEqual({ ida: 'ABC123', vuelta: null })
  })
  it('dos códigos, el segundo a la vuelta', () => {
    expect(repartirSeguimiento('ABC123 XYZ789')).toEqual({ ida: 'ABC123', vuelta: 'XYZ789' })
  })
  it('vacío no rompe', () => {
    expect(repartirSeguimiento('  ')).toEqual({ ida: null, vuelta: null })
  })
})

/**
 * Las alertas por antigüedad. Sin esto un reclamo se duerme en la lista: nadie lo cierra ni lo
 * reclama, y el que paga es el cliente esperando su plata.
 */
describe('alertas por antigüedad', () => {
  const AHORA = new Date('2026-07-27T12:00:00Z').getTime()
  const hace = (dias: number) => new Date(AHORA - dias * 86400000).toISOString()
  const fila = (extra: Partial<ReclamoRow>): ReclamoRow => ({
    id: 1, store: 'bdi', numero: 'R-0001', motivo: 'falla', estado: 'en_revision', items: [],
    stock_estado: 'no_aplica', reintegro_estado: 'no_aplica', tn_stock_estado: 'no_aplica',
    created_at: hace(1), updated_at: hace(1), ...extra,
  })

  it('un reclamo recién abierto no alerta nada', () => {
    expect(alertasDe(fila({ estado: 'esperando_cliente', created_at: hace(2) }), AHORA)).toEqual([])
  })

  // La que más duele: el cliente esperando su plata.
  it('la plata sin salir alerta a los 5 días, y va primero', () => {
    const a = alertasDe(fila({ estado: 'resuelto', compensacion: 'plata_total', reintegro_estado: 'pendiente', updated_at: hace(6) }), AHORA)
    expect(a[0].texto).toContain('la plata no sale')
    expect(a[0].tono).toBe('danger')
  })

  it('el cliente que no responde alerta a los 10 días', () => {
    expect(alertasDe(fila({ estado: 'esperando_cliente', created_at: hace(11) }), AHORA)[0].texto).toContain('no responde')
  })

  // Es el único que depende de nosotros: el cliente ya hizo su parte.
  it('cargó las fotos y nadie decidió: alerta a los 3 días', () => {
    const a = alertasDe(fila({ estado: 'en_revision', updated_at: hace(4) }), AHORA)
    expect(a[0].texto).toContain('Esperando una decisión')
    expect(a[0].tono).toBe('danger')
  })

  it('un paquete que no llega hace 15 días alerta', () => {
    expect(alertasDe(fila({ estado: 'en_transito', updated_at: hace(16) }), AHORA)[0].texto).toContain('no llega')
  })

  it('sin compensación decidida, la plata todavía no puede alertar', () => {
    expect(alertasDe(fila({ estado: 'en_revision', reintegro_estado: 'pendiente', updated_at: hace(30), compensacion: null }), AHORA)
      .some((a) => a.texto.includes('plata'))).toBe(false)
  })

  it('conAlerta cuenta reclamos, no alertas', () => {
    const dormido = fila({ id: 2, estado: 'esperando_cliente', created_at: hace(30), updated_at: hace(30) })
    expect(conAlerta([fila({}), dormido], AHORA)).toBe(1)
  })
})

/**
 * El cambio por otro producto: lo que era la sección Cambios, ahora como una resolución más.
 *
 * El caso del cupón es el que importa: el motor viejo valuaba lo devuelto a precio de LISTA, así
 * que le acreditaba al cliente plata que nunca pagó.
 */
describe('calcularCambio', () => {
  const devuelto = item(10000)
  const nuevo = item(12000)

  it('sin descuentos, la diferencia es la resta directa', () => {
    const c = calcularCambio({ devueltos: [devuelto], nuevos: [nuevo], orden: ORDEN_LIMPIA })
    expect(c.diferencia).toBe(2000)
    expect(c.quienPaga).toBe('cliente')
  })

  /**
   * Un cambio se cuenta **lista contra lista**: el cliente conserva el descuento que consiguió en
   * la compra original. La red de seguridad se enciende sólo cuando la cuenta queda a favor de él,
   * que es donde el motor viejo regalaba plata.
   */
  describe('lista contra lista, con la red de seguridad', () => {
    // Comprado con un cupón del 20%: lista 10.000, pagó 8.000.
    it('si el cliente pone plata, conserva su descuento', () => {
      const c = calcularCambio({ devueltos: [devuelto], nuevos: [nuevo], orden: ORDEN_CON_CUPON })
      expect(c.devueltos).toBe(10000) // se le toma a precio de vidriera
      expect(c.diferencia).toBe(2000) // paga sólo la diferencia real entre productos
    })

    // Lo que cualquiera espera parado en el mostrador. Con la regla vieja esto costaba plata.
    it('el mismo producto por el mismo producto da CERO', () => {
      const c = calcularCambio({ devueltos: [devuelto], nuevos: [item(10000)], orden: ORDEN_CON_CUPON })
      expect(c.diferencia).toBe(0)
      expect(c.quienPaga).toBe('nadie')
    })

    // Acá se da vuelta: a precio de lista le devolveríamos 4.000 de algo por lo que puso 8.000.
    it('si se lleva algo más barato, se revalúa a lo que pagó', () => {
      const c = calcularCambio({ devueltos: [devuelto], nuevos: [item(6000)], orden: ORDEN_CON_CUPON })
      expect(c.devueltos).toBe(8000) // lo pagado, no los 10.000 de lista
      expect(c.diferencia).toBe(-2000) // y no −4.000: no sale de la caja más de lo que entró
    })

    // El borde exacto, que es donde estas cosas se rompen.
    it('en el cero justo no salta a lo pagado', () => {
      const c = calcularCambio({ devueltos: [devuelto], nuevos: [item(10000)], orden: ORDEN_CON_CUPON })
      expect(c.devueltos).toBe(10000)
      // Un peso menos y ya se revalúa.
      expect(calcularCambio({ devueltos: [devuelto], nuevos: [item(9999)], orden: ORDEN_CON_CUPON }).devueltos).toBe(8000)
    })

    // Sin descuentos en la orden las dos valuaciones coinciden: la regla no cambia nada.
    it('sin cupón, lista y pagado son lo mismo', () => {
      expect(calcularCambio({ devueltos: [devuelto], nuevos: [item(6000)], orden: ORDEN_LIMPIA }).diferencia).toBe(-4000)
    })

    // Con la funda real: lista 8.990, pagada 7.641,50.
    it('la funda de la orden #20700, para los dos lados', () => {
      const funda = item(8990, 1, { pagado: 7641.5 })
      expect(calcularCambio({ devueltos: [funda], nuevos: [item(8990)] }).diferencia).toBe(0)
      expect(calcularCambio({ devueltos: [funda], nuevos: [item(10000)] }).diferencia).toBe(1010)
      expect(calcularCambio({ devueltos: [funda], nuevos: [item(6000)] }).diferencia).toBe(-1641.5)
    })
  })

  it('transferencia descuenta 10% de lo que hay que cobrar', () => {
    const c = calcularCambio({ devueltos: [devuelto], nuevos: [nuevo], orden: ORDEN_LIMPIA, formaPago: 'transferencia' })
    expect(c.descuentoForma).toBe(200)
    expect(c.total).toBe(1800)
  })

  it('tarjeta no descuenta nada', () => {
    expect(calcularCambio({ devueltos: [devuelto], nuevos: [nuevo], orden: ORDEN_LIMPIA, formaPago: 'tarjeta' }).total).toBe(2000)
  })

  // Si el cambio da a favor del cliente no hay nada que descontar: descontar ahí sería regalar más.
  it('si el cambio da a favor del cliente, no se aplica descuento por forma de pago', () => {
    const c = calcularCambio({ devueltos: [item(12000)], nuevos: [item(10000)], orden: ORDEN_LIMPIA, formaPago: 'transferencia' })
    expect(c.descuentoForma).toBe(0)
    expect(c.total).toBe(-2000)
    expect(c.quienPaga).toBe('nosotros')
  })

  it('un cambio parejo no le cobra ni le devuelve a nadie', () => {
    expect(calcularCambio({ devueltos: [item(10000)], nuevos: [item(10000)], orden: ORDEN_LIMPIA }).quienPaga).toBe('nadie')
  })

  it('el descuento manual no puede superar la diferencia', () => {
    const c = calcularCambio({ devueltos: [devuelto], nuevos: [nuevo], orden: ORDEN_LIMPIA, descuentoManual: 99999 })
    expect(c.total).toBe(0)
  })

  it('varios productos de cada lado se suman', () => {
    const c = calcularCambio({ devueltos: [item(5000), item(5000)], nuevos: [item(12000)], orden: ORDEN_LIMPIA })
    expect(c.devueltos).toBe(10000)
    expect(c.diferencia).toBe(2000)
  })
})
