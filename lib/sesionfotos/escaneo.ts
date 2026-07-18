/**
 * Verificación por escaneo: preparado (fase retiro) y devolución. Port de
 * `_sfNormBc`/`sfBcVid` (index.html:9998-10007), `sfScan` (10014), `sfManualAjustar`
 * (10040) y `sfScanCombi` (10328), sin DOM ni globales.
 *
 * Todo opera sobre una copia de la solicitud (o de las combinadas) y devuelve una
 * copia nueva + un `resultado` para el feedback en pantalla. La transición de
 * estado es la misma del legacy: al completar la fase, `preparada` (o `devuelta`);
 * nunca revierte una `devuelta`, y un decremento no baja el estado.
 */

import { faseCompleta } from './core'
import type { Fase, ItemSolicitud, Origen, Solicitud } from './tipos'

/** Igual que `_sfNormBc`: normaliza un código de barras (trim + mayúsculas). */
export function normBc(code: unknown): string {
  return String(code || '').trim().toUpperCase()
}

/** Una variante con lo que hace falta para el mapa de códigos (vid + barcode). */
export type VarianteBc = { id: string; barcode?: string | null }

/**
 * Mapa código-de-barras → vid, con la entrada normalizada y otra sin ceros a la
 * izquierda (el escáner a veces come el 0 inicial). Port de la construcción de
 * `window._sfBc` en sfBcVid.
 */
export function construirMapaBc(variantes: VarianteBc[]): Record<string, string> {
  const m: Record<string, string> = {}
  ;(variantes || []).forEach((v) => {
    if (!v.barcode) return
    const b = normBc(v.barcode)
    m[b] = v.id
    const b2 = b.replace(/^0+/, '')
    if (b2 && b2 !== b) m[b2] = v.id
  })
  return m
}

/** vid de un código escaneado, probando con y sin ceros a la izquierda. */
export function vidDeBarcode(code: string, mapa: Record<string, string>): string | null {
  const c = normBc(code)
  if (!c) return null
  return mapa[c] || mapa[c.replace(/^0+/, '')] || null
}

/**
 * Resuelve el ítem que matchea un código dentro de un array: por vid (del mapa de
 * barcode), luego por SKU, y opcionalmente por el código de barras del propio ítem
 * (para los "nuevos" sin cargar; sfScan lo usa, sfScanCombi no).
 */
export function resolverItem(
  arr: ItemSolicitud[],
  code: string,
  mapa: Record<string, string>,
  conBarcode: boolean,
): ItemSolicitud | null {
  const vid = vidDeBarcode(code, mapa)
  let it = vid ? arr.find((i) => i.vid === vid) : null
  if (!it && code) it = arr.find((i) => String(i.sku).toLowerCase() === code.toLowerCase())
  if (!it && code && conBarcode) it = arr.find((i) => !!i.barcode && normBc(i.barcode) === normBc(code))
  return it ?? null
}

/** Aplica al estado la transición de fase completa (nunca revierte una devuelta). */
export function transicionEstado(sol: Solicitud, fase: Fase): Solicitud {
  if (!faseCompleta(sol, fase)) return sol
  if (fase === 'devolucion') return { ...sol, estado: 'devuelta' }
  return sol.estado !== 'devuelta' ? { ...sol, estado: 'preparada' } : sol
}

export type ResultadoEscaneo =
  | { tipo: 'no-encontrado'; code: string }
  | { tipo: 'ya-completo'; nombre: string; variante: string; qty: number }
  | { tipo: 'ok'; nombre: string; variante: string; done: number; qty: number }

/**
 * Un escaneo sobre UNA solicitud, en un origen y fase. Devuelve la solicitud
 * (mutada si sumó) y el resultado para el feedback. Port de sfScan.
 */
export function escanearSol(
  sol: Solicitud,
  origen: Origen,
  fase: Fase,
  code: string,
  mapa: Record<string, string>,
): { sol: Solicitud; resultado: ResultadoEscaneo } {
  const mapKey = fase === 'devolucion' ? 'devuelto' : 'verif'
  const arr = (sol.items || []).filter((i) => i.origen === origen)
  const it = resolverItem(arr, code, mapa, true)
  if (!it) return { sol, resultado: { tipo: 'no-encontrado', code } }
  const done = (sol[mapKey] || {})[it.vid] || 0
  if (done >= it.qty) {
    return { sol, resultado: { tipo: 'ya-completo', nombre: it.nombre, variante: it.variante, qty: it.qty } }
  }
  const conteo = { ...(sol[mapKey] || {}), [it.vid]: done + 1 }
  const ns = transicionEstado({ ...sol, [mapKey]: conteo }, fase)
  return { sol: ns, resultado: { tipo: 'ok', nombre: it.nombre, variante: it.variante, done: done + 1, qty: it.qty } }
}

/** Ajuste a mano (+/−) de un ítem manual, clampeado a [0, qty]. Port de sfManualAjustar. */
export function ajustarManualSol(sol: Solicitud, fase: Fase, vid: string, delta: number): Solicitud {
  const it = (sol.items || []).find((i) => i.vid === vid)
  if (!it) return sol
  const mapKey = fase === 'devolucion' ? 'devuelto' : 'verif'
  const actual = (sol[mapKey] || {})[vid] || 0
  const nuevo = Math.max(0, Math.min(it.qty, actual + delta))
  const conteo = { ...(sol[mapKey] || {}), [vid]: nuevo }
  return transicionEstado({ ...sol, [mapKey]: conteo }, fase)
}

export type ResultadoCombi =
  | { tipo: 'no-encontrado'; code: string }
  | { tipo: 'ya-completo'; nombre: string; variante: string }
  | { tipo: 'ok'; nombre: string; variante: string; done: number; qty: number; targetId: string }

/**
 * Un escaneo sobre VARIAS solicitudes combinadas: cae en la primera solicitud que
 * tenga lugar para ese ítem. Devuelve las solicitudes (con la target mutada) y el
 * resultado. Port de sfScanCombi (sin el fallback por barcode, igual que el legacy).
 */
export function escanearCombi(
  sols: Solicitud[],
  origen: Origen,
  fase: Fase,
  code: string,
  mapa: Record<string, string>,
): { sols: Solicitud[]; resultado: ResultadoCombi } {
  const mapKey = fase === 'devolucion' ? 'devuelto' : 'verif'
  let target: Solicitud | null = null
  let item: ItemSolicitud | null = null
  for (const s of sols) {
    const arr = (s.items || []).filter((i) => i.origen === origen)
    const it = resolverItem(arr, code, mapa, false)
    if (!it) continue
    if (!item) item = it // existe en alguna (aunque esté completa)
    const done = (s[mapKey] || {})[it.vid] || 0
    if (done < it.qty) {
      target = s
      item = it
      break
    }
  }
  if (!item) return { sols, resultado: { tipo: 'no-encontrado', code } }
  if (!target) return { sols, resultado: { tipo: 'ya-completo', nombre: item.nombre, variante: item.variante } }
  const done = (target[mapKey] || {})[item.vid] || 0
  const conteo = { ...(target[mapKey] || {}), [item.vid]: done + 1 }
  const ns = transicionEstado({ ...target, [mapKey]: conteo }, fase)
  const nsols = sols.map((s) => (s.id === ns.id ? ns : s))
  return {
    sols: nsols,
    resultado: { tipo: 'ok', nombre: item.nombre, variante: item.variante, done: done + 1, qty: item.qty, targetId: ns.id },
  }
}
