/**
 * Qué se fotografió, de todo lo que salió. El resultado de la sesión, que no existía.
 *
 * 🔴 **El módulo entero seguía la LOGÍSTICA y no sabía nada del RESULTADO.** Sabe qué se pidió
 * (`items`), qué se preparó (`verif`), qué salió (`salioEfectivo`) y qué volvió (`devuelto`), y con
 * eso una solicitud podía llegar a `cerrada` —el estado que dice «terminó bien»— **sin una sola
 * foto sacada**, sin que quedara registro y sin que nadie se enterara. Cerrar significaba «volvió
 * la mercadería», no «se hizo el trabajo».
 *
 * ⚠️ ⛔ **No confundir con `faltantes()`**, que es lo que salió y NO VOLVIÓ del depósito. Son cosas
 * distintas y pueden pasar juntas: una prenda puede haberse fotografiado y no haber vuelto, o haber
 * vuelto sin fotografiarse. Por eso es un mapa aparte y no un estado más de la solicitud.
 *
 * 🔑 **Tres respuestas, no dos: sí · no · SIN CONTESTAR.** Es la decisión que ordena todo el
 * archivo, y es forzada: con un mapa de «fotografiados», la solicitud que nadie contestó diría que
 * **no se fotografió nada** (una falsa alarma por cada sesión vieja); con un mapa de «no
 * fotografiados», diría que **se fotografió todo** (un éxito que nadie afirmó). Las dos formas
 * hacen que la ausencia de dato AFIRME algo. La tercera respuesta es lo único que deja que la
 * pantalla diga «esto todavía no lo contestó nadie», que es lo que de verdad pasa —
 * mismo criterio que el `no_se` del «¿rindió?» de un canje.
 */

import { salioEfectivo } from './core'
import type { ItemSolicitud, Solicitud } from './tipos'

export type { RegistroFoto } from './tipos'

/** La respuesta de una variante. `sin-contestar` es la ausencia, y es un estado de primera. */
export type RespuestaFoto = 'si' | 'no' | 'sin-contestar'

/**
 * Motivos sugeridos cuando algo no se pudo fotografiar. Son SUGERENCIAS (van de placeholder), no
 * un catálogo cerrado: nadie caminó todavía una sesión anotando por qué no se pudo, así que fijar
 * la lista ahora sería inventar el vocabulario del trabajo antes de escucharlo.
 */
export const MOTIVOS_SIN_FOTO = ['No alcanzó el tiempo', 'Producto fallado', 'No entró en el look', 'Faltó la modelo'] as const

/**
 * Las variantes que se PUEDEN fotografiar: las que efectivamente salieron.
 *
 * Preguntar por lo que nunca salió del depósito sería pedir que se conteste por algo que no pasó, y
 * ensuciaría el «sin contestar» con renglones que nadie puede contestar. Es el mismo criterio con
 * el que `esperadoEn` calcula la devolución: lo que salió, no lo que se pidió.
 */
export function fotografiables(s: Solicitud): ItemSolicitud[] {
  return (s.items || []).filter((i) => salioEfectivo(s, i) > 0)
}

/** Qué contestó esta variante. Lo que no está en el mapa está sin contestar. */
export function respuestaFoto(s: Solicitud, vid: string): RespuestaFoto {
  const r = (s.fotos || {})[vid]
  if (!r) return 'sin-contestar'
  return r.ok ? 'si' : 'no'
}

export type ResumenFotos = {
  si: number
  no: number
  sinContestar: number
  /** Cuántas variantes se podían fotografiar (las que salieron). */
  total: number
}

/**
 * El resumen de la sesión.
 *
 * 🔴 `sinContestar` NO se suma a `no`: no saber si se fotografió no es lo mismo que saber que no se
 * fotografió. Sumarlos haría que toda solicitud vieja aparezca como un fracaso.
 */
export function resumenFotos(s: Solicitud): ResumenFotos {
  const items = fotografiables(s)
  let si = 0
  let no = 0
  for (const i of items) {
    const r = respuestaFoto(s, i.vid)
    if (r === 'si') si += 1
    else if (r === 'no') no += 1
  }
  return { si, no, sinContestar: items.length - si - no, total: items.length }
}

/** Lo que salió y NO se fotografió, con su motivo. ⛔ No incluye lo que nadie contestó. */
export function sinFotografiar(s: Solicitud): Array<ItemSolicitud & { motivo?: string }> {
  return fotografiables(s)
    .filter((i) => respuestaFoto(s, i.vid) === 'no')
    .map((i) => ({ ...i, motivo: (s.fotos || {})[i.vid]?.motivo }))
}

/** Lo que salió y todavía no contestó nadie. Es lo que la pantalla tiene que poder nombrar. */
export function sinContestar(s: Solicitud): ItemSolicitud[] {
  return fotografiables(s).filter((i) => respuestaFoto(s, i.vid) === 'sin-contestar')
}

/**
 * ¿Vale la pena preguntar por las fotos de esta solicitud? Sólo si ya salió algo.
 *
 * Antes de que salga no hay nada que contestar, y mostrar el bloque vacío invita a contestar por
 * adelantado — que es exactamente el dato que no sirve.
 */
export function hayQuePreguntar(s: Solicitud): boolean {
  return fotografiables(s).length > 0
}

/**
 * Anota (o corrige) la respuesta de una variante. Solicitud → solicitud, la misma forma que
 * `sinItemSol` y `cambiarCantidadSol`: son las vecinas que editan ÍTEMS, y el detalle las aplica
 * con `setWork((w) => ...)`.
 *
 * `null` BORRA la respuesta y la devuelve a «sin contestar»: si contestar por error dejara la
 * variante marcada para siempre, la única salida sería mentir en el otro sentido.
 */
export function conRespuestaFoto(
  s: Solicitud,
  vid: string,
  ok: boolean | null,
  meta: { por: string; motivo?: string; ts: number },
): Solicitud {
  const fotos = { ...(s.fotos || {}) }
  if (ok === null) delete fotos[vid]
  // El motivo sólo se guarda cuando explica algo: con `ok: true` no tiene sentido y quedaría
  // pegado de una respuesta anterior.
  else fotos[vid] = { ok, ...(ok ? {} : meta.motivo ? { motivo: meta.motivo } : {}), por: meta.por, ts: meta.ts }
  return { ...s, fotos }
}

/**
 * Contesta de una todas las que están SIN CONTESTAR. ⛔ No pisa lo ya contestado: el atajo
 * «se fotografió todo» no puede borrar el «este no se pudo» que alguien se tomó el trabajo de
 * marcar — sería el atajo destruyendo el dato más caro de la pantalla.
 */
export function contestarElResto(s: Solicitud, ok: boolean, meta: { por: string; ts: number }): Solicitud {
  const fotos = { ...(s.fotos || {}) }
  for (const i of sinContestar(s)) fotos[i.vid] = { ok, por: meta.por, ts: meta.ts }
  return { ...s, fotos }
}
