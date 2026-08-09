/**
 * La foto diaria — la cara tipada.
 *
 * ⚠️ **La lógica no vive acá: vive en `lib/meta-ads/snapshot.core.js`**, en JS plano, porque la
 * importa `scripts/snapshot-meta.mjs`, que corre en GitHub Actions sin pasar por el compilador de
 * Next. El porqué de cada decisión (qué NO se puede sumar entre días, por qué el presupuesto sólo
 * es cierto el día de la foto) está en el docblock del core.
 */

import type { LineaPauta } from './tipos'
import {
  DIAS_POR_TRAMO as DIAS_POR_TRAMO_JS,
  DIAS_RELECTURA as DIAS_RELECTURA_JS,
  NIVELES_SNAPSHOT as NIVELES_SNAPSHOT_JS,
  entregando as entregandoJs,
  estadoRealDe as estadoRealDeJs,
  filaSnapshot as filaSnapshotJs,
  isoDia as isoDiaJs,
  sumarDias as sumarDiasJs,
  tramosDe as tramosDeJs,
} from './snapshot.core.js'

/** Los niveles de la jerarquía de Meta que se fotografían. */
export type NivelSnapshot = 'cuenta' | 'campania' | 'conjunto' | 'aviso'

/**
 * Si el objeto puede entregar de verdad, que no es lo mismo que si está activo.
 * `null` = no se pudo leer. **No saber no es lo mismo que estar apagado.**
 */
export type EstadoReal = 'entregando' | 'avisos-desactivados' | 'sin-avisos' | 'pausado'

/** Una fila de `meta_ads_snapshot_dia`, tal como la escribe el script. */
export type FilaSnapshot = {
  fecha: string
  nivel: NivelSnapshot
  objeto_id: string
  cuenta_id: string
  campaign_id: string | null
  adset_id: string | null
  nombre: string | null
  linea: LineaPauta | null
  objetivo: string | null
  estado: string | null
  estado_efectivo: string | null
  estado_real: EstadoReal | null
  /** En la UNIDAD MENOR de la moneda (en ARS, `150000` es $1.500). Ver `factorMoneda()`. */
  diario_crudo: number | null
  moneda: string | null
  spend: number
  impresiones: number
  /** 🔴 Dedup dentro del período: NO sumar entre días. */
  alcance: number
  /** 🔴 Ídem. */
  frecuencia: number
  clicks: number
  ctr: number
  cpc: number
  cpm: number
  compras: number
  revenue: number
  roas: number
  visitas_perfil: number
  seguidores: number
}

/** El total de una ventana. `alcance` y `frecuencia` son `null` a propósito: no se pueden sumar. */
export type TotalVentana = {
  spend: number
  impresiones: number
  clicks: number
  compras: number
  revenue: number
  visitas_perfil: number
  seguidores: number
  alcance: null
  frecuencia: null
  ctr: number
  cpc: number
  cpm: number
  roas: number
  dias: number
}

export const NIVELES_SNAPSHOT = NIVELES_SNAPSHOT_JS as readonly NivelSnapshot[]
export const DIAS_POR_TRAMO = DIAS_POR_TRAMO_JS as number
export const DIAS_RELECTURA = DIAS_RELECTURA_JS as number

export const isoDia = isoDiaJs as (d: Date) => string
export const tramosDe = tramosDeJs as (desde: string, hasta: string, dias?: number) => { since: string; until: string }[]
export const estadoRealDe = estadoRealDeJs as (
  estadoConjunto: string | null | undefined,
  avisos: { status?: string; effective_status?: string }[] | null | undefined,
) => EstadoReal | null
export const filaSnapshot = filaSnapshotJs as (
  row: Record<string, unknown>,
  nivel: NivelSnapshot,
  cuentaId: string,
  extras?: Partial<Record<string, unknown>>,
) => FilaSnapshot | null
export const sumarDias = sumarDiasJs as (filas: Partial<FilaSnapshot>[]) => TotalVentana
/** ¿Puede entregar todavía? `false` con `null` — pero eso es «no se sabe», no «pausado». */
export const entregando = entregandoJs as (estado: string | null | undefined) => boolean
