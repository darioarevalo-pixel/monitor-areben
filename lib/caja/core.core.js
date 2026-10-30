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
 *   ⇒ `armarVentaGN` manda TODO (rebaja + cuenta + redondeo) en `discount_amount`, como el POS de GN.
 * - Como el descuento ⛔ puede ser negativo, cuando el redondeo deja el total por ENCIMA del precio
 *   de lista (un accesorio de $4.990 con una cuenta al 0 % ⇒ $5.000) la diferencia va SUMADA al
 *   `unit_price` y el renglón sin descuento (ver `armarVentaGN`). El redondeo ⛔ se recorta: existe
 *   porque si todo termina en 90 ⛔ alcanzan los billetes de $10 (Bruno, 4-oct).
 * - El pago se registra por lo que se COBRA, ⛔ por lo que entregó la clienta: lo que se manda de
 *   más GN lo guarda como saldo a favor. El vuelto es nuestro y ⛔ viaja a GN.
 */

import { deLaLinea, delCanal, efectoDeGrupo, vigente as efectoVigente } from '../../motor/venta/reglas.mjs';

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
 * @typedef {{ product_id: number, size_id: number, cantidad: number, precio: number, descuento?: number, rebaja?: Rebaja | null, linea?: string, oferta?: boolean }} ItemCaja `oferta`: la prenda de esa línea está en oferta en SU tienda (`PCT_OFERTA_DE_LINEA`). `linea`: 'stunned' si la prenda es de Stunned (la pone la pantalla por el SKU)
 * @typedef {{ product_id: number, size_id: number, cantidad: number, precio: number, descuento: number, rebaja: number, importe: number, categorias?: string[], linea?: string, oferta?: boolean }} Fila
 * @typedef {{ nombre: string, descuento: number, efectivo?: boolean, esperaPago?: boolean }} ReglaCuenta
 * @typedef {'efectivo' | 'transferencia' | 'debito' | 'credito'} Medio
 * @typedef {{ efectivo: { normal: number, feria: number | null }, transferencia: { opciones: readonly number[], feria: number | null }, debito: { normal: number }, credito: { normal: number, promo: number, seisCuotas: number | null, minSeisCuotas: number }, tarjetaOferta?: number | null }} Medios
 * @typedef {'final' | 'descuento' | 'recargo' | 'no'} ModoOferta
 * @typedef {{ efectivo: ModoOferta, transferencia: ModoOferta, debito: ModoOferta, credito: ModoOferta, recargo: number }} Oferta
 * @typedef {{ redondeo: number, cuentas: Record<number, ReglaCuenta>, medios?: Medios, transferenciaA?: number | null, transferenciaPorMp?: Record<string, number>, feriaProductos?: Array<{ id: number, nombre: string }>, feriaCampanias?: string[], feriaIdsCampania?: number[], feriaPrecios?: Record<string, number>, oferta?: Partial<Oferta>, verificarTransferencia?: boolean, transferenciaFija?: number | null, titulares?: Partial<Record<'areben' | 'dario' | 'bruno', number>>, comerciales?: Comerciales | null }} Reglas
 * @typedef {{ marca: string, lista: any[], campaniasDe?: Record<string, string[]>, fecha?: string }} Comerciales las reglas comerciales con que cobra la Caja (parte 3); las pone el servidor (`reglasDeHoy`)
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
    // Las categorías de Tienda Nube (las manda la pantalla): las usan las promos y las reglas comerciales por categoría.
    const categorias = Array.isArray(it.categorias) ? it.categorias.map(String) : null;
    // La línea (Stunned, por el SKU; la manda la pantalla como las categorías): con reglas comerciales, la prenda cobra con
    // las de su línea (`deLaLinea` del motor; Bruno 17-oct). Sin reglas de Stunned, con las de la marca: ⛔ cambia nada.
    const linea = typeof it.linea === 'string' && /^[a-z]{1,20}$/.test(it.linea) ? it.linea : null;
    // La oferta de la línea (Stunned en oferta en SU tienda, 26-oct): sin línea ⛔ significa nada.
    const oferta = it.oferta === true && !!linea;
    return { ...r, importe: centavos(bruto - r.rebaja), ...(categorias ? { categorias } : {}), ...(linea ? { linea } : {}), ...(oferta ? { oferta: true } : {}) };
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

/**
 * Un % sobre `total` (el de las reglas comerciales: puede ser un RECARGO, negativo, y tener decimales). El `porcentaje`
 * que se muestra va a 2 decimales; el descuento sale del exacto. ⛔ Redondea: eso es `redondeo`.
 * @param {number} total @param {number} pct @returns {{ porcentaje: number, ajuste: number, neto: number }}
 */
function aplicarPct(total, pct) {
  exigir(Number.isFinite(total) && total >= 0, 'Total inválido');
  exigir(Number.isFinite(pct) && pct <= 100, 'Descuento inválido');
  const ajuste = centavos(total * pct / 100);
  return { porcentaje: Math.round(pct * 100) / 100, ajuste, neto: centavos(total - ajuste) };
}

/**
 * 🔑 **LA OFERTA DE STUNNED EN EL LOCAL** (Bruno, 26-oct-2026: «10 % efectivo y transferencia en feria»): una
 * prenda de Stunned EN OFERTA en su Tienda Nube (la STND SALE) paga 10 % en efectivo y en transferencia, ⛔ el
 * 15 % de la cuenta de efectivo: la feria de Stunned está a ~1,07× el costo y con el 15 % quedaba ABAJO. La
 * cuenta de GN es la de siempre (la plata va al mismo lugar); cambia CUÁNTO. ⛔ las cuentas de feria de Zattia
 * (precio final, 0 %): esa feria sigue en el local. Débito y crédito, sin cambio.
 * Qué prenda está en oferta lo dice la pantalla (`oferta` del renglón, de `precioDeCaja`), como la línea:
 * mentirlo da, a lo sumo, MENOS descuento.
 * 🔑 **Sólo las prendas de `productos`** (Bruno, 30-oct, Cyber Monday): el DROP 1 (la STND SALE, al costo) sigue en
 * 10/10; el drop 2 en oferta (20-30 % sobre lista, lejos del costo) paga el % de su cuenta, 15 % efectivo / 10 %
 * transferencia. Una prenda en oferta que ⛔ está en la lista, paga su cuenta.
 */
export const PCT_OFERTA_DE_LINEA = Object.freeze({
  stunned: Object.freeze({
    efectivo: 10,
    transferencia: 10,
    // Drop 1 (GN): los 24 de «Feria Stunned · Drop 1» (l1792601523298_wv8ycj) + BUZO MAIN (914440, también en oferta).
    productos: Object.freeze([913507, 913508, 913509, 913510, 913511, 913512, 913513, 913514, 913515, 913518, 913519, 913521, 913522,
      913523, 913524, 913526, 913527, 913528, 913529, 913530, 913531, 913532, 913533, 914439, 914440]),
  }),
});

/**
 * El % de la oferta de la línea en una forma de pago para ESA prenda, o null si ⛔ tiene (fuera de `productos`, o el
 * medio ⛔ está). @param {string | null | undefined} linea @param {Medio | null} medio @param {number} productId
 */
export function pctOfertaDeLinea(linea, medio, productId) {
  const t = linea ? /** @type {Record<string, { efectivo?: number, transferencia?: number, productos: readonly number[] }>} */ (PCT_OFERTA_DE_LINEA)[linea] : null;
  if (!t || !medio || !t.productos.includes(Number(productId))) return null;
  const p = /** @type {Record<string, unknown>} */ (t)[medio];
  return typeof p === 'number' && Number.isFinite(p) ? p : null;
}

/**
 * El % de un pago SIN reglas comerciales: el de su cuenta, salvo que pague prendas con la oferta de su línea
 * (`PCT_OFERTA_DE_LINEA`): entonces el % PESADO por el importe de cada prenda, como `efectoDeGrupo`. Las prendas
 * de un pago son las que no son de feria si esa forma de pago cobra la feria aparte, si no, todas.
 * @param {number} cuenta @param {Fila[] | null | undefined} filas @param {Reglas} reglas @returns {number}
 */
function pctDeCuenta(cuenta, filas, reglas) {
  const base = reglaDeCuenta(cuenta, reglas).descuento;
  const m = reglas.medios;
  if (!m || !Array.isArray(filas) || !filas.some(f => f.oferta)) return base;
  const c = Number(cuenta);
  if (c === m.efectivo.feria || c === m.transferencia.feria) return base;
  const medio = medioDeCuenta(c, reglas);
  const ids = idsDeFeria(reglas);
  const aparte = medio != null && mediosOfertaAparte(reglas).includes(medio);
  const paga = filas.filter(f => !aparte || !ids.has(Number(f.product_id)));
  const total = paga.reduce((s, f) => s + f.importe, 0);
  if (!(total > 0)) return base;
  const pesado = paga.reduce((s, f) => {
    const p = f.oferta ? pctOfertaDeLinea(f.linea, medio, f.product_id) : null;
    return s + f.importe * (p ?? base);
  }, 0);
  return pesado / total;
}

/**
 * 🔑 **LA CAJA COBRA CON LAS REGLAS COMERCIALES** (parte 3 de `reglas-comerciales.md`, 17-oct). Con `reglas.comerciales`
 * (la marca prendió «la Caja cobra con las reglas» en `erp › Reglas`; lo pone el servidor), el % de cada pago sale de
 * las REGLAS (`regla_comercial` + la promo de la Agenda), ⛔ de la cuenta de GN. Sin él, es la cuenta, como siempre.
 * Lo que ⛔ cambia: qué cuenta de GN va detrás de cada pago y cómo se reparte la venta (`pagosDeMedio`, `exigirFeria`,
 * `exigirCuentas`): la cuenta es a DÓNDE va la plata en GN; las reglas, CUÁNTO.
 * @param {Reglas | null} reglas
 */
export const cobraConReglas = reglas => !!(reglas && reglas.comerciales && Array.isArray(reglas.comerciales.lista));

/**
 * El % de un pago. Sin reglas comerciales, el de su cuenta (`reglaDeCuenta`). Con ellas, el de las reglas sobre las
 * prendas que paga (`efectoDeGrupo` del motor: cada prenda con la regla que gana en ella, el pago con el % PESADO):
 * - las prendas: la cuenta de OFERTA paga las de oferta; las otras, el resto si la venta lleva la oferta aparte
 *   (`ofertaAparte`), o todas (BDI: la oferta suma el % de la forma de pago, va a la cuenta normal).
 * - la forma de pago es la de la cuenta; la cuenta de la promo de crédito es «la tarjeta del banco de la promo de hoy»
 *   (el banco sale de las reglas de la Agenda) y la de 6 cuotas, 6 cuotas.
 * Devuelve el % EXACTO (con decimales si las prendas llevan % distintos). Una prenda que la regla ⛔ acepta, lanza.
 * @param {{ cuenta: number, filas: Fila[], reglas: Reglas, ofertaAparte: boolean, aPagar: number, fecha?: string | number | Date }} q
 * @returns {number}
 */
export function pctDePago({ cuenta, filas, reglas, ofertaAparte, aPagar, fecha }) {
  if (!cobraConReglas(reglas)) return pctDeCuenta(cuenta, filas, reglas);
  const com = /** @type {Comerciales} */ (reglas.comerciales);
  const m = mediosDe(reglas);
  const c = Number(cuenta);
  const medio = medioDeCuenta(c, reglas);
  exigir(medio, `La cuenta ${cuenta} no es una forma de pago de la Caja`);
  const cuando = fecha ?? com.fecha ?? Date.now();
  const lista = delCanal(com.lista, { marca: com.marca, canal: 'local' });
  /** @type {{ medio: Medio, banco?: string, cuotas?: number }} */
  const pago = { medio };
  if (c === m.credito.promo) {
    // El banco de la promo de hoy es el de la TIENDA (la Agenda es de la marca), ⛔ el de una línea.
    const banco = bancoDeLaPromo(deLaLinea(lista, {}), cuando);
    if (banco) pago.banco = banco;
  }
  if (m.credito.seisCuotas != null && c === m.credito.seisCuotas) pago.cuotas = 6;
  const ids = idsDeFeria(reglas);
  const deOferta = cuentasDeOferta(reglas).includes(c);
  const idx = filas.map((f, i) => i).filter(i => (deOferta ? ids.has(Number(filas[i].product_id)) : !ofertaAparte || !ids.has(Number(filas[i].product_id))));
  exigir(idx.length > 0, 'Un pago no tiene qué pagar');
  const campaniasDe = com.campaniasDe || {};
  const renglonesMotor = filas.map(f => ({ ...f, campanias: campaniasDe[String(f.product_id)] || [], nombre: /** @type {any} */ (f).nombre }));
  return efectoDeGrupo(lista, renglonesMotor, idx, pago, { fecha: cuando, aPagar }).pctExacto;
}

/**
 * El % de una forma de pago «para toda la tienda», para DECIRLO (la tarjeta de la forma de pago, la banda de promos): sin
 * reglas comerciales, el de la cuenta; con ellas, la mejor regla de temporada de toda la tienda que vale hoy (las de una
 * campaña o unas prendas se ven en el total). ⛔ Cobra: eso es `cobro()`. null si la cuenta ⛔ tiene regla.
 * @param {Medio} medio @param {Reglas} reglas @param {number} cuenta
 */
export function pctDeMedio(medio, reglas, cuenta) {
  if (!cobraConReglas(reglas)) {
    const r = reglas && reglas.cuentas ? reglas.cuentas[cuenta] : null;
    return r ? r.descuento : null;
  }
  const com = /** @type {Comerciales} */ (reglas.comerciales);
  const m = mediosDe(reglas);
  const conBanco = Number(cuenta) === m.credito.promo;
  // «Para toda la tienda» son las de la marca (`deLaLinea(…, {})`), ⛔ las de una línea (Stunned).
  const hoy = deLaLinea(delCanal(com.lista, { marca: com.marca, canal: 'local' }), {})
    .filter(r => !r.campania && r.alcance === 'todo' && r.medios.includes(medio) && r.cuotas == null && r.monto_minimo == null && (!r.banco || conBanco))
    .filter(r => (r.efecto === 'descuento' || r.efecto === 'recargo') && efectoVigente(r, Date.now()));
  return hoy.reduce((mejor, r) => Math.max(mejor, r.efecto === 'recargo' ? -r.pct : r.pct), 0);
}

/** El banco de la promo de crédito vigente hoy (la de mejor %), o null. @param {any[]} lista @param {string | number | Date} fecha */
function bancoDeLaPromo(lista, fecha) {
  const hoy = lista.filter(r => r.banco && r.medios.includes('credito') && r.efecto === 'descuento' && efectoVigente(r, fecha));
  hoy.sort((a, b) => b.pct - a.pct);
  return hoy.length ? hoy[0].banco : null;
}

/** ¿La venta lleva la oferta APARTE (algún pago a una cuenta de oferta)? @param {PagoPedido[]} pagos @param {Reglas} reglas */
function conOfertaAparte(pagos, reglas) {
  if (!reglas.medios) return false;
  const deOferta = cuentasDeOferta(reglas);
  return pagos.some(p => deOferta.includes(Number(p.cuenta)));
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
  const { aVenta, deFeria } = rebajaDeVenta(filas, reglas, descuentoVenta);
  // Con reglas comerciales, la cuenta normal paga «el resto» cuando la oferta va aparte (el reparto de `pagosDeVarios`).
  const ofertaAparte = cobraConReglas(reglas) && subtotalDeFeria(filas, reglas) > 0 && mediosOfertaAparte(reglas).length > 0;
  const porcentaje = pctDePago({ cuenta, filas, reglas, ofertaAparte, aPagar: centavos(sub - aVenta) });
  // A9: con la promo de compra, la cuenta de feria de efectivo/transferencia ⛔ lleva parte (`cobro()`).
  const m = reglas.medios;
  const sinRebaja = deFeria > 0 && !!m && (Number(cuenta) === m.efectivo.feria || Number(cuenta) === m.transferencia.feria);
  const factor = (1 - (sinRebaja ? 0 : aVenta / sub)) * (1 - porcentaje / 100);
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
  const conReglas = cobraConReglas(reglas);
  const ofertaAparte = conReglas && conOfertaAparte(pagos, reglas);
  const detalle = pagos.map((p, i) => {
    const rebaja = !pesos[i] ? 0 : i === ultimoConPeso ? restoRebaja : centavos(aVenta * pesos[i] / sumaPesos);
    restoRebaja = centavos(restoRebaja - rebaja);
    exigir(rebaja <= bases[i], 'El descuento a la venta pasa lo que se paga con una forma de pago');
    const cuenta = conReglas || filas.some(f => f.oferta)
      ? aplicarPct(centavos(bases[i] - rebaja), pctDePago({ cuenta: p.cuenta, filas, reglas, ofertaAparte, aPagar: centavos(sub - aVenta) }))
      : aplicarCuenta(centavos(bases[i] - rebaja), p.cuenta, reglas);
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

/**
 * El precio de una prenda de feria: el de su CAMPAÑA de Liquidación (Bruno, 13-oct), ⛔ el de Tienda Nube,
 * que puede tener otra campaña aplicada encima (la «Feria Online», ~11 % más cara). `null` si el producto
 * ⛔ es de una campaña de feria (o fue agregado a mano): entonces vale el de la etiqueta.
 * @param {Reglas | null} reglas @param {number} productId @returns {number | null}
 */
export function precioDeFeria(reglas, productId) {
  const p = Number(reglas && reglas.feriaPrecios ? reglas.feriaPrecios[String(productId)] : NaN);
  return Number.isFinite(p) && p > 0 ? p : null;
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
 * que aceptar la oferta; si alguna la cobra aparte (`final` o `recargo`), las cuentas de oferta se llevan
 * ENTRE TODAS exactamente la parte en oferta.
 * 🔑 Bruno, 13-oct: la oferta se puede partir entre las formas de pago que la cobran aparte (la mitad en
 * efectivo y la mitad por transferencia) ⇒ ⛔ «UNA cuenta de oferta», sino la SUMA. Cada cuenta de oferta
 * va una sola vez: débito y crédito comparten la «Feria TC» y dos pagos a la misma cuenta en GN ⛔ se probaron.
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
      // 🔑 Bruno, 13-oct: una forma de pago en `no` paga LO QUE ⛔ ES OFERTA (débito para el jean común, la
      // oferta en efectivo). Como `final`/`recargo`, eso exige que la oferta vaya entera a sus cuentas.
      const modo = o[/** @type {Medio} */ (medio)];
      if (modo !== 'descuento') aparte = true;
    }
  }
  const deLaOferta = pagos.map((p, i) => i).filter(i => deOferta.includes(Number(pagos[i].cuenta)));
  exigir(!aparte || deLaOferta.length > 0, deOferta.length ? 'Los productos en oferta van a la cuenta de oferta' : msjOferta(reglas));
  const cuentas = deLaOferta.map(i => Number(pagos[i].cuenta));
  exigir(new Set(cuentas).size === cuentas.length, DOS_A_LA_MISMA);
  if (!deLaOferta.length) return;
  // La base de cada pago, como en `cobro()`: el último se lleva el resto.
  const total = subtotal(filas);
  const previas = centavos(pagos.slice(0, -1).reduce((s, p) => s + Number(p.base || 0), 0));
  const baseDe = (/** @type {number} */ i) => (i === pagos.length - 1 ? centavos(total - previas) : centavos(Number(pagos[i].base)));
  const base = centavos(deLaOferta.reduce((s, i) => s + baseDe(i), 0));
  exigir(Math.abs(base - feria) < 0.005, 'La cuenta de oferta se lleva sólo los productos en oferta');
}

const DOS_A_LA_MISMA = 'En la oferta, cada forma de pago va una sola vez (débito y crédito cuentan como una: comparten la cuenta)';

/** Las formas de pago que cobran la oferta APARTE, a una cuenta de oferta (`final` o `recargo`). @param {Reglas | null} reglas @returns {Medio[]} */
export function mediosOfertaAparte(reglas) {
  const o = ofertaDe(reglas);
  return /** @type {Medio[]} */ (['efectivo', 'transferencia', 'debito', 'credito']).filter(md => o[md] === 'final' || o[md] === 'recargo');
}

/**
 * «Varios pagos» con productos en oferta (Bruno, 13-oct): dos repartos. La OFERTA, entre las formas de pago
 * que la cobran aparte (cada una a su cuenta de oferta), y EL RESTO, entre CUALQUIER forma de pago —también
 * las que ⛔ aceptan oferta: débito para lo común (Bruno, 13-oct: si no, era pasar dos ventas)—. En cada reparto el último pago va sin base y se lleva lo que falta
 * de ese reparto; la venta TODA en oferta ⛔ tiene resto. Lo que sale es lo de `cobro()` y `exigirFeria`.
 * @param {{ oferta: Array<{ medio: Medio, base?: number }>, resto: Array<{ medio: Medio, base?: number }>, filas: Fila[], reglas: Reglas, total: number, promoCreditoHoy: boolean, esDelBanco: boolean, seisCuotas: boolean }} q
 * `base`: la parte del subtotal (a precio de lista) de ese pago; la del último de cada reparto se ignora.
 * @returns {PagoPedido[]}
 */
export function pagosDeVarios(q) {
  const feria = subtotalDeFeria(q.filas, q.reglas);
  exigir(feria > 0, 'No hay productos en oferta');
  const sub = subtotal(q.filas);
  const hayResto = feria < sub;
  exigir(q.oferta.length > 0, 'Falta con qué se paga la oferta');
  exigir(!hayResto || q.resto.length > 0, 'Falta con qué se paga el resto');
  const aparte = mediosOfertaAparte(q.reglas);
  /** @param {Array<{ medio: Medio, base?: number }>} lista @param {number} tope @param {(md: Medio) => number} cuentaDe @param {boolean} ultimoSinBase */
  const repartir = (lista, tope, cuentaDe, ultimoSinBase) => {
    let resto = tope;
    return lista.map((p, i) => {
      const cuenta = cuentaDe(p.medio);
      if (i < lista.length - 1) {
        const base = centavos(Number(p.base));
        exigir(Number.isFinite(base) && base > 0, `Falta cuánto paga con ${NOMBRE_MEDIO[p.medio].toLowerCase()}`);
        resto = centavos(resto - base);
        return { cuenta, base };
      }
      exigir(resto > 0, tope === feria ? 'Los pagos de la oferta pasan lo que suman los productos en oferta' : 'Los pagos pasan lo que queda por pagar');
      return ultimoSinBase ? { cuenta } : { cuenta, base: resto };
    });
  };
  const deOferta = repartir(q.oferta, feria, md => {
    exigir(aparte.includes(md), msjOferta(q.reglas));
    return cuentaDeOferta(md, q.reglas);
  }, !hayResto);
  const cuentas = deOferta.map(p => Number(p.cuenta));
  exigir(new Set(cuentas).size === cuentas.length, DOS_A_LA_MISMA);
  if (!hayResto) return deOferta;
  const delResto = repartir(q.resto, centavos(sub - feria), md => cuentaDeMedio(md, q), true);
  return [...deOferta, ...delResto];
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
 * El código de la venta en la Caja: las primeras 8 letras de su id. Es el «Provisorio» del ticket
 * cuando GN ⛔ contestó, y va en el comentario de la venta en GN para buscarla con ese ticket
 * (Bruno, 14-oct: la 5C65E1EF quedó #30489 y desde el ticket ⛔ había cómo encontrarla).
 * @param {string} id
 */
export const codigoCaja = (id) => String(id).replace(/-/g, '').slice(0, 8).toUpperCase();

/**
 * La nota de la venta en GN: lo que sirve para ubicarla desde el local. La venta va a «Consumidor
 * Final» ⇒ sin esto, en GN ⛔ queda ni el mail de la clienta (Bruno, 14-oct). Ej.:
 * «Caja 5C65E1EF · danielaorellana161@gmail.com · Cajera: Lorena».
 * @param {{ integrationId: string, email?: string | null, cajera?: string | null }} args
 */
export function notaGN({ integrationId, email = null, cajera = null }) {
  return [`Caja ${codigoCaja(integrationId)}`, email, cajera && `Cajera: ${cajera}`].filter(Boolean).join(' · ').slice(0, 500);
}

/**
 * El cuerpo de `POST /ventas` de GN. `pagos` es el `pagos` que devuelve `cobro`; `fecha` es
 * `AAAA-MM-DD` (se pasa: el núcleo ⛔ lee el reloj). `integrationId` deduplica el reintento: GN
 * contesta 409 si ya existe ⇒ «ya está en GN».
 *
 * 🔑 Todo el descuento (rebaja por prenda + cuenta + redondeo) va A NIVEL VENTA (`discount_amount`,
 * en pesos) y los renglones van a su precio con `discount: 0`, como deja sus ventas el POS de GN
 * (Bruno, 17-oct). Antes iba repartido en `items[].discount`: la API lo toma en PESOS pero la ficha de
 * GN muestra esa columna como %, y con oferta + prendas comunes («2 Cuentas») el reparto parejo le
 * ponía descuento a la oferta (#30656: la lencería de oferta con 13,3 %). Σ unit_price − discount_amount
 * = Σ pagos ⇒ deuda 0.
 * 🔴 Si el total pasa el precio de lista (sólo por redondear PARA ARRIBA sin descuento que lo
 * absorba), GN ⛔ acepta un descuento negativo: la diferencia se SUMA al `unit_price`, repartida
 * por precio, y la venta va sin descuento ⇒ Σ unit_price = Σ pagos igual.
 * Cada unidad va en su renglón con `quantity: 1`.
 * @param {{ filas: Fila[], pagos: Pago[], modoLocal: ModoLocal, integrationId: string, fecha: string, email?: string | null, cajera?: string | null }} args
 */
export function armarVentaGN({ filas, pagos, modoLocal, integrationId, fecha, email = null, cajera = null }) {
  exigir(modoLocal && modoLocal.store_id && modoLocal.channel_id && modoLocal.client_id, 'Falta el modo Local');
  exigir(typeof integrationId === 'string' && integrationId.length > 0, 'Falta el integration_id');
  exigir(typeof fecha === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(fecha), 'Fecha inválida');
  exigir(Array.isArray(pagos) && pagos.length > 0, 'La venta no tiene pagos');
  pagos.forEach((p, i) => exigir(Number.isFinite(p.monto) && p.monto > 0 && Number(p.cuenta) > 0, `Pago ${i + 1} inválido`));
  const unidades = filas.flatMap(r => Array.from({ length: r.cantidad }, () => r));
  const aC = (/** @type {number} */ n) => Math.round(n * 100);
  const totalC = pagos.reduce((s, p) => s + aC(p.monto), 0);
  const precioC = unidades.map(r => aC(r.precio));
  const listaC = precioC.reduce((s, x) => s + x, 0);
  // Redondeo para arriba sin descuento: lo que pasa la lista se suma al precio (GN ⛔ acepta descuento < 0).
  const extraC = totalC > listaC ? repartir(totalC - listaC, precioC, precioC.map(() => Infinity)) : precioC.map(() => 0);
  const unitC = precioC.map((p, i) => p + extraC[i]);
  const descuentoC = unitC.reduce((s, x) => s + x, 0) - totalC;
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
    // ⛔ `tn_order`: el sync de TN lo lee para dar una orden por «ya está en GN» (lib/sync-tn/core.ts).
    comments: notaGN({ integrationId, email, cajera }),
    items: unidades.map((r, i) => ({
      product_id: r.product_id,
      size_id: r.size_id,
      quantity: 1,
      unit_price: unitC[i] / 100,
      discount: 0,
      store_id: modoLocal.store_id,
    })),
    discount_amount: descuentoC / 100,
    payments: pagos.map(p => ({ amount: p.monto, account_id: Number(p.cuenta), date_payment: fecha, description: '' })),
  };
}
