/**
 * Acceso al endpoint propio `/api/meta-ads` (métricas de Meta Ads). Usa `apiFetch`
 * para mandar el header `x-monitor-auth` (el endpoint exige usuario logueado).
 *
 * Distingue "no se pudo leer" de "se leyó": una respuesta OK con cuentas/anuncios
 * vacíos es un éxito; solo `{ok:false}` significa que ni siquiera se pudo consultar
 * (token faltante, red, etc.).
 */

import { apiFetch } from '../api-fetch'
import type { DetalleCuenta, PresetMetaAds, RespuestaOverview } from './tipos'

export type Lectura<T> = { ok: true; dato: T } | { ok: false; motivo: string }

export type OpcionesMetaAds =
  | { preset: PresetMetaAds }
  | { since: string; until: string }

function rangoQS(opts: OpcionesMetaAds): URLSearchParams {
  const p = new URLSearchParams()
  if ('since' in opts) {
    p.set('since', opts.since)
    p.set('until', opts.until)
  } else {
    p.set('preset', opts.preset)
  }
  return p
}

async function pedir<T>(qs: URLSearchParams): Promise<Lectura<T>> {
  try {
    const r = await apiFetch(`/api/meta-ads?${qs.toString()}`)
    let d: (T & { ok?: boolean }) | { ok?: boolean; error?: unknown } | null = null
    try {
      d = await r.json()
    } catch {
      return { ok: false, motivo: `respuesta no-JSON (HTTP ${r.status})` }
    }
    if (!r.ok || !d || (d as { ok?: boolean }).ok !== true) {
      const err = (d as { error?: unknown })?.error
      // `detalle` trae el mensaje REAL de Meta (ej. token vencido). El endpoint lo
      // devuelve pero antes se descartaba, así que el error se veía genérico.
      const detalle = (d as { detalle?: unknown })?.detalle
      const extra = detalle ? ` — ${String(detalle).slice(0, 200)}` : ''
      return { ok: false, motivo: `HTTP ${r.status}: ${String(err ?? '').slice(0, 150)}${extra}` }
    }
    return { ok: true, dato: d as T }
  } catch (e) {
    return { ok: false, motivo: e instanceof Error ? e.message : String(e) }
  }
}

/** Overview: las cuentas del token con su total (para el selector). */
export function traerOverview(opts: OpcionesMetaAds): Promise<Lectura<RespuestaOverview>> {
  return pedir<RespuestaOverview>(rangoQS(opts))
}

/** Detalle de una cuenta: totales + campañas/anuncios + serie diaria + placements. */
export function traerDetalleCuenta(accountId: string, opts: OpcionesMetaAds): Promise<Lectura<DetalleCuenta>> {
  const qs = rangoQS(opts)
  qs.set('account', accountId)
  return pedir<DetalleCuenta>(qs)
}

/**
 * Pausa o activa un anuncio (POST, escribe en Meta). Requiere token con
 * ads_management y permiso (admin o `meta-ads.pausar`). Devuelve el nuevo status
 * o el motivo del fallo (incluye el detalle real de Meta si lo hay).
 */
export async function pausarAnuncio(adId: string, status: 'ACTIVE' | 'PAUSED'): Promise<Lectura<{ status: string }>> {
  try {
    const r = await apiFetch('/api/meta-ads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ad_id: adId, status }),
    })
    let d: { ok?: boolean; status?: string; error?: unknown; detalle?: unknown } | null = null
    try {
      d = await r.json()
    } catch {
      return { ok: false, motivo: `respuesta no-JSON (HTTP ${r.status})` }
    }
    if (!r.ok || !d || d.ok !== true) {
      const extra = d?.detalle ? ` — ${String(d.detalle).slice(0, 200)}` : ''
      return { ok: false, motivo: `HTTP ${r.status}: ${String(d?.error ?? '').slice(0, 150)}${extra}` }
    }
    return { ok: true, dato: { status: String(d.status || status) } }
  } catch (e) {
    return { ok: false, motivo: e instanceof Error ? e.message : String(e) }
  }
}
