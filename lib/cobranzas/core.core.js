/**
 * Cobranzas — las reglas, en JS plano porque las usa `api/_cobranzas.js`.
 *
 * `lib/cobranzas/tipos.ts` es la cara tipada.
 *
 * # Qué problema resuelve
 *
 * Pago Nube cobra y marca la orden pagada solo. Las órdenes con medio de pago MANUAL (transferencia
 * directa a la cuenta de la empresa, efectivo al retirar) quedan en `pending` hasta que alguien
 * confirma que la plata entró. Esta sección es ese registro.
 *
 * 🔴 **TiendaNube ⛔ deja marcar una orden pagada por API** (sólo una app de medio de pago puede).
 * Por eso hay DOS verdades y el estado sale de cruzarlas: lo que dice TN (`estado_pago`) y lo que
 * dice el Monitor (el cobro registrado). El «pagado» de TN lo aprieta una persona en el admin.
 */

/**
 * ¿La orden es de pago MANUAL?
 *
 * 🔑 Medido el 23-sep-2026 sobre 236 órdenes de Zattia (ago–sep): las manuales llegan TODAS como
 * `gateway: 'offline'` (con `method: 'custom'`). Pago Nube es `pago-nube`, Mercado Pago
 * `mercado-pago`, y una transferencia de Pago Nube (`wire_transfer`) ⛔ es manual: se concilia sola.
 * Por eso la regla mira el GATEWAY y ⛔ no el método — «transferencia» existe en los dos lados.
 */
export function esPagoManual(orden) {
  return !!orden && orden.pago_gateway === 'offline';
}

/** Los estados de una orden en Cobranzas. El orden es el de las pestañas. */
export const ESTADOS = ['pendiente', 'falta-tn', 'revisar', 'cerrado'];

const ANULADAS_TN = new Set(['voided', 'refunded']);

/**
 * El estado de una orden, cruzando TN con el cobro del Monitor.
 *
 * `cobro` es el cobro VIGENTE (no anulado) o `null`. Devuelve `null` si la orden ⛔ va en
 * Cobranzas: no es manual, o se canceló sin que nadie la cobrara.
 *
 * 🔴 Una orden cancelada CON cobro es `revisar`, ⛔ no se esconde: es plata que entró por una
 * compra que ya no existe, y alguien tiene que devolverla o reabrir la orden.
 * 🔑 Una orden pagada en TN sin cobro en el Monitor es `cerrado` igual (alguien la marcó directo en
 * el admin): la pantalla la distingue con `sinCobro`, pero ⛔ la manda a pendientes — ya está paga.
 */
export function estadoDeCobro(orden, cobro) {
  if (!esPagoManual(orden)) return null;
  const pago = orden.estado_pago;
  const cancelada = orden.estado_orden === 'cancelled' || ANULADAS_TN.has(pago);
  if (cancelada) return cobro ? 'revisar' : null;
  if (pago === 'paid') return 'cerrado';
  // pending (o cualquier otro estado de TN que no sea pagado ni anulado)
  return cobro ? 'falta-tn' : 'pendiente';
}

/**
 * Las filas de la pantalla: cada orden manual con su estado y su cobro, más la cuenta por pestaña.
 *
 * `cobros` puede traer anulados: acá se descartan. Si una orden tuviera dos cobros vigentes (el
 * índice único de la base lo impide), gana el más nuevo.
 */
export function filasDeCobranzas(ordenes, cobros) {
  const vigente = new Map();
  for (const c of cobros || []) {
    if (!c || c.anulado_en) continue;
    const k = String(c.order_id);
    const prev = vigente.get(k);
    if (!prev || String(c.cuando) > String(prev.cuando)) vigente.set(k, c);
  }
  const filas = [];
  const cuenta = Object.fromEntries(ESTADOS.map((e) => [e, 0]));
  for (const o of ordenes || []) {
    const cobro = vigente.get(String(o.id)) || null;
    const estado = estadoDeCobro(o, cobro);
    if (!estado) continue;
    cuenta[estado]++;
    filas.push({ orden: o, cobro, estado, sinCobro: estado === 'cerrado' && !cobro });
  }
  // Lo más viejo primero: la orden que hace más días espera es la que se está enfriando.
  filas.sort((a, b) => String(a.orden.fecha || '').localeCompare(String(b.orden.fecha || '')));
  return { filas, cuenta };
}

export const MEDIOS = ['transferencia', 'efectivo'];

/**
 * Valida lo que manda la pantalla al cobrar. Devuelve el texto del error o `null`.
 *
 * ⛔ El monto ⛔ puede ser cero ni negativo: un cobro de $0 cerraría la orden sin plata.
 */
export function validarCobro(c) {
  if (!c || !/^\d+$/.test(String(c.order_id || ''))) return 'Falta la orden.';
  if (!MEDIOS.includes(c.medio)) return 'Elegí cómo pagó: transferencia o efectivo.';
  const monto = Number(c.monto);
  if (!Number.isFinite(monto) || monto <= 0) return 'El monto tiene que ser mayor a cero.';
  if (c.operacion != null && String(c.operacion).length > 80) return 'El número de operación es demasiado largo.';
  return null;
}

/**
 * `dd/mm` en hora de Argentina. El servidor corre en UTC: a las 21:00 ya sería mañana.
 * ⚠️ Sale de `en-CA` (siempre `YYYY-MM-DD`) y se da vuelta a mano: `es-AR` con `2-digit` devuelve
 * el mes SIN cero adelante en el ICU de Node («21/9»), y la línea tiene que salir igual en todos lados.
 */
function diaAR(iso) {
  const [, m, d] = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date(iso)).split('-');
  return `${d}/${m}`;
}

/** `19.900`: miles con punto, sin depender del locale del servidor. */
function miles(n) {
  return String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/**
 * La línea que queda en la nota interna de la orden en TN.
 *
 * 🔑 Lleva el id del cobro: es lo que hace que un reintento ⛔ la escriba dos veces (el catálogo
 * mira si la línea ya está) y lo que permite ir de la orden al registro.
 */
export function lineaDeNota(cobro, { anulado = false } = {}) {
  if (anulado) {
    return `[Monitor] Cobro ${cobro.id} ANULADO ${diaAR(cobro.anulado_en)} por ${cobro.anulado_por || '?'}`;
  }
  const op = cobro.operacion ? ` · op ${cobro.operacion}` : '';
  return `[Monitor] Cobrado ${diaAR(cobro.cuando)} por ${cobro.quien || '?'} · ${cobro.medio} $${miles(cobro.monto)}${op} · ${cobro.id}`;
}

/** Días enteros desde la compra, para ordenar y avisar. */
export function diasDesde(iso, ahora = new Date()) {
  const t = Date.parse(iso || '');
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((ahora.getTime() - t) / 86400000));
}
