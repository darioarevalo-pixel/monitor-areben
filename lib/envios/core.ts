/**
 * La hoja del cadete, en números: qué se cobra en cada puerta y cuánto tiene que volver del turno.
 *
 * Puro y sin DOM, como el resto de los `lib/<seccion>/core.ts`. Lo que decide acá se muestra en dos
 * lados —la pantalla y la etiqueta impresa— y por eso **se calcula una sola vez**: un total guardado
 * y un total derivado que se pueden contradecir es la forma de que un día la etiqueta diga cobrar
 * algo que la pantalla da por pagado, con el cadete ya en la calle.
 */

import { normalizeArgPhone } from '../crm/core'
import { ESTADOS_CERRADOS, ESTADOS_EN_CASA } from './reglas.core.js'
import type { Envio, TotalesTurno } from './tipos'

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

export { ESTADOS, ESTADOS_CERRADOS, ESTADOS_EN_CASA, MARCAS, ORIGENES, TURNOS, validarEnvio } from './reglas.core.js'
