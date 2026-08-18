/**
 * La cara TypeScript de `pyl.core.js` — el P&L «por arriba» por línea.
 *
 * El core es `.js` plano porque lo importa `api/_norte.js`, que corre en Node sin pasar por el
 * compilador de Next. Acá se le pone el tipo una sola vez, mismo patrón que `contribucion.ts`.
 */

import { baseDeReparto as baseDeRepartoJs, pylPorLinea as pylPorLineaJs } from './pyl.core.js'
import type { CoberturaPyl, PylFila } from './tipos'

/** Con qué se reparte una venta entre sus líneas, o `null` si no hay a qué línea atribuirla. */
export const baseDeReparto: (t: { mercaderia: number; unidades: number }) => 'mercaderia' | 'unidades' | null =
  baseDeRepartoJs

export const pylPorLinea: (args: {
  store: string
  ventas: unknown[]
  detalles: unknown[]
  skuPor: Map<string, string> | null
  cuentas: Record<string, string>
  comisiones: Record<string, number>
  desde: string
  hasta: string
}) => { lineas: PylFila[]; total: PylFila; cobertura: CoberturaPyl } = pylPorLineaJs
