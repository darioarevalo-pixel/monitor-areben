/**
 * La cara TypeScript de `contribucion.core.js`.
 *
 * El core es `.js` plano porque lo importa `api/_norte.js`, que corre en Node sin pasar por el
 * compilador de Next. Acá se le pone el tipo una sola vez, para que la pantalla no lo use `any` —
 * mismo patrón que `lib/meta-ads/rentabilidad.ts` y `lib/permisos.ts`.
 */

import {
  contribucionPorCanal as contribucionPorCanalJs,
  porUnidad as porUnidadJs,
  ventanaUltimos as ventanaUltimosJs,
} from './contribucion.core.js'
import type { Canal, ContribucionCanal, CoberturaContribucion } from './tipos'

/** La ventana de medición: los últimos `dias` días **terminando en el último día con venta**. */
export const ventanaUltimos: (
  fechas: (string | null | undefined)[],
  dias?: number,
) => { desde: string; hasta: string; dias: number } | null = ventanaUltimosJs

/** La contribución por unidad de cada canal, como la pide `ritmoDeSalida`. */
export const porUnidad: (canales: ContribucionCanal[] | undefined) => Partial<Record<Canal, number>> = porUnidadJs

export const contribucionPorCanal: (args: {
  ventas: unknown[]
  detalles: unknown[]
  cuentas: Record<string, string>
  comisiones: Record<string, number>
  desde: string
  hasta: string
}) => { canales: ContribucionCanal[]; cobertura: CoberturaContribucion } = contribucionPorCanalJs
