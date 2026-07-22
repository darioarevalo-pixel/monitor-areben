/**
 * Cliente de Cambios (`/api/cambios`, Supabase) + lectura de la orden de TN (bdi-catalogo).
 * La venta de IDA (producto nuevo, baja de stock) reusa `/api/crear-venta` (como Fallas). El reingreso
 * del devuelto es MANUAL (GN no acepta venta negativa por API) → se traza `reingreso_estado`.
 */

import { apiFetch } from '../api-fetch'
import { enviarVentaFetch } from '@/lib/sesionfotos/ventas'
import type { Origen } from '@/lib/sesionfotos/tipos'
import type { Marca } from '@/lib/nav.generated'
import type { CambioInput, CambioRow, OrdenTN } from './tipos'

const TN_AUDIT = 'https://bdi-catalogo.vercel.app/api/tiendanube-audit'

/** Trae una orden de TN por número (endpoint `?orden=` de bdi-catalogo). Sin auth: es endpoint TN público. */
export async function leerOrdenTN(store: Marca, numero: string): Promise<OrdenTN | null> {
  const r = await fetch(`${TN_AUDIT}?orden=${encodeURIComponent(numero)}&store=${store}&nc=${Date.now()}`).then((x) => x.json()).catch(() => null)
  if (!r || r.error) throw new Error((r && r.error) || 'No se pudo leer la orden de Tienda Nube.')
  return (r.orden as OrdenTN) || null
}

export async function leerCambios(store: Marca, opts?: { soloPendienteReingreso?: boolean }): Promise<CambioRow[]> {
  const qs = new URLSearchParams({ store, nc: String(Date.now()) })
  if (opts?.soloPendienteReingreso) qs.set('reingreso', 'pendiente')
  const r = await apiFetch(`/api/cambios?${qs.toString()}`)
  const d = await r.json()
  if (!d || !d.ok) throw new Error((d && d.error) || 'No se pudieron leer los cambios.')
  return (d.cambios || []) as CambioRow[]
}

export async function crearCambio(store: Marca, input: CambioInput, usuario?: string): Promise<{ id?: number; diferencia?: number }> {
  const r = await apiFetch('/api/cambios', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ store, action: 'crear', usuario, ...input }),
  })
  const d = await r.json()
  if (!d || !d.ok) throw new Error((d && d.error) || 'No se pudo crear el cambio.')
  return { id: d.id as number | undefined, diferencia: d.diferencia as number | undefined }
}

/**
 * Confirma el cambio: crea la venta de IDA en GN (el producto NUEVO baja de stock, precio 0, cliente "Cambio")
 * y la registra. Estado: envío → en_transito; local → recibido. Requiere items_nuevos con artículo GN linkeado.
 * La venta va al crear-venta de PROD (los tokens de venta viven ahí), como Fallas/Solicitudes.
 */
export async function confirmarCambio(store: Marca, cambio: CambioRow, ctx: { user: string; pass: string }): Promise<void> {
  const items = (cambio.items_nuevos || []).filter((i) => i.product_id && i.size_id)
  if (!items.length) throw new Error('Los productos nuevos no están linkeados a artículos de GN: no se puede descontar stock.')
  const origen: Origen = cambio.via === 'local' ? 'local' : 'deposito'
  const pedido = {
    store, origen,
    items: items.map((i) => ({ product_id: i.product_id ?? null, size_id: i.size_id ?? null, quantity: i.cantidad || 1 })),
    comments: `Cambio orden ${cambio.orden_tn || ''} — ${cambio.cliente || ''} (Monitor)`.slice(0, 500),
    solicitudId: `cambio-${cambio.id}`,
    user: ctx.user, pass: ctx.pass,
    proposito: 'cambio' as const,
  }
  const r = await enviarVentaFetch(pedido)
  if (!r.ok) throw new Error(`No se pudo crear la venta de ida en GN — ${r.error || ''}`)

  const resp = await apiFetch('/api/cambios', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ store, action: 'confirmar', id: cambio.id, via: cambio.via, gn_venta_ida_id: r.venta?.id ?? null, gn_venta_ida_number: r.venta?.number ?? null, usuario: ctx.user }),
  })
  const d = await resp.json()
  if (!d || !d.ok) throw new Error((d && d.error) || 'La venta se creó en GN pero no se pudo registrar el cambio.')
}

/** Marca el reingreso del producto devuelto como HECHO (el admin ya lo cargó a mano en GN). */
export async function marcarReingreso(store: Marca, id: number, usuario?: string): Promise<void> {
  const r = await apiFetch('/api/cambios', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ store, action: 'reingreso', id, usuario }),
  })
  const d = await r.json()
  if (!d || !d.ok) throw new Error((d && d.error) || 'No se pudo marcar el reingreso.')
}

export async function cambiarEstadoCambio(store: Marca, id: number, estado: CambioRow['estado'], usuario?: string, nota?: string): Promise<void> {
  const r = await apiFetch('/api/cambios', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ store, action: 'estado', id, estado, usuario, nota }),
  })
  const d = await r.json()
  if (!d || !d.ok) throw new Error((d && d.error) || 'No se pudo cambiar el estado.')
}

export async function editarCambio(store: Marca, id: number, campos: Record<string, unknown>): Promise<void> {
  const r = await apiFetch('/api/cambios', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ store, action: 'editar', id, ...campos }),
  })
  const d = await r.json()
  if (!d || !d.ok) throw new Error((d && d.error) || 'No se pudo editar el cambio.')
}

export async function eliminarCambio(store: Marca, id: number): Promise<void> {
  const r = await apiFetch('/api/cambios', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ store, action: 'eliminar', id }),
  })
  const d = await r.json()
  if (!d || !d.ok) throw new Error((d && d.error) || 'No se pudo eliminar el cambio.')
}
