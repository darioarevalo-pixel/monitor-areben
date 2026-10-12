/**
 * **La transferencia que fue a OTRA cuenta nuestra** (Bruno, 12-oct, segunda tanda del POS).
 *
 * La clienta transfirió, pero ⛔ a la cuenta de MP que mira la Caja: a la de Areben Comercial, la de
 * Darío o la de Bruno. El cruce ⛔ la ve nunca. La cajera elige el titular y escribe el banco, la venta
 * se confirma YA (sale a GN con el ticket) y Darío y Bruno reciben un mail para verificar que entró.
 *
 * 🔑 La cuenta de GN la decide el TITULAR, ⛔ la cuenta de MP en uso (Bruno, 12-oct): Darío o Bruno ⇒
 * «Transferencia CG» (20595); Areben Comercial ⇒ «Transferencia» (13015). La parte de oferta (25868) ⛔
 * cambia: es la cuenta de la OFERTA, ⛔ de un titular.
 */

/** @typedef {{ id: 'areben' | 'dario' | 'bruno', nombre: string, cuenta: number }} Titular */

/** @type {readonly Titular[]} */
export const TITULARES = Object.freeze([
  Object.freeze({ id: 'areben', nombre: 'Areben Comercial', cuenta: 13015 }),
  Object.freeze({ id: 'dario', nombre: 'Darío Arévalo', cuenta: 20595 }),
  Object.freeze({ id: 'bruno', nombre: 'Bruno Arévalo', cuenta: 20595 }),
]);

/** @param {unknown} id @returns {Titular | null} */
export const titularDe = (id) => TITULARES.find((t) => t.id === id) || null;

/**
 * Los pagos y el pedido a GN con las transferencias pasadas a la cuenta del titular. Sólo las cuentas de
 * transferencia «normales» (`medios.transferencia.opciones`); el resto queda igual. El `payload` se
 * congela al confirmar la venta, por eso se rearma acá: `payments[i]` es el pago `i`.
 * 🔴 Las dos cuentas tienen el MISMO descuento ⇒ el monto ⛔ cambia; si un día difieren, esto tira.
 * @param {{ pagos: Array<{ cuenta: number, monto: number, nombre?: string }>, payload: { payments: Array<{ account_id: number, amount: number }> } & Record<string, unknown>, titular: Titular, reglas: { medios?: { transferencia: { opciones: readonly number[] } }, cuentas: Record<number, { descuento: number }> } }} args
 */
export function aOtraCuenta({ pagos, payload, titular, reglas }) {
  const opciones = reglas && reglas.medios && reglas.medios.transferencia.opciones;
  if (!opciones || !opciones.includes(titular.cuenta)) throw new Error(`La cuenta ${titular.cuenta} no es de transferencias.`);
  if (!payload || !Array.isArray(payload.payments) || payload.payments.length !== pagos.length) throw new Error('La venta no tiene el pedido a Gestión Nube armado.');
  const cambia = (/** @type {number} */ c) => opciones.includes(Number(c)) && Number(c) !== titular.cuenta;
  for (const p of pagos) {
    if (cambia(p.cuenta)) {
      const antes = reglas.cuentas[p.cuenta], despues = reglas.cuentas[titular.cuenta];
      if (!antes || !despues || antes.descuento !== despues.descuento) throw new Error('Las cuentas de transferencia tienen descuentos distintos: confirmala a mano desde la Caja.');
    }
  }
  return {
    pagos: pagos.map((p) => (cambia(p.cuenta) ? { ...p, cuenta: titular.cuenta } : p)),
    payload: {
      ...payload,
      payments: payload.payments.map((x, i) => (cambia(pagos[i].cuenta) ? { ...x, account_id: titular.cuenta } : x)),
    },
  };
}

const pesos = (/** @type {number} */ n) => `$${Number(n).toLocaleString('es-AR')}`;
const esc = (/** @type {unknown} */ s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] || c);

/**
 * El mail a Darío y Bruno: qué venta, cuánto, a qué cuenta dicen que transfirió, y que lo verifiquen.
 * @param {{ venta: { id: string, total: number, espera_monto?: number | null, gn_number?: number | null, creada_en: string, renglones?: Array<{ nombre?: string | null, talle?: string | null, cantidad: number }> }, titular: Titular, banco: string, por: string | null }} args
 * @returns {{ asunto: string, texto: string, html: string }}
 */
export function mailOtraCuenta({ venta, titular, banco, por }) {
  const numero = venta.gn_number ? `#${venta.gn_number}` : `provisoria ${String(venta.id).replace(/-/g, '').slice(0, 8).toUpperCase()}`;
  const monto = Number(venta.espera_monto || venta.total);
  const hora = new Date(venta.creada_en).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  const prendas = (venta.renglones || []).map((r) => `${r.cantidad} × ${r.nombre || 'Prenda'}${r.talle ? ` (${r.talle})` : ''}`);
  const asunto = `Caja: transferencia de ${pesos(monto)} a la cuenta de ${titular.nombre} — verificar`;
  const lineas = [
    `En la Caja se confirmó la venta ${numero} con una transferencia de ${pesos(monto)} que, según la clienta, fue a otra cuenta nuestra.`,
    '',
    `Titular: ${titular.nombre}`,
    `Banco: ${banco}`,
    `Venta: ${numero} · ${hora} · total ${pesos(venta.total)}`,
    `Confirmó: ${por || 'sin nombre'}`,
    '',
    'Prendas:',
    ...prendas.map((p) => `· ${p}`),
    '',
    'Verificá que la transferencia entró en esa cuenta. Si no entró, hay que hablar con la cajera: la venta ya está en Gestión Nube.',
  ];
  const html = `<p>En la Caja se confirmó la venta <b>${esc(numero)}</b> con una transferencia de <b>${esc(pesos(monto))}</b> que, según la clienta, fue a <b>otra cuenta nuestra</b>.</p>`
    + `<table cellpadding="4"><tr><td>Titular</td><td><b>${esc(titular.nombre)}</b></td></tr><tr><td>Banco</td><td><b>${esc(banco)}</b></td></tr>`
    + `<tr><td>Venta</td><td>${esc(numero)} · ${esc(hora)} · total ${esc(pesos(venta.total))}</td></tr><tr><td>Confirmó</td><td>${esc(por || 'sin nombre')}</td></tr></table>`
    + `<p>Prendas:</p><ul>${prendas.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>`
    + '<p><b>Verificá que la transferencia entró en esa cuenta.</b> Si no entró, hay que hablar con la cajera: la venta ya está en Gestión Nube.</p>';
  return { asunto, texto: lineas.join('\n'), html };
}
