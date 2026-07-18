/**
 * El ÚNICO lugar de Solicitudes internas que habla con `/api/crear-venta` (la
 * superficie irreversible: descuenta stock en GN). Port de siCrearVentas
 * (index.html:10950), siChequearAnulaciones (10997) y _siVentaAnulada (10996).
 *
 * Reusa el envío real (`enviarVentaFetch`), la consulta de estado
 * (`consultarEstadoGN`) y el criterio de anulación (`ventaAnulada`) de Sesión de
 * fotos: el endpoint y su contrato son los mismos. Lo propio de acá:
 *
 * - **`comments`** distinto (`Uso interno — motivo (tipo) — solicitud id`).
 * - **Sin filtro `nuevo`**: todo ítem de una solicitud interna existe en GN.
 * - **Auto-cierre sin gate de devolución**: a diferencia de Sesión de fotos, un
 *   retornable cierra en cuanto GN confirma la anulación de sus ventas, sin exigir
 *   que la devolución esté completa (así lo hace el legacy, siChequearAnulaciones).
 *
 * La corrección es verificable OFFLINE: ¿el payload es byte-idéntico al del legacy?
 * (tests/solicitudes-internas-ventas.test.ts, fetch mockeado → cero POST real).
 */

import {
  consultarEstadoGN,
  enviarVentaFetch,
  ventaAnulada,
  type Consultar,
  type EnviarVenta,
  type PedidoVenta,
} from '../sesionfotos/ventas'
import type { Origen, SolicitudInterna, VentaGN } from './tipos'

export { consultarEstadoGN, ventaAnulada }

export type CtxVenta = { store: string; user: string; pass: string }

/** Los orígenes con ítems a vender (todos existen en GN). Port del filtro de siCrearVentas @10957. */
export function origenesVendibles(s: SolicitudInterna): Origen[] {
  return (['deposito', 'local'] as Origen[]).filter((o) => s.items.some((i) => i.origen === o))
}

/**
 * Los pedidos de venta, uno por origen. Byte-idéntico al body que arma
 * siCrearVentas @10961-10964.
 */
export function construirPedidosVenta(s: SolicitudInterna, ctx: CtxVenta): PedidoVenta[] {
  const comments = `Uso interno — ${s.motivo || ''} (${s.tipo}) — solicitud ${s.id} (Monitor)`
  return origenesVendibles(s).map((origen) => ({
    store: ctx.store,
    origen,
    items: s.items.filter((i) => i.origen === origen).map((i) => ({ product_id: i.pid, size_id: i.sid, quantity: i.qty })),
    comments,
    solicitudId: s.id,
    user: ctx.user,
    pass: ctx.pass,
  }))
}

export type ResultadoVentas = { ventas: Partial<Record<Origen, VentaGN>>; errores: string[] }

/**
 * Crea las ventas de una solicitud, SECUENCIALMENTE por origen (dos POST en
 * paralelo pueden descontar stock inconsistente). Port de siCrearVentas @10960-10968.
 * No persiste ni re-lee: eso lo hace el llamador (que además chequea el duplicado).
 */
export async function crearVentas(s: SolicitudInterna, ctx: CtxVenta, enviar: EnviarVenta = enviarVentaFetch): Promise<ResultadoVentas> {
  const ventas: Partial<Record<Origen, VentaGN>> = {}
  const errores: string[] = []
  for (const pedido of construirPedidosVenta(s, ctx)) {
    const r = await enviar(pedido)
    if (r.ok && r.venta) ventas[pedido.origen] = r.venta
    else errores.push(`${pedido.origen}: ${r.error || ''}`)
  }
  return { ventas, errores }
}

/**
 * IDs de solicitudes a cerrar: retornables con ventas cuyas ventas están TODAS
 * anuladas en GN. A diferencia de Sesión de fotos, NO exige que la devolución esté
 * completa (paridad con siChequearAnulaciones @10997-11008). `consultar` inyectable
 * para testear sin red.
 */
export async function idsParaCerrar(sols: SolicitudInterna[], store: string, consultar: Consultar = consultarEstadoGN): Promise<string[]> {
  const pend = sols.filter(
    (s) => s.tipo === 'retornable' && s.estado !== 'cerrada' && s.ventas && (['deposito', 'local'] as Origen[]).some((o) => s.ventas![o]?.id),
  )
  const cerrar: string[] = []
  await Promise.all(
    pend.map(async (s) => {
      const ventas = (['deposito', 'local'] as Origen[]).map((o) => s.ventas![o]).filter((v): v is VentaGN => !!v && !!v.id)
      const res = await Promise.all(ventas.map((v) => consultar(store, v.id)))
      if (res.length && res.every(ventaAnulada)) cerrar.push(s.id)
    }),
  )
  return cerrar
}
