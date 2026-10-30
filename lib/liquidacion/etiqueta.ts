/**
 * Re-export tipado de `etiqueta.core.js` — el diseño de la etiqueta de una campaña.
 *
 * El núcleo es `.js` plano porque lo importa `api/_liquidacion.js`, que corre en Node sin pasar por
 * el compilador de Next. Mismo patrón que `tipo.core.js` / `tipo.ts`.
 */
import {
  etiquetaDeCampania as etiquetaDeCampaniaJs,
  etiquetaPersonalizada as etiquetaPersonalizadaJs,
  MAX_LINEAS_ABAJO as MAX_LINEAS_ABAJO_JS,
  MAX_TEXTO_LINEA as MAX_TEXTO_LINEA_JS,
  TAM_PRECIO_DEFAULT as TAM_PRECIO_DEFAULT_JS,
  TAM_PRECIO_MAX as TAM_PRECIO_MAX_JS,
  TAM_PRECIO_MIN as TAM_PRECIO_MIN_JS,
  PCT_EFECTIVO_DEFAULT as PCT_EFECTIVO_DEFAULT_JS,
  CUOTAS_DEFAULT as CUOTAS_DEFAULT_JS,
} from './etiqueta.core.js'
import type { LineaEtiqueta } from '@/lib/etiquetas/tipos'

/** Cómo se dibuja la etiqueta de esta campaña. */
export interface EtiquetaCampania {
  /** Los renglones que van DEBAJO del precio: las condiciones del evento. */
  abajo: LineaEtiqueta[]
  /** Cuerpo del precio, en puntos. */
  tamPrecio: number
  /** Cuerpo del título (el nombre comercial), con la escala de `LineaEtiqueta`. */
  tamTitulo: LineaEtiqueta['tam']
  /** Etiqueta completa por prenda + formas de pago con sus montos (ver `etiqueta.core.js`). */
  porPrenda: boolean
  /** % que efectivo/transferencia es más barato que la tarjeta. */
  pctEfectivo: number
  /** Cuotas sin interés con tarjeta. */
  cuotas: number
}

export const etiquetaDeCampania = etiquetaDeCampaniaJs as (raw: unknown) => EtiquetaCampania
export const etiquetaPersonalizada = etiquetaPersonalizadaJs as (e: unknown) => boolean
export const MAX_LINEAS_ABAJO = MAX_LINEAS_ABAJO_JS as number
export const MAX_TEXTO_LINEA = MAX_TEXTO_LINEA_JS as number
export const TAM_PRECIO_DEFAULT = TAM_PRECIO_DEFAULT_JS as number
export const TAM_PRECIO_MIN = TAM_PRECIO_MIN_JS as number
export const TAM_PRECIO_MAX = TAM_PRECIO_MAX_JS as number
export const PCT_EFECTIVO_DEFAULT = PCT_EFECTIVO_DEFAULT_JS as number
export const CUOTAS_DEFAULT = CUOTAS_DEFAULT_JS as number
