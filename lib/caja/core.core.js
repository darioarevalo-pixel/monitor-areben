/**
 * Caja — el núcleo del cobro en el local. JS plano y sin red: lo usan el handler
 * (`api/datos.js?recurso=caja`) y la pantalla, y las dos puntas tienen que dar el MISMO número.
 *
 * # Qué hace el POS de GN y qué copiamos (medido el 3-oct-2026 sobre ventas reales de Mi Local)
 *
 * - El descuento por cuenta (efectivo −15 %, transferencia −10 %…) ⛔ viene en la API de GN: es una
 *   regla del POS. Por eso el % sale de `reglas`, que es obligatorio — ⛔ un default escondido.
 * - El total se redondea a 100 al más cercano: puede SUBIR (#30031: $47.591,50 ⇒ $47.600).
 * - El POS de GN guarda descuento + redondeo a nivel venta y lee `items[].discount` como %. 🔴 La
 *   API ⛔ lo escribe igual (medido con dos ventas reales, #30046 y #30047): en el `POST /ventas`
 *   `items[].discount` son **PESOS** (a 2 decimales), y `discount_amount` e `items[].discount` tienen
 *   que ser **≥ 0** ⇒ ⛔ hay descuento negativo, ⛔ hay recargo (Feria TC queda afuera).
 *   ⇒ `armarVentaGN` reparte TODO (rebaja + cuenta + redondeo) en pesos entre los renglones.
 * - Como el descuento ⛔ puede ser negativo, cuando el redondeo deja el total por ENCIMA del precio
 *   de lista (un accesorio de $4.990 con una cuenta al 0 % ⇒ $5.000) la diferencia va SUMADA al
 *   `unit_price` y el renglón sin descuento (ver `armarVentaGN`). El redondeo ⛔ se recorta: existe
 *   porque si todo termina en 90 ⛔ alcanzan los billetes de $10 (Bruno, 4-oct).
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
  // ⛔ price_list_id: el POST lo IGNORA (#30046 quedó «Lista de Precios: Seleccione») ⇒ el precio lo
  // pone la caja en `unit_price`.
});

/**
 * Qué cuenta de GN va detrás de cada forma de pago (Bruno, 4-oct-2026). 🔑 **La cajera ve sólo cuatro
 * formas de pago; la cuenta es INTERNA**: ⛔ se le muestra a ella ni al cliente.
 * - `transferencia.opciones`: a cuál van las transferencias lo baja un admin (`transferenciaA`):
 *   13015 = Areben Comercial (espera el pago en MP, F5) · 20595 = Caja Gerencia (cuenta de un
 *   particular: ⛔ cae en el MP de la empresa ⇒ se confirma a mano). ⛔ Lo decide la cajera.
 * - `feria`: las cuentas de feria son las de PRECIO FINAL (sin descuento extra), con `feria: true`.
 *   Débito y crédito en feria siguen su regla normal (a confirmar con Bruno).
 * - `credito.promo`: −10 % los días de beneficio bancario, si la tarjeta es de ESE banco.
 *   `credito.seisCuotas`: sólo en compras de MÁS de `minSeisCuotas`, si el cliente lo pide.
 *   Si no, `credito.normal` (precio de lista, con o sin cuotas).
 */
export const MEDIOS_INICIALES = Object.freeze({
  efectivo: Object.freeze({ normal: 12921, feria: 25867 }),
  transferencia: Object.freeze({ opciones: Object.freeze([13015, 20595]), feria: 25868 }),
  debito: Object.freeze({ normal: 20196 }),
  credito: Object.freeze({ normal: 25188, promo: 25172, seisCuotas: 25173, minSeisCuotas: 250000 }),
});

/** Lo que dice el ticket, la pantalla y el mail: el medio, ⛔ el nombre de la cuenta. */
export const NOMBRE_MEDIO = Object.freeze({
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  debito: 'Tarjeta de débito',
  credito: 'Tarjeta de crédito',
});

/**
 * La configuración inicial: lo que muestra hoy el POS de GN. Es el valor con que se SIEMBRA la
 * configuración, ⛔ la que se usa: las funciones reciben `reglas` siempre por parámetro.
 *
 * `descuento` en %, de 0 a 100. Las cuentas que no están acá ⛔ se cobran: una cuenta sin regla es
 * un error, ⛔ un 0 callado. Feria TC (25869, +10 % de recargo en GN) ⛔ está: GN ⛔ acepta un
 * descuento negativo por la API, y el recargo quedó fuera del v1 (Bruno, 3-oct).
 */
export const REGLAS_INICIALES = Object.freeze({
  redondeo: 100,
  cuentas: Object.freeze({
    12921: Object.freeze({ nombre: 'Efectivo', descuento: 15, efectivo: true }),
    13015: Object.freeze({ nombre: 'Transferencia', descuento: 10, esperaPago: true }),
    20595: Object.freeze({ nombre: 'Transferencia CG', descuento: 10 }),
    20196: Object.freeze({ nombre: 'Débito', descuento: 10 }),
    25172: Object.freeze({ nombre: 'Crédito 10% OFF', descuento: 10 }),
    25867: Object.freeze({ nombre: 'Feria - Efectivo', descuento: 0, efectivo: true }),
    25868: Object.freeze({ nombre: 'Feria - Transferencia', descuento: 0 }),
    25188: Object.freeze({ nombre: 'Credito - Nro 1 o 13', descuento: 0 }),
    25173: Object.freeze({ nombre: '6 cuotas sin interés', descuento: 0 }),
  }),
  medios: MEDIOS_INICIALES,
  transferenciaA: 13015,
  feria: false,
});

/**
 * @typedef {{ tipo: 'pct' | 'pesos', valor: number }} Rebaja
 * @typedef {{ product_id: number, size_id: number, cantidad: number, precio: number, descuento?: number, rebaja?: Rebaja | null }} ItemCaja
 * @typedef {{ product_id: number, size_id: number, cantidad: number, precio: number, descuento: number, rebaja: number, importe: number }} Fila
 * @typedef {{ nombre: string, descuento: number, efectivo?: boolean, esperaPago?: boolean }} ReglaCuenta
 * @typedef {'efectivo' | 'transferencia' | 'debito' | 'credito'} Medio
 * @typedef {{ efectivo: { normal: number, feria: number }, transferencia: { opciones: readonly number[], feria: number }, debito: { normal: number }, credito: { normal: number, promo: number, seisCuotas: number, minSeisCuotas: number } }} Medios
 * @typedef {{ redondeo: number, cuentas: Record<number, ReglaCuenta>, medios?: Medios, transferenciaA?: number, feria?: boolean, feriaProductos?: Array<{ id: number, nombre: string }> }} Reglas
 * @typedef {{ cuenta: number, base?: number }} PagoPedido
 * @typedef {{ cuenta: number, base: number, rebaja: number, porcentaje: number, descuento: number, redondeo: number, monto: number }} Pago
 * @typedef {{ client_id: number, channel_id: number, sale_type_id: number, sale_state_id: number, currency_id: number, store_id: number }} ModoLocal
 */

/** @param {number} n */
const centavos = n => Math.round(n * 100) / 100;

/** @param {unknown} cond @param {string} msg @returns {asserts cond} */
function exigir(cond, msg) {
  if (!cond) throw new Error(msg);
}

/**
 * Normaliza los renglones del ticket. La rebaja de ESA prenda (la pone la cajera, Bruno 4-oct) viene
 * como `rebaja: { tipo: 'pct' | 'pesos', valor }` sobre el renglón entero; `descuento` (%) es la
 * forma vieja y sigue valiendo. Devuelve cada renglón con `descuento` (%), `rebaja` (los pesos que
 * le saca la rebaja en pesos) y su `importe` = cantidad × precio × (1 − descuento/100) − rebaja.
 * @param {ItemCaja[]} items
 * @returns {Fila[]}
 */
export function renglones(items) {
  exigir(Array.isArray(items) && items.length > 0, 'La venta no tiene renglones');
  return items.map((it, i) => {
    const rb = it.rebaja == null ? null : it.rebaja;
    exigir(rb == null || ((rb.tipo === 'pct' || rb.tipo === 'pesos') && Number.isFinite(Number(rb.valor)) && Number(rb.valor) >= 0),
      `Renglón ${i + 1}: descuento inválido`);
    exigir(!(rb && it.descuento), `Renglón ${i + 1}: dos descuentos en la misma prenda`);
    const r = {
      product_id: Number(it.product_id),
      size_id: Number(it.size_id),
      cantidad: Number(it.cantidad),
      precio: Number(it.precio),
      descuento: rb && rb.tipo === 'pct' ? Number(rb.valor) : it.descuento == null ? 0 : Number(it.descuento),
      rebaja: rb && rb.tipo === 'pesos' ? centavos(Number(rb.valor)) : 0,
    };
    exigir(Number.isInteger(r.product_id) && r.product_id > 0, `Renglón ${i + 1}: falta el producto`);
    exigir(Number.isInteger(r.size_id) && r.size_id > 0, `Renglón ${i + 1}: falta el talle`);
    exigir(Number.isInteger(r.cantidad) && r.cantidad > 0, `Renglón ${i + 1}: cantidad inválida`);
    exigir(Number.isFinite(r.precio) && r.precio >= 0, `Renglón ${i + 1}: precio inválido`);
    exigir(Number.isFinite(r.descuento) && r.descuento >= 0 && r.descuento <= 100, `Renglón ${i + 1}: descuento inválido`);
    const bruto = centavos(r.cantidad * r.precio * (1 - r.descuento / 100));
    exigir(r.rebaja <= bruto, `Renglón ${i + 1}: el descuento pasa el precio`);
    return { ...r, importe: centavos(bruto - r.rebaja) };
  });
}

/** La suma de los renglones (ya con su rebaja por prenda), antes de la cuenta y del redondeo. @param {Fila[]} filas @returns {number} */
export function subtotal(filas) {
  return centavos(filas.reduce((s, r) => s + r.importe, 0));
}

/**
 * La regla de una cuenta. Sin `reglas`, con una cuenta que no está, o con un RECARGO (descuento
 * negativo: GN ⛔ lo acepta por la API), es un error.
 * @param {number} cuenta @param {Reglas} reglas @returns {ReglaCuenta}
 */
export function reglaDeCuenta(cuenta, reglas) {
  exigir(reglas && reglas.cuentas, 'Faltan las reglas de la caja');
  const regla = reglas.cuentas[cuenta];
  exigir(regla && Number.isFinite(regla.descuento), `La cuenta ${cuenta} no tiene regla de cobro`);
  exigir(regla.descuento >= 0, `La cuenta ${regla.nombre || cuenta} tiene recargo: la caja no cobra con recargo`);
  exigir(regla.descuento <= 100, `La cuenta ${regla.nombre || cuenta}: descuento inválido`);
  return regla;
}

/** @param {Reglas} reglas @returns {Medios} */
function mediosDe(reglas) {
  exigir(reglas && reglas.medios, 'Faltan las formas de pago de la caja');
  return reglas.medios;
}

/**
 * La cuenta de GN que va detrás de una forma de pago. Todo es obligatorio: ⛔ un default escondido.
 * - `total`: lo que se paga a precio de lista después de las rebajas a mano (el tope de 6 cuotas).
 * - `promoCreditoHoy`: hay una promo bancaria de crédito con descuento hoy (sale de la Agenda).
 * - `esDelBanco`: la tarjeta es del banco de la promo (lo contesta la cajera; sin promo, ⛔ importa).
 * - `seisCuotas`: el cliente pide 6 cuotas (sólo cuenta si `total` > `minSeisCuotas`).
 * @param {Medio} medio
 * @param {{ reglas: Reglas, total: number, promoCreditoHoy: boolean, esDelBanco: boolean, seisCuotas: boolean }} q
 * @returns {number}
 */
export function cuentaDeMedio(medio, { reglas, total, promoCreditoHoy, esDelBanco, seisCuotas }) {
  const m = mediosDe(reglas);
  exigir(Number.isFinite(total) && total >= 0, 'Total inválido');
  exigir([promoCreditoHoy, esDelBanco, seisCuotas].every(b => typeof b === 'boolean'), 'Faltan las respuestas del crédito');
  const feria = reglas.feria === true;
  if (medio === 'efectivo') return feria ? m.efectivo.feria : m.efectivo.normal;
  if (medio === 'debito') return m.debito.normal;
  if (medio === 'transferencia') {
    if (feria) return m.transferencia.feria;
    exigir(m.transferencia.opciones.includes(Number(reglas.transferenciaA)), 'Falta a qué cuenta van las transferencias');
    return Number(reglas.transferenciaA);
  }
  if (medio === 'credito') {
    if (promoCreditoHoy && esDelBanco) return m.credito.promo;
    if (seisCuotas && total > m.credito.minSeisCuotas) return m.credito.seisCuotas;
    return m.credito.normal;
  }
  throw new Error(`Forma de pago desconocida: ${medio}`);
}

/**
 * La forma de pago de una cuenta, o null si la cuenta ⛔ está detrás de ninguna (la Caja ⛔ la cobra).
 * @param {number} cuenta @param {Reglas | null} reglas @returns {Medio | null}
 */
export function medioDeCuenta(cuenta, reglas) {
  const m = reglas && reglas.medios;
  if (!m) return null;
  const c = Number(cuenta);
  if (c === m.efectivo.normal || c === m.efectivo.feria) return 'efectivo';
  if (m.transferencia.opciones.includes(c) || c === m.transferencia.feria) return 'transferencia';
  if (c === m.debito.normal) return 'debito';
  if (c === m.credito.normal || c === m.credito.promo || c === m.credito.seisCuotas) return 'credito';
  return null;
}

/** Lo que se le muestra a la gente de una cuenta: el medio; si ⛔ tiene (una venta vieja), el nombre. @param {number} cuenta @param {Reglas | null} reglas */
export function nombreParaTicket(cuenta, reglas) {
  const medio = medioDeCuenta(cuenta, reglas);
  if (medio) return NOMBRE_MEDIO[medio];
  const r = reglas && reglas.cuentas && reglas.cuentas[cuenta];
  return r ? r.nombre : `Cuenta ${cuenta}`;
}

/**
 * Los pesos que saca una rebaja sobre `monto`. ⛔ Más que el monto.
 * @param {Rebaja | null} rebaja @param {number} monto @returns {number}
 */
export function pesosDeRebaja(rebaja, monto) {
  if (rebaja == null) return 0;
  exigir((rebaja.tipo === 'pct' || rebaja.tipo === 'pesos') && Number.isFinite(Number(rebaja.valor)) && Number(rebaja.valor) >= 0, 'Descuento a la venta inválido');
  const p = rebaja.tipo === 'pct' ? centavos(monto * Number(rebaja.valor) / 100) : centavos(Number(rebaja.valor));
  exigir(p <= monto, 'El descuento a la venta pasa el total');
  return p;
}

/**
 * El descuento de la cuenta sobre `total`. ⛔ Redondea: eso es `redondeo`.
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
 * `descuentoVenta` es la rebaja a mano a TODA la venta (`{ tipo, valor }`), obligatoria: null si no hay.
 * Devuelve `aVenta` (los pesos de esa rebaja), los pagos con su `rebaja` (su parte) y su `monto`, y
 * los totales de la venta: `descuentoVenta` (en la respuesta) = subtotal − total
 * (lo que se ahorra sobre los renglones; negativo si el redondeo sube). Es para mostrar: a GN va
 * repartido por `armarVentaGN`.
 * @param {{ filas: Fila[], pagos: PagoPedido[], reglas: Reglas, descuentoVenta: Rebaja | null }} args
 * @returns {{ subtotal: number, aVenta: number, pagos: Pago[], total: number, descuentoVenta: number }}
 */
export function cobro({ filas, pagos, reglas, descuentoVenta }) {
  exigir(reglas && Number.isFinite(reglas.redondeo), 'Faltan las reglas de la caja');
  exigir(descuentoVenta !== undefined, 'Falta el descuento a la venta (null si no hay)');
  exigir(Array.isArray(pagos) && pagos.length > 0, 'La venta no tiene pagos');
  const sub = subtotal(filas);
  // 🔑 Cascada (Bruno, 4-oct): prenda ⇒ VENTA ⇒ forma de pago. La rebaja a la venta se reparte entre
  // los pagos por su base (a centavos, Σ exacta), y el % de la cuenta va sobre lo que queda.
  const aVenta = pesosDeRebaja(descuentoVenta, sub);
  let resto = sub;
  let restoRebaja = aVenta;
  const detalle = pagos.map((p, i) => {
    const ultimo = i === pagos.length - 1;
    exigir(ultimo ? p.base == null : Number.isFinite(p.base) && p.base > 0,
      ultimo ? 'El último pago se lleva el resto: va sin base' : `Pago ${i + 1}: falta la base`);
    const base = ultimo ? resto : centavos(p.base);
    exigir(base > 0, 'Los pagos cubren más que el subtotal');
    resto = centavos(resto - base);
    const rebaja = ultimo ? restoRebaja : centavos(aVenta * base / sub);
    restoRebaja = centavos(restoRebaja - rebaja);
    const cuenta = aplicarCuenta(centavos(base - rebaja), p.cuenta, reglas);
    const r = redondeo(cuenta.neto, reglas.redondeo);
    exigir(r.total > 0, `Pago ${i + 1}: queda en $0`);
    return { cuenta: p.cuenta, base, rebaja, porcentaje: cuenta.porcentaje, descuento: cuenta.ajuste, redondeo: r.ajuste, monto: r.total };
  });
  const total = centavos(detalle.reduce((s, p) => s + p.monto, 0));
  return { subtotal: sub, aVenta, pagos: detalle, total, descuentoVenta: centavos(sub - total) };
}

/**
 * 🔑 **PRODUCTOS DE FERIA TRABADOS** (Bruno, 5-oct): un admin marca productos en la Caja
 * (`reglas.feriaProductos`: `[{ id, nombre }]`). Su precio es FINAL: se cobran SÓLO en efectivo o
 * transferencia, a la cuenta de feria (sin el % de la forma de pago). En un pedido mixto, cada
 * prenda con su regla: la parte de feria va a la cuenta de feria y el resto a la cuenta normal de la
 * MISMA forma de pago, con su descuento. El descuento a mano a la venta se reparte como siempre.
 *
 * La pantalla arma los pagos con `pagosDeMedio` y el servidor los vuelve a exigir con `exigirFeria`:
 * sin el servidor, la traba se salta con `curl`.
 */

/** Los ids de los productos trabados. @param {Reglas | null} reglas @returns {Set<number>} */
export function idsDeFeria(reglas) {
  const lista = (reglas && /** @type {any} */ (reglas).feriaProductos) || [];
  return new Set(lista.map((/** @type {any} */ x) => Number(x && typeof x === 'object' ? x.id : x)).filter((/** @type {number} */ n) => Number.isInteger(n) && n > 0));
}

/** Lo que suman las prendas de feria (con su rebaja por prenda). @param {Fila[]} filas @param {Reglas | null} reglas */
export function subtotalDeFeria(filas, reglas) {
  const ids = idsDeFeria(reglas);
  return centavos(filas.filter(f => ids.has(Number(f.product_id))).reduce((s, f) => s + f.importe, 0));
}

export const MSJ_FERIA = 'Las prendas de feria se cobran en efectivo o transferencia';

/**
 * Los pagos de UNA forma de pago, con la traba de feria. Sin prendas de feria es
 * `[{ cuenta: cuentaDeMedio(...) }]`, como siempre.
 * @param {Medio} medio
 * @param {{ filas: Fila[], reglas: Reglas, total: number, promoCreditoHoy: boolean, esDelBanco: boolean, seisCuotas: boolean }} q
 * @returns {PagoPedido[]}
 */
export function pagosDeMedio(medio, q) {
  const cuenta = cuentaDeMedio(medio, q);
  const feria = subtotalDeFeria(q.filas, q.reglas);
  if (!feria) return [{ cuenta }];
  exigir(medio === 'efectivo' || medio === 'transferencia', MSJ_FERIA);
  const m = mediosDe(q.reglas);
  const deFeria = medio === 'efectivo' ? m.efectivo.feria : m.transferencia.feria;
  // Todo de feria, o el modo feria global ya manda todo a la de feria: un solo pago.
  if (feria >= subtotal(q.filas) || cuenta === deFeria) return [{ cuenta: deFeria }];
  return [{ cuenta: deFeria, base: feria }, { cuenta }];
}

/**
 * El servidor: los pagos que mandó la pantalla respetan la traba. Con prendas de feria, todo pago es
 * efectivo o transferencia, y la cuenta de feria se lleva EXACTAMENTE la parte de feria (salvo el
 * modo feria global, que ya manda todo a las de feria).
 * @param {{ filas: Fila[], pagos: PagoPedido[], reglas: Reglas }} args
 */
export function exigirFeria({ filas, pagos, reglas }) {
  const feria = subtotalDeFeria(filas, reglas);
  if (!feria) return;
  const m = mediosDe(reglas);
  for (const p of pagos) {
    const medio = medioDeCuenta(p.cuenta, reglas);
    exigir(medio === 'efectivo' || medio === 'transferencia', MSJ_FERIA);
  }
  if (reglas.feria === true) return;
  const deFeria = [m.efectivo.feria, m.transferencia.feria];
  const i = pagos.findIndex(p => deFeria.includes(Number(p.cuenta)));
  exigir(i >= 0 && pagos.filter(p => deFeria.includes(Number(p.cuenta))).length === 1, 'Las prendas de feria van a la cuenta de feria');
  const total = subtotal(filas);
  const base = i === pagos.length - 1
    ? centavos(total - pagos.slice(0, -1).reduce((s, p) => s + Number(p.base || 0), 0))
    : centavos(Number(pagos[i].base));
  exigir(Math.abs(base - feria) < 0.005, 'La cuenta de feria se lleva sólo las prendas de feria');
}

/**
 * Cuánto tiene que llegar por transferencia a Mercado Pago antes de mandar la venta a GN (F5): el
 * `monto` del pago cuya cuenta tiene `esperaPago`. 0 ⇒ la venta se manda en el momento.
 *
 * 🔴 **Un solo pago que espera por venta.** El cruce busca UNA transferencia del monto exacto: dos
 * pagos que esperan serían dos transferencias, y una clienta que manda las dos juntas ⛔ cruza.
 * @param {Pago[]} pagos los de `cobro` @param {Reglas} reglas @returns {number}
 */
export function montoAEsperar(pagos, reglas) {
  const esperan = pagos.filter(p => reglaDeCuenta(p.cuenta, reglas).esperaPago);
  exigir(esperan.length <= 1, 'Una sola transferencia por venta: la Caja la espera por el monto exacto');
  return esperan.length ? esperan[0].monto : 0;
}

/** El vuelto del efectivo: `{ vuelto, falta }` — uno de los dos es 0. @param {number} pagaCon @param {number} total */
export function vuelto(pagaCon, total) {
  exigir(Number.isFinite(pagaCon) && pagaCon >= 0, 'Monto entregado inválido');
  const d = centavos(pagaCon - total);
  return { vuelto: Math.max(0, d), falta: Math.max(0, -d) };
}

/**
 * Reparte `totalC` centavos entre renglones de tope `topesC`, proporcional a `pesosC`, sin pasar
 * ningún tope y con Σ = `totalC` exacto. Todo en centavos enteros. Exige Σ topes ≥ totalC.
 * @param {number} totalC @param {number[]} pesosC @param {number[]} topesC @returns {number[]}
 */
function repartir(totalC, pesosC, topesC) {
  const sumaPesos = pesosC.reduce((s, x) => s + x, 0);
  exigir(sumaPesos > 0, 'La venta no tiene importe');
  /** @param {number} monto @param {number[]} pesos @param {number} suma */
  const prorratear = (monto, pesos, suma) => {
    const crudo = pesos.map(p => (monto * p) / suma);
    const base = crudo.map(Math.floor);
    let falta = monto - base.reduce((s, x) => s + x, 0);
    const orden = crudo.map((c, i) => [c - base[i], i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
    for (const [, i] of orden) { if (falta <= 0) break; if (pesos[i] > 0) { base[i] += 1; falta -= 1; } }
    return base;
  };
  const parte = prorratear(totalC, pesosC, sumaPesos);
  // Lo que se pasa del tope (sólo cuando el redondeo sube) va a los que tienen lugar.
  let exceso = 0;
  parte.forEach((x, i) => { if (x > topesC[i]) { exceso += x - topesC[i]; parte[i] = topesC[i]; } });
  if (exceso > 0) {
    const lugar = parte.map((x, i) => topesC[i] - x);
    const sumaLugar = lugar.reduce((s, x) => s + x, 0);
    exigir(sumaLugar >= exceso, 'El total pasa el precio de lista');
    const extra = prorratear(exceso, lugar, sumaLugar);
    extra.forEach((x, i) => { parte[i] += x; });
    // El prorrateo puede dejar un centavo de más donde ya no había lugar: se corre al que tenga.
    parte.forEach((x, i) => {
      let sobra = x - topesC[i];
      for (let j = 0; sobra > 0 && j < parte.length; j++) {
        const hay = topesC[j] - parte[j];
        if (hay > 0) { const m = Math.min(hay, sobra); parte[j] += m; parte[i] -= m; sobra -= m; }
      }
    });
  }
  return parte;
}

/**
 * El cuerpo de `POST /ventas` de GN. `pagos` es el `pagos` que devuelve `cobro`; `fecha` es
 * `AAAA-MM-DD` (se pasa: el núcleo ⛔ lee el reloj). `integrationId` deduplica el reintento: GN
 * contesta 409 si ya existe ⇒ «ya está en GN».
 *
 * 🔑 Todo el descuento (rebaja por prenda + cuenta + redondeo) va en `items[].discount`, en PESOS
 * por renglón, y `discount_amount` va en 0: así GN deja Σ (unit_price − discount) = Σ pagos ⇒
 * deuda 0 (medido: #30047, `discount: 1290` sobre $13.390 ⇒ $12.100 justo).
 * 🔴 Si el total pasa el precio de lista (sólo por redondear PARA ARRIBA sin descuento que lo
 * absorba), GN ⛔ acepta un descuento negativo: la diferencia se SUMA al `unit_price`, repartida
 * por precio, y los renglones van sin descuento ⇒ Σ unit_price = Σ pagos igual.
 * Cada unidad va en su renglón con `quantity: 1`: cómo toma GN el descuento en pesos con
 * cantidad > 1 (¿por unidad o por renglón?) ⛔ está medido, y con 1 las dos lecturas coinciden.
 * @param {{ filas: Fila[], pagos: Pago[], modoLocal: ModoLocal, integrationId: string, fecha: string }} args
 */
export function armarVentaGN({ filas, pagos, modoLocal, integrationId, fecha }) {
  exigir(modoLocal && modoLocal.store_id && modoLocal.channel_id && modoLocal.client_id, 'Falta el modo Local');
  exigir(typeof integrationId === 'string' && integrationId.length > 0, 'Falta el integration_id');
  exigir(typeof fecha === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(fecha), 'Fecha inválida');
  exigir(Array.isArray(pagos) && pagos.length > 0, 'La venta no tiene pagos');
  pagos.forEach((p, i) => exigir(Number.isFinite(p.monto) && p.monto > 0 && Number(p.cuenta) > 0, `Pago ${i + 1} inválido`));
  const unidades = filas.flatMap(r => Array.from({ length: r.cantidad }, () => r));
  const aC = (/** @type {number} */ n) => Math.round(n * 100);
  const totalC = pagos.reduce((s, p) => s + aC(p.monto), 0);
  const precioC = unidades.map(r => aC(r.precio));
  // El peso de cada unidad es lo que vale después de SU rebaja: la prenda rebajada lleva más descuento.
  const netoC = unidades.map(r => aC(r.precio * (1 - r.descuento / 100) - (r.rebaja || 0) / r.cantidad));
  const listaC = precioC.reduce((s, x) => s + x, 0);
  // Redondeo para arriba sin descuento: lo que pasa la lista se suma al precio (GN ⛔ acepta descuento < 0).
  const extraC = totalC > listaC ? repartir(totalC - listaC, precioC, precioC.map(() => Infinity)) : precioC.map(() => 0);
  const unitC = precioC.map((p, i) => p + extraC[i]);
  const cobradoC = totalC > listaC ? unitC : repartir(totalC, netoC, precioC);
  return {
    client_id: modoLocal.client_id,
    channel_id: modoLocal.channel_id,
    sale_type_id: modoLocal.sale_type_id,
    sale_state_id: modoLocal.sale_state_id,
    currency_id: modoLocal.currency_id,
    store_id: modoLocal.store_id,
    date_sale: fecha,
    discount_inventory: true,
    integration_source: 'monitor-caja',
    integration_id: integrationId,
    items: unidades.map((r, i) => ({
      product_id: r.product_id,
      size_id: r.size_id,
      quantity: 1,
      unit_price: unitC[i] / 100,
      discount: (unitC[i] - cobradoC[i]) / 100,
      store_id: modoLocal.store_id,
    })),
    discount_amount: 0,
    payments: pagos.map(p => ({ amount: p.monto, account_id: Number(p.cuenta), date_payment: fecha, description: '' })),
  };
}
