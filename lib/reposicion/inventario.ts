/**
 * Construcción de `repoInv` (variantes agregadas) desde el inventario crudo del
 * Local+Depósito, cruzando con los productos activos y las categorías de TN. Port de
 * repoCargarInventario (index.html:12520-12545), sin DOM. `aplicarCats` (lib/core) se
 * corre aparte con `catsOff`.
 */

import { matchTn, type IndiceTn } from '../tn'
import { CATS_GENERICAS, esFundaCat, esModeloCat, esPromo, modeloDe } from './grupos'
import type { RepoItem } from './tipos'

/** Fila cruda del inventario (Local + Depósito; `observation` solo en BDI). */
export type FilaInvRepo = {
  product_id: number | string
  product_name?: string
  size_id: number | string
  size_name?: string
  sku?: string
  available_quantity?: number
  store_name?: string
  observation?: string
}

export type ProductoGN = { id: string | number; category?: string | null; sku?: string | null; name?: string | null }

export function construirInv(inventario: FilaInvRepo[], prodById: Record<string, ProductoGN>, tnIdx: IndiceTn, s7: Record<string, number>): RepoItem[] {
  const map: Record<string, RepoItem> = {}
  ;(inventario || []).forEach((r) => {
    const pid = String(r.product_id)
    const sid = String(r.size_id)
    const vid = pid + '_' + sid
    const p = prodById[pid]
    if (!p) return
    if (!map[vid]) {
      const tn = matchTn(p, tnIdx)
      const cats: string[] = []
      const pushCand = (c: string) => {
        const t = String(c || '').trim()
        if (!t) return
        const l = t.toLowerCase()
        if (CATS_GENERICAS.has(l) || esPromo(t) || esModeloCat(t) || esFundaCat(t)) return
        if (!cats.some((x) => x.toLowerCase() === l)) cats.push(t)
      }
      String(p.category || '').split(',').forEach(pushCand)
      if (tn && Array.isArray(tn.categories)) tn.categories.forEach(pushCand)
      map[vid] = {
        vid, pid, sid,
        name: r.product_name || '—',
        size: r.size_name || '',
        sku: r.sku || '',
        local: 0,
        deposito: 0,
        cats,
        catFallback: p.category || '(sin categoría)',
        cat: '(sin categoría)',
        subcat: null,
        modelo: modeloDe(r.size_name || ''),
        s7: s7[vid] || 0,
        ubic: r.observation || '',
      }
    }
    if (r.observation && !map[vid].ubic) map[vid].ubic = r.observation
    const q = r.available_quantity || 0
    const sn = String(r.store_name || '').toLowerCase().trim()
    if (sn === 'local') map[vid].local += q
    else if (sn.includes('mayorista')) {
      /* Depósito Mayorista: no se repone desde ahí → se ignora */
    } else map[vid].deposito += q
  })
  return Object.values(map)
}
