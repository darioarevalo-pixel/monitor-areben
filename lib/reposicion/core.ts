/**
 * Lógica pura del reporte de Reposición: mínimo/objetivo/sugerido por variante y el
 * filtro del reporte. Port de repoMinKey/repoMin/repoObjetivo/repoSugerido/
 * repoMoverFinal/repoReporte/_repoAplicarCats/_repoUbicCmp (index.html:11257-12586),
 * sin DOM. Read-only (no ajusta stock); la salida es el reporte + PDF.
 *
 * El "hoy"/estado de sesión (mover manual) viaja por parámetro. `esBdi` decide la
 * reserva de depósito general (en BDI con reservaTodos aplica a todos, no solo fundas).
 */

import type { RepoCfg, RepoItem } from './tipos'

/** Clave del mínimo: subcat real → si no, modelo (fundas) → si no, categoría. Port de repoMinKey. */
export function minKey(it: RepoItem): string {
  return it.subcat || it.modelo || it.cat || '(sin categoría)'
}

/** Mínimo en Local de una variante (por su clave). Port de repoMin. */
export function minimo(it: RepoItem, cfg: RepoCfg): number {
  return cfg.mins[minKey(it)] ?? cfg.defaultMin ?? 4
}

/** Objetivo en Local = mínimo, topeado por el "tope por producto" si es menor. Port de repoObjetivo. */
export function objetivo(it: RepoItem, cfg: RepoCfg): number {
  const obj = minimo(it, cfg)
  const t = cfg.topes[String(it.pid)]
  return t != null && t < obj ? t : obj
}

/** Sugerido a mover: lo justo para llegar al objetivo sin vaciar la reserva de depósito. Port de repoSugerido. */
export function sugerido(it: RepoItem, cfg: RepoCfg, esBdi: boolean): number {
  const obj = objetivo(it, cfg)
  if (it.local >= obj) return 0
  const aplicaReserva = !!it.modelo || (cfg.reservaTodos && esBdi)
  const reserva = aplicaReserva ? (cfg.reservaDeposito ?? 1) : 0
  return Math.max(0, Math.min(obj - it.local, it.deposito - reserva))
}

/** Cantidad final a mover: la editada a mano (por sesión) o el sugerido. Port de repoMoverFinal. */
export function moverFinal(it: RepoItem, cfg: RepoCfg, esBdi: boolean, manual: Record<string, number>): number {
  const v = manual[it.vid]
  return v === undefined ? sugerido(it, cfg, esBdi) : v
}

/** El reporte: variantes no apagadas, por debajo del objetivo, con algo para mover. Port de repoReporte. */
export function reporte(inv: RepoItem[], cfg: RepoCfg, esBdi: boolean): RepoItem[] {
  const ap = new Set(cfg.apagados.map(String))
  return inv.filter((it) => !ap.has(it.pid) && it.local < objetivo(it, cfg) && sugerido(it, cfg, esBdi) > 0)
}

/**
 * Aplica las categorías ignoradas: la subcategoría es la primera candidata NO ignorada;
 * la categoría efectiva es esa subcat o el respaldo. Port de _repoAplicarCats. Devuelve
 * una copia nueva (para React).
 */
export function aplicarCats(inv: RepoItem[], catsOff: string[]): RepoItem[] {
  const off = new Set((catsOff || []).map((s) => String(s).toLowerCase()))
  return inv.map((it) => {
    let sc: string | null = null
    for (const c of it.cats || []) {
      if (!off.has(c.toLowerCase())) {
        sc = c
        break
      }
    }
    return { ...it, subcat: sc, cat: sc || it.catFallback || '(sin categoría)' }
  })
}

/** Todas las categorías candidatas (para el panel de "ignorar"). Port de repoCatsDisponibles. */
export function catsDisponibles(inv: RepoItem[]): string[] {
  const set = new Map<string, string>()
  inv.forEach((it) => (it.cats || []).forEach((c) => { const l = c.toLowerCase(); if (!set.has(l)) set.set(l, c) }))
  return [...set.values()].sort((a, b) => a.localeCompare(b, 'es'))
}

/** Clave de orden por ubicación física ("NN-N"). Sin ubicación → al final. Port de _repoUbicKey. */
export function ubicKey(s: string | null | undefined): [number, number, string] {
  const str = String(s == null ? '' : s).trim()
  if (!str) return [Infinity, Infinity, '']
  const m = str.match(/^(\d+)\s*[-\s]?\s*(\d+)?\s*(.*)$/)
  if (m) return [parseInt(m[1], 10), m[2] ? parseInt(m[2], 10) : 0, (m[3] || '').toLowerCase()]
  return [Number.MAX_SAFE_INTEGER, 0, str.toLowerCase()]
}
export function ubicCmp(ua: string, ub: string): number {
  const a = ubicKey(ua)
  const b = ubicKey(ub)
  return a[0] - b[0] || a[1] - b[1] || a[2].localeCompare(b[2], 'es')
}
