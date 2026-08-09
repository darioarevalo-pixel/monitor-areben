/**
 * «Cómo viene» — la cara tipada.
 *
 * ⚠️ **La lógica no vive acá: vive en `lib/meta-ads/tendencia.core.js`**, en JS plano, porque la
 * importa `api/_meta-tendencia.js`, que corre en Node sin pasar por el compilador de Next. El porqué
 * de cada decisión (por qué ninguna ventana incluye hoy, por qué el período anterior puede no
 * existir y eso no es un cero) está en el docblock del core.
 */

import type { LineaPauta } from './tipos'
import {
  MINIMO_COMPARABLE as MINIMO_COMPARABLE_JS,
  comparar as compararJs,
  diaDesplazado as diaDesplazadoJs,
  diasDe as diasDeJs,
  diasEntre as diasEntreJs,
  hoyIso as hoyIsoJs,
  serieDe as serieDeJs,
  variacion as variacionJs,
  ventanasDe as ventanasDeJs,
} from './tendencia.core.js'

/** Una ventana de días, con los dos extremos adentro. */
export type Ventana = { desde: string; hasta: string }

/**
 * Las dos ventanas a comparar.
 *
 * 🔴 `anterior` es `null` cuando la foto no da para un par comparable. **No es «gastó cero»**: es
 * «todavía no se puede saber», y la pantalla tiene que decir eso y no dibujar un −100%.
 */
export type Ventanas = {
  actual: Ventana
  anterior: Ventana | null
  /** El largo real de cada ventana, que puede ser menor al pedido. */
  dias: number
  /** Los días que pidió el selector del Panel. */
  pedidos: number
  /** `true` cuando `dias < pedidos` porque la foto no llegaba. */
  recortado: boolean
  /** El primer día que hay en la foto. Es lo que explica el recorte, y sale del dato, no de una constante. */
  primeraFoto: string | null
  /** Cuántos días de foto hay en total hasta ayer. */
  disponibles: number
}

/** Los totales de una ventana. `cpa` en `null` es «no hubo compras», nunca «salió gratis». */
export type TotalTendencia = {
  gasto: number
  compras: number
  revenue: number
  impresiones: number
  clicks: number
  ctr: number
  roas: number
  cpa: number | null
  diasConGasto: number
}

/** Un par actual/anterior. `anterior` en `null` cuando no hay con qué comparar. */
export type Par = { actual: TotalTendencia; anterior: TotalTendencia | null }

/** Un día de la serie. Sin ratios a propósito: ver `serieDe()` en el core. */
export type PuntoSerie = {
  fecha: string
  gasto: number
  revenue: number
  compras: number
  tramo: 'actual' | 'anterior'
}

export type Comparacion = {
  total: Par
  porLinea: Partial<Record<LineaPauta, Par>>
  /** El gasto que no entra en ningún total porque su campaña no tiene marca asignada. */
  sinLinea: { actual: number; anterior: number | null }
  serie: PuntoSerie[]
}

/** Lo que contesta `GET /api/meta-ads?recurso=tendencia`. */
export type RespuestaTendencia = Comparacion & {
  ok: true
  ventanas: Ventanas
  /** Cuándo se leyó la foto por última vez. Es lo que dice si el cron corrió. */
  ultimaFoto: string | null
}

export const MINIMO_COMPARABLE = MINIMO_COMPARABLE_JS as number

export const diaDesplazado = diaDesplazadoJs as (iso: string, n: number) => string | null
export const diasEntre = diasEntreJs as (a: string, b: string) => number
export const diasDe = diasDeJs as (v: Ventana | null) => string[]
export const hoyIso = hoyIsoJs as () => string
export const ventanasDe = ventanasDeJs as (hoy: string, dias: number, primeraFoto: string | null) => Ventanas
/** La variación como PROPORCIÓN (0,164 = +16,4%), para `pctFirmado`. `null` si la base es 0. */
export const variacion = variacionJs as (a: number | null, b: number | null) => number | null
export const serieDe = serieDeJs as (filas: Record<string, unknown>[], ventanas: Ventanas) => PuntoSerie[]
export const comparar = compararJs as (
  filas: Record<string, unknown>[],
  opciones: { ventanas: Ventanas; visibles: LineaPauta[] },
) => Comparacion

/** Un punto del sparkline, ya en coordenadas del `viewBox`. */
export type PuntoXY = { x: number; y: number }

/**
 * Los valores llevados a coordenadas de un `viewBox`, para dibujar la línea.
 *
 * Tres decisiones que se ven en pantalla:
 *
 * 1. 🔑 **El piso es SIEMPRE 0, no el mínimo de la serie.** Un sparkline auto-escalado entre el
 *    mínimo y el máximo convierte una variación del 2% en una montaña: la forma pasa a depender de
 *    cuánto se parecen los días entre sí, no de cuánto se gastó. Con piso en 0 la altura significa
 *    plata.
 * 2. Con todos los valores en cero la línea va **abajo**, chata. Es lo que pasó: no gastó nada.
 * 3. Los extremos entran `inset` de medio píxel para que el trazo no quede cortado al ras del borde.
 */
export function puntosSparkline(valores: number[], ancho: number, alto: number, inset = 1): PuntoXY[] {
  const n = valores.length
  if (n === 0) return []
  const max = Math.max(0, ...valores)
  const útil = Math.max(1, alto - inset * 2)
  // Con un solo punto no hay línea que dibujar: se lo pone al medio para que el `<circle>` del
  // componente tenga dónde ir.
  const x = (i: number) => (n === 1 ? ancho / 2 : (i / (n - 1)) * ancho)
  const y = (v: number) => (max === 0 ? alto - inset : alto - inset - (Math.max(0, v) / max) * útil)
  return valores.map((v, i) => ({ x: x(i), y: y(v) }))
}

/** Los puntos como los quiere el atributo `points` de un `<polyline>`. */
export function trazo(puntos: PuntoXY[]): string {
  return puntos.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ')
}
