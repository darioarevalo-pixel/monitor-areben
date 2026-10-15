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
