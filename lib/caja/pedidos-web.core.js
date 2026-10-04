// Caja — los pedidos web de Zattia que todavía ⛔ se armaron (plan v2, W1, 4-oct-2026). Dos usos:
// el contador «N pedidos web sin armar» de la Caja, y el aviso en el renglón cuando la cajera escanea
// una prenda que está en uno de esos pedidos.
//
// 🔑 «SIN ARMAR» = `envio_estado === 'unpacked'` (el `shipping_status` de TN) y ⛔ cancelada.
// Pagada o SIN PAGAR («a convenir»: retira y paga en el local), marcada aparte (Bruno, 4-oct). Las sin
// pagar también son una venta de GN desde el Local (medido: 7 de 7 el 4-oct) ⇒ también descuentan stock.
// Medido el 4-oct sobre 200 órdenes de 10 días: «pagada + abierta» daba 34, pero 28 de esas ya estaban
// EMPAQUETADAS (`unshipped`: esperan el retiro o el cadete) ⇒ sus prendas ya ⛔ están en la percha.
// `unpacked` daba 6, que es lo que muestra TN como «por empaquetar». ⛔ `estado_orden`: el local cierra
// la orden cuando la empaqueta, pero hay empaquetadas abiertas.
//
// 🔑 EL STOCK DEL LOCAL YA DESCONTÓ EL PEDIDO WEB. Cada orden de TN entra a GN como una venta del store
// «Local» (medido el 4-oct: 4 de 4 pedidos sin armar tenían su venta, toda del Local) ⇒ el «quedan N
// en el local» de la Caja ya es lo LIBRE. El peligro es cuando lo libre ⛔ alcanza: la prenda de la
// percha es la del pedido, y si se vende el pedido queda sin stock. La Caja ⛔ frena (Bruno, 4-oct:
// gana el local, el pedido se resuelve con cambio o devolución): avisa.
//
// 🔑 EL CRUCE ES POR SKU DE VARIANTE: TN y GN usan el mismo (`RCT-0002-VE-S`, medido). Las líneas sin
// SKU ⛔ se pueden cruzar ⇒ se cuentan y se dicen, ⛔ se esconden.

/** La clave del cruce: el SKU de la variante, sin espacios y en mayúsculas. Vacío si ⛔ hay. */
export const claveSku = (sku) => String(sku ?? '').trim().toUpperCase()

/** ¿La orden (`mapOrdenTN` de tiendanube-audit) está pagada o sin pagar, y todavía por empaquetar? */
export function estaSinArmar(o) {
  if (!o || o.cancelada || o.estado_orden === 'cancelled') return false
  return (o.estado_pago === 'paid' || o.estado_pago === 'pending') && o.envio_estado === 'unpacked'
}

/**
 * Los pedidos sin armar, del más viejo al más nuevo (el más viejo es el más urgente), con las horas
 * que lleva cada uno desde que se pagó. `ahoraMs` es obligatorio: ⛔ `Date.now()` adentro.
 */
export function pedidosSinArmar(ordenes, ahoraMs) {
  if (!Number.isFinite(ahoraMs)) throw new Error('pedidosSinArmar: falta ahoraMs')
  const pedidos = []
  for (const o of ordenes || []) {
    if (!estaSinArmar(o)) continue
    const desde = o.pagado_en || o.fecha
    const t = Date.parse(desde)
    const prendas = (o.products || []).map((p) => ({
      sku: claveSku(p.sku),
      nombre: String(p.name || ''),
      cantidad: Math.max(1, Number(p.quantity) || 1),
      product_id: p.product_id ?? null,
      variant_id: p.variant_id ?? null,
    }))
    pedidos.push({
      numero: Number(o.number),
      sinPagar: o.estado_pago !== 'paid',
      desde: desde || null,
      horas: Number.isFinite(t) ? Math.max(0, Math.floor((ahoraMs - t) / 3_600_000)) : null,
      envioTipo: o.envio_tipo || null,
      envio: o.envio || null,
      prendas,
      sinSku: prendas.filter((p) => !p.sku).length,
    })
  }
  return pedidos.sort((a, b) => (Date.parse(a.desde) || 0) - (Date.parse(b.desde) || 0))
}

/**
 * `{ SKU: [{ numero, cantidad, sinPagar }] }` — qué pedidos sin armar llevan cada variante.
 * @returns {Record<string, Array<{ numero: number, cantidad: number, sinPagar: boolean }>>}
 */
export function indicePorSku(pedidos) {
  /** @type {Record<string, Array<{ numero: number, cantidad: number, sinPagar: boolean }>>} */
  const por = {}
  for (const p of pedidos || []) {
    for (const x of p.prendas) {
      if (!x.sku) continue
      const lista = (por[x.sku] ||= [])
      const ya = lista.find((y) => y.numero === p.numero)
      if (ya) ya.cantidad += x.cantidad
      else lista.push({ numero: p.numero, cantidad: x.cantidad, sinPagar: !!p.sinPagar })
    }
  }
  return por
}

/**
 * El aviso del renglón. `local` es el stock del Local que ve la Caja (YA sin lo comprado online),
 * `deposito` el del Depósito de GN («para reponer», que el pedido web ⛔ tocó) y `enCarrito` cuántas
 * de esta variante lleva la venta. Todos obligatorios.
 *   · null ⇒ la variante ⛔ está en ningún pedido sin armar.
 *   · `separada` ⇒ está en un pedido, pero lo libre del Local alcanza: «armá el pedido».
 *   · `reponer` ⇒ el Local ⛔ alcanza pero el Depósito sí: el pedido se arma trayendo N de allá
 *     (Bruno, 4-oct: «si hay 2 para reponer se va a poder cumplir»).
 *   · `sin_stock` ⇒ ⛔ alcanza ni con el Depósito: la prenda que se vende es la del pedido.
 * Un pedido sin pagar se nombra «#7160 (sin pagar)»; si TODOS los de la prenda están sin pagar, es
 * «Reservada», ⛔ «Comprada».
 * @returns {{ tipo: 'separada' | 'reponer' | 'sin_stock', pedidos: Array<{ numero: number, cantidad: number, sinPagar: boolean }>, texto: string } | null}
 */
export function avisoDeRenglon({ sku, local, deposito, enCarrito, porSku }) {
  if (local == null || deposito == null || enCarrito == null || porSku == null) throw new Error('avisoDeRenglon: faltan datos')
  const pedidos = porSku[claveSku(sku)]
  if (!claveSku(sku) || !pedidos || !pedidos.length) return null
  const numeros = pedidos.map((p) => `#${p.numero}${p.sinPagar ? ' (sin pagar)' : ''}`).join(', ')
  const que = pedidos.every((p) => p.sinPagar) ? 'Reservada' : 'Comprada'
  const libres = Number(local) - Number(enCarrito)
  if (libres >= 0) {
    return { tipo: 'separada', pedidos, texto: `El pedido web ${numeros} lleva esta prenda y todavía no se armó.` }
  }
  const falta = -libres
  if (Math.max(0, Number(deposito)) >= falta) {
    return { tipo: 'reponer', pedidos, texto: `${que} online (pedido ${numeros}): para armarlo hay que traer ${falta} del depósito.` }
  }
  return { tipo: 'sin_stock', pedidos, texto: `${que} online (pedido ${numeros}, sin armar): si la vendés, el pedido queda sin stock.` }
}

/**
 * Cuántas órdenes del rango ⛔ llegaron: el audit corta en 200 y TN corta por cupo contestando `ok`
 * con menos órdenes adentro. Es la MISMA resta que `ordenesQueNoLlegaron` (lib/envios/core.ts, que
 * es TypeScript y el handler ⛔ puede importar): total del rango menos leídas, y `fallidas` de respaldo.
 */
export function ordenesSinLeer(d, leidas) {
  const total = Number(d && d.total_en_rango)
  if (Number.isFinite(total)) return Math.max(0, total - leidas)
  return Math.max(0, Number(d && d.fallidas) || 0)
}
