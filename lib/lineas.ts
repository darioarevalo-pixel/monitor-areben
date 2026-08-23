/**
 * La línea de negocio — la cara tipada.
 *
 * ⚠️ **La lógica no vive acá: vive en `lib/lineas.core.js`**, en JS plano, porque los handlers de
 * `api/*.js` la necesitan y no pueden importar TypeScript. El porqué del eje entero —qué es una
 * línea, por qué Stunned no es una `Marca`, y por qué el prefijo de SKU es el único separador que
 * hay— está en el docblock del core, y el mapa de quién la conoce en `docs/lineas.md`.
 */

import type { Marca } from '@/lib/nav.datos'
import {
  LINEAS as LINEAS_JS,
  ETIQUETA_LINEA as ETIQUETA_LINEA_JS,
  baseDeLinea as baseDeLineaJs,
  esLinea as esLineaJs,
  esStunned as esStunnedJs,
  lineaDe as lineaDeJs,
  lineasDeMarca as lineasDeMarcaJs,
} from './lineas.core.js'

/** Las tres líneas del negocio. ⚠️ NO es `Marca`: Stunned no tiene base ni permisos propios. */
export type Linea = 'bdi' | 'zattia' | 'stunned'

export const LINEAS = LINEAS_JS as readonly Linea[]
export const ETIQUETA_LINEA = ETIQUETA_LINEA_JS as Record<Linea, string>

export const esLinea = esLineaJs as (x: unknown) => boolean
export const baseDeLinea = baseDeLineaJs as (linea: string) => Marca | null
export const lineasDeMarca = lineasDeMarcaJs as (marca: Marca) => Linea[]
export const esStunned = esStunnedJs as (sku: string | null | undefined) => boolean
export const lineaDe = lineaDeJs as (store: Marca | string, sku: string | null | undefined) => Linea
