/**
 * La receta de un conjunto, del lado tipado.
 *
 * ⚠️ La lógica —qué se corrige, qué se copia, qué es un sentinela de «vacío»— **no vive acá**: vive
 * en `lib/meta-ads/receta.core.js`, en JS plano, porque `api/_meta-planes.js` la necesita y no puede
 * importar TypeScript. Este archivo aporta los tipos, y es de donde comen los tests y la pantalla.
 */

import {
  CAMPOS_RECETA as CAMPOS_RECETA_JS,
  CAMPOS_MUERTOS_TARGETING as CAMPOS_MUERTOS_TARGETING_JS,
  CLAVES_PROMOTED as CLAVES_PROMOTED_JS,
  conDiario as conDiarioJs,
  corregirTargeting as corregirTargetingJs,
  escalonesDeDiario as escalonesDeDiarioJs,
  esRechazoDePresupuesto as esRechazoDePresupuestoJs,
  minimoDeMensaje as minimoDeMensajeJs,
  recetaDeConjunto as recetaDeConjuntoJs,
  repartoDePresupuesto as repartoDePresupuestoJs,
  SENTINELAS as SENTINELAS_JS,
  SUBCODIGO_PRESUPUESTO_BAJO as SUBCODIGO_PRESUPUESTO_BAJO_JS,
  tieneValor as tieneValorJs,
  VALIDAR_SOLO as VALIDAR_SOLO_JS,
} from './receta.core.js'

/** El `targeting` tal como lo devuelve Graph: se conoce lo que se toca, el resto pasa de largo. */
export type Targeting = Record<string, unknown> & {
  instagram_positions?: string[]
  publisher_platforms?: string[]
  targeting_optimization?: string
}

/** El conjunto leído de Meta con `CAMPOS_RECETA`. */
export interface ConjuntoLeido {
  id?: string
  name?: string
  campaign_id?: string
  account_id?: string
  daily_budget?: string | number
  lifetime_budget?: string | number
  billing_event?: string
  optimization_goal?: string
  bid_strategy?: string
  bid_amount?: string | number
  destination_type?: string
  pacing_type?: string[]
  promoted_object?: Record<string, unknown>
  attribution_spec?: unknown[]
  start_time?: string
  end_time?: string
  targeting?: Targeting
}

/** El cuerpo del POST, ya listo para `act_<id>/adsets`. Todo va como texto: es `urlencoded`. */
export type CuerpoReceta = Record<string, string>

export interface Receta {
  cuerpo: CuerpoReceta
  /** Lo que hubo que tocar, en castellano. Es lo que la pantalla muestra antes de «Empezar». */
  notas: string[]
}

type Falla = { ok: false; status: number; error: string }

export const CAMPOS_RECETA = CAMPOS_RECETA_JS as string
export const CAMPOS_MUERTOS_TARGETING = CAMPOS_MUERTOS_TARGETING_JS as string[]
export const CLAVES_PROMOTED = CLAVES_PROMOTED_JS as string[]
export const SENTINELAS = SENTINELAS_JS as string[]
export const SUBCODIGO_PRESUPUESTO_BAJO = SUBCODIGO_PRESUPUESTO_BAJO_JS as number
export const VALIDAR_SOLO = VALIDAR_SOLO_JS as { execution_options: string }

export const tieneValor = tieneValorJs as (v: unknown) => boolean
export const corregirTargeting = corregirTargetingJs as (t: Targeting | null | undefined) => {
  targeting: Targeting
  notas: string[]
}
export const recetaDeConjunto = recetaDeConjuntoJs as (
  orig: ConjuntoLeido | null | undefined,
  ahora?: number,
) => ({ ok: true } & Receta) | Falla
export const repartoDePresupuesto = repartoDePresupuestoJs as (
  o: ConjuntoLeido,
  ahora: number,
) => { ok: true; campos: CuerpoReceta; notas: string[] } | Falla
export const esRechazoDePresupuesto = esRechazoDePresupuestoJs as (error: unknown) => boolean
export const minimoDeMensaje = minimoDeMensajeJs as (mensaje: string) => number | null
export const escalonesDeDiario = escalonesDeDiarioJs as (
  mensaje: string,
  minimos: { minDiarioCrudo?: number; minDiarioAlto?: number } | null,
) => number[]
export const conDiario = conDiarioJs as (
  cuerpo: CuerpoReceta,
  valor: number,
) => { ok: true; antes: number; ahora: number; cuerpo: CuerpoReceta; nota: string } | { ok: false }
