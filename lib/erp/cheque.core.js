/**
 * Los CHEQUES RECIBIDOS en la pantalla (motor `cuenta/cheque.mjs`, sql/079; Bruno 10-nov). Puro: lo usan los tres «Cobrar»
 * (ERP › Clientes, ficha de venta y panel de WhatsApp) y ERP › Ventas › Cobros › Cheques.
 *
 * 🔑 Recibir un cheque es «Cobrar» con la cuenta «Cheque»: baja la deuda al recibirlo y queda EN CARTERA. La cuenta real se elige
 *    al DEPOSITARLO. Si rebota (Rechazado), la deuda vuelve sola.
 * 🔴 Lo cargan SÓLO los admin («los cargan los admin, administración no usa cheques»): a los demás la cuenta «Cheque» ⛔ se les muestra,
 *    y el servidor lo vuelve a chequear.
 * ⛔ endoso (Bruno, 10-nov: «más adelante»).
 */

/** Las palabras de la pantalla (`docs/VOCABULARIO.md` §5). */
export const NOMBRE_ESTADO_CHEQUE = { en_cartera: 'En cartera', depositado: 'Depositado', acreditado: 'Acreditado', rechazado: 'Rechazado', anulado: 'Anulado' }
export const ORDEN_ESTADOS_CHEQUE = ['en_cartera', 'depositado', 'acreditado', 'rechazado', 'anulado']
export const NOMBRE_TIPO_CHEQUE = { fisico: 'Físico', echeq: 'eCheq' }

/** @param {{ medio?: string } | null | undefined} c */
export const esCuentaCheque = (c) => c?.medio === 'cheque'

/**
 * Las cuentas para elegir en «Cobrar»: la de «Cheque» sólo para un admin.
 * @template {{ medio?: string }} T @param {T[]} cuentas @param {boolean} admin @returns {T[]}
 */
export const cuentasParaCobrar = (cuentas, admin) => (admin ? cuentas : cuentas.filter((c) => !esCuentaCheque(c)))

export const chequeVacio = () => ({ tipo: 'fisico', numero: '', banco: '', librador: '', librador_cuit: '', vence_el: '' })

/**
 * Qué le falta al cheque para poder registrarlo, o null. La misma vara que el motor (`validarCheque`), dicha antes de mandar.
 * @param {{ tipo: string, numero: string, banco: string, librador: string, librador_cuit?: string, vence_el: string }} ch
 */
export function faltaDelCheque(ch) {
  if (!ch) return 'Faltan los datos del cheque.'
  if (!String(ch.numero ?? '').replace(/[\s.\-_/]/g, '')) return 'Escribí el número del cheque.'
  if (!String(ch.banco ?? '').trim()) return 'Escribí el banco del cheque.'
  if (!String(ch.librador ?? '').trim()) return 'Escribí quién firma el cheque.'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(ch.vence_el ?? ''))) return 'Elegí la fecha de pago del cheque.'
  const cuit = String(ch.librador_cuit ?? '').replace(/\D/g, '')
  if (cuit && cuit.length !== 11) return 'El CUIT de quien firma tiene 11 números.'
  return null
}

/** Lo que viaja al servidor (sin vacíos). */
export function chequeParaMandar(ch) {
  const cuit = String(ch.librador_cuit ?? '').replace(/\D/g, '')
  return { tipo: ch.tipo === 'echeq' ? 'echeq' : 'fisico', numero: String(ch.numero).trim(), banco: String(ch.banco).trim(), librador: String(ch.librador).trim(), vence_el: ch.vence_el, ...(cuit ? { librador_cuit: cuit } : {}) }
}

/**
 * Lo que se puede hacer con un cheque hoy (los botones de la fila). Depositar desde su fecha de pago (antes el banco ⛔ lo toma).
 * @param {{ estado: string, vence_el: string }} c @param {string} hoy AAAA-MM-DD
 * @returns {{ depositar: boolean, depositarDesde: string | null, acreditar: boolean, rechazar: boolean }}
 */
export function accionesDeCheque(c, hoy) {
  const enCartera = c.estado === 'en_cartera'
  return {
    depositar: enCartera && c.vence_el <= hoy,
    depositarDesde: enCartera && c.vence_el > hoy ? c.vence_el : null,
    acreditar: c.estado === 'depositado',
    rechazar: enCartera || c.estado === 'depositado',
  }
}

/** Días hasta la fecha de pago (negativo = ya pasó). */
export function diasHasta(dia, hoy) {
  return Math.round((Date.parse(`${dia}T12:00:00Z`) - Date.parse(`${hoy}T12:00:00Z`)) / 86400e3)
}

/**
 * Filtra y ordena la cartera: por estado (null = todos), por texto (número, banco, librador, cliente). Primero lo que vence antes.
 * @param {any[]} cheques @param {{ estado?: string | null, q?: string }} f
 */
export function filtrarCheques(cheques, { estado = null, q = '' } = {}) {
  const t = String(q).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
  const normal = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  return cheques
    .filter((c) => !estado || c.estado === estado)
    .filter((c) => !t || [c.numero, c.banco, c.librador, c.cliente].some((x) => normal(x).includes(t)))
    .sort((a, b) => (a.vence_el < b.vence_el ? -1 : a.vence_el > b.vence_el ? 1 : String(a.id) < String(b.id) ? -1 : 1))
}
