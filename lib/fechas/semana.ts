/**
 * Los nombres de los días y de los meses, y cómo se acomoda una grilla mensual.
 *
 * Vive suelto y no adentro de una pantalla porque **ahora lo consumen dos grillas**: el calendario
 * editorial (Marketing, por marca) y el mes de la Agenda operativa (el local, sin marca). Mientras
 * hubo una sola, estaba bien que fuera privado de ese archivo; con dos, la copia sería el camino
 * corto a que una de las dos empiece la semana un día distinto que la otra.
 *
 * 🔴 **Acá conviven DOS ordenamientos de la semana y no se mezclan nunca.** `DIAS_CORTOS` se indexa
 * con `getDay()` —0 es domingo, la convención de JavaScript— y `DIAS_GRILLA` es el encabezado de la
 * grilla, que en Argentina arranca en lunes. Dar vuelta el primero para que "quede bien" en el
 * encabezado es el error que ya se cometió una vez: corre todas las etiquetas de fecha un día
 * **sin que falle nada ni se rompa un test**. El puente entre los dos es `columnaDe()`, y es el
 * único lugar donde la conversión existe.
 */

import { diaDeSemanaDe, diasDelMes, iso } from '@/lib/calendario'

export const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

/**
 * ⚠️ Indexado por `getDay()`, así que **el domingo va primero y este orden no se toca**: lo usa
 * `rotuloFecha()` para todas las etiquetas de fecha. Para el encabezado de la grilla está
 * `DIAS_GRILLA` — son dos cosas distintas.
 */
export const DIAS_CORTOS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']

/**
 * El encabezado de la grilla del mes: **en Argentina la semana empieza el lunes y termina el
 * domingo**, no como el `getDay()` de JavaScript, que es una convención de Estados Unidos.
 *
 * Va como array aparte —y no reordenando `DIAS_CORTOS`— porque aquél se indexa con `getDay()`.
 */
export const DIAS_GRILLA = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom']

/** `getDay()` (0=domingo) → columna de la grilla (0=lunes). El domingo se va al final. */
export function columnaDe(dow: number): number {
  return (dow + 6) % 7
}

/** `2026-10-18` → `dom 18-oct`. Sin `toLocaleDateString`, que se corre de día por zona horaria. */
export function rotuloFecha(f: string): string {
  const [, m, d] = f.split('-').map(Number)
  return `${DIAS_CORTOS[diaDeSemanaDe(f)]} ${d}-${MESES[m - 1].slice(0, 3)}`
}

/**
 * Las celdas de un mes, en el orden en que se pintan: los huecos del arranque y después los días.
 *
 * `null` es un hueco antes del día 1. **Un mes que arranca domingo deja seis huecos, no cero** —es
 * el caso que delata si la conversión a columna está bien—, y por eso esto se prueba solo, aparte
 * de cualquier pantalla: es la única parte de la grilla donde se puede correr todo un día.
 */
export function celdasDelMes(anio: number, mes: number): (number | null)[] {
  const primerHueco = columnaDe(diaDeSemanaDe(iso(anio, mes, 1)))
  const total = diasDelMes(anio, mes)
  return [...Array(primerHueco).fill(null), ...Array.from({ length: total }, (_, i) => i + 1)]
}

/**
 * El mes `n` corrimientos después (o antes) del que contiene a `fecha`, como `{anio, mes}`.
 *
 * Se hace con `Date.UTC` y no sumando al número de mes para no tener que acordarse del año: en
 * diciembre `+1` es enero del año que viene, y ése es exactamente el borde que se toca al navegar.
 */
export function mesCorrido(fecha: string, n: number): { anio: number; mes: number } {
  const d = new Date(Date.UTC(Number(fecha.slice(0, 4)), Number(fecha.slice(5, 7)) - 1 + n, 1))
  return { anio: d.getUTCFullYear(), mes: d.getUTCMonth() + 1 }
}
