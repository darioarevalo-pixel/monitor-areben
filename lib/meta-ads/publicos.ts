/**
 * Fría vs remarketing — la cara tipada.
 *
 * ⚠️ **La clasificación no vive acá: vive en `lib/meta-ads/publicos.core.js`**, en JS plano, porque
 * `api/_meta-publicos.js` la necesita y ⛔ no puede importar TypeScript. Todo el porqué —incluida la
 * advertencia grande de que **«público abierto» ⛔ NO es «gente nueva»**, y que la atribución de
 * Meta le regala la compra al remarketing— está en el docblock del núcleo.
 */

import {
  AYUDA_PUBLICO as AYUDA_PUBLICO_JS,
  ETIQUETA_PUBLICO as ETIQUETA_PUBLICO_JS,
  PUBLICOS as PUBLICOS_JS,
  parteDe as parteDeJs,
  publicoDe as publicoDeJs,
  repartirPorPublico as repartirPorPublicoJs,
  sesgoDeAtribucion as sesgoDeAtribucionJs,
  veredictoDePublicos as veredictoDePublicosJs,
} from './publicos.core.js'

export type Publico = 'remarketing' | 'fria' | 'abierta'
/** ⚠️ `sin-clasificar` ⛔ NO es un público: es plata que gastó un conjunto que Meta ya no lista. */
export type PublicoOSin = Publico | 'sin-clasificar'

export const PUBLICOS = PUBLICOS_JS as readonly Publico[]
export const ETIQUETA_PUBLICO = ETIQUETA_PUBLICO_JS as Record<PublicoOSin, string>
export const AYUDA_PUBLICO = AYUDA_PUBLICO_JS as Record<PublicoOSin, string>

/** `null` = ⛔ no se pudo leer el `targeting`. ⛔ Nunca «abierta» por descarte. Ver el núcleo. */
export const publicoDe = publicoDeJs as (targeting: unknown) => Publico | null

export type PartePublico = {
  publico: PublicoOSin
  spend: number
  compras: number
  revenue: number
  clicks: number
  impresiones: number
  conjuntos: number
  /** Qué fracción del gasto de la ventana se lleva. Es **el número que este módulo mide bien**. */
  parte: number
  /** ⚠️ De la atribución de META, ⛔ no de la caja de la tienda. ⛔ No ordena un ranking. */
  costoMeta: number
  roas: number
}

export type VeredictoPublicos = {
  clase: 'sin-base' | 'no-se-puede-partir' | 'solo-conocidos' | 'sin-remarketing' | 'repartido'
  titulo: string
  detalle: string
  /** Qué se hace mañana. `null` cuando ⛔ no hay nada que hacer con esto. */
  mano: string | null
}

export type Sesgo = { costoRemarketing: number; costoResto: number; veces: number }

export type RespuestaPublicos = {
  ok: true
  linea: string
  dias: number
  desde?: string
  hasta?: string
  /** `false` ⇒ Graph ⛔ no contestó: hay `total` y `motivo`, y ⛔ no hay reparto. */
  clasificado: boolean
  partes: PartePublico[] | null
  total?: number
  motivo?: string
  veredicto?: VeredictoPublicos
  sesgo?: Sesgo | null
  cobertura?: {
    conjuntosEnMeta: number
    conGastoEnLaVentana: number
    sinPublicoLeido: number
    sinTargeting: number
  }
}

export const repartirPorPublico = repartirPorPublicoJs as (
  filas: unknown[],
  publicos: Map<string, Publico>,
) => { partes: PartePublico[]; total: number }
export const parteDe = parteDeJs as (partes: PartePublico[], publico: PublicoOSin) => number
export const veredictoDePublicos = veredictoDePublicosJs as (
  partes: PartePublico[],
  opts?: { total?: number; marca?: string; minGasto?: number },
) => VeredictoPublicos
export const sesgoDeAtribucion = sesgoDeAtribucionJs as (partes: PartePublico[]) => Sesgo | null
