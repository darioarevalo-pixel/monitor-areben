/**
 * El ESTADO DE PAGO de un pedido de Tienda Nube: UNA regla para el motor y para el monitor. Puro.
 *
 * 🔑 Bruno, 15-oct (❓ c): `authorized` es PAGADO (la venta nace ahí), ⛔ «sin pagar». Antes la pantalla del monitor
 * «Pedidos sin pagar» tenía su propia lista (`pending` + `authorized`) y contaba como sin pagar lo que el motor ya
 * registraba como venta. Vive en `lib/venta` porque es lo que el monitor trae con `traer-motor`; `lib/tn` lo
 * re-exporta.
 */

/**
 * 🔑 Bruno, 3-nov: a los 15 días de creado, el pedido sin pagar se avisa «para cancelar». Se cancela a mano en TN: el ERP
 * ⛔ escribe ahí, y el pedido sigue reteniendo hasta que lo cancelen.
 */
export const DIAS_PARA_CANCELAR = 15

export const PAGADA = new Set(['paid', 'partially_paid', 'authorized'])
export const DEVUELTA = new Set(['refunded', 'voided', 'partially_refunded'])

/** ¿Es venta para el motor? La condición de `planVentasTN` (un pedido pagado sin `pagada_en` ⛔ es venta todavía). */
export const esVentaTN = (o) => PAGADA.has(o.payment_status) && !!o.pagada_en

/**
 * 🔑 Bruno, 16-nov (escrito): **la funda de un pedido web DESPUÉS del corte se mueve por el ARMADO, ⛔ por el pago.**
 *   «Pedido armado descuenta el físico; pedido que entra aumenta reservado, pero si no está armado no descuenta el físico;
 *   pedido que se cancela no aumenta el físico hasta que se desarme» (el disponible sí sube: la unidad está en una bolsa).
 * Armado = el estado de envío de TN que mueve Logística (`envio_estado`, `envioEstado` de `lib/tn/orden.mjs`). Lo que ya se
 * despachó o entregó también salió del estante. Lo de ANTES del corte sigue como estaba (pre-corte va por ajuste).
 */
export const ARMADO = new Set(['PACKED', 'READY_FOR_PICKUP'])
export const SALIO_DEL_ESTANTE = new Set([...ARMADO, 'DISPATCHED', 'DELIVERED'])
const envio = (o) => String(o.envio_estado ?? '').toUpperCase()

/** ¿Salió del estante? Armado, despachado o entregado (TN ⛔ lo vuelve atrás al cancelar: eso lo dice el desarme). */
export const salioDelEstanteTN = (o) => SALIO_DEL_ESTANTE.has(envio(o))

/**
 * ¿El pedido es de DESPUÉS del corte de su tienda? `corte` es OBLIGATORIO: el ISO de `erp_corte` de la tienda, o `null` si
 * todavía ⛔ cortó. Sin decirlo, TIRA (⛔ se elige callado una regla u otra).
 */
export function despuesDelCorteTN(o, corte) {
  if (corte === undefined) throw new Error('falta el corte de la tienda (null = todavía no cortó)')
  return corte != null && Date.parse(o.creada_en) > Date.parse(corte)
}

/**
 * ¿Retiene stock (RESERVADO, lo que se le resta al libro)? `open` (⛔ cancelado ni archivado), ⛔ devuelto, y:
 *  - después del corte: ⛔ salió del estante (sin armar, pagado o no; armado ya ⛔ está en el libro);
 *  - antes del corte: todavía ⛔ es venta (la venta ya bajó el libro al pagar).
 * @param {{ corte: string | null }} op
 */
export function esReservaTN(o, { corte } = {}) {
  const post = despuesDelCorteTN(o, corte)
  if (o.status !== 'open' || DEVUELTA.has(o.payment_status)) return false
  return post ? !salioDelEstanteTN(o) : !esVentaTN(o)
}

/**
 * «PARA DESARMAR»: después del corte, ABIERTO, con el pago anulado o devuelto y ARMADO. La funda está en una bolsa y ⛔ en el
 * estante: queda apartada hasta que se desarme (Logística, o TN vuelve a sin armar) o se cancele.
 */
export const esParaDesarmarTN = (o, { corte } = {}) => despuesDelCorteTN(o, corte) && o.status === 'open' && DEVUELTA.has(o.payment_status) && ARMADO.has(envio(o))

/**
 * ¿La funda tiene que estar FUERA del estante (en el libro)? Después del corte, salió del estante y ⛔ se desarmó ni volvió
 * (`desarmado`: Logística publicó el desarme, o la vuelta de la venta anulada ya se confirmó). Lo usa el conciliador
 * (`lib/tn/armado.mjs`), que escribe en el libro la diferencia.
 */
export const fueraDelEstanteTN = (o, { corte, desarmado } = {}) => despuesDelCorteTN(o, corte) && salioDelEstanteTN(o) && !desarmado

/**
 * ¿EN BOLSAS? Cancelado, después del corte, con la funda todavía fuera del estante (⛔ despachado ni entregado: eso vuelve
 * «a recibir»). ⛔ suma al físico hasta que se desarme, pero SÍ al disponible (Bruno 16-nov: favorece el conteo).
 */
export const esEnBolsasTN = (o, { corte } = {}) => despuesDelCorteTN(o, corte) && o.status === 'cancelled' && ARMADO.has(envio(o))

/**
 * 🔴 Un pedido con estado PAGADO ⛔ vence nunca, aunque le falte `pagada_en` (y por eso todavía ⛔ sea venta):
 * cancelarlo sería cancelar una venta cobrada. Medido 15-oct (seco en prod): BDI 84 «vencidas», casi todas `paid`.
 */
export const puedeVencer = (o) => !PAGADA.has(o.payment_status)

/**
 * ¿Está SIN PAGAR? Abierto, ⛔ devuelto y sin estado pagado: lo que hay que cobrar o soltar (la pantalla del monitor, y lo
 * que vence). ⛔ depende del corte ni del armado: un sin pagar ARMADO (efectivo) igual hay que cobrarlo. Un pagado sin
 * `pagada_en` ⛔ está sin pagar: le falta la fecha, ⛔ la plata.
 */
export const esSinPagarTN = (o) => o.status === 'open' && !DEVUELTA.has(o.payment_status) && !PAGADA.has(o.payment_status)

/**
 * ¿ENTREGADO SIN COBRAR? Cerrado en TN (`closed`: entregado o archivado) sin estado pagado ni devuelto. 🔑 Bruno, 19-oct:
 * sigue en «Sin pagar», con el aviso «entregado sin cobrar», hasta que se cobre o se cancele. Medido 19-oct: 6 (BDI
 * 21745/21865/21870, Zattia 7197/7206/7268), todos «Efectivo» de retiro: cobrados en el local sin marcar pagado en TN.
 * ⛔ retiene stock (la prenda ya se fue) ni vence: ⛔ es reserva, sólo falta cobrarlo o cancelarlo.
 */
export const esEntregadoSinCobrarTN = (o) => o.status === 'closed' && !PAGADA.has(o.payment_status) && !DEVUELTA.has(o.payment_status)

/** Lo que va en «Sin pagar» de la pantalla: lo sin pagar que retiene + lo entregado sin cobrar. */
export const esPorCobrarTN = (o) => esSinPagarTN(o) || esEntregadoSinCobrarTN(o)
