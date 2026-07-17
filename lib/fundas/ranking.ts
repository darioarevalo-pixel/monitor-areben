/**
 * Cómputo puro del ranking por modelo. Port de `renderFundasPorModelo`
 * (index.html:5357-5470) sin el DOM, el Chart ni el `innerHTML`: el legacy
 * mezclaba el cálculo con el pintado; acá el dato sale limpio y la card lo pinta.
 *
 * También porta los selectores (`initFundasSelectors` 3102, `rebuildFundaProds`
 * 3164, `iphoneModelSort` 3077, `fmMonthLabel` 3070): el estado inicial de los
 * checkboxes y el rango de meses son parte del resultado observable del A/B, así
 * que se derivan igual que en el legacy.
 */

import type { DatosRanking, FiltroRanking, ResultadoRanking, FilaRanking } from './tipos'

const FM_MONTH_NAMES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

/** Port literal de fmMonthLabel (index.html:3070). '2026-01' → 'Ene 26'. */
export function fmMonthLabel(m: string): string {
  const [y, mo] = m.split('-')
  return FM_MONTH_NAMES[parseInt(mo) - 1] + ' ' + y.slice(2)
}

/** Orden canónico de modelos de iPhone. Port literal de iphoneModelSort (3077). */
const ORDEN_IPHONE = [
  'iPhone 6', 'iPhone 6 Plus', 'iPhone 6s', 'iPhone 6s Plus',
  'iPhone 7', 'iPhone 7 Plus',
  'iPhone 8', 'iPhone 8 Plus',
  'iPhone SE', 'iPhone X', 'iPhone XS', 'iPhone XS Max', 'iPhone XR',
  'iPhone 11', 'iPhone 11 Pro', 'iPhone 11 Pro Max',
  'iPhone SE 2',
  'iPhone 12', 'iPhone 12 Mini', 'iPhone 12 Pro', 'iPhone 12 Pro Max',
  'iPhone 13', 'iPhone 13 Mini', 'iPhone 13 Pro', 'iPhone 13 Pro Max',
  'iPhone SE 3',
  'iPhone 14', 'iPhone 14 Plus', 'iPhone 14 Pro', 'iPhone 14 Pro Max',
  'iPhone 15', 'iPhone 15 Plus', 'iPhone 15 Pro', 'iPhone 15 Pro Max',
  'iPhone 16', 'iPhone 16e', 'iPhone 16 Plus', 'iPhone 16 Pro', 'iPhone 16 Pro Max',
  'iPhone 17', 'iPhone 17 Air', 'iPhone 17 Pro', 'iPhone 17 Pro Max',
  'iPhone 18', 'iPhone 18 Air', 'iPhone 18 Pro', 'iPhone 18 Pro Max',
]

export function iphoneModelSort(a: string, b: string): number {
  const ia = ORDEN_IPHONE.indexOf(a)
  const ib = ORDEN_IPHONE.indexOf(b)
  if (ia !== -1 && ib !== -1) return ia - ib
  if (ia !== -1) return -1
  if (ib !== -1) return 1
  return a.localeCompare(b, 'es')
}

/** Los meses que se ofrecen en los selects Desde/Hasta: los que tienen ventas de
 *  fundas, del más nuevo al más viejo (index.html:3103). */
export function mesesConFundas(datos: DatosRanking): string[] {
  return [...datos.allMonths].reverse().filter((m) => datos.allFundasStats[m])
}

/** Totales históricos por modelo y por producto, y primer mes de cada producto.
 *  Port del acumulado de initFundasSelectors (3115-3126). */
export function totalesBase(allFundasStats: Record<string, Record<string, number>>): {
  modelTotals: Record<string, number>
  prodTotals: Record<string, number>
  prodFirstMes: Record<string, string>
} {
  const modelTotals: Record<string, number> = {}
  const prodTotals: Record<string, number> = {}
  const prodFirstMes: Record<string, string> = {}
  Object.entries(allFundasStats).forEach(([mes, d]) => {
    Object.entries(d).forEach(([key, qty]) => {
      const sep = key.indexOf('|||')
      const model = key.slice(0, sep)
      const prod = key.slice(sep + 3)
      modelTotals[model] = (modelTotals[model] || 0) + qty
      prodTotals[prod] = (prodTotals[prod] || 0) + qty
      if (!prodFirstMes[prod] || mes < prodFirstMes[prod]) prodFirstMes[prod] = mes
    })
  })
  return { modelTotals, prodTotals, prodFirstMes }
}

export type OrdenProd = 'qty' | 'alpha' | 'date'

/** Orden de la lista de fundas según el select `#fm-prod-sort`. Port de
 *  rebuildFundaProds (3173-3189). */
export function ordenarProds(
  prodTotals: Record<string, number>,
  prodFirstMes: Record<string, string>,
  sort: OrdenProd,
): string[] {
  const entries = Object.entries(prodTotals)
  if (sort === 'alpha') {
    entries.sort((a, b) => a[0].localeCompare(b[0], 'es', { sensitivity: 'base' }))
  } else if (sort === 'date') {
    entries.sort((a, b) => {
      const da = prodFirstMes[a[0]] || ''
      const db = prodFirstMes[b[0]] || ''
      if (da === db) return a[0].localeCompare(b[0], 'es', { sensitivity: 'base' })
      return db.localeCompare(da) // más reciente primero
    })
  } else {
    entries.sort((a, b) => b[1] - a[1])
  }
  return entries.map(([p]) => p)
}

/** El estado inicial de la card: rango de meses y selección de modelos/fundas.
 *  Port de los defaults de initFundasSelectors (3105-3163). */
export type DefaultsRanking = {
  meses: string[]
  modelos: string[]
  rangeStart: string
  rangeEnd: string
  checkedModels: Set<string>
  checkedProds: Set<string>
  corteEnabled: boolean
}

const MODELOS_DEFAULT = new Set([
  'iPhone 13', 'iPhone 14', 'iPhone 15',
  'iPhone 16', 'iPhone 16 Pro', 'iPhone 16 Pro Max',
  'iPhone 17', 'iPhone 17 Pro', 'iPhone 17 Pro Max',
])

export function defaultsRanking(datos: DatosRanking): DefaultsRanking {
  const meses = mesesConFundas(datos)
  const { modelTotals, prodTotals, prodFirstMes } = totalesBase(datos.allFundasStats)
  const modelos = Object.keys(modelTotals).sort(iphoneModelSort)

  // Rango: hasta = más nuevo, desde = 3º más nuevo (3107-3108)...
  let rangeEnd = meses.length ? meses[0] : ''
  let rangeStart = meses.length ? meses[Math.min(2, meses.length - 1)] : ''

  // ...pero si hay un Wave Case, desde se corre a su primer mes (3155-3158).
  const wcFirst = Object.entries(prodFirstMes)
    .filter(([n]) => n.toLowerCase().includes('wave case'))
    .map(([, m]) => m)
    .sort()[0]
  if (wcFirst && meses.includes(wcFirst)) rangeStart = wcFirst

  // Modelos: solo el set default (3140-3142).
  const checkedModels = new Set(modelos.filter((m) => MODELOS_DEFAULT.has(m)))

  // Fundas: si hay Wave Case, solo las de su era en adelante; si no, todas (3143-3151).
  const prods = ordenarProds(prodTotals, prodFirstMes, 'qty')
  const checkedProds = new Set(
    wcFirst ? prods.filter((p) => prodFirstMes[p] && prodFirstMes[p] >= wcFirst) : prods,
  )

  return { meses, modelos, rangeStart, rangeEnd, checkedModels, checkedProds, corteEnabled: true }
}

/**
 * El cálculo del ranking. Port de renderFundasPorModelo (5357-5470), sin DOM.
 *
 * El corte por agotamiento (5390-5433) cruza `fmKeyPids` (Sets) con
 * `invByProdModelo` para recortar el rango de meses. Es la parte que ejercita la
 * trampa de los Sets: `datos.fmKeyPids` DEBE venir del store en memoria, nunca de
 * una copia serializada (los Sets se aplastarían a `{}`).
 */
export function computarRanking(datos: DatosRanking, filtro: FiltroRanking): ResultadoRanking {
  const { rangeStart, rangeEnd } = filtro
  const [rs, re] = [rangeStart, rangeEnd].sort()
  let rangeMonths = datos.allMonths.filter((m) => m >= rs && m <= re)

  const modelFilterActive = filtro.checkedModels.size < filtro.totalModels
  const prodFilterActive = filtro.checkedProds.size < filtro.totalProds

  // ── Corte por agotamiento (por diseño) ──
  const corte = calcularCorte(datos, filtro, rangeMonths)
  if (corte.cutoffMonth) rangeMonths = rangeMonths.filter((m) => m <= corte.cutoffMonth!)

  // Agregar el rango, filtrando por modelo y producto.
  const data: Record<string, number> = {}
  rangeMonths.forEach((m) => {
    const stats = datos.allFundasStats[m]
    if (!stats) return
    Object.entries(stats).forEach(([key, qty]) => {
      const sep = key.indexOf('|||')
      const model = key.slice(0, sep)
      const prod = key.slice(sep + 3)
      if (modelFilterActive && !filtro.checkedModels.has(model)) return
      if (prodFilterActive && !filtro.checkedProds.has(prod)) return
      data[model] = (data[model] || 0) + qty
    })
  })

  const sorted = Object.entries(data).sort((a, b) => b[1] - a[1])
  const total = sorted.reduce((s, [, q]) => s + q, 0)
  const filas: FilaRanking[] = sorted.map(([model, qty], i) => ({
    pos: i + 1,
    model,
    qty,
    pct: total > 0 ? +((qty / total) * 100).toFixed(1) : 0,
  }))

  const effStart = rangeMonths.length ? rangeMonths[0] : rs
  const effEnd = rangeMonths.length ? rangeMonths[rangeMonths.length - 1] : re

  return { filas, total, corte, effStart, effEnd, cantModelos: sorted.length }
}

/** Port del bloque de corte (5390-5433). Devuelve el texto y el mes de corte. */
function calcularCorte(datos: DatosRanking, filtro: FiltroRanking, rangeMonths: string[]): ResultadoRanking['corte'] {
  const { corteEnabled, corteDiseno } = filtro
  if (!corteEnabled || !corteDiseno || rangeMonths.length <= 1) {
    return { activo: false, mensaje: '', visible: false }
  }
  const corteN = filtro.corteN || 3
  const checkedModels = filtro.checkedModels

  // Stock actual por modelo, solo para el diseño elegido.
  const modelStock: Record<string, number> = {}
  checkedModels.forEach((model) => {
    let stock = 0
    const pids = datos.fmKeyPids[model + '|||' + corteDiseno]
    if (pids) pids.forEach((pid) => { stock += datos.invByProdModelo[pid + '|||' + model] || 0 })
    modelStock[model] = stock
  })

  // Último mes con ventas por modelo para ese diseño.
  const modelLastMonth: Record<string, string> = {}
  rangeMonths.forEach((m) => {
    const stats = datos.allFundasStats[m]
    if (!stats) return
    Object.entries(stats).forEach(([key]) => {
      const sep = key.indexOf('|||')
      const model = key.slice(0, sep)
      const prod = key.slice(sep + 3)
      if (prod !== corteDiseno) return
      if (!checkedModels.has(model)) return
      if (!modelLastMonth[model] || m > modelLastMonth[model]) modelLastMonth[model] = m
    })
  })

  // Agotado = stock 0 de ese diseño + tuvo ventas en el rango.
  const agotados = [...checkedModels]
    .filter((m) => modelStock[m] === 0 && modelLastMonth[m])
    .sort((a, b) => (modelLastMonth[a] || '').localeCompare(modelLastMonth[b] || ''))

  if (agotados.length >= corteN) {
    const cutoffMonth = modelLastMonth[agotados[corteN - 1]]
    const nombres = agotados.slice(0, corteN).join(', ')
    return {
      activo: true,
      visible: true,
      cutoffMonth,
      mensaje: `✂ Corte en ${fmMonthLabel(cutoffMonth)} — ${corteN} modelos de ${corteDiseno} agotados: ${nombres}`,
    }
  }
  const mensaje = agotados.length === 0
    ? `Ningún modelo agotado de ${corteDiseno} — sin corte`
    : `Solo ${agotados.length} modelo${agotados.length > 1 ? 's' : ''} agotado${agotados.length > 1 ? 's' : ''} de ${corteDiseno} (de ${corteN} requeridos) — sin corte`
  return { activo: false, visible: true, mensaje }
}
