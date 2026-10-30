/**
 * Una orden de Tienda Nube (`GET /orders`) → filas de `tn_orden` y `tn_orden_linea`. Puro.
 *
 * ⛔ Se guarda nada del cliente EN la orden: la sombra compara prendas y cobros. El comprador va a la FICHA de cliente del
 * ERP (sql/059, `compradorDeOrden` en comprador.mjs) y la orden sólo la apunta (`tn_orden.cliente_id`).
 */

import { DEVUELTA, PAGADA } from '../venta/pago-tn.mjs'

export const TIENDAS = {
  bdi: { store: 1096065, base: 'bdi', secret: 'TN_TOKEN_BDI' },
  zattia: { store: 4445369, base: 'zattia', secret: 'TN_TOKEN_ZATTIA' },
  stunned: { store: 7516263, base: 'zattia', secret: 'TN_TOKEN_STUNNED' },
}

/** TN manda los montos como texto ("12051.00"). */
const plata = (v) => (v == null || v === '' ? null : Math.round(Number(v) * 100) / 100)
const instante = (v) => (v ? new Date(v).toISOString() : null)
const texto = (v) => (v == null || v === '' ? null : String(v))

/**
 * @param {string} tienda @param {any} o  la orden de TN
 * @param {{ sinPagarAPreparar?: boolean }} [opciones]  el interruptor de la base (`interruptoresDe`): un pedido sin pagar entra como `a_preparar`
 */
export function filaDeOrden(tienda, o, opciones = {}) {
  if (!TIENDAS[tienda]) throw new Error(`tienda desconocida: ${tienda}`)
  if (o?.id == null || o.number == null) throw new Error('orden sin id o sin número')
  return {
    tienda,
    tn_id: Number(o.id),
    numero: Number(o.number),
    creada_en: instante(o.created_at),
    actualizada_en: instante(o.updated_at || o.created_at),
    pagada_en: instante(o.paid_at),
    cancelada_en: instante(o.cancelled_at),
    status: String(o.status || 'open'),
    payment_status: String(o.payment_status || 'pending'),
    shipping_status: texto(o.shipping_status),
    gateway: texto(o.gateway_name || o.gateway),
    medio: texto(o.payment_details?.method),
    moneda: texto(o.currency),
    subtotal: plata(o.subtotal),
    descuento: plata(o.discount),
    envio: plata(o.shipping_cost_customer),
    total: plata(o.total),
    cancel_reason: texto(o.cancel_reason),
    envio_estado: envioEstado(o),
    envio_tipo: texto(o.shipping_pickup_type),
    ubicacion: texto((o.fulfillments || [])[0]?.assigned_location?.name),
    estado: estadoPedido(o, opciones),
  }
}

/**
 * ESTADOS DEL PEDIDO (Bruno, 16-oct (34)). La escalera la mueve la app de logística (Ger) en TN, en
 * `fulfillments[].status`: UNPACKED → IN_PREPARATION → PACKED | READY_FOR_PICKUP → DISPATCHED | DELIVERED.
 * Medido (16-oct, `tn muestra`): esos 6 valores en BDI y Zattia. Un pedido con varios envíos vale lo que el MENOS avanzado.
 * Sin `fulfillments` (órdenes viejas), lo dice el `shipping_status` de siempre.
 */
export const ENVIO_ORDEN = ['UNPACKED', 'IN_PREPARATION', 'PACKED', 'READY_FOR_PICKUP', 'DISPATCHED', 'DELIVERED']
const DE_SHIPPING = { unpacked: 'UNPACKED', unshipped: 'PACKED', shipped: 'DISPATCHED', delivered: 'DELIVERED' }

export function envioEstado(o) {
  const fs = (o.fulfillments || []).map((f) => String(f.status || '').toUpperCase()).filter((x) => ENVIO_ORDEN.includes(x))
  if (fs.length) return fs.reduce((a, b) => (ENVIO_ORDEN.indexOf(b) < ENVIO_ORDEN.indexOf(a) ? b : a))
  return DE_SHIPPING[o.shipping_status] ?? null
}

/**
 * pedido (sin pago) → a_preparar (pagado) → en_preparacion → listo → cumplido: despachado | retirado | entregado.
 * 🔴 Los VERDES (cumplidos) son despachado, retirado y entregado: «entregado» ⛔ es un paso que alguien tenga que marcar
 * (Bruno: se acumularían). Lo empaquetado (`listo`) ⛔ cuenta en los conteos; lo pagado sin empaquetar SÍ (ver
 * `pedido_retenido`, sql/015). Un pedido de pago a convenir que ya se armó es `listo` aunque no esté pago (Zattia).
 */
export const ESTADOS_PEDIDO = ['pedido', 'a_preparar', 'en_preparacion', 'listo', 'despachado', 'retirado', 'entregado', 'cancelado']
export const CUMPLIDOS = new Set(['despachado', 'retirado', 'entregado'])

export function estadoPedido(o, { sinPagarAPreparar = false } = {}) {
  if (o.status === 'cancelled') return 'cancelado'
  const e = envioEstado(o)
  if (e === 'DELIVERED') return o.shipping_pickup_type === 'pickup' ? 'retirado' : 'entregado'
  if (e === 'DISPATCHED') return 'despachado'
  if (e === 'PACKED' || e === 'READY_FOR_PICKUP') return 'listo'
  if (e === 'IN_PREPARATION') return 'en_preparacion'
  if (PAGADA.has(o.payment_status)) return 'a_preparar'
  // Sin pagar y abierto (⛔ devuelto): con el interruptor de la base prendido se prepara igual (Darío, 26-oct: opción A).
  return sinPagarAPreparar && o.status === 'open' && !DEVUELTA.has(o.payment_status) ? 'a_preparar' : 'pedido'
}

export function lineasDeOrden(tienda, o) {
  return (o.products || []).map((p, i) => ({
    tienda,
    tn_id: Number(o.id),
    // Una línea sin id (no debería pasar) igual tiene que tener clave: su posición, en negativo.
    linea_id: p.id != null ? Number(p.id) : -(i + 1),
    product_id: p.product_id != null ? Number(p.product_id) : null,
    variant_id: p.variant_id != null ? Number(p.variant_id) : null,
    sku: texto(p.sku)?.trim() || null,
    barcode: texto(p.barcode)?.trim() || null,
    nombre: texto(p.name),
    cantidad: Number(p.quantity) || 0,
    precio: plata(p.price),
  }))
}

/** Hasta dónde se leyó: el `updated_at` más nuevo del lote (o el que ya estaba, si el lote vino vacío). */
export function leidoHasta(ordenes, anterior = null) {
  let max = anterior ? new Date(anterior).getTime() : null
  for (const o of ordenes) {
    const t = new Date(o.updated_at || o.created_at).getTime()
    if (Number.isFinite(t) && (max == null || t > max)) max = t
  }
  return max == null ? null : new Date(max).toISOString()
}
