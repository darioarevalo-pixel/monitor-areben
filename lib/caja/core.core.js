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
 * 🔑 **Son DATO DE CADA TIENDA (V4, Bruno 12-oct)**: viven en `caja_config.reglas.medios` de su marca y
 * las cambia un admin en «Formas de pago». Las cuentas de oferta (`efectivo.feria`, `transferencia.feria`,
 * `tarjetaOferta`) y las 6 cuotas pueden ser `null`: la tienda ⛔ las tiene en GN (BDI) ⇒ esa opción ⛔ existe.
 * Esto es la SIEMBRA de Zattia; la de cada marca está en `lib/caja/marcas.core.js`.
 */
export const MEDIOS_INICIALES = Object.freeze({
  efectivo: Object.freeze({ normal: 12921, feria: 25867 }),
  transferencia: Object.freeze({ opciones: Object.freeze([13015, 20595]), feria: 25868 }),
  debito: Object.freeze({ normal: 20196 }),
  credito: Object.freeze({ normal: 25188, promo: 25172, seisCuotas: 25173, minSeisCuotas: 250000 }),
  // «Feria TC»: débito y crédito en oferta, con recargo (`reglas.oferta`). Era la constante 25869 hasta la V4.
  tarjetaOferta: 25869,
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
  verificarTransferencia: true,
  titulares: Object.freeze({ areben: 13015, dario: 20595, bruno: 20595 }),
});

/**
 * @typedef {{ tipo: 'pct' | 'pesos', valor: number }} Rebaja
 * @typedef {{ tipo: 'pct' | 'pesos', valor: number, sinFeria?: boolean }} RebajaVenta la de toda la venta; `sinFeria` = la promo de compra (A9)
 * @typedef {{ product_id: number, size_id: number, cantidad: number, precio: number, descuento?: number, rebaja?: Rebaja | null }} ItemCaja
 * @typedef {{ product_id: number, size_id: number, cantidad: number, precio: number, descuento: number, rebaja: number, importe: number }} Fila
 * @typedef {{ nombre: string, descuento: number, efectivo?: boolean, esperaPago?: boolean }} ReglaCuenta
 * @typedef {'efectivo' | 'transferencia' | 'debito' | 'credito'} Medio
 * @typedef {{ efectivo: { normal: number, feria: number | null }, transferencia: { opciones: readonly number[], feria: number | null }, debito: { normal: number }, credito: { normal: number, promo: number, seisCuotas: number | null, minSeisCuotas: number }, tarjetaOferta?: number | null }} Medios
 * @typedef {'final' | 'descuento' | 'recargo' | 'no'} ModoOferta
 * @typedef {{ efectivo: ModoOferta, transferencia: ModoOferta, debito: ModoOferta, credito: ModoOferta, recargo: number }} Oferta
 * @typedef {{ redondeo: number, cuentas: Record<number, ReglaCuenta>, medios?: Medios, transferenciaA?: number | null, transferenciaPorMp?: Record<string, number>, feriaProductos?: Array<{ id: number, nombre: string }>, feriaCampanias?: string[], feriaIdsCampania?: number[], oferta?: Partial<Oferta>, verificarTransferencia?: boolean, transferenciaFija?: number | null, titulares?: Partial<Record<'areben' | 'dario' | 'bruno', number>> }} Reglas
 * @typedef {{ cuenta: number, base?: number }} PagoPedido
 * @typedef {{ cuenta: number, base: number, rebaja: number, porcentaje: number, descuento: number, redondeo: number, monto: number }} Pago
 * @typedef {{ client_id: number, channel_id: number, sale_type_id: number, sale_state_id: number, currency_id: number, store_id: number }} ModoLocal
 */

/** Topes de entrada (auditoría, 11-oct): lo que pasa de esto es un error de tipeo o un `curl`. */
export const MAX_RENGLONES = 60;
export const MAX_CANTIDAD = 50;
export const MAX_PRECIO = 5_000_000;

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
  exigir(items.length <= MAX_RENGLONES, `La venta tiene más de ${MAX_RENGLONES} renglones`);
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
    exigir(Number.isInteger(r.cantidad) && r.cantidad > 0 && r.cantidad <= MAX_CANTIDAD, `Renglón ${i + 1}: cantidad inválida`);
    // Robustez (auditoría, 11-oct): un precio 0 por `curl` regalaba la prenda.
    exigir(Number.isFinite(r.precio) && r.precio > 0 && r.precio <= MAX_PRECIO, `Renglón ${i + 1}: precio inválido`);
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
  // 🔑 La oferta con tarjeta (Bruno, 12-oct) es la ÚNICA cuenta con recargo, y el % lo pone `reglas.oferta`.
  if (esTarjetaOferta(cuenta, reglas)) return { nombre: 'Oferta con tarjeta', descuento: -ofertaDe(reglas).recargo };
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
  // 🔑 La FERIA es por PRODUCTO (Bruno, 11-oct): ⛔ hay modo feria general. Acá va la cuenta NORMAL de la
  // forma de pago; la parte de las prendas de feria la manda `pagosDeMedio` a su cuenta, sin el %.
  if (medio === 'efectivo') return m.efectivo.normal;
  if (medio === 'debito') return m.debito.normal;
  if (medio === 'transferencia') {
    // `transferenciaA` sale de la cuenta de Mercado Pago en uso (`reglas.transferenciaPorMp`, Bruno 11-oct):
    // la de Darío ⇒ Transferencia CG, Areben Comercial ⇒ Transferencia. La pone el servidor.
    exigir(m.transferencia.opciones.includes(Number(reglas.transferenciaA)), 'Falta a qué cuenta van las transferencias');
    return Number(reglas.transferenciaA);
  }
  if (medio === 'credito') {
    if (promoCreditoHoy && esDelBanco) return m.credito.promo;
    if (seisCuotas && m.credito.seisCuotas != null && total > m.credito.minSeisCuotas) return m.credito.seisCuotas;
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
  if (!(Number.isInteger(c) && c > 0)) return null;
  if (c === m.efectivo.normal || c === m.efectivo.feria) return 'efectivo';
  if (m.transferencia.opciones.includes(c) || c === m.transferencia.feria) return 'transferencia';
  if (c === m.debito.normal) return 'debito';
  if (c === m.credito.normal || c === m.credito.promo || c === m.credito.seisCuotas) return 'credito';
  // Débito y crédito en oferta van a la MISMA cuenta de GN («Feria TC»): para validar cuenta como tarjeta.
  if (c === m.tarjetaOferta) return 'credito';
  return null;
}

/** Lo que se le muestra a la gente de una cuenta: el medio; si ⛔ tiene (una venta vieja), el nombre. @param {number} cuenta @param {Reglas | null} reglas */
export function nombreParaTicket(cuenta, reglas) {
  if (esTarjetaOferta(cuenta, reglas)) return 'Tarjeta';
  const medio = medioDeCuenta(cuenta, reglas);
  if (medio) return NOMBRE_MEDIO[medio];
  const r = reglas && reglas.cuentas && reglas.cuentas[cuenta];
  return r ? r.nombre : `Cuenta ${cuenta}`;
}

/**
 * El nombre de una cuenta ADENTRO del local (la pestaña Caja; Bruno, 13-oct): **sólo la forma de pago**,
 * como la ve la cajera. Crédito es crédito aunque sea la cuenta de la promo o de la oferta —el cierre de
 * lote del posnet dice «crédito»—, y lo mismo transferencia. ⛔ El nombre de GN («Feria - Efectivo»). Una
 * cuenta sin forma de pago (una venta vieja), su nombre de las reglas. Dos cuentas con el mismo nombre se
 * suman en una fila.
 * @param {number} cuenta @param {Reglas | null} reglas
 */
export function nombreEnCaja(cuenta, reglas) {
  const medio = medioDeCuenta(Number(cuenta), reglas);
  if (medio) return NOMBRE_MEDIO[medio];
  const r = reglas && reglas.cuentas && reglas.cuentas[Number(cuenta)];
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
 * Los pesos de la rebaja a TODA la venta, con su alcance. La promo de monto mínimo viene con
 * `sinFeria: true` (auditoría A9, 11-oct): se calcula sobre lo que ⛔ es de feria y ⛔ toca la prenda de
 * feria, que tiene precio FINAL. El descuento a mano de la cajera va sobre todo (Bruno, 5-oct).
 * @param {Fila[]} filas @param {Reglas} reglas @param {RebajaVenta | null} descuentoVenta
 * @returns {{ aVenta: number, deFeria: number }} `deFeria`: la parte del subtotal que la rebaja ⛔ toca.
 */
export function rebajaDeVenta(filas, reglas, descuentoVenta) {
  const sub = subtotal(filas);
  const deFeria = descuentoVenta && descuentoVenta.sinFeria ? subtotalDeFeria(filas, reglas) : 0;
  return { aVenta: pesosDeRebaja(descuentoVenta, centavos(sub - deFeria)), deFeria };
}

/**
 * Lo que queda a pagar después de las rebajas a mano y de la promo de compra, antes de la forma de
 * pago: lo que decide si se ofrecen las 6 cuotas. La pantalla y el servidor (`exigirCuentas`), igual.
 * @param {Fila[]} filas @param {Reglas} reglas @param {RebajaVenta | null} descuentoVenta
 */
export function aPagarDe(filas, reglas, descuentoVenta) {
  return centavos(subtotal(filas) - rebajaDeVenta(filas, reglas, descuentoVenta).aVenta);
}

/**
 * «Varios pagos» (robustez, auditoría 11-oct): la cajera escribe lo que la clienta PAGA con una forma de
 * pago (ya con su %), ⛔ la parte del subtotal a precio de lista. Ésta es la vuelta: la base que, en
 * `cobro()`, da ese monto. Con un monto múltiplo del redondeo da exacto; si ⛔, `cobro()` lo redondea.
 * @param {{ filas: Fila[], reglas: Reglas, descuentoVenta: RebajaVenta | null, cuenta: number, monto: number }} args
 * @returns {number | null} null si ⛔ se puede (sin monto, o una cuenta al 100 %)
 */
export function baseParaMonto({ filas, reglas, descuentoVenta, cuenta, monto }) {
  if (!(Number.isFinite(monto) && monto > 0)) return null;
  const sub = subtotal(filas);
  if (!(sub > 0)) return null;
  const porcentaje = reglaDeCuenta(cuenta, reglas).descuento;
  const { aVenta } = rebajaDeVenta(filas, reglas, descuentoVenta);
  const factor = (1 - aVenta / sub) * (1 - porcentaje / 100);
  return factor > 0 ? centavos(monto / factor) : null;
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
 * `descuentoVenta` es la rebaja a TODA la venta (`{ tipo, valor, sinFeria? }`), obligatoria: null si
 * no hay. Se reparte entre los pagos por su base; con `sinFeria` (la promo de compra, A9) el pago a la
 * cuenta de FERIA ⛔ lleva parte.
 * Devuelve `aVenta` (los pesos de esa rebaja), los pagos con su `rebaja` (su parte) y su `monto`, y
 * los totales de la venta: `descuentoVenta` (en la respuesta) = subtotal − total
 * (lo que se ahorra sobre los renglones; negativo si el redondeo sube). Es para mostrar: a GN va
 * repartido por `armarVentaGN`.
 * @param {{ filas: Fila[], pagos: PagoPedido[], reglas: Reglas, descuentoVenta: RebajaVenta | null }} args
 * @returns {{ subtotal: number, aVenta: number, pagos: Pago[], total: number, descuentoVenta: number }}
 */
export function cobro({ filas, pagos, reglas, descuentoVenta }) {
  exigir(reglas && Number.isFinite(reglas.redondeo), 'Faltan las reglas de la caja');
  exigir(descuentoVenta !== undefined, 'Falta el descuento a la venta (null si no hay)');
  exigir(Array.isArray(pagos) && pagos.length > 0, 'La venta no tiene pagos');
  const sub = subtotal(filas);
  // 🔑 Cascada (Bruno, 4-oct): prenda ⇒ VENTA ⇒ forma de pago. La rebaja a la venta se reparte entre
  // los pagos por su base (a centavos, Σ exacta), y el % de la cuenta va sobre lo que queda.
  const { aVenta, deFeria } = rebajaDeVenta(filas, reglas, descuentoVenta);
  let resto = sub;
  const bases = pagos.map((p, i) => {
    const ultimo = i === pagos.length - 1;
    exigir(ultimo ? p.base == null : Number.isFinite(p.base) && p.base > 0,
      ultimo ? 'El último pago se lleva el resto: va sin base' : `Pago ${i + 1}: falta la base`);
    const base = ultimo ? resto : centavos(p.base);
    exigir(base > 0, 'Los pagos cubren más que el subtotal');
    resto = centavos(resto - base);
    return base;
  });
  // A9: con la promo de compra y prendas de feria, la cuenta de feria ⛔ entra en el reparto.
  const m = reglas.medios;
  const deFeriaCuenta = (/** @type {PagoPedido} */ p) => !!m && ((m.efectivo.feria != null && Number(p.cuenta) === m.efectivo.feria) || (m.transferencia.feria != null && Number(p.cuenta) === m.transferencia.feria));
  const pesos = pagos.map((p, i) => (deFeria > 0 && deFeriaCuenta(p) ? 0 : bases[i]));
  const sumaPesos = pesos.reduce((s, x) => s + x, 0);
  exigir(aVenta === 0 || sumaPesos > 0, 'El descuento a la venta no tiene sobre qué aplicarse');
  const ultimoConPeso = pesos.map((x, i) => (x > 0 ? i : -1)).reduce((a, b) => Math.max(a, b), -1);
  let restoRebaja = aVenta;
  const detalle = pagos.map((p, i) => {
    const rebaja = !pesos[i] ? 0 : i === ultimoConPeso ? restoRebaja : centavos(aVenta * pesos[i] / sumaPesos);
    restoRebaja = centavos(restoRebaja - rebaja);
    exigir(rebaja <= bases[i], 'El descuento a la venta pasa lo que se paga con una forma de pago');
    const cuenta = aplicarCuenta(centavos(bases[i] - rebaja), p.cuenta, reglas);
    const r = redondeo(cuenta.neto, reglas.redondeo);
    exigir(r.total > 0, `Pago ${i + 1}: queda en $0`);
    return { cuenta: p.cuenta, base: bases[i], rebaja, porcentaje: cuenta.porcentaje, descuento: cuenta.ajuste, redondeo: r.ajuste, monto: r.total };
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
  // 🔑 Bruno, 11-oct: la feria es la de LIQUIDACIÓN. `feriaIdsCampania` son los productos con el precio de
  // una campaña de feria APLICADO (los resuelve el servidor, `reglasDeHoy`); `feriaProductos`, los que un
  // admin agregó a mano.
  const r = /** @type {any} */ (reglas);
  const lista = [...((r && r.feriaProductos) || []), ...((r && r.feriaIdsCampania) || [])];
  return new Set(lista.map((/** @type {any} */ x) => Number(x && typeof x === 'object' ? x.id : x)).filter((/** @type {number} */ n) => Number.isInteger(n) && n > 0));
}

/** Lo que suman las prendas de feria (con su rebaja por prenda). @param {Fila[]} filas @param {Reglas | null} reglas */
export function subtotalDeFeria(filas, reglas) {
  const ids = idsDeFeria(reglas);
  return centavos(filas.filter(f => ids.has(Number(f.product_id))).reduce((s, f) => s + f.importe, 0));
}

/**
 * 🔑 **CÓMO SE COBRA LA OFERTA, por forma de pago** (Bruno, 12-oct; en pantalla «oferta», en el código
 * sigue `feria`). Lo configura un admin en «Productos en oferta» (`reglas.oferta`), hasta que exista la
 * lista de precios del local, que va a traer sus condiciones de cobro:
 * - `final`: la parte en oferta va a la cuenta de feria de ESA forma de pago, sin el % (efectivo/transferencia).
 * - `descuento`: la oferta suma el descuento de la forma de pago, como cualquier prenda (va a la cuenta normal).
 * - `recargo`: débito o crédito, a la cuenta «Feria TC» (`medios.tarjetaOferta`: 25869 en Zattia) con
 *   `recargo` % sobre la parte en oferta.
 * - `no`: con productos en oferta esa forma de pago ⛔ se usa.
 * Sin `reglas.oferta` es lo de antes del 12-oct: efectivo y transferencia a precio final, tarjetas no.
 * 🔑 V4 (12-oct): una tienda SIN cuenta de oferta (BDI ⛔ tiene «Feria» en GN) ⛔ puede usar `final` ni
 * `recargo` en esa forma de pago: `cuentaDeOferta` lo dice. BDI cobra la oferta con el % (`descuento`).
 */

/** La cuenta «Feria TC» de la tienda, o null si ⛔ tiene. @param {Reglas | null} reglas @returns {number | null} */
export function tarjetaOfertaDe(reglas) {
  const t = reglas && reglas.medios ? Number(reglas.medios.tarjetaOferta) : NaN;
  return Number.isInteger(t) && t > 0 ? t : null;
}
/** @param {number} cuenta @param {Reglas | null} reglas */
const esTarjetaOferta = (cuenta, reglas) => {
  const t = tarjetaOfertaDe(reglas);
  return t != null && Number(cuenta) === t;
};
/** @type {Readonly<Oferta>} */
export const OFERTA_INICIAL = Object.freeze({ efectivo: 'final', transferencia: 'final', debito: 'no', credito: 'no', recargo: 10 });
/** @type {Readonly<Record<Medio, readonly ModoOferta[]>>} */
export const MODOS_OFERTA = Object.freeze({
  efectivo: Object.freeze(['final', 'descuento', 'no']),
  transferencia: Object.freeze(['final', 'descuento', 'no']),
  debito: Object.freeze(['recargo', 'descuento', 'no']),
  credito: Object.freeze(['recargo', 'descuento', 'no']),
});
export const MAX_RECARGO_OFERTA = 50;

/**
 * Valida la configuración de la oferta (la pantalla y el servidor). ⛔ completa con defaults: llega entera.
 * @param {any} x @returns {Oferta}
 */
export function normalizarOferta(x) {
  exigir(x && typeof x === 'object', 'Falta cómo se cobra la oferta');
  /** @type {any} */
  const o = {};
  for (const medio of /** @type {Medio[]} */ (['efectivo', 'transferencia', 'debito', 'credito'])) {
    exigir(MODOS_OFERTA[medio].includes(x[medio]), `Oferta: «${x[medio]}» no es una opción para ${NOMBRE_MEDIO[medio].toLowerCase()}`);
    o[medio] = x[medio];
  }
  const recargo = Number(x.recargo);
  exigir(Number.isFinite(recargo) && recargo > 0 && recargo <= MAX_RECARGO_OFERTA, `Oferta: el recargo va de 0 a ${MAX_RECARGO_OFERTA} %`);
  o.recargo = Math.round(recargo * 100) / 100;
  return o;
}

/** La configuración de la oferta en uso (la guardada, o la de antes del 12-oct). @param {Reglas | null} reglas @returns {Oferta} */
export function ofertaDe(reglas) {
  const o = reglas && reglas.oferta;
  return o ? { ...OFERTA_INICIAL, ...o } : { ...OFERTA_INICIAL };
}

/** La cuenta de GN de la parte en oferta de una forma de pago con modo `final` o `recargo`. @param {Medio} medio @param {Reglas} reglas */
export function cuentaDeOferta(medio, reglas) {
  const m = mediosDe(reglas);
  const c = medio === 'efectivo' ? m.efectivo.feria : medio === 'transferencia' ? m.transferencia.feria : tarjetaOfertaDe(reglas);
  exigir(c != null, `La tienda no tiene cuenta de oferta para ${NOMBRE_MEDIO[medio].toLowerCase()}: cambiá cómo se cobra la oferta`);
  return c;
}

/** Las cuentas que se llevan SÓLO la parte en oferta (las que la tienda tiene). @param {Reglas} reglas @returns {number[]} */
function cuentasDeOferta(reglas) {
  const m = mediosDe(reglas);
  return [m.efectivo.feria, m.transferencia.feria, tarjetaOfertaDe(reglas)].filter(c => c != null).map(Number);
}

/** Con qué se cobra la oferta, para decirlo («efectivo, transferencia o crédito +10 %»). @param {Reglas | null} reglas */
export function msjOferta(reglas) {
  const o = ofertaDe(reglas);
  const si = /** @type {Medio[]} */ (['efectivo', 'transferencia', 'debito', 'credito']).filter(md => o[md] !== 'no')
    .map(md => NOMBRE_MEDIO[md].replace('Tarjeta de ', '').toLowerCase() + (o[md] === 'recargo' ? ` (+${o.recargo} %)` : ''));
  return si.length ? `Los productos en oferta se cobran con ${si.join(', ')}` : 'Los productos en oferta no tienen forma de pago';
}

/**
 * Los pagos de UNA forma de pago, con la regla de la oferta. Sin productos en oferta es
 * `[{ cuenta: cuentaDeMedio(...) }]`, como siempre.
 * @param {Medio} medio
 * @param {{ filas: Fila[], reglas: Reglas, total: number, promoCreditoHoy: boolean, esDelBanco: boolean, seisCuotas: boolean }} q
 * @returns {PagoPedido[]}
 */
export function pagosDeMedio(medio, q) {
  const cuenta = cuentaDeMedio(medio, q);
  const feria = subtotalDeFeria(q.filas, q.reglas);
  if (!feria) return [{ cuenta }];
  const modo = ofertaDe(q.reglas)[medio];
  exigir(modo !== 'no', msjOferta(q.reglas));
  if (modo === 'descuento') return [{ cuenta }];
  const deOferta = cuentaDeOferta(medio, q.reglas);
  // Todo en oferta: un solo pago, a la de oferta.
  if (feria >= subtotal(q.filas)) return [{ cuenta: deOferta }];
  return [{ cuenta: deOferta, base: feria }, { cuenta }];
}

/**
 * El servidor: los pagos que mandó la pantalla respetan la regla de la oferta. Toda forma de pago tiene
 * que aceptar la oferta; si alguna la cobra aparte (`final` o `recargo`), UNA cuenta de oferta se lleva
 * EXACTAMENTE la parte en oferta (salvo la venta que es TODA en oferta, que va en un solo pago a ella).
 * @param {{ filas: Fila[], pagos: PagoPedido[], reglas: Reglas }} args
 */
export function exigirFeria({ filas, pagos, reglas }) {
  const feria = subtotalDeFeria(filas, reglas);
  if (!feria) return;
  const o = ofertaDe(reglas);
  const m = mediosDe(reglas);
  const deOferta = cuentasDeOferta(reglas);
  let aparte = false;
  for (const p of pagos) {
    const c = Number(p.cuenta);
    if (m.efectivo.feria != null && c === m.efectivo.feria) exigir(o.efectivo === 'final', msjOferta(reglas));
    else if (m.transferencia.feria != null && c === m.transferencia.feria) exigir(o.transferencia === 'final', msjOferta(reglas));
    else if (esTarjetaOferta(c, reglas)) exigir(o.debito === 'recargo' || o.credito === 'recargo', msjOferta(reglas));
    else {
      // Débito y crédito comparten «tarjeta» en `medioDeCuenta` sólo para la de oferta: acá cada uno es él.
      const medio = c === m.debito.normal ? 'debito' : medioDeCuenta(c, reglas);
      exigir(medio, msjOferta(reglas));
      const modo = o[/** @type {Medio} */ (medio)];
      exigir(modo !== 'no', msjOferta(reglas));
      if (modo !== 'descuento') aparte = true;
    }
  }
  const i = pagos.findIndex(p => deOferta.includes(Number(p.cuenta)));
  const cuantas = pagos.filter(p => deOferta.includes(Number(p.cuenta))).length;
  exigir(cuantas <= 1 && (!aparte || cuantas === 1), 'Los productos en oferta van a la cuenta de oferta');
  if (i < 0) return;
  const total = subtotal(filas);
  const base = i === pagos.length - 1
    ? centavos(total - pagos.slice(0, -1).reduce((s, p) => s + Number(p.base || 0), 0))
    : centavos(Number(pagos[i].base));
  exigir(Math.abs(base - feria) < 0.005, 'La cuenta de oferta se lleva sólo los productos en oferta');
}

/**
 * 🔴 **El servidor: cada pago va a la cuenta que le CORRESPONDE hoy** (auditoría A6, 11-oct). La pantalla
 * elige la cuenta con `cuentaDeMedio`; sin esta verificación, una pantalla abierta desde antes de un
 * cambio de configuración cobraba con la cuenta vieja, la cuenta del −10 % de crédito pasaba sin promo del día, y
 * las 6 cuotas pasaban debajo del mínimo (o con `curl`).
 * - efectivo / transferencia: la normal (la transferencia, la de `transferenciaA`: la de la cuenta de
 *   Mercado Pago en uso) y la de feria sólo si hay prendas de feria (`exigirFeria` controla cuánto se lleva).
 * - crédito: la de la promo sólo con `promoCreditoHoy` (lo lee el servidor de la Agenda; ⛔ lo manda la
 *   pantalla) · la de 6 cuotas sólo si lo que se paga pasa `minSeisCuotas` (`aPagarDe`).
 * ⚠️ «¿Es tarjeta de ese banco?» lo contesta la cajera: eso ⛔ se puede verificar.
 * @param {{ filas: Fila[], pagos: PagoPedido[], reglas: Reglas, descuentoVenta: RebajaVenta | null, promoCreditoHoy: boolean }} args
 */
export function exigirCuentas({ filas, pagos, reglas, descuentoVenta, promoCreditoHoy }) {
  const m = mediosDe(reglas);
  exigir(typeof promoCreditoHoy === 'boolean', 'Falta si hoy hay promo de crédito');
  exigir(descuentoVenta !== undefined, 'Falta el descuento a la venta (null si no hay)');
  const hayPrendasFeria = subtotalDeFeria(filas, reglas) > 0;
  const RECARGAR = 'Recargá la Caja: cambió una forma de pago';
  for (const p of pagos) {
    const c = Number(p.cuenta);
    const medio = medioDeCuenta(c, reglas);
    exigir(medio, `La cuenta ${p.cuenta} no es una forma de pago de la Caja.`);
    if (medio === 'efectivo' || medio === 'transferencia') {
      const deFeria = medio === 'efectivo' ? m.efectivo.feria : m.transferencia.feria;
      const normal = medio === 'efectivo' ? m.efectivo.normal : Number(reglas.transferenciaA);
      if (deFeria != null && c === deFeria) exigir(hayPrendasFeria, 'La cuenta de oferta es sólo para los productos en oferta.');
      else exigir(c === normal, `${RECARGAR} (las transferencias van a otra cuenta).`);
    }
    if (esTarjetaOferta(c, reglas)) {
      exigir(hayPrendasFeria, 'La cuenta de oferta es sólo para los productos en oferta.');
      continue;
    }
    if (medio === 'credito') {
      if (c === m.credito.promo) exigir(promoCreditoHoy, 'Hoy no hay promo bancaria de crédito: se cobra a precio de lista.');
      if (m.credito.seisCuotas != null && c === m.credito.seisCuotas) exigir(aPagarDe(filas, reglas, descuentoVenta) > m.credito.minSeisCuotas, `Las 6 cuotas son para compras de más de $${m.credito.minSeisCuotas.toLocaleString('es-AR')}.`);
    }
  }
}

/**
 * Cuánto tiene que llegar por transferencia a Mercado Pago antes de mandar la venta a GN (F5). 0 ⇒ la
 * venta se manda en el momento.
 *
 * 🔑 **TODA transferencia espera el pago, la cuenta de GN que sea** (Bruno, 5-oct): la normal, la de
 * feria y la de Caja Gerencia. Antes lo decidía `esperaPago` de CADA cuenta y sólo la 13015 lo tenía:
 * en modo feria una venta de $200 por transferencia se dio por cobrada y fue directo a GN. Ahora la
 * regla es la FORMA de pago (`medioDeCuenta`); `esperaPago` sigue valiendo para una cuenta que ⛔ sea
 * transferencia y se quiera esperar igual.
 *
 * 🔑 **Se espera UNA transferencia por la SUMA** de las partes por transferencia: el pedido mixto de
 * feria son dos pagos (feria + normal) y la clienta manda una sola transferencia. El cruce busca ese
 * monto exacto.
 *
 * 🔑 **POR TIENDA (V4, Bruno 12-oct)**: si la tienda ⛔ tiene una cuenta de Mercado Pago donde verificar
 * (`reglas.verificarTransferencia === false`), la transferencia se confirma SIN cruce, como el efectivo.
 * @param {Pago[]} pagos los de `cobro` @param {Reglas} reglas @returns {number}
 */
export function montoAEsperar(pagos, reglas) {
  const verifica = verificaTransferencias(reglas);
  const esperan = pagos.filter(p => (verifica && medioDeCuenta(p.cuenta, reglas) === 'transferencia') || reglaDeCuenta(p.cuenta, reglas).esperaPago);
  return centavos(esperan.reduce((s, p) => s + p.monto, 0));
}

/**
 * ¿La tienda verifica la transferencia en Mercado Pago antes de mandar la venta? 🔑 Sólo un `false`
 * EXPLÍCITO la apaga: sin la clave es lo de siempre (esperar), que es el lado que ⛔ pierde plata.
 * @param {Reglas | null} reglas
 */
export function verificaTransferencias(reglas) {
  return !(reglas && reglas.verificarTransferencia === false);
}

/**
 * ¿El pedido que manda la pantalla es la MISMA venta que ya está guardada con ese id? (auditoría A1,
 * 11-oct). La respuesta perdida + la cajera que cambia el pedido + confirmar con el mismo id devolvía
 * la venta VIEJA: GN quedaba con la vieja y la prenda agregada ⛔ se cobraba.
 *
 * 🔑 Compara lo que MANDÓ la pantalla, ⛔ lo recalcula: un reintento legítimo después de un cambio de
 * promo tiene que dar «la misma». El total, las prendas (producto, talle, cantidad, precio, en
 * cualquier orden) y las cuentas de los pagos.
 * @param {{ total: number, renglones: Array<{ product_id: number, size_id: number, cantidad: number, precio: number }>, pagos: Array<{ cuenta: number }> }} previa la fila de `caja_venta`
 * @param {{ total: unknown, items: unknown, pagos: unknown }} pedido el cuerpo del `confirmar`
 * @returns {boolean}
 */
export function mismaVenta(previa, pedido) {
  exigir(previa && Array.isArray(previa.renglones) && Array.isArray(previa.pagos), 'Falta la venta guardada');
  exigir(pedido && typeof pedido === 'object', 'Falta el pedido de la pantalla');
  if (Math.round(Number(pedido.total) * 100) !== Math.round(Number(previa.total) * 100)) return false;
  const prenda = (r) => [Number(r && r.product_id), Number(r && r.size_id), Number(r && r.cantidad), Math.round(Number(r && r.precio) * 100)].join('|');
  const firma = (xs, f) => (Array.isArray(xs) ? xs.map(f).sort().join(';') : null);
  if (firma(pedido.items, prenda) !== firma(previa.renglones, prenda)) return false;
  const cuenta = (p) => String(Number(p && p.cuenta));
  return firma(pedido.pagos, cuenta) === firma(previa.pagos, cuenta);
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
