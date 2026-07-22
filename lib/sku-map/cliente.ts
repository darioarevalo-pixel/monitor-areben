/**
 * Cliente del mapeo SKU (`/api/sku-map`, Supabase). NO toca stock ni ventas: solo lee/escribe
 * la tabla de correspondencias GN↔TN que después consume el sync. Mismo patrón que
 * lib/conteo-deposito/cliente.ts (apiFetch manda el header x-monitor-auth).
 */

import { apiFetch } from '../api-fetch'
import type { SkuMapRow, SkuStore } from './tipos'

export async function leerMapeo(store: SkuStore, opts?: { validado?: boolean }): Promise<SkuMapRow[]> {
  const qs = new URLSearchParams({ store, nc: String(Date.now()) })
  if (opts?.validado !== undefined) qs.set('validado', String(opts.validado))
  const r = await apiFetch(`/api/sku-map?${qs.toString()}`)
  const d = await r.json()
  if (!d || !d.ok) throw new Error((d && d.error) || 'No se pudo leer el mapeo de SKU.')
  return (d.rows || []) as SkuMapRow[]
}

/** Upsert de filas (on conflict store,sku). Sirve tanto para el poblado inicial como para ediciones. */
export async function guardarMapeo(store: SkuStore, rows: SkuMapRow[]): Promise<void> {
  const r = await apiFetch('/api/sku-map', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ store, rows }),
  })
  const d = await r.json()
  if (!d || !d.ok) throw new Error((d && d.error) || 'No se pudo guardar el mapeo.')
}

/** Marca (o des-marca) filas como validadas por SKU. */
export async function validarSkus(store: SkuStore, skus: string[], validado = true): Promise<void> {
  const r = await apiFetch('/api/sku-map', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ store, action: 'validar', skus, validado }),
  })
  const d = await r.json()
  if (!d || !d.ok) throw new Error((d && d.error) || 'No se pudo validar.')
}
