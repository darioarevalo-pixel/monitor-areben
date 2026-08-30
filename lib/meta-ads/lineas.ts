/**
 * Líneas de pauta — la cara tipada.
 *
 * ⚠️ **La lógica no vive acá: vive en `lib/meta-ads/lineas.core.js`**, en JS plano, porque
 * `api/meta-ads.js` y `api/_meta-funnel.js` la necesitan y no pueden importar TypeScript. El porqué
 * del eje entero (una sola cuenta publicitaria para las tres marcas, Stunned que no es una `Marca`)
 * está en el docblock del core.
 */

import type { Marca } from '@/lib/nav.datos'
import type { LineaPauta } from './tipos'
import {
  LINEAS as LINEAS_JS,
  ETIQUETA_LINEA as ETIQUETA_LINEA_JS,
  baseDeLinea as baseDeLineaJs,
  esLinea as esLineaJs,
  lineaDeEntrada as lineaDeEntradaJs,
  lineasDeMarca as lineasDeMarcaJs,
  sugerirLinea as sugerirLineaJs,
} from './lineas.core.js'

export const LINEAS = LINEAS_JS as readonly LineaPauta[]
export const ETIQUETA_LINEA = ETIQUETA_LINEA_JS as Record<LineaPauta, string>

export const esLinea = esLineaJs as (x: unknown) => boolean
export const baseDeLinea = baseDeLineaJs as (linea: string) => Marca | null
export const lineasDeMarca = lineasDeMarcaJs as (marca: Marca) => LineaPauta[]
export const sugerirLinea = sugerirLineaJs as (nombre: string | null | undefined) => LineaPauta | null
/**
 * Con qué línea abre la sección. `''` es «no dijo nada» y `'todas'` es «dijo todas»: ⛔ no son lo
 * mismo, y por eso el filtro de la URL arranca vacío en vez de en `'todas'`.
 */
export const lineaDeEntrada = lineaDeEntradaJs as (
  crudo: string | null | undefined,
  visibles: readonly LineaPauta[],
  marca: Marca | null | undefined,
) => 'todas' | LineaPauta
