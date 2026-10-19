/**
 * El ESTADO DE PAGO de un pedido de Tienda Nube: UNA regla para el motor y para el monitor. Puro.
 *
 * 🔑 Bruno, 15-oct (❓ c): `authorized` es PAGADO (la venta nace ahí), ⛔ «sin pagar». Antes la pantalla del monitor
 * «Pedidos sin pagar» tenía su propia lista (`pending` + `authorized`) y contaba como sin pagar lo que el motor ya
 * registraba como venta. Vive en `lib/venta` porque es lo que el monitor trae con `traer-motor`; `lib/tn` lo
 * re-exporta.
 */

export const PAGADA = new Set(['paid', 'partially_paid', 'authorized'])
export const DEVUELTA = new Set(['refunded', 'voided', 'partially_refunded'])

/** ¿Es venta para el motor? La condición de `planVentasTN` (un pedido pagado sin `pagada_en` ⛔ es venta todavía). */
export const esVentaTN = (o) => PAGADA.has(o.payment_status) && !!o.pagada_en

/** ¿Retiene stock? `open` (⛔ cancelado ni archivado: `closed`), ⛔ devuelto, y todavía ⛔ es venta. */
export const esReservaTN = (o) => o.status === 'open' && !DEVUELTA.has(o.payment_status) && !esVentaTN(o)

/**
 * 🔴 Un pedido con estado PAGADO ⛔ vence nunca, aunque le falte `pagada_en` (y por eso todavía ⛔ sea venta):
 * cancelarlo sería cancelar una venta cobrada. Medido 15-oct (seco en prod): BDI 84 «vencidas», casi todas `paid`.
 */
export const puedeVencer = (o) => !PAGADA.has(o.payment_status)

/**
 * ¿Está SIN PAGAR? Retiene stock y ⛔ tiene estado pagado: lo que hay que cobrar o soltar (la pantalla del monitor,
 * y lo que vence). Un pagado sin `pagada_en` retiene pero ⛔ está sin pagar: le falta la fecha, ⛔ la plata.
 */
export const esSinPagarTN = (o) => esReservaTN(o) && puedeVencer(o)

/**
 * ¿ENTREGADO SIN COBRAR? Cerrado en TN (`closed`: entregado o archivado) sin estado pagado ni devuelto. 🔑 Bruno, 19-oct:
 * sigue en «Sin pagar», con el aviso «entregado sin cobrar», hasta que se cobre o se cancele. Medido 19-oct: 6 (BDI
 * 21745/21865/21870, Zattia 7197/7206/7268), todos «Efectivo» de retiro: cobrados en el local sin marcar pagado en TN.
 * ⛔ retiene stock (la prenda ya se fue) ni vence: ⛔ es reserva, sólo falta cobrarlo o cancelarlo.
 */
export const esEntregadoSinCobrarTN = (o) => o.status === 'closed' && !PAGADA.has(o.payment_status) && !DEVUELTA.has(o.payment_status)

/** Lo que va en «Sin pagar» de la pantalla: lo sin pagar que retiene + lo entregado sin cobrar. */
export const esPorCobrarTN = (o) => esSinPagarTN(o) || esEntregadoSinCobrarTN(o)
