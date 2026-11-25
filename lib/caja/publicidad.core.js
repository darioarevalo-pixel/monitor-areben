/**
 * «Publicidad» en el POS (Bruno, 25-nov): la MISMA venta, con la persona (nombre, DNI o @instagram) y lo que tiene a favor, que se
 * descuenta del total. Si se lleva más, se cobra la diferencia como en una venta (con el % de la forma de pago). Si se lleva menos,
 * **lo que sobra le queda a favor** y «luego organiza con quien acordo el monto».
 * ⛔ «Canje»: «una sesion de fotos que te pago en ropa no es canje».
 *
 * 🔑 Cómo queda (Bruno, 25-nov, eligió las opciones):
 * - Lo a favor ES el descuento a la venta en pesos (`descuentoVenta`, el MISMO camino de `cobro()` y del ERP), pero ⛔ cuenta como
 *   descuento a mano: `caja_venta.a_mano.venta` queda en 0 y la persona y la plata van en `a_mano.publicidad` (el turno ⛔ lo suma
 *   como descuento a mano; ⛔ migración: `a_mano` ya es jsonb). Al ERP va en `detalle.publicidad` («Publicidad · persona»).
 * - Lo que sobra queda en la venta y en la lista «Publicidad con saldo» de la pestaña Caja (⛔ cuenta de la clienta).
 * - Persona y monto A MANO; lo automático con Canjes es otra tanda. Reemplaza al descuento a mano a la venta y a la promo de compra.
 *
 * JS plano: lo importan `api/_caja.js` y la pantalla.
 */

import { cobro, subtotal } from './core.core.js';

export const MAX_PERSONA = 80;
/** Tope del monto a favor: el mismo de un movimiento de la Caja. */
export const MAX_A_FAVOR = 50_000_000;

const centavos = (n) => Math.round(n * 100) / 100;

/**
 * La publicidad que manda la pantalla, limpia; `null` si ⛔ hay. Tira con el porqué si viene a medias.
 * @param {any} x @returns {{ persona: string, aFavor: number } | null}
 */
export function limpiarPublicidad(x) {
  if (x == null) return null;
  if (typeof x !== 'object') throw new Error('La publicidad no es válida.');
  const persona = typeof x.persona === 'string' ? x.persona.trim().replace(/\s+/g, ' ') : '';
  if (persona.length < 2) throw new Error('Falta la persona de la publicidad: nombre, DNI o @instagram.');
  if (persona.length > MAX_PERSONA) throw new Error(`La persona de la publicidad tiene más de ${MAX_PERSONA} letras.`);
  const aFavor = Number(x.aFavor);
  if (!(Number.isFinite(aFavor) && aFavor > 0)) throw new Error('Falta cuánto tiene a favor.');
  if (aFavor > MAX_A_FAVOR) throw new Error('El monto a favor no es válido.');
  return { persona, aFavor: centavos(aFavor) };
}

/**
 * El descuento a la venta que sale de lo a favor: en pesos, sobre TODA la venta (también la oferta: es plata a favor, ⛔ una promo),
 * cortado en el subtotal (`cobro()` ⛔ acepta un descuento que pase el total).
 * @param {{ aFavor: number }} p @param {number} sub el subtotal de las filas
 * @returns {{ tipo: 'pesos', valor: number }}
 */
export function descuentoDePublicidad(p, sub) {
  return { tipo: 'pesos', valor: centavos(Math.max(0, Math.min(p.aFavor, Number(sub) || 0))) };
}

/** ¿Lo a favor cubre toda la compra? Entonces el total da $0 y ⛔ hay forma de pago. */
export function cubreTodo(p, filas) {
  const sub = subtotal(filas);
  return sub > 0 && p.aFavor >= sub;
}

/**
 * El cobro de una venta con publicidad. Si se lleva más, la diferencia se cobra como en una venta: `cobro()` con lo a favor como
 * descuento a la venta. 🔑 Si lo a favor cubre todo, el total da $0 SIN pagos (`cobro()` ⛔ deja un pago en $0) y `pagos` tiene que
 * venir vacío: ⛔ se le cobra nada.
 * @param {{ filas: any[], pagos: any[], reglas: any, publicidad: { persona: string, aFavor: number } }} a
 */
export function cobroConPublicidad({ filas, pagos, reglas, publicidad }) {
  const sub = subtotal(filas);
  if (cubreTodo(publicidad, filas)) {
    if (Array.isArray(pagos) && pagos.length > 0) throw new Error('Lo que tiene a favor cubre toda la compra: no se cobra con ninguna forma de pago.');
    return { subtotal: sub, aVenta: sub, pagos: [], total: 0, descuentoVenta: sub };
  }
  return cobro({ filas, pagos, reglas, descuentoVenta: descuentoDePublicidad(publicidad, sub) });
}

/**
 * Lo que queda guardado: cuánto tenía, cuánto usó (lo que `cobro()` rebajó a la venta) y lo que sobra.
 * @param {{ persona: string, aFavor: number }} p @param {number} usado `c.aVenta`
 */
export function resumenDePublicidad(p, usado) {
  const u = centavos(Math.max(0, Math.min(p.aFavor, Number(usado) || 0)));
  return { persona: p.persona, a_favor: p.aFavor, usado: u, sobra: centavos(p.aFavor - u) };
}

/**
 * Las ventas con publicidad a las que les SOBRÓ algo, de la más nueva a la más vieja: la lista «Publicidad con saldo».
 * Una anulada o descartada ⛔ cuenta (⛔ se usó nada).
 * @param {any[]} ventas filas de `caja_venta` con `a_mano`
 */
export function conSaldo(ventas) {
  return (ventas || [])
    .filter((v) => v && v.a_mano && v.a_mano.publicidad && Number(v.a_mano.publicidad.sobra) > 0)
    .filter((v) => !v.anulada && !['cancelada', 'descartada'].includes(v.estado))
    .sort((a, b) => String(b.creada_en).localeCompare(String(a.creada_en)));
}
