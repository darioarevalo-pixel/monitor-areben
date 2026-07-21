/**
 * Paridad de FLUJO COMPLETO de los conteos (la superficie que toca stock).
 *
 * A diferencia de los tests por-etapa, acá se corre el flujo Next entero
 * (agrupar → abrir → contar/escanear → terminar → calcular ajuste → Excel) y se
 * compara el resultado contra el CÓDIGO DEL LEGACY extraído EN VIVO de index.html:
 * el loop de ajuste de `conteoDepAplicar` y el armado del Excel de `conteoDepConfirmar`.
 * Así el Excel que se sube a GN (nuevo_stock) queda verificado byte a byte contra el
 * legacy, sin depender de un conteo físico.
 *
 * El motor de depósito lo REUSA el conteo estándar (mismo aoaAjuste/HEADER), así que
 * verificarlo cubre las dos superficies de "generar Excel de ajuste".
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { describe, it, expect } from 'vitest'
import {
  abrirProducto,
  agruparVivo,
  aoaAjuste,
  calcularAjuste,
  setCount,
  terminarProducto,
} from '@/lib/conteo-deposito/core'
import {
  abrir as ceAbrir,
  agruparVivo as ceAgrupar,
  calcularAjuste as ceCalcular,
  escanear as ceEscanear,
  setDeposito as ceSetDep,
  terminar as ceTerminar,
} from '@/lib/conteo-estandar/core'
import { realMap } from '@/lib/inventario-vivo/core'
import type { FilaVivo } from '@/lib/inventario-vivo/tipos'
import type { CdepProducto } from '@/lib/conteo-deposito/tipos'

const HTML = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'index.html'), 'utf8')

// ── Extracción EN VIVO del legacy (queda en sync: si el index.html cambia, cambia acá) ──

/** El loop de ajuste de conteoDepAplicar (index.html): produce rows/missing/counts. */
function extraerAjusteLegacy(): (
  terminados: unknown[],
  cdepState: Record<string, unknown>,
  realMapArg: Record<string, unknown>,
  ubicacion: string,
) => { rows: unknown[]; missing: unknown[]; mas: number; menos: number; unidades: number } {
  const ini = HTML.indexOf('terminados.forEach(p => {')
  const fin = HTML.indexOf('const productos = terminados.map', ini)
  if (ini < 0 || fin < 0) throw new Error('no se encontró el loop de ajuste en index.html')
  const loop = HTML.slice(ini, fin).trim() // termina en `});`
  return new Function(
    'terminados',
    'cdepState',
    'realMap',
    'ubicacion',
    `const rows=[], missing=[]; let mas=0, menos=0, unidades=0;
     ${loop}
     return { rows, missing, mas, menos, unidades };`,
  ) as never
}

/** El armado del Excel (header + push por fila) de conteoDepConfirmar (index.html). */
function extraerAoaLegacy(): (rows: unknown[]) => unknown[][] {
  // El header EXACTO y el mapeo de columnas de cada fila, tal cual el legacy.
  const conf = HTML.slice(HTML.indexOf('async function conteoDepConfirmar'))
  const header = conf.match(/const header = (\[[^\]]+\]);/)
  const push = conf.match(/rows\.forEach\(r => aoa\.push\((\[[^\]]*\])\)\);/)
  if (!header || !push) throw new Error('no se encontró el armado del Excel en index.html')
  return new Function('rows', `const aoa = [${header[1]}]; rows.forEach(r => aoa.push(${push[1]})); return aoa;`) as never
}

const ajusteLegacy = extraerAjusteLegacy()
const aoaLegacy = extraerAoaLegacy()

// ── Escenario sintético rico (mezcla +/−/cero + candados de seguridad) ──────────

function fv(over: Partial<FilaVivo>): FilaVivo {
  return { inventory_id: 1, product_id: '10', product_name: 'Cover', product_code: 'C10', size_id: '100', size_name: 'A', store_name: 'Deposito Minorista', barcode: 'B1', available_quantity: 5, fuente: 'vivo', ...over }
}

/**
 * Inventario "en vivo" al momento de aplicar. Distinto del snapshot de apertura para
 * ejercitar de verdad nuevo = vivo + dif.
 * - P10 Alfa: v1 (+dif, ajusta), v2 (dif 0, se saltea), v3 (inventory_id null → missing),
 *             v4 (−dif, ajusta)
 * - P20 Zeta: v1 (+dif, ajusta)
 */
const vivoRows: FilaVivo[] = [
  fv({ product_id: '10', product_name: 'Alfa', size_id: '1', size_name: 'A', inventory_id: 500, available_quantity: 6, product_code: 'A10', barcode: 'BA1' }),
  fv({ product_id: '10', product_name: 'Alfa', size_id: '2', size_name: 'B', inventory_id: 501, available_quantity: 4, product_code: 'A10', barcode: 'BA2' }),
  fv({ product_id: '10', product_name: 'Alfa', size_id: '3', size_name: 'C', inventory_id: null, available_quantity: 2, product_code: 'A10', barcode: 'BA3' }),
  fv({ product_id: '10', product_name: 'Alfa', size_id: '4', size_name: 'D', inventory_id: 503, available_quantity: 9, product_code: 'A10', barcode: 'BA4' }),
  fv({ product_id: '20', product_name: 'Zeta', size_id: '1', size_name: 'X', inventory_id: 700, available_quantity: 10, product_code: 'Z20', barcode: 'BZ1' }),
]
const vivo = realMap(vivoRows)

describe('conteo-deposito · flujo completo Next vs legacy extraído', () => {
  // Flujo Next: agrupar → abrir → contar → terminar, para llegar al state real.
  const products = agruparVivo(vivo)
  let state = {}
  for (const p of products) {
    state = abrirProducto(state, p)
  }
  // Contar (la "secuencia de escaneo"): A=8 (+3 sobre snap 6), B queda en snap (sin dif),
  // C=5 (+3, pero sin inventory_id → missing), D=7 (−2 sobre snap 9), Zeta X=13 (+3).
  state = setCount(state, '10', '10_1', '8')
  state = setCount(state, '10', '10_2', '4') // igual al snap → dif 0
  state = setCount(state, '10', '10_3', '5')
  state = setCount(state, '10', '10_4', '7')
  state = setCount(state, '20', '20_1', '13')
  for (const p of products) {
    state = terminarProducto(state, p, 1_700_000_000_000)
  }

  it('el flujo produce las diferencias esperadas', () => {
    expect((state as Record<string, { dif: Record<string, number> }>)['10'].dif).toEqual({ '10_1': 2, '10_2': 0, '10_3': 3, '10_4': -2 })
    expect((state as Record<string, { dif: Record<string, number> }>)['20'].dif).toEqual({ '20_1': 3 })
  })

  it('calcularAjuste (Next) === loop de ajuste (legacy) sobre el mismo state+vivo', () => {
    const pv = calcularAjuste(products, state, vivo, 'Deposito Minorista', 'bdi', 1_700_000_000_000)
    const leg = ajusteLegacy(products as unknown[], state, vivo as Record<string, unknown>, 'Deposito Minorista')
    // Mismas filas de ajuste (mismo orden, mismos campos), mismos "missing" y contadores.
    expect(pv.rows).toEqual(leg.rows)
    expect(pv.missing).toEqual(leg.missing)
    expect(pv.resumen.mas).toBe(leg.mas)
    expect(pv.resumen.menos).toBe(leg.menos)
    expect(pv.resumen.unidades_ajustadas).toBe(leg.unidades)
  })

  it('el Excel (aoaAjuste, Next) === armado del Excel (legacy) byte a byte', () => {
    const pv = calcularAjuste(products, state, vivo, 'Deposito Minorista', 'bdi', 1_700_000_000_000)
    expect(aoaAjuste(pv.rows)).toEqual(aoaLegacy(pv.rows as unknown[]))
  })

  it('el Excel final tiene solo las 3 variantes con diferencia ajustable (nuevo = vivo + dif)', () => {
    const pv = calcularAjuste(products, state, vivo, 'Deposito Minorista', 'bdi', 1_700_000_000_000)
    const aoa = aoaAjuste(pv.rows)
    // header + 3 filas (A +2→8, D −2→7, Zeta X +3→13). C queda afuera (inventory_id null).
    expect(aoa).toEqual([
      ['id_inventario', 'codigo_producto', 'producto', 'variante', 'ubicacion', 'codigo_barras', 'stock_actual', 'nuevo_stock'],
      [500, 'A10', 'Alfa', 'A', 'Deposito Minorista', 'BA1', 6, 8],
      [503, 'A10', 'Alfa', 'D', 'Deposito Minorista', 'BA4', 9, 7],
      [700, 'Z20', 'Zeta', 'X', 'Deposito Minorista', 'BZ1', 10, 13],
    ])
    expect(pv.missing).toEqual([{ prod: 'Alfa', size: 'C' }])
  })
})

describe('conteo-estandar · flujo completo → reusa el Excel de depósito', () => {
  // Estándar cuenta exhibido (escaneo) + depósito (a mano) por talle; el ajuste y el
  // Excel son el mismo motor que depósito. Verificamos que el flujo entero también
  // aterriza en el Excel byte-fiel al legacy.
  const { products, byBc } = ceAgrupar(vivo)
  let state = {}
  for (const p of products) state = ceAbrir(state, p)
  // Alfa A: escaneo 8 exhibido (snap 6 → +2). Zeta X: 10 exhibido + 3 depósito = 13 (snap 10 → +3).
  const alfa = products.find((p) => p.pid === '10')!
  const zeta = products.find((p) => p.pid === '20')!
  // Se cuentan TODOS los talles de Alfa (si no, los sin contar terminan en 0 = faltante):
  // A=8 (+2), B=4 (dif 0), D=9 (dif 0). C no se cuenta pero es missing (inventory_id null).
  for (let i = 0; i < 8; i++) state = ceEscanear(state, alfa, byBc['BA1'])
  for (let i = 0; i < 4; i++) state = ceEscanear(state, alfa, byBc['BA2'])
  for (let i = 0; i < 9; i++) state = ceEscanear(state, alfa, byBc['BA4'])
  for (let i = 0; i < 10; i++) state = ceEscanear(state, zeta, byBc['BZ1'])
  state = ceSetDep(state, '20', '20_1', '3')
  state = ceTerminar(state, alfa, 1_700_000_000_000)
  state = ceTerminar(state, zeta, 1_700_000_000_000)

  it('el Excel del conteo estándar === armado del Excel del legacy', () => {
    const pv = ceCalcular([alfa, zeta], state, vivo, 'Local', 'zattia', 1_700_000_000_000, 'zattia')
    // aoaAjuste (de conteo-deposito) es el motor compartido; se compara contra el legacy.
    expect(aoaAjuste(pv.rows as never)).toEqual(aoaLegacy(pv.rows as unknown[]))
    // Alfa A: +2 → 8; Zeta X: +3 → 13.
    const nuevos = pv.rows.map((r) => [r.variante, r.vivo, r.nuevo])
    expect(nuevos).toEqual([
      ['A', 6, 8],
      ['X', 10, 13],
    ])
  })
})

// Guarda: si el index.html deja de tener las piezas extraíbles, el test avisa (no pasa en falso).
describe('la extracción del legacy encontró las piezas', () => {
  it('CdepProducto de agruparVivo tiene la forma esperada', () => {
    const products: CdepProducto[] = agruparVivo(vivo)
    expect(products.map((p) => p.name)).toEqual(['Alfa', 'Zeta'])
    expect(products[0].variants).toHaveLength(4)
  })
})
