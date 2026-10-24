/**
 * Pedidos de Tienda Nube SIN PAGAR que retienen stock (pestaña `erp › Pedidos sin pagar`, `pantallas.md` #8).
 * 🔑 Bruno, 12-oct: en el ERP el stock se aparta CUANDO ENTRA EL PEDIDO (como hoy en GN) ⇒ la orden abierta sin
 * pagar tiene la prenda retenida hasta que se cobra o se cancela. Ésta es la lista para cobrarlas o soltarlas.
 * Lee `tn_orden` / `tn_orden_linea` (el espejo de TN del motor, cada 2 h). Puro: el handler lee las filas.
 *
 * Sin pagar = la regla del MOTOR (`esSinPagarTN`, `motor/venta/pago-tn.mjs`): abierto, ⛔ devuelto y sin estado
 * pagado. 🔑 Bruno, 15-oct (❓ c): `authorized` es PAGADO (el motor ya lo registra como venta) ⇒ ⛔ va acá.
 * Cobrar va por Cobranzas (TN ⛔ deja marcar pagado por API); cancelar, en el admin de TN.
 *
 * 🔑 Bruno, 19-oct: el pedido CERRADO sin pago (entregado y cobrado en el local sin marcarlo en TN) SIGUE acá, con
 * `entregadoSinCobrar` (la regla `esEntregadoSinCobrarTN` del motor), hasta que se cobre o se cancele. ⛔ retiene
 * stock (la prenda ya se fue) ⇒ ⛔ suma en `unidades` de la tienda.
 */
import { DEVUELTA, PAGADA, esEntregadoSinCobrarTN, esPorCobrarTN } from '../../motor/venta/pago-tn.mjs'

/** Lo que el handler excluye al leer (`payment_status not in`): pagado o devuelto ⛔ es «sin pagar». */
/** Los `status` que lee el handler: abierto (sin pagar) y cerrado (entregado sin cobrar). */
export const STATUS_POR_COBRAR = ['open', 'closed']

export const NO_SIN_PAGAR = [...PAGADA, ...DEVUELTA]

/** El admin de TN de cada tienda, hasta `/admin`: la orden se abre ahí. */
export const ADMIN = {
  bdi: 'https://bdiaccesorios4.mitiendanube.com/admin',
  zattia: 'https://zattiaco.mitiendanube.com/admin',
  stunned: 'https://stunned3.mitiendanube.com/admin',
}

/** Cómo se lee el medio de pago de TN. */
export const NOMBRE_MEDIO_TN = { transfer: 'Transferencia', cash: 'Efectivo', credit_card: 'Tarjeta de crédito', debit_card: 'Tarjeta de débito', other: 'Otro' }

const DIA_MS = 86_400_000

/**
 * 🔑 Bruno, 19-oct: mientras corre el paralelo, el entregado sin cobrar que GN YA TIENE COBRADO ⛔ va en «Sin pagar» (se cobró
 * en el local y nadie lo marcó en TN). Cobrado = la venta de GN de ese pedido (`ventas.tn_order`, del día del pedido en adelante:
 * Zattia y Stunned comparten base y numeración distinta) con cobros que cubren el total, con un 1% de margen por el redondeo del
 * efectivo (medido 19-oct: BDI #21870 cobró $5.400 de $5.431,50). Puro.
 * @param {{ entregados: any[], ventasGN: Array<{ id: any, tn_order: string, date_sale: string }>, cobros: Array<{ venta_id: any, monto: any }> }} x
 * @returns {Set<string>} `tienda/tn_id` de los cobrados en GN
 */
export function cobradosEnGN({ entregados, ventasGN, cobros }) {
  const cobrado = new Map()
  for (const c of cobros) cobrado.set(String(c.venta_id), (cobrado.get(String(c.venta_id)) || 0) + Number(c.monto || 0))
  const out = new Set()
  for (const o of entregados) {
    // `creada_en` es UTC y `date_sale` el día de AR: un pedido de las 21 h AR cae al día siguiente en UTC (medido 19-oct, BDI
    // #21462: pedido 19-sep UTC, venta de GN 18-sep) ⇒ un día de margen.
    const dia = new Date(Date.parse(o.creada_en) - DIA_MS).toISOString().slice(0, 10)
    const total = Number(o.total || 0)
    const suma = ventasGN.filter((v) => String(v.tn_order) === String(o.numero) && String(v.date_sale).slice(0, 10) >= dia)
      .reduce((a, v) => a + (cobrado.get(String(v.id)) || 0), 0)
    if (total > 0 && suma >= total * 0.99) out.add(`${o.tienda}/${o.tn_id}`)
  }
  return out
}

/**
 * @param {{ ordenes: any[], lineas: any[], ahora: number, cobradosGN?: Set<string> }} x
 * @returns {{ pedidos: any[], porTienda: Record<string, { pedidos: number, unidades: number, total: number }> }}
 */
export function armarPedidosSinPagar({ ordenes, lineas, ahora, cobradosGN = new Set() }) {
  const unidades = new Map()
  const prendas = new Map()
  for (const l of lineas) {
    const k = `${l.tienda}/${l.tn_id}`
    unidades.set(k, (unidades.get(k) || 0) + Number(l.cantidad || 0))
    prendas.set(k, [...(prendas.get(k) || []), { nombre: l.nombre ?? null, sku: l.sku ?? null, cantidad: Number(l.cantidad || 0) }])
  }
  const pedidos = ordenes
    .filter((o) => esPorCobrarTN(o) && !(esEntregadoSinCobrarTN(o) && cobradosGN.has(`${o.tienda}/${o.tn_id}`)))
    .map((o) => {
      const k = `${o.tienda}/${o.tn_id}`
      return {
        tienda: o.tienda, tnId: String(o.tn_id), numero: Number(o.numero), creadaEn: o.creada_en,
        dias: Math.floor((ahora - Date.parse(o.creada_en)) / DIA_MS),
        pago: o.payment_status, medio: o.medio ?? null, gateway: o.gateway ?? null, total: Number(o.total || 0),
        unidades: unidades.get(k) || 0, prendas: prendas.get(k) || [],
        link: ADMIN[o.tienda] ? `${ADMIN[o.tienda]}/orders/${o.tn_id}` : null,
        entregadoSinCobrar: esEntregadoSinCobrarTN(o),
        // El estado que guardó el motor (`tn_orden.estado`): con «sin pagar → a preparar» prendido, el sin pagar abierto es `a_preparar`.
        estado: o.estado ?? null,
      }
    })
    .sort((a, b) => Date.parse(a.creadaEn) - Date.parse(b.creadaEn))
  const porTienda = {}
  for (const p of pedidos) {
    const t = (porTienda[p.tienda] ||= { pedidos: 0, unidades: 0, total: 0 })
    t.pedidos++
    if (!p.entregadoSinCobrar) t.unidades += p.unidades
    t.total += p.total
  }
  return { pedidos, porTienda }
}
