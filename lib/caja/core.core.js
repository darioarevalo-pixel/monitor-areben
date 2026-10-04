/**
 * Caja — el núcleo del cobro en el local. JS plano y sin red: lo usan el handler
 * (`api/datos.js?recurso=caja`) y la pantalla, y las dos puntas tienen que dar el MISMO número.
 *
 * # Qué hace el POS de GN y qué copiamos (medido el 3-oct-2026 sobre ventas reales de Mi Local)
 *
 * - El descuento por cuenta (efectivo −15 %, transferencia −10 %…) ⛔ viene en la API de GN: es una
 *   regla del POS. Por eso el % sale de `reglas`, que es obligatorio — ⛔ un default escondido.
 * - El total se redondea a 100 al más cercano: puede SUBIR (#30031: $47.591,50 ⇒ $47.600).
 * - 🔑 El POS de GN guarda descuento + redondeo **a nivel venta** (`discount`, que queda NEGATIVO
 *   cuando el redondeo sube) y deja los renglones con descuento 0. `items[].discount` es un
 *   **PORCENTAJE** (#30031: 15 ⇒ $55.990 → $47.591,50): ahí van las rebajas por prenda.
 * - El pago se registra por lo que se COBRA, ⛔ por lo que entregó la clienta: lo que se manda de
 *   más GN lo guarda como saldo a favor. El vuelto es nuestro y ⛔ viaja a GN.
 */

/** Los ids de GN del modo «Local» de Zattia (`GET /ventas/referencias` → `modos_venta`, 3-oct). */
export const MODO_LOCAL_ZATTIA = Object.freeze({
  client_id: 137131, // Consumidor Final
  channel_id: 3,
  sale_type_id: 1,
  sale_state_id: 6,
  currency_id: 1,
  store_id: 11780,
  price_list_id: 4163, // «Local + TN»
});

/**
 * La configuración inicial: lo que muestra hoy el POS de GN. Es el valor con que se SIEMBRA la
 * configuración, ⛔ la que se usa: las funciones reciben `reglas` siempre por parámetro.
 *
 * `descuento` en %; NEGATIVO es recargo (Feria TC). Las cuentas que no están acá ⛔ se cobran:
 * una cuenta sin regla es un error, ⛔ un 0 callado.
 */
export const REGLAS_INICIALES = Object.freeze({
  redondeo: 100,
  cuentas: Object.freeze({
    12921: Object.freeze({ nombre: 'Efectivo', descuento: 15, efectivo: true }),
    13015: Object.freeze({ nombre: 'Transferencia', descuento: 10 }),
    20595: Object.freeze({ nombre: 'Transferencia CG', descuento: 10 }),
    20196: Object.freeze({ nombre: 'Débito', descuento: 10 }),
    25172: Object.freeze({ nombre: 'Crédito 10% OFF', descuento: 10 }),
    25867: Object.freeze({ nombre: 'Feria - Efectivo', descuento: 0, efectivo: true }),
    25868: Object.freeze({ nombre: 'Feria - Transferencia', descuento: 0 }),
    25869: Object.freeze({ nombre: 'Feria TC', descuento: -10 }),
  }),
});

/**
 * @typedef {{ product_id: number, size_id: number, cantidad: number, precio: number, descuento?: number }} ItemCaja
 * @typedef {{ product_id: number, size_id: number, cantidad: number, precio: number, descuento: number, importe: number }} Fila
 * @typedef {{ nombre: string, descuento: number, efectivo?: boolean }} ReglaCuenta
 * @typedef {{ redondeo: number, cuentas: Record<number, ReglaCuenta> }} Reglas
 * @typedef {{ cuenta: number, base?: number }} PagoPedido
 * @typedef {{ cuenta: number, base: number, porcentaje: number, descuento: number, redondeo: number, monto: number }} Pago
 * @typedef {{ client_id: number, channel_id: number, sale_type_id: number, sale_state_id: number, currency_id: number, store_id: number, price_list_id: number }} ModoLocal
 */

/** @param {number} n */
const centavos = n => Math.round(n * 100) / 100;

/** @param {unknown} cond @param {string} msg @returns {asserts cond} */
function exigir(cond, msg) {
  if (!cond) throw new Error(msg);
}

/**
 * Normaliza los renglones del ticket. `descuento` es el % de rebaja de ESA prenda (0 si no hay).
 * Devuelve cada renglón con su `importe` = cantidad × precio × (1 − descuento/100).
 * @param {ItemCaja[]} items
 * @returns {Fila[]}
 */
export function renglones(items) {
  exigir(Array.isArray(items) && items.length > 0, 'La venta no tiene renglones');
  return items.map((it, i) => {
    const r = {
      product_id: Number(it.product_id),
      size_id: Number(it.size_id),
      cantidad: Number(it.cantidad),
      precio: Number(it.precio),
      descuento: it.descuento == null ? 0 : Number(it.descuento),
    };
    exigir(Number.isInteger(r.product_id) && r.product_id > 0, `Renglón ${i + 1}: falta el producto`);
    exigir(Number.isInteger(r.size_id) && r.size_id > 0, `Renglón ${i + 1}: falta el talle`);
    exigir(Number.isInteger(r.cantidad) && r.cantidad > 0, `Renglón ${i + 1}: cantidad inválida`);
    exigir(Number.isFinite(r.precio) && r.precio >= 0, `Renglón ${i + 1}: precio inválido`);
    exigir(Number.isFinite(r.descuento) && r.descuento >= 0 && r.descuento <= 100, `Renglón ${i + 1}: descuento inválido`);
    return { ...r, importe: centavos(r.cantidad * r.precio * (1 - r.descuento / 100)) };
  });
}

/** La suma de los renglones (ya con su rebaja por prenda), antes de la cuenta y del redondeo. @param {Fila[]} filas @returns {number} */
export function subtotal(filas) {
  return centavos(filas.reduce((s, r) => s + r.importe, 0));
}

/** La regla de una cuenta. Sin `reglas`, o con una cuenta que no está, es un error. @param {number} cuenta @param {Reglas} reglas @returns {ReglaCuenta} */
export function reglaDeCuenta(cuenta, reglas) {
  exigir(reglas && reglas.cuentas, 'Faltan las reglas de la caja');
  const regla = reglas.cuentas[cuenta];
  exigir(regla && Number.isFinite(regla.descuento), `La cuenta ${cuenta} no tiene regla de cobro`);
  return regla;
}

/**
 * El descuento (o recargo) de la cuenta sobre `total`. `ajuste` es lo que se descuenta: positivo
 * es descuento, negativo recargo. ⛔ Redondea: eso es `redondeo`.
 * @param {number} total @param {number} cuenta @param {Reglas} reglas
 * @returns {{ porcentaje: number, ajuste: number, neto: number }}
 */
export function aplicarCuenta(total, cuenta, reglas) {
  const { descuento } = reglaDeCuenta(cuenta, reglas);
  exigir(Number.isFinite(total) && total >= 0, 'Total inválido');
  const ajuste = centavos(total * descuento / 100);
  return { porcentaje: descuento, ajuste, neto: centavos(total - ajuste) };
}

/** Redondea al múltiplo de `paso` más cercano (GN usa 100). `paso` es obligatorio. @param {number} monto @param {number} paso */
export function redondeo(monto, paso) {
  exigir(Number.isFinite(paso) && paso > 0, 'Falta el paso de redondeo');
  const total = Math.round(monto / paso) * paso;
  return { total, ajuste: centavos(total - monto) };
}

/**
 * El cobro completo, con uno o varios pagos.
 *
 * `pagos`: `[{ cuenta, base? }]`. `base` es la parte del subtotal (a precio de lista) que se paga
 * con esa cuenta; el ÚLTIMO pago va sin `base` y se lleva el resto. Cada pago se descuenta y se
 * redondea por separado: con un solo pago es exactamente lo que hace el POS de GN.
 * ⚠️ Con varios pagos, cómo redondea GN ⛔ está medido: se eligió redondear cada uno porque así
 * cada pago es un monto «cobrable» (el efectivo, sobre todo).
 *
 * Devuelve los pagos con su `monto` y los totales de la venta: `descuentoVenta` es lo que va a GN
 * a nivel venta (descuento por cuenta + redondeo; negativo si el redondeo o un recargo suben).
 * @param {{ filas: Fila[], pagos: PagoPedido[], reglas: Reglas }} args
 * @returns {{ subtotal: number, pagos: Pago[], total: number, descuentoVenta: number }}
 */
export function cobro({ filas, pagos, reglas }) {
  exigir(reglas && Number.isFinite(reglas.redondeo), 'Faltan las reglas de la caja');
  exigir(Array.isArray(pagos) && pagos.length > 0, 'La venta no tiene pagos');
  const sub = subtotal(filas);
  let resto = sub;
  const detalle = pagos.map((p, i) => {
    const ultimo = i === pagos.length - 1;
    exigir(ultimo ? p.base == null : Number.isFinite(p.base) && p.base > 0,
      ultimo ? 'El último pago se lleva el resto: va sin base' : `Pago ${i + 1}: falta la base`);
    const base = ultimo ? resto : centavos(p.base);
    exigir(base > 0, 'Los pagos cubren más que el subtotal');
    resto = centavos(resto - base);
    const cuenta = aplicarCuenta(base, p.cuenta, reglas);
    const r = redondeo(cuenta.neto, reglas.redondeo);
    exigir(r.total > 0, `Pago ${i + 1}: queda en $0`);
    return { cuenta: p.cuenta, base, porcentaje: cuenta.porcentaje, descuento: cuenta.ajuste, redondeo: r.ajuste, monto: r.total };
  });
  const total = detalle.reduce((s, p) => s + p.monto, 0);
  return { subtotal: sub, pagos: detalle, total, descuentoVenta: centavos(sub - total) };
}

/** El vuelto del efectivo: `{ vuelto, falta }` — uno de los dos es 0. @param {number} pagaCon @param {number} total */
export function vuelto(pagaCon, total) {
  exigir(Number.isFinite(pagaCon) && pagaCon >= 0, 'Monto entregado inválido');
  const d = centavos(pagaCon - total);
  return { vuelto: Math.max(0, d), falta: Math.max(0, -d) };
}

/**
 * El cuerpo de `POST /ventas` de GN. `pagos` es el `pagos` que devuelve `cobro`; `fecha` es
 * `AAAA-MM-DD` (se pasa: el núcleo ⛔ lee el reloj). `integrationId` deduplica el reintento.
 *
 * El descuento de la cuenta y el redondeo van A NIVEL VENTA (`discount_amount`), como los deja el
 * POS de GN; los renglones llevan su `discount` en % sólo si hay rebaja por prenda.
 * @param {{ filas: Fila[], pagos: Pago[], modoLocal: ModoLocal, integrationId: string, fecha: string }} args
 */
export function armarVentaGN({ filas, pagos, modoLocal, integrationId, fecha }) {
  exigir(modoLocal && modoLocal.store_id && modoLocal.channel_id && modoLocal.client_id, 'Falta el modo Local');
  exigir(typeof integrationId === 'string' && integrationId.length > 0, 'Falta el integration_id');
  exigir(typeof fecha === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(fecha), 'Fecha inválida');
  exigir(Array.isArray(pagos) && pagos.length > 0, 'La venta no tiene pagos');
  pagos.forEach((p, i) => exigir(Number.isFinite(p.monto) && p.monto > 0 && Number(p.cuenta) > 0, `Pago ${i + 1} inválido`));
  const total = pagos.reduce((s, p) => s + p.monto, 0);
  return {
    client_id: modoLocal.client_id,
    channel_id: modoLocal.channel_id,
    sale_type_id: modoLocal.sale_type_id,
    sale_state_id: modoLocal.sale_state_id,
    currency_id: modoLocal.currency_id,
    price_list_id: modoLocal.price_list_id,
    store_id: modoLocal.store_id,
    date_sale: fecha,
    discount_inventory: true,
    integration_source: 'monitor-caja',
    integration_id: integrationId,
    items: filas.map(r => ({
      product_id: r.product_id,
      size_id: r.size_id,
      quantity: r.cantidad,
      unit_price: r.precio,
      discount: r.descuento,
      store_id: modoLocal.store_id,
    })),
    discount_amount: centavos(subtotal(filas) - total),
    payments: pagos.map(p => ({ amount: p.monto, account_id: Number(p.cuenta), date_payment: fecha, description: '' })),
  };
}
