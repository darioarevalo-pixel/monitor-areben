/**
 * La cara TypeScript de `lib/ganadores/core.js`.
 *
 * El core es `.js` plano porque lo corre también `scripts/calibrar-umbral-ganadores.mjs`, que
 * calibra el umbral con la MISMA lógica que dibuja la pantalla. Acá se le pone tipo una sola vez.
 */

import type { Producto } from '@/lib/etl/tipos'
import {
  MIN_MODELOS_TANDA as MIN_MODELOS_TANDA_JS,
  UMBRAL_MIN_POR_MODELO as UMBRAL_MIN_POR_MODELO_JS,
  rankingDeTanda as rankingDeTandaJs,
  tandasDe as tandasDeJs,
} from './core.js'

/** Qué ranking manda en la tanda. `sin-ventas`: ningún lado vendió todavía. */
export type Senal = 'minorista' | 'mayorista' | 'sin-ventas'

/** Lo mínimo de `Producto` que el núcleo lee. */
export type ProductoTanda = Pick<
  Producto,
  'id' | 'name' | 'retailer_price' | 'stock' | 'ingresoFecha' | 'ventasMin' | 'ventasMay' | 'minOnline' | 'minLocal'
>

export type FilaGanador = {
  id: string
  name: string
  precio: number
  stock: number
  uMin: number
  uOnline: number
  uLocal: number
  uMay: number
  /** u/día desde la primera venta minorista de la tanda; `null` si todavía no hubo. */
  velMin: number | null
  /** u/día desde el alta. */
  velMay: number | null
  puestoMin: number
  puestoMay: number
  /** El puesto según la señal que manda. */
  puesto: number
  /** `puestoMay − puestoMin`: positivo = el público lo quiere más de lo que dice el mayorista. */
  desacople: number
}

export type RankingTanda = {
  alta: string | null
  modelos: number
  /** Primera venta minorista de la tanda: lo más cerca de la publicación en TN que hay. */
  inicioMin: string | null
  diasMin: number | null
  diasMay: number | null
  uMin: number
  uMay: number
  umbralUnidades: number
  /** 0..1 hacia el umbral. */
  progreso: number
  senal: Senal
  /** El minorista todavía no llegó al umbral. */
  ruido: boolean
  filas: FilaGanador[]
}

export type Tanda<P> = { fecha: string; productos: P[] }

export const UMBRAL_MIN_POR_MODELO: number = UMBRAL_MIN_POR_MODELO_JS
export const MIN_MODELOS_TANDA: number = MIN_MODELOS_TANDA_JS

export const tandasDe: <P extends Pick<Producto, 'ingresoFecha'>>(productos: P[], minModelos?: number) => Tanda<P>[] =
  tandasDeJs

// El `as` es porque el JS infiere `senal: string`; los valores posibles están en el core.
export const rankingDeTanda = rankingDeTandaJs as (
  productos: ProductoTanda[],
  opts: { umbralMinPorModelo: number; hoy: Date },
) => RankingTanda
