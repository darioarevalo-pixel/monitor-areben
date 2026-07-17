/**
 * Simulación de pedido — cómputo puro. Port de fmSimRepartir (index.html:4487),
 * fmComputeFrom (4801) y fmSimComputed (4812). Autocontenido: NO toca el ETL, solo
 * los `simRows` que ya vienen calculados.
 *
 * Es la parte que más diverge del legacy en el COMPONENTE (la mutación por índice
 * pasa a setState inmutable), pero el ALGORITMO es idéntico y va con paridad.
 */

import type { SimLinea, SimRow, SimVar } from './tipos'

/**
 * Reparte `total` en enteros según `pcts` (que suman ~100), sin perder ni inventar
 * unidades: método del resto mayor, para que la suma dé exactamente `total`. Port
 * literal de fmSimRepartir (4487).
 */
export function repartir(total: number, pcts: number[]): number[] {
  const crudos = pcts.map((p) => (total * p) / 100)
  const base = crudos.map(Math.floor)
  const resto = total - base.reduce((a, b) => a + b, 0)
  const orden = crudos
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac)
  for (let k = 0; k < resto && k < orden.length; k++) base[orden[k].i]++
  return base
}

/** ¿Está activo el desglose por variantes? (fmSimVarActivo, 4481). */
export function varActivo(vars: SimVar[], varOn: boolean): boolean {
  return varOn && vars.length > 0
}

/**
 * Filas calculadas a partir de datos sueltos (sirve para el editor y para los
 * pedidos guardados). Port de fmComputeFrom (4801).
 *
 * El borde `vExact`: si las variantes NO suman 100 (±0.05), se reparte por
 * redondeo simple en vez del resto mayor — se preserva tal cual (la suma puede no
 * dar `qty`, y así lo muestra el legacy).
 */
export function computeFrom(total: number, rows: SimRow[], vars: SimVar[], varOn: boolean): SimLinea[] {
  const vpcts = (vars || []).map((v) => v.pct)
  const vExact = Math.abs(vpcts.reduce((a, b) => a + b, 0) - 100) < 0.05
  return (rows || [])
    .filter((r) => r.model)
    .map((r) => {
      const qty = Math.round((total * r.pct) / 100)
      const parts = varOn ? (vExact ? repartir(qty, vpcts) : vpcts.map((p) => Math.round((qty * p) / 100))) : null
      return { model: r.model, qty, parts }
    })
}

/** Suma de los % de las variantes (fmSimVarSum, 4758). */
export function sumaVars(vars: SimVar[]): number {
  return vars.reduce((a, v) => a + (v.pct || 0), 0)
}
