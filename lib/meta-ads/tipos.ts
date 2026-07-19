/**
 * Tipos de "Meta Ads" (métricas de gasto/rendimiento de las cuentas publicitarias
 * de Meta). Espejo de lo que devuelve `api/meta-ads.js`.
 */

/** Ventanas relativas que ofrece el selector (mapean 1:1 a date_preset de Meta). */
export type PresetMetaAds =
  | 'today' | 'yesterday' | 'last_7d' | 'last_14d' | 'last_30d' | 'last_90d'
  | 'this_month' | 'last_month' | 'maximum'

/** Una cuenta publicitaria con sus métricas en la ventana pedida. */
export type CuentaMetaAds = {
  /** account_id (sin el prefijo `act_`). */
  id: string
  nombre: string
  /** Moneda de la cuenta (ISO, ej. ARS/USD). */
  moneda: string
  spend?: number
  impressions?: number
  clicks?: number
  /** % (ya viene como porcentaje de Meta). */
  ctr?: number
  cpc?: number
  cpm?: number
  reach?: number
  frequency?: number
  /** La cuenta existe pero no tuvo actividad en la ventana. */
  sinDatos?: boolean
  /** Falló el insights de ESA cuenta (las demás pueden venir bien). */
  error?: string
}

export type RespuestaMetaAds = {
  /** El preset usado, o el rango `{since, until}` si fue custom. */
  rango: PresetMetaAds | { since: string; until: string }
  cuentas: CuentaMetaAds[]
}
