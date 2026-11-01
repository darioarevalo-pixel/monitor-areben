/**
 * Una orden de Mercado Libre (`GET /orders/search`) → filas de `ml_orden` y `ml_orden_linea`, y el armado
 * por PACK para el cruce. Puro. ⛔ Se guarda nada del comprador.
 *
 * 🔑 GN hace UNA venta por pack («Importado de MercadoLibre - Pack: N»); una orden suelta (sin carrito) ⛔ tiene
 * pack ⇒ su clave es el id de la orden (supuesto: se confirma en el primer cruce, cae en `sin_venta` si no).
 */
const plata = (v) => (v == null || v === '' ? null : Math.round(Number(v) * 100) / 100)
const instante = (v) => (v ? new Date(v).toISOString() : null)

export function filaDeOrdenML(o) {
  if (o?.id == null) throw new Error('orden de ML sin id')
  const pagos = o.payments || []
  return {
    orden_id: String(o.id),
    pack_id: o.pack_id != null ? String(o.pack_id) : null,
    creada_en: instante(o.date_created),
    actualizada_en: instante(o.last_updated || o.date_last_updated || o.date_created),
    cerrada_en: instante(o.date_closed),
    status: String(o.status || 'unknown'),
    pagos_status: pagos.length ? [...new Set(pagos.map((p) => p.status))].sort().join(',') : null,
    medio: pagos[0]?.payment_type ?? null,
    moneda: o.currency_id ?? null,
    total: plata(o.total_amount),
    pagado: plata(o.paid_amount),
    cancelacion: o.cancel_detail?.code ?? null,
    comision: comisionDeOrden(o),
  }
}

/** sql/068: lo que ML se queda de la orden (`sale_fee` es por unidad). Un renglón sin el dato ⇒ null, ⛔ un número que afirma de menos. */
function comisionDeOrden(o) {
  const items = o.order_items || []
  if (!items.length || items.some((it) => it.sale_fee == null)) return null
  return plata(items.reduce((s, it) => s + Number(it.sale_fee) * Number(it.quantity), 0))
}

/** El seller_sku de un ítem: en el ítem o, si la variación lo lleva como atributo, ahí. */
export function skuDeItem(it) {
  const item = it.item || {}
  if (item.seller_sku) return String(item.seller_sku).trim()
  const attr = (item.variation_attributes || []).find((a) => a.id === 'SELLER_SKU')
  return attr?.value_name ? String(attr.value_name).trim() : null
}

export function lineasDeOrdenML(o) {
  return (o.order_items || []).map((it, n) => ({
    orden_id: String(o.id),
    n,
    item_id: String(it.item?.id ?? ''),
    variation_id: it.item?.variation_id != null ? String(it.item.variation_id) : null,
    seller_sku: skuDeItem(it),
    titulo: it.item?.title ?? null,
    cantidad: Number(it.quantity) || 0,
    precio: plata(it.unit_price),
  }))
}

/** El número con el que GN la conoce: el pack o, sin pack, la orden. */
export const claveGN = (f) => String(f.pack_id ?? f.orden_id)

/**
 * Las órdenes agrupadas por pack, con la forma que espera `cruzar` (lib/tn/cruce.mjs): un pack es pago si
 * todas sus órdenes vivas están pagas, cancelado si todas están canceladas.
 */
export function packsParaCruce(ordenes) {
  const por = new Map()
  for (const o of ordenes) {
    const k = claveGN(o)
    if (!por.has(k)) por.set(k, [])
    por.get(k).push(o)
  }
  return [...por].map(([numero, os]) => {
    const vivas = os.filter((o) => o.status !== 'cancelled' && o.status !== 'invalid')
    const canceladas = !vivas.length
    const pagas = vivas.length && vivas.every((o) => o.status === 'paid' || o.status === 'partially_refunded')
    return {
      numero,
      status: canceladas ? 'cancelled' : 'open',
      payment_status: canceladas ? 'voided' : pagas ? 'paid' : 'pending',
      gateway: 'Mercado Libre',
      creada_en: os.map((o) => o.creada_en).sort()[0],
      lineas: vivas.flatMap((o) => (o.lineas || []).map((l) => ({ sku: l.seller_sku, cantidad: l.cantidad }))),
    }
  })
}
