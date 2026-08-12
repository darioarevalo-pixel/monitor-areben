/**
 * El límite de solicitudes de Gestión Nube, para los `gnFetch` de los scripts de sync.
 *
 * GN corta el paginado con «Demasiadas solicitudes. Intenta nuevamente en un minuto.»
 * y **no** es un 5xx, así que los `gnFetch` —que sólo reintentaban `status >= 500`— lo
 * lanzaban y abortaban el sync entero. Lo que se veía (11/12-ago-2026): el inventario
 * de Zattia y el de BDI dejaron de actualizarse, y un producto recién cargado en GN no
 * aparecía en Etiquetas porque su fila de `inventario` nunca llegaba. Los productos sí,
 * porque esa tabla se baja antes y ya estaba guardada cuando el script moría.
 *
 * Cuánto se espera: lo que diga `Retry-After` si GN lo manda; si no, un minuto —lo que
 * pide el mensaje— y de ahí para arriba, porque el corte no siempre es por minuto: el
 * diario del 11-ago hizo 29 páginas seguidas antes de chocar y el rápido del 12 chocó a
 * la séptima, así que hay una ventana más larga que no conocemos. El backoff creciente
 * cubre las dos sin tener que adivinar cuál es.
 */

const PATRON = /demasiadas solicitudes|too many requests|rate.?limit|l[íi]mite de solicitudes/i

/** ¿La respuesta es un corte por límite de solicitudes? Por status o por el texto de GN. */
export function esRateLimit(res, data) {
  if (res && res.status === 429) return true
  const msg = data && (data.message || data.error)
  return typeof msg === 'string' && PATRON.test(msg)
}

/**
 * Cuánto esperar antes de reintentar, en ms. `intento` arranca en 1: 1 min, 2 min, 3 min…
 * con tope de 5, que es lo máximo razonable antes de dar el sync por perdido.
 */
export function esperaRateLimit(res, intento = 1) {
  const h = res && res.headers && typeof res.headers.get === 'function' ? res.headers.get('retry-after') : null
  const segs = h ? parseInt(h, 10) : NaN
  if (Number.isFinite(segs) && segs > 0) return Math.min(segs, 300) * 1000
  return Math.min(60 * intento, 300) * 1000
}

/** Cuántas veces se aguanta el corte en una misma request antes de abandonar. */
export const MAX_RATE_LIMIT = 5
