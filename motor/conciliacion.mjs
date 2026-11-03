/**
 * La CONCILIACIÓN diaria (paso 7, sesión B; Bruno 18-oct: «lo que da CONFIANZA mirando el paralelo»): el ERP contra lo
 * que muestran Tienda Nube y GN, por VARIANTE y por PEDIDO. Puro: `bin/tn.mjs conciliar` carga, esto clasifica, y
 * `lib/conciliacion-guardar.mjs` deja en `conciliacion_fila` SÓLO lo que ⛔ cierra (sql/024). La pantalla es
 * `erp › Conciliación` del monitor.
 *
 * 🔑 Hasta el corte GN sirve y el ERP es la PRUEBA: acá nada se arregla solo, se MIRA. Lo de GN contra el libro por
 * depósito ya lo hace el diff diario (`lib/diff.mjs`, `stock_diff`): esto ⛔ lo repite, suma lo que el diff ⛔ ve.
 *
 * Tres tipos:
 *   stock_tn    cada variante de TN (EN VIVO) contra el libro y GN, con los depósitos de la tienda (`DEPOSITOS_TN`) y el
 *               libro MENOS lo que retienen los pedidos sin pagar (lo mismo que empujaría el día del corte):
 *                 libro_aparte  TN = GN y el libro dice otra cosa: el libro se apartó (mirarlo en Diferencias)
 *                 tn_atrasado   libro = GN y TN dice otra cosa: GN todavía ⛔ llevó el cambio a TN (hoy lo empuja GN)
 *                 gn_aparte     libro = TN y GN dice otra cosa (el espejo de GN viejo, o GN movió después)
 *                 los_tres      los tres distintos
 *                 sin_variante  la variante de TN ⛔ tiene variante en el ERP (SKU o código que ⛔ existe): ⛔ se puede empujar
 *   pedido_erp  cada pedido de TN contra la venta del ERP (`origen = 'tn'`), con la regla de `planVentasTN`:
 *                 falta_venta        pagado y sin venta (la toma la próxima vuelta; si sigue, algo la frena)
 *                 no_entra           pagado y la regla ⛔ lo puede pasar a venta (cuenta, variante, subtotal: `motivo`)
 *                 venta_anulada      pagado y la venta del ERP está anulada
 *                 venta_de_cancelada cancelado o devuelto en TN y la venta del ERP sigue activa
 *                 total_distinto     la venta del ERP ⛔ suma lo que cobró TN
 *   pedido_gn   el cruce de siempre (`cruzar`, lib/tn/cruce.mjs) contra la venta de GN: sin_venta · prendas_distintas ·
 *               cancelada_con_venta · varias_ventas · venta_sin_orden (venta de GN con un número que TN ⛔ tiene).
 *
 * `en_vuelo`: lo que FALTA (venta del ERP o de GN) de un pedido que se pagó hace menos de `VUELO_MS` ⛔ es una
 * diferencia todavía: la venta del ERP entra al aviso o en la vuelta de 2 h, y la de GN con su sync. Se guarda igual
 * (la pantalla lo separa) para que mañana, si sigue, cuente el día.
 * `dias`: cuántos días seguidos esa clave viene sin cerrar (con el día anterior calculado, cualquiera sea la clase).
 */
import { gnYaNoManda } from './depositos.mjs'
import { DEVUELTA, PAGADA, varianteDeLineaTN } from './tn/cruce.mjs'
import { DEPOSITOS_TN, nivelDe } from './tn/stock.mjs'

export const TIPOS = ['stock_tn', 'pedido_erp', 'pedido_gn']
/** Los de Mercado Libre (sólo BDI): los corre `bin/ml.mjs conciliar`, con su token. */
export const TIPOS_ML = ['stock_ml', 'pedido_ml']

/** Las clases que ⛔ cierran, por tipo (la pantalla del monitor las nombra; una que ⛔ conoce la avisa). */
export const CLASES = {
  stock_tn: ['libro_aparte', 'tn_atrasado', 'gn_aparte', 'los_tres', 'sin_variante', 'tn_distinto'],
  pedido_erp: ['falta_venta', 'no_entra', 'venta_anulada', 'venta_de_cancelada', 'total_distinto', 'en_vuelo'],
  pedido_gn: ['sin_venta', 'prendas_distintas', 'cancelada_con_venta', 'varias_ventas', 'venta_sin_orden', 'en_vuelo'],
  stock_ml: ['libro_aparte', 'ml_atrasado', 'gn_aparte', 'los_tres', 'sin_variante', 'sin_sku', 'ml_distinto'],
  pedido_ml: ['sin_venta', 'prendas_distintas', 'cancelada_con_venta', 'varias_ventas', 'venta_sin_orden'],
}

/** Las del cruce de GN que ⛔ cierran (`pendiente`, `pendiente_con_venta` y `cancelada` se cuentan, ⛔ se juzgan). */
const NO_CIERRA_GN = new Set(['sin_venta', 'prendas_distintas', 'cancelada_con_venta', 'varias_ventas'])

export const VUELO_MS = 3 * 3600e3

/**
 * 🔑 Qué depósitos de GN dan el stock de ML (BDI) — MEDIDO el 18-oct (run 39178311818, 316 publicaciones activas, todas
 * con SKU del ERP, ninguna full): ML = GN en Depósito Minorista 98,1% · Local 10,8% · Mayorista 0% · Minorista + Local
 * 0,3% ⇒ el mismo que TN de BDI. `bin/ml.mjs conciliar` lo vuelve a medir cada día (`DEPOSITOS_ML_CANDIDATOS`, en el
 * resumen): si un día otro gana, se ve.
 */
export const DEPOSITOS_ML = ['deposito_minorista']
export const DEPOSITOS_ML_CANDIDATOS = [['deposito_minorista'], ['local'], ['deposito_mayorista'], ['deposito_minorista', 'local']]

/** Las «variantes» de una publicación de ML: cada variación, o la publicación sola. SKU de la variación, si no del ítem. */
export function variantesML(item) {
  const skuDe = (x) => {
    if (x?.seller_custom_field) return String(x.seller_custom_field).trim()
    const a = (x?.attributes || []).find((t) => t.id === 'SELLER_SKU')
    return a?.value_name ? String(a.value_name).trim() : null
  }
  const full = item.shipping?.logistic_type === 'fulfillment'
  const base = { item_id: String(item.id), titulo: item.title ?? null, full }
  if (item.variations?.length) {
    return item.variations.map((v) => ({ ...base, variation_id: String(v.id), sku: skuDe(v) ?? skuDe(item), stock: Number(v.available_quantity ?? 0) }))
  }
  return [{ ...base, variation_id: null, sku: skuDe(item), stock: Number(item.available_quantity ?? 0) }]
}

/**
 * El stock de ML (las publicaciones ACTIVAS) contra el libro y GN, como `conciliarStockTN`. Una publicación FULL (el stock
 * está en el depósito de ML) ⛔ se compara: se cuenta. Sin SKU ⇒ `sin_sku`; con SKU que el ERP ⛔ conoce ⇒ `sin_variante`.
 * 🔴 ML ⛔ resta reservas como TN: el libro va entero.
 * 🔴 Si la línea ya cortó (`cortes`, obligatorio), GN ⛔ es testigo: sólo ML contra el libro (como `conciliarStockTN`).
 */
export function conciliarStockML({ items, indice, libro, gn, cortes, ahora = new Date(), depositos = DEPOSITOS_ML }) {
  const sinGn = gnYaNoManda('bdi', ahora, cortes)
  const deLibro = nivelDe(libro, depositos)
  const deGN = nivelDe(gn, depositos)
  const cuenta = { variantes: 0, full: 0, repetidas: 0, comparadas: 0, cierran: 0, ...(sinGn ? { sin_gn: true } : {}) }
  const filas = []
  const vistas = new Map()
  for (const item of items) {
    for (const mv of variantesML(item)) {
      cuenta.variantes++
      if (mv.full) { cuenta.full++; continue }
      const clv = `ml:${mv.item_id}:${mv.variation_id ?? '-'}`
      const detalle = { item_id: mv.item_id, variation_id: mv.variation_id, nombre: mv.titulo }
      if (!mv.sku) { filas.push({ tipo: 'stock_ml', clave: clv, clase: 'sin_sku', tn: mv.stock, detalle }); continue }
      const v = indice.porSku?.(mv.sku.toUpperCase()) ?? null
      if (!v) { filas.push({ tipo: 'stock_ml', clave: clv, clase: 'sin_variante', sku: mv.sku, tn: mv.stock, detalle }); continue }
      const clave = `${v.product_id}:${v.size_id}`
      const ya = vistas.get(clave)
      if (ya) { ya.push(mv.item_id); cuenta.repetidas++; continue }
      const otras = []
      vistas.set(clave, otras)
      cuenta.comparadas++
      const ml = mv.stock
      const l = deLibro(v.product_id, v.size_id)
      const g = sinGn ? null : deGN(v.product_id, v.size_id)
      const clase = sinGn
        ? (ml === l ? null : 'ml_distinto')
        : ml === l && ml === g ? null : l === g ? 'ml_atrasado' : ml === g ? 'libro_aparte' : l === ml ? 'gn_aparte' : 'los_tres'
      if (!clase) { cuenta.cierran++; continue }
      // `tn` = lo que muestra el CANAL (acá ML): la columna es la misma para los dos.
      filas.push({ tipo: 'stock_ml', clave, clase, product_id: Number(v.product_id), size_id: Number(v.size_id), sku: mv.sku, tn: ml, libro: l, reservado: 0, gn: g, detalle: { ...detalle, otras_ml: otras } })
    }
  }
  for (const f of filas) if (!f.detalle.otras_ml?.length) delete f.detalle.otras_ml
  return { cuenta: { ...cuenta, ...contar(filas) }, filas }
}

/** La medición: con cada juego de depósitos candidato, cuántas variantes de ML coinciden con GN (el que más, manda). */
export function medirDepositosML({ items, indice, gn, candidatos = DEPOSITOS_ML_CANDIDATOS }) {
  return candidatos.map((deps) => {
    const deGN = nivelDe(gn, deps)
    let comparadas = 0, iguales = 0
    for (const item of items) for (const mv of variantesML(item)) {
      if (mv.full || !mv.sku) continue
      const v = indice.porSku?.(mv.sku.toUpperCase())
      if (!v) continue
      comparadas++
      if (deGN(v.product_id, v.size_id) === mv.stock) iguales++
    }
    return { depositos: deps, comparadas, iguales, pct: comparadas ? Math.round((1000 * iguales) / comparadas) / 10 : null }
  })
}

/** Los packs de ML contra la venta de GN (el `cruzar` de `bin/ml.mjs cruce`): sólo lo que ⛔ cierra, como `pedido_gn`. */
export function conciliarPedidosML({ packs, cruce }) {
  const filas = []
  for (const c of cruce.filas) {
    if (!NO_CIERRA_GN.has(c.clase)) continue
    filas.push({ tipo: 'pedido_ml', clave: `#${c.numero}`, clase: c.clase, numero: String(c.numero),
      detalle: { status: c.status, payment_status: c.payment_status, ventas_gn: c.ventas, ...(c.dif ? { dif: c.dif } : {}) } })
  }
  for (const s of cruce.venta_sin_orden || []) {
    filas.push({ tipo: 'pedido_ml', clave: `gn:${s.venta}`, clase: 'venta_sin_orden', numero: String(s.numero), detalle: { venta_gn: s.venta, date_sale: s.date_sale } })
  }
  return { cuenta: { packs: packs.length, ...contar(filas) }, filas }
}

const nombreTN = (p) => (p?.name && typeof p.name === 'object' ? p.name.es ?? Object.values(p.name)[0] : p?.name) ?? null

/**
 * @param {object} p  lo mismo que `planStockTN` (lib/tn/stock.mjs)
 * `cuenta.comparadas` = variantes del ERP (⛔ de TN: un SKU repetido en TN es UNA) ⇒ el % es `cierran / comparadas`.
 * @returns {{ cuenta: object, filas: Array }}
 */
export function conciliarStockTN({ tienda, productos, indice, libro, gn, cortes, ahora = new Date(), reservado = new Map() }) {
  const deps = DEPOSITOS_TN[tienda]
  if (!deps) throw new Error(`tienda desconocida: ${tienda}`)
  // 🔴 Una tienda que ya CORTÓ: GN ⛔ es testigo (se quedó donde estaba) ⇒ compararlo sólo da falso rojo. TN contra el libro.
  const sinGn = gnYaNoManda(tienda, ahora, cortes)
  const variante = varianteDeLineaTN(indice)
  const deLibro = nivelDe(libro, deps)
  const deGN = nivelDe(gn, deps)
  const cuenta = { variantes: 0, sin_limite: 0, repetidas: 0, comparadas: 0, cierran: 0, ...(sinGn ? { sin_gn: true } : {}) }
  const filas = []
  const vistas = new Map()
  for (const p of productos) {
    for (const tv of p.variants || []) {
      cuenta.variantes++
      if (tv.stock == null) { cuenta.sin_limite++; continue }
      const tn = Number(tv.stock)
      const v = variante({ variant_id: tv.id, sku: tv.sku, barcode: tv.barcode })
      if (!v) {
        filas.push({ tipo: 'stock_tn', clave: `tn:${tv.id}`, clase: 'sin_variante', sku: tv.sku ?? null, tn,
          detalle: { tn_product_id: Number(p.id), variant_id: Number(tv.id), barcode: tv.barcode ?? null, nombre: nombreTN(p) } })
        continue
      }
      const clave = `${v.product_id}:${v.size_id}`
      // La misma variante del ERP en dos de TN (SKU repetido): decide la primera; las otras se anotan.
      const ya = vistas.get(clave)
      if (ya) { ya.push(Number(tv.id)); cuenta.repetidas++; continue }
      const otras = []
      vistas.set(clave, otras)
      cuenta.comparadas++
      const res = reservado.get(clave) || 0
      const l = Math.max(0, deLibro(v.product_id, v.size_id) - res)
      const g = sinGn ? null : deGN(v.product_id, v.size_id)
      const clase = sinGn
        ? (tn === l ? null : 'tn_distinto')
        : tn === l && tn === g ? null : l === g ? 'tn_atrasado' : tn === g ? 'libro_aparte' : l === tn ? 'gn_aparte' : 'los_tres'
      if (!clase) { cuenta.cierran++; continue }
      filas.push({ tipo: 'stock_tn', clave, clase, product_id: Number(v.product_id), size_id: Number(v.size_id), sku: tv.sku ?? v.sku ?? null,
        tn, libro: l, reservado: res, gn: g, detalle: { tn_product_id: Number(p.id), variant_id: Number(tv.id), otras_tn: otras } })
    }
  }
  for (const f of filas) if (!f.detalle.otras_tn?.length) delete f.detalle?.otras_tn
  return { cuenta: { ...cuenta, ...contar(filas) }, filas }
}

/**
 * @param {object} p
 * @param {'bdi'|'zattia'|'stunned'} p.tienda
 * @param {Array} p.ordenes   filas de tn_orden con `lineas` (las del cruce: creadas en la ventana)
 * @param {object} p.plan     `planVentasTN` de esas órdenes (`registrar`, `anular`, `saltadas`)
 * @param {Map<string, {estado, total}>} p.ventas  venta del ERP por `origen_ref` (`tienda:tn_id`)
 * @param {object} p.cruce    `cruzar` de esas órdenes contra GN (`filas`, `venta_sin_orden`)
 * @param {Record<string,string>} p.cortes  `erp_corte`, obligatorio: una tienda que ya cortó ⛔ se cruza con GN (sus pedidos ya ⛔ van ahí)
 * @param {Date} [p.ahora]
 */
export function conciliarPedidosTN({ tienda, ordenes, plan, ventas, cruce, cortes, ahora = new Date(), vueloMs = VUELO_MS }) {
  const sinGn = gnYaNoManda(tienda, ahora, cortes)
  const porNumero = new Map(ordenes.map((o) => [String(o.numero), o]))
  const reciente = (o) => !!o?.pagada_en && ahora.getTime() - new Date(o.pagada_en).getTime() < vueloMs
  const filas = []
  const fila = (tipo, o, clase, detalle = {}) => filas.push({ tipo, clave: `#${o.numero}`, clase, numero: String(o.numero),
    detalle: { tn_id: Number(o.tn_id), status: o.status, payment_status: o.payment_status, gateway: o.gateway ?? null, total: num(o.total),
      pagada_en: o.pagada_en ? new Date(o.pagada_en).toISOString() : null, ...detalle } })

  // ERP: la regla es la de `planVentasTN` (lo que registraría o anularía la próxima vuelta ⛔ cerró todavía).
  for (const e of plan.registrar) {
    const o = porNumero.get(String(e.detalle?.tn?.numero))
    if (o) fila('pedido_erp', o, reciente(o) ? 'en_vuelo' : 'falta_venta')
  }
  for (const [motivo, numeros] of Object.entries(plan.saltadas || {})) {
    for (const n of numeros) { const o = porNumero.get(String(n)); if (o) fila('pedido_erp', o, 'no_entra', { motivo }) }
  }
  for (const a of plan.anular) {
    const o = porNumero.get(String(a.numero))
    if (o) fila('pedido_erp', o, 'venta_de_cancelada', { venta_id: Number(a.venta_id) })
  }
  for (const o of ordenes) {
    const caida = o.status === 'cancelled' || DEVUELTA.has(o.payment_status)
    if (caida || !PAGADA.has(o.payment_status)) continue
    const v = ventas.get(`${tienda}:${o.tn_id}`)
    if (!v) continue
    if (v.estado === 'anulada') fila('pedido_erp', o, 'venta_anulada', { venta_id: Number(v.id) })
    else if (Math.abs(num(v.total) - num(o.total)) > 0.01) fila('pedido_erp', o, 'total_distinto', { venta_id: Number(v.id), total_erp: num(v.total) })
  }

  // GN: el cruce de siempre, mientras la tienda ⛔ haya cortado.
  for (const c of sinGn ? [] : cruce.filas) {
    if (!NO_CIERRA_GN.has(c.clase)) continue
    const o = porNumero.get(String(c.numero))
    if (!o) continue
    fila('pedido_gn', o, c.clase === 'sin_venta' && reciente(o) ? 'en_vuelo' : c.clase, { ventas_gn: c.ventas, ...(c.dif ? { dif: c.dif } : {}) })
  }
  for (const s of sinGn ? [] : cruce.venta_sin_orden || []) {
    filas.push({ tipo: 'pedido_gn', clave: `gn:${s.venta}`, clase: 'venta_sin_orden', numero: String(s.numero), detalle: { venta_gn: s.venta, date_sale: s.date_sale } })
  }
  return { cuenta: { ...(sinGn ? { sin_gn: true } : {}), pedidos: ordenes.length, ventas_erp: ventas.size, pagados: ordenes.filter((o) => PAGADA.has(o.payment_status) && o.status !== 'cancelled').length, ...contar(filas) }, filas }
}

/** Los días seguidos sin cerrar: `anteriores` = clave 'tipo|clave' → dias del día calculado anterior. */
export function conDias(filas, anteriores = new Map()) {
  return filas.map((f) => ({ ...f, dias: (anteriores.get(`${f.tipo}|${f.clave}`) || 0) + 1 }))
}

/** El resumen del día de una tienda: por tipo, cuántas de cada clase (y lo que se contó para el denominador). */
export function resumenDelDia({ stock, pedidos, extra = {} }) {
  return { stock_tn: stock?.cuenta ?? null, pedidos: pedidos?.cuenta ?? null, ...extra }
}

function contar(filas) {
  const por = {}
  for (const f of filas) { por[f.tipo] ??= {}; por[f.tipo][f.clase] = (por[f.tipo][f.clase] || 0) + 1 }
  return { clases: por }
}

const num = (x) => Math.round(Number(x || 0) * 100) / 100
