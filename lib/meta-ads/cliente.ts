/**
 * Acceso al endpoint propio `/api/meta-ads` (métricas de Meta Ads). Usa `apiFetch`
 * para mandar el header `x-monitor-auth` (el endpoint exige usuario logueado).
 *
 * Distingue "no se pudo leer" de "se leyó": una respuesta OK con cuentas/anuncios
 * vacíos es un éxito; solo `{ok:false}` significa que ni siquiera se pudo consultar
 * (token faltante, red, etc.).
 */

import { apiFetch } from '../api-fetch'
import type {
  DetalleCuenta, PresetMetaAds, RespuestaCreativos, RespuestaDiagnostico, RespuestaEtapas, RespuestaOverview,
} from './tipos'

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
 * Censo de campañas para el diagnóstico de etapas (TOFU/MOFU/BOFU), repartido por línea de pauta.
 *
 * **No lleva marca**: las tres líneas se pautean desde la misma cuenta publicitaria, así que el
 * censo que hay que pedirle a Meta es idéntico para las tres y pedirlo una vez por marca sería
 * triplicar el gasto de Graph para cortar los mismos datos. El servidor devuelve sólo las líneas que
 * el perfil puede ver, así que el corte de permisos sigue siendo suyo, no de la pantalla.
 *
 * La ventana es fija (30 o 90 días, ver `UMBRALES_ETAPA`) y por eso no toma el rango del selector
 * del Resumen.
 */
export function traerEtapas(dias?: number): Promise<Lectura<RespuestaEtapas>> {
  const qs = new URLSearchParams({ recurso: 'etapas' })
  if (dias) qs.set('dias', String(dias))
  return pedir<RespuestaEtapas>(qs)
}

/**
 * Los avisos de UNA campaña, con su creativo: la imagen, el título, el texto y el botón.
 *
 * Va por campaña y a demanda —cuando alguien despliega la fila—, no junto con el censo: son tres
 * llamadas a Graph por campaña, y el censo lista más de 170. La ventana es la misma del censo,
 * porque el gasto de cada aviso se lee al lado del de su campaña y con otra ventana no cerrarían.
 */
export function traerCreativos(campaignId: string, dias?: number): Promise<Lectura<RespuestaCreativos>> {
  const qs = new URLSearchParams({ recurso: 'creativos', campania: campaignId })
  if (dias) qs.set('dias', String(dias))
  return pedir<RespuestaCreativos>(qs)
}

/**
 * ¿El token puede escribir en Meta? Solo admin.
 *
 * Sin `probar` contesta lo que se puede saber sin tocar nada (`user_tasks` por cuenta y los
 * scopes, si Meta los da). Con `probar` hace además una **escritura idempotente** —pisar el
 * nombre de una campaña con el que ya tiene— que es la única forma de distinguir "falta el scope
 * `ads_management`" de "falta el permiso de la cuenta", porque los dos fallan igual desde afuera.
 */
export function traerDiagnostico(probar = false): Promise<Lectura<RespuestaDiagnostico>> {
  const qs = new URLSearchParams({ recurso: 'diagnostico' })
  if (probar) qs.set('probar', '1')
  return pedir<RespuestaDiagnostico>(qs)
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
