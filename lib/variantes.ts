/**
 * "Por variante" (key `variantes`): tabla read-only por talle/color. Port de
 * renderVariantes (index.html:2967) + filtrarLista (2666). Mucho más simple que
 * `productos`: sólo buscar (nombre O variante) + estado; sin fotos, sin detalle, sin
 * sale, sin selector de vida útil (usa el `lifespan` de 30d ya precomputado por el
 * ETL). El orden y la paginación salen de `lib/tabla.ts`; el color de stock y el
 * texto de vida útil se comparten con `productos`/`lib/etl/helpers`.
 */

import type { Variante } from './etl/tipos'

export type FiltrosVariantes = {
  /** Texto de búsqueda: matchea contra nombre O variante (size). */
  busqueda: string
  /** Estado (phase.label) o '' = todos. */
  estado: string
}

/**
 * Filtra por búsqueda (nombre O size) y estado. Port de filtrarLista aplicado a
 * variantes (index.html:2666, 2969): la búsqueda mira `name` y `size`, a diferencia
 * de productos que sólo mira `name`.
 */
export function filtrarVariantes(variantes: Variante[], f: FiltrosVariantes): Variante[] {
  const q = f.busqueda.trim().toLowerCase()
  return variantes.filter((v) => {
    if (q && !(v.name || '').toLowerCase().includes(q) && !(v.size || '').toLowerCase().includes(q)) return false
    if (f.estado && v.phase.label !== f.estado) return false
    return true
  })
}
