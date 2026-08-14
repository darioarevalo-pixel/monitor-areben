/**
 * La hoja del cadete, en números: qué se cobra en cada puerta y cuánto tiene que volver del turno.
 *
 * Puro y sin DOM, como el resto de los `lib/<seccion>/core.ts`. Lo que decide acá se muestra en dos
 * lados —la pantalla y la etiqueta impresa— y por eso **se calcula una sola vez**: un total guardado
 * y un total derivado que se pueden contradecir es la forma de que un día la etiqueta diga cobrar
 * algo que la pantalla da por pagado, con el cadete ya en la calle.
 */

import { sumarDias } from '../calendario'
import { normalizeArgPhone } from '../crm/core'
import { rotuloFecha } from '../fechas/semana'
import { ESTADOS_CERRADOS, ESTADOS_EN_CASA, turnosDe } from './reglas.core.js'
import type { Marca } from '../nav'
import type { Envio, OrdenTN, TotalesTurno } from './tipos'

// ── Qué órdenes de Tienda Nube son del cadete ────────────────────────────────────────────────

/**
 * Las que despacha un correo, no el cadete.
 *
 * 🔑 **Se pregunta por dos señales y alcanza con una.** Ninguna sola sirve:
 *   · El **nombre** (`Envío Nube - Correo Argentino…`, `Envío Nube - Andreani…`) es lo único que
 *     está desde el minuto cero, que es cuando se arma la hoja.
 *   · El **tracking** llega recién al despachar —12 de 14 en la medición— así que a la mañana
 *     todavía no está; pero es el que sigue funcionando si mañana entra otro correo con otro
 *     nombre.
 *
 * Es una regla negativa a propósito. La positiva (“que diga cadete”) parece más limpia, pero
 * `shipping_option` es **texto libre y la tienda lo edita**: hasta julio la opción del cadete se
 * llamaba `Envio con Cadete en Rosario (entre $3000 y $4300), Fisherton…` y en agosto pasó a
 * `Envío Cadeteria Rosario y alrededores`. Con un filtro positivo, el día que le cambien el nombre
 * otra vez el paquete **no sale y nadie se entera**. Así, lo que falla es al revés: aparece una
 * fila de más en la hoja, que se ve y se borra.
 */
export function vaPorCorreo(o: OrdenTN): boolean {
  if (o.envio_tracking) return true
  return /env[íi]o\s*nube/i.test(o.envio || '')
}

/**
 * ¿Este paquete va a la mochila del cadete?
 *
 * 🔴 **Medido en prod el 14-ago-2026 sobre 127 órdenes de BDI**: de las 39 que pasaban el filtro
 * viejo (no cancelada + no `pickup`), **23 eran de Correo Argentino y Andreani** — el 59% de la
 * hoja del cadete eran paquetes que despacha el correo. El `pickup` saca el retiro en el local y
 * el punto de retiro; lo que faltaba era sacar el correo.
 */
export function vaAlReparto(o: OrdenTN): boolean {
  if (o.cancelada || o.estado_orden === 'cancelled') return false
  if (o.envio_tipo === 'pickup') return false
  return !vaPorCorreo(o)
}

/** PostgREST devuelve `numeric` como string. Mismo criterio que `lib/crm/core.ts`. */
function num(v: number | string | null | undefined): number {
  return parseFloat(String(v)) || 0
}

/**
 * **Lo que el cadete tiene que cobrar en esta puerta.**
 *
 * Es la única cuenta que importa de todo el módulo, y son dos sumandos:
 *   · el envío, sólo si NO se pagó por adelantado;
 *   · el saldo del pedido, si quedó algo por cobrar.
 *
 * 🔴 El caso "no hay que cobrar nada" es lo normal, no el borde: se midió sobre dos años de la
 * planilla que **en la mediana el 100% de lo que el cadete cobra es el envío** —el producto ya se
 * pagó por transferencia antes de despachar—. Una etiqueta que cobre de más un pedido ya pagado es
 * un problema con el cliente en la puerta, no un error de redondeo.
 */
export function aCobrar(e: Envio): number {
  const envio = e.envio_pagado ? 0 : num(e.monto_envio)
  return envio + num(e.monto_pedido_a_cobrar)
}

/** ¿Esta puerta no se cobra? Lo que decide si la etiqueta dice PAGADO en vez de un monto. */
export function estaTodoPago(e: Envio): boolean {
  return aCobrar(e) === 0
}

/**
 * Los dos totales con los que se cierra un turno. Son los mismos dos que la planilla calculaba a
 * mano al pie de cada sección, y son la razón por la que la planilla existía:
 *
 *   · `enviosPagos` — lo que ya entró antes de que el cadete saliera. No se rinde: se controla.
 *   · `aRendir`     — la plata que el cadete tiene que traer de vuelta.
 *
 * `aRendir` cuenta **sólo lo que se entregó de verdad**. Un envío que volvió sin entregar no trae
 * plata, y sumarlo haría que la caja no cierre todas las veces que alguien no estaba en la casa —
 * que es justo el caso que la planilla nunca supo registrar, porque no tenía estado.
 */
export function totalesDelTurno(envios: Envio[]): TotalesTurno {
  let enviosPagos = 0
  let aRendir = 0
  let pendienteDeSalir = 0
  let noEntregados = 0

  for (const e of envios) {
    if (e.envio_pagado) enviosPagos += num(e.monto_envio)
    if (e.estado === 'entregado') aRendir += aCobrar(e)
    if ((ESTADOS_EN_CASA as string[]).includes(e.estado)) pendienteDeSalir++
    if (e.estado === 'no_entregado') noEntregados++
  }

  return {
    envios: envios.length,
    enviosPagos,
    aRendir,
    pendienteDeSalir,
    noEntregados,
    // Lo que el turno tendría que rendir si todo lo que salió llegara. La diferencia contra
    // `aRendir` es exactamente la plata que quedó en la calle.
    aRendirSiTodoLlega: envios.filter((e) => !(ESTADOS_CERRADOS as string[]).includes(e.estado)).reduce((s, e) => s + aCobrar(e), 0) + aRendir,
  }
}

/**
 * El link de WhatsApp del cliente, o `null`.
 *
 * Reusa `normalizeArgPhone` de CRM en vez de repetir la regla: el `9` que va después del `54` en los
 * celulares argentinos ya se olvidó una vez en este código y el link abría un chat vacío. Una sola
 * implementación, y si mañana cambia, cambia para todos.
 */
export function linkWhatsapp(e: Envio): string | null {
  const tel = normalizeArgPhone(e.telefono)
  return tel ? `https://wa.me/${tel}` : null
}

/**
 * La dirección en una línea, como va impresa en la etiqueta.
 *
 * Junta lo que TN devuelve por separado y descarta lo vacío, para que no salgan comas huérfanas ni
 * un "piso null" en una etiqueta que va a manejar alguien en una moto.
 */
export function direccionCompleta(e: Envio): string {
  return [e.direccion, e.piso_depto, e.localidad].map((x) => (x == null ? '' : String(x).trim())).filter(Boolean).join(' · ')
}

/** Los envíos de un turno, ordenados como se preparan: primero lo que todavía no salió. */
export function ordenarParaPreparar(envios: Envio[]): Envio[] {
  const peso = (e: Envio) => ((ESTADOS_EN_CASA as string[]).includes(e.estado) ? 0 : (ESTADOS_CERRADOS as string[]).includes(e.estado) ? 2 : 1)
  return [...envios].sort((a, b) => peso(a) - peso(b) || (a.localidad || '').localeCompare(b.localidad || '') || (a.cliente || '').localeCompare(b.cliente || ''))
}

// ── De una orden de Tienda Nube a una fila de la hoja ────────────────────────────────────────

/** Id nuevo, generado en el cliente para pintar la fila sin esperar al servidor. */
export function nuevoIdEnvio(): string {
  return `en${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

/**
 * **Lo que el cadete tiene que cobrar del producto**, cuando la orden llegó sin pagar.
 *
 * Es el pedido "a pagar en efectivo" de Tienda Nube: `gateway: 'offline'`, `method: 'custom'`,
 * `payment_status: 'pending'`. El envío se cuenta aparte (`monto_envio` + `envio_pagado`), así que
 * acá va el total **menos** el envío: sumarlo entero haría que la puerta cobre el envío dos veces.
 *
 * 🔴 **Sólo `pending` cobra.** `voided` y `refunded` también son "no pagada" y son lo contrario: un
 * pago anulado o devuelto. Cobrarlos sería pedirle plata en la puerta a alguien a quien se le anuló
 * la compra. Medido en prod: los dos estados existen en el mismo día.
 */
function saldoDelProducto(o: OrdenTN): number {
  if (o.estado_pago !== 'pending') return 0
  const total = parseFloat(String(o.total ?? '')) || 0
  const envio = parseFloat(String(o.envio_costo_cliente ?? '')) || 0
  return Math.max(0, total - envio)
}

/**
 * ¿El envío ya lo cobró la tienda?
 *
 * 🔴 **Que la ORDEN esté paga no quiere decir que el ENVÍO esté pago**, y confundirlos es plata que
 * el cadete no cobra. La cadetería llega de Tienda Nube en $0 —18 de 18 medidas: el precio vive en
 * el mapa de zonas y lo pone una persona después—, así que lo que la clienta pagó fue el producto y
 * nada de envío. Con `estado_pago === 'paid'` a secas, la fila salía marcada PAGADO **con el precio
 * todavía sin cargar**; se cotizaba en $3.000 y la etiqueta seguía diciendo PAGADO. Pasó en la hoja
 * del 14-ago-2026: «Envíos ya pagos $3.000 · A rendir $0», con el cadete yendo a cobrar nada.
 *
 * Se pide que TN haya cobrado el envío **de verdad**: precio mayor a cero y orden paga. El resto
 * nace a cobrar, y cuando la clienta confirma que transfiere se tilda «Marcar envío como pagado».
 */
function envioYaPago(o: OrdenTN): boolean {
  const cobrado = parseFloat(String(o.envio_costo_cliente ?? '')) || 0
  return cobrado > 0 && o.estado_pago === 'paid'
}

/**
 * Una orden de TN convertida en una fila de la hoja del cadete.
 *
 * 🔑 **Nace sin día.** Entra a la bandeja de pendientes y no a la hoja de un día, porque el día del
 * reparto lo confirma el cliente y no tiene nada que ver con la fecha de la orden. Y nace con el
 * envío en $0 salvo que TN traiga un precio: la cadetería viene siempre en cero (18 de 18 medidas),
 * el precio está en el mapa de zonas y lo pone una persona antes de mandarlo a un día.
 */
export function ordenAEnvio(o: OrdenTN, marca: Marca): Partial<Envio> {
  const d = o.envio_direccion || null
  const calle = [d?.calle, d?.numero].filter(Boolean).join(' ').trim()
  return {
    id: nuevoIdEnvio(),
    store: marca,
    fecha: null,
    turno: null,
    origen: 'tn',
    orden_numero: String(o.number),
    cliente: o.cliente || d?.nombre || null,
    telefono: d?.telefono || null,
    direccion: calle || '(sin dirección en la orden)',
    piso_depto: d?.piso || null,
    localidad: d?.localidad || null,
    anotacion: null,
    monto_envio: o.envio_costo_cliente ?? 0,
    envio_pagado: envioYaPago(o),
    monto_pedido_a_cobrar: saldoDelProducto(o),
    estado: 'pendiente',
    // La foto congelada: si el cliente cambia su dirección en TN mañana, la etiqueta ya salió con
    // la de hoy. Lo que se guardó es lo que el cadete tiene en la mano.
    datos: { tn: o as unknown as Record<string, unknown> },
  }
}

/**
 * El rótulo del día para la pantalla (`vie 14-ago`), o `''` si todavía no hay una fecha entera.
 *
 * 🔴 **Existe porque un `<input type="date">` pasa por vacío mientras se tipea.** Chrome emite el
 * cambio con el valor en `''` en cuanto se toca el primer dígito, y `rotuloFecha('')` —que es
 * estricto, y está bien que lo sea: sus otros dos usos reciben fechas que arma el código— tira un
 * TypeError. Tirar en el render no deja un cartel de error: React reintenta, se come la memoria y
 * **Chrome mata la pestaña entera** ("This page couldn't load") con el modal abierto y el envío sin
 * agendar. Pasó en producción las dos veces que se probó a mano.
 *
 * El guard va acá, en el borde por donde entra lo que tipea una persona, y no adentro de
 * `rotuloFecha`: si aquél empezara a devolver `''` en vez de fallar, un error en las grillas del
 * calendario pasaría en silencio.
 */
export function rotuloDeDia(fecha: string | null | undefined): string {
  if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return ''
  return rotuloFecha(fecha)
}

/**
 * El día de reparto anterior (`paso: -1`) o el siguiente (`paso: 1`).
 *
 * 🔑 **Saltea los días sin moto.** El sábado, el domingo y cualquier día sin turnos son pantallas
 * siempre vacías: pasar por ellos de a un click es exactamente lo que hacía que se terminara
 * abriendo el calendario para todo. El campo de fecha sigue ahí para ir a un día lejano.
 *
 * El tope de 14 vueltas es un cinturón por si alguien deja `TURNOS_POR_DIA` sin ningún día: sin él,
 * la flecha colgaría el navegador en vez de no hacer nada.
 */
export function diaDeRepartoVecino(desde: string, paso: 1 | -1): string {
  let f = desde
  for (let i = 0; i < 14; i++) {
    f = sumarDias(f, paso)
    if (turnosDe(f).length) return f
  }
  return desde
}

/**
 * El primer día con reparto de acá en adelante. Es el default del selector: el caso normal es
 * «mandalo al próximo que salga», y arrancar en un sábado obligaría a corregirlo siempre.
 *
 * Camina día por día y no salta: la grilla es de siete casilleros y un salto "inteligente" es una
 * segunda forma de contestar lo mismo que se puede equivocar sola. El tope de 14 es un cinturón —con
 * la grilla actual nunca pasa de 3—, no una regla.
 */
export function proximoDiaDeReparto(desde: string): string {
  let f = desde
  for (let i = 0; i < 14; i++) {
    if (turnosDe(f).length) return f
    f = sumarDias(f, 1)
  }
  return desde
}

export {
  ESTADOS,
  ESTADOS_CERRADOS,
  ESTADOS_EN_CASA,
  esTurnoDeGrilla,
  MARCAS,
  ORIGENES,
  TURNOS,
  TURNOS_POR_DIA,
  turnosDe,
  validarEnvio,
} from './reglas.core.js'
