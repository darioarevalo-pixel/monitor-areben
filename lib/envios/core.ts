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
import { aCobrar, ESTADOS_CERRADOS, ESTADOS_EN_CASA, movimientoVivo, netoDelEnvio, num, pagoAlLocal, tarifaCadete, turnosDe } from './reglas.core.js'
import type { Marca } from '../nav'
import type { CierreDia, CuentaCadete, DiaDeCuenta, Envio, MovimientoCuenta, OrdenTN, TotalesDia, Traida, Turno } from './tipos'

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
 *
 * ⛔ **Y NO se filtra por «ya despachada» ni por «cerrada». Medido el 17-ago-2026 y quedó
 * decidido que no.** Era la pregunta abierta de la tanda 5 — Tienda Nube no tiene «entregado», así
 * que la tentación es sacar de la hoja lo que TN da por terminado. Las dos formas fallan:
 *   · `estado_orden === 'closed'` marca **20 de las 23 órdenes de cadetería de 30 días (87%)** y
 *     —el número que cierra la discusión— **7 de los 10 envíos que en ese momento estaban sin
 *     entregar en `envios_reparto`, incluidos los 2 que salían ESE DÍA**. Con este filtro la hoja
 *     del 17-ago salía vacía: en el local cierran la orden cuando la empaquetan, no cuando llega.
 *   · `shipping_status === 'fulfilled'` no excluye **nada**: 0 de 23 en cadetería y 0 de 78
 *     órdenes vivas de las dos tiendas en 30 días (ni siquiera las 13 del correo que sí tienen
 *     `shipped_at`). Es un filtro que hoy no hace nada y que el día que alguien empiece a tildar
 *     «despachado» al empaquetar vacía la hoja **en silencio**. Por eso `envio_estado` ni siquiera
 *     entra en `OrdenTN`: el campo existe en el mapper de `tiendanube-audit` y se deja afuera.
 * Lo que saca un envío de la hoja es que alguien lo entregue, no lo que TN opine de la orden.
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
 * 🔑 **La plata que va y viene son los `movimientos`, y ya vienen con signo.** El día aporta al
 * saldo `(cobrado − tarifas) + Σ movimientos vivos`, y esa suma no tiene ningún `if` que decida si
 * una fila suma o resta — porque no hay dónde invertirlo. Ver `montoDelMovimiento`.
 *
 * **Cero totales guardados**, igual que antes y por lo mismo: si el saldo de ayer quedara congelado
 * en una columna y alguien corrigiera el precio de un envío de ayer, el acumulado de hoy mentiría
 * sin que nada falle.
 *
 * El signo, una sola vez y para todo el módulo: **positivo = el cadete tiene plata nuestra**;
 * negativo = se la debemos.
 */
export function cuentaDelCadete(
  envios: Envio[],
  cierres: CierreDia[],
  movimientos: MovimientoCuenta[] = [],
): CuentaCadete {
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
  // 🔑 **Y los días salen de TRES fuentes, no de dos.** Un movimiento puede caer en un día sin
  // reparto —el jueves que rinde lo del lunes al miércoles, el sábado que se le transfiere lo que se
  // le debía— y ése es justamente el caso que la tabla vieja no sabía anotar: su PK era el día de
  // reparto. Sin esta línea, esa plata existe en la base y no aparece en ninguna fila.
  for (const m of movimientos) if (m.fecha && !porDia.has(m.fecha)) porDia.set(m.fecha, [])

  const fechas = [...porDia.keys()].sort()
  let acumulado = 0
  let sinCobrarTotal = 0
  const dias: DiaDeCuenta[] = []

  for (const fecha of fechas) {
    const delDia = porDia.get(fecha) || []
    const entregados = delDia.filter((e) => e.estado === 'entregado')
    const cierre = cierres.find((c) => c.fecha === fecha) || null

    // 🔴 **Lo que se pagó al local no se le reclama a él.** Antes toda entrega sumaba `aCobrar` a lo
    // que tenía que traer, tildara lo que tildara en la puerta: el cadete quedaba debiendo plata que
    // nunca tuvo en la mano, y como la pantalla interna ni siquiera pedía la columna, la diferencia
    // se discutía de memoria. La tarifa sí se le paga igual —llevó el paquete—, así que sale de
    // `cobrado` y **no** de `tarifas`.
    //
    // 🔑 **Los dos baldes son «quién tiene la plata», no «entró o no entró»**: un pedido no se
    // entrega si no está pago, así que todo lo entregado ya se cobró; lo único que decide `pagoAlLocal`
    // es si entró por la mano del cadete o por transferencia. Ver su comentario.
    const cobrado = entregados.filter((e) => !pagoAlLocal(e)).reduce((s, e) => s + aCobrar(e), 0)
    const sinCobrar = entregados.filter(pagoAlLocal).reduce((s, e) => s + aCobrar(e), 0)
    const tarifas = entregados.reduce((s, e) => s + tarifaCadete(e), 0)
    sinCobrarTotal += sinCobrar

    // 🔑 **Los movimientos se SUMAN, tal como vienen.** El signo ya viene adentro del dato
    // (`montoDelMovimiento`), así que acá no hay ningún `if` que decida si esta fila suma o resta —
    // y por lo tanto no hay ninguno que se pueda invertir. Ése era el defecto que escondía el
    // modelo anterior: restar `pagado_aparte` en vez de sumarlo DUPLICABA la deuda en vez de
    // saldarla, y los dos caminos daban un número plausible.
    //
    // Los anulados quedan en la lista para que la pantalla los muestre tachados, pero no suman: la
    // fila no se borra porque puede haber un recibo impreso en la mano del cadete.
    const delDiaMov = movimientos.filter((m) => m.fecha === fecha)
    const movido = delDiaMov.filter(movimientoVivo).reduce((s, m) => s + num(m.monto), 0)

    const debeTraer = cobrado - tarifas
    const saldoDelDia = debeTraer + movido
    acumulado += saldoDelDia

    dias.push({
      fecha,
      envios: delDia.length,
      entregados: entregados.length,
      cobrado,
      sinCobrar,
      tarifas,
      debeTraer,
      movimientos: delDiaMov,
      movido,
      saldoDelDia,
      acumulado,
      cerrado: !!cierre?.cerrado_en,
      cerradoPor: cierre?.cerrado_por || null,
      nota: cierre?.nota || null,
    })
  }

  return { dias, saldo: acumulado, sinCobrar: sinCobrarTotal }
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
  let sinCobrar = 0
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
      // La misma partición que en `cuentaDelCadete`, y por el mismo motivo: lo que se pagó al local
      // no es plata que él tenga que traer. La tarifa se le paga igual, llevó el paquete.
      if (pagoAlLocal(e)) sinCobrar += aCobrar(e)
      else cobrado += aCobrar(e)
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
    sinCobrar,
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

/**
 * De qué tiendas se traen las órdenes: la del header, y nada más.
 *
 * Sin marca en la sesión —que con sesión no pasa— se traen las dos, que es lo que hacía siempre: un
 * array vacío sería un botón que no hace nada y no dice por qué.
 */
export function marcasATraer(marca: Marca | null | undefined): Marca[] {
  return marca ? [marca] : (['bdi', 'zattia'] as Marca[])
}

// ── La zona de reparto ───────────────────────────────────────────────────────────────────────

/**
 * Los códigos postales a los que llega la moto.
 *
 * 🔑 **Es una lista a mano y está bien que lo sea.** Sale del mismo mapa con el que se cotiza
 * —Rosario $3.000-4.300, Fisherton $4.300/5.500, Funes $8.000, Roldán $11.000, VGG $6.500— y se
 * corrige editando esta línea, no con una migración. Una tabla de zonas para seis números sería
 * darle mantenimiento a algo que cambia una vez por año.
 *
 * ⚠️ **Es un aviso, no un bloqueo.** Un pedido de afuera de la zona puede salir igual —lo decide
 * quien cotiza—; lo que no puede es pasar desapercibido hasta que el cadete está en la calle.
 */
export const CP_DE_REPARTO = [
  '2000', // Rosario (incluye Fisherton)
  '2121', // Pérez
  '2124', // Villa Gobernador Gálvez
  '2132', // Funes
  '2134', // Roldán
  '2152', // Granadero Baigorria
]

/**
 * ¿Este pedido eligió cadetería sin ser de la zona?
 *
 * 🔴 **Con el CP vacío devuelve `false`, y es lo importante.** Una alarma que suena en todas las
 * filas viejas —las que se trajeron antes de que se guardara el CP— deja de significar algo en dos
 * días, y a partir de ahí nadie mira la única que sí importaba.
 *
 * ⚠️ Y no alcanza solo: se midió en prod el 15-ago-2026 una orden con **CP 2000 y localidad «San
 * Martin de las Escobas»**, que está a 100 km. El CP lo tipea el cliente, así que puede mentir. Esto
 * levanta la mano, no cierra la puerta.
 */
export function cpFueraDeZona(cp: string | null | undefined): boolean {
  const limpio = String(cp ?? '').replace(/\D/g, '')
  if (!limpio) return false
  return !CP_DE_REPARTO.includes(limpio.slice(0, 4))
}

// ── El pedido que va adentro del paquete ─────────────────────────────────────────────────────

/** Una línea de la orden, como quedó congelada al traerla. */
export type ItemDelPedido = { nombre: string; sku: string | null; cantidad: number; precio: number }

/**
 * Los ítems de la orden congelada.
 *
 * 🔴 **Cada nivel tiene su guarda, y no es paranoia.** `datos` es jsonb libre: hay filas cargadas a
 * mano que lo tienen vacío, y las viejas pueden no traer `products`. Un `e.datos.tn.products.map`
 * tira un TypeError **en el render**, y eso no deja un cartel de error: React reintenta, se come la
 * memoria y Chrome mata la pestaña. Ya pasó tres veces en esta misma sección.
 *
 * Sale de lo guardado y no de Tienda Nube: lo que se muestra es lo que el cadete tiene en la mano.
 */
export function itemsDelPedido(e: Envio): ItemDelPedido[] {
  const datos = (e?.datos ?? {}) as Record<string, unknown>
  const tn = (datos.tn ?? {}) as Record<string, unknown>
  const crudos = Array.isArray(tn.products) ? tn.products : []
  return crudos.map((p) => {
    const it = (p ?? {}) as Record<string, unknown>
    return {
      nombre: String(it.name ?? 'Sin nombre'),
      sku: it.sku == null ? null : String(it.sku),
      cantidad: num(it.quantity as string),
      precio: num(it.price as string),
    }
  })
}

/** Lo que hay que decir del pedido en una línea: cuántas cosas son y si queda algo por cobrar. */
export function resumenDelPedido(e: Envio): { items: number; aCobrar: number; pago: boolean } {
  const items = itemsDelPedido(e).reduce((s, i) => s + i.cantidad, 0)
  const saldo = num(e.monto_pedido_a_cobrar)
  return { items, aCobrar: saldo, pago: saldo === 0 }
}

/**
 * ¿Este envío puede salir a un día?
 *
 * 🔴 **Sin precio no sale, y esto BLOQUEA.** Antes era un aviso amarillo que se podía pasar de
 * largo, y el resultado era un paquete en la calle con un ticket que no le pide nada al cliente —o
 * sea, un envío que nadie cobra y un cadete al que igual hay que pagarle—. El precio del envío es
 * las dos cosas a la vez: lo que se cobra en la puerta y lo que se le paga a él.
 *
 * El bonificado pasa igual: tiene precio cargado, sólo que no lo paga la clienta.
 */
export function puedeIrAUnDia(e: Envio): { ok: boolean; motivo: string | null } {
  if (!(num(e.monto_envio) > 0)) {
    return { ok: false, motivo: 'Falta el precio del envío. Es lo que cobra el cadete: sin eso el paquete no puede salir.' }
  }
  return { ok: true, motivo: null }
}

/**
 * El pago del envío, en **tres** estados: Pendiente · Pago · Bonificado.
 *
 * 🔑 **El label y el verbo salen de la misma función a propósito.** Son las dos mitades de una
 * decisión —dónde está la fila y hacia dónde la mueve el botón— y separarlas es la forma de que un
 * día el botón diga una cosa y haga otra. Por eso devuelve también `siguiente`, que es literalmente
 * lo que se le pasa a `marcarPagado`.
 *
 * 🔴 **Bonificado no es Pago.** Se cobra igual en la puerta —nada—, pero uno es plata que entró y el
 * otro plata que no entró nunca: colapsarlos en un booleano hace que la columna diga que cobramos un
 * envío que regalamos. Se guardan en dos tildes excluyentes y acá se leen como dos estados.
 *
 * El pendiente es `warning` y no un texto gris: «lo cobra el cadete» describía lo normal en vez de
 * nombrar el estado, así que nada distinguía la fila que falta cobrar de la que ya está resuelta.
 */
/**
 * **Por dónde entró la plata de esa puerta**: el rótulo, y el verbo que lo corrige.
 *
 * Calcado de `pagoDelEnvio` y por el mismo motivo: el label y la acción salen de **una** función, así
 * que el botón no puede decir una cosa y escribir otra. Y como `cobrado` tiene tres valores, el
 * `siguiente` viaja explícito en vez de deducirse con un `!`.
 *
 * 🔑 **`null` se rotula por lo que la cuenta HACE con él, no por lo que la base guarda.** Es "nadie
 * dijo nada", y la cuenta lo trata como cobrado por el cadete —o sea, plata que él tiene que traer—:
 * mostrarlo como un guión dejaría el número más importante de la pantalla sin explicación en todas
 * las filas viejas, que son el 100% de las anteriores al portal.
 *
 * 🔑 **Y por eso el `null` no ofrece "volver a sin dato"**: no hay nada que ganar volviendo a un
 * estado que se lee igual, y sí hay algo que perder — el tilde del cadete es un hecho reportado y
 * pisarlo con "nadie dijo nada" borra su testimonio. Se corrige a un lado o al otro.
 */
export function quienCobro(e: Envio): { tone: 'success' | 'brand' | 'warning'; label: string; accion: string; siguiente: boolean } {
  if (e.cobrado === false) return { tone: 'brand', label: 'Se pagó al local', accion: 'En realidad la cobró el cadete', siguiente: true }
  if (e.cobrado === true) return { tone: 'success', label: 'La cobró el cadete', accion: 'En realidad se pagó al local', siguiente: false }
  return { tone: 'warning', label: 'Sin dato: cuenta como cobrada por él', accion: 'Se pagó al local', siguiente: false }
}

export function pagoDelEnvio(e: Envio): { tone: 'success' | 'brand' | 'warning'; label: string; accion: string; siguiente: boolean } {
  if (e.envio_pagado) return { tone: 'success', label: 'Pago', accion: 'Marcar como pendiente', siguiente: false }
  if (e.envio_bonificado) return { tone: 'brand', label: 'Bonificado', accion: 'Marcar como pago', siguiente: true }
  return { tone: 'warning', label: 'Pendiente', accion: 'Marcar como pago', siguiente: true }
}

/**
 * Qué tickets se imprimen: los que **todavía van a salir**, opcionalmente de una sola marca.
 *
 * 🔑 **No reimprime lo cerrado.** Un ticket de un entregado en la pila manda al cadete a una puerta
 * donde ya estuvo. (Reimprimir uno suelto sí se puede, desde su fila: ahí lo pidió una persona.)
 *
 * El filtro por marca existe porque la mochila se arma por marca aunque el reparto sea uno: se
 * juntan los paquetes de BDI, se imprimen los suyos, y después los de Zattia. Sin esto había que
 * imprimir todo junto y separarlo a mano de la pila.
 */
export function paraImprimir(envios: Envio[], marca?: Marca | null): Envio[] {
  return envios.filter((e) => !(ESTADOS_CERRADOS as string[]).includes(e.estado) && (!marca || e.store === marca))
}

/** Las marcas que de verdad hay en esta lista, en orden. Es lo que decide cuántos botones se pintan. */
export function marcasPresentes(envios: Envio[]): Marca[] {
  return (['bdi', 'zattia'] as Marca[]).filter((m) => envios.some((e) => e.store === m))
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
 * La semilla de un envío cargado a mano, con o sin día.
 *
 * 🔑 **Sin día es un estado legítimo, no un formulario a medio llenar.** El caso es la clienta que
 * escribe por WhatsApp antes de que haya fecha: la bandeja «Sin fecha» existe justamente para eso
 * con lo que llega de Tienda Nube, pero el alta a mano seguía sembrando el día abierto y obligaba a
 * inventar una fecha —lo mismo que la bandeja vino a evitar—.
 *
 * 🔑 **El turno lo pone esta función, no el llamador.** `fecha` y `turno` van los dos o ninguno (el
 * check `envios_fecha_turno_juntos` lo hace cumplir en la base, y era el 53,8% de las filas rotas de
 * la planilla vieja). Que el invariante viva en un solo lugar es lo que evita que un llamador nuevo
 * mande fecha sola y se entere recién con la clienta al teléfono.
 *
 * La marca es la del header y no una fija: la bandeja filtra por marca, así que una fila creada con
 * `bdi` puesto parado en Zattia **desaparece de la pantalla al recargar**.
 */
export function envioNuevoAMano(opts: { marca?: Marca | null; fecha?: string | null } = {}): Partial<Envio> {
  const fecha = opts.fecha || null
  return {
    id: nuevoIdEnvio(),
    store: opts.marca || 'bdi',
    fecha,
    turno: fecha ? ((turnosDe(fecha)[0] as Turno) || 'tarde') : null,
    origen: 'manual',
    estado: 'pendiente',
    envio_pagado: false,
    envio_bonificado: false,
  }
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
    // El CP se guarda en su columna además de quedar en `datos`: es lo que decide el aviso de zona,
    // y cavar en el jsonb para una consulta que la pantalla hace en cada fila no se sostiene.
    cp: d?.cp || null,
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
  CAMPOS,
  CAMPOS_CUENTA,
  CAMPOS_MOVIMIENTO,
  claseDelMovimiento,
  CLASES_MOVIMIENTO,
  conIntentoFallido,
  envioSaldado,
  estaTodoPago,
  ESTADO_LABEL,
  ESTADOS,
  ESTADOS_CERRADOS,
  ESTADOS_EN_CASA,
  esTurnoDeGrilla,
  FILTRO_BANDEJA,
  MARCAS,
  montoDelMovimiento,
  MOVIMIENTO_LABEL,
  movimientoVivo,
  netoDelEnvio,
  num,
  ORIGENES,
  pagoAlLocal,
  siguienteEstado,
  tarifaCadete,
  TURNOS,
  TURNOS_POR_DIA,
  turnosDe,
  validarEnvio,
  validarMovimiento,
  valorDeCobro,
} from './reglas.core.js'
