/**
 * "Por variante" (key `variantes`): tabla read-only por talle/color. Port de
 * renderVariantes (index.html:2967) + filtrarLista (2666). Mucho más simple que
 * `productos`: sólo buscar (nombre O variante) + estado; sin fotos, sin detalle, sin
 * sale, sin selector de vida útil (usa el `lifespan` de 30d ya precomputado por el
 * ETL). El orden y la paginación salen de `lib/tabla.ts`; el color de stock y el
 * texto de vida útil se comparten con `productos`/`lib/etl/helpers`.
 */

import type { Variante } from './etl/tipos'
import { matcheaTexto } from './tabla'

export type FiltrosVariantes = {
  /** Texto de búsqueda: matchea contra nombre, variante (size), SKU o código de barras. */
  busqueda: string
  /** Estado (phase.label) o '' = todos. */
  estado: string
}

/**
 * Filtra por búsqueda y estado. Port de filtrarLista aplicado a variantes
 * (index.html:2666, 2969), que miraba `name` y `size`.
 *
 * 🔑 **Suma el SKU y el código de barras**, que es la variante —y no el producto— la que los tiene
 * por separado: es la única tabla donde se puede llegar a la fila exacta con el código que sale del
 * lector. Misma regla que `filtrarProductos`.
 */
export function filtrarVariantes(variantes: Variante[], f: FiltrosVariantes): Variante[] {
  const q = f.busqueda.trim().toLowerCase()
  return variantes.filter((v) => {
    if (!matcheaTexto(q, [v.name, v.size, v.sku, v.barcode])) return false
    if (f.estado && v.phase.label !== f.estado) return false
    return true
  })
}
