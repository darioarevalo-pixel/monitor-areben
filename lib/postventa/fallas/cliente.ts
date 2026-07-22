/**
 * Cliente del depósito de fallas (`/api/fallas`, Supabase). Mismo patrón que lib/sku-map/cliente.ts
 * (apiFetch manda el header de auth). El ledger es interno; la ÚNICA superficie que toca stock real
 * es `confirmarFalla`, que crea una venta en GN reusando `/api/crear-venta` (vía enviarVentaFetch) y
 * después registra el resultado en la falla.
 */

import { apiFetch } from '../../api-fetch'
import { enviarVentaFetch } from '@/lib/sesionfotos/ventas'
import type { Origen } from '@/lib/sesionfotos/tipos'
import type { Marca } from '@/lib/nav.generated'
import type { FallaInput, FallaRow } from './tipos'

export async function leerFallas(store: Marca): Promise<FallaRow[]> {
  const r = await apiFetch(`/api/fallas?store=${store}&nc=${Date.now()}`)
  const d = await r.json()
  if (!d || !d.ok) throw new Error((d && d.error) || 'No se pudieron leer las fallas.')
  return (d.fallas || []) as FallaRow[]
}

export async function crearFalla(store: Marca, falla: FallaInput, usuario?: string): Promise<{ id?: number; barcode?: string }> {
  const r = await apiFetch('/api/fallas', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ store, action: 'crear', usuario, ...falla }),
  })
  const d = await r.json()
  if (!d || !d.ok) throw new Error((d && d.error) || 'No se pudo crear la falla.')
  return { id: d.id as number | undefined, barcode: d.barcode as string | undefined }
}

/** Administración recibe la falla física: mueve la ubicación a depósito. */
export async function recibirFalla(store: Marca, id: number, usuario?: string): Promise<void> {
  const r = await apiFetch('/api/fallas', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ store, action: 'recibir', id, usuario }),
  })
  const d = await r.json()
  if (!d || !d.ok) throw new Error((d && d.error) || 'No se pudo recibir la falla.')
}

/**
 * Genera la venta en GN (precio 0, descuenta la unidad) al ENTREGAR la mercadería, y registra el
 * resultado en la falla. Para falla local esto pasa al CARGAR (carga = entrega). Requiere artículo
 * de GN linkeado (product_id + size_id). La venta va al crear-venta de PROD (los tokens de ventas
 * viven solo ahí), como Solicitudes. `origen` = ubicación (por defecto 'local').
 */
export async function registrarVentaGN(
  store: Marca,
  falla: Pick<FallaRow, 'id' | 'product_id' | 'size_id' | 'cantidad' | 'sku' | 'motivo' | 'barcode' | 'ubicacion'>,
  ctx: { user: string; pass: string },
): Promise<void> {
  if (!falla.product_id || !falla.size_id) {
    throw new Error('La falla no está linkeada a un artículo de GN: elegí el artículo para poder descontar el stock.')
  }
  const origen: Origen = falla.ubicacion === 'deposito' ? 'deposito' : 'local'
  const pedido = {
    store,
    origen,
    items: [{ product_id: falla.product_id, size_id: falla.size_id, quantity: falla.cantidad || 1 }],
    comments: `Falla ${falla.sku || ''} — ${falla.motivo || 'sin motivo'} — ${falla.barcode || ''} (Monitor)`.slice(0, 500),
    solicitudId: `falla-${falla.id}`,
    user: ctx.user,
    pass: ctx.pass,
  }
  const r = await enviarVentaFetch(pedido)
  if (!r.ok) throw new Error(`No se pudo crear la venta en GN — ${r.error || ''}`)

  const resp = await apiFetch('/api/fallas', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ store, action: 'venta', id: falla.id, gn_venta_id: r.venta?.id ?? null, gn_venta_number: r.venta?.number ?? null, usuario: ctx.user }),
  })
  const d = await resp.json()
  if (!d || !d.ok) throw new Error((d && d.error) || 'La venta se creó en GN pero no se pudo registrar en la falla.')
}

/** Administración valida los datos de la carga (marca 'confirmada'). NO toca GN (la venta ya se hizo). */
export async function confirmarFalla(store: Marca, id: number, usuario?: string): Promise<void> {
  const r = await apiFetch('/api/fallas', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ store, action: 'confirmar', id, usuario }),
  })
  const d = await r.json()
  if (!d || !d.ok) throw new Error((d && d.error) || 'No se pudo confirmar la falla.')
}

export async function cambiarEstadoFalla(store: Marca, id: number, estado: FallaRow['estado'], usuario?: string, nota?: string): Promise<void> {
  const r = await apiFetch('/api/fallas', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ store, action: 'estado', id, estado, usuario, nota }),
  })
  const d = await r.json()
  if (!d || !d.ok) throw new Error((d && d.error) || 'No se pudo cambiar el estado.')
}

/** Elimina una falla del ledger (solo Administración). NO deshace la venta en GN. */
export async function eliminarFalla(store: Marca, id: number): Promise<void> {
  const r = await apiFetch('/api/fallas', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ store, action: 'eliminar', id }),
  })
  const d = await r.json()
  if (!d || !d.ok) throw new Error((d && d.error) || 'No se pudo eliminar la falla.')
}

export async function editarFalla(store: Marca, id: number, campos: Partial<FallaInput>): Promise<void> {
  const r = await apiFetch('/api/fallas', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ store, action: 'editar', id, ...campos }),
  })
  const d = await r.json()
  if (!d || !d.ok) throw new Error((d && d.error) || 'No se pudo editar la falla.')
}
