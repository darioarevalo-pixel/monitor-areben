import { leerPedidoPanel, type FichaPedido } from './cliente'

/**
 * ⚡ La hoja del pedido traída ANTES de tocarlo (Darío 18-nov: «demora 3 seg en abrir el pedido»; el servidor tarda ~1,5 s
 * porque abre la base de Areben Gestión, que está lejos). La ficha la larga al mostrar sus pedidos y `tomarPedidoPanel` la
 * usa UNA vez si tiene menos de 1 minuto; después de un cambio la hoja siempre vuelve a leer.
 */
const ADELANTADO_MS = 60_000
const pedidosAdelantados = new Map<string, { p: Promise<FichaPedido | { prendido: false }>; t: number }>()
export function adelantarPedidoPanel(id: string, ahora = Date.now()): void {
  const e = pedidosAdelantados.get(id)
  if (e && ahora - e.t < ADELANTADO_MS) return
  const p = leerPedidoPanel(id)
  p.catch(() => pedidosAdelantados.delete(id))
  pedidosAdelantados.set(id, { p, t: ahora })
}
export function tomarPedidoPanel(id: string, ahora = Date.now()): Promise<FichaPedido | { prendido: false }> {
  const e = pedidosAdelantados.get(id)
  pedidosAdelantados.delete(id)
  return e && ahora - e.t < ADELANTADO_MS ? e.p : leerPedidoPanel(id)
}
