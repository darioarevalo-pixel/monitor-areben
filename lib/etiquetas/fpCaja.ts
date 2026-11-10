/**
 * La etiqueta de formas de pago de «Para reetiquetar», la cara tipada. ⚠️ La regla vive en
 * `fpCaja.core.js` (la arma `api/_liquidacion.js`, que ⛔ importa TypeScript).
 */

import { fpDeCaja as fpDeCajaJs, lineasFpDeCaja as lineasJs, pctDeEtiqueta as pctJs } from './fpCaja.core.js'
import type { LineaEtiqueta } from './tipos'

export interface PctEtiqueta {
  efectivo: number | null
  transferencia: number | null
}

export interface FpCaja {
  /** El de toda la tienda: la cuenta normal de cada forma de pago. */
  tienda: PctEtiqueta
  /** Las prendas que pagan otro: campaña con % propio, o feria (0). */
  porPrenda: Record<string, PctEtiqueta>
  /** Con reglas comerciales el % de una prenda ⛔ se anticipa: va el de la tienda y se avisa. */
  conReglasComerciales: boolean
}

export const fpDeCaja = fpDeCajaJs as (reglas: unknown) => FpCaja
export const pctDeEtiqueta = pctJs as (fp: FpCaja, pid: string | number) => PctEtiqueta
export const lineasFpDeCaja = lineasJs as (p: PctEtiqueta) => LineaEtiqueta[]
