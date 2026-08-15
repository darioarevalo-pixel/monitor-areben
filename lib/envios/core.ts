/**
 * La hoja del cadete, en números: qué se cobra en cada puerta y cuánto tiene que volver del turno.
 *
 * Puro y sin DOM, como el resto de los `lib/<seccion>/core.ts`. Lo que decide acá se muestra en dos
 * lados —la pantalla y el ticket impreso— y por eso **se calcula una sola vez**: un total guardado
 * y un total derivado que se pueden contradecir es la forma de que un día el ticket diga cobrar
 * algo que la pantalla da por pagado, con el cadete ya en la calle.
 */

import { sumarDias } from '../calendario'
import { normalizeArgPhone } from '../crm/core'
import { rotuloFecha } from '../fechas/semana'
import { aCobrar, ESTADOS_CERRADOS, ESTADOS_EN_CASA, netoDelEnvio, num, tarifaCadete, turnosDe } from './reglas.core.js'
import type { Marca } from '../nav'
import type { CierreDia, CuentaCadete, DiaDeCuenta, Envio, OrdenTN, TotalesDia, Traida } from './tipos'

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

// ── Lo que Tienda Nube NO contestó ───────────────────────────────────────────────────────────

/**
 * Cuántas órdenes del rango **no llegaron**: las que había del otro lado menos las que entraron.
 *
 * 🔴 **Tienda Nube corta por rate limit y el endpoint contesta `ok: true` igual.** El detalle pide
 * una orden por vez y un tramo de nueve días devolvió **15 de 77, con 62 fallidas**. El endpoint
 * siempre informó ese número; el que lo tiraba era este lado, así que la pantalla pintaba media hoja
 * en verde — y una orden que no se trajo el día que entró no la trae nadie después.
 *
 * 🔑 **Se resta, no se lee `fallidas` a secas.** `fallidas` sólo cuenta los GET que fallaron; si el
 * rango además se pasó del `limite` (`truncado`), esas órdenes no fallaron: ni se intentaron, y
 * faltan lo mismo. La resta las cuenta a las dos, y de yapa no depende de que el endpoint sepa
 * contar. `fallidas` queda como respaldo por si un día no viaja el total.
 */
export function ordenesQueNoLlegaron(
  d: { total_en_rango?: unknown; fallidas?: unknown } | null | undefined,
  leidas: number,
): number {
  const total = Number(d?.total_en_rango)
  if (Number.isFinite(total)) return Math.max(0, total - leidas)
  return Math.max(0, Number(d?.fallidas) || 0)
}

/**
 * El cartel de una pasada del botón «Traer»: qué decir y **de qué color**.
 *
 * Va acá, separado del `toast`, por lo mismo que `textoDePlata` está separada del dibujo del PDF: un
 * ensayo que sólo verifique que el botón no explota da verde con el defecto puesto. Lo que hay que
 * poder mutar es esto — que el tono sea `aviso` cuando faltan órdenes, y que el número aparezca.
 *
 * 🔑 **La instrucción es apretar de nuevo, y es segura**: la dedup por `(marca, nº de orden)` no deja
 * repetir, así que una segunda pasada sólo puede sumar las que la primera perdió.
 */
export function resumenDeTraida(t: Traida): { tono: 'ok' | 'aviso'; texto: string } {
  // Las dos cuentas, no un "listo": "traje 2 y 3 ya estaban" es una respuesta.
  const partes = [`${t.agregados} nuevo${t.agregados === 1 ? '' : 's'}`]
  if (t.ya_estaban) partes.push(`${t.ya_estaban} ya estaban`)
  // El correo se deja afuera, pero se dice: si no, la cuenta del día no cierra contra Tienda Nube.
  if (t.porCorreo) partes.push(`${t.porCorreo} ${t.porCorreo === 1 ? 'va' : 'van'} por correo`)
  if (t.sinDireccion) partes.push(`⚠️ ${t.sinDireccion} sin dirección: completala a mano`)
  if (t.noLeidas) {
    const q = t.noLeidas === 1 ? 'orden que Tienda Nube no contestó' : 'órdenes que Tienda Nube no contestó'
    partes.push(`⚠️ ${t.noLeidas} ${q}: volvé a apretar Traer`)
  }
  return { tono: t.noLeidas ? 'aviso' : 'ok', texto: partes.join(' · ') }
}

// ── La cuenta corriente del cadete ───────────────────────────────────────────────────────────

/**
 * La cuenta corriente, día por día, con el saldo arrastrado.
 *
 * Se le pasan **todos** los envíos con fecha y todos los cierres, sin filtrar por rango: el
 * acumulado de un día es la suma de todos los anteriores, así que recortar la ventana daría un saldo
 * distinto según por dónde se empiece a mirar. Arranca en cero — al 14-ago-2026 el cadete y el local
 * están a mano — y por eso no hay saldo de apertura que pasarle.
 *
 * 🔑 **Sólo cuentan los entregados.** Un paquete que volvió sin entregar no cobró nada y tampoco se
 * le paga: sumarlo haría que la caja no cierre justo los días que algo salió mal, que es cuando el
 * número tiene que ser confiable.
 *
 * El signo, una sola vez y para todo el módulo: **positivo = el cadete tiene plata nuestra**;
 * negativo = se la debemos.
 */
export function cuentaDelCadete(envios: Envio[], cierres: CierreDia[]): CuentaCadete {
  const porDia = new Map<string, Envio[]>()
  for (const e of envios) {
    if (!e.fecha) continue
    const lista = porDia.get(e.fecha)
    if (lista) lista.push(e)
    else porDia.set(e.fecha, [e])
  }
  // Un día cerrado sin un solo envío entregado igual es una fila de la cuenta: es el día en que se
  // le pagó lo que se le debía y no salió a repartir.
  for (const c of cierres) if (!porDia.has(c.fecha)) porDia.set(c.fecha, [])

  const fechas = [...porDia.keys()].sort()
  let acumulado = 0
  const dias: DiaDeCuenta[] = []

  for (const fecha of fechas) {
    const delDia = porDia.get(fecha) || []
    const entregados = delDia.filter((e) => e.estado === 'entregado')
    const cierre = cierres.find((c) => c.fecha === fecha) || null

    const cobrado = entregados.reduce((s, e) => s + aCobrar(e), 0)
    const tarifas = entregados.reduce((s, e) => s + tarifaCadete(e), 0)
    const trajo = cierre?.trajo == null ? null : num(cierre.trajo)
    const pagadoAparte = num(cierre?.pagado_aparte)

    // Lo que el día movió en la cuenta: lo que quedó en su bolsillo, menos lo que entregó.
    //
    // 🔑 **La plata que se le dio por fuera SUMA, no resta.** El saldo es "cuánto tiene él de lo
    // nuestro", así que transferirle lo que se le debía sube el número hacia cero — restarlo
    // duplicaría la deuda en vez de saldarla, que es justo el error que este signo esconde: los dos
    // caminos dan un número plausible y sólo uno cierra contra la calle.
    const debeTraer = cobrado - tarifas
    const saldoDelDia = debeTraer - (trajo ?? 0) + pagadoAparte
    acumulado += saldoDelDia

    dias.push({
      fecha,
      envios: delDia.length,
      entregados: entregados.length,
      cobrado,
      tarifas,
      debeTraer,
      trajo,
      pagadoAparte,
      saldoDelDia,
      acumulado,
      cerrado: !!cierre?.cerrado_en,
      cerradoPor: cierre?.cerrado_por || null,
      nota: cierre?.nota || null,
    })
  }

  return { dias, saldo: acumulado }
}

/**
 * Los totales con los que se cierra el día. Son los que la planilla calculaba a mano al pie de cada
 * sección, y son la razón por la que la planilla existía:
 *
 *   · `cobrado`   — lo que el cadete juntó en las puertas.
 *   · `tarifas`   — lo que le debemos por haber llevado esos paquetes.
 *   · `debeTraer` — la resta: la plata que tiene que entregar. **Puede dar negativo**, y ahí le
 *                   debemos nosotros. Ver `netoDelEnvio`.
 *
 * Cuentan **sólo lo que se entregó de verdad**. Un envío que volvió sin entregar no cobró nada y
 * tampoco se paga; sumarlo haría que la caja no cierre justo las veces que alguien no estaba en la
 * casa —el caso que la planilla nunca supo registrar, porque no tenía estado—.
 */
export function totalesDelDia(envios: Envio[]): TotalesDia {
  let enviosPagos = 0
  let enviosBonificados = 0
  let cobrado = 0
  let tarifas = 0
  let pendienteDeSalir = 0
  let noEntregados = 0

  for (const e of envios) {
    // 🔑 Los bonificados NO entran en `enviosPagos`, aunque en la puerta se comporten igual. Ese
    // número es plata que ya entró y que hay que controlar; el bonificado no entró nunca. Sumarlo
    // ahí sería inflar la caja con plata que nadie pagó.
    if (e.envio_pagado) enviosPagos += num(e.monto_envio)
    if (e.envio_bonificado) enviosBonificados += num(e.monto_envio)
    if (e.estado === 'entregado') {
      cobrado += aCobrar(e)
      tarifas += tarifaCadete(e)
    }
    if ((ESTADOS_EN_CASA as string[]).includes(e.estado)) pendienteDeSalir++
    if (e.estado === 'no_entregado') noEntregados++
  }

  const debeTraer = cobrado - tarifas
  return {
    envios: envios.length,
    enviosPagos,
    enviosBonificados,
    cobrado,
    tarifas,
    debeTraer,
    pendienteDeSalir,
    noEntregados,
    // Lo que el día cerraría si todo lo que sigue en la calle llegara. La diferencia contra
    // `debeTraer` es exactamente la plata que todavía está afuera.
    debeTraerSiTodoLlega:
      envios.filter((e) => !(ESTADOS_CERRADOS as string[]).includes(e.estado)).reduce((s, e) => s + netoDelEnvio(e), 0) + debeTraer,
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
 * La dirección en una línea, como va impresa en el ticket.
 *
 * Junta lo que TN devuelve por separado y descarta lo vacío, para que no salgan comas huérfanas ni
 * un "piso null" en un ticket que va a leer alguien arriba de una moto.
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
 * todavía sin cargar**; se cotizaba en $3.000 y el ticket seguía diciendo PAGADO. Pasó en la hoja
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
    // Bonificar es una decisión que toma una persona acá adentro, nunca algo que venga de la tienda.
    envio_bonificado: false,
    monto_pedido_a_cobrar: saldoDelProducto(o),
    estado: 'pendiente',
    // La foto congelada: si el cliente cambia su dirección en TN mañana, el ticket ya salió con
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

/**
 * La plata vive en `reglas.core.js` y se re-exporta acá tipada.
 *
 * 🔑 No es prolijidad: la lee gente que no puede importar TypeScript —`api/_envios.js` y el portal
 * que el cadete abre en la calle—. Lo que el papel manda a cobrar, lo que la pantalla muestra y lo
 * que el portal deja marcar salen de la misma función, o un día dicen cosas distintas.
 */
export {
  aCobrar,
  envioSaldado,
  estaTodoPago,
  ESTADOS,
  ESTADOS_CERRADOS,
  ESTADOS_EN_CASA,
  esTurnoDeGrilla,
  MARCAS,
  netoDelEnvio,
  num,
  ORIGENES,
  tarifaCadete,
  TURNOS,
  TURNOS_POR_DIA,
  turnosDe,
  validarEnvio,
} from './reglas.core.js'
