import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import {
  alertasDe, calcularCambio, calcularMonto, compensacionesDe, conAlerta, convieneRetorno,
  diasEsperandoLaOferta,
  correccionesMalArmado,
  costoDelCaso, cuentaDescuento, ofertaSegunForma, MULTIPLO_CUPON,
  destinoDe, esCambio, escenariosDe, estaAbierto, estadoEnCriollo, etiquetaEM, faltaMandarLaEtiqueta, laEtiquetaEstaDebida, faltantesParaCerrar, faltantesParaProcesar,
  hayEnvio, laFallaDescuentaStock, numeroEM, numeroReclamo,
  pagadoPorItem, pideSeguimiento, puedeVolverLaPrenda, repartirSeguimiento, tokenVencido,
  PERFIL_MOTIVO, MOTIVOS_VIGENTES, MOTIVOS_CAMBIO, NUNCA_SALIO, EXPECTATIVA_LABEL,
  ayudaDeMotivo, decideElCliente, devuelveElEnvioDeIda, expectativaLabel, expectativasDe,
  hayUnidadFisica, ofreceRetencion, pideFotos, sobreLaVentaCompleta, tituloExpectativa, ERROR_PROPIO,
  type MotivoReclamo,
  admiteDevolucionParcial, itemsQueFaltaron, pvpFeriaSugerido, resumenDeLoDecidido,
  faltantesDeLaDecision, loQueTraba, estadoDelPaso, registroDeRetencion, puedeRehacerseLaDecision, pasoGuardado, loEjecutado,
  botonDecidir, estaDecidido, PASOS_DECISION, PASO_LABEL,
  EFECTOS_RESOLUCION, ENTRADAS_DEL_COSTO, costoDeLaFila, montoADevolver, faltaAnularAntesDeDescontar, pendientesDe, saleUnEnvio, DESTINO_LABEL, destinosDe, preseleccionDelAlta, VIAS_VIGENTES, VIA_LABEL, type Compensacion, type FormaRetencion,
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
    const r = convieneRetorno([item(12000, 1, { costo: 2000, pvp_feria: 3500 })], { fallada: true, envioVuelta: 6000, costoOperativoPorUnidad: 0 })
    expect(r.conviene).toBe(false)
    expect(r.recuperable).toBe(3500) // el PVP de feria, NO el precio de lista
  })

  it('fallada pero cara: conviene, aunque el envío no sea gratis', () => {
    const r = convieneRetorno([item(90000, 1, { costo: 30000, pvp_feria: 45000 })], { fallada: true, envioVuelta: 6000, costoOperativoPorUnidad: 0 })
    expect(r.conviene).toBe(true)
  })

  // Un producto sano vuelve a stock y se revende a precio completo: casi siempre conviene.
  it('sana: se mide contra el precio de venta, no contra el PVP de feria', () => {
    const r = convieneRetorno([item(90000, 1, { costo: 2000, pvp_feria: 3500 })], { fallada: false, envioVuelta: 6000, costoOperativoPorUnidad: 0 })
    expect(r.conviene).toBe(true)
    expect(r.recuperable).toBe(90000)
  })

  it('dos unidades del mismo producto suman y pueden dar vuelta la decisión', () => {
    const uno = convieneRetorno([item(12000, 1, { pvp_feria: 7000 })], { fallada: true, envioVuelta: 6000, costoOperativoPorUnidad: 0 })
    const dos = convieneRetorno([item(12000, 2, { pvp_feria: 7000 })], { fallada: true, envioVuelta: 6000, costoOperativoPorUnidad: 0 })
    expect(uno.conviene).toBe(false) // 7000 contra un piso de 12000: apenas empata
    expect(dos.conviene).toBe(true) // 14000 recuperables, el mismo envío
  })

  it('sin PVP de feria cargado, avisa en vez de sugerir cualquier cosa', () => {
    const r = convieneRetorno([item(12000, 1, {})], { fallada: true, envioVuelta: 6000, costoOperativoPorUnidad: 0 })
    expect(r.conviene).toBe(false)
    expect(r.motivo).toContain('falta')
  })

  /**
   * ── El piso, desde el 30-ago-2026 ──
   *
   * 🔴 **Era un monto fijo por marca y ⛔ nunca cambió una cuenta**: vivió en `null` en BDI y en
   * Zattia desde que existió. Ahora es un MÚLTIPLO de lo que sale traerlo, así que se mueve solo
   * cuando sube el flete o el costo del trabajo. Estos casos fijan las dos mitades de la regla —el
   * múltiplo Y que el costo incluya el trabajo, ⛔ no sólo el envío—, que es justo lo que un test
   * atado al `piso` viejo dejaría de vigilar sin ponerse rojo.
   */
  it('el piso es un MÚLTIPLO del costo: recuperar apenas más de lo que se gasta ⛔ no alcanza', () => {
    // 6000 recuperables contra 4000 de envío: la cuenta vieja decía "conviene" por 2000 netos.
    const r = convieneRetorno([item(20000, 1, { pvp_feria: 6000 })], { fallada: true, envioVuelta: 4000, costoOperativoPorUnidad: 0 })
    expect(r.conviene).toBe(false)
    expect(r.motivo).toContain('Apenas empata')
    expect(r.motivo).toContain('8000') // 2× los 4000 que sale traerlo
  })

  /**
   * 🔴 El borde exacto: **justo EN el piso conviene**, y un peso menos ⛔ no. Sin fijarlo, cambiar
   * el `<` por `<=` ⛔ no pone nada en rojo — y ese peso es un caso real que deja de pedirse.
   */
  it('el borde del piso: justo en el múltiplo conviene, un peso menos ⛔ no', () => {
    const justo = convieneRetorno([item(20000, 1, { pvp_feria: 8000 })], { fallada: true, envioVuelta: 4000, costoOperativoPorUnidad: 0 })
    const unoMenos = convieneRetorno([item(20000, 1, { pvp_feria: 7999 })], { fallada: true, envioVuelta: 4000, costoOperativoPorUnidad: 0 })
    expect(justo.conviene).toBe(true) // 8000 = 2 × 4000
    expect(unoMenos.conviene).toBe(false)
  })

  it('el piso se mueve con el envío: el mismo producto conviene si traerlo sale menos', () => {
    const caro = convieneRetorno([item(20000, 1, { pvp_feria: 6000 })], { fallada: true, envioVuelta: 4000, costoOperativoPorUnidad: 0 })
    const barato = convieneRetorno([item(20000, 1, { pvp_feria: 6000 })], { fallada: true, envioVuelta: 2000, costoOperativoPorUnidad: 0 })
    expect(caro.conviene).toBe(false) // 6000 contra un piso de 8000
    expect(barato.conviene).toBe(true) // los mismos 6000 contra un piso de 4000
  })

  it('el trabajo de recibirlo entra en el costo, ⛔ no sólo el envío', () => {
    const sin = convieneRetorno([item(20000, 1, { pvp_feria: 8000 })], { fallada: true, envioVuelta: 2000, costoOperativoPorUnidad: 0 })
    const con = convieneRetorno([item(20000, 1, { pvp_feria: 8000 })], { fallada: true, envioVuelta: 2000, costoOperativoPorUnidad: 2500 })
    expect(sin.costoDeTraerlo).toBe(2000)
    expect(con.costoDeTraerlo).toBe(4500) // 2000 de envío + 2500 de recibirlo
    expect(sin.conviene).toBe(true) // 8000 contra un piso de 4000
    expect(con.conviene).toBe(false) // los mismos 8000 contra un piso de 9000
  })

  // El trabajo se paga por unidad, igual que el PVP de feria: un costo plano haría viajar gratis
  // al segundo producto.
  it('el costo del trabajo se multiplica por las unidades', () => {
    const r = convieneRetorno([item(20000, 2, { pvp_feria: 9000 })], { fallada: true, envioVuelta: 2000, costoOperativoPorUnidad: 2500 })
    expect(r.costoDeTraerlo).toBe(7000) // 2000 de envío + 2 × 2500
  })

  /**
   * 🔑 Las dos negativas ⛔ no dicen lo mismo, y quien decide necesita saber cuál es: una es
   * "perdés plata", la otra es "ganás tan poco que no vale el trabajo". Un solo cartel para las dos
   * dejaría el caso al borde indistinguible del caso perdido.
   */
  it('«perdés plata» y «apenas empata» son carteles distintos', () => {
    const pierde = convieneRetorno([item(20000, 1, { pvp_feria: 3000 })], { fallada: true, envioVuelta: 4000, costoOperativoPorUnidad: 0 })
    const empata = convieneRetorno([item(20000, 1, { pvp_feria: 6000 })], { fallada: true, envioVuelta: 4000, costoOperativoPorUnidad: 0 })
    expect(pierde.conviene).toBe(false)
    expect(empata.conviene).toBe(false)
    expect(pierde.motivo).toContain('No conviene')
    expect(empata.motivo).toContain('Apenas empata')
    expect(pierde.motivo).not.toContain('Apenas empata')
  })

  // ⚠️ El cartel nombra los dos sumandos SÓLO cuando los dos existen: "y 0 de recibirlo" es un
  // número que existe y no significa nada.
  it('el desglose del costo nombra el trabajo sólo si lo hay, y suma', () => {
    const con = convieneRetorno([item(90000, 1, { pvp_feria: 45000 })], { fallada: true, envioVuelta: 6000, costoOperativoPorUnidad: 1500 })
    expect(con.motivo).toContain('7500')
    expect(con.motivo).toContain('6000 de envío')
    expect(con.motivo).toContain('1500 de recibirlo')
    const sin = convieneRetorno([item(90000, 1, { pvp_feria: 45000 })], { fallada: true, envioVuelta: 6000, costoOperativoPorUnidad: 0 })
    expect(sin.motivo).not.toContain('de recibirlo')
  })
})

describe('costoDelCaso', () => {
  /**
   * 🔴 **El defecto que destapó partir el destino en dos (26-ago-2026).** `destino` no aceptaba
   * `null`, así que la pantalla tapaba el hueco mandando `'falla'` fijo cuando no se pedía el
   * retorno — y en una **demora** eso contaba el costo entero de la mercadería como perdida, cuando
   * el cliente la recibió, la pagó y es suya. `null` significa "no hay producto en juego" y vale
   * cero: es lo que contestan la demora y la cancelación.
   */
  it('sin producto en juego (null) no se pierde ninguna unidad', () => {
    const c = costoDelCaso({ montoDevuelto: 0, items: [item(12000, 1, { costo: 2000 })], destino: null })
    expect(c).toBe(0)
  })

  it('la regalada SÍ se pierde: salió por la puerta', () => {
    const c = costoDelCaso({ montoDevuelto: 0, items: [item(12000, 1, { costo: 2000 })], destino: 'regalada' })
    expect(c).toBe(2000)
  })

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
  })

  /**
   * 🔴 **Las cuatro filas donde los dos lados contestaban distinto** (28-ago-2026).
   *
   * La pregunta siempre fue `anulaVenta` —lo dice el docstring de la función: *«la venta original
   * se anula, y al anularla la unidad vuelve al stock»*—, pero estaba escrita a mano como
   * `compensacion !== 'otra_unidad'`. Era una copia fiel de la tabla del día en que se escribió; el
   * **27-ago-2026** `reenvio`, `cupon` y `ninguna` dejaron de anular la venta —encendían pendientes
   * que nadie podía tildar— y la copia se quedó como estaba.
   *
   * ⚠️ **Lo que costaba: el alta en Fallas descontaba una unidad que la venta original ya había
   * descontado.** Stock corto por uno, sin ningún error, hasta el próximo conteo — que es
   * exactamente el daño que esta función dice arriba que viene a evitar.
   *
   * 🔑 `otro_producto` es el mismo caso y **ya estaba mal desde antes**: en un cambio la venta ⛔ no
   * se anula nunca —el cliente se queda con la compra—, así que la unidad que devolvió sigue
   * descontada; si en vez de reingresarla se pasa a Fallas, descontarla es restarla dos veces.
   */
  it('si la venta queda EN PIE, la falla ⛔ NO descuenta: esa unidad ya salió con la venta', () => {
    expect(laFallaDescuentaStock('cupon')).toBe(false)
    expect(laFallaDescuentaStock('ninguna')).toBe(false)
    expect(laFallaDescuentaStock('reenvio')).toBe(false)
    expect(laFallaDescuentaStock('otro_producto')).toBe(false)
  })

  // El caso que se presta a error, y el que ya estaba bien.
  it('si se le mandó otra unidad igual, NO descuenta: ese producto ya salió con la venta original', () => {
    expect(laFallaDescuentaStock('otra_unidad')).toBe(false)
  })

  /**
   * 🔑 **El cable, para que ⛔ no vuelva a haber dos respuestas.** Agregar una resolución a
   * `EFECTOS_RESOLUCION` y olvidarse de esta función era, literalmente, el defecto: acá se ponen de
   * acuerdo fila por fila, así que la próxima ⛔ no se puede olvidar.
   */
  it('fila por fila, contesta lo mismo que la tabla de efectos', () => {
    const filas = Object.entries(EFECTOS_RESOLUCION)
    expect(filas.length).toBe(7) // que la extracción no se haya quedado vacía
    for (const [compensacion, efectos] of filas) {
      expect([compensacion, laFallaDescuentaStock(compensacion as Compensacion)])
        .toEqual([compensacion, efectos.anulaVenta === 'siempre'])
    }
  })

  it('sin decidir todavía, se asume que descuenta (el caso más común)', () => {
    expect(laFallaDescuentaStock(null)).toBe(true)
    expect(laFallaDescuentaStock(undefined)).toBe(true)
  })

  /**
   * ⚠️ Esta función **estaba escrita y nunca se conectaba a GN**: `pasarAFallas` creaba la falla en
   * el Monitor y no descontaba nada, así que la unidad no vendible quedaba contada como disponible.
   *
   * El razonamiento, que es el que se pierde fácil: la unidad **ya se descontó con la venta
   * original**. Lo que decide si hay que volver a sacarla es si esa venta se anula.
   */
  it('lo que manda es si la venta original se anula, no que la falla "vuelva"', () => {
    // Se le devolvió la plata → la venta se anula → GN devuelve +1 → hay que volver a sacarla.
    expect(laFallaDescuentaStock('plata_total')).toBe(true)
    // Se le mandó otra igual → la venta NO se anula → la fallada ya está fuera de GN → nada.
    expect(laFallaDescuentaStock('otra_unidad')).toBe(false)
  })
})

describe('pedido mal armado: las dos correcciones', () => {
  /**
   * El único caso con dos movimientos de stock en direcciones OPUESTAS. La cuenta existía con
   * tests y no la llamaba nadie: `items_correctos` se guardaba en el alta y nunca se leía.
   */
  it('si se lo queda y no se le reenvía, hay que corregir los dos lados', () => {
    const c = correccionesMalArmado({ equivocadoVuelve: false, seEnviaElCorrecto: false })
    // El que salió por error nunca se descontó: no estaba en la venta.
    expect(c.descontarEnviadoPorError).toBe(true)
    // El que pidió sigue en el depósito, pero GN lo descontó con la venta.
    expect(c.anularVentaOriginal).toBe(true)
  })

  it('si vuelve el equivocado y se le manda el correcto, el stock cuadra solo', () => {
    const c = correccionesMalArmado({ equivocadoVuelve: true, seEnviaElCorrecto: true })
    expect(c.descontarEnviadoPorError).toBe(false)
    expect(c.anularVentaOriginal).toBe(false)
    expect(c.nota).toContain('cuadra solo')
  })

  it('cada corrección depende de una decisión distinta', () => {
    // Que vuelva el equivocado no dice nada sobre si se reenvía el correcto, y al revés.
    expect(correccionesMalArmado({ equivocadoVuelve: true, seEnviaElCorrecto: false }).anularVentaOriginal).toBe(true)
    expect(correccionesMalArmado({ equivocadoVuelve: false, seEnviaElCorrecto: true }).descontarEnviadoPorError).toBe(true)
  })
})

describe('qué salidas se ofrecen según lo que pasó', () => {
  // Ofrecer "le mandamos otra igual" en un arrepentimiento invita a resolver mal.
  it('arrepentimiento: plata o cupón, nunca reponer', () => {
    const c = compensacionesDe('arrepentimiento', null)
    expect(c).toContain('plata_total')
    expect(c).toContain('plata_parcial')
    expect(c).not.toContain('otra_unidad')
    expect(c).not.toContain('reenvio')
  })

  it('falla: es la que más opciones tiene, incluida reponerla', () => {
    expect(compensacionesDe('falla', null)).toContain('otra_unidad')
    expect(compensacionesDe('falla', null)).toContain('plata_parcial')
  })

  // Si nunca salió no hay producto que negociar: no se le puede ofrecer que se lo quede con
  // descuento algo que nunca tuvo.
  it('faltante y sin stock: sin descuento parcial, porque el cliente no tiene nada', () => {
    for (const m of ['faltante', 'sin_stock'] as const) {
      expect(compensacionesDe(m, null)).not.toContain('plata_parcial')
    }
  })

  /**
   * Los dos "nunca salieron", pero **sólo uno se puede reenviar**, y esa es la diferencia que el
   * código agrupaba mal: en `faltante` el producto está en el depósito (sólo no se metió en la
   * caja) y en `sin_stock` no existe.
   */
  it('faltante se reenvía; sin stock se cambia — mandarle lo que no tenemos es lo único imposible', () => {
    expect(compensacionesDe('faltante', null)).toContain('reenvio')
    expect(compensacionesDe('sin_stock', null)).not.toContain('reenvio')
    expect(compensacionesDe('sin_stock', null)).toContain('otro_producto')
  })

  it('no llegó nunca: solo reponer o devolver', () => {
    expect(compensacionesDe('no_llego', null)).toEqual(['reenvio', 'plata_total'])
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
      expect(hayUnidadFisica('faltante', null)).toBe(true)
      expect(hayUnidadFisica('sin_stock', null)).toBe(false)
    })
  })

  /**
   * El envío de ida: dos razones distintas, alcanza con una.
   *
   * ⚠️ El oráculo **no es lo que hacía el código**: hasta el 24-ago devolvía sólo cuando el cliente
   * no había recibido nada, y una falla se devolvía SIN el envío. La regla es de negocio — si el
   * error fue nuestro, no se le cobra el envío de nuestro error — así que los casos se afirman por
   * lo que corresponde, no por lo que la función devolvía.
   */
  describe('devuelveElEnvioDeIda: si el error fue nuestro, o si no recibió nada', () => {
    it('si el error fue NUESTRO se devuelve el envío, aunque haya recibido el paquete', () => {
      for (const m of ['falla', 'faltante', 'mal_armado'] as MotivoReclamo[]) {
        expect(devuelveElEnvioDeIda(m, null), m).toBe(true)
        // Y estos tres SÍ recibieron algo: es la parte que antes lo dejaba en false.
        expect(PERFIL_MOTIVO[m].recibioAlgo, m).toBe(true)
      }
    })

    it('si no recibió nada se devuelve entero: no hay servicio que cobrar', () => {
      expect(devuelveElEnvioDeIda('no_llego', null)).toBe(true)
      expect(devuelveElEnvioDeIda('sin_stock', null)).toBe(true)
    })

    it('"no llegó" entra por no haber recibido nada, NO por ser culpa nuestra', () => {
      expect(PERFIL_MOTIVO.no_llego.errorPropio).toBe(false)
      expect(PERFIL_MOTIVO.no_llego.recibioAlgo).toBe(false)
      // Que sean dos preguntas es lo que deja reclamarle esa plata al transportista.
      expect(devuelveElEnvioDeIda('no_llego', null)).toBe(true)
    })

    // El envío prestó su servicio: el paquete llegó y era lo que pidió. Devolverlo es regalar plata.
    it('si el error NO fue nuestro, la devolución es del producto únicamente', () => {
      for (const m of ['talle', 'arrepentimiento', 'no_esperaba'] as MotivoReclamo[]) {
        expect(devuelveElEnvioDeIda(m, null), m).toBe(false)
      }
    })

    it('ERROR_PROPIO sale del perfil, no de una lista escrita a mano', () => {
      // ⚠️ `excedente` entró el 25-ago-2026 y es error nuestro por definición: la unidad de más
      // salió del depósito porque alguien la puso en la caja.
      expect([...ERROR_PROPIO].sort()).toEqual(['excedente', 'falla', 'faltante', 'mal_armado', 'sin_stock'])
      for (const m of TODOS) {
        expect(ERROR_PROPIO.includes(m), m).toBe(PERFIL_MOTIVO[m].errorPropio)
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

    /**
     * 🔴 **Dado vuelta el 27-ago-2026, por Bruno**: *«la de que quiere cambiar la prenda, si es con
     * envío, sí necesitamos fotos para ver el estado de la prenda»*. Antes, querer un cambio
     * apagaba el pedido —*«lo trae al mostrador y se ve ahí»*—, y por esta lista entran órdenes
     * ONLINE: la prenda viaja igual. El cambio de mostrador se arma en la pestaña Cambios y ⛔ no
     * pasa por acá.
     */
    it('talle y arrepentimiento: también si quiere cambiarla, porque la prenda viaja', () => {
      for (const m of ['talle', 'arrepentimiento', 'no_esperaba'] as const) {
        expect(pideFotos(m, 'plata'), m).toBe(true)
        expect(pideFotos(m, 'otro_producto'), m).toBe(true)
        expect(pideFotos(m, 'mismo_producto'), m).toBe(true)
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

    /**
     * ⚠️ **La regla cambió el 25-ago-2026, y el cambio es el hallazgo.** Antes esto decía "ninguna
     * queda vacía: siempre hay algo que ofrecerle", y era cierto porque los ocho casos los abría el
     * cliente pidiendo algo. Los casos nuevos rompen esa premisa por dos motivos distintos:
     *
     *  - **`excedente` lo abrimos NOSOTROS.** El cliente no pidió nada: le llegó de más y muchas
     *    veces ni se enteró. Ofrecerle una lista de salidas sería inventarle un reclamo.
     *  - **`demora` no se compensa.** Lo que quiere es que llegue, y eso no está entre las cuatro
     *    expectativas. Poner una para no dejar la lista vacía invita a ofrecer plata donde se
     *    decidió que no va.
     *
     * O sea: la lista vacía **afirma** que no hay nada que ofrecer, no que falte cargarlo.
     */
    it('sólo quedan sin expectativas los casos donde no hay nada que ofrecer', () => {
      const vacias = TODOS.filter((m) => expectativasDe(m).length === 0)
      expect([...vacias].sort()).toEqual(['demora', 'excedente'])
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
        expect(ofreceRetencion(m, null), m).toBe(true)
      }
      for (const m of ['faltante', 'mal_armado', 'no_llego', 'sin_stock'] as const) {
        expect(ofreceRetencion(m, null), m).toBe(false)
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

  /**
   * Lo que se le OFRECE y lo que se puede HACER tienen que hablar del mismo caso.
   *
   * Este bloque existe porque los dos se desincronizaron: al actualizar las expectativas por motivo
   * quedó `sin_stock` prometiendo "cambiarlo por otro" mientras el desplegable de la decisión no
   * ofrecía esa salida — y sí ofrecía **reenviarle lo que falta, que es justo lo único que no
   * tenemos**. Un caso que no se puede resolver como se le prometió es peor que uno mal cargado.
   */
  describe('lo que se ofrece y lo que se hace no se contradicen', () => {
    it('si se puede prometer un cambio, tiene que poder resolverse como cambio', () => {
      for (const m of TODOS) {
        if (expectativasDe(m).includes('otro_producto')) {
          expect(compensacionesDe(m, null), m).toContain('otro_producto')
        }
      }
    })

    it('si se puede prometer que le mandemos lo que falta, tiene que poder reenviarse', () => {
      for (const m of TODOS) {
        if (expectativasDe(m).includes('completar')) {
          expect(compensacionesDe(m, null), m).toContain('reenvio')
        }
      }
    })

    // No tenemos el producto: mandárselo es lo único imposible.
    it('sin stock NO puede ofrecer reenvío', () => {
      expect(compensacionesDe('sin_stock', null)).not.toContain('reenvio')
      expect(compensacionesDe('sin_stock', null)).toContain('otro_producto')
    })

    // Acá sí existe: está en el depósito, sólo no se metió en la caja.
    it('faltante SÍ puede reenviar: el producto existe', () => {
      expect(compensacionesDe('faltante', null)).toContain('reenvio')
      expect(hayUnidadFisica('faltante', null)).toBe(true)
    })

    // Sólo se puede reponer "otra igual" si la unidad existe en algún lado.
    it('nadie ofrece otra unidad igual de algo que no existe', () => {
      for (const m of TODOS) {
        if (!hayUnidadFisica(m, null)) expect(compensacionesDe(m, null), m).not.toContain('otra_unidad')
      }
    })

    it('ningún motivo se queda sin salidas', () => {
      for (const m of TODOS) expect(compensacionesDe(m, null).length, m).toBeGreaterThan(0)
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
        costoOperativoPorUnidad: 0,
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
  const texto = (d: ReclamoRow) => resumenDeLoDecidido(d, 'admin').map((r) => `${r.que}: ${r.valor}`).join(' | ')
  const textoLocal = (d: ReclamoRow) => resumenDeLoDecidido(d, 'local').map((r) => `${r.que}: ${r.valor}`).join(' | ')

  /**
   * La oferta de retención RECHAZADA es la que no se ve en ningún otro lado: la aceptada se
   * adivina por la resolución (termina en "le devolvemos una parte"), la rechazada no dejaba
   * rastro y por eso no se sabía cuántas veces la retención funciona.
   */
  it('muestra la oferta de retención, y sin registro ⛔ no inventa que no se ofreció', () => {
    const conOferta: ReclamoRow = {
      ...base, compensacion: 'otro_producto', retencion_respuesta: 'rechazo', retencion_monto: 6000,
    }
    expect(texto(conOferta)).toContain('no aceptó')
    expect(texto(conOferta)).toContain('6.000')
    // Sin respuesta la línea no está: vacío es SIN REGISTRAR, no "no se le ofreció".
    expect(texto({ ...base, compensacion: 'otro_producto' })).not.toContain('se lo quede')
  })

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
    // ⚠️ El rótulo cambió el 27-ago-2026 («Vuelve como falla (no se revende)» → «Fallado»). Se
    // mira la LÍNEA entera y ⛔ no una frase suelta del rótulo: el resumen tiene que decir qué pasó
    // con el producto, y eso es lo que se está fijando — no cómo está redactado hoy.
    expect(t).toContain('El producto: ' + DESTINO_LABEL.falla)
    expect(t).toContain('$12.000')
  })

  /**
   * 🔑 **La vista del local recorta, ⛔ no miente.** Quien atiende no decide cuánta plata vuelve, y
   * tener el número delante invita a prometerlo en el mostrador. Lo mismo con el escenario: es la
   * mitad de lo que decide la plata («la publicación es culpa nuestra sólo si la diferencia es
   * objetiva»), y verlo invita a discutir el veredicto con el cliente.
   *
   * ⚠️ Lo que queda tiene que **alcanzar para contestarle al cliente**: el caso, qué recibe, qué
   * pasa con el producto. Si además se recortara eso, la pantalla dejaría de servir para lo único
   * que el local hace con ella.
   */
  it('al local ⛔ no le muestra un solo número de plata', () => {
    // ⚠️ El escenario tiene que ser DE ESTE motivo o la línea no existe y el caso queda verde por
    // vacío — que es exactamente cómo este mismo caso pasó sin probar nada la primera vez.
    const d: ReclamoRow = {
      ...base, motivo: 'no_esperaba', escenario: 'info_confusa',
      compensacion: 'plata_total', monto_total: 8000, costo_caso: 12000,
      destino_prenda: 'falla', retencion_respuesta: 'rechazo', retencion_monto: 6000,
    }
    // El control de que el escenario EXISTE: mirado por Administración, la línea está.
    expect(texto(d)).toContain('Qué se encontró')
    const t = textoLocal(d)
    expect(t).not.toContain('8.000')
    expect(t).not.toContain('12.000')
    expect(t).not.toContain('6.000')
    expect(t).not.toContain('Qué se encontró')
    // Y sigue sirviendo para contestarle al cliente:
    expect(t).toContain('Se le devuelve todo')
    expect(t).toContain('El producto: ' + DESTINO_LABEL.falla)
  })

  // ⚠️ El control: el mismo reclamo, mirado por Administración, SÍ tiene los tres números. Sin
  // esto, un resumen roto que no muestre nada a nadie pasaría los dos casos.
  it('y a Administración sí, que es quien decide', () => {
    const d: ReclamoRow = {
      ...base, motivo: 'no_esperaba', escenario: 'info_confusa',
      compensacion: 'plata_total', monto_total: 8000, costo_caso: 12000,
      retencion_respuesta: 'rechazo', retencion_monto: 6000,
    }
    const t = texto(d)
    expect(t).toContain('Qué se encontró')
    expect(t).toContain('8.000')
    expect(t).toContain('12.000')
    expect(t).toContain('6.000')
  })

  // Se guarda lo que sugirió la cuenta ADEMÁS de lo que se hizo: sirve para ver cuándo se va en
  // contra y si valió la pena.
  it('marca cuándo se fue en contra de la cuenta', () => {
    const t = texto({ ...base, compensacion: 'plata_total', retorno_sugerido: false, retorno_decidido: true, via_retorno: 'andreani' })
    expect(t).toContain('en contra de lo que sugería la cuenta')
    const ok = texto({ ...base, compensacion: 'plata_total', retorno_sugerido: true, retorno_decidido: true })
    expect(ok).not.toContain('en contra')
  })

  /**
   * 🔴 **«En contra» es alguien que decidió distinto que la cuenta, ⛔ no el sistema apagando el
   * retorno solo** (28-ago-2026). Cuando el cliente ACEPTA quedárselo, el retorno se apaga —tenerlo
   * prendido contaría el producto dos veces— y `retorno_sugerido` se queda con el `true` viejo.
   * R-0022 leía *«No — en contra de lo que sugería la cuenta»* sobre algo que nadie decidió:
   * **acusaba a Administración de una decisión que tomó el cliente.**
   */
  it('aceptar la oferta apaga el retorno, y eso ⛔ NO es ir en contra de la cuenta', () => {
    const acepto: ReclamoRow = {
      ...base, compensacion: 'plata_parcial', monto_total: 13491,
      retorno_sugerido: true, retorno_decidido: false,
      retencion_respuesta: 'acepto', retencion_monto: 13491, retencion_forma: 'plata',
    }
    const t = texto(acepto)
    expect(t).not.toContain('en contra')
    // ⚠️ Y ⛔ no se calla: dice QUIÉN lo apagó. Borrar la línea sería el mismo hueco por la otra punta.
    expect(t).toContain('el cliente aceptó quedárselo')
    // El control: rechazar ⛔ no apaga nada, así que la señal de «en contra» sigue viva.
    const rechazo = texto({ ...acepto, retencion_respuesta: 'rechazo', retorno_decidido: false })
    expect(rechazo).toContain('en contra de lo que sugería la cuenta')
  })

  it('la expectativa se lee con la etiqueta del caso', () => {
    const t = texto({ ...base, motivo: 'sin_stock', expectativa: 'otro_producto' })
    expect(t).toContain('Cambiarlo por otro producto')
  })
})

describe('el destino de el producto sale del motivo', () => {
  it('faltante y sin stock: nunca salió', () => {
    expect(destinoDe('faltante', false, null)).toBe('no_salio')
    expect(destinoDe('sin_stock', false, null)).toBe('no_salio')
  })

  it('no llegó nunca: se perdió en el camino, ni vuelve ni está', () => {
    expect(destinoDe('no_llego', false, null)).toBe('perdida')
  })

  it('falla: va al ledger de Fallas, vuelva o no', () => {
    expect(destinoDe('falla', true, null)).toBe('falla')
    expect(destinoDe('falla', false, null)).toBe('falla')
  })

  it('arrepentimiento: vuelve a stock si vuelve', () => {
    expect(destinoDe('arrepentimiento', true, null)).toBe('stock')
  })

  it('sin producto que pueda volver, media pantalla sobra', () => {
    expect(puedeVolverLaPrenda('faltante', null)).toBe(false)
    expect(puedeVolverLaPrenda('no_llego', null)).toBe(false)
    expect(puedeVolverLaPrenda('falla', null)).toBe(true)
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

  /**
   * "En camino de vuelta" es mentira cuando **no hay nada viajando**, y eso pasa por DOS motivos
   * distintos: hay alguien que no vino todavía, o **le falta la etiqueta para poder despachar**.
   *
   * 🔴 **La segunda mitad la corrigió Bruno el 28-ago-2026** y este test afirmaba la premisa vieja:
   * `andreani` sin `seguimiento_vuelta` daba "En camino de vuelta" sobre un paquete que el cliente
   * ⛔ todavía no puede despachar. Es la misma mentira que ya se había corregido para el
   * `presencial`, entrando por la otra puerta.
   */
  it('el estado se lee distinto si la trae al local, o si falta la etiqueta', () => {
    expect(estadoEnCriollo({ estado: 'en_transito', via_retorno: 'presencial' })).toBe('Esperando que lo traiga')
    expect(estadoEnCriollo({ estado: 'en_transito', via_retorno: 'andreani' })).toBe('Falta mandarle la etiqueta')
    expect(estadoEnCriollo({ estado: 'en_transito', via_retorno: 'andreani', seguimiento_vuelta: 'AR1' })).toBe('En camino de vuelta')
    expect(estadoEnCriollo({ estado: 'recibido', via_retorno: 'presencial' })).toBe('Recibido')
  })

  /**
   * ⚠️ **Sólo las vías CON seguimiento**: el cadete y el «lo trae al local» ⛔ no tienen etiqueta
   * que mandar, y el segundo ya tiene su propia lectura. Y ⛔ sólo en `en_transito`: un reclamo
   * recibido o cerrado ya no espera nada.
   */
  it('faltaMandarLaEtiqueta: sólo donde hay etiqueta que mandar y todavía no está', () => {
    expect(faltaMandarLaEtiqueta({ estado: 'en_transito', via_retorno: 'correo' })).toBe(true)
    expect(faltaMandarLaEtiqueta({ estado: 'en_transito', via_retorno: 'correo', seguimiento_vuelta: 'AR1' })).toBe(false)
    expect(faltaMandarLaEtiqueta({ estado: 'en_transito', via_retorno: 'cadete' })).toBe(false)
    expect(faltaMandarLaEtiqueta({ estado: 'en_transito', via_retorno: 'presencial' })).toBe(false)
    expect(faltaMandarLaEtiqueta({ estado: 'en_transito', via_retorno: null })).toBe(false)
    expect(faltaMandarLaEtiqueta({ estado: 'recibido', via_retorno: 'correo' })).toBe(false)
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
    const c = cuentaDescuento({ items: [funda], fallada: true, envioVuelta: 6000, costoOperativoPorUnidad: 0 })
    expect(c.techo).toBe(14500) // 8500 de depreciación + 6000 de envío
    expect(c.seePierdeSiVuelve).toBe(14500)
  })

  // Lo contraintuitivo: el techo supera el precio, así que regalarlo sale más barato que pedirlo.
  it('fallada barata: avisa que conviene regalarlo', () => {
    const c = cuentaDescuento({ items: [funda], fallada: true, envioVuelta: 6000, costoOperativoPorUnidad: 0 })
    expect(c.convieneRegalar).toBe(true)
    expect(c.motivo).toContain('regalarlo')
  })

  // Un producto sano vuelve a stock y se revende: lo único que se pierde es la logística.
  it('sana: el techo es solo lo que se ahorra en logística', () => {
    const c = cuentaDescuento({ items: [funda], fallada: false, envioVuelta: 6000, costoOperativoPorUnidad: 0 })
    expect(c.techo).toBe(6000)
    expect(c.convieneRegalar).toBe(false)
  })

  it('el sugerido es la mitad del techo: el techo es el límite, no la oferta', () => {
    expect(cuentaDescuento({ items: [funda], fallada: false, envioVuelta: 6000, costoOperativoPorUnidad: 0 }).sugerido).toBe(3000)
  })

  it('el sugerido nunca supera el precio del producto', () => {
    const c = cuentaDescuento({ items: [funda], fallada: true, envioVuelta: 20000, costoOperativoPorUnidad: 0 })
    expect(c.sugerido).toBeLessThanOrEqual(12000)
  })

  it('el costo operativo también se ahorra y sube el techo', () => {
    const c = cuentaDescuento({ items: [funda], fallada: false, envioVuelta: 6000, costoOperativoPorUnidad: 1500 })
    expect(c.techo).toBe(7500)
  })

  // Sin el PVP de feria no se puede saber cuánto se deprecia: mejor decirlo que inventar un número.
  it('fallada sin PVP de feria: avisa en vez de calcular cualquier cosa', () => {
    const c = cuentaDescuento({ items: [item(12000)], fallada: true, envioVuelta: 6000, costoOperativoPorUnidad: 0 })
    expect(c.techo).toBe(0)
    expect(c.motivo).toContain('PVP de feria')
  })

  /**
   * ── El veredicto ──
   *
   * La cuenta ya tenía todo para contestar «¿conviene ofrecer?» y no lo decía: la pantalla lo
   * inferían mirando si el techo era cero, y por eso preguntaba con un campo en $0 lo que se
   * contesta solo. Estos casos fijan que el veredicto salga de acá, y que "no conviene" ⛔ no se
   * confunda con "falta un dato".
   */
  it('sana sin envío que pagar: NO conviene ofrecer nada, y no es que falte un dato', () => {
    const c = cuentaDescuento({ items: [funda], fallada: false, envioVuelta: 0, costoOperativoPorUnidad: 0 })
    expect(c.conviene).toBe(false)
    expect(c.falta).toBe(null)
    // El motivo viejo decía "lo único que perdés es 0 de logística": un número que existe y no
    // significa nada, leído como si fuera una pérdida.
    expect(c.motivo).not.toContain('0 de logística')
    expect(c.motivo).toContain('no perdés plata')
  })

  it('sana con envío: conviene ofrecer, y el sugerido es lo que se dice', () => {
    const c = cuentaDescuento({ items: [funda], fallada: false, envioVuelta: 6000, costoOperativoPorUnidad: 0 })
    expect(c.conviene).toBe(true)
    expect(c.sugerido).toBe(3000)
  })

  // ⚠️ El mismo `conviene: false` por dos causas distintas: acá SÍ falta un dato, y decirlo es lo
  // que evita que se lea como veredicto.
  it('fallada sin PVP de feria: no contesta, y dice qué le falta', () => {
    const c = cuentaDescuento({ items: [item(12000)], fallada: true, envioVuelta: 6000, costoOperativoPorUnidad: 0 })
    expect(c.conviene).toBe(false)
    expect(c.falta).toBe('pvp_feria')
  })

  it('el costo operativo puede hacer que convenga ofrecer donde el envío solo no alcanzaba', () => {
    const sin = cuentaDescuento({ items: [funda], fallada: false, envioVuelta: 0, costoOperativoPorUnidad: 0 })
    const con = cuentaDescuento({ items: [funda], fallada: false, envioVuelta: 0, costoOperativoPorUnidad: 1500 })
    expect(sin.conviene).toBe(false)
    expect(con.conviene).toBe(true)
  })

  it('un producto cara y fallada: el techo NO llega a regalarlo', () => {
    const cara = item(90000, 1, { pvp_feria: 45000 })
    const c = cuentaDescuento({ items: [cara], fallada: true, envioVuelta: 6000, costoOperativoPorUnidad: 0 })
    expect(c.techo).toBe(51000)
    expect(c.convieneRegalar).toBe(false)
  })

  /**
   * ── El costo operativo, desde el 30-ago-2026 ──
   *
   * 🔴 Era opcional y **la pantalla nunca se lo pasaba**, así que toda la vida del módulo el techo
   * se calculó con un sumando en 0 que nadie había decidido (B5). Ahora es obligatorio, y **por
   * unidad**: un reclamo de dos prendas se recibe, se revisa y se reingresa dos veces.
   */
  it('el costo del trabajo se multiplica por las unidades', () => {
    const dos = item(12000, 2, { pvp_feria: 3500 })
    const con = cuentaDescuento({ items: [dos], fallada: false, envioVuelta: 6000, costoOperativoPorUnidad: 1500 })
    const sin = cuentaDescuento({ items: [dos], fallada: false, envioVuelta: 6000, costoOperativoPorUnidad: 0 })
    expect(sin.techo).toBe(6000)
    expect(con.techo).toBe(9000) // 6000 de envío + 2 × 1500, ⛔ no 7500
  })

  /**
   * 🔴 🔑 **El cartel tiene que SUMAR.** El desglose viejo nombraba dos sumandos fijos («se
   * deprecia X más Y de envío») y el tercero se sumaba callado: prender el costo operativo habría
   * dejado un texto donde las partes ⛔ no dan el total, con los dos números correctos por separado.
   */
  it('el desglose del motivo suma exactamente el total', () => {
    const c = cuentaDescuento({ items: [item(90000, 1, { pvp_feria: 45000 })], fallada: true, envioVuelta: 6000, costoOperativoPorUnidad: 1500 })
    expect(c.seePierdeSiVuelve).toBe(52500)
    expect(c.motivo).toContain('52500')
    const partes = [...c.motivo.matchAll(/(\d+) de (depreciación|envío|recibirlo)/g)].map((m) => Number(m[1]))
    expect(partes).toHaveLength(3)
    expect(partes.reduce((a, b) => a + b, 0)).toBe(52500)
  })

  // ⚠️ Con 0 el sumando ⛔ no se nombra: "y 0 de recibirlo" es un número que existe y no significa
  // nada, leído como si fuera una pérdida.
  it('el desglose ⛔ no nombra los sumandos que valen cero', () => {
    const c = cuentaDescuento({ items: [funda], fallada: false, envioVuelta: 6000, costoOperativoPorUnidad: 0 })
    expect(c.motivo).toContain('6000 de envío')
    expect(c.motivo).not.toContain('de recibirlo')
    expect(c.motivo).not.toContain('de depreciación')
  })
})

/**
 * ── Cuánto vale un cupón frente a la plata (B6, Bruno, 30-ago-2026) ──
 *
 * Venía de la reunión —×2— y ⛔ no estaba escrito en ningún lado: el monto se tipeaba libre, así
 * que ⛔ no se podía auditar si una compensación estuvo bien dada.
 */
describe('ofertaSegunForma: el cupón vale ×2', () => {
  const funda = item(12000, 1, { costo: 2000, pvp_feria: 3500 })
  const cuenta = cuentaDescuento({ items: [funda], fallada: false, envioVuelta: 6000, costoOperativoPorUnidad: 1500 })

  it('en plata devuelve la cuenta tal cual: ⛔ no la toca', () => {
    const o = ofertaSegunForma(cuenta, 'plata')
    expect(o.techo).toBe(cuenta.techo)
    expect(o.sugerido).toBe(cuenta.sugerido)
  })

  /**
   * 🔴 **Los números van a mano, ⛔ no `× MULTIPLO_CUPON`.** Escrito contra la propia constante el
   * caso es tautológico: bajarla a 1 lo dejaba VERDE, o sea que el test que existe para fijar el
   * ×2 era justo el que ⛔ no lo miraba. Lo delató el mutante.
   */
  it('en cupón el techo Y el sugerido van ×2', () => {
    expect(cuenta.techo).toBe(7500) // 6000 de envío + 1500 de recibirlo
    expect(cuenta.sugerido).toBe(3750)
    const o = ofertaSegunForma(cuenta, 'cupon')
    expect(o.techo).toBe(15000)
    expect(o.sugerido).toBe(7500)
    expect(MULTIPLO_CUPON).toBe(2)
  })

  /**
   * 🔑 **Los dos números tienen que moverse juntos.** Duplicar el sugerido y dejar el techo en
   * plata haría que la sugerencia del sistema naciera pasada de su propio techo: el aviso saltaría
   * sobre el número que él mismo puso.
   */
  it('el sugerido en cupón ⛔ no se pasa de su propio techo', () => {
    const o = ofertaSegunForma(cuenta, 'cupon')
    expect(o.sugerido).toBeLessThanOrEqual(o.techo)
  })

  // Con techo 0 ⛔ no hay nada que duplicar: el ×2 de cero sigue siendo cero, y "no conviene
  // ofrecer" ⛔ no puede volverse "ofrecele algo" por elegir cupón.
  it('sin nada que perder, el cupón tampoco abre una oferta', () => {
    const nada = cuentaDescuento({ items: [funda], fallada: false, envioVuelta: 0, costoOperativoPorUnidad: 0 })
    expect(nada.conviene).toBe(false)
    expect(ofertaSegunForma(nada, 'cupon').techo).toBe(0)
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

  /**
   * 🔑 **El descuento de lo regalado es "siempre", no "si alguien se acuerda".** La unidad sana que
   * se queda el cliente salió del depósito y Gestión Nube la sigue contando: si el reclamo se
   * cierra sin sacarla, el stock queda de más hasta que la encuentre un conteo — el mismo agujero
   * que del otro lado tapó `descontarReemplazo`.
   */
  it('una regalada sin descontar traba el cierre, y sellada lo destraba', () => {
    const regalado: ReclamoRow = {
      ...base, motivo: 'excedente', compensacion: 'ninguna', destino_prenda: 'regalada',
      items: [item(12000)],
    }
    expect(faltantesParaCerrar(regalado).join(' ')).toContain('descontar de Gestión Nube')
    const sellado = { ...regalado, items: [item(12000, 1, { baja_at: '2026-08-26T12:00:00.000Z' })] }
    expect(faltantesParaCerrar(sellado)).toEqual([])
  })

  /** La fallada no entra por acá: la descuenta el alta en Fallas, que además la valúa. */
  it('una falla que se queda el cliente ⛔ no pide este descuento', () => {
    const fallado: ReclamoRow = {
      ...base, destino_prenda: 'falla', items: [item(12000)], fotos: [{ url: 'x', at: '2026-08-26' }],
    }
    expect(faltantesParaCerrar(fallado).join(' ')).not.toContain('descontar de Gestión Nube')
  })

  /**
   * El cupón es una **promesa** hasta que existe en la tienda: se emite a mano y el código se
   * tipea. Hasta el 25-ago-2026 nada lo verificaba, así que un reclamo se cerraba "con cupón" y el
   * cliente descubría en la próxima compra que el código no anda.
   */
  it('un cupón sin emitir traba el cierre', () => {
    const f = faltantesParaCerrar({ ...base, compensacion: 'cupon', cupon_estado: 'pendiente' })
    expect(f.join(' ')).toContain('crear el cupón en la tienda')
    // Ya emitido, no traba nada.
    expect(faltantesParaCerrar({ ...base, compensacion: 'cupon', cupon_estado: 'hecho', cupon_codigo: 'BDI-2026' })).toEqual([])
  })

  /**
   * Lo que sale HACIA el cliente. El pendiente lo dejan el cambio, la reposición y el reenvío, y
   * hasta el 25-ago-2026 **no tenía botón con qué tildarse**: cerraba el paso y no lo abría nadie.
   */
  it('lo que se le manda y todavía no salió traba el cierre', () => {
    const f = faltantesParaCerrar({ ...base, compensacion: 'reenvio', envio_nuevo_estado: 'pendiente' })
    expect(f.join(' ')).toContain('despachar lo que se le manda')
    expect(faltantesParaCerrar({ ...base, compensacion: 'reenvio', envio_nuevo_estado: 'hecho' })).toEqual([])
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

    /**
     * 🔑 **Hay un escenario en que ni siquiera hay algo que decidir: el paquete sigue viajando.**
     *
     * En "no llegó", los tres primeros escenarios son seguimiento —en tránsito, demorado, sin
     * movimientos— y el caso se abre recién cuando se da por extraviado. Decir "decidir qué se
     * hace" ahí es pedirle a alguien que resuelva un caso que todavía no existe: hasta el
     * 25-ago-2026 un `no_llego` se daba por perdido desde el minuto cero, y un pedido que aparecía
     * no tenía salida.
     */
    it('si el escenario dice que todavía es seguimiento, no pide decidir', () => {
      const viajando: ReclamoRow = { ...sinDecidir, motivo: 'no_llego', escenario: 'en_transito' }
      expect(faltantesParaCerrar(viajando)[0]).toContain('seguir el envío')
      expect(faltantesParaCerrar(viajando).join(' ')).not.toContain('decidir qué se hace')

      // Extraviado SÍ es un caso: ahí se decide.
      const perdido: ReclamoRow = { ...sinDecidir, motivo: 'no_llego', escenario: 'extraviado' }
      expect(faltantesParaCerrar(perdido)).toContain('decidir qué se hace')
      // Y sin escenario cargado se comporta como siempre: pide decidir.
      const sinMirar: ReclamoRow = { ...sinDecidir, motivo: 'no_llego' }
      expect(faltantesParaCerrar(sinMirar)).toContain('decidir qué se hace')
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
    const uno = [{ producto: 'Buzo', cantidad: 1 }]
    expect(faltantesParaCerrar({ ...base, items: uno, destino_prenda: 'stock', estado: 'en_transito' }))
      .toContain('recibir el producto')
  })

  /**
   * 🔑 **Recibir es por PRODUCTO.** Antes esto miraba el estado de la FILA, así que un reclamo de
   * dos productos se daba por recibido entero con uno solo en la mano — y en BDI **3 de cada 10 ya
   * tienen dos**. Con uno tildado, lo que falta es el otro; con los dos, no falta nada.
   */
  it('con dos productos, cuenta los que faltan y ⛔ no se da por recibido con uno', () => {
    const dos = [
      { producto: 'Buzo', cantidad: 1 },
      { producto: 'Gorra', cantidad: 1 },
    ]
    const enCamino: ReclamoRow = { ...base, items: dos, destino_prenda: 'stock', estado: 'en_transito' }
    expect(faltantesParaCerrar(enCamino)).toContain('recibir los 2 productos que faltan')

    const llegoUno = { ...enCamino, items: [{ ...dos[0], recibida_at: '2026-08-25T12:00:00Z' }, dos[1]] }
    expect(faltantesParaCerrar(llegoUno)).toContain('recibir el producto')

    const llegaronLosDos = { ...enCamino, items: dos.map((i) => ({ ...i, recibida_at: '2026-08-25T12:00:00Z' })) }
    expect(faltantesParaCerrar(llegaronLosDos)).toEqual([])
  })

  /**
   * El destino es de la UNIDAD y el del reclamo es su default: uno puede volver sano a stock y el
   * otro quedárselo el cliente. Sólo se espera el que vuelve.
   */
  it('la unidad que se queda el cliente no se espera, aunque el reclamo diga "vuelve"', () => {
    const dos: ItemReclamo[] = [
      { producto: 'Buzo', cantidad: 1 },
      { producto: 'Gorra', cantidad: 1, destino: 'perdida' },
    ]
    expect(faltantesParaCerrar({ ...base, items: dos, destino_prenda: 'stock', estado: 'en_transito' }))
      .toContain('recibir el producto')
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

  /**
   * 🔴 **El único reloj que corre sobre un reclamo que puede estar YA decidido.** Se le ofreció que
   * se lo quede, se guardó la salida por si dice que no, y el caso queda quieto esperando una
   * respuesta que capaz no llega nunca: `sinDecidir` y `plata` ⛔ no lo agarran, porque desde su
   * punto de vista está todo hecho.
   */
  describe('la oferta que se mandó y nadie contestó', () => {
    const esperando = (extra: Partial<ReclamoRow>) => fila({
      estado: 'resuelto', compensacion: 'plata_total', retencion_monto: 13491, retencion_forma: 'plata',
      retencion_respuesta: null, ...extra,
    })

    it('alerta a los 3 días de hecha la oferta', () => {
      const a = alertasDe(esperando({ retencion_at: hace(4) }), AHORA)
      expect(a[0].texto).toContain('no contestó')
      expect(a[0].dias).toBe(4)
    })

    it('antes del plazo no alerta', () => {
      expect(alertasDe(esperando({ retencion_at: hace(1) }), AHORA)).toEqual([])
    })

    it('contestada se apaga, aunque la fecha sea vieja', () => {
      expect(alertasDe(esperando({ retencion_at: hace(30), retencion_respuesta: 'rechazo' }), AHORA)).toEqual([])
    })

    /**
     * 🔴 La razón de ser de la columna: **cuenta desde el EVENTO**. Con `updated_at`, ir a ver por
     * qué el cliente no contesta —el toque más probable sobre este caso— apagaría la alarma.
     */
    it('tocar el reclamo ⛔ no reinicia el reloj', () => {
      const a = alertasDe(esperando({ retencion_at: hace(9), updated_at: hace(0) }), AHORA)
      expect(a[0].dias).toBe(9)
    })

    /**
     * ⚠️ Una oferta sin fecha (fila anterior a la columna) se ve, pero ⛔ no dispara el reloj.
     * Contar desde `created_at` sería afirmar una espera que nadie midió.
     */
    it('una oferta vieja sin fecha ⛔ no inventa una espera', () => {
      expect(diasEsperandoLaOferta(esperando({ retencion_at: null, created_at: hace(40) }), AHORA)).toBe(0)
      expect(alertasDe(esperando({ retencion_at: null, created_at: hace(40) }), AHORA)).toEqual([])
    })
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

  /**
   * 🔴 **D4 · el reclamo que se queda MUDO cuando el cliente dice que no** (30-ago-2026).
   *
   * `liberar-decision` borra `compensacion` y deja la oferta en pie a propósito ⇒ existe la fila
   * con una oferta viva y ⛔ ninguna rama guardada (R-0022). Registrar el rechazo **apagaba** el
   * aviso de la oferta —`ofertaEsperandoRespuesta` pasa a `false`— y ⛔ no encendía nada, porque
   * el único reloj que quedaba contaba desde `updated_at`, **que ese mismo write acababa de
   * mover**. O sea: anotar que el cliente contestó apagaba las tres formas que el caso tenía de
   * aparecer, justo cuando ya no dependía de él.
   */
  describe('D4 · el cliente dijo que no y ⛔ no hay decisión', () => {
    const rechazado = (extra: Partial<ReclamoRow>) => fila({
      estado: 'en_revision', compensacion: null,
      retencion_monto: 13491, retencion_forma: 'plata', retencion_respuesta: 'rechazo', ...extra,
    })

    /**
     * 🔑 **Plazo 0, por lo mismo que `plataSinProducto`**: ⛔ no es una demora que se tolera unos
     * días, es un estado que ⛔ no debería existir. El cliente ya contestó y está esperando.
     */
    it('avisa desde el día uno, sin inventar una espera', () => {
      const a = alertasDe(rechazado({ historial: [{ estado: 'en_revision', at: hace(0) }] }), AHORA)
      expect(a[0].texto).toBe('El cliente no aceptó la oferta y el reclamo no tiene decisión')
      expect(a[0].tono).toBe('danger')
      expect(a[0].dias).toBe(0)
    })

    /**
     * 🔴 **El reloj arranca en el RECHAZO y ⛔ no en el último toque.** El sello es el evento
     * `en_revision` que apila el handler al registrar la respuesta: sin él —contando desde
     * `updated_at`— el propio gesto de anotar el «no» ponía el contador en cero
     * ⇒ [[feedback_areben_updated_at_no_mide_la_espera]], cuarta vuelta en este archivo.
     */
    it('cuenta desde el rechazo, y tocar el reclamo ⛔ no lo reinicia', () => {
      const a = alertasDe(rechazado({
        historial: [{ estado: 'en_revision', at: hace(6) }],
        updated_at: hace(0),
      }), AHORA)
      expect(a[0].dias).toBe(6)
      expect(a[0].texto).toContain('hace 6 días')
    })

    /**
     * ⚠️ **Son EXCLUYENTES**: los dos son el mismo pendiente —hay que decidir— visto desde dos
     * momentos, y apilarlos diría dos veces lo mismo con dos números distintos.
     */
    it('⛔ no se apila con «Esperando una decisión»', () => {
      const a = alertasDe(rechazado({ historial: [{ estado: 'en_revision', at: hace(9) }] }), AHORA)
      expect(a.filter((x) => x.texto.includes('decisión')).length).toBe(1)
      expect(a.some((x) => x.texto.includes('Esperando una decisión'))).toBe(false)
    })

    /**
     * 🔑 **Con decisión guardada ⛔ no avisa nada**: ahí la premisa vieja es verdadera —el rechazo
     * cae sobre la salida «si dice que no», que ya está en la fila— y el caso sigue su curso.
     * Sin esta mitad, el aviso nuevo se prendería sobre todos los rechazos.
     */
    it('con decisión guardada, el rechazo ⛔ no avisa', () => {
      // ⚠️ **En `en_revision` a propósito.** Con `estado: 'resuelto'` el mutante que borra
      // `!d.compensacion` SOBREVIVE: lo apagaba el guard del estado, así que el test no ejercía
      // el que vino a probar. Es el caso tapado de siempre en este módulo.
      const a = alertasDe(rechazado({
        compensacion: 'plata_total',
        historial: [{ estado: 'en_revision', at: hace(9) }],
      }), AHORA)
      expect(a.some((x) => x.texto.includes('no aceptó'))).toBe(false)
    })

    /**
     * 🔑 **Pregunta por el RECHAZO y ⛔ no por «hay una respuesta»**: el aviso dice *«no aceptó»*,
     * así que prenderlo sobre un `acepto` sería afirmarle a quien lo lee lo contrario de lo que
     * pasó. La otra mitad de la misma condición.
     */
    it('un «aceptó» ⛔ no enciende el aviso del rechazo', () => {
      const a = alertasDe(rechazado({
        retencion_respuesta: 'acepto',
        historial: [{ estado: 'en_revision', at: hace(9) }],
      }), AHORA)
      expect(a.some((x) => x.texto.includes('no aceptó'))).toBe(false)
    })

    /**
     * ⚠️ **Una fila vieja sin `historial` ⛔ no se rompe ni inventa**: `desdeQueEsta` cae en
     * `updated_at`, que es exactamente lo que había antes.
     */
    it('una fila sin historial avisa igual, con el último toque', () => {
      const a = alertasDe(rechazado({ updated_at: hace(2) }), AHORA)
      expect(a[0].texto).toContain('hace 2 días')
    })
  })

  it('un paquete que no llega hace 15 días alerta', () => {
    expect(alertasDe(fila({ estado: 'en_transito', updated_at: hace(16) }), AHORA)[0].texto).toContain('no llega')
  })

  /**
   * 🔴 **La demora NUESTRA y la AJENA eran el mismo reloj** (partido el 28-ago-2026).
   *
   * Por correo o Andreani, `en_transito` empieza **antes** de que exista la etiqueta: el cliente ⛔
   * no tiene con qué despachar. El reloj único acusaba a los 15 días a un transporte que **nunca
   * recibió el paquete** — y a quién hay que ir a buscar es justo lo que un aviso tiene que decir.
   */
  describe('la etiqueta que no sale', () => {
    const enCamino = (extra = {}) => fila({ estado: 'en_transito', compensacion: 'plata_total', via_retorno: 'andreani', ...extra })

    it('a los 2 días avisa, y es NUESTRA: danger', () => {
      const a = alertasDe(enCamino({ updated_at: hace(3) }), AHORA)
      expect(a[0].texto).toContain('no le mandamos la etiqueta')
      expect(a[0].tono).toBe('danger')
    })

    it('antes del plazo ⛔ no avisa', () => {
      expect(alertasDe(enCamino({ updated_at: hace(1) }), AHORA)).toEqual([])
    })

    /** 🔑 Con el código cargado el reloj es del transporte, y el otro se apaga. */
    it('con la etiqueta ya mandada vuelve a ser «no llega», y ⛔ sólo a los 15', () => {
      const conCodigo = enCamino({ seguimiento_vuelta: 'AR123', updated_at: hace(3) })
      expect(alertasDe(conCodigo, AHORA)).toEqual([])
      const vieja = enCamino({ seguimiento_vuelta: 'AR123', updated_at: hace(16) })
      expect(alertasDe(vieja, AHORA)[0].texto).toContain('no llega')
    })

    /**
     * 🔴 **Y a los 15 días sin etiqueta ⛔ NO se le echa la culpa al transporte**: sigue siendo
     * nuestra. Es la mitad de la partición que ⛔ no se ve si sólo se prueba el caso corto.
     */
    it('a los 15 días sin etiqueta sigue siendo NUESTRA, ⛔ no del transporte', () => {
      const a = alertasDe(enCamino({ updated_at: hace(16) }), AHORA)
      expect(a.map((x) => x.texto).join(' ')).toContain('no le mandamos la etiqueta')
      expect(a.some((x) => x.texto.includes('no llega'))).toBe(false)
    })

    /**
     * 🔴 🔑 **Mientras la oferta espera, la espera es DEL CLIENTE.** Se le propuso que se lo quede:
     * mandarle la etiqueta antes de que conteste es dar por hecho que dijo que no, y arrancar un
     * reloj contra nosotros por una espera que ⛔ no es nuestra. Misma lección que `desdeQueEsta`,
     * una vuelta más arriba.
     */
    it('con una oferta esperando respuesta, la etiqueta ⛔ todavía no es nuestro turno', () => {
      const conOferta = enCamino({ updated_at: hace(20), retencion_monto: 8000, retencion_forma: 'plata' })
      expect(laEtiquetaEstaDebida(conOferta)).toBe(false)
      expect(alertasDe(conOferta, AHORA).some((x) => x.texto.includes('etiqueta'))).toBe(false)
      // Y cuando contesta que no, el turno pasa a ser nuestro.
      const contestada = { ...conOferta, retencion_respuesta: 'rechazo' as const }
      expect(laEtiquetaEstaDebida(contestada)).toBe(true)
      expect(alertasDe(contestada, AHORA)[0].texto).toContain('no le mandamos la etiqueta')
    })

    /** ⚠️ El `presencial` y el cadete ⛔ no tienen etiqueta: ahí «no llega» es lo que pasa. */
    it('sin etiqueta que mandar, sigue corriendo el reloj del transporte', () => {
      for (const via of ['presencial', 'cadete'] as const) {
        expect(alertasDe(enCamino({ via_retorno: via, updated_at: hace(3) }), AHORA)).toEqual([])
        expect(alertasDe(enCamino({ via_retorno: via, updated_at: hace(16) }), AHORA)[0].texto).toContain('no llega')
      }
    })
  })

  it('sin compensación decidida, la plata todavía no puede alertar', () => {
    expect(alertasDe(fila({ estado: 'en_revision', reintegro_estado: 'pendiente', updated_at: hace(30), compensacion: null }), AHORA)
      .some((a) => a.texto.includes('plata'))).toBe(false)
  })

  /**
   * 🔴 **El agujero que faltaba: `borrador` es el estado en el que el reclamo NACE y era el único
   * abierto sin ningún reloj.** Un reclamo cargado y nunca enviado al cliente no aparecía en
   * ninguna parte nunca más — y del otro lado hay alguien que ya se quejó.
   */
  describe('el reclamo abierto y nunca enviado', () => {
    const borrador = (extra: Partial<ReclamoRow> = {}) =>
      fila({ estado: 'borrador', compensacion: null, created_at: hace(3), updated_at: hace(3), ...extra })

    it('a los 2 días de abierto avisa, y avisa fuerte: es nuestro, no del cliente', () => {
      const a = alertasDe(borrador({ created_at: hace(2), updated_at: hace(2) }), AHORA)
      expect(a[0].texto).toContain('todavía no se le escribió')
      expect(a[0].tono).toBe('danger')
    })

    it('el de ayer no avisa: cargarlo y escribirle no tiene por qué pasar en el mismo minuto', () => {
      expect(alertasDe(borrador({ created_at: hace(1), updated_at: hace(1) }), AHORA)).toEqual([])
    })

    /**
     * 🔴 🔑 **Este aviso ACUSABA DE ALGO QUE LA PANTALLA ⛔ NO DEJABA HACER** (29-ago-2026, I1 del
     * mapa operativo). Lo único que lo apagaba era que la fila saliera de `borrador`, y el único
     * gesto que la saca es **copiar el mensaje de apertura** — que sólo existe en los casos que
     * piden fotos. En `demora`, `no_llego` y `sin_stock` ⛔ no había un solo mensaje para copiar,
     * así que quedaba prendido en rojo para siempre y sólo lo callaba que Administración decidiera.
     * Tres de los once casos, y los dos donde el cliente escribió más enojado.
     *
     * 🔑 Ahora pregunta **lo que el texto del aviso dice**: si se le escribió. El rastro va al
     * `historial` —el hecho— y ⛔ no a `mensajes`, que salió de `COLS` por peso y acá ⛔ no llegaría.
     */
    it('🔴 escrito el acuse, el aviso se calla — aunque la fila siga en borrador', () => {
      const mudo = borrador({ motivo: 'no_llego', created_at: hace(9), updated_at: hace(9) })
      expect(alertasDe(mudo, AHORA)[0].texto).toContain('todavía no se le escribió')

      const escrito = borrador({
        motivo: 'no_llego', created_at: hace(9), updated_at: hace(9),
        historial: [
          { estado: 'borrador', at: hace(9), nota: 'reclamo abierto' },
          { estado: 'borrador', at: hace(8), nota: 'se le escribió: el acuse de recibo' },
        ] as never,
      })
      expect(alertasDe(escrito, AHORA)).toEqual([])
    })

    /**
     * ⚠️ **Las filas viejas ⛔ no tienen la nota, así que siguen avisando exactamente igual**: esto
     * ⛔ no calla nada retroactivamente. Y una nota cualquiera tampoco lo apaga — sólo la que dice
     * que se le escribió.
     */
    it('⚠️ una nota que ⛔ no es «se le escribió» ⛔ no apaga nada', () => {
      const otraNota = borrador({
        created_at: hace(9), updated_at: hace(9),
        historial: [{ estado: 'borrador', at: hace(8), nota: 'se corrigió el producto' }] as never,
      })
      expect(alertasDe(otraNota, AHORA)[0].texto).toContain('todavía no se le escribió')
      // Y sin historial —las filas de antes de la nota— tampoco.
      expect(alertasDe(borrador({ created_at: hace(9), updated_at: hace(9), historial: [] as never }), AHORA)[0].texto)
        .toContain('todavía no se le escribió')
    })

    /**
     * 🔴 El defecto que este módulo ya tuvo dos veces, acá evitado por construcción: si contara
     * desde `updated_at`, **abrir el borrador a corregirle una coma apagaría la alarma de que
     * nadie le escribió** — y ése es justo el toque más probable sobre un reclamo que duerme.
     */
    it('🔴 editar el borrador ⛔ NO reinicia el reloj: cuenta desde que se abrió', () => {
      const tocadoHoy = borrador({ created_at: hace(9), updated_at: hace(0) })
      expect(alertasDe(tocadoHoy, AHORA)[0].dias).toBe(9)
    })

    /**
     * ⚠️ `borrador` significa **dos cosas distintas**: un reclamo que nadie mandó, y un cambio ya
     * decidido que vuelve a borrador a esperar que el cliente pague. El segundo ⛔ no está
     * olvidado, y meterlos en la misma alerta sería un número que existe y no significa.
     */
    it('⚠️ un CAMBIO esperando el pago ⛔ no avisa: es una espera legítima, no un olvido', () => {
      const cambio = borrador({ created_at: hace(30), updated_at: hace(30), compensacion: 'otro_producto' })
      expect(alertasDe(cambio, AHORA)).toEqual([])
      // El control: la misma fila sin decisión sí avisa ⇒ lo que la apaga es la compensación.
      expect(alertasDe(borrador({ created_at: hace(30), updated_at: hace(30) }), AHORA)).toHaveLength(1)
    })

    it('🔑 el `ts` es cuándo cruzó el plazo, no cuándo se abrió: si no, el badge nace ya visto', () => {
      const a = alertasDe(borrador({ created_at: hace(9), updated_at: hace(9) }), AHORA)
      expect(Math.round((AHORA - a[0].ts) / 86400000)).toBe(7)
    })

    it('cerrado o anulado ⛔ no entra: lo apaga `ESTADOS_ABIERTOS`, no esta regla', () => {
      expect(estaAbierto(borrador({ estado: 'cerrado' }))).toBe(false)
      expect(estaAbierto(borrador())).toBe(true)
    })
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

/**
 * La tabla de efectos.
 *
 * Es donde se decide qué pendientes deja cada resolución, y por eso es donde entró el bug que
 * trabó el módulo: `reenvio`, `cupon` y `ninguna` encendían "devolver la plata" y "anular la venta
 * en GN" porque no estaban en las dos condiciones escritas a mano que había en `decidir`.
 *
 * ⚠️ El oráculo de estos tests **no es el código viejo**: es qué pasa de verdad con la plata y con
 * el stock en cada caso. Por eso las tres resoluciones arregladas se afirman por lo que
 * corresponde, no por lo que la API devolvía antes.
 */
describe('la tabla de efectos', () => {
  const TODAS: Compensacion[] = [
    'plata_total', 'plata_parcial', 'otro_producto', 'otra_unidad', 'reenvio', 'cupon', 'ninguna',
  ]

  it('tiene una fila por resolución, sin faltar ninguna ni sobrar', () => {
    expect(Object.keys(EFECTOS_RESOLUCION).sort()).toEqual([...TODAS].sort())
  })

  it('cada fila contesta TODAS las preguntas: agregar una resolución es agregar una fila entera', () => {
    for (const c of TODAS) {
      const f = EFECTOS_RESOLUCION[c]
      for (const k of ['plata', 'anulaVenta', 'reingreso', 'cobro', 'envioNuevo', 'cupon', 'ayuda'] as const) {
        expect(f[k], `${c}.${k}`).toBeTruthy()
      }
    }
  })

  // ── Lo que se arregló ─────────────────────────────────────────────────────────

  it('un REENVÍO no devuelve plata ni anula la venta: el cliente se queda con lo que compró', () => {
    const p = pendientesDe({ compensacion: 'reenvio' })
    expect(p.reintegro_estado).toBe('no_aplica')
    expect(p.stock_estado).toBe('no_aplica')
    // Y sí manda algo: es la única razón por la que existe esta resolución.
    expect(saleUnEnvio('reenvio')).toBe(true)
  })

  it('un CUPÓN no devuelve plata ni anula la venta, y no manda nada', () => {
    const p = pendientesDe({ compensacion: 'cupon' })
    expect(p.reintegro_estado).toBe('no_aplica')
    expect(p.stock_estado).toBe('no_aplica')
    expect(saleUnEnvio('cupon')).toBe(false)
  })

  it('NINGUNA no anula la venta: "no se compensa" no es "se deshace la compra"', () => {
    const p = pendientesDe({ compensacion: 'ninguna' })
    expect(p.stock_estado).toBe('no_aplica')
    expect(p.reintegro_estado).toBe('no_aplica')
  })

  it('"sin compensación" no deja NINGÚN pendiente: no hay nada que mover', () => {
    expect(Object.values(pendientesDe({ compensacion: 'ninguna' }))).toEqual(
      ['no_aplica', 'no_aplica', 'no_aplica', 'no_aplica', 'no_aplica', 'no_aplica'],
    )
  })

  /**
   * El cupón no mueve plata hoy ni deshace la compra, pero **hay que emitirlo**. Hasta el
   * 25-ago-2026 no dejaba ningún pendiente y `cupon_codigo` se tipeaba suelto: el reclamo se
   * cerraba "con cupón" y nada verificaba que el cupón existiera en la tienda.
   */
  it('el cupón deja UN solo pendiente: crearlo en la tienda', () => {
    const p = pendientesDe({ compensacion: 'cupon' })
    expect(p.cupon_estado).toBe('pendiente')
    expect([p.reintegro_estado, p.stock_estado, p.reingreso_estado, p.cobro_estado, p.envio_nuevo_estado])
      .toEqual(['no_aplica', 'no_aplica', 'no_aplica', 'no_aplica', 'no_aplica'])
    // Y ninguna otra resolución lo enciende: el cupón se emite sólo cuando ES la resolución.
    for (const c of ['plata_total', 'plata_parcial', 'otra_unidad', 'otro_producto', 'reenvio', 'ninguna'] as Compensacion[]) {
      expect(pendientesDe({ compensacion: c }).cupon_estado, c).toBe('no_aplica')
    }
  })

  it('el reenvío deja UN solo pendiente: despachar lo que se le manda', () => {
    const p = pendientesDe({ compensacion: 'reenvio' })
    expect(p.envio_nuevo_estado).toBe('pendiente')
    expect([p.reintegro_estado, p.stock_estado, p.reingreso_estado, p.cobro_estado, p.cupon_estado])
      .toEqual(['no_aplica', 'no_aplica', 'no_aplica', 'no_aplica', 'no_aplica'])
  })

  // ── Lo que NO tenía que cambiar ───────────────────────────────────────────────

  it('devolver la plata sigue devolviendo la plata y anulando la venta', () => {
    for (const c of ['plata_total', 'plata_parcial'] as Compensacion[]) {
      const p = pendientesDe({ compensacion: c })
      expect(p.reintegro_estado, c).toBe('pendiente')
      expect(p.stock_estado, c).toBe('pendiente')
      expect(p.reingreso_estado, c).toBe('no_aplica')
    }
  })

  it('mandarle otra unidad igual no toca ni la plata ni la venta', () => {
    const p = pendientesDe({ compensacion: 'otra_unidad' })
    expect(p).toEqual({
      reintegro_estado: 'no_aplica', stock_estado: 'no_aplica',
      reingreso_estado: 'no_aplica', cobro_estado: 'no_aplica', cupon_estado: 'no_aplica',
      // Lo único que queda por hacer es mandársela.
      envio_nuevo_estado: 'pendiente',
    })
    expect(saleUnEnvio('otra_unidad')).toBe(true)
  })

  // ── El cambio: los dos condicionales miran el mismo número ────────────────────

  it('en un cambio la venta NUNCA se anula, y siempre hay que reingresar lo devuelto', () => {
    for (const diferencia of [-5000, 0, 5000]) {
      const p = pendientesDe({ compensacion: 'otro_producto', diferencia })
      expect(p.stock_estado, String(diferencia)).toBe('no_aplica')
      expect(p.reingreso_estado, String(diferencia)).toBe('pendiente')
    }
  })

  it('en un cambio sale plata SOLO si la diferencia quedó a favor del cliente', () => {
    expect(pendientesDe({ compensacion: 'otro_producto', diferencia: -5000 }).reintegro_estado).toBe('pendiente')
    expect(pendientesDe({ compensacion: 'otro_producto', diferencia: 5000 }).reintegro_estado).toBe('no_aplica')
    expect(pendientesDe({ compensacion: 'otro_producto', diferencia: 0 }).reintegro_estado).toBe('no_aplica')
  })

  it('en un cambio se cobra SOLO si quedó plata a cobrar', () => {
    expect(pendientesDe({ compensacion: 'otro_producto', diferencia: 5000 }).cobro_estado).toBe('pendiente')
    expect(pendientesDe({ compensacion: 'otro_producto', diferencia: -5000 }).cobro_estado).toBe('no_aplica')
    expect(pendientesDe({ compensacion: 'otro_producto', diferencia: 0 }).cobro_estado).toBe('no_aplica')
  })

  it('un cambio sin diferencia calculada todavía no cobra ni devuelve nada', () => {
    const p = pendientesDe({ compensacion: 'otro_producto', diferencia: null })
    expect(p.reintegro_estado).toBe('no_aplica')
    expect(p.cobro_estado).toBe('no_aplica')
  })

  // ── El borde ──────────────────────────────────────────────────────────────────

  it('una resolución que no está en la tabla no enciende ningún pendiente', () => {
    const p = pendientesDe({ compensacion: 'inventada' as Compensacion })
    expect(Object.values(p)).toEqual(['no_aplica', 'no_aplica', 'no_aplica', 'no_aplica', 'no_aplica', 'no_aplica'])
  })

  it('sólo dejan un envío por despachar las tres que le mandan algo al cliente', () => {
    const mandan = TODAS.filter((c) => pendientesDe({ compensacion: c }).envio_nuevo_estado === 'pendiente')
    expect(mandan.sort()).toEqual(['otra_unidad', 'otro_producto', 'reenvio'])
    // Y `saleUnEnvio` tiene que decir exactamente lo mismo: son la misma fila de la tabla.
    expect(TODAS.filter(saleUnEnvio).sort()).toEqual(mandan.sort())
  })

  it('un reclamo no cierra con el envío sin despachar', () => {
    const base = {
      id: 1, store: 'bdi', estado: 'resuelto', items: [], motivo: 'faltante',
      compensacion: 'reenvio', stock_estado: 'no_aplica', reintegro_estado: 'no_aplica',
      tn_stock_estado: 'no_aplica', reclamo_correo_estado: 'no_aplica',
    } as unknown as ReclamoRow
    expect(faltantesParaCerrar({ ...base, envio_nuevo_estado: 'pendiente' }))
      .toContain('despachar lo que se le manda')
    expect(faltantesParaCerrar({ ...base, envio_nuevo_estado: 'hecho' }))
      .not.toContain('despachar lo que se le manda')
    // Y un reenvío ya despachado no deja NADA pendiente: era el último eslabón.
    expect(faltantesParaCerrar({ ...base, envio_nuevo_estado: 'hecho' })).toEqual([])
  })

  it('sólo devuelven plata las resoluciones que de verdad sacan plata de la caja', () => {
    const conPlata = TODAS.filter((c) => pendientesDe({ compensacion: c, diferencia: -1 }).reintegro_estado === 'pendiente')
    expect(conPlata.sort()).toEqual(['otro_producto', 'plata_parcial', 'plata_total'])
  })

  it('sólo anulan la venta las resoluciones que deshacen la compra', () => {
    const anulan = TODAS.filter((c) => pendientesDe({ compensacion: c }).stock_estado === 'pendiente')
    expect(anulan.sort()).toEqual(['plata_parcial', 'plata_total'])
  })
})

/**
 * ── Qué falta para poder decidir ──
 *
 * La pantalla quedó partida en tres pestañas, así que "algo falta" ya no alcanza: hay que decir
 * **en cuál**. Y hay una tentación que estos casos existen para frenar: marcar como incompleta una
 * pestaña que no tiene nada que contestar. Este módulo ya pagó ese error una vez —hasta el
 * 25-ago-2026 se exigía siempre el destino y **una demora no se podía cerrar nunca**.
 */
describe('faltantesDeLaDecision', () => {
  const base = {
    motivo: 'falla' as MotivoReclamo,
    escenario: null as string | null,
    compensacion: 'plata_total' as Compensacion,
    retorno: false,
    envioVuelta: '' as number | '',
    pvpFeria: '' as number | '',
    montoAcordado: '' as number | '',
    envioIda: '' as number | '',
    retencionMonto: '' as number | '',
    retencionRespuesta: null as 'acepto' | 'rechazo' | null,
    retencionForma: 'plata' as FormaRetencion | null,
    ofertaMandada: false,
  }

  it('una falla recién abierta pide contestar la pregunta que decide, y no traba', () => {
    const f = faltantesDeLaDecision(base)
    expect(estadoDelPaso(f, 'que-paso')).toBe('falta')
    expect(loQueTraba(f)).toBe(null)
  })

  // 🔑 LA aserción: en una demora no hay producto en juego, así que la pestaña del producto no
  // está incompleta — está vacía a propósito. Marcarla empuja a inventar un destino para cerrar.
  it('una demora NO marca falta en el producto: no hay producto en juego', () => {
    const f = faltantesDeLaDecision({ ...base, motivo: 'demora', escenario: 'transporte' })
    expect(estadoDelPaso(f, 'producto')).toBe(null)
  })

  // La misma respuesta por otro camino: acá lo apaga el ESCENARIO, no el motivo. Sin este caso,
  // una implementación que mire una lista de motivos pasa igual.
  it('una cancelación tampoco: lo apaga el escenario, no el motivo', () => {
    const f = faltantesDeLaDecision({ ...base, motivo: 'arrepentimiento', escenario: 'se_puede_frenar' })
    expect(estadoDelPaso(f, 'producto')).toBe(null)
  })

  it('una falla sin PVP de feria lo pide: sin él las dos cuentas de esa pestaña mienten', () => {
    const f = faltantesDeLaDecision({ ...base, escenario: 'util' })
    expect(f.some((x) => x.paso === 'producto' && x.que.includes('PVP de feria'))).toBe(true)
  })

  it('con todo cargado no falta nada', () => {
    const f = faltantesDeLaDecision({ ...base, escenario: 'util', pvpFeria: 3500, envioVuelta: 6000 })
    expect(f).toEqual([])
  })

  /**
   * 🔴 **La decisión se puede guardar con la oferta esperando respuesta** (27-ago-2026). Antes esto
   * trababa, y trabarlo significaba que Administración ⛔ no podía cerrar su parte hasta que el
   * cliente contestara — una espera que a veces dura días y que no depende de nadie de acá.
   *
   * ⚠️ Éste es el que se revierte para ver el freno viejo: con la línea vieja del núcleo,
   * `loQueTraba` deja de ser `null`.
   */
  it('una oferta mandada y sin contestar ⛔ ya no traba la decisión', () => {
    const f = faltantesDeLaDecision({ ...base, escenario: 'util', pvpFeria: 3500, envioVuelta: 6000, retencionMonto: 4000, ofertaMandada: true })
    expect(loQueTraba(f)).toBe(null)
  })

  /**
   * 🔴 **Lo que se perdía en silencio** (27-ago-2026, de noche): un monto tipeado a mano sin decir
   * si se mandó o qué contestaron ⛔ no viaja en el payload. Trabar es la única forma de que no se
   * descarte callado, y se satisface con un click de tres.
   */
  it('un monto tipeado sin afirmar nada TRABA, y lo dice', () => {
    const f = faltantesDeLaDecision({ ...base, escenario: 'util', pvpFeria: 3500, envioVuelta: 6000, retencionMonto: 13491 })
    const traba = loQueTraba(f)
    expect(traba?.paso).toBe('producto')
    expect(traba?.que).toContain('no se guarda')
  })

  /**
   * ⚠️ **La mitad que impide que la traba de arriba se convierta en «contestá por una oferta que
   * nadie hizo»**: el campo se dibuja prellenado con lo que sugiere la cuenta, y eso ⛔ no es una
   * oferta. El discriminador es `''` —nadie lo tocó—, ⛔ no el valor.
   */
  it('el sugerido que nadie tipeó ⛔ no traba', () => {
    const f = faltantesDeLaDecision({ ...base, escenario: 'util', pvpFeria: 3500, envioVuelta: 6000, retencionMonto: '' })
    expect(loQueTraba(f)).toBe(null)
  })

  // La combinación que el servidor sí sigue rechazando. El mensaje se compara contra el del núcleo
  // y ⛔ no contra un string a mano: si `registroDeRetencion` cambia el texto, esto no queda
  // mintiendo.
  it('una oferta sin decir en qué traba, con el mensaje del núcleo', () => {
    const f = faltantesDeLaDecision({ ...base, escenario: 'util', pvpFeria: 3500, envioVuelta: 6000, retencionMonto: 4000, retencionForma: null })
    const traba = loQueTraba(f)
    expect(traba?.paso).toBe('producto')
    expect(traba?.que).toBe(registroDeRetencion({ motivo: 'falla', escenario: 'util', respuesta: null, monto: 4000, forma: null, retornoDecidido: false, retencionAt: null, ahora: null }).error)
  })

  it('aceptó quedárselo Y que vuelva: traba antes de mandarlo al servidor', () => {
    const f = faltantesDeLaDecision({
      ...base, escenario: 'util', pvpFeria: 3500, envioVuelta: 6000,
      retencionMonto: 4000, retencionRespuesta: 'acepto', retorno: true,
    })
    expect(loQueTraba(f)?.paso).toBe('producto')
  })

  it('una devolución parcial de $0 traba: es un formulario a medio llenar, no una decisión', () => {
    const f = faltantesDeLaDecision({ ...base, escenario: 'util', pvpFeria: 3500, envioVuelta: 6000, compensacion: 'plata_parcial' })
    const traba = loQueTraba(f)
    expect(traba?.paso).toBe('cliente')
    expect(estadoDelPaso(f, 'cliente')).toBe('traba')
  })

  // ⚠️ El campo de la oferta arranca con el sugerido: un número que nadie dijo ⛔ no es media oferta.
  it('el sugerido sin respuesta no cuenta como oferta a medias', () => {
    const f = faltantesDeLaDecision({ ...base, escenario: 'util', pvpFeria: 3500, envioVuelta: 6000, retencionMonto: '' })
    expect(loQueTraba(f)).toBe(null)
  })
})

/**
 * ── Rehacer una decisión ──
 *
 * 🔴 Nació de un caso real del 27-ago-2026: se confirmó un reclamo desde el primer paso de
 * `Decidir` y, como la salida arranca en la primera del repertorio, quedó guardado «lo cambia por
 * otro producto». Eso lo convirtió en un CAMBIO, y los cambios están excluidos de «Decidir» ⇒
 * **el caso quedó sin ninguna puerta**. Estos casos fijan que las dos existan y no se pisen.
 */
describe('puedeRehacerseLaDecision', () => {
  const r = (compensacion: Compensacion | null, estado: string) =>
    ({ compensacion, estado } as unknown as ReclamoRow)

  it('un reclamo recién abierto NO se rehace: todavía no se decidió, va por «Decidir»', () => {
    expect(puedeRehacerseLaDecision(r(null, 'borrador'))).toBe(false)
    expect(puedeRehacerseLaDecision(r(null, 'en_revision'))).toBe(false)
  })

  it('una devolución ya decidida sí, esté esperando el producto o no', () => {
    expect(puedeRehacerseLaDecision(r('plata_total', 'resuelto'))).toBe(true)
    expect(puedeRehacerseLaDecision(r('plata_total', 'en_transito'))).toBe(true)
  })

  // 🔑 EL caso: mismo estado `borrador` que un reclamo sin decidir, pero significa lo contrario.
  it('un cambio en borrador SÍ se rehace: todavía no se armó nada', () => {
    expect(puedeRehacerseLaDecision(r('otro_producto', 'borrador'))).toBe(true)
  })

  it('pero un cambio más avanzado no: ahí ya hay una venta y un cobro', () => {
    expect(puedeRehacerseLaDecision(r('otro_producto', 'resuelto'))).toBe(false)
    expect(puedeRehacerseLaDecision(r('otro_producto', 'cerrado'))).toBe(false)
  })

  it('un reclamo cerrado no se rehace', () => {
    expect(puedeRehacerseLaDecision(r('plata_total', 'cerrado'))).toBe(false)
  })

  /**
   * 🔴 **La puerta se cierra con el primer pendiente ejecutado.** Rehacer vuelve a pasar por
   * `pendientesDe`, así que un pendiente tildado vuelve a `pendiente`: la plata ya devuelta
   * aparecería otra vez como si no se hubiera devuelto. Hasta el 27-ago-2026 «Volver a decidir»
   * salió sin ningún freno y se podía pisar una decisión en curso.
   */
  it('una decisión que YA se está ejecutando no se rehace', () => {
    expect(puedeRehacerseLaDecision({ ...r('plata_total', 'resuelto'), reintegro_estado: 'hecho' } as unknown as ReclamoRow)).toBe(false)
    expect(puedeRehacerseLaDecision({ ...r('otro_producto', 'borrador'), envio_nuevo_estado: 'hecho' } as unknown as ReclamoRow)).toBe(false)
  })

  it('un pendiente todavía SIN tildar no cierra nada', () => {
    expect(puedeRehacerseLaDecision({ ...r('plata_total', 'resuelto'), reintegro_estado: 'pendiente', stock_estado: 'no_aplica' } as unknown as ReclamoRow)).toBe(true)
  })

  /**
   * ⚠️ Las dos columnas que rehacer ⛔ NO pisa. `tn_stock_estado` se decide en el alta y
   * `reclamo_correo_estado` corre en paralelo (`decidir` respeta su `'hecho'` a propósito) ⇒
   * ninguna se pierde al rehacer, así que ninguna puede cerrar la puerta. Si alguna entrara en
   * `loEjecutado`, este caso se pone rojo.
   */
  it('el reclamo al transportista y la baja del alta ⛔ no congelan la decisión', () => {
    const d = { ...r('plata_total', 'resuelto'), reclamo_correo_estado: 'hecho', tn_stock_estado: 'hecho' } as unknown as ReclamoRow
    expect(loEjecutado(d)).toEqual([])
    expect(puedeRehacerseLaDecision(d)).toBe(true)
  })
})

/**
 * Lo que la decisión ya mandó a hacer y alguien HIZO. Es lo único que puede cerrar «Volver a
 * decidir», y lo mismo que el servidor usa para rechazar el POST con 409.
 */
/**
 * **Qué destinos tiene sentido ofrecer.** Hasta el 27-ago-2026 la pantalla ofrecía los cinco
 * siempre: se podía marcar «Se perdió en el transporte» sobre un producto que el cliente tenía en
 * la mano, o «Nunca salió del depósito» sobre uno que llegó.
 */
describe('destinosDe', () => {
  /**
   * 🔴 **EL invariante.** Lo que la pantalla sugiere por default (`destinoDe`) tiene que estar
   * SIEMPRE entre lo que ofrece (`destinosDe`). Si no, el desplegable arranca en un destino que él
   * mismo no lista — que es el defecto espejo del duplicado que se arregló esta mañana.
   * Recorre **caso por caso y escenario por escenario**, incluido el "sin escenario".
   */
  it('lo que se sugiere está SIEMPRE entre lo que se ofrece', () => {
    for (const m of MOTIVOS_VIGENTES) {
      const escenarios: (string | null)[] = [null, ...escenariosDe(m).map((e) => e.clave)]
      for (const esc of escenarios) {
        const ofrecidos = destinosDe(m, esc)
        for (const vuelve of [true, false]) {
          const sugerido = destinoDe(m, vuelve, esc)
          if (sugerido == null) {
            // Sin producto en juego no hay destino: la lista tiene que estar vacía, ⛔ no traer uno.
            expect(ofrecidos, `${m}/${esc}: sin destino sugerido pero se ofrecen ${ofrecidos.join()}`).toEqual([])
          } else {
            expect(ofrecidos, `${m}/${esc}/vuelve=${vuelve}: sugiere ${sugerido} y no lo ofrece`).toContain(sugerido)
          }
        }
      }
    }
  })

  it('si el producto nunca salió, lo único posible es que nunca haya salido', () => {
    expect(destinosDe('faltante', null)).toEqual(['no_salio'])
    expect(destinosDe('sin_stock', null)).toEqual(['no_salio'])
  })

  it('si salió y no llegó, sólo se pudo perder', () => {
    expect(destinosDe('no_llego', null)).toEqual(['perdida'])
  })

  it('⛔ y si el cliente lo tiene, ⛔ no se pudo perder ni quedarse en el depósito', () => {
    const d = destinosDe('falla', null)
    expect(d).not.toContain('perdida')
    expect(d).not.toContain('no_salio')
    expect(d).toContain('stock')
  })

  /**
   * 🔴 En los cuatro casos subjetivos el producto está SANO por definición. Ofrecer «Fallado» mete
   * una unidad impecable en el ledger de Fallas, valuada a PVP de feria, y ensucia el único número
   * que dice cuánta plata se pierde en fallas de verdad. Si además vino con un defecto, el camino
   * es `reclasificar` — que conserva número, fotos e historial.
   */
  it('en un caso subjetivo ⛔ no se puede marcar el producto como fallado', () => {
    for (const m of ['arrepentimiento', 'no_esperaba', 'talle'] as MotivoReclamo[]) {
      expect(destinosDe(m, null), m).not.toContain('falla')
      expect(destinosDe(m, null), m).toContain('stock')
    }
    // El control: en una falla sí está, o el caso de arriba pasaría con la lista siempre vacía.
    expect(destinosDe('falla', null)).toContain('falla')
  })

  it('sin producto en juego el final queda vacío: una demora ⛔ no tiene destino', () => {
    expect(destinosDe('demora', null)).toEqual([])
  })
})

/**
 * Qué viene tildado al abrir un reclamo, y las vías que se ofrecen. Los dos salieron de la revisión
 * del 27-ago-2026 y los dos son **defaults**, que es donde este módulo ya se quemó: un default
 * convierte «no lo miré» en una afirmación.
 */
describe('los defaults del alta', () => {
  it('con UN producto viene tildado: no hay nada que elegir', () => {
    expect(preseleccionDelAlta(1)).toEqual([0])
  })

  /**
   * 🔴 Con dos o más NO. Hasta el 27-ago venía todo tildado siempre: el default convertía «no leí
   * la lista» en «el cliente devuelve las dos cosas», y eso después se paga o se anula en GN.
   */
  it('con dos o más hay que elegir', () => {
    expect(preseleccionDelAlta(2)).toEqual([])
    expect(preseleccionDelAlta(5)).toEqual([])
  })

  it('una orden vacía ⛔ no inventa un tilde', () => {
    expect(preseleccionDelAlta(0)).toEqual([])
  })

  /**
   * 🔑 **`VIAS_VIGENTES` ⛔ no es lo mismo que `VIA_LABEL`**: el mapa tiene las cuatro para que una
   * fila vieja se siga leyendo, y la lista es lo que se puede elegir hoy. Sacar una opción ⛔ no
   * puede borrar el dato de las filas que ya la tienen.
   */
  it('sólo se ofrecen Correo y Andreani, y las viejas siguen teniendo rótulo', () => {
    expect(VIAS_VIGENTES).toEqual(['correo', 'andreani'])
    expect(VIA_LABEL.cadete).toBeTruthy()
    expect(VIA_LABEL.presencial).toBeTruthy()
  })

  // ⚠️ Las dos que quedan tienen código de seguimiento ⇒ ya no hay retorno sin envío que rastrear.
  it('las dos vigentes piden seguimiento y tienen envío', () => {
    for (const v of VIAS_VIGENTES) {
      expect(pideSeguimiento(v), v).toBe(true)
      expect(hayEnvio(v), v).toBe(true)
    }
  })
})

describe('loEjecutado', () => {
  it('sin nada hecho, la lista está vacía', () => {
    expect(loEjecutado({ compensacion: 'plata_total', estado: 'resuelto' } as unknown as ReclamoRow)).toEqual([])
  })

  it('nombra CADA pendiente tildado, no sólo dice que hay uno', () => {
    const d = { reintegro_estado: 'hecho', stock_estado: 'hecho' } as unknown as ReclamoRow
    expect(loEjecutado(d)).toEqual(['ya se le devolvió la plata', 'ya se anuló la venta original en Gestión Nube'])
  })

  /**
   * 🔑 **Los dos gestos que pasaron en el mundo y ⛔ no son una columna.** El producto que ya
   * volvió al depósito y el que ya se descontó de Gestión Nube: rehacer la decisión no los
   * deshace, pero cambiarle el destino a una unidad que ya está en la mano deja la fila mintiendo.
   */
  it('cuenta el producto que ya volvió', () => {
    const d = {
      motivo: 'falla', destino_prenda: 'stock', retorno_decidido: true,
      items: [{ recibida_at: '2026-08-27T10:00:00Z' }, {}],
    } as unknown as ReclamoRow
    expect(loEjecutado(d)).toEqual(['ya volvió el producto'])
  })

  it('cuenta el que ya se descontó, y en plural cuando son varios', () => {
    const d = {
      motivo: 'falla',
      items: [{ baja_at: '2026-08-27T10:00:00Z' }, { baja_at: '2026-08-27T10:01:00Z' }],
    } as unknown as ReclamoRow
    expect(loEjecutado(d)).toEqual(['ya se descontaron de Gestión Nube 2 productos'])
  })

  /**
   * 🔴 **El invariante que no se puede romper.** `loEjecutado` mira exactamente las columnas que
   * `pendientesDe` pisa. Si mañana se agrega una columna a `pendientesDe` y no acá, se puede
   * volver a pisar un pendiente ya hecho — el mismo modo de falla que tuvieron las dos listas
   * escritas a mano que `EFECTOS_RESOLUCION` vino a reemplazar.
   */
  it('cubre TODAS las columnas que rehacer pisa, ni una de más', () => {
    const columnas = Object.keys(pendientesDe({ compensacion: 'otro_producto', diferencia: -1 }))
    for (const col of columnas) {
      const d = { [col]: 'hecho' } as unknown as ReclamoRow
      expect(loEjecutado(d), `${col} no cierra la puerta`).toHaveLength(1)
    }
  })
})

/**
 * El tilde de cada paso de `Decidir`. Dice **"esto ya está guardado"** y ⛔ no "alguien lo miró":
 * es lo único que se puede afirmar leyendo la fila, y es lo que hace que sobreviva a cerrar el
 * modal — que es todo el sentido de poder confirmar un paso y seguir después.
 */
/**
 * 🔴 **El botón de la fila tiene que decir dónde está el trabajo, ⛔ no qué pantalla abre.**
 *
 * Decía «Decidir» desde el minuto cero hasta el final. Una decisión que se hace en tres pasos se
 * deja por la mitad todo el tiempo —*«puede ser que termine el primer paso, pero después sigo más
 * tarde»*, Bruno, 27-ago-2026— y el único dato que dice si hay que abrirla, **si ya empezó**, no
 * estaba en ningún lado de la lista.
 */
/**
 * 🔴 **La invariante de la que cuelga «soltar la decisión»** (`liberar-decision`, `_reclamos.js`).
 *
 * Soltar una decisión tiene que dejar la fila **como si nunca se hubiera decidido**: sin resolución
 * y sin ninguno de los seis pendientes que cuelgan de ella. El handler ⛔ no los apaga a mano —los
 * pide con `pendientesDe({ compensacion: null })`, la misma función que los prende— justamente para
 * que agregar un pendiente nuevo no deje uno encendido colgando de una resolución borrada.
 *
 * ⚠️ Si alguien le pone un default a `compensacion` o hace que la tabla conteste algo para `null`,
 * esto se pone rojo, y con razón: sería soltar la decisión dejando tareas prendidas que nadie va a
 * poder tildar nunca.
 */
describe('soltar la decisión: los pendientes se apagan TODOS', () => {
  it('sin resolución, los seis quedan en no_aplica', () => {
    const p = pendientesDe({ compensacion: null as unknown as Compensacion })
    expect(Object.values(p)).toEqual(Array(6).fill('no_aplica'))
  })

  // La contracara: si la tabla no contestara nada para NINGUNA resolución, el test de arriba
  // pasaría igual y no significaría nada.
  it('y con una resolución de verdad, alguno se prende', () => {
    expect(Object.values(pendientesDe({ compensacion: 'plata_total' }))).toContain('pendiente')
  })

  /**
   * 🔑 **Cubre las mismas seis claves que `loEjecutado` mira para frenar.** Si `pendientesDe`
   * empezara a devolver una séptima, soltar la decisión la dejaría prendida — es el mismo modo de
   * falla que las dos listas escritas a mano que `EFECTOS_RESOLUCION` vino a reemplazar.
   */
  it('son exactamente las claves que la decisión escribe', () => {
    expect(Object.keys(pendientesDe({ compensacion: null as unknown as Compensacion })).sort())
      .toEqual(Object.keys(pendientesDe({ compensacion: 'otro_producto' })).sort())
  })
})

describe('botonDecidir', () => {
  const r = (x: Record<string, unknown>) => x as unknown as ReclamoRow

  it('sin nada cargado dice «Decidir»', () => {
    expect(botonDecidir(r({ escenario: null, envio_costo: null, compensacion: null })).label).toBe('Decidir')
  })

  it('con el primer paso guardado dice cuántos van', () => {
    const b = botonDecidir(r({ escenario: 'coincide', envio_costo: null, compensacion: null }))
    expect(b.hechos).toBe(1)
    expect(b.label).toBe('Continuar — 1 de 3')
  })

  it('con dos guardados, cuenta dos', () => {
    expect(botonDecidir(r({ escenario: 'coincide', envio_costo: 6500, compensacion: null })).hechos).toBe(2)
  })

  /**
   * 🔑 Cuenta pasos **guardados**, ⛔ no revisados: es lo único que se puede afirmar mirando la
   * fila. Y pasa `rehaciendo: false` porque un reclamo sin decidir ⛔ no está rehaciendo nada — si
   * pasara `true`, el paso que decide nunca contaría y el botón diría «2 de 3» para siempre.
   */
  it('un reclamo ya decidido cuenta los tres', () => {
    expect(botonDecidir(r({ escenario: 'coincide', envio_costo: 6500, compensacion: 'plata_total' })).hechos).toBe(3)
  })

  /**
   * 🔴 **El caso que cierra el bucle de R-0022.** Soltar la decisión deja `compensacion` en null
   * pero conserva el análisis ⇒ la fila tiene que ofrecer **«Continuar»**, ⛔ no «Decidir» (que
   * diría que no hay nada hecho) ni «Volver a decidir» (que es lo que Bruno veía volver una y otra
   * vez sin que nada cambiara).
   */
  it('después de soltar la decisión ofrece continuar, ⛔ no empezar de cero', () => {
    const soltado = r({ escenario: 'coincide', envio_costo: 6500, compensacion: null })
    expect(estaDecidido(soltado)).toBe(false)
    expect(botonDecidir(soltado).label).toBe('Continuar — 2 de 3')
  })
})

/**
 * 🔑 **`PASOS_DECISION` es la fuente única del orden.** Lo leen la pantalla (las pestañas y dónde
 * abrir) y `botonDecidir` (para contar). Escrito dos veces sería el modo de falla propio de este
 * módulo: la misma decisión en dos lados, y un día uno cambia y el otro no.
 */
describe('PASOS_DECISION', () => {
  it('tiene los tres pasos, en el orden en que se calculan los datos', () => {
    expect(PASOS_DECISION).toEqual(['que-paso', 'producto', 'cliente'])
  })

  it('cubre todas las claves de PASO_LABEL, ni una de menos', () => {
    expect([...PASOS_DECISION].sort()).toEqual(Object.keys(PASO_LABEL).sort())
  })
})

describe('pasoGuardado', () => {
  const r = (x: Record<string, unknown>) => x as unknown as ReclamoRow

  it('un reclamo recién abierto no tiene ningún paso guardado', () => {
    const nuevo = r({ escenario: null, envio_costo: null, compensacion: null })
    expect(pasoGuardado(nuevo, 'que-paso', false)).toBe(false)
    expect(pasoGuardado(nuevo, 'producto', false)).toBe(false)
    expect(pasoGuardado(nuevo, 'cliente', false)).toBe(false)
  })

  it('contestada la pregunta que decide, el primer paso queda guardado y los otros no', () => {
    const x = r({ escenario: 'ya_salio', envio_costo: null, compensacion: null })
    expect(pasoGuardado(x, 'que-paso', false)).toBe(true)
    expect(pasoGuardado(x, 'producto', false)).toBe(false)
  })

  // ⚠️ Un envío de 0 es un dato real ("la trae al local"), no un campo vacío.
  it('un envío de vuelta de 0 cuenta como guardado', () => {
    expect(pasoGuardado(r({ escenario: null, envio_costo: 0, compensacion: null }), 'producto', false)).toBe(true)
  })

  it('el último paso se da por guardado recién cuando hay una resolución', () => {
    expect(pasoGuardado(r({ escenario: null, envio_costo: null, compensacion: 'plata_total' }), 'cliente', false)).toBe(true)
  })

  /**
   * 🔴 **EL test del bucle de R-0022** (27-ago-2026). Bruno: *«pongo volver a decidir, confirmo el
   * primer paso, y cuando salgo sigue diciendo volver a decidir»*.
   *
   * La fila real: decidida como cambio, `escenario` y `compensacion` cargados. Al REHACERLA la
   * pantalla marcaba **«El cliente» con ✓** —porque la compensación vieja estaba en la base—, o
   * sea que el único paso que decide se leía como ya hecho. Confirmar el paso que decía «falta» y
   * salir era exactamente lo que la pantalla pedía, y no rehacía nada.
   */
  it('al REHACER, el paso que decide ⛔ no queda tildado por la decisión vieja', () => {
    const r22 = r({ escenario: 'coincide', envio_costo: null, compensacion: 'otro_producto' })
    expect(pasoGuardado(r22, 'cliente', true)).toBe(false)
    // Y sin rehacer sigue diciendo lo de siempre: el ✓ existe para sobrevivir a cerrar el modal.
    expect(pasoGuardado(r22, 'cliente', false)).toBe(true)
  })

  /**
   * 🔑 Los dos primeros pasos SÍ conservan el tilde al rehacer, y ⛔ no es una excepción olvidada:
   * a ésos los reescribe «Confirmar paso» por `editar`, así que el valor de la base es el mismo
   * que se está por reguardar. El ③ ⛔ no lo escribe nadie más que «Confirmar la decisión».
   */
  it('al REHACER, los pasos que «Confirmar paso» sí escribe conservan su tilde', () => {
    const r22 = r({ escenario: 'coincide', envio_costo: 1200, compensacion: 'otro_producto' })
    expect(pasoGuardado(r22, 'que-paso', true)).toBe(true)
    expect(pasoGuardado(r22, 'producto', true)).toBe(true)
  })
})

/**
 * 🔴 **El orden entre anular la venta y sacar la unidad con la venta técnica** (28-ago-2026).
 *
 * Anular la venta original en Gestión Nube **devuelve la unidad al stock**, y la venta técnica es la
 * que la vuelve a sacar. Si sale al revés, descuenta una unidad que todavía no volvió: **el stock
 * queda uno abajo del real**, sin ningún error y hasta el próximo conteo.
 *
 * ⚠️ **El aviso existía desde el 26-ago, escrito a mano y en UNA sola de las dos puertas**: el
 * camino de Fallas (`aFallas`). El de la unidad sana —`descontarRegaladas`, que es el que está
 * apretado hoy en R-0022, con la anulación pendiente y dos productos por descontar— ⛔ no lo tenía.
 * Es *dos lados que deciden sobre lo mismo*, con la regla escrita en uno.
 */
describe('la venta técnica ⛔ no sale antes que la anulación', () => {
  it('con la anulación pendiente, traba y dice qué hacer primero', () => {
    const t = faltaAnularAntesDeDescontar({ compensacion: 'plata_parcial', stock_estado: 'pendiente' })
    expect(t).toMatch(/Anulé en GN/)
  })

  it('anulada, deja pasar', () => {
    expect(faltaAnularAntesDeDescontar({ compensacion: 'plata_parcial', stock_estado: 'hecho' })).toBeNull()
  })

  /**
   * 🔑 **Sólo muerde cuando la venta se anula.** Si queda en pie —un cupón, un cambio, un reenvío—
   * la unidad nunca vuelve al stock: ⛔ no hay orden que respetar. Y ahí `stock_estado` es
   * `no_aplica`, ⛔ no `pendiente`, así que el guard tampoco lo vería.
   */
  it('si la venta queda en pie, ⛔ no hay nada que esperar', () => {
    expect(faltaAnularAntesDeDescontar({ compensacion: 'cupon', stock_estado: 'no_aplica' })).toBeNull()
    expect(faltaAnularAntesDeDescontar({ compensacion: 'cupon', stock_estado: 'pendiente' })).toBeNull()
    expect(faltaAnularAntesDeDescontar({ compensacion: 'otra_unidad', stock_estado: 'pendiente' })).toBeNull()
  })

  /**
   * 🔴 **El cable: las DOS puertas que escriben en GN tienen que ejercerlo, y ANTES de escribir.**
   * `descontarRegaladas` crea la venta en GN y **después** sella la baja, así que un 409 del
   * handler llega tarde: dejaría la venta hecha en GN y el reclamo sin sellar. Por eso el freno
   * vive en el cliente, arriba del `fetch`, y en las dos funciones — no en una.
   */
  it('las dos funciones que escriben en GN lo frenan antes del fetch', () => {
    const fuente = readFileSync(new URL('../lib/reclamos/cliente.ts', import.meta.url), 'utf8')
    for (const fn of ['pasarAFallas', 'descontarRegaladas']) {
      const cuerpo = fuente.split(`export async function ${fn}(`)[1].split('\nexport ')[0]
      expect([fn, cuerpo.includes('faltaAnularAntesDeDescontar')]).toEqual([fn, true])
      // Y antes de tocar GN: el guard tiene que estar arriba de la primera escritura.
      const primerFetch = Math.min(
        ...[cuerpo.indexOf('await fetch('), cuerpo.indexOf('await crearFalla(')].filter((i) => i >= 0),
      )
      expect([fn, cuerpo.indexOf('faltaAnularAntesDeDescontar') < primerFetch]).toEqual([fn, true])
    }
  })
})

/**
 * 🔴 **`costo_caso` tiene que seguir a sus entradas** (28-ago-2026).
 *
 * Es el único número que dice cuánto cuestan los errores propios, y lo escribía **sólo `decidir`**.
 * `editar` puede tocar seis de sus siete entradas —los dos envíos, los items, el destino, el
 * retorno— y las dejaba cambiar sin mover el costo. La cuenta vivía suelta adentro de
 * `DecidirReclamo.tsx`, así que **no era de nadie más**: por eso se quedaba vieja apenas algo la
 * tocaba fuera de esa pantalla, que es lo que le pasó a R-0022 al aceptar la oferta.
 */
describe('costoDeLaFila: la cuenta que ahora es de todos', () => {
  const fila = {
    compensacion: 'plata_parcial' as const,
    monto_total: 13491,
    retorno_decidido: false,
    envio_costo: 6500,
    envio_ida_costo: 0,
    items: [{ producto: 'Case', cantidad: 1, costo: 3000 }],
    destino_prenda: 'regalada' as const,
  }

  /**
   * 🔑 **El envío de vuelta entra sólo si el producto vuelve.** Era el $6.500 que R-0022 seguía
   * arrastrando de una decisión que aceptar la oferta ya había apagado: el número quedaba
   * afirmando una etiqueta que nunca se iba a pagar.
   */
  it('el envío de vuelta ⛔ no entra si el producto no vuelve, aunque el costo esté cargado', () => {
    expect(costoDeLaFila(fila)).toBe(13491 + 3000)
    expect(costoDeLaFila({ ...fila, retorno_decidido: true, destino_prenda: 'stock' })).toBe(13491 + 6500)
  })

  /** El envío de ida entra sólo en la reposición: es la única que manda un paquete a cuenta nuestra. */
  it('el envío de ida entra sólo en la reposición', () => {
    expect(costoDeLaFila({ ...fila, envio_ida_costo: 4000 })).toBe(13491 + 3000)
    expect(costoDeLaFila({ ...fila, compensacion: 'otra_unidad', envio_ida_costo: 4000 })).toBe(13491 + 4000 + 3000)
  })

  /** Con cupón hoy ⛔ no sale plata de la caja: lo único que costó es la unidad. Ver **B6**. */
  it('con cupón cuesta sólo la unidad', () => {
    expect(costoDeLaFila({ ...fila, compensacion: 'cupon' })).toBe(3000)
  })

  /**
   * ⚠️ **Con el `costo` del ítem sin cargar, la unidad vale CERO** — y las dos filas reales de BDI
   * lo tienen en `null`. ⛔ No es un defecto de la cuenta: es un dato que falta, y el número se
   * mueve solo el día que se cargue. Este test existe para que eso esté dicho y no sorprenda.
   */
  it('sin el costo del ítem cargado, cuenta sólo la plata', () => {
    expect(costoDeLaFila({ ...fila, items: [{ producto: 'Case', cantidad: 1, costo: null }] })).toBe(13491)
  })

  /**
   * 🔴 **El cable: la lista de entradas es la de la función, ⛔ no una copia.** El handler la usa
   * para dos cosas —traer las columnas y preguntar si el gesto cambió el costo—; con dos listas
   * escritas a mano, agregar una entrada y olvidarse de una de las dos deja el número viejo **sin
   * decir nada**, que es el defecto que esto vino a cerrar.
   */
  it('toda entrada de la cuenta está en ENTRADAS_DEL_COSTO', () => {
    const fuente = readFileSync(new URL('../lib/reclamos/plata.core.js', import.meta.url), 'utf8')
    const cuerpo = fuente.split('export function costoDeLaFila(fila) {')[1].split('\n}')[0]
    const leidas = [...new Set([...cuerpo.matchAll(/\bf\.([a-z_]+)/g)].map((m) => m[1]))]
    expect(leidas.length).toBeGreaterThan(5) // que la extracción no se haya quedado vacía
    expect(leidas.filter((k) => !ENTRADAS_DEL_COSTO.includes(k))).toEqual([])
  })

  /** Y que el handler use ESA lista para las dos cosas, ⛔ no una escrita al lado. */
  it('el handler trae y escucha con la misma lista', () => {
    const fuente = readFileSync(new URL('../api/_reclamos.js', import.meta.url), 'utf8')
    const editar = fuente.split("if (action === 'editar')")[1].split("if (action === 'eliminar')")[0]
    expect(editar).toContain('ENTRADAS_DEL_COSTO.some(')
    expect(editar).toContain('ENTRADAS_DEL_COSTO.join(')
    // ⚠️ Y sólo sobre un reclamo YA decidido: antes de la decisión el costo es `null` a propósito.
    expect(editar).toMatch(/previa\.compensacion/)
  })
})

/**
 * 🔴 **«A devolver» afirmaba un monto sobre reclamos sin decidir** (D10 de la auditoría del
 * 28-ago-2026). La columna hacía `monto_total ?? monto_producto ?? 0` sin mirar si había decisión,
 * y esa tarde la pantalla mostraba **$20.682** en la fila de R-0022 mientras el detalle del mismo
 * reclamo decía *«Decisión: todavía sin decidir»*. Lo que se veía ⛔ no era una promesa: era lo que
 * el cliente pagó, que está en la fila desde el minuto cero — leído en la columna de la plata que
 * sale, afirma una decisión que nadie tomó.
 *
 * 🔑 **Y el vacío ⛔ no puede ser 0**: un `$0` afirma lo contrario, que ya se decidió y no sale nada.
 */
describe('montoADevolver', () => {
  const fila = (extra: Partial<ReclamoRow>) => ({ ...extra } as ReclamoRow)

  it('sin decisión devuelve null, aunque la fila tenga los dos montos', () => {
    expect(montoADevolver(fila({ compensacion: null, monto_total: 20682, monto_producto: 23564 }))).toBeNull()
  })

  it('⛔ NO devuelve 0 sin decisión: sería afirmar que no sale nada', () => {
    expect(montoADevolver(fila({ compensacion: null, monto_producto: 23564 }))).not.toBe(0)
  })

  it('decidido, es el total acordado', () => {
    expect(montoADevolver(fila({ compensacion: 'plata_total', monto_total: 20682, monto_producto: 23564 }))).toBe(20682)
  })

  it('decidido sin total escrito, cae en lo que se pagó', () => {
    expect(montoADevolver(fila({ compensacion: 'plata_total', monto_total: null, monto_producto: 23564 }))).toBe(23564)
  })

  it('decidido y sin ningún monto es 0 de verdad: ahí sí no sale plata', () => {
    expect(montoADevolver(fila({ compensacion: 'ninguna', monto_total: null, monto_producto: null }))).toBe(0)
  })
})
