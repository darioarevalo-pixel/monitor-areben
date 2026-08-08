/**
 * Cómo se leen los números de una fila de insights — la cara tipada.
 *
 * ⚠️ **La lógica no vive acá: vive en `lib/meta-ads/metricas.core.js`**, en JS plano, porque la
 * necesitan `api/meta-ads.js` (que corre en Node sin el compilador de Next) y
 * `scripts/snapshot-meta.mjs` (que corre en GitHub Actions). El porqué de cada constante —sobre
 * todo por qué el ROAS sale de `purchase_roas` y no de `revenue / spend`— está en el core.
 */

import {
  ATTR as ATTR_JS,
  CAMPOS_INSIGHTS as CAMPOS_INSIGHTS_JS,
  COMPRA as COMPRA_JS,
  RE_PERFIL as RE_PERFIL_JS,
  RE_SEGUIDOR as RE_SEGUIDOR_JS,
  accion as accionJs,
  accionRe as accionReJs,
  metricasDe as metricasDeJs,
  num as numJs,
  sumaAcciones as sumaAccionesJs,
} from './metricas.core.js'

/** Una entrada de los arrays `actions` / `action_values` / `purchase_roas` de Meta. */
export type AccionMeta = { action_type?: string; value?: string | number }

/** Las métricas ya resueltas de una fila de insights. */
export type Metricas = {
  spend: number
  impressions: number
  reach: number
  frequency: number
  clicks: number
  ctr: number
  cpc: number
  cpm: number
  purchases: number
  revenue: number
  roas: number
  perfil: number
  seguidores: number
}

export const ATTR = ATTR_JS as string
export const COMPRA = COMPRA_JS as string
export const CAMPOS_INSIGHTS = CAMPOS_INSIGHTS_JS as string
export const RE_PERFIL = RE_PERFIL_JS as RegExp
export const RE_SEGUIDOR = RE_SEGUIDOR_JS as RegExp

export const num = numJs as (v: unknown) => number
export const accion = accionJs as (arr: AccionMeta[] | null | undefined, type: string) => number
export const accionRe = accionReJs as (arr: AccionMeta[] | null | undefined, re: RegExp) => number
export const sumaAcciones = sumaAccionesJs as (arr: AccionMeta[] | null | undefined) => number
export const metricasDe = metricasDeJs as (row: Record<string, unknown>) => Metricas
