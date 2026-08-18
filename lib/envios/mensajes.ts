/**
 * El mensaje que el local le manda a la clienta para coordinar el envío, armado por el sistema.
 *
 * **Por qué deja de tipearse.** Es el primer contacto después de que entra la orden: cuánto sale el
 * envío y cuándo pasa la moto. Se escribía de memoria en cada pedido, con los dos datos que más
 * caro salen mal —el precio y el día— sacados de la cabeza. Desde que el mapa de zonas propone el
 * precio y la grilla de turnos vive en el código, las dos mitades ya están adentro del sistema.
 *
 * ⛔ **No es `mensajeParaLaPuerta`** (`portal.core.js`). Ése lo manda **el cadete desde la calle**,
 * cuando ya está yendo, y pide la ubicación para el GPS. Éste lo manda **el local antes de que el
 * envío tenga día**. Juntarlos sería un solo texto que miente en los dos momentos.
 *
 * 🔑 **Se precarga, no se manda.** `wa.me` abre el chat con el texto escrito y lo revisa una persona
 * — que además puede corregirlo. Mismo criterio que Canjes y que el mensaje del cadete.
 *
 * Archivo PURO y con tests, del molde de `lib/canjes/mensajes.ts`: son textos que salen a alguien de
 * afuera y hablan de plata, así que no se improvisan.
 */

import { sumarDias } from '../calendario/fechas.core.js'
import { num, turnosDe } from './reglas.core.js'
import { diaDeRepartoVecino, nombreDeMarca, proximoDiaDeReparto } from './core'
import type { Envio } from './tipos'

/**
 * `$ 4.300`.
 *
 * El `replace` no es cosmético: `toLocaleString('es-AR')` separa el símbolo con un **espacio duro**
 * (U+00A0). Esto se pega en WhatsApp, donde un carácter invisible distinto es la clase de detalle que
 * después nadie entiende. ⛔ No se usa el `formatMoney` del kit: este archivo es puro y no importa de
 * `components/`.
 *
 * 🔴 **Va escrito `\u00A0` y no el carácter pegado.** En `lib/canjes/mensajes.ts` está pegado literal
 * y **hoy es un no-op** —el archivo no tiene un solo espacio duro adentro, así que reemplaza un
 * espacio común por otro— porque en algún copiado el carácter se normalizó y nada falló. Un escape
 * no se puede perder al copiar. (En `lib/reclamos/mensajes.ts` sí sobrevivió: son tres copias de la
 * misma regla y dos de ellas divergieron en silencio.)
 */
const money = (n: number) =>
  n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).replace(/\u00A0/g, ' ')

const esFechaIso = (f: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(String(f || ''))

/**
 * 🔑 **Se indexa con `getUTCDay()`: 0 es domingo**, la misma convención que `TURNOS_POR_DIA` y que
 * `DIAS_CORTOS`. Dar vuelta el array para que arranque en lunes corre todas las etiquetas un día
 * **sin que falle nada** — ya pasó una vez en este repo.
 */
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']

/**
 * «martes 18», que es como se dice un día por WhatsApp.
 *
 * 🔴 **No se usa `rotuloFecha`**: da «mar 18-ago», que es la abreviatura de una pantalla interna, y
 * además **tira con `''`** — un throw acá mata la pestaña entera. Acá se guardea y se devuelve `''`,
 * que es lo que hace que el mensaje se arme sin la línea del día en vez de no armarse.
 */
export function diaEnCriollo(fecha: string): string {
  if (!esFechaIso(fecha)) return ''
  const [a, m, d] = fecha.split('-').map(Number)
  // Mediodía UTC: la misma cuenta que el resto del módulo, para que el huso no corra el día.
  const f = new Date(Date.UTC(a, m - 1, d, 12))
  return `${DIAS[f.getUTCDay()]} ${f.getUTCDate()}`
}

/**
 * «el martes 18 a la tarde», o «el martes 18 (a la mañana o a la tarde)» cuando ese día sale dos
 * veces. Con `turno` puesto dice **ése**; sin turno ofrece los que la grilla tiene.
 *
 * 🔑 **Los turnos salen de `turnosDe`, no de una lista escrita acá.** Es el mismo lugar del que sale
 * la grilla que después valida la pantalla: dos copias se corrigen de a una, y la que quedaría vieja
 * es la que ya se le prometió a la clienta.
 */
export function cuandoPasamos(fecha: string, turno?: string | null): string {
  const dia = diaEnCriollo(fecha)
  if (!dia) return ''
  if (turno) return `el ${dia} a la ${turno}`
  const turnos = turnosDe(fecha)
  if (!turnos.length) return `el ${dia}`
  if (turnos.length === 1) return `el ${dia} a la ${turnos[0]}`
  return `el ${dia} (${turnos.map((t: string) => `a la ${t}`).join(' o ')})`
}

/**
 * Los dos próximos días de reparto que se le ofrecen.
 *
 * 🔑 **Arrancan MAÑANA, no hoy.** Cuando alguien escribe el primer mensaje la mochila de hoy ya está
 * armada y la moto puede estar en la calle: ofrecer «hoy a la tarde» es prometer un turno que ya
 * salió. Es esta línea y nada más si algún día se decide al revés.
 *
 * 🔑 **Se apoya en `proximoDiaDeReparto` y `diaDeRepartoVecino`**, que es la grilla que ya usan las
 * flechas y el modal de agendar: reimplementar el salto acá sería una segunda forma de contestar lo
 * mismo, que se puede equivocar sola.
 */
export function diasQueOfrecemos(hoy: string): string[] {
  if (!esFechaIso(hoy)) return []
  const primero = proximoDiaDeReparto(sumarDias(hoy, 1))
  const segundo = diaDeRepartoVecino(primero, 1)
  return segundo === primero ? [primero] : [primero, segundo]
}

/**
 * La línea de la plata: **cuánto sale el envío, y nada más.**
 *
 * 🔴 **Dice SÓLO el envío, y es una decisión de Bruno del 18-ago-2026** —*«dejalo que diga solo el
 * envío, sin el total»*—. La versión anterior nombraba también el saldo del pedido y la suma que la
 * puerta iba a cobrar. ⚠️ **La consecuencia, dicha para que nadie la «arregle» de vuelta sin
 * saberlo**: en una fila con saldo del pedido el mensaje nombra $ 4.200 y el cadete cobra $ 16.342.
 * Está aceptado —el ticket sigue diciendo el número entero y `aCobrar` sigue siendo la única
 * cuenta—, pero el mensaje **ya no es** el lugar donde ese número se promete.
 *
 * 🔴 **Y la forma de pago NO se nombra**, por el mismo mensaje de Bruno: *«depende mucho de qué
 * seleccionó en la compra, entonces no nos metamos en eso»*. Una línea que diga «efectivo o
 * transferencia» es una afirmación sobre lo que la clienta ya eligió en el checkout, y este archivo
 * no tiene ese dato. ⛔ No se vuelve a agregar sin traerlo.
 *
 * 🔑 **Saldado cambia el texto, no lo borra.** Ponerle un costo a quien ya lo pagó —o a quien se lo
 * regalamos— es el mismo error que el KPI que mandaba a reclamarle plata a una clienta que ya había
 * pagado. Y son dos frases distintas porque son dos hechos distintos: uno ya entró, el otro no entra
 * nunca.
 */
function laPlata(e: Envio, donde: string): string {
  const destino = donde ? ` a ${donde}` : ''
  // ⛔ Bonificado primero, como en el ticket: son dos tildes distintas y no se colapsan.
  if (e.envio_bonificado) return `El envío${destino} va sin cargo.`
  if (e.envio_pagado) return `El envío${destino} ya está pago.`
  return `El costo del envío${destino} es de ${money(num(e.monto_envio))}.`
}

/**
 * **El mensaje entero.** `null` cuando todavía no se puede armar.
 *
 * 🔴 **Sin precio no hay mensaje.** Es el mismo criterio que `puedeIrAUnDia`: un mensaje de
 * coordinación que no dice cuánto sale obliga a un segundo mensaje con la plata, que es exactamente
 * el ida y vuelta que esto viene a sacar. Y callarse el precio adentro de un texto que habla de
 * plata es peor que no mandarlo. La pantalla lo lee como «el botón abre el chat vacío, como antes».
 *
 * 🔴 **SIEMPRE propone, nunca confirma un día ya puesto** (17-ago-2026, lo decidió Bruno viéndolo).
 * Este mensaje es **el primer contacto y vive sólo en la bandeja «Sin fecha»**: es el que abre la
 * conversación, no el que la sigue. Hubo una versión que confirmaba el día cuando la fila lo tenía —
 * pensada para la hoja del día, donde ya no se usa— y **en la bandeja habría sido un defecto**: un
 * `no_entregado` vuelve a la bandeja **con la fecha de su intento fallido puesta**, así que ese texto
 * le habría confirmado a la clienta el día en que no la encontraron.
 *
 * `hoy` entra como parámetro para que la función sea pura: mirar el reloj adentro la vuelve
 * imposible de afirmar, y el día del reparto es justo lo que hay que poder fijar en un test.
 */
export function mensajeParaLaClienta(e: Envio, hoy: string): string | null {
  if (!(num(e.monto_envio) > 0)) return null

  // 🔴 «BDI Accesorios», no «BDI»: el mismo nombre que imprime el ticket, y sale del mismo lugar.
  // Cuando cada papel tenía su tabla, el ticket decía el largo y el WhatsApp el corto.
  const marca = nombreDeMarca(e.store)
  const pila = String(e.cliente || '').trim().split(/\s+/)[0]
  const nombre = pila ? pila.charAt(0).toUpperCase() + pila.slice(1) : ''
  // 🔴 **Los espacios de más se juntan, y no es cosmética.** Medido en prod: 3 de las 11 direcciones
  // tienen doble espacio («Brown  1807»), tal como las tipearon en Tienda Nube. En una tabla no se
  // ve; en un mensaje que sale a la clienta se lee como un descuido nuestro sobre su propia
  // dirección. Se limpia acá, en el texto que sale, y no en el dato: el dato es lo que ella escribió.
  const limpio = (x: unknown) => String(x || '').replace(/\s+/g, ' ').trim()
  const donde = [e.direccion, e.localidad].map(limpio).filter(Boolean).join(', ')

  const lineas = [
    `Hola${nombre ? ' ' + nombre : ''}! Te escribimos de ${marca} por tu pedido${e.orden_numero ? ` #${e.orden_numero}` : ''}.`,
    laPlata(e, donde),
  ]

  // 🔴 **La despedida viaja PEGADA a los días, no suelta al final.** «Esperamos tu confirmación» es
  // el pedido de que elija uno de los días de arriba: sin esa línea queda pidiendo que confirme algo
  // que el mensaje nunca dijo, y la clienta contesta preguntando qué.
  const opciones = diasQueOfrecemos(hoy).map((f) => cuandoPasamos(f)).filter(Boolean)
  if (opciones.length) {
    lineas.push(`Podríamos enviar ${opciones.join(' o ')}.`)
    lineas.push('¡Esperamos tu confirmación!')
  }

  return lineas.join('\n')
}
