/**
 * Cliente del sync de ventas TN→GN. Junta las tres fuentes que el motor necesita y no decide
 * nada: toda la lógica vive en `core.ts`, que es puro y testeable.
 */

import { apiFetch } from '../api-fetch'
import type { LedgerRow, OrdenTN, PlanVenta, VentaGN } from './tipos'

const AUDIT = 'https://bdi-catalogo.vercel.app/api/tiendanube-audit'

export type RespuestaOrdenes = {
  ordenes: OrdenTN[]
  ventasGn: VentaGN[]
  truncado: boolean
  total_en_rango: number
  /** Órdenes cuyo detalle TN no devolvió: se avisan, no se esconden. */
  fallidas: number
  modo: string
}

/**
 * Las órdenes de TN del rango + las ventas de GN del mismo rango, en un solo viaje
 * (`?ordenes=1` de bdi-catalogo). `store` es siempre 'stunned' por ahora: es la única tienda de
 * TN cuyas ventas no llegan solas a Gestión Nube.
 */
export async function leerOrdenes(from: string, to: string, opts?: { limite?: number; modo?: 'detalle' | 'lista' }): Promise<RespuestaOrdenes> {
  const qs = new URLSearchParams({ ordenes: '1', store: 'stunned', from, to, nc: String(Date.now()) })
  if (opts?.limite) qs.set('limite', String(opts.limite))
  if (opts?.modo) qs.set('modo', opts.modo)
  const r = await apiFetch(`${AUDIT}?${qs.toString()}`)
  const d = await r.json().catch(() => null)
  if (!d || !d.ok) throw new Error((d && d.error) || 'No se pudieron leer las órdenes de Tienda Nube.')
  return {
    ordenes: (d.ordenes || []) as OrdenTN[],
    ventasGn: (d.ventas_gn || []) as VentaGN[],
    truncado: !!d.truncado,
    total_en_rango: Number(d.total_en_rango) || 0,
    fallidas: Number(d.fallidas) || 0,
    modo: d.modo || 'detalle',
  }
}

export type ResultadoImport = { ok: true; venta: { id?: number | string; number?: string | null } }

/**
 * Crea EN GESTIÓN NUBE la venta de una orden de TN. Es la única escritura del sync, y va de a una.
 * El handler reserva la orden en el ledger antes de postear: si vuelve 409 la orden ya estaba
 * tomada y NO se creó nada; si vuelve 502 con `dudoso`, no se sabe si se creó y hay que ir a
 * mirar a GN — reintentar a ciegas es lo único que no se puede hacer.
 */
export async function importarOrden(plan: PlanVenta): Promise<ResultadoImport> {
  const r = await apiFetch('/api/crear-venta', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      store: 'stunned',
      accion: 'tn_import',
      origen: 'local',
      tn_order: plan.numero,
      descuento: plan.descuento,
      // Para la NOTA de la venta en GN. Todas las ventas online caen en el mismo cliente genérico,
      // así que la nota es el único lugar donde queda quién compró y por cuánto.
      cliente: plan.cliente,
      total_tn: plan.total_tn,
      pago: plan.pago,
      fecha_tn: plan.dia,
      items: plan.lineas.map((l) => ({ product_id: l.gn_product_id, size_id: l.gn_variant_id, quantity: l.quantity, unit_price: l.unit_price })),
    }),
  })
  const d = await r.json().catch(() => null)
  if (!r.ok || !d?.ok) throw new Error((d && d.error) || 'No se pudo crear la venta en Gestión Nube.')
  return d as ResultadoImport
}

/** Suelta una reserva trabada en `dudoso`. Sólo después de haber mirado en GN que la venta no está. */
export async function liberarReserva(numeroOrden: string, store = 'stunned'): Promise<void> {
  const r = await apiFetch('/api/datos?recurso=sync-tn', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recurso: 'sync-tn', store, ref_id: numeroOrden, action: 'liberar' }),
  })
  const d = await r.json().catch(() => null)
  if (!d || !d.ok) throw new Error((d && d.error) || 'No se pudo liberar la reserva.')
}

/** Lo que el sync ya procesó (tabla `sync_procesados`). Sin esto, un reintento duplica. */
export async function leerProcesados(store = 'stunned'): Promise<LedgerRow[]> {
  const qs = new URLSearchParams({ recurso: 'sync-tn', store, tipo: 'venta', nc: String(Date.now()) })
  const r = await apiFetch(`/api/datos?${qs.toString()}`)
  const d = await r.json().catch(() => null)
  if (!d || !d.ok) throw new Error((d && d.error) || 'No se pudo leer el registro de lo ya sincronizado.')
  return (d.rows || []) as LedgerRow[]
}
