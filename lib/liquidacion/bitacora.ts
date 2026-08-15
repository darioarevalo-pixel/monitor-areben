/**
 * La bitácora, del lado de la pantalla.
 *
 * La regla de plata y el armado de la fila viven en `bitacora.core.js` (`.js` plano, porque el
 * evento lo escribe `api/_liquidacion.js` y los handlers no pueden importar TypeScript). Acá va el
 * tipo y lo que sólo necesita quien la mira: agrupar en tandas y contar qué está puesto ahora.
 */

import { precioAnterior as precioAnteriorJs } from './bitacora.core.js'

/** `poner` = se le escribió una oferta. `sacar` = se le sacó (a lista o a la que tenía antes). */
export type ModoBitacora = 'poner' | 'sacar'

/**
 * Una escritura de precio **confirmada** en Gestión Nube.
 *
 * `precioDe` y `precioA` son ofertas, y `null` significa **sin oferta** en los dos: un `sacar` con
 * `precioA: null` dejó el producto a precio de lista. `precioLista` viaja copiado para poder leer el
 * descuento sin ir a buscar el producto — que además pudo haber cambiado de precio desde entonces.
 */
export interface EventoBitacora {
  id: number
  liqId: string
  liqNombre: string
  pid: string
  producto: string
  sku: string | null
  modo: ModoBitacora
  precioDe: number | null
  precioA: number | null
  precioLista: number | null
  porQuien: string | null
  /** ISO. */
  cuando: string
}

/** Re-export tipado: una sola implementación, la de `.core.js`. */
export function precioAnterior(ultimo: { precioA: number | null } | null, promoPrevia: number | null): number | null {
  return precioAnteriorJs(ultimo, promoPrevia)
}

/**
 * Cuánto silencio separa dos tandas.
 *
 * El aplicador escribe de a cinco por viaje con una pausa corta entre productos: los 260 de agosto
 * salieron en 5,6 minutos seguidos. Media hora es holgado para no partir una tanda por una demora de
 * Gestión Nube, y corto para que "volví a la tarde y apliqué cinco más" no se pegue a la de la
 * mañana.
 */
export const HUECO_TANDA_MS = 30 * 60_000

/**
 * Una tanda: lo que se escribió de una sentada.
 *
 * 🔑 **Existe porque la lista plana es ilegible a la escala real.** Aplicar el WINTER SALE fueron
 * 260 renglones idénticos salvo el nombre del producto, y sacarlo van a ser otros 260. Lo que se
 * quiere ver primero es "el 13 de agosto se pusieron 260 ofertas"; el detalle producto por producto
 * está abajo, para cuando se lo busca.
 */
export interface TandaBitacora {
  /** `<modoISO>` del primer evento: sirve de key y de ancla para abrir/cerrar. */
  id: string
  modo: ModoBitacora
  porQuien: string | null
  /** ISO del primero y del último de la tanda. */
  desde: string
  hasta: string
  eventos: EventoBitacora[]
}

/**
 * Agrupa en tandas: mismo movimiento, misma persona y sin un hueco largo en el medio.
 *
 * Espera los eventos **del más nuevo al más viejo** (que es como los devuelve el servidor) y
 * devuelve las tandas en ese mismo orden, con sus eventos también del más nuevo al más viejo.
 */
export function agruparEnTandas(eventos: EventoBitacora[], huecoMs: number = HUECO_TANDA_MS): TandaBitacora[] {
  const out: TandaBitacora[] = []
  for (const e of eventos) {
    const ult = out[out.length - 1]
    const t = Date.parse(e.cuando)
    const sigue =
      ult &&
      ult.modo === e.modo &&
      ult.porQuien === e.porQuien &&
      Date.parse(ult.desde) - t <= huecoMs
    if (sigue) {
      ult.eventos.push(e)
      ult.desde = e.cuando
    } else {
      out.push({ id: `${e.modo}-${e.cuando}`, modo: e.modo, porQuien: e.porQuien, desde: e.cuando, hasta: e.cuando, eventos: [e] })
    }
  }
  return out
}

/** Qué está puesto **ahora**, según la bitácora: el último movimiento de cada producto. */
export interface EstadoBitacora {
  /** Productos cuyo último evento dejó una oferta puesta. */
  puestos: number
  /** Productos cuyo último evento la sacó. */
  sacados: number
  /** ISO de la escritura más reciente, o `null` si no hay ninguna. */
  ultima: string | null
}

/**
 * 🔑 **Se lee el último evento de cada producto, no se cuentan los `poner`.** Un producto que entró
 * y salió aparecería dos veces, y la campaña diría que tiene el doble de ofertas puestas de las que
 * hay. Es la misma razón por la que `aplicado` quiere decir "su precio está puesto AHORA".
 */
export function estadoSegunBitacora(eventos: EventoBitacora[]): EstadoBitacora {
  const ultimoDe = new Map<string, EventoBitacora>()
  let ultima: string | null = null
  for (const e of eventos) {
    const previo = ultimoDe.get(e.pid)
    if (!previo || Date.parse(e.cuando) > Date.parse(previo.cuando)) ultimoDe.set(e.pid, e)
    if (!ultima || Date.parse(e.cuando) > Date.parse(ultima)) ultima = e.cuando
  }
  let puestos = 0
  let sacados = 0
  for (const e of ultimoDe.values()) {
    if (e.precioA == null) sacados += 1
    else puestos += 1
  }
  return { puestos, sacados, ultima }
}

/**
 * El descuento que dejó una escritura, contra el precio de lista congelado.
 *
 * `null` cuando no hay con qué compararlo o cuando la escritura sacó la oferta: ahí el producto
 * quedó a precio de lista y hablar de "0% de descuento" sería inventar un número.
 */
export function pctDeEvento(e: EventoBitacora): number | null {
  const lista = e.precioLista
  if (e.precioA == null || lista == null || !(lista > 0)) return null
  return Math.round((1 - e.precioA / lista) * 100)
}
