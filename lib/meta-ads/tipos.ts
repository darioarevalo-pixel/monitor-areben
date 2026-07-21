/**
 * Tipos de "Meta Ads". Espejo de lo que devuelve `api/meta-ads.js` en sus dos modos:
 * overview (lista de cuentas) y detalle (una cuenta con anuncios/campañas + diaria + placements).
 */

/** Ventanas relativas que ofrece el selector (mapean 1:1 a date_preset de Meta). */
export type PresetMetaAds =
  | 'today' | 'yesterday' | 'last_7d' | 'last_14d' | 'last_30d' | 'last_90d'
  | 'this_month' | 'last_month' | 'maximum'

/** Métricas de una fila (cuenta, campaña o anuncio). Ventas/ROAS desde `omni_purchase`. */
export type Metricas = {
  spend: number
  impressions: number
  clicks: number
  /** % (ya viene como porcentaje). */
  ctr: number
  cpc: number
  cpm: number
  purchases: number
  revenue: number
  /** Retorno (ingresos ÷ gasto). */
  roas: number
  /** Solo a nivel cuenta (dedup — no se suma en subtotales). */
  reach?: number
  frequency?: number
}

/** Una cuenta en el modo overview (para el selector + vistazo). */
export type CuentaMetaAds = Partial<Metricas> & {
  /** account_id (sin `act_`). */
  id: string
  nombre: string
  moneda: string
  /** La cuenta existe pero no tuvo actividad en la ventana. */
  sinDatos?: boolean
  /** Falló el insights de ESA cuenta. */
  error?: string
}

export type RespuestaOverview = {
  rango: PresetMetaAds | { since: string; until: string }
  cuentas: CuentaMetaAds[]
}

/** Rótulo de ranking de Meta (arriba/promedio/debajo del promedio, o UNKNOWN). */
export type Ranking = string | null

/** Diagnóstico de creativo: cómo rankea Meta el anuncio vs. otros que compiten por el mismo público. */
export type RankingAd = { quality: Ranking; engagement: Ranking; conversion: Ranking }

/** Métricas de video de una fila. `hookRate` = reproducciones de 3s ÷ impresiones (%). */
export type VideoMetricas = { plays3s: number; thruplay: number; hookRate: number }

/** Estado de entrega de un anuncio (effective_status de Meta): ACTIVE, PAUSED, etc. */
export type EstadoAd = string | null

/** Una fila de anuncio (level=ad), con su contexto de campaña/conjunto y enriquecimientos. */
export type AdRow = Metricas & {
  ad_id: string
  ad_name: string
  adset_name: string
  campaign_id: string
  campaign_name: string
  /** Enriquecimientos (pueden faltar si su call falló): estado, diagnóstico, video. */
  status?: EstadoAd
  /** Miniatura del creativo (thumbnail_url de Meta), o null si no la trajo. */
  thumb?: string | null
  /** Link al aviso publicado (permalink de IG o historia de FB), o null. */
  permalink?: string | null
  ranking?: RankingAd | null
  video?: VideoMetricas
}

/** Un paso del embudo de compra, con cantidad y costo por resultado. */
export type FunnelPaso = { key: string; label: string; count: number; costo: number }

/** Una fila del desglose por edad × género. */
export type DemografiaFila = { age: string; gender: string; spend: number; purchases: number; revenue: number }

/** Una fila del desglose por región. */
export type RegionFila = { region: string; spend: number; purchases: number; revenue: number }

/** Una campaña con su subtotal y sus anuncios. */
export type Campaña = { id: string; nombre: string; totales: Metricas; ads: AdRow[] }

/** Un punto de la serie diaria. */
export type DailyPoint = { date: string; spend: number; revenue: number; purchases: number }

/** Una fila del desglose por plataforma × ubicación. */
export type Placement = { platform: string; position: string; spend: number; purchases: number; revenue: number }

/** El detalle completo de una cuenta. */
export type DetalleCuenta = {
  rango: PresetMetaAds | { since: string; until: string }
  cuenta: { id: string; nombre: string; moneda: string }
  totales: Metricas
  /** Embudo de compra de la cuenta (clic → web → carrito → checkout → compra). */
  funnel: FunnelPaso[]
  /** Video de la cuenta (hook rate y reproducciones). */
  video: VideoMetricas
  /** Desglose por edad × género (ordenado por gasto). */
  demografia: DemografiaFila[]
  /** Desglose por región (top por gasto). */
  regiones: RegionFila[]
  campañas: Campaña[]
  daily: DailyPoint[]
  placements: Placement[]
}
