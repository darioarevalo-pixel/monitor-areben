/**
 * El ÚNICO lugar que habla con `/api/crear-venta` (la superficie irreversible de
 * Sesión de fotos). Port de sfCrearVentas (index.html:9684), sfChequearAnulaciones
 * (9976) y _sfVentaAnulada (9972). Un solo choke point para poder auditarlo.
 *
 * El endpoint (api/crear-venta.js) NO se toca: valida `usuarioValido(user,pass)`
 * server-side y ya está probado en prod por el legacy. Lo único que se migra es el
 * LLAMADOR. Por eso la corrección se reduce a una pregunta verificable OFFLINE:
 * ¿el payload es el MISMO que el del legacy? (tests/sesionfotos-ventas.test.ts,
 * fetch mockeado → cero POST, cero ventas de prueba).
 *
 * Diferencias deliberadas con el legacy, todas para reforzar la seguridad:
 * - loop SECUENCIAL por origen (igual que el legacy @9693, NO Promise.all);
 * - contramedida anti-duplicado: el llamador re-lee la solicitud fresca y aborta
 *   si `s.ventas` ya existe (además del `integration_id` determinístico que el
 *   endpoint ya manda, crear-venta.js:74).
 */

import { faseCompleta } from './core'
import type { Origen, Solicitud, VentaGN } from './tipos'

const SF_CREAR_VENTA_API = 'https://monitorareben.vercel.app/api/crear-venta'

export type CtxVenta = { store: string; user: string; pass: string }

export type PedidoVenta = {
  store: string
  origen: Origen
  items: { product_id: string | null; size_id: string | null; quantity: number }[]
  comments: string
  solicitudId: string
  user: string
  pass: string
}

/** Los orígenes con ítems VENDIBLES (no-nuevos). Port del filtro de sfCrearVentas @9690. */
export function origenesVendibles(s: Solicitud): Origen[] {
  return (['deposito', 'local'] as Origen[]).filter((o) => s.items.some((i) => i.origen === o && !i.nuevo))
}

/**
 * Los pedidos de venta, uno por origen. Byte-idéntico al body que arma
 * sfCrearVentas @9694-9697: los ítems `nuevo` NO entran (no existen en GN).
 */
export function construirPedidosVenta(s: Solicitud, ctx: CtxVenta): PedidoVenta[] {
  const comments = `Sesión de fotos — ${s.descripcion || ''} — solicitud ${s.id} (Monitor)`
  return origenesVendibles(s).map((origen) => ({
    store: ctx.store,
    origen,
    items: s.items.filter((i) => i.origen === origen && !i.nuevo).map((i) => ({ product_id: i.pid, size_id: i.sid, quantity: i.qty })),
    comments,
    solicitudId: s.id,
    user: ctx.user,
    pass: ctx.pass,
  }))
}

export type RespuestaEnvio = { ok: boolean; venta?: VentaGN; error?: string }
/** Envía un pedido. Inyectable para testear la orquestación sin POST. */
export type EnviarVenta = (pedido: PedidoVenta) => Promise<RespuestaEnvio>

/** El envío real a `/api/crear-venta`. Formatea el error igual que el legacy @9699. */
export const enviarVentaFetch: EnviarVenta = async (pedido) => {
  try {
    const r = await fetch(SF_CREAR_VENTA_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(pedido) })
    const d = await r.json()
    if (d.ok) return { ok: true, venta: d.venta }
    return { ok: false, error: `${d.error || ''}${d.detalle ? ' — ' + JSON.stringify(d.detalle).slice(0, 200) : ''}` }
  } catch {
    return { ok: false, error: 'error de conexión' }
  }
}

export type ResultadoVentas = { ventas: Partial<Record<Origen, VentaGN>>; errores: string[] }

/**
 * Crea las ventas de una solicitud, SECUENCIALMENTE por origen (dos POST en
 * paralelo pueden descontar stock inconsistente). Port de sfCrearVentas @9693-9701.
 * No persiste ni re-lee: eso lo hace el llamador (que además chequea el duplicado).
 */
export async function crearVentas(s: Solicitud, ctx: CtxVenta, enviar: EnviarVenta = enviarVentaFetch): Promise<ResultadoVentas> {
  const ventas: Partial<Record<Origen, VentaGN>> = {}
  const errores: string[] = []
  for (const pedido of construirPedidosVenta(s, ctx)) {
    const r = await enviar(pedido)
    if (r.ok && r.venta) ventas[pedido.origen] = r.venta
    else errores.push(`${pedido.origen}: ${r.error || ''}`)
  }
  return { ventas, errores }
}

// ── Anulaciones (read-only en GN) ────────────────────────────────────────────────

export type EstadoVentaGN = { ok?: boolean; existe?: boolean; active?: boolean; archived?: boolean } | null

/** Consulta el estado de una venta en GN (accion:'estado', read-only, sin login). */
export async function consultarEstadoGN(store: string, ventaId: number | string): Promise<EstadoVentaGN> {
  try {
    const r = await fetch(SF_CREAR_VENTA_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accion: 'estado', store, ventaId }) })
    return (await r.json()) as EstadoVentaGN
  } catch {
    return null
  }
}

/** ¿La venta está anulada en GN? Ante la duda (error/desconocido), NO. Port de _sfVentaAnulada @9972. */
export function ventaAnulada(resp: EstadoVentaGN): boolean {
  if (!resp || !resp.ok) return false
  return resp.existe === false || resp.active === false || resp.archived === true
}

export type Consultar = (store: string, ventaId: number | string) => Promise<EstadoVentaGN>

/**
 * IDs de solicitudes a cerrar: las que tienen ventas y TODAS sus ventas están
 * anuladas en GN, y además ya completaron la devolución (no cierra hasta que
 * volvió todo). Port de sfChequearAnulacionesTodas @9976-9990. `consultar`
 * inyectable para testear sin red.
 */
export async function idsParaCerrar(sols: Solicitud[], store: string, consultar: Consultar = consultarEstadoGN): Promise<string[]> {
  const pend = sols.filter((s) => s.estado !== 'cerrada' && s.ventas && (['deposito', 'local'] as Origen[]).some((o) => s.ventas![o]?.id))
  const cerrar: string[] = []
  await Promise.all(
    pend.map(async (s) => {
      const ventas = (['deposito', 'local'] as Origen[]).map((o) => s.ventas![o]).filter((v): v is VentaGN => !!v && !!v.id)
      const res = await Promise.all(ventas.map((v) => consultar(store, v.id)))
      if (res.length && res.every(ventaAnulada) && faseCompleta(s, 'devolucion')) cerrar.push(s.id)
    }),
  )
  return cerrar
}
