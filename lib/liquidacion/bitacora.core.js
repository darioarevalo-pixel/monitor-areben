/**
 * La bitácora de Liquidación: la ida y la vuelta de cada precio de sale.
 *
 * En `.js` plano porque el evento lo escribe el servidor (`api/_liquidacion.js`) y los handlers de
 * `api/*.js` no pueden importar TypeScript (ver `lib/permisos.core.js`). `lib/liquidacion/bitacora.ts`
 * es el re-export tipado que usa la pantalla. El backfill (`.mjs`) también importa de acá, así que
 * la reconstrucción histórica y el registro vivo arman la fila con **el mismo código**.
 *
 * 🔑 **Sólo entra lo que se escribió en Gestión Nube, y sólo después de verificarlo.** El evento se
 * inserta en el mismo punto donde el handler ya compara lo que devolvió el PATCH contra lo que se
 * quiso escribir: un 200 que no movió el precio es el modo de falla clásico de esta integración, y
 * una bitácora que registre la intención en vez del hecho es peor que no tenerla — diría que el
 * cliente vio un precio que nunca estuvo puesto.
 *
 * Lo que NO entra: las decisiones. Quién definió un precio y quién lo revisó ya viven en el ítem,
 * con nombre y fecha. Acá va la góndola.
 */

/** Los dos únicos movimientos. `sacar` cubre tanto volver a lista como volver a la oferta previa. */
export const MODOS = ['poner', 'sacar'];

/**
 * Qué oferta tenía el producto **justo antes** de esta escritura.
 *
 * 🔑 **Sale de la propia bitácora, no de la foto congelada.** "Lo que había antes" es, por
 * definición, el `precioA` del último evento de ese producto; la foto sólo contesta la primera vez,
 * cuando todavía no hay ninguno. Deducirlo siempre de la foto mentiría al segundo ciclo: después de
 * un poner → sacar, `promoPrevia` sigue diciendo que hay una oferta de $X que ya no está puesta, y
 * el renglón de la vuelta se leería como si el precio hubiera bajado cuando en realidad subió.
 *
 * `null` significa **sin oferta** en los dos lados: es lo mismo que se le manda a Gestión Nube
 * (`tiendanube_promotional_price: null`) y lo que devuelve cuando el producto está a precio de lista.
 *
 * @param {{precioA: number|null}|null|undefined} ultimo  El evento anterior de ESE pid, si lo hay.
 * @param {number|null|undefined} promoPrevia             La oferta congelada al entrar a la campaña.
 * @returns {number|null}
 */
export function precioAnterior(ultimo, promoPrevia) {
  if (ultimo) return ultimo.precioA == null ? null : Number(ultimo.precioA);
  // Una promo de 0 o negativa no es una promo: es un dato roto, y anotarla como "antes tenía $0"
  // haría que el primer renglón de la campaña muestre un aumento del infinito por ciento.
  return promoPrevia > 0 ? Number(promoPrevia) : null;
}

/**
 * La fila que se guarda, armada desde el ítem y lo que se acaba de escribir.
 *
 * `liqNombre`, `producto` y `sku` se **copian** en vez de referenciarse: la campaña se puede borrar
 * y el ítem se puede quitar, y el evento tiene que poder leerse igual. Es un registro, no una vista.
 *
 * @param {object} a
 * @param {string} a.store
 * @param {string} a.liqId
 * @param {string} a.liqNombre
 * @param {object} a.item        El `LiquidacionItem` tal como está guardado (para foto y pid).
 * @param {'poner'|'sacar'} a.modo
 * @param {number|null} a.precioDe  Lo que había antes (de `precioAnterior`).
 * @param {number|null} a.precioA   Lo que quedó puesto. `null` = sin oferta.
 * @param {string|null} a.porQuien
 * @param {string} a.cuando      ISO. Lo pasa quien llama para que una tanda entera comparta el momento.
 */
export function filaBitacora({ store, liqId, liqNombre, item, modo, precioDe, precioA, porQuien, cuando }) {
  const foto = (item && item.foto) || {};
  return {
    store,
    liq_id: liqId,
    liq_nombre: liqNombre || '',
    pid: String(item.pid),
    producto: String(foto.nombre || ''),
    sku: foto.sku == null || foto.sku === '' ? null : String(foto.sku),
    modo,
    precio_de: precioDe == null ? null : Number(precioDe),
    precio_a: precioA == null ? null : Number(precioA),
    precio_lista: foto.precioNormal > 0 ? Number(foto.precioNormal) : null,
    por_quien: porQuien || null,
    cuando,
  };
}

const num = (v) => (v == null || v === '' ? null : Number(v));

/** La fila de la base, con los nombres que usa la pantalla. */
export function aEvento(f) {
  return {
    id: Number(f.id),
    liqId: String(f.liq_id),
    liqNombre: String(f.liq_nombre || ''),
    pid: String(f.pid),
    producto: String(f.producto || ''),
    sku: f.sku == null ? null : String(f.sku),
    modo: f.modo === 'sacar' ? 'sacar' : 'poner',
    precioDe: num(f.precio_de),
    precioA: num(f.precio_a),
    precioLista: num(f.precio_lista),
    porQuien: f.por_quien == null ? null : String(f.por_quien),
    cuando: typeof f.cuando === 'string' ? f.cuando : new Date(f.cuando).toISOString(),
  };
}
