/**
 * El cruce diario de la sombra de TN: cada orden contra la venta que GN tiene de ella. Puro.
 *
 * Qué venta de GN es de qué orden (en la base de la tienda): la que tiene `tn_order` = número (o, si GN
 * guardó lo que mandó el sync de Stunned, `integration_source = 'monitor-sync-tn'` + `integration_id`).
 * 🔴 Zattia y Stunned comparten la cuenta de GN y el `tn_order` ⛔ dice de qué tienda es; y GN ⛔ guarda el
 * `integration_source` del sync (medido 12-oct: 0 ventas con esa marca desde sep, y #117–#119 de Stunned
 * con `tn_order` pelado). ⇒ una venta es de la tienda que TIENE ese número de orden (`numerosOtra` = los de
 * la otra tienda de la misma base). Hoy no chocan (Stunned ~119, Zattia ~7.200); si un día chocan, la venta
 * cuenta para las dos y el cruce lo muestra como prendas distintas, ⛔ callado.
 *
 * Las prendas se comparan por VARIANTE de GN: la de GN ya la trae; la línea de TN se resuelve por código de
 * barras y, si no, por SKU. 🔴 El SKU ⛔ es único en GN (12-oct: 16 SKUs compartidos en Zattia —45 variantes—,
 * 30 en BDI —268—; ej. corpiño y bombacha Tayra con el mismo) ⇒ el barcode va primero. Una línea de TN que no
 * se resuelve se cuenta aparte (`sin_variante`).
 *
 * Clases por orden:
 *   ok                  paga, con venta en GN y las mismas prendas
 *   sin_venta           paga y sin venta en GN
 *   prendas_distintas   paga, con venta, pero otras prendas o cantidades
 *   cancelada_con_venta cancelada (o devuelta) en TN y con la venta todavía activa en GN
 *   pendiente           todavía sin pagar (transferencia, efectivo) y sin venta: se informa, ⛔ se juzga
 *   pendiente_con_venta sin pagar y GN ya tiene la venta (¿la integración importa antes del pago?): se informa
 *   cancelada           cancelada sin venta: está bien
 *   varias_ventas       más de una venta de GN para la misma orden
 * Y aparte: ventas de GN con número de orden que la sombra ⛔ tiene (`venta_sin_orden`).
 */

import { DEVUELTA, PAGADA } from '../venta/pago-tn.mjs'

// La regla vive en `lib/venta/pago-tn.mjs` (la trae el monitor); acá se re-exporta para el resto de `lib/tn`.
export { DEVUELTA, PAGADA }

const norm = (s) => (s ? String(s).trim().toUpperCase() : null)
/** La clave de un número de orden: sin ceros adelante y sin pasar por Number (un pack de ML tiene 16 dígitos). */
export const claveNumero = (n) => { const t = String(n ?? '').trim(); return /^\d+$/.test(t) ? String(BigInt(t)) : t }

/** Las ventas de GN que pertenecen a una tienda, por número de orden. */
export function ventasPorOrden(tienda, ventas, { numerosPropios = null, numerosOtra = null } = {}) {
  const por = new Map()
  for (const v of ventas) {
    const delSync = v.integration_source === 'monitor-sync-tn'
    if (delSync && tienda !== 'stunned') continue
    const numero = delSync ? v.integration_id : v.tn_order
    if (numero == null || numero === '') continue
    const k = claveNumero(numero)
    if (!delSync && numerosOtra?.has(k) && !numerosPropios?.has(k)) continue
    if (!por.has(k)) por.set(k, [])
    por.get(k).push(v)
  }
  return por
}

function sumarPorVariante(lineas, varianteDe) {
  const m = new Map()
  let sinVariante = 0
  for (const l of lineas) {
    const v = varianteDe(l)
    const n = Number(l.cantidad ?? l.quantity) || 0
    if (!v) { sinVariante += n; continue }
    const k = v.sku ? `${v.sku} (${v.product_id}:${v.size_id})` : `${v.product_id}:${v.size_id}`
    m.set(k, (m.get(k) || 0) + n)
  }
  return { m, sinVariante }
}

/** La variante de GN de una línea de TN: por código de barras y, si no, por SKU. */
export const varianteDeLineaTN = (indice) => (l) => indice.porBarcode?.(l.barcode) ?? indice.porSku?.(norm(l.sku)) ?? null

const igual = (a, b) => a.size === b.size && [...a].every(([k, v]) => b.get(k) === v)

/**
 * @param {object} p
 * @param {'bdi'|'zattia'|'stunned'} p.tienda
 * @param {Array} p.ordenes   filas de tn_orden (con `lineas`: sus filas de tn_orden_linea)
 * @param {Array} p.ventas    filas del espejo `ventas` (id, tn_order, integration_id, integration_source, date_sale)
 * @param {Map<number,Array>} p.detalles  venta id → filas de venta_detalles (product_id, size_id, quantity)
 * @param {object} p.indice   indiceDeVariantes del inventario (para traducir la variante de GN a sku)
 * @param {Set<string>} [p.numerosConocidos]  todos los números que la sombra tiene de esa tienda (para `venta_sin_orden`)
 * @param {Set<string>} [p.numerosOtra]  los de la otra tienda de la misma base (Zattia ↔ Stunned)
 * @param {Map<string,Array>} [p.porOrden]  ventas ya agrupadas por número (otra fuente que TN: Mercado Libre)
 * @param {string} [p.sinOrdenDesde]  `venta_sin_orden` sólo cuenta ventas con `date_sale` posterior a este día: las del
 *   borde de la ventana son de órdenes anteriores a ella. Stunned ⛔ lo informa (en su base lo informa Zattia).
 */
export function cruzar({ tienda, ordenes, ventas, detalles, indice, numerosConocidos = null, numerosOtra = null, sinOrdenDesde = null, porOrden: agrupadas = null }) {
  const porOrden = agrupadas ?? ventasPorOrden(tienda, ventas, { numerosPropios: numerosConocidos, numerosOtra })
  const filas = []
  const clases = {}
  const contar = (c) => (clases[c] = (clases[c] || 0) + 1)

  for (const o of ordenes) {
    const vs = porOrden.get(claveNumero(o.numero)) ?? []
    const cancelada = o.status === 'cancelled' || DEVUELTA.has(o.payment_status)
    const pagada = !cancelada && PAGADA.has(o.payment_status)
    let clase
    let dif = null
    if (vs.length > 1) clase = 'varias_ventas'
    else if (cancelada) clase = vs.length ? 'cancelada_con_venta' : 'cancelada'
    else if (!pagada) clase = vs.length ? 'pendiente_con_venta' : 'pendiente'
    else if (!vs.length) clase = 'sin_venta'
    else {
      const tn = sumarPorVariante(o.lineas || [], varianteDeLineaTN(indice))
      const gn = sumarPorVariante(detalles.get(Number(vs[0].id)) ?? [], (d) => indice.variante(d.product_id, d.size_id) ?? { product_id: d.product_id, size_id: d.size_id, sku: null })
      if (igual(tn.m, gn.m) && !tn.sinVariante) clase = 'ok'
      else {
        clase = 'prendas_distintas'
        dif = { tn: Object.fromEntries(tn.m), gn: Object.fromEntries(gn.m), tn_sin_variante: tn.sinVariante }
      }
    }
    contar(clase)
    if (clase !== 'ok' && clase !== 'cancelada') {
      filas.push({ clase, numero: o.numero, payment_status: o.payment_status, status: o.status, gateway: o.gateway, creada_en: o.creada_en, ventas: vs.map((v) => Number(v.id)), dif })
    }
  }

  const sinOrden = []
  if (numerosConocidos && tienda !== 'stunned') {
    for (const [numero, vs] of porOrden) {
      if (numerosConocidos.has(numero)) continue
      for (const v of vs) if (!sinOrdenDesde || v.date_sale > sinOrdenDesde) sinOrden.push({ numero, venta: Number(v.id), date_sale: v.date_sale })
    }
  }
  return { clases, filas, venta_sin_orden: sinOrden }
}
