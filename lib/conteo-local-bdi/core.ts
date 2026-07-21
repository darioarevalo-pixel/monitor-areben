/**
 * Lógica pura del Conteo de Fundas de BDI (Local). Escaneo por MODELO de celular.
 *
 * Diferencias con el Conteo estándar/Depósito: la unidad es el MODELO (no el
 * producto). Se aplanan las variantes de FUNDA (nombre con "Case") a partir del
 * vivo del Local, se agrupan por modelo (`matchModelo` del talle), y al "cerrar" un
 * modelo se compara TODO el modelo contra el vivo: escaneado → su conteo, no
 * escaneado → 0 (faltante). `nuevo = vivo + dif`, con el mismo candado `inventory_id`
 * y el mismo Excel (`aoaAjuste`) que ZATTIA/Depósito. Se sella `resumen.modo='local-bdi'`
 * + `resumen.modelo` para no contaminar el historial del Conteo de Depósito de BDI.
 */

import type { FilaVivo } from '../inventario-vivo/tipos'
import type { ConteoHistorial, FilaAjuste } from '../conteo-deposito/tipos'
import { matchModelo } from '../etl/modelos'
import { ordenarModelo } from '../reposicion/grupos'
import type { FundaVar, FundasState, LbDetalleConteo, LbPreview, LbResumen, ModeloGrupo } from './tipos'

/** Normaliza un código de barras (trim + mayúsculas). */
export function normBc(b: unknown): string {
  return String(b || '').trim().toUpperCase()
}

/** Una funda se reconoce porque su nombre contiene "case". */
export function esFunda(nombre: string): boolean {
  return /case/i.test(String(nombre || ''))
}

/** Modelo de celular de una funda: `matchModelo(talle)` o el talle crudo si no matchea. */
export function modeloDeFunda(sizeName: string): string {
  return matchModelo(sizeName) || String(sizeName || '—').trim() || '—'
}

const num = (v: number | string | null | undefined): number => parseFloat(String(v)) || 0

/**
 * Aplana el vivo del Local a variantes de FUNDA, agrupadas por modelo (ordenadas con
 * `ordenarModelo`: iPhones canónicos primero, el resto alfabético). Arma también el
 * mapa barcode→vid para el escaneo y el índice vid→variante.
 */
export function agruparFundas(realMap: Record<string, FilaVivo>): {
  modelos: ModeloGrupo[]
  byBc: Record<string, string>
  varByVid: Record<string, FundaVar>
} {
  const vars: FundaVar[] = []
  Object.values(realMap).forEach((r) => {
    if (!esFunda(r.product_name)) return
    vars.push({
      vid: r.product_id + '_' + r.size_id,
      pid: String(r.product_id),
      producto: r.product_name || '—',
      talle: r.size_name || '—',
      modelo: modeloDeFunda(r.size_name || ''),
      barcode: r.barcode,
      inventory_id: r.inventory_id,
      esperado: num(r.available_quantity),
    })
  })
  const byModelo: Record<string, FundaVar[]> = {}
  vars.forEach((v) => { (byModelo[v.modelo] = byModelo[v.modelo] || []).push(v) })
  const modelos: ModeloGrupo[] = Object.entries(byModelo)
    .map(([modelo, variants]) => ({ modelo, variants: variants.slice().sort((a, b) => a.producto.localeCompare(b.producto, 'es')) }))
    .sort((a, b) => ordenarModelo(a.modelo, b.modelo) || a.modelo.localeCompare(b.modelo, 'es'))
  const byBc: Record<string, string> = {}
  const varByVid: Record<string, FundaVar> = {}
  vars.forEach((v) => {
    varByVid[v.vid] = v
    const bc = normBc(v.barcode)
    if (bc) byBc[bc] = v.vid
  })
  return { modelos, byBc, varByVid }
}

/** barcode → vid (o null si no matchea). */
export function resolverScan(byBc: Record<string, string>, raw: string): string | null {
  return byBc[normBc(raw)] || null
}

/** Un escaneo: +1 a la variante. */
export function escanear(state: FundasState, vid: string): FundasState {
  return { ...state, [vid]: (state[vid] || 0) + 1 }
}

/** Edición manual del contado (vacío = sin contar → se borra la entrada). */
export function setContado(state: FundasState, vid: string, val: string): FundasState {
  const s = String(val).trim()
  if (s === '') {
    const next = { ...state }
    delete next[vid]
    return next
  }
  return { ...state, [vid]: Math.max(0, parseInt(s, 10) || 0) }
}

export function contadoModelo(state: FundasState, g: ModeloGrupo): number {
  return g.variants.reduce((s, v) => s + (state[v.vid] || 0), 0)
}
export function esperadoModelo(g: ModeloGrupo): number {
  return g.variants.reduce((s, v) => s + v.esperado, 0)
}
export function tocadoModelo(state: FundasState, g: ModeloGrupo): boolean {
  return g.variants.some((v) => (state[v.vid] || 0) > 0)
}

/**
 * Cierra un modelo: recorre TODAS sus variantes (escaneadas → contado; no escaneadas
 * → 0 = faltante), `dif = contado − sistema` (sistema = esperado del vivo al traer),
 * `nuevo = vivo_actual + dif`. `rows` = solo diferencias con stock confiable (Excel);
 * `registro` = todas las variantes (balance); `resumen` con `modo`/`modelo`.
 */
export function calcularAjusteModelo(
  g: ModeloGrupo,
  state: FundasState,
  vivo: Record<string, FilaVivo>,
  ubicacion: string,
  store: string,
  horaStock: number | null,
): LbPreview {
  const rows: FilaAjuste[] = []
  const registro: LbDetalleConteo[] = []
  const missing: { prod: string; size: string }[] = []
  let mas = 0
  let menos = 0
  let unidades = 0
  g.variants.forEach((v) => {
    const contado = state[v.vid] || 0
    const sistema = v.esperado
    const dif = contado - sistema
    const live = vivo[v.vid]
    const vivoQty = live ? num(live.available_quantity) : null
    const nuevo = vivoQty != null ? vivoQty + dif : null
    registro.push({
      inventory_id: (live && live.inventory_id != null ? live.inventory_id : v.inventory_id) ?? null,
      barcode: (live && live.barcode) || v.barcode || '',
      producto: v.producto,
      variante: v.talle,
      sistema,
      contado,
      diferencia: dif,
      vivo_aplicado: vivoQty,
      nuevo_stock: nuevo,
    })
    if (dif === 0) return
    if (!live || live.inventory_id == null || v.inventory_id == null) {
      missing.push({ prod: v.producto, size: v.talle })
      return
    }
    rows.push({
      inventory_id: live.inventory_id,
      product_code: live.product_code || '',
      producto: v.producto,
      variante: v.talle,
      ubicacion,
      barcode: live.barcode || '',
      vivo: vivoQty as number,
      dif,
      nuevo: nuevo as number,
      sistema,
      contado,
    })
    if (dif > 0) mas++
    else menos++
    unidades += Math.abs(dif)
  })
  // Productos distintos del modelo (para el balance del historial).
  const seen = new Set<string>()
  const productos: { pid: string; nombre: string }[] = []
  g.variants.forEach((v) => {
    if (seen.has(v.pid)) return
    seen.add(v.pid)
    productos.push({ pid: v.pid, nombre: v.producto })
  })
  const resumen: LbResumen = {
    mas,
    menos,
    lineas: rows.length,
    unidades_ajustadas: unidades,
    hora_stock: horaStock ? new Date(horaStock).toISOString() : null,
    productos,
    modo: 'local-bdi',
    modelo: g.modelo,
  }
  return { modelo: g.modelo, rows, registro, resumen, missing, ubicacion, store }
}

/** Fecha (ms) del último conteo por MODELO (solo `modo==='local-bdi'`). */
export function ultimosPorModelo(conteos: ConteoHistorial[]): Record<string, number> {
  const map: Record<string, number> = {}
  conteos.forEach((c) => {
    const rr = (c.resumen || {}) as { modo?: string; modelo?: string }
    if (rr.modo !== 'local-bdi') return
    const ms = c.fecha_aplicado ? new Date(c.fecha_aplicado).getTime() : 0
    if (!ms) return
    const modelo = String(rr.modelo || '').trim()
    if (modelo) map[modelo] = Math.max(map[modelo] || 0, ms)
  })
  return map
}

/** Limpia el estado de un modelo (tras cerrarlo). */
export function limpiarModelo(state: FundasState, g: ModeloGrupo): FundasState {
  const next = { ...state }
  g.variants.forEach((v) => { delete next[v.vid] })
  return next
}
