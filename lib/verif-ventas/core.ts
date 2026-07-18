/**
 * Lógica pura de Verificación de ventas: rango del mes y partición del resultado en
 * pendientes/resueltas. Port de _vvtaRango y el particionado de vvtaRender
 * (index.html:11128/11172-11176).
 */

import type { Discrepancia, Resueltas } from './tipos'

/** `YYYY-MM` del mes de una fecha. Port de _vvtaMesActual. */
export function mesDe(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** Rango `from`/`to` (primer y último día) de un mes `YYYY-MM`. Port de _vvtaRango. */
export function rango(mes: string): { from: string; to: string } {
  const [y, m] = mes.split('-').map(Number)
  const last = new Date(y, m, 0).getDate()
  return { from: `${mes}-01`, to: `${mes}-${String(last).padStart(2, '0')}` }
}

/** Parte las discrepancias en pendientes (sin resolver) y resueltas. Port de vvtaRender @11174-11176. */
export function particionar(discrepancias: Discrepancia[], resueltas: Resueltas): { pend: Discrepancia[]; res: Discrepancia[] } {
  const pend = (discrepancias || []).filter((d) => !resueltas[String(d.tn_order)])
  const res = (discrepancias || []).filter((d) => resueltas[String(d.tn_order)])
  return { pend, res }
}
