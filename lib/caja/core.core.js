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
    13015: Object.freeze({ nombre: 'Transferencia', descuento: 10 }),
    20595: Object.freeze({ nombre: 'Transferencia CG', descuento: 10 }),
    20196: Object.freeze({ nombre: 'Débito', descuento: 10 }),
    25172: Object.freeze({ nombre: 'Crédito 10% OFF', descuento: 10 }),
    25867: Object.freeze({ nombre: 'Feria - Efectivo', descuento: 0, efectivo: true }),
    25868: Object.freeze({ nombre: 'Feria - Transferencia', descuento: 0 }),
  }),
});

/**
 * @typedef {{ product_id: number, size_id: number, cantidad: number, precio: number, descuento?: number }} ItemCaja
 * @typedef {{ product_id: number, size_id: number, cantidad: number, precio: number, descuento: number, importe: number }} Fila
 * @typedef {{ nombre: string, descuento: number, efectivo?: boolean }} ReglaCuenta
 * @typedef {{ redondeo: number, cuentas: Record<number, ReglaCuenta> }} Reglas
 * @typedef {{ cuenta: number, base?: number }} PagoPedido
 * @typedef {{ cuenta: number, base: number, porcentaje: number, descuento: number, redondeo: number, monto: number }} Pago
 * @typedef {{ client_id: number, channel_id: number, sale_type_id: number, sale_state_id: number, currency_id: number, store_id: number }} ModoLocal
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

/**
 * La regla de una cuenta. Sin `reglas`, con una cuenta que no está, o con un RECARGO (descuento
 * negativo: GN ⛔ lo acepta por la API), es un error.
 * @param {number} cuenta @param {Reglas} reglas @returns {ReglaCuenta}
 */
export function reglaDeCuenta(cuenta, reglas) {
  exigir(reglas && reglas.cuentas, 'Faltan las reglas de la caja');
  const regla = reglas.cuentas[cuenta];
  exigir(regla && Number.isFinite(regla.descuento), `La cuenta ${cuenta} no tiene regla de cobro`);
  exigir(regla.descuento >= 0, `La cuenta ${regla.nombre || cuenta} tiene recargo: la caja ⛔ cobra con recargo`);
  exigir(regla.descuento <= 100, `La cuenta ${regla.nombre || cuenta}: descuento inválido`);
  return regla;
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
 * Devuelve los pagos con su `monto` y los totales de la venta: `descuentoVenta` = subtotal − total
 * (lo que se ahorra sobre los renglones; negativo si el redondeo sube). Es para mostrar: a GN va
 * repartido por `armarVentaGN`.
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
  const total = centavos(detalle.reduce((s, p) => s + p.monto, 0));
  return { subtotal: sub, pagos: detalle, total, descuentoVenta: centavos(sub - total) };
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
  const netoC = unidades.map(r => aC(r.precio * (1 - r.descuento / 100)));
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
