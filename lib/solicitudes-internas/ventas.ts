/**
 * Ventas GN de Solicitudes internas. Desde la convergencia Fase A delega en el motor
 * compartido de `../sesionfotos/ventas` (mismo endpoint/contrato); acá solo se fija lo
 * propio de internas, byte-idéntico al legacy (siCrearVentas @10950, siChequearAnulaciones
 * @10997):
 *
 * - **`comments`** distinto (`Uso interno — motivo (tipo) — solicitud id`).
 * - **Sin filtro `nuevo`**: todo ítem de una solicitud interna existe en GN.
 * - **Auto-cierre sin gate de devolución**: un retornable cierra en cuanto GN confirma
 *   la anulación de sus ventas, sin exigir devolución completa (a diferencia de fotos).
 *
 * Verificable OFFLINE: el payload sigue siendo byte-idéntico (tests/solicitudes-internas-ventas.test.ts).
 */

import {
  consultarEstadoGN,
  construirPedidos,
  enviarPedidos,
  idsParaCerrarCon,
  ventaAnulada,
  type Consultar,
  type CtxVenta,
  type EnviarVenta,
  type PedidoVenta,
  type ResultadoVentas,
} from '../sesionfotos/ventas'
import type { Origen, SolicitudInterna } from './tipos'

export { consultarEstadoGN, ventaAnulada }
export type { CtxVenta, ResultadoVentas }

/** Los orígenes con ítems a vender (todos existen en GN). Port del filtro de siCrearVentas @10957. */
export function origenesVendibles(s: SolicitudInterna): Origen[] {
  return (['deposito', 'local'] as Origen[]).filter((o) => s.items.some((i) => i.origen === o))
}

/** Los pedidos de venta, uno por origen. Byte-idéntico al body de siCrearVentas @10961-10964. */
export function construirPedidosVenta(s: SolicitudInterna, ctx: CtxVenta): PedidoVenta[] {
  return construirPedidos(s, ctx, { comments: `Uso interno — ${s.motivo || ''} (${s.tipo}) — solicitud ${s.id} (Monitor)` })
}

/** Crea las ventas secuencialmente por origen. Delega el envío en el motor compartido. */
export async function crearVentas(s: SolicitudInterna, ctx: CtxVenta, enviar?: EnviarVenta): Promise<ResultadoVentas> {
  return enviar ? enviarPedidos(construirPedidosVenta(s, ctx), enviar) : enviarPedidos(construirPedidosVenta(s, ctx))
}

/**
 * IDs a cerrar: retornables con ventas cuyas ventas están TODAS anuladas en GN. A
 * diferencia de fotos, NO exige devolución completa (siChequearAnulaciones @10997-11008).
 */
export async function idsParaCerrar(sols: SolicitudInterna[], store: string, consultar: Consultar = consultarEstadoGN): Promise<string[]> {
  return idsParaCerrarCon(sols, store, { incluir: (s) => s.tipo === 'retornable' }, consultar)
}
