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
import { aCobrar, num, turnosDe } from './reglas.core.js'
import { diaDeRepartoVecino, proximoDiaDeReparto } from './core'
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
 * La línea de la plata: qué pasa con el envío y cuánto se paga en la puerta.
 *
 * 🔴 **El número de «al recibir» es SIEMPRE `aCobrar`**, la misma función que imprime el ticket y que
 * dibuja la hoja del día. El papel, la pantalla y el WhatsApp tienen que decir el mismo número: si
 * acá se sumara a mano, un envío ya pago le pediría plata en la puerta a alguien a quien el sistema
 * le prometió por escrito que no pagaba nada.
 *
 * 🔑 **Saldado cambia el texto, no lo borra.** Decirle «se abona al recibir» a quien ya lo pagó es el
 * mismo error que el KPI que mandaba a reclamarle plata a una clienta que ya había pagado. Y son dos
 * frases distintas porque son dos hechos distintos: uno ya entró, el otro no entra nunca.
 */
function laPlata(e: Envio, donde: string): string {
  const envio = num(e.monto_envio)
  const total = aCobrar(e)
  const destino = donde ? ` a ${donde}` : ''

  if (e.envio_bonificado) {
    return total > 0
      ? `El envío${destino} va sin cargo, y al recibir se abonan ${money(total)} del pedido.`
      : `El envío${destino} va sin cargo.`
  }
  if (e.envio_pagado) {
    return total > 0
      ? `El envío${destino} ya está pago, y al recibir se abonan ${money(total)} del pedido.`
      : `El envío${destino} ya está pago.`
  }
  // El desglose va **sólo cuando la puerta cobra dos cosas**, igual que en el ticket: repetir el
  // mismo número en chico al lado del grande invita a leer el chico.
  return total > envio
    ? `El envío${destino} sale ${money(envio)}, y al recibir se abonan ${money(total)} (envío ${money(envio)} + pedido ${money(total - envio)}).`
    : `El envío${destino} sale ${money(envio)} y se abona al recibir.`
}

/**
 * **El mensaje entero.** `null` cuando todavía no se puede armar.
 *
 * 🔴 **Sin precio no hay mensaje.** Es el mismo criterio que `puedeIrAUnDia`: un mensaje de
 * coordinación que no dice cuánto sale obliga a un segundo mensaje con la plata, que es exactamente
 * el ida y vuelta que esto viene a sacar. Y callarse el precio adentro de un texto que habla de
 * plata es peor que no mandarlo. La pantalla lo lee como «el botón abre el chat vacío, como antes».
 *
 * 🔑 **Dos formas, según la fila tenga día o no**, y la decide el dato y no la pantalla desde la que
 * se abre: sin día **propone** los dos próximos y pregunta —el día lo confirma la clienta, que es la
 * regla de la sección—; con día **confirma** el que ya tiene puesto. Un solo texto para los dos casos
 * volvería a proponer un día sobre uno ya acordado, que es cómo se pierde un turno.
 *
 * `hoy` entra como parámetro para que la función sea pura: mirar el reloj adentro la vuelve
 * imposible de afirmar, y el día del reparto es justo lo que hay que poder fijar en un test.
 */
export function mensajeParaLaClienta(e: Envio, hoy: string): string | null {
  if (!(num(e.monto_envio) > 0)) return null

  const marca = e.store === 'zattia' ? 'Zattia' : 'BDI'
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

  if (esFechaIso(e.fecha)) {
    const cuando = cuandoPasamos(String(e.fecha), e.turno)
    if (cuando) lineas.push(`Pasamos ${cuando}. ¡Cualquier cosa avisanos por acá!`)
  } else {
    const opciones = diasQueOfrecemos(hoy).map((f) => cuandoPasamos(f)).filter(Boolean)
    if (opciones.length) lineas.push(`Podemos pasar ${opciones.join(' o ')}. ¿Cuál te viene mejor?`)
  }

  return lineas.join('\n')
}
