/**
 * **Las formas de pago de CADA TIENDA** (V4, Bruno 12-oct): qué cuenta de Gestión Nube va detrás de cada
 * forma de pago, con qué %, las cuotas, las cuentas de la oferta y si la transferencia se verifica en
 * Mercado Pago. Antes estaban fijas en el código con los ids de Zattia; BDI arranca con las MISMAS
 * formas de pago, pero con SUS cuentas (es otra empresa en GN: otros ids).
 *
 * Es JS plano porque lo usan la pantalla («Formas de pago», sólo admin) y el handler (`formas-pago`),
 * que vuelve a validar todo contra las cuentas de GN de la tienda.
 *
 * El formulario es plano y en el idioma de la cajera; `reglas` es lo que lee el núcleo
 * (`cuentas`, `medios`, `titulares`, `verificarTransferencia`, `transferenciaFija`).
 */

/**
 * @typedef {{ cuenta: number | null, descuento: number }} Linea
 * @typedef {{
 *   efectivo: Linea, efectivoOferta: number | null,
 *   transferenciaAreben: number | null, transferenciaCG: number | null, transferenciaDescuento: number, transferenciaOferta: number | null,
 *   debito: Linea, credito: Linea, creditoPromo: Linea, seisCuotas: number | null, minSeisCuotas: number,
 *   tarjetaOferta: number | null, verificarTransferencia: boolean, transferenciaFija: number | null,
 * }} FormasDePago
 */

/** @param {unknown} cond @param {string} msg @returns {asserts cond} */
function exigir(cond, msg) {
  if (!cond) throw new Error(msg);
}

const id = (/** @type {unknown} */ x) => {
  const n = Number(x);
  return Number.isInteger(n) && n > 0 ? n : null;
};

/**
 * El formulario a partir de la configuración guardada.
 * @param {any} reglas @returns {FormasDePago}
 */
export function formasDePagoDe(reglas) {
  const m = (reglas && reglas.medios) || null;
  const c = (reglas && reglas.cuentas) || {};
  const pct = (/** @type {number | null} */ cuenta) => (cuenta != null && c[cuenta] && Number.isFinite(Number(c[cuenta].descuento)) ? Number(c[cuenta].descuento) : 0);
  const ops = m ? m.transferencia.opciones.map(Number) : [];
  const tit = (reglas && reglas.titulares) || {};
  const areben = id(tit.areben) ?? id(ops[0]);
  const cg = id(tit.dario) ?? id(ops.find((/** @type {number} */ o) => o !== areben));
  const efectivo = m ? id(m.efectivo.normal) : null;
  const debito = m ? id(m.debito.normal) : null;
  const credito = m ? id(m.credito.normal) : null;
  const promo = m ? id(m.credito.promo) : null;
  return {
    efectivo: { cuenta: efectivo, descuento: pct(efectivo) },
    efectivoOferta: m ? id(m.efectivo.feria) : null,
    transferenciaAreben: areben,
    transferenciaCG: cg,
    transferenciaDescuento: pct(areben ?? cg),
    transferenciaOferta: m ? id(m.transferencia.feria) : null,
    debito: { cuenta: debito, descuento: pct(debito) },
    credito: { cuenta: credito, descuento: pct(credito) },
    creditoPromo: { cuenta: promo, descuento: pct(promo) },
    seisCuotas: m ? id(m.credito.seisCuotas) : null,
    minSeisCuotas: m && Number.isFinite(Number(m.credito.minSeisCuotas)) ? Number(m.credito.minSeisCuotas) : 0,
    tarjetaOferta: m ? id(m.tarjetaOferta) : null,
    verificarTransferencia: !(reglas && reglas.verificarTransferencia === false),
    transferenciaFija: id(reglas && reglas.transferenciaFija),
  };
}

/**
 * Las reglas nuevas con el formulario aplicado. Valida TODO: ⛔ completa con defaults.
 * - Efectivo, débito, crédito y la promo de crédito son obligatorias; las de oferta y las 6 cuotas, opcionales.
 * - Al menos una cuenta de transferencia; las dos llevan el MISMO % (la «otra cuenta» las intercambia).
 * - Ninguna cuenta repetida: una cuenta es UNA forma de pago (`medioDeCuenta`).
 * - `cuentasGN` (las de la tienda en GN): cada cuenta tiene que existir allá; el nombre sale de ahí.
 * - Sin verificación en Mercado Pago, `transferenciaFija` dice a cuál van las transferencias.
 * Las cuentas que ya ⛔ se usan quedan en `reglas.cuentas` (el nombre de las ventas viejas).
 * @param {any} reglas la configuración guardada
 * @param {any} f el formulario
 * @param {Array<{ id: number, nombre: string }> | null} cuentasGN null ⇒ ⛔ se chequea contra GN (sólo la pantalla)
 */
export function aplicarFormasDePago(reglas, f, cuentasGN) {
  exigir(reglas && typeof reglas === 'object', 'Faltan las reglas de la caja');
  exigir(f && typeof f === 'object', 'Faltan las formas de pago');
  const nombres = new Map((cuentasGN || []).map((c) => [Number(c.id), String(c.nombre || '')]));
  const usadas = new Set();
  /** @param {unknown} x @param {string} que @param {boolean} obligatoria @returns {number | null} */
  const cuenta = (x, que, obligatoria) => {
    const n = id(x);
    if (n == null) {
      exigir(!obligatoria && (x == null || x === ''), `${que}: falta la cuenta de Gestión Nube`);
      return null;
    }
    exigir(!cuentasGN || nombres.has(n), `${que}: la cuenta ${n} no existe en Gestión Nube`);
    exigir(!usadas.has(n), `${que}: la cuenta ${nombres.get(n) || n} ya es de otra forma de pago`);
    usadas.add(n);
    return n;
  };
  /** @param {unknown} x @param {string} que */
  const porcentaje = (x, que) => {
    const n = Number(x);
    exigir(x !== '' && x != null && Number.isFinite(n) && n >= 0 && n <= 100, `${que}: el descuento va de 0 a 100 %`);
    return Math.round(n * 100) / 100;
  };
  const linea = (/** @type {any} */ l, /** @type {string} */ que) => {
    exigir(l && typeof l === 'object', `${que}: falta`);
    return { cuenta: /** @type {number} */ (cuenta(l.cuenta, que, true)), descuento: porcentaje(l.descuento, que) };
  };

  const efectivo = linea(f.efectivo, 'Efectivo');
  const efectivoOferta = cuenta(f.efectivoOferta, 'Efectivo en oferta', false);
  const areben = cuenta(f.transferenciaAreben, 'Transferencia a Areben Comercial', false);
  const cg = cuenta(f.transferenciaCG, 'Transferencia a Darío o Bruno', false);
  exigir(areben != null || cg != null, 'Transferencia: falta al menos una cuenta de Gestión Nube');
  const descTransf = porcentaje(f.transferenciaDescuento, 'Transferencia');
  const transferenciaOferta = cuenta(f.transferenciaOferta, 'Transferencia en oferta', false);
  const debito = linea(f.debito, 'Débito');
  const credito = linea(f.credito, 'Crédito');
  const promo = linea(f.creditoPromo, 'Crédito con promo bancaria');
  const seisCuotas = cuenta(f.seisCuotas, '6 cuotas sin interés', false);
  const minSeis = Number(f.minSeisCuotas);
  exigir(seisCuotas == null || (Number.isFinite(minSeis) && minSeis >= 0), '6 cuotas: falta el mínimo de compra');
  const tarjetaOferta = cuenta(f.tarjetaOferta, 'Tarjeta en oferta', false);
  exigir(typeof f.verificarTransferencia === 'boolean', 'Falta si la transferencia se verifica en Mercado Pago');
  const opciones = /** @type {number[]} */ ([areben, cg].filter((c) => c != null));
  // `transferenciaFija`: a dónde van sin verificar en MP, o mientras la tienda ⛔ tiene cuenta de MP conectada
  // (V4: BDI). Obligatoria sin verificación.
  let fija = id(f.transferenciaFija);
  exigir(fija == null || opciones.includes(fija), 'La cuenta de las transferencias sin Mercado Pago tiene que ser una de transferencia');
  if (!f.verificarTransferencia) {
    fija = fija ?? (opciones.length === 1 ? opciones[0] : null);
    exigir(fija != null, 'Sin verificar en Mercado Pago: elegí a qué cuenta van las transferencias');
  }

  const nombre = (/** @type {number} */ n, /** @type {string} */ porDefecto) => nombres.get(n) || (reglas.cuentas && reglas.cuentas[n] && reglas.cuentas[n].nombre) || porDefecto;
  /** @type {Record<number, any>} */
  const cuentas = { ...(reglas.cuentas || {}) };
  cuentas[efectivo.cuenta] = { nombre: nombre(efectivo.cuenta, 'Efectivo'), descuento: efectivo.descuento, efectivo: true };
  if (efectivoOferta != null) cuentas[efectivoOferta] = { nombre: nombre(efectivoOferta, 'Efectivo en oferta'), descuento: 0, efectivo: true };
  for (const t of opciones) cuentas[t] = { nombre: nombre(t, 'Transferencia'), descuento: descTransf };
  if (transferenciaOferta != null) cuentas[transferenciaOferta] = { nombre: nombre(transferenciaOferta, 'Transferencia en oferta'), descuento: 0 };
  cuentas[debito.cuenta] = { nombre: nombre(debito.cuenta, 'Débito'), descuento: debito.descuento };
  cuentas[credito.cuenta] = { nombre: nombre(credito.cuenta, 'Crédito'), descuento: credito.descuento };
  cuentas[promo.cuenta] = { nombre: nombre(promo.cuenta, 'Crédito promo'), descuento: promo.descuento };
  if (seisCuotas != null) cuentas[seisCuotas] = { nombre: nombre(seisCuotas, '6 cuotas sin interés'), descuento: 0 };
  // La de la tarjeta en oferta ⛔ lleva regla: su recargo sale de `reglas.oferta` (`reglaDeCuenta`).
  if (tarjetaOferta != null) delete cuentas[tarjetaOferta];

  const titulares = {};
  if (areben != null) Object.assign(titulares, { areben });
  if (cg != null) Object.assign(titulares, { dario: cg, bruno: cg });

  const medios = {
    efectivo: { normal: efectivo.cuenta, feria: efectivoOferta },
    transferencia: { opciones, feria: transferenciaOferta },
    debito: { normal: debito.cuenta },
    credito: { normal: credito.cuenta, promo: promo.cuenta, seisCuotas, minSeisCuotas: seisCuotas == null ? 0 : minSeis },
    tarjetaOferta,
  };
  // La oferta guardada que pide una cuenta que ya ⛔ está, se pasa a «con el %»: si no, la Caja ⛔ cobraría.
  const oferta = reglas.oferta ? { ...reglas.oferta } : null;
  if (oferta) {
    if (efectivoOferta == null && oferta.efectivo === 'final') oferta.efectivo = 'descuento';
    if (transferenciaOferta == null && oferta.transferencia === 'final') oferta.transferencia = 'descuento';
    if (tarjetaOferta == null && oferta.debito === 'recargo') oferta.debito = 'descuento';
    if (tarjetaOferta == null && oferta.credito === 'recargo') oferta.credito = 'descuento';
  }
  // `transferenciaPorMp` ⛔ puede mandar a una cuenta que ya ⛔ es de transferencia.
  const porMp = Object.fromEntries(Object.entries(reglas.transferenciaPorMp || {}).filter(([, g]) => opciones.includes(Number(g))));
  return {
    ...reglas,
    cuentas,
    medios,
    titulares,
    verificarTransferencia: f.verificarTransferencia,
    transferenciaFija: fija,
    transferenciaPorMp: porMp,
    ...(oferta ? { oferta } : {}),
  };
}
