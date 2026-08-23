/**
 * La serie diaria de ventas. **La implementación vive en `core.js`**, que es `.js` plano porque
 * `api/_ventas-diarias.js` la corre en el servidor y los handlers no pueden importar TypeScript.
 * Acá sólo se le pone el tipo, una vez.
 */

import type { Canal } from '@/lib/liquidacion/resultado'
import {
  TOPE_DIAS as TOPE_DIAS_JS,
  conSemanaAnterior as conSemanaAnteriorJs,
  serieDiaria as serieDiariaJs,
  totalDelTramo as totalDelTramoJs,
} from './core.js'

/** Lo que se vendió: cuántas compras, cuántas unidades y cuánta plata. */
export type Corte = { compras: number; unidades: number; plata: number }

/**
 * Un día de la serie.
 *
 * `completo` en `false` es «todavía se está midiendo» (el espejo se llena a las 4 de la mañana),
 * y en `null` es «no se pudo saber». ⛔ Ninguno de los dos es un cero.
 */
export type DiaVenta = {
  fecha: string
  completo: boolean | null
  total: Corte
  porCanal: Record<Canal, Corte>
}

/** Un día visible, con el mismo día de la semana anterior al lado (`null` si no se consultó). */
export type DiaConPrevio = DiaVenta & { previo: Corte | null }

export type SerieDiaria = {
  dias: DiaVenta[]
  /** Los canales que tuvieron alguna venta en la ventana, en el orden de `CANALES`. */
  canales: Canal[]
  /** Los nombres crudos de Gestión Nube que cayeron en cada canal. Es lo que hace preguntable a «Otros canales». */
  nombresPorCanal: Partial<Record<Canal, string[]>>
  /** Cuántas ventas técnicas se excluyeron. Se muestra: sacarlas sin decirlo deja un hueco que parece un día flojo. */
  tecnicas: number
  /** El cotejo de la plata contra `ventas.total_price`, que llega por otro camino. */
  control: { facturado: number; totalPrice: number; ventas: number }
}

/** Hasta dónde el espejo se corrige solo: el sync relee 90 días completos en cada corrida. */
export const TOPE_DIAS: number = TOPE_DIAS_JS

// El `as` es el mismo recurso que usa `lib/memo/tipos.ts` con sus dos cores: el JSDoc de un `.js`
// infiere `canales: string[]` y acá se sabe que son `Canal[]`, porque salen de `CANALES`.
export const serieDiaria = serieDiariaJs as (args: {
  ventas: unknown[]
  detalles: unknown[]
  desde: string
  hasta: string
  medidoHasta: string | null
}) => SerieDiaria

export const conSemanaAnterior = conSemanaAnteriorJs as (serie: SerieDiaria, visible: string) => DiaConPrevio[]

export const totalDelTramo = totalDelTramoJs as (filas: DiaConPrevio[]) => {
  total: Corte
  previo: Corte | null
  conPrevio: number
  incompletos: number
}
