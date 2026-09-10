/**
 * Precios de campaña — la proyección de una campaña de Liquidación que ve MARKETING.
 *
 * En `.js` plano porque la arma `api/_precios.js`, y los handlers de `api/*.js` corren en Node sin
 * pasar por el compilador de Next: no pueden importar TypeScript. `lib/precios/core.ts` es el
 * re-export tipado que usa la pantalla. Misma forma que `lib/liquidacion/colgadas.core.js`.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * 🔴 POR QUÉ ESTO ES UNA LISTA BLANCA Y NO UN `select`
 *
 * La foto congelada de un ítem de liquidación trae **`costo`, `markup`, `margen` y las ventas de
 * 7/30/90 días**. Marketing ⛔ no ve la sección Liquidación justamente por eso: sus cinco pantallas
 * de Análisis entran por `keys` y `liquidacion` queda afuera a propósito (`lib/permisos.core.js`),
 * porque ahí adentro está el costo. La Feria de Septiembre de Zattia se vende **al costo**, así que
 * mandar el ítem tal cual es publicar el margen entero de la casa.
 *
 * ⇒ **Un campo se agrega ACÁ o no viaja.** Es el mismo criterio que `itemDelBody` en
 * `api/_liquidacion.js` (lista blanca de entrada) y que `paraElVotante` en
 * `lib/disenos/votacion.core.js` (lista blanca de salida hacia un portal abierto). Una lista negra
 * —"sacale el costo"— falla en silencio el día que alguien agrega un campo nuevo a la foto.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * 🔑 QUÉ ÍTEMS SE VEN, Y POR QUÉ EL ESTADO NO SE ESCONDE
 *
 * Entran `definido`, `confirmado` y `aplicado`. ⛔ Quedan afuera:
 *
 *  - **`pendiente`**: no tiene precio. Un renglón sin número en una lista de precios no es
 *    información, es una pregunta abierta.
 *  - **`descartado`**: se lo miró y se decidió que NO va. Comunicarlo es prometer algo que no está
 *    en la mesa. (En la Feria de Septiembre son 25 de 376.)
 *
 * 🔴 **Y `definido` ⛔ no es lo mismo que `confirmado`, así que la proyección lo dice** (`firme`).
 * Un `definido` es un precio que puso una persona y que **nadie miró todavía**: cambiarlo lo
 * devuelve a la cola, y eso puede pasar el día antes de que arranque la campaña. Una lista que los
 * muestre iguales le hace prometer a marketing un número que se puede mover. Al 10-sep-2026 la
 * feria tiene **286 confirmados y 65 sin revisar**: esconder la diferencia es esconder el 18%.
 */

/** Los estados de ítem que Marketing ve. Ver el encabezado: `pendiente` y `descartado` no entran. */
export const ESTADOS_VISIBLES = ['definido', 'confirmado', 'aplicado'];

/**
 * ¿El precio ya pasó por una segunda mirada?
 *
 * `aplicado` cuenta como firme porque para llegar ahí tuvo que estar `confirmado` antes
 * (`itemsAplicables` en `lib/liquidacion/core.ts` pide `confirmado`): un aplicado es un confirmado
 * que además ya está escrito en la tienda.
 */
export function esFirme(estado) {
  return estado === 'confirmado' || estado === 'aplicado';
}

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const txtOrNull = (v) => (v == null || v === '' ? null : String(v));

/**
 * El descuento que se muestra.
 *
 * Se usa **el guardado** (`decision.pctDesc`) y no uno recalculado, para que la fila diga el mismo
 * número que la pestaña Revisión: `decidirItem` lo guarda ya derivado del precio final —con el
 * redondeo adentro—, así que es coherente con los otros dos números de la fila. El cálculo es el
 * respaldo para un ítem viejo que no lo trae.
 *
 * ⛔ Sin precio de lista ⇒ `null`, ⛔ nunca 0: un "0% off" afirma que el precio no bajó, que es la
 * peor de las respuestas posibles en una lista de liquidación.
 */
export function descuentoDe(item) {
  const d = item.decision || {};
  if (d.pctDesc != null && Number.isFinite(Number(d.pctDesc))) return Number(d.pctDesc);
  const lista = num((item.foto || {}).precioNormal);
  const precio = d.precioSale == null ? null : num(d.precioSale);
  if (!lista || precio == null) return null;
  return Math.round(((lista - precio) / lista) * 1000) / 10;
}

/**
 * Un ítem de liquidación → el renglón que ve Marketing. **Lista blanca**: ver el encabezado.
 *
 * `stock` ⛔ no sale de acá: la foto congelada lo tiene del día en que el producto entró a la
 * campaña —los de la feria son del 6-sep— y una lista que manda a comunicar un producto necesita
 * las unidades de HOY. Lo pega el handler desde el espejo, con el sello de cuándo se sincronizó
 * (mismo criterio que `stock-campania` y que `api/_clavados.js`).
 */
export function paraMarketing(item) {
  const f = item.foto || {};
  const d = item.decision || {};
  return {
    pid: String(item.pid),
    nombre: String(f.nombre || ''),
    sku: txtOrNull(f.sku),
    imagen: txtOrNull(f.imagen),
    /** El precio de lista, el de la etiqueta antes de la campaña. */
    precioLista: num(f.precioNormal),
    /** El precio de la campaña. `null` no debería llegar acá (los `pendiente` no entran). */
    precio: d.precioSale == null ? null : num(d.precioSale),
    pctDesc: descuentoDe(item),
    /** `false` = todavía lo tiene que mirar otra persona. Ver el encabezado. */
    firme: esFirme(item.estado),
  };
}

/** La campaña entera, ya filtrada y proyectada. El orden lo decide la pantalla. */
export function listaParaMarketing(items) {
  return (items || [])
    .filter((i) => i && ESTADOS_VISIBLES.includes(i.estado))
    .map(paraMarketing);
}

/**
 * ¿Esta campaña la puede ver Marketing?
 *
 * 🔑 **Es un interruptor explícito, ⛔ no el estado de la campaña.** Se pensó primero derivarlo de
 * `en_curso | aplicada`, y está mal por los dos lados: una campaña **en borrador** puede tener los
 * precios listos y ser justo la que hay que comunicar (es el caso que abrió esto: la feria arranca
 * el lunes y los precios ⛔ no están puestos en la tienda), y una `en_curso` puede ser una prueba
 * que nadie quiere afuera. Quien arma la campaña dice cuál se comparte.
 *
 * ⛔ **Una `cerrada` no se comparte aunque tenga el flag**: es una campaña que terminó, y sus
 * precios ya no rigen. Dejarla visible es la misma clase de mentira que la oferta colgada.
 */
export function compartidaConMarketing(campania) {
  const d = (campania && campania.datos) || {};
  return !!d.compartida && campania.estado !== 'cerrada';
}
