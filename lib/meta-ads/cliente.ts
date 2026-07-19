/**
 * Acceso al endpoint propio `/api/meta-ads` (métricas de Meta Ads). Usa `apiFetch`
 * para mandar el header `x-monitor-auth` (el endpoint exige usuario logueado).
 *
 * Distingue "no se pudo leer" de "se leyó": una respuesta OK con cuentas vacías o
 * con `sinDatos`/`error` por cuenta es un éxito a nivel request; solo `{ok:false}`
 * significa que ni siquiera se pudo consultar (token faltante, red, etc.).
 */

import { apiFetch } from '../api-fetch'
import type { PresetMetaAds, RespuestaMetaAds } from './tipos'

export type Lectura<T> = { ok: true; dato: T } | { ok: false; motivo: string }

export type OpcionesMetaAds =
  | { preset: PresetMetaAds }
  | { since: string; until: string }

export async function traerMetaAds(opts: OpcionesMetaAds): Promise<Lectura<RespuestaMetaAds>> {
  const params = new URLSearchParams()
  if ('since' in opts) {
    params.set('since', opts.since)
    params.set('until', opts.until)
  } else {
    params.set('preset', opts.preset)
  }
  try {
    const r = await apiFetch(`/api/meta-ads?${params.toString()}`)
    let d: { ok?: boolean; error?: unknown; rango?: unknown; cuentas?: unknown } | null = null
    try {
      d = await r.json()
    } catch {
      return { ok: false, motivo: `respuesta no-JSON (HTTP ${r.status})` }
    }
    if (!r.ok || !d?.ok) {
      return { ok: false, motivo: `HTTP ${r.status}: ${String(d?.error ?? '').slice(0, 150)}` }
    }
    return {
      ok: true,
      dato: {
        rango: d.rango as RespuestaMetaAds['rango'],
        cuentas: Array.isArray(d.cuentas) ? (d.cuentas as RespuestaMetaAds['cuentas']) : [],
      },
    }
  } catch (e) {
    return { ok: false, motivo: e instanceof Error ? e.message : String(e) }
  }
}
