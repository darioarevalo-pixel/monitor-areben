/**
 * La NOTA de una venta importada de Tienda Nube a Gestión Nube.
 *
 * ⚠️ **Está en JS plano, y no por gusto**: la escribe `api/crear-venta.js` (que corre en Node sin
 * pasar por el compilador de Next y no puede importar TypeScript) y la MUESTRA el dry-run de
 * `components/integraciones/Integraciones.tsx`. Si fueran dos implementaciones, la pantalla te
 * prometería una nota y GN guardaría otra — y la nota es justamente lo que uno mira antes de
 * apretar. Mismo motivo que `lib/permisos.core.js`.
 *
 * # Por qué existe esta nota
 *
 * Todas las ventas online de Stunned se atribuyen al MISMO cliente genérico de GN
 * (`TN_IMPORT_CLIENT`), porque el sync no da de alta un cliente por comprador. Entonces
 * `client_name` dice siempre lo mismo y esta nota es el ÚNICO lugar donde sobreviven quién compró,
 * cuándo, por cuánto y con qué.
 *
 * # Por qué este formato
 *
 * Lo copia de la integración NATIVA de Tienda Nube en GN, que escribe
 *   "De Tienda Nube. #Orden: 20893 | Punto de entrega: …"
 * así en la pantalla de Gestión Nube las importadas por el Monitor se leen igual que las nativas.
 * Quien necesite distinguirlas tiene `integration_source: 'monitor-sync-tn'`, que la nativa deja
 * en null.
 */

/**
 * Tienda Nube nombra la forma de pago en inglés y con guión bajo (`wire_transfer`). La nota la lee
 * una persona en la pantalla de Gestión Nube, así que se traduce.
 *
 * 🔑 Lo que NO está en la tabla pasa TAL CUAL, en vez de caer en un "Otro" que borra el dato: TN
 * suma medios de pago cuando quiere, y es mejor una nota que dice `mobbex` que una que no dice nada.
 */
const PAGO_EN_CRIOLLO = {
  wire_transfer: 'Transferencia',
  credit_card: 'Tarjeta de crédito',
  debit_card: 'Tarjeta de débito',
  cash: 'Efectivo',
  ticket: 'Efectivo (cupón de pago)',
  boleto: 'Efectivo (cupón de pago)',
  cod: 'Contra entrega',
  pix: 'Pix',
  wallet: 'Billetera virtual',
  mercadopago: 'Mercado Pago',
  mercado_pago: 'Mercado Pago',
  paypal: 'PayPal',
  offline: 'Pago acordado',
  other: 'Otro',
}

/** @param {unknown} v */
const pagoEnCriollo = (v) => {
  const s = String(v == null ? '' : v).trim()
  return PAGO_EN_CRIOLLO[s.toLowerCase()] || s
}

/** Aplasta espacios y saltos de línea, y recorta. Un nombre con un enter no puede partir la nota. */
export const recorte = (v, max) => {
  const s = String(v == null ? '' : v).replace(/\s+/g, ' ').trim()
  return s.length > max ? `${s.slice(0, max - 1)}…` : s
}

/**
 * @param {string|number} tnOrder Número de orden de TN. Es el dato que nunca falta.
 * @param {{cliente?: unknown, fecha_tn?: unknown, total_tn?: unknown, pago?: unknown}} d
 *
 * Los topes son POR CAMPO, y ese es el mecanismo que importa: no es sólo por el tope de `comments`
 * de GN (que no conocemos), es para que un nombre absurdo no se coma a los demás datos. El número
 * de orden va primero y con su propio tope, así que es lo último que se pierde. Con estos topes la
 * nota más larga posible da ~230 caracteres.
 */
export function notaTnImport(tnOrder, d) {
  const b = d || {}
  const total = Number(b.total_tn)
  return [
    `De Tienda Nube. #Orden: ${recorte(tnOrder, 20)}`,
    recorte(b.cliente, 80) && `Cliente: ${recorte(b.cliente, 80)}`,
    recorte(b.fecha_tn, 10) && `Fecha: ${recorte(b.fecha_tn, 10)}`,
    Number.isFinite(total) && total > 0 && `Total TN: ${Math.round(total).toLocaleString('es-AR')}`,
    recorte(pagoEnCriollo(b.pago), 40) && `Pago: ${recorte(pagoEnCriollo(b.pago), 40)}`,
  ]
    .filter(Boolean)
    .join(' | ')
}
