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
 * Lleva el INSTANTE adentro porque sacar una estrella y volver a ponerla es una decisión NUEVA, con
 * su firma y su fecha: un id que fuera sólo `store:pid:ambito` haría que la segunda pisara el
 * historial de la primera.
 *
 * 🔴 **Y lleva la hora, ⛔ NO sólo la fecha — esto se escribió con el día y estaba MAL.** Con
 * `slice(0, 10)` el id de las dos decisiones del mismo día es el mismo, así que
 * **marcar → sacar → volver a marcar** choca contra la clave primaria. Copiado de `clavados`, donde
 * casi no muerde porque marcar un clavado es una decisión de dirección que se toma una vez; acá la
 * ⭐ es un interruptor que se prende y se apaga mirando la lista, o sea **el camino normal**.
 * ⚠️ Se cazó ejerciéndolo contra la base el 11-sep-2026: los tests y las sondas de la migración
 * estaban las dos en verde, porque ninguna de las dos vuelve a marcar **en el mismo día**.
 *
 * 🔑 **Lo que garantiza «una sola activa» ⛔ NO es esta clave: es el único PARCIAL** de
 * `sql/migrate-destacados.sql`. Ésta sólo tiene que no repetirse.
 */
export function idDestacado(store, pid, liqId, iso) {
  const sello = String(iso).replace(/[-:.]/g, '');
  return `${store}:${pid}:${liqId || 'gral'}:${sello}`;
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
