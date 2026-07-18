/**
 * Lógica pura de inventario-vivo: resolución de duplicados/fantasmas. Port de
 * `_cdepPickReal`/`_cdepRealMap` (index.html:11620-11631), sin DOM ni globales.
 *
 * GN a veces devuelve VARIAS filas para la misma variante (mismo product_id+size_id):
 * la original (con stock) y una "fantasma" nueva en 0. Hay que quedarse con la real.
 */

import type { FilaVivo } from './tipos'

/**
 * Elige la fila REAL entre duplicados: la que tiene stock>0; en empate, la de
 * `inventory_id` más bajo (la original; la fantasma es la nueva en 0). Port de
 * _cdepPickReal.
 */
export function pickReal(list: FilaVivo[]): FilaVivo {
  if (list.length === 1) return list[0]
  const conStock = list.filter((r) => Number(r.available_quantity) > 0)
  const pool = conStock.length ? conStock : list
  return pool.slice().sort((a, b) => Number(a.inventory_id) - Number(b.inventory_id))[0]
}

/** vid (`product_id_size_id`) → fila real. Port de _cdepRealMap. */
export function realMap(rows: FilaVivo[]): Record<string, FilaVivo> {
  const g: Record<string, FilaVivo[]> = {}
  rows.forEach((r) => {
    const vid = r.product_id + '_' + r.size_id
    ;(g[vid] = g[vid] || []).push(r)
  })
  const m: Record<string, FilaVivo> = {}
  Object.entries(g).forEach(([vid, list]) => {
    m[vid] = pickReal(list)
  })
  return m
}
