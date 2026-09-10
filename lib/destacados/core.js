/**
 * Productos estrella — las reglas, en JS plano porque las usa `api/_destacados.js`.
 *
 * `lib/destacados/tipos.ts` es la cara tipada. Misma forma que `lib/clavados/core.js`.
 *
 * 🔑 **El alcance es el dato.** Todo acá gira alrededor de una sola distinción: una estrella cuelga
 * de una campaña (`liq_id`) o del producto a secas (`liq_id = null`). El porqué está escrito en
 * `sql/migrate-destacados.sql`.
 */

/** El alcance "producto en general". Es `null` en la base; acá se nombra para no repetir el null. */
export const GENERAL = null;

/**
 * Normaliza el alcance que llega del cliente o del querystring.
 *
 * ⛔ La cadena vacía y `'general'` caen en `null` a propósito: un `?liq=` vacío en la URL tiene que
 * significar "la general", ⛔ no "una campaña que se llama vacío" — que sería una tercera estrella
 * invisible que nadie puede sacar.
 */
export function ambitoDe(raw) {
  const t = raw == null ? '' : String(raw).trim();
  if (!t || t === 'general') return GENERAL;
  return t;
}

/**
 * El id de la fila.
 *
 * Lleva la fecha adentro por el mismo motivo que `clavados`: sacar una estrella y volver a ponerla
 * es una decisión NUEVA, con su firma y su fecha, y un id que fuera sólo `store:pid:ambito` haría
 * que la segunda pisara el historial de la primera.
 */
export function idDestacado(store, pid, liqId, iso) {
  return `${store}:${pid}:${liqId || 'gral'}:${String(iso).slice(0, 10)}`;
}

/**
 * Las filas activas → un índice por pid, para que la pantalla no busque en un array por cada fila.
 *
 * ⚠️ Sólo entran las **activas** (`sacada_en` nulo). Una sacada en el índice dibujaría la estrella
 * prendida de algo que alguien apagó.
 */
export function indicePorPid(filas) {
  const m = {};
  for (const f of filas || []) {
    if (!f || f.sacada_en) continue;
    m[String(f.producto_id)] = f;
  }
  return m;
}
