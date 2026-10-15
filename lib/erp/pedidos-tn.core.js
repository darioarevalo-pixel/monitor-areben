/**
 * Pedidos de Tienda Nube SIN PAGAR que retienen stock (pestaña `erp › Pedidos sin pagar`, `pantallas.md` #8).
 * 🔑 Bruno, 12-oct: en el ERP el stock se aparta CUANDO ENTRA EL PEDIDO (como hoy en GN) ⇒ la orden abierta sin
 * pagar tiene la prenda retenida hasta que se cobra o se cancela. Ésta es la lista para cobrarlas o soltarlas.
 * Lee `tn_orden` / `tn_orden_linea` (el espejo de TN del motor, cada 2 h). Puro: el handler lee las filas.
 *
 * Sin pagar = la regla del MOTOR (`esSinPagarTN`, `motor/venta/pago-tn.mjs`): abierto, ⛔ devuelto y sin estado
 * pagado. 🔑 Bruno, 15-oct (❓ c): `authorized` es PAGADO (el motor ya lo registra como venta) ⇒ ⛔ va acá.
 * Cobrar va por Cobranzas (TN ⛔ deja marcar pagado por API); cancelar, en el admin de TN.
 */
import { DEVUELTA, PAGADA, esSinPagarTN } from '../../motor/venta/pago-tn.mjs'

/** Lo que el handler excluye al leer (`payment_status not in`): pagado o devuelto ⛔ es «sin pagar». */
export const NO_SIN_PAGAR = [...PAGADA, ...DEVUELTA]

/** El admin de TN de cada tienda, hasta `/admin`: la orden se abre ahí. */
const ADMIN = {
  bdi: 'https://bdiaccesorios4.mitiendanube.com/admin',
  zattia: 'https://zattiaco.mitiendanube.com/admin',
  stunned: 'https://stunned3.mitiendanube.com/admin',
}

/** Cómo se lee el medio de pago de TN. */
export const NOMBRE_MEDIO_TN = { transfer: 'Transferencia', cash: 'Efectivo', credit_card: 'Tarjeta de crédito', debit_card: 'Tarjeta de débito', other: 'Otro' }

const DIA_MS = 86_400_000

/**
 * @param {{ ordenes: any[], lineas: any[], ahora: number }} x
 * @returns {{ pedidos: any[], porTienda: Record<string, { pedidos: number, unidades: number, total: number }> }}
 */
export function armarPedidosSinPagar({ ordenes, lineas, ahora }) {
  const unidades = new Map()
  const prendas = new Map()
  for (const l of lineas) {
    const k = `${l.tienda}/${l.tn_id}`
    unidades.set(k, (unidades.get(k) || 0) + Number(l.cantidad || 0))
    prendas.set(k, [...(prendas.get(k) || []), { nombre: l.nombre ?? null, sku: l.sku ?? null, cantidad: Number(l.cantidad || 0) }])
  }
  const pedidos = ordenes
    .filter(esSinPagarTN)
    .map((o) => {
      const k = `${o.tienda}/${o.tn_id}`
      return {
        tienda: o.tienda, tnId: String(o.tn_id), numero: Number(o.numero), creadaEn: o.creada_en,
        dias: Math.floor((ahora - Date.parse(o.creada_en)) / DIA_MS),
        pago: o.payment_status, medio: o.medio ?? null, gateway: o.gateway ?? null, total: Number(o.total || 0),
        unidades: unidades.get(k) || 0, prendas: prendas.get(k) || [],
        link: ADMIN[o.tienda] ? `${ADMIN[o.tienda]}/orders/${o.tn_id}` : null,
      }
    })
    .sort((a, b) => Date.parse(a.creadaEn) - Date.parse(b.creadaEn))
  const porTienda = {}
  for (const p of pedidos) {
    const t = (porTienda[p.tienda] ||= { pedidos: 0, unidades: 0, total: 0 })
    t.pedidos++
    t.unidades += p.unidades
    t.total += p.total
  }
  return { pedidos, porTienda }
}
