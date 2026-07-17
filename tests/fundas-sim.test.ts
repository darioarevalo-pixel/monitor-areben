import { describe, it, expect } from 'vitest'
import { cargarSimLegacy } from './legacy-fundas'
import { computeFrom, repartir } from '@/lib/fundas/simulacion'
import type { SimRow, SimVar } from '@/lib/fundas/tipos'

/**
 * Paridad de la simulación: fmSimRepartir / fmComputeFrom del legacy contra el
 * port (lib/fundas/simulacion.ts). No necesita fixture (es matemática pura), así
 * que corre también en el job "sin red".
 *
 * Cubre el reparto por resto mayor, el borde `vExact` (variantes que no suman
 * 100) y que el cómputo NO muta sus entradas (la reescritura de la mutación por
 * índice del legacy a setState inmutable).
 */
const legacy = cargarSimLegacy()

describe('fmSimRepartir: reparto por resto mayor', () => {
  const CASOS: { total: number; pcts: number[] }[] = [
    { total: 100, pcts: [50, 50] },
    { total: 100, pcts: [33.3, 33.3, 33.4] },
    { total: 7, pcts: [50, 50] },
    { total: 10, pcts: [25, 25, 25, 25] },
    { total: 0, pcts: [50, 50] },
    { total: 33, pcts: [10, 20, 70] },
    { total: 1, pcts: [40, 35, 25] },
    { total: 250, pcts: [12.5, 12.5, 75] },
  ]

  it.each(CASOS)('repartir($total, $pcts) == legacy y suma exacta', ({ total, pcts }) => {
    const port = repartir(total, pcts)
    expect(port).toEqual(legacy.fmSimRepartir(total, pcts))
    expect(port.reduce((a, b) => a + b, 0)).toBe(total)
  })
})

describe('fmComputeFrom: líneas del pedido', () => {
  const rows: SimRow[] = [
    { model: 'iPhone 15', pct: 60 },
    { model: 'iPhone 16', pct: 40 },
    { model: '', pct: 10 }, // sin modelo → se filtra
  ]

  const CASOS: { nombre: string; total: number; rows: SimRow[]; vars: SimVar[]; varOn: boolean }[] = [
    { nombre: 'sin variantes', total: 100, rows, vars: [], varOn: false },
    { nombre: 'variantes que suman 100 (vExact)', total: 100, rows, vars: [{ name: 'Negro', pct: 70, img: null }, { name: 'Blanco', pct: 30, img: null }], varOn: true },
    { nombre: 'variantes que NO suman 100 (redondeo simple)', total: 100, rows, vars: [{ name: 'A', pct: 40, img: null }, { name: 'B', pct: 40, img: null }], varOn: true },
    { nombre: 'varOn con vars vacías', total: 80, rows, vars: [], varOn: true },
    { nombre: 'total con decimales de %', total: 137, rows: [{ model: 'X', pct: 33.3 }, { model: 'Y', pct: 66.7 }], vars: [], varOn: false },
  ]

  it.each(CASOS)('$nombre == legacy', ({ total, rows, vars, varOn }) => {
    const port = computeFrom(total, rows, vars, varOn)
    const leg = legacy.fmComputeFrom(total, rows, vars, varOn)
    expect(port).toEqual(leg)
  })

  it('no muta las entradas (rows/vars quedan intactos)', () => {
    const r: SimRow[] = [{ model: 'A', pct: 50 }, { model: 'B', pct: 50 }]
    const v: SimVar[] = [{ name: 'N', pct: 60, img: null }, { name: 'B', pct: 40, img: null }]
    const rCopia = JSON.parse(JSON.stringify(r))
    const vCopia = JSON.parse(JSON.stringify(v))
    computeFrom(100, r, v, true)
    expect(r).toEqual(rCopia)
    expect(v).toEqual(vCopia)
  })
})
