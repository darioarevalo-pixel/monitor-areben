/**
 * Demanda por modelo (corregida). Port PURO de fmDemandaPorModelo
 * (index.html:3225-3337) y de la capa de combinación de fmDemandaRender
 * (3342-3382), sin DOM.
 *
 * El legacy leía 5 globales por `window.*` (3229-3237); acá viajan por parámetro
 * desde el `DatosETL` del store. `Date.now()` (3233) se recibe como `today` para
 * que la paridad sea determinista y el corte no use un reloj distinto al resto.
 *
 * **Regla dura de taxonomía:** se importa `matchModelo` de `lib/etl/modelos.ts`
 * (la única taxonomía del sistema, alias del legacy `normalizeIphoneModel`). NO
 * se reintroduce una normalización propia: si el cruce tratara "clave inexistente"
 * igual que "stock 0", marcaría todo agotado e inflaría la demanda estimada —
 * el número con el que se decide qué producir. Falla en silencio.
 */

import { matchModelo } from '@/lib/etl/modelos'
import type { FilaVenta } from '@/lib/etl/tipos'
import type {
  CorteDemanda,
  DatosDemanda,
  FilaDemanda,
  FilaDemandaComb,
  ResultadoDemanda,
} from './tipos'

const DAY = 86400000

/** Port literal de _esMayorista (index.html:3217). */
export function esMayorista(v: FilaVenta): boolean {
  return v.channel_id === 10 || /mayor/i.test(v.channel || '')
}

/**
 * Proporción por modelo separada por canal (volumen + empujón por agotamiento
 * capado), solo sobre diseños de funda lanzados desde `cutoff`. Con corte de
 * ventana opcional. Port de fmDemandaPorModelo (3225).
 */
export function demandaPorModelo(
  datos: DatosDemanda,
  cutoff: string,
  K: number,
  corte: CorteDemanda = { on: false, dias: 30, modelos: 5 },
): ResultadoDemanda {
  K = K > 1 ? K : 2.5 // tope del empujón a los modelos agotados
  const ventas = datos.allVentas
  const detalles = datos.allDetalles
  const invPM = datos.invDepoMin // stock del Depósito Minorista (agotamiento real)
  const meta = datos.prodMeta
  const hoyMs = datos.today.getTime()

  // Set de productos que son funda (los que la vista reconoce); fallback por categoría.
  const fundaPids = new Set<string>()
  Object.values(datos.fmKeyPids).forEach((set) => set.forEach((pid) => fundaPids.add(String(pid))))
  const usarSet = fundaPids.size > 0
  const esFundaCat = (c: string | undefined) => {
    const u = (c || '').toUpperCase()
    return u.includes('FUNDA') || u.includes('CASE') || u === 'MAYORISTA' || u === 'MINORISTA'
  }
  const esFunda = (pid: string) => (usarSet ? fundaPids.has(pid) : esFundaCat((meta[pid] || {}).cat))

  // Diseños de funda lanzados desde el corte.
  const prodOk: Record<string, string> = {}
  Object.entries(meta).forEach(([pid, m]) => {
    if (m.created && m.created >= cutoff && esFunda(pid)) prodOk[pid] = m.created
  })

  // sale_id → fecha + canal.
  const saleInfo: Record<string, { fecha: string; mayor: boolean }> = {}
  ventas.forEach((v) => {
    saleInfo[String(v.id)] = { fecha: (v.date_sale || '').substring(0, 10), mayor: esMayorista(v) }
  })

  // Paso 1: por (diseño,modelo) la última venta (para estimar el agotamiento).
  const lastByKey: Record<string, string> = {}
  detalles.forEach((it) => {
    const pid = String(it.product_id || '')
    if (!prodOk[pid]) return
    const model = matchModelo(it.size || '')
    if (!model) return
    const si = saleInfo[String(it.sale_id)]
    if (!si || !si.fecha || si.fecha < cutoff) return
    const k = pid + '|||' + model
    if (!lastByKey[k] || si.fecha > lastByKey[k]) lastByKey[k] = si.fecha
  })
  // Fecha de agotamiento estimada: si el Depósito Minorista quedó en 0 → última venta.
  const stockoutMs: Record<string, number | null> = {}
  Object.keys(lastByKey).forEach((k) => {
    stockoutMs[k] = (invPM[k] || 0) <= 0 && lastByKey[k] ? Date.parse(lastByKey[k]) : null
  })

  // Fin de ventana por diseño: lanzamiento → lo que pase primero (1 mes / N modelos).
  const winEnd: Record<string, number> = {}
  Object.keys(prodOk).forEach((pid) => {
    const launchMs = Date.parse(prodOk[pid])
    let weMs = hoyMs
    if (corte.on) {
      weMs = launchMs + corte.dias * DAY
      const fechas = Object.keys(stockoutMs)
        .filter((k) => k.indexOf(pid + '|||') === 0 && stockoutMs[k])
        .map((k) => stockoutMs[k] as number)
        .sort((a, b) => a - b)
      if (fechas.length >= corte.modelos) weMs = Math.min(weMs, fechas[corte.modelos - 1])
      weMs = Math.min(weMs, hoyMs)
      weMs = Math.max(weMs, launchMs + 7 * DAY) // ventana mínima de 1 semana
    }
    winEnd[pid] = weMs
  })

  // Paso 2: acumular unidades DENTRO de la ventana, por canal.
  const acc: Record<string, { pid: string; model: string; umin: number; umay: number }> = {}
  detalles.forEach((it) => {
    const pid = String(it.product_id || '')
    if (!prodOk[pid]) return
    const model = matchModelo(it.size || '')
    if (!model) return
    const si = saleInfo[String(it.sale_id)]
    if (!si || !si.fecha || si.fecha < cutoff) return
    if (Date.parse(si.fecha) > winEnd[pid]) return // fuera de la ventana del diseño
    const k = pid + '|||' + model
    if (!acc[k]) acc[k] = { pid, model, umin: 0, umay: 0 }
    const q = it.quantity || 1
    if (si.mayor) acc[k].umay += q
    else acc[k].umin += q
  })

  // Empujón por agotamiento dentro de la ventana, capado a K.
  const perModel: Record<string, { umin: number; umay: number; ajmin: number; ajmay: number }> = {}
  Object.values(acc).forEach((a) => {
    const k = a.pid + '|||' + a.model
    const launchMs = Date.parse(prodOk[a.pid])
    const weMs = winEnd[a.pid]
    const dWindow = Math.max(7, (weMs - launchMs) / DAY)
    const so = stockoutMs[k]
    const soMs = so && so <= weMs ? so : null // ¿se agotó dentro de la ventana?
    const dStock = soMs ? Math.max(1, (soMs - launchMs) / DAY) : dWindow
    const up = Math.min(K, Math.max(1, dWindow / dStock))
    if (!perModel[a.model]) perModel[a.model] = { umin: 0, umay: 0, ajmin: 0, ajmay: 0 }
    perModel[a.model].umin += a.umin
    perModel[a.model].umay += a.umay
    perModel[a.model].ajmin += a.umin * up
    perModel[a.model].ajmay += a.umay * up
  })

  const models = Object.keys(perModel)
  let totMin = 0, totMay = 0, totAjMin = 0, totAjMay = 0
  models.forEach((m) => {
    totMin += perModel[m].umin
    totMay += perModel[m].umay
    totAjMin += perModel[m].ajmin
    totAjMay += perModel[m].ajmay
  })

  const rows: FilaDemanda[] = models.map((m) => ({
    model: m,
    umin: perModel[m].umin,
    umay: perModel[m].umay,
    volMin: totMin > 0 ? (perModel[m].umin / totMin) * 100 : 0,
    volMay: totMay > 0 ? (perModel[m].umay / totMay) * 100 : 0,
    ajMin: totAjMin > 0 ? (perModel[m].ajmin / totAjMin) * 100 : 0,
    ajMay: totAjMay > 0 ? (perModel[m].ajmay / totAjMay) * 100 : 0,
  }))

  const totalU = totMin + totMay
  const wMinDefault = totalU > 0 ? totMin / totalU : 0.5
  return { rows, totMin, totMay, wMinDefault, cutoff }
}

/**
 * Combina las filas por método (aj/vol) y peso de canal, y filtra las
 * despreciables. Port de la parte pura de fmDemandaRender (3364-3369).
 */
export function combinarDemanda(
  calc: ResultadoDemanda,
  metric: 'aj' | 'vol',
  wMin: number,
): FilaDemandaComb[] {
  const pick = (r: FilaDemanda) => (metric === 'vol' ? { min: r.volMin, may: r.volMay } : { min: r.ajMin, may: r.ajMay })
  return calc.rows
    .map((r) => {
      const p = pick(r)
      return { model: r.model, pMin: p.min, pMay: p.may, pComb: wMin * p.min + (1 - wMin) * p.may }
    })
    .filter((r) => r.pComb > 0.05 || r.pMin > 0 || r.pMay > 0)
}
