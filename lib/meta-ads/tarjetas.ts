/**
 * Tarjetas de carrusel — la cara tipada.
 *
 * ⚠️ **La lógica no vive acá: vive en `lib/meta-ads/tarjetas.core.js`**, en JS plano, porque
 * `api/meta-ads.js` la necesita y no puede importar TypeScript. El porqué de todo el rescate está
 * en el docblock del core.
 */

import {
  TOPE_TARJETAS as TOPE_TARJETAS_JS,
  historiasARescatar as historiasARescatarJs,
  tarjetasDeHistoria as tarjetasDeHistoriaJs,
  tarjetasPorHistoria as tarjetasPorHistoriaJs,
} from './tarjetas.core.js'

/** Un aviso, visto por el rescate: sólo le importa quién es y si ya tiene tarjetas. */
export type AvisoARescatar = { id: string; piezas: string[] }

export const TOPE_TARJETAS = TOPE_TARJETAS_JS as number

export const historiasARescatar = historiasARescatarJs as <T extends AvisoARescatar>(
  ads: T[],
  historiaPorId: Map<string, string>,
  tope: number,
) => Map<string, T[]>

export const tarjetasDeHistoria = tarjetasDeHistoriaJs as (nodo: unknown) => string[]

export const tarjetasPorHistoria = tarjetasPorHistoriaJs as (data: unknown) => Map<string, string[]>
